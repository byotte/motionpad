#!/usr/bin/env node
// 선택 방식(새로·더하기·빼기) 동작 시험 (1-A). 실제 사용자 경로(도구 누르기·드래그·클릭)로만 조작하고,
// 단계마다 프로젝트를 저장해 영역 개수·종류·넓이·움직임 설정을 확인한다.
//   node tools/baseline/selop_check.js [motionpad.html]
'use strict';
const { chromium } = require('playwright');require('./detail_mode');
const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || 'motionpad.html');
const FIXTURE = path.join(__dirname, 'fixtures', 'character.png');
const TMP = path.join(__dirname, 'out', 'selop');
const TILE = 384;

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  // 시험은 내려받기 경로로 저장한다(저장 위치 고르기 창은 자동 조작으로 다룰 수 없다)
  await context.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => { errors.push('dialog: ' + d.message()); d.dismiss(); });
  await page.goto('file://' + target);
  await page.setInputFiles('#imageFile', FIXTURE);
  await page.waitForSelector('.workspace:not([hidden])');

  const rafs = (n = 3) => page.evaluate((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
  const toScreen = async (x, y) => { const b = await page.locator('#view').boundingBox(); return { x: b.x + b.width * x, y: b.y + b.height * y }; };
  const drag = async (pts, steps = 6) => {
    const p0 = await toScreen(...pts[0]); await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    for (const pt of pts.slice(1)) { const p = await toScreen(...pt); await page.mouse.move(p.x, p.y, { steps }); }
    await page.mouse.up(); await rafs();
  };
  const box = (x0, y0, x1, y1) => drag([[x0, y0], [x1, y1]]);
  // 다른 도구이거나 터치 미리보기 중이면 도구를 누른다(사용자가 하던 작업으로 돌아가는 방법)
  const tool = async (id) => { if (!(await page.locator(`#${id}.active`).count()) || (await page.locator('.workspace.touchPreview').count())) await page.locator('#' + id).click(); await rafs(); };
  const op = async (v) => { await page.locator(`#selOp label:has(input[value="${v}"])`).click(); };
  const status = () => page.locator('#status').textContent();
  let saveNo = 0;
  const zones = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    const file = path.join(TMP, `s${++saveNo}.json`); await dl.saveAs(file);
    return JSON.parse(fs.readFileSync(file, 'utf8')).zones.map((z) => ({
      kind: z.kind, name: z.name, strength: z.strength,
      area: z.kind === 'raster' ? z.runs.reduce((a, r) => a + r[1], 0) : z.kind === 'ellipse' ? Math.round(Math.PI * z.rx * z.ry * TILE * TILE) : null,
    }));
  };
  const wand = async (x, y) => {
    const p = await toScreen(x, y); await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => document.getElementById('wandbar').dataset.ready === '1', null, { timeout: 30000 });
    /* 3-M: 적용 버튼 없음(바로 반영) */
    const st = await status(); await rafs(); return st;// 적용 직후 안내(화질 자동 조정 같은 다른 안내가 곧 덮을 수 있다)
  };

  const steps = [];
  const check = async (name, cond, extra = '') => { const st = (await status()).trim(), z = await zones(), ok = cond(z); steps.push({ name, ok, zones: z, status: st, extra }); return z; };

  // 1 새 영역: 타원(얼굴)
  await tool('ellipseMode'); await box(0.36, 0.25, 0.64, 0.52);
  let z1 = await check('1 타원으로 새 영역', (z) => z.length === 1 && z[0].kind === 'ellipse');
  // 움직임 세기를 바꿔 둔다(모양을 바꿔도 남아야 함)
  await page.evaluate(() => { for (const id of ['partsPanel', 'advanced', 'zonesPanel', 'edgePanel', 'presetPanel', 'autoPanel', 'gainPanel']) { const d = document.getElementById(id); if (d) d.open = true; }
    const e = document.getElementById('strengthInput'); e.value = '61'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  // 2 더하기: 겹치는 타원
  await tool('ellipseMode'); await op('add'); await box(0.5, 0.45, 0.75, 0.62);
  const z2 = await check('2 타원 더하기 → 같은 영역이 커짐', (z) => z.length === 1 && z[0].area > z1[0].area && z[0].strength === 61);
  // 3 빼기: 왼쪽 위 타원
  await tool('ellipseMode'); await op('subtract'); await box(0.3, 0.2, 0.5, 0.4);
  const z3 = await check('3 타원 빼기 → 같은 영역이 작아짐', (z) => z.length === 1 && z[0].area < z2[0].area && z[0].strength === 61);
  // 4 새로: 마술봉(옷) → 영역 1의 모양을 바꿈, 움직임 설정 유지
  await tool('wandMode'); await op('new'); await wand(0.42, 0.75);
  const z4 = await check('4 마술봉 새로 → 영역 1의 모양이 옷으로 바뀜, 세기 61 유지', (z) => z.length === 1 && z[0].kind === 'raster' && z[0].strength === 61 && Math.abs(z[0].area - 5874) < 300);
  // 5 더하기: 간략 범위지정(꼬리)
  await tool('lassoMode'); await op('add');
  if (!(await page.locator('#encloseInput').isChecked())) await page.locator('#encloseInput').check({ force: true });
  await drag([[0.64, 0.40], [0.92, 0.40], [0.92, 0.76], [0.64, 0.76], [0.64, 0.41]], 10);
  await page.waitForFunction(() => document.getElementById('outlineControls').dataset.ready === '1', null, { timeout: 60000 });
  /* 3-M: 적용 버튼 없음(바로 반영) */ await rafs();
  const z5 = await check('5 간략 범위지정 더하기 → 옷+꼬리', (z) => z.length === 1 && z[0].area > z4[0].area + 1500);
  // 6 빼기: 올가미(자유 그리기)로 옷 아래쪽 잘라내기
  await tool('lassoMode'); await op('subtract'); await page.locator('#encloseInput').uncheck({ force: true });
  await drag([[0.25, 0.80], [0.60, 0.80], [0.60, 0.90], [0.25, 0.90], [0.25, 0.805]], 10); await rafs();
  await check('6 올가미 빼기 → 작아짐', (z) => z.length === 1 && z[0].area < z5[0].area);
  // 7 아무 영역도 선택하지 않고 빼기 → 안내만, 변화 없음
  await page.locator('#newRegionBtn').click(); await tool('wandMode'); await op('subtract'); const st7 = await wand(0.5, 0.38);
  await check('7 선택 없이 빼기 → 안내, 영역 그대로', (z) => z.length === 1);
  steps.at(-1).status = st7; steps.at(-1).ok &&= /먼저 선택/.test(st7);
  // 8 선택 없이 새로 → 새 영역
  await op('new'); await wand(0.5, 0.38);
  await check('8 선택 없이 새로 → 새 영역(얼굴)', (z) => z.length === 2);
  // 9 되돌리기 한 번 → 영역 1개
  await page.locator('#undoBtn').click(); await rafs();
  await check('9 되돌리기 → 영역 1개', (z) => z.length === 1);

  await browser.close();
  for (const s of steps) console.log(`${s.ok ? 'OK  ' : '실패'} ${s.name}  ${JSON.stringify(s.zones)}  [${s.status}]`);
  console.log(`오류 ${errors.length}건`, errors.slice(0, 5));
  process.exit(steps.every((s) => s.ok) && !errors.length ? 0 : 1);
})();
