#!/usr/bin/env node
// 2-M 확인: 실제 앱 화면에서 (1) 빈자리 메우기 (2) 접힘 방지 (3) 가만히 있을 때 원본과 같은지.
//   node tools/motion/quality_check.js [대상.html] [결과 폴더 이름]   → tools/motion/out/quality/<이름>/*.png + 표
// 실제 사용자 경로(그림 열기·타원 그리기·저장·열기·끌기)로 조작한다.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const TARGET = path.resolve(process.argv[2] || path.join(ROOT, 'motionpad.html'));
const OUT = path.join(__dirname, 'out/quality', process.argv[3] || 'run');
fs.mkdirSync(OUT, { recursive: true });
const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch(), errors = [];
  const open = async () => { const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
    await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' || /WebGL 실행 실패/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.goto('file://' + TARGET); return { ctx, page }; };
  // 그림을 열고 타원 영역 하나를 그린 프로젝트 파일을 만든다
  const makeProject = async (image, a, b, name) => {
    const { ctx, page } = await open();
    await page.setInputFiles('#imageFile', image); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
    const box = await page.locator('#view').boundingBox(), P = (x, y) => [box.x + box.width * x, box.y + box.height * y];
    await page.locator('#ellipseMode').click();
    await page.mouse.move(...P(...a)); await page.mouse.down(); await page.mouse.move(...P(...b), { steps: 8 }); await page.mouse.up(); await rafs(page, 2);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    const f = path.join(OUT, name + '.motionpad.json'); await dl.saveAs(f); await ctx.close(); return JSON.parse(fs.readFileSync(f, 'utf8'));
  };
  const variant = (proj, zone, name) => { const p = JSON.parse(JSON.stringify(proj)); Object.assign(p.zones[0], { auto: false, breath: 0, wave: 0, twist: 0, ripple: 0, flow: 0, windStrength: 0 }, zone);
    const extra = typeof p.extra === 'string' ? JSON.parse(p.extra) : (p.extra || {}); if (extra.ambient) extra.ambient.enabled = false; p.extra = typeof proj.extra === 'string' ? JSON.stringify(extra) : extra;
    if (p.ambient) p.ambient.enabled = false;
    const f = path.join(OUT, name + '.motionpad.json'); fs.writeFileSync(f, JSON.stringify(p)); return f; };
  // 프로젝트를 열고 감상 화면에서 from → to로 끌고 멈춘 채 찍는다(drag 없으면 가만히)
  const shoot = async (file, name, drag, waits = [20]) => {
    const { ctx, page } = await open();
    await page.setInputFiles('#backupFile', file); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 5);
    await page.locator('#viewerBtn').click(); await rafs(page, 10);
    const view = page.locator('#view'), box = await view.boundingBox(), P = (x, y) => [box.x + box.width * x, box.y + box.height * y];
    if (drag) { await page.mouse.move(...P(...drag[0])); await page.mouse.down(); await page.mouse.move(...P(...drag[1]), { steps: 12 }); }
    const shots = [];
    for (let k = 0; k < waits.length; k++) { if (waits[k] < 0) await page.waitForTimeout(-waits[k]); else await rafs(page, waits[k]); const f = path.join(OUT, name + (waits.length > 1 ? '-' + k : '') + '.png'); await view.screenshot({ path: f }); shots.push(f); }
    const state = await page.evaluate(() => window.MotionPadDebug.state().renderer);
    if (drag) await page.mouse.up(); await ctx.close(); return { shots, state };
  };
  const diff = (a, b) => require('child_process').execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image, ImageChops\na=Image.open(sys.argv[1]).convert("RGB");b=Image.open(sys.argv[2]).convert("RGB")\nd=ImageChops.difference(a,b).convert("L")\nh=d.histogram()\nprint("%.3f%% 최대 %d" % (100*sum(h[17:])/sum(h), max(i for i,v in enumerate(h) if v)))', a, b]).toString().trim();

  // ── 접힘: 얼굴 타원, 잡아당김 0%, 움직임 강도 80, 오른쪽으로 크게 끌기 ──
  const face = await makeProject(path.join(ROOT, 'tools/baseline/fixtures/character.png'), [.36, .25], [.64, .52], 'face');
  for (const feather of [0, 3, 8]) {
    const r = await shoot(variant(face, { feather, spread: 0, pull: 0, strength: 80, spring: 30, damping: 100 }, 'fold-f' + feather), 'fold-f' + feather, [[.5, .4], [.85, .4]]);
    console.log('접힘 경계 부드러움', feather, r.state, path.basename(r.shots[0]));
  }
  // ── 빈자리: 실제 그림(후드) 위 타원을 '외곽까지 흔들기'로 ──
  const hood = await makeProject(path.join(ROOT, 'samples/002.png'), [.55, .62], [.80, .82], 'hood');
  const on = variant(hood, { tailCutout: true, feather: 8, pull: 0, strength: 80 }, 'cut-on'), off = variant(hood, { tailCutout: false }, 'cut-off');
  const moved = await shoot(on, 'cut-moved', [[.67, .72], [.95, .60]], [8, -4000]);
  console.log('빈자리(끌고 있는 중) 바로 → 4초 뒤 차이:', diff(...moved.shots), moved.state);
  const restOn = await shoot(on, 'cut-rest-on', null, [-4000]), restOff = await shoot(off, 'cut-rest-off', null, [-4000]);
  console.log('가만히 있을 때: 외곽까지 흔들기 켬 vs 끔 차이:', diff(restOn.shots[0], restOff.shots[0]));
  console.log('오류', errors.length, errors.slice(0, 3));
  await browser.close();
})();
