// MotionPad 기준선 계측기 (개발용, 배포본에 포함하지 않음)
// 사용: node tools/baseline/run.js <대상 html> <결과 폴더 이름>
//   예) node tools/baseline/run.js legacy-0.5rc23.html legacy
// 결과: tools/baseline/out/<이름>/ 에 스크린샷, 저장 파일, results.json
// 실제 사용자 경로(파일 입력·클릭·드래그)로만 조작한다. 앱 내부 코드를 건드리지 않는다.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || 'legacy-0.5rc23.html');
const label = process.argv[3] || 'run';
const OUT = path.join(__dirname, 'out', label);
const FIXTURE = path.join(__dirname, 'fixtures', 'character.png');
const URL = 'file://' + target;
const REPEAT = 3;

const VIEWPORTS = {
  pc: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  'phone-land': { width: 844, height: 390, isMobile: true, hasTouch: true },
  'fold-cover': { width: 344, height: 882, isMobile: true, hasTouch: true },
  'fold-open': { width: 884, height: 1000, isMobile: true, hasTouch: true },
};
const THEMES = ['violet', 'light', 'basic'];
// 레이아웃 치수 기록 대상 [x, y, 너비, 높이]
const LAYOUT_PARTS = ['.header', '.stagebar', '.stageOptions', '.stage', '#view', '.stagebottom', '.side', '.maskDisplay'];
// 시간 계측 대상 함수 (호출 아래 시간까지 포함한 누적 시간)
const KEY_FUNCS = ['updateMasks', 'updateBaseTextures', 'updateTailCutout', 'buildBackgroundPlate', 'createMask', 'dilateMask', 'rawMaskCanvas', 'render', 'drawOverlay', 'maskPreview', 'updateBlinkScene', 'tick', 'setMode'];

// CPU 프로파일 → 함수별 자체 시간 상위 + 핵심 함수 누적 시간(ms)
function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const self = {}, incl = Object.fromEntries(KEY_FUNCS.map(k => [k, 0]));
  let total = 0;
  profile.samples.forEach((id, i) => {
    const us = profile.timeDeltas[i] || 0; total += us;
    const name = byId.get(id).callFrame.functionName || '(anon)';
    self[name] = (self[name] || 0) + us;
    const seen = new Set();
    for (let cur = id; cur != null; cur = parent.get(cur)) {
      const f = byId.get(cur).callFrame.functionName;
      if (f in incl && !seen.has(f)) { seen.add(f); incl[f] += us; }
    }
  });
  const ms = v => Math.round(v / 10) / 100;
  return { totalMs: ms(total), inclusiveMs: Object.fromEntries(Object.entries(incl).map(([k, v]) => [k, ms(v)])),
    selfTop: Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, ms(v)]) };
}
async function profileDuring(page, fn) {
  const client = await page.context().newCDPSession(page);
  await client.send('Profiler.enable'); await client.send('Profiler.setSamplingInterval', { interval: 200 }); await client.send('Profiler.start');
  const value = await fn();
  const { profile } = await client.send('Profiler.stop');
  await client.detach();
  return { value, profile: summarizeProfile(profile) };
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const results = { target: path.basename(target), when: new Date().toISOString(), errors: [], notes: [] };
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const round = v => Math.round(v * 100) / 100;

// frozen=true 이면 시계를 고정해 애니메이션을 멈춘다(스크린샷 비교용). 진행은 settle()로만.
async function newPage(browser, vp, theme, frozen = false) {
  const { width, height, ...rest } = vp;
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true, ...rest });
  if (frozen) {
    // install만 하면 시간이 실제처럼 흘러 위상이 흔들린다 → pauseAt으로 완전히 멈추고 settle()로만 진행
    await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await context.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    // 난수 고정 (mulberry32)
    await context.addInitScript(() => { let a = 12345; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
  }
  if (theme) await context.addInitScript(t => { try { localStorage.setItem('motionpad-theme', t); } catch (_) {} }, theme);
  const page = await context.newPage();
  page.on('pageerror', e => results.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') results.errors.push('console: ' + m.text()); });
  page.on('dialog', d => { results.notes.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto(URL);
  await page.waitForLoadState('load');
  return { context, page };
}

async function openImage(page, frozen = false) {
  const t0 = Date.now();
  await page.setInputFiles('#imageFile', FIXTURE);
  await page.waitForSelector('.workspace:not([hidden])');
  if (frozen) await settle(page); else await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  return Date.now() - t0;
}
// 고정 시계에서 정확히 1초 진행 (애니메이션 위상이 매번 같아짐)
const settle = page => page.clock.runFor(1000);

// 그림 정규 좌표(0~1) → 화면 좌표
async function toScreen(page, x, y) {
  const b = await page.locator('#view').boundingBox();
  return { x: b.x + b.width * x, y: b.y + b.height * y };
}
async function drag(page, pts, steps = 6) {
  const p0 = await toScreen(page, ...pts[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (const pt of pts.slice(1)) { const p = await toScreen(page, ...pt); await page.mouse.move(p.x, p.y, { steps }); }
  await page.mouse.up();
}
async function clickMode(page, id) {
  await page.locator('#' + id).click();
}
// '선택에 더하기'를 끄면 다음 선택이 새 영역이 된다
async function newZoneNext(page) {
  await page.evaluate(() => { const e = document.getElementById('appendInput'); e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function saveProject(page, file) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
  await dl.saveAs(file);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
const rafs = (page, n) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

// RLE runs → 선택 픽셀 수 (포맷 v2: TILE*TILE 기준)
function runsArea(runs) { let n = 0; for (const r of runs || []) for (let i = 1; i < r.length; i += 2) n += r[i]; return n; }
function zoneSummary(z) {
  return { name: z.name, kind: z.kind, isBase: !!z.isBase, area: z.kind === 'raster' ? runsArea(z.runs) : null,
    x: round(z.x), y: round(z.y), rx: round(z.rx), ry: round(z.ry), feather: z.feather, spread: z.spread };
}

(async () => {
  const browser = await chromium.launch();

  // ── 1. 스크린샷: 화면 크기 × 상태, 테마 ──────────────────────────
  const shots = [];
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp, 'violet', true);
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `shot-${vpName}-welcome.png`) });
    await openImage(page, true);
    await page.screenshot({ path: path.join(OUT, `shot-${vpName}-editor.png`) });
    await page.screenshot({ path: path.join(OUT, `shot-${vpName}-editor-full.png`), fullPage: true });
    const overflow = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }));
    const layout = await page.evaluate(sels => Object.fromEntries(sels.map(q => {
      const e = document.querySelector(q); if (!e || !e.getClientRects().length) return [q, null];
      const r = e.getBoundingClientRect(); return [q, [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]];
    })), LAYOUT_PARTS);
    shots.push({ viewport: vpName, horizontalOverflow: overflow.scrollW > overflow.clientW, ...overflow, layout });
    await context.close();
  }
  for (const theme of THEMES) {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, theme, true);
    await openImage(page, true);
    await page.screenshot({ path: path.join(OUT, `theme-${theme}-pc.png`) });
    await context.close();
  }
  results.screens = shots;

  // ── 2. 선택 도구 + 저장 왕복 ───────────────────────────────────────
  {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, 'violet');
    results.openImageMs = await openImage(page);
    const sel = {};

    // 2-1 타원: 얼굴 부근 상자 드래그
    await clickMode(page, 'ellipseMode');
    await drag(page, [[0.36, 0.25], [0.64, 0.52]]);
    await rafs(page, 3);

    // 2-2 마술봉: 파란 옷 클릭 → 적용
    await clickMode(page, 'wandMode');
    await newZoneNext(page);
    let t0 = Date.now();
    const pw = await toScreen(page, 0.42, 0.75);
    await page.mouse.click(pw.x, pw.y);
    await page.waitForFunction(() => !document.getElementById('wandApply').disabled, null, { timeout: 30000 });
    sel.wandMs = Date.now() - t0;
    sel.wandTolerance = await page.inputValue('#toleranceInput');
    await page.screenshot({ path: path.join(OUT, 'select-wand-draft.png') });
    await page.locator('#wandApply').click();
    await rafs(page, 3);

    // 2-3 간략 범위지정 올가미: 꼬리를 대충 둘러쌈
    await clickMode(page, 'lassoMode');
    await newZoneNext(page);
    const enclose = page.locator('#encloseInput');
    if (await enclose.count()) { if (!(await enclose.isChecked())) await enclose.check({ force: true }); }
    t0 = Date.now();
    await drag(page, [[0.64, 0.40], [0.92, 0.40], [0.92, 0.76], [0.64, 0.76], [0.64, 0.41]], 10);
    try {
      await page.waitForFunction(() => !document.getElementById('outlineApply').disabled, null, { timeout: 30000 });
      sel.outlineMs = Date.now() - t0;
      await page.screenshot({ path: path.join(OUT, 'select-outline-draft.png') });
      await page.locator('#outlineApply').click();
    } catch (e) { sel.outlineError = String(e).split('\n')[0]; }
    await rafs(page, 3);
    await page.screenshot({ path: path.join(OUT, 'select-all-zones.png') });
    results.selection = sel;

    // 2-4 저장 → 다시 열기 → 다시 저장, 두 파일 비교
    const a = await saveProject(page, path.join(OUT, 'roundtrip-A.motionpad.json'));
    await context.close();
    const second = await newPage(browser, VIEWPORTS.pc, 'violet');
    await second.page.setInputFiles('#backupFile', path.join(OUT, 'roundtrip-A.motionpad.json'));
    await second.page.waitForSelector('.workspace:not([hidden])');
    await rafs(second.page, 5);
    await second.page.screenshot({ path: path.join(OUT, 'roundtrip-reopened.png') });
    const b = await saveProject(second.page, path.join(OUT, 'roundtrip-B.motionpad.json'));
    await second.context.close();
    const strip = d => { const c = { ...d }; delete c.savedAt; delete c.image; return JSON.stringify(c); };
    const diffs = [];
    const ka = JSON.parse(strip(a)), kb = JSON.parse(strip(b));
    (function cmp(x, y, p) {
      if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) { if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push({ path: p, A: x, B: y }); return; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) cmp(x[k], y[k], p + '.' + k);
    })(ka, kb, '');
    results.roundtrip = {
      version: a.version, editorVersion: a.editorVersion, zones: a.zones.map(zoneSummary),
      imageIdentical: a.image === b.image, imageBytes: a.image.length,
      settingsIdentical: diffs.length === 0, differences: diffs.slice(0, 30),
      fileBytes: fs.statSync(path.join(OUT, 'roundtrip-A.motionpad.json')).size,
    };
  }

  // ── 2.5 미리보기 보존: 마술봉 미리보기 중 움직임 옵션을 만지면 미리보기가 남는가 ──
  {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, 'violet');
    await openImage(page);
    await clickMode(page, 'ellipseMode'); await drag(page, [[0.36, 0.25], [0.64, 0.52]]);
    await clickMode(page, 'wandMode'); await newZoneNext(page);
    const pw = await toScreen(page, 0.42, 0.75); await page.mouse.click(pw.x, pw.y);
    await page.waitForFunction(() => !document.getElementById('wandApply').disabled, null, { timeout: 30000 });
    const state = () => page.evaluate(() => ({
      tool: [...document.querySelectorAll('.mode.active')].map(e => e.dataset.mode).join(','),
      wandDraftAlive: !document.getElementById('wandbar').hidden && !document.getElementById('wandApply').disabled,
    }));
    const before = await state();
    // 영역 1(타원)의 움직임 세기 슬라이더를 조작 — 사용자는 옵션 패널을 연 상태
    await page.evaluate(() => { for (const id of ['partsPanel', 'advanced']) { const d = document.getElementById(id); if (d) d.open = true; }
      const e = document.getElementById('strengthInput'); e.value = String(Number(e.value) + 5); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await rafs(page, 5);
    const after = await state();
    await page.screenshot({ path: path.join(OUT, 'preview-after-option.png') });
    // 미리보기 상태에서 그림 터치 → 도구 다시 누르기 → 선택 적용
    const pz = await toScreen(page, 0.5, 0.38); await page.mouse.click(pz.x, pz.y); await rafs(page, 3);
    const afterTouch = await state();
    await page.locator('#wandMode').click(); await rafs(page, 2);
    const afterTool = await state();
    let applied = false;
    if (afterTool.wandDraftAlive) { await page.locator('#wandApply').click(); await rafs(page, 2); applied = (await page.locator('#zoneCount').textContent()).trim().startsWith('2'); }
    results.previewKeep = { before, after, afterTouch, afterTool, applied,
      kept: before.wandDraftAlive && after.wandDraftAlive && before.tool === after.tool && afterTouch.wandDraftAlive && afterTool.wandDraftAlive && applied };
    await context.close();
  }

  // ── 2.6 영역 메뉴(길게 누름/우클릭)와 몸체 지정 ──
  {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, 'violet');
    const nativeDialogs = [];
    page.on('dialog', d => nativeDialogs.push(d.type()));
    await openImage(page);
    await clickMode(page, 'ellipseMode'); await drag(page, [[0.36, 0.25], [0.64, 0.52]]);
    await page.evaluate(() => { document.getElementById('partsPanel').open = true; });
    // 메뉴: 영역 칩 우클릭 → 앱 메뉴가 있으면 '복제'
    await page.locator('#zoneList .chip').first().click({ button: 'right' });
    await rafs(page, 2);
    const appMenu = await page.locator('#zoneMenuDialog[open]').count();
    if (appMenu) { await page.locator('#zoneMenuDuplicate').click(); await rafs(page, 2); }
    const zonesAfterMenu = (await page.locator('#zoneCount').textContent()).trim();
    // 몸체 지정: 첫 영역 선택 → 경계값 확인 → 몸체 지정 → 저장 파일에서 값 확인
    await page.locator('#zoneList .chip').first().click();
    await page.evaluate(() => { document.getElementById('ambientPanel').open = true; document.getElementById('basePanel').open = true; });
    const before = await page.evaluate(() => ({ feather: document.getElementById('featherInput').value, spread: document.getElementById('spreadInput').value }));
    await page.locator('#markBaseBtn').click(); await rafs(page, 2);
    const saved = await saveProject(page, path.join(OUT, 'base-check.motionpad.json'));
    const base = saved.zones.find(z => z.isBase) || {};
    results.menuAndBase = { nativeDialogs, appMenuOpened: !!appMenu, zonesAfterMenu,
      baseBefore: before, baseAfter: { feather: String(base.feather), spread: String(base.spread) },
      baseKeepsValues: String(base.feather) === before.feather && String(base.spread) === before.spread };
    await context.close();
  }

  // ── 3. 성능 ─────────────────────────────────────────────────────
  const perf = { featherDrag: [], spreadDrag: [], tailFeatherDrag: [], modeAfterSlider: [], playFps: [], editFps: [], profile: null };
  for (let rep = 0; rep < REPEAT; rep++) {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, 'violet');
    await openImage(page);
    // 영역 3개: 타원 2 + 마술봉 1
    await clickMode(page, 'ellipseMode'); await drag(page, [[0.36, 0.25], [0.64, 0.52]]);
    await clickMode(page, 'ellipseMode'); await drag(page, [[0.30, 0.58], [0.70, 0.85]]);
    await clickMode(page, 'wandMode');
    await newZoneNext(page);
    const pw = await toScreen(page, 0.5, 0.20); await page.mouse.click(pw.x, pw.y);
    await page.waitForFunction(() => !document.getElementById('wandApply').disabled, null, { timeout: 30000 });
    await page.locator('#wandApply').click();
    await rafs(page, 5);

    // 편집 화면 유휴 FPS (2초)
    const fps = () => page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
    perf.editFps.push(await fps());

    // 슬라이더 드래그 흉내: 프레임마다 값 변경 → 프레임 간격 측정
    const sliderDrag = (id, lo, hi) => page.evaluate(([id, lo, hi]) => new Promise(r => {
      const el = document.getElementById(id); const times = []; let i = 0, last = performance.now();
      const step = () => {
        const now = performance.now(); if (i > 0) times.push(now - last); last = now;
        if (i >= 60) { const s = times.slice().sort((a, b) => a - b); r({ avg: times.reduce((a, b) => a + b, 0) / times.length, p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1] }); return; }
        el.value = String(lo + (i % 2 ? hi - lo : 0) * ((i % 10) / 10) + (i * 7) % (hi - lo)); el.dispatchEvent(new Event('input', { bubbles: true })); i++;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), [id, lo, hi]);
    // 마술봉 영역(마지막)이 선택된 상태 — 세부 패널을 열어 입력을 가능하게 함
    await page.evaluate(() => { for (const id of ['partsPanel', 'effects']) { const d = document.getElementById(id); if (d) d.open = true; } });

    // (가) 일반 영역: 경계 부드러움·바깥 확장 드래그
    const drag1 = await profileDuring(page, async () => [await sliderDrag('featherInput', 0, 45), await sliderDrag('spreadInput', 0, 26)]);
    perf.featherDrag.push(drag1.value[0]); perf.spreadDrag.push(drag1.value[1]);
    // (나) '외곽까지 흔들기'를 켠 영역: 경계 부드러움 드래그 (배경 재계산 낭비 확인용)
    await page.evaluate(() => { const e = document.getElementById('tailCutoutInput'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await rafs(page, 5);
    const drag2 = await profileDuring(page, () => sliderDrag('featherInput', 0, 45));
    perf.tailFeatherDrag.push(drag2.value);
    perf.modeAfterSlider.push(await page.evaluate(() => [...document.querySelectorAll('.mode.active')].map(e => e.dataset.mode).join(',') || '(없음)'));
    if (rep === 0) perf.profile = { sliderNormal: drag1.profile, sliderTail: drag2.profile };

    // 플레이 모드 FPS (2초)
    await page.locator('#viewerBtn').click();
    await rafs(page, 10);
    const play = await profileDuring(page, fps);
    perf.playFps.push(play.value);
    if (rep === 0) perf.profile.play2s = play.profile;
    if (rep === 0) await page.screenshot({ path: path.join(OUT, 'play-pc.png') });
    await context.close();
  }
  const agg = arr => ({ avg: round(median(arr.map(x => x.avg))), p95: round(median(arr.map(x => x.p95))), max: round(median(arr.map(x => x.max))) });
  results.perf = {
    note: `헤드리스 Chromium(소프트웨어 WebGL) 기준, ${REPEAT}회 중앙값. 절대값보다 같은 기계에서의 전후 비교용.`,
    editFps: round(median(perf.editFps)), playFps: round(median(perf.playFps)),
    featherDragFrameMs: agg(perf.featherDrag), spreadDragFrameMs: agg(perf.spreadDrag), tailFeatherDragFrameMs: agg(perf.tailFeatherDrag),
    activeToolAfterSlider: perf.modeAfterSlider[0],
    profile: { note: '첫 회차 CPU 프로파일. inclusiveMs = 그 함수와 그 아래 호출까지 포함한 시간', ...perf.profile },
  };

  // 렌더러 정보
  {
    const { context, page } = await newPage(browser, VIEWPORTS.pc, 'violet');
    await openImage(page);
    results.renderer = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl'); if (!c) return 'no webgl'; const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); });
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
