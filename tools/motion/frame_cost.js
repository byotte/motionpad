#!/usr/bin/env node
// 2-0 계측: 감상(플레이) 화면에서 한 프레임에 시간이 어디에 쓰이는지. 코드 변경 없음.
//
//   node tools/motion/frame_cost.js [대상.html]          (기본 motionpad.html, 약 15분)
//   node tools/motion/frame_cost.js [대상.html] --blink  눈 깜빡임만: 폰 화면, 깜빡임이 두 번 이상 들어가게 길게 잰다
//   주의: 앱 시간은 프레임당 최대 0.035초만 흐른다(dt 상한). FPS가 낮으면 깜빡임 주기(4.5초)가 실제로 더 길어진다.
//   → 표준출력 표 + tools/motion/out/frame-cost.json
//
// 장면: 그림만 / 영역 4개 자동 움직임 / + 외곽까지 흔들기(꼬리) / + 눈 깜빡임 2개 / + 몸체(배경 분리) / 마지막 장면에서 터치 드래그
// 그림: 테스트 그림 800×1000, 같은 그림을 앱 최대 크기(긴 변 1900)로 키운 것
// 화면: PC 1440×900(배율 1), 폰 390×844(배율 3 → 앱은 2까지 씀). CPU 1배와 4배 느리게(폰 흉내).
// 화질은 '고화질'로 고정(자동이면 느릴 때 스스로 낮춰 비교가 흔들린다).
// 주의: 헤드리스 Chromium의 그래픽은 소프트웨어(SwiftShader)라 '그래픽 처리' 몫은 실기기와 다르다.
//       JS 몫(물리·마스크·깜빡임 합성)은 실기기 경향과 같다. 같은 기계 전후 비교용.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');
const ARGS = process.argv.slice(2), BLINK = ARGS.includes('--blink');
const TARGET = path.resolve(ARGS.find(a => !a.startsWith('--')) || path.join(ROOT, 'motionpad.html'));
const FIX = path.join(ROOT, 'tools/baseline/fixtures/character.png');
const KEY = ['tick', 'step', 'updateMasks', 'render', 'updateBlinkScene', 'paintBlinkPatch', 'uploadBlinkTexture', 'drawOverlay', 'updateTailCutout', 'buildBackgroundPlate', 'getTailSource'];
fs.mkdirSync(OUT, { recursive: true });

const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
function summarize(profile) {
  const byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const incl = Object.fromEntries(KEY.map(k => [k, 0])); let total = 0, idle = 0, gc = 0;
  profile.samples.forEach((id, i) => {
    const us = profile.timeDeltas[i] || 0, name = byId.get(id).callFrame.functionName; total += us;
    if (name === '(idle)') idle += us; if (name === '(garbage collector)') gc += us;
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) { const f = byId.get(cur).callFrame.functionName; if (f in incl && !seen.has(f)) { seen.add(f); incl[f] += us; } }
  });
  return { totalMs: total / 1000, idleMs: idle / 1000, gcMs: gc / 1000, incl: Object.fromEntries(Object.entries(incl).map(([k, v]) => [k, v / 1000])) };
}
// 프레임 간격 측정(5초 이상: 눈 깜빡임 주기 4.5초가 반드시 들어간다) + 같은 동안 CPU 프로파일
async function measure(page, during, windowMs = 5000) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await page.evaluate(w => { window.__frames = []; window.__stop = false; let last = performance.now(); const t0 = last;
    const f = now => { window.__frames.push(now - last); last = now; if (!(window.__stop && now - t0 >= w)) requestAnimationFrame(f); else window.__done = true; };
    window.__done = false; requestAnimationFrame(f); }, windowMs);
  if (during) await during();
  await page.evaluate(() => { window.__stop = true; });
  await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
  const t = (await page.evaluate(() => window.__frames)).slice(1);
  const { profile } = await cdp.send('Profiler.stop'); await cdp.detach();
  const s = t.slice().sort((a, b) => a - b), n = t.length, prof = summarize(profile), med = s[n >> 1], slow = t.filter(v => v > med * 1.8);
  const per = v => +(v / n).toFixed(1);
  return { frames: n, fps: +(1000 / (t.reduce((a, b) => a + b, 0) / n)).toFixed(1), avgMs: +(t.reduce((a, b) => a + b, 0) / n).toFixed(1), p95Ms: +s[Math.floor(n * .95)].toFixed(1), maxMs: +s[n - 1].toFixed(1),
    hitches: slow.length, hitchAvgMs: slow.length ? +(slow.reduce((a, b) => a + b, 0) / slow.length).toFixed(0) : 0, medianMs: +med.toFixed(1), jsPerFrame: per(prof.totalMs - prof.idleMs), gcPerFrame: per(prof.gcMs),
    perFrame: Object.fromEntries(Object.entries(prof.incl).map(([k, v]) => [k, per(v)])), totalMs: Object.fromEntries(Object.entries(prof.incl).map(([k, v]) => [k, +v.toFixed(0)])) };
}

(async () => {
  const browser = await chromium.launch();
  // ── 1. 기본 프로젝트 만들기(실제 사용자 경로) ──
  const base = path.join(OUT, 'base.motionpad.json');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
    await page.goto('file://' + TARGET);
    await page.setInputFiles('#imageFile', FIX); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
    const box = await page.locator('#view').boundingBox(), P = (x, y) => [box.x + box.width * x, box.y + box.height * y];
    const newZone = () => page.evaluate(() => { const t = document.querySelector('.mode.active'); document.getElementById('newRegionBtn').click(); t?.click(); });
    await page.locator('#ellipseMode').click();
    await page.mouse.move(...P(.36, .25)); await page.mouse.down(); await page.mouse.move(...P(.64, .52), { steps: 8 }); await page.mouse.up(); await rafs(page, 2);
    await page.locator('#wandMode').click();
    for (const pt of [[.42, .75], [.5, .2]]) {
      await newZone(); await page.mouse.click(...P(...pt));
      await page.waitForFunction(() => !document.getElementById('wandApply').disabled, null, { timeout: 60000 });
      await page.locator('#wandApply').click(); await rafs(page, 2);
    }
    await page.locator('#lassoMode').click(); await newZone();
    const enc = page.locator('#encloseInput'); if (await enc.count() && !(await enc.isChecked())) await enc.check({ force: true });
    const pts = [[.64, .40], [.92, .40], [.92, .76], [.64, .76], [.64, .41]];
    await page.mouse.move(...P(...pts[0])); await page.mouse.down(); for (const q of pts.slice(1)) await page.mouse.move(...P(...q), { steps: 8 }); await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('outlineApply').disabled, null, { timeout: 90000 });
    await page.locator('#outlineApply').click(); await rafs(page, 2);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    await dl.saveAs(base); await ctx.close();
  }
  const proj = JSON.parse(fs.readFileSync(base, 'utf8'));
  const big = path.join(OUT, 'character-1900.png');
  execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert("RGB").resize((1520,1900),Image.LANCZOS).save(sys.argv[2])', FIX, big]);
  const bigURL = 'data:image/png;base64,' + fs.readFileSync(big).toString('base64');
  // 움직임 설정(앱의 프리셋 값): 얼굴 호흡, 옷 부드러운 반응, 머리 바람, 꼬리 꼬리 흔들림
  const presets = [
    { preset: 'breathing', strength: 12, spring: 8, damping: 88, breath: 18, breathSpeed: .85, feather: 23, spread: 10 },
    { preset: 'soft', strength: 15, spring: 11, damping: 74, ripple: 5, feather: 19 },
    { preset: 'wind', strength: 21, spring: 10, damping: 76, windStrength: 52, windSpeed: 1.3, windNoise: 45, windDelay: 75, pivotEnabled: true },
    { preset: 'tail', strength: 24, spring: 9, damping: 68, windStrength: 38, windSpeed: 1.1, windDelay: 65, pivotEnabled: true },
  ];
  const eyes = [[.4025, .395, .4725, .395, .4375, .368, .4375, .425], [.5275, .395, .5975, .395, .5625, .368, .5625, .425]]
    .map(a => ({ points: [0, 2, 4, 6].map(i => ({ x: a[i], y: a[i + 1] })), protection: [], cover: 24, curve: 0 }));
  const variant = (level, image) => {
    const p = JSON.parse(JSON.stringify(proj)), extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : p.extra;
    extra.qualityMode = 'high';
    p.zones = level <= 0 ? [] : p.zones.map((z, i) => ({ ...z, ...presets[i], auto: true, tailCutout: level >= 2 && i === 3, isBase: level >= 4 && i === 1 }));
    if (level >= 3 || level === -3) extra.blink = { eyes, speed: 100 };
    p.extra = typeof proj.extra === 'string' ? JSON.stringify(extra) : extra;
    if (image === 'big') p.image = bigURL;
    const f = path.join(OUT, `v${level}-${image}.motionpad.json`); fs.writeFileSync(f, JSON.stringify(p)); return f;
  };
  const LEVELS = ['그림만', '영역4 자동', '+외곽흔들기', '+눈깜빡임', '+몸체'];
  const VPS = { pc: { viewport: { width: 1440, height: 900 } }, phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } };

  // ── 2. 장면별 계측 ──
  const results = [];
  if (BLINK) {
    // 영역 없이 깜빡임만 / 영역4+깜빡임. 창은 FPS에 맞춰 깜빡임 2번 이상(앱 시간 9초 이상)
    for (const image of ['800', 'big']) for (const throttle of [1, 4]) for (const level of [-3, 3]) {
      const ctx = await browser.newContext({ ...VPS.phone, acceptDownloads: true }), page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto('file://' + TARGET);
      await page.setInputFiles('#backupFile', variant(level, image)); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 5);
      await page.locator('#viewerBtn').click(); await rafs(page, 10);
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); await rafs(page, 5);
      const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 1500 ? requestAnimationFrame(f) : r(n / 1.5); }; requestAnimationFrame(f); }));
      const windowMs = Math.min(60000, Math.max(5000, 9 / Math.min(1, fps * .035) * 1000));
      const r = { image, vp: 'phone', throttle, level: level < 0 ? '깜빡임만' : '영역4+깜빡임', windowMs: Math.round(windowMs), ...(await measure(page, null, windowMs)), errs };
      results.push(r); console.log(JSON.stringify(r));
      await cdp.detach(); await ctx.close();
    }
    fs.writeFileSync(path.join(OUT, 'frame-cost-blink.json'), JSON.stringify(results, null, 1));
    await browser.close();
    console.log('\n그림 CPU | 장면 | 창(초) | FPS 중앙ms | 끊김 프레임 수·평균ms·최대ms | 합계ms: 깜빡임합성 업로드');
    for (const r of results) console.log(`${r.image} x${r.throttle} | ${r.level} | ${(r.windowMs / 1000).toFixed(0)} | ${r.fps} ${r.medianMs} | ${r.hitches} ${r.hitchAvgMs} ${r.maxMs} | ${r.totalMs.updateBlinkScene} ${r.totalMs.uploadBlinkTexture}`);
    return;
  }
  for (const image of ['800', 'big']) for (const vp of ['pc', 'phone']) for (const throttle of [1, 4]) {
    if (vp === 'pc' && throttle === 4) continue;          // PC는 1배, 폰은 1배·4배
    for (let level = 0; level < LEVELS.length; level++) {
      const ctx = await browser.newContext({ ...VPS[vp], acceptDownloads: true }), page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto('file://' + TARGET);
      await page.setInputFiles('#backupFile', variant(level, image)); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 5);
      await page.locator('#viewerBtn').click(); await rafs(page, 10);
      const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await rafs(page, 5);
      const canvas = await page.evaluate(() => { const c = document.getElementById('view'); return [c.width, c.height]; });
      const r = { image, vp, throttle, level: LEVELS[level], canvas, ...(await measure(page)), errs };
      results.push(r); console.log(JSON.stringify(r));
      if (level === LEVELS.length - 1) {
        // 터치: 옷을 3초 동안 좌우로 끌기
        const b = await page.locator('#view').boundingBox();
        const during = async () => {
          const x0 = b.x + b.width * .45, y0 = b.y + b.height * .72;
          await page.mouse.move(x0, y0); await page.mouse.down();
          for (let k = 0; k < 14; k++) await page.mouse.move(x0 + (k % 2 ? -40 : 40), y0 + (k % 3) * 10, { steps: 8 });
          await page.mouse.up();
        };
        const t = { image, vp, throttle, level: '+터치 드래그', canvas, ...(await measure(page, during)), errs };
        results.push(t); console.log(JSON.stringify(t));
      }
      await cdp.detach(); await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'frame-cost.json'), JSON.stringify(results, null, 1));
  await browser.close();

  // ── 3. 표 ──
  const cols = ['fps', 'avgMs', 'p95Ms', 'jsPerFrame'], parts = ['step', 'updateMasks', 'updateBlinkScene', 'render', 'drawOverlay', 'gcPerFrame'];
  console.log('\n그림 화면 CPU | 장면 | 캔버스 | FPS 평균ms p95ms 최대ms 끊김수 | 5초 합계ms: 물리 마스크 깜빡임합성 깜빡임업로드 render(전체)');
  for (const r of results) console.log(`${r.image} ${r.vp} x${r.throttle} | ${r.level.padEnd(10)} | ${r.canvas.join('×')} | ${[...cols.slice(0, 3), 'maxMs', 'hitches'].map(c => r[c]).join(' ')} | ${['step', 'updateMasks', 'updateBlinkScene', 'uploadBlinkTexture', 'render'].map(p => r.totalMs[p]).join(' ')}${r.errs.length ? ' 오류' + r.errs.length : ''}`);
})();
