#!/usr/bin/env node
// 1-B 비용 측정: 결과물 motionpad.html의 TILE(마스크 격자)만 384·768·1024로 바꾼 사본을 만들어
// 같은 조작(타원·마술봉 2·간략 범위지정)을 하고 적용 시간·저장 크기·되돌리기 크기·슬라이더 드래그 프레임 시간을 잰다.
// CPU 1배(PC)와 4배 느리게(폰 흉내). 경계 부드러움·바깥 확장 픽셀 값은 격자에 비례하게 늘려 같은 겉모습이 되게 한다.
//   node tools/select/grid_cost.js   →  표준출력 + tools/select/out/grid-cost.json (약 5분)
// 사본은 측정용일 뿐이다(TILE 변경은 저장 형식 v2와 맞지 않는다).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), SP = path.join(__dirname, 'out', 'grid-cost'), FIX = path.join(ROOT, 'tools/baseline/fixtures/character.png');
fs.mkdirSync(SP, { recursive: true });
{
  const src = fs.readFileSync(path.join(ROOT, 'motionpad.html'), 'utf8');
  for (const n of [384, 768, 1024]) {
    const s = src.replace('TILE=384', 'TILE=' + n).replace('feather||0)*.63', 'feather||0)*.63*TILE/384').replace('const spread=Math.round(z.spread||0)', 'const spread=Math.round((z.spread||0)*TILE/384)')
      .replace('updateRendererBadge();requestAnimationFrame(tick);boot();', 'window.__mp={snap:()=>stateSnapshot(),undo:()=>undoStack,zones:()=>zones,maxTex:()=>gl&&gl.getParameter(gl.MAX_TEXTURE_SIZE)};updateRendererBadge();requestAnimationFrame(tick);boot();');
    if (s.split('TILE=' + n).length !== 2 || !s.includes('window.__mp')) throw new Error('결과물 구조가 바뀌어 사본을 만들 수 없다');
    fs.writeFileSync(path.join(SP, 'mp-' + n + '.html'), s);
  }
}
const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const stat = a => { const s = a.slice().sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p95: +s[Math.floor(s.length * .95)].toFixed(1) }; };
(async () => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
  const out = {};
  for (const throttle of [1, 4]) for (const n of [384, 768, 1024]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    // 시험은 내려받기 경로로 저장한다(저장 위치 고르기 창은 자동 조작으로 다룰 수 없다)
    await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto('file://' + SP + '/mp-' + n + '.html');
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await page.setInputFiles('#imageFile', FIX); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
    const box = await page.locator('#view').boundingBox(), P = (x, y) => [box.x + box.width * x, box.y + box.height * y];
    const drag = async pts => { await page.mouse.move(...P(...pts[0])); await page.mouse.down(); for (const q of pts.slice(1)) await page.mouse.move(...P(...q), { steps: 8 }); await page.mouse.up(); };
    const newZone = () => page.evaluate(() => { const t = document.querySelector('.mode.active'); document.getElementById('newRegionBtn').click(); if (t && !t.classList.contains('active')) t.click(); });
    const r = { errs };
    await page.locator('#ellipseMode').click(); await drag([[0.36, 0.25], [0.64, 0.52]]); await rafs(page, 2);
    await page.locator('#wandMode').click(); await newZone();
    await page.mouse.click(...P(0.42, 0.75)); await page.waitForFunction(() => document.getElementById('wandbar').dataset.ready === '1', null, { timeout: 60000 });
    let t0 = Date.now(); /* 3-M: 적용 버튼 없음(바로 반영) */ await rafs(page, 2); r.wandApplyMs = Date.now() - t0;
    await newZone();
    await page.mouse.click(...P(0.5, 0.20)); await page.waitForFunction(() => document.getElementById('wandbar').dataset.ready === '1', null, { timeout: 60000 });
    /* 3-M: 적용 버튼 없음(바로 반영) */ await rafs(page, 2);
    await page.locator('#lassoMode').click(); await newZone();
    const enc = page.locator('#encloseInput'); if (await enc.count() && !(await enc.isChecked())) await enc.check({ force: true });
    await drag([[0.64, 0.40], [0.92, 0.40], [0.92, 0.76], [0.64, 0.76], [0.64, 0.41]]);
    await page.waitForFunction(() => document.getElementById('outlineControls').dataset.ready === '1', null, { timeout: 90000 });
    t0 = Date.now(); /* 3-M: 적용 버튼 없음(바로 반영) */ await rafs(page, 2); r.outlineApplyMs = Date.now() - t0;
    r.zones = await page.evaluate(() => __mp.zones().map(z => z.kind + ':' + (z.runs ? z.runs.length : 0)).join(' '));
    r.snapshotKB = await page.evaluate(() => +(__mp.snap().length / 1024).toFixed(1));
    r.undo = await page.evaluate(() => ({ n: __mp.undo().length, kb: +(__mp.undo().reduce((a, v) => a + v.length, 0) / 1024).toFixed(0) }));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    const f = path.join(SP, 'save-' + n + '.json'); await dl.saveAs(f); r.saveKB = +(fs.statSync(f).size / 1024).toFixed(0);
    r.saveRunsKB = +(JSON.parse(fs.readFileSync(f, 'utf8')).zones || []).reduce((a, z) => a + JSON.stringify(z.runs || []).length, 0) / 1024 | 0;
    await page.evaluate(() => { for (const id of ['partsPanel', 'effects']) { const d = document.getElementById(id); if (d) d.open = true; } });
    const slider = (id, lo, hi) => page.evaluate(([id, lo, hi]) => new Promise(res => { const el = document.getElementById(id), t = []; let i = 0, last = performance.now();
      const step = () => { const now = performance.now(); if (i) t.push(now - last); last = now; if (i >= 40) return res(t); el.value = String(lo + (i * 7) % (hi - lo)); el.dispatchEvent(new Event('input', { bubbles: true })); i++; requestAnimationFrame(step); }; requestAnimationFrame(step); }), [id, lo, hi]);
    r.featherDrag = stat(await slider('featherInput', 0, 45));
    r.spreadDrag = stat(await slider('spreadInput', 0, 26));
    await page.evaluate(() => { const e = document.getElementById('tailCutoutInput'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }); await rafs(page, 3);
    r.tailFeatherDrag = stat(await slider('featherInput', 0, 45));
    // 되돌리기 1회 시간
    t0 = Date.now(); await page.locator('#undoBtn').click(); await rafs(page, 2); r.undoMs = Date.now() - t0;
    r.heapMB = await page.evaluate(() => +(performance.memory.usedJSHeapSize / 1048576).toFixed(1));
    r.maxTex = await page.evaluate(() => __mp.maxTex());
    // 캔버스 메모리(계산): 아틀라스 + 영역당 캐시 캔버스 4장(원본·잘림·효과·효과잘림, 같은 객체면 덜 듦) + 픽셀 배열 1장
    r.canvasMB_est = +((n * 4 * n * 3 * 4 + 4 * 5 * n * n * 4) / 1048576).toFixed(1);
    out[`x${throttle} ${n}`] = r; console.log(`CPU x${throttle} TILE ${n}`, JSON.stringify(r));
    await ctx.close();
  }
  fs.writeFileSync(path.join(__dirname, 'out', 'grid-cost.json'), JSON.stringify(out, null, 1));
  await browser.close();
})();
