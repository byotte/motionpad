#!/usr/bin/env node
// 도형 도구·이동 도구 동작 시험 (1-A). 마우스 드래그와 두 손가락(터치 포인터 이벤트)으로 조작하고,
// 단계마다 프로젝트를 저장해 영역의 모양 값을 확인한다.
//   node tools/baseline/shape_check.js [motionpad.html]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const target = path.resolve(process.argv[2] || 'motionpad.html');
const FIXTURE = path.join(__dirname, 'fixtures', 'character.png');
const TMP = path.join(__dirname, 'out', 'shape');

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
  // 시험은 내려받기 경로로 저장한다(저장 위치 고르기 창은 자동 조작으로 다룰 수 없다)
  await context.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('file://' + target);
  await page.setInputFiles('#imageFile', FIXTURE);
  await page.waitForSelector('.workspace:not([hidden])');

  const rafs = (n = 3) => page.evaluate((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
  const toScreen = async (x, y) => { const b = await page.locator('#view').boundingBox(); return { x: b.x + b.width * x, y: b.y + b.height * y }; };
  const drag = async (pts, steps = 8) => {
    const p0 = await toScreen(...pts[0]); await page.mouse.move(p0.x, p0.y); await page.mouse.down();
    for (const pt of pts.slice(1)) { const p = await toScreen(...pt); await page.mouse.move(p.x, p.y, { steps }); }
    await page.mouse.up(); await rafs();
  };
  // 두 손가락: 터치 포인터 이벤트를 직접 보낸다
  const pinch = async (a0, b0, a1, b1, steps = 8) => {
    const s = await Promise.all([a0, b0, a1, b1].map((p) => toScreen(...p)));
    await page.evaluate(async ([s, steps]) => {
      const el = document.getElementById('overlay');
      const fire = (type, id, p) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: p.x, clientY: p.y, bubbles: true, cancelable: true, isPrimary: id === 11 }));
      const raf = () => new Promise((r) => requestAnimationFrame(r));
      fire('pointerdown', 11, s[0]); await raf(); fire('pointerdown', 12, s[1]); await raf();
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, lerp = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
        fire('pointermove', 11, lerp(s[0], s[2])); fire('pointermove', 12, lerp(s[1], s[3])); await raf();
      }
      fire('pointerup', 12, s[3]); fire('pointerup', 11, s[2]); await raf();
    }, [s, steps]);
    await rafs();
  };
  const tool = async (id) => { if (!(await page.locator(`#${id}.active`).count()) || (await page.locator('.workspace.touchPreview').count())) await page.locator('#' + id).click(); await rafs(); };
  const radio = (name, v) => page.locator(`label:has(input[name="${name}"][value="${v}"])`).click();
  let n = 0;
  const zones = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    const file = path.join(TMP, `s${++n}.json`); await dl.saveAs(file);
    return JSON.parse(fs.readFileSync(file, 'utf8')).zones;
  };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const brief = (z) => ({ kind: z.kind, x: r3(z.x), y: r3(z.y), rx: r3(z.rx), ry: r3(z.ry), rot: r3(z.rot || 0), pts: z.polygon?.length ? z.polygon.map((p) => p.map(r3)) : undefined });
  const steps = [];
  const check = async (name, cond) => { const z = await zones(); steps.push({ name, ok: cond(z), z: z.map(brief) }); return z; };
  const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

  // 1 사각형 그리기 → 꼭짓점 4개 영역, 도형 도구에 머묾
  await tool('ellipseMode'); await radio('shapeKind', 'rect'); await radio('selectOp', 'new');
  await drag([[0.30, 0.60], [0.50, 0.80]]);
  let z = await check('1 사각형 → 꼭짓점 4개, 도형 도구 유지', (z) => z.length === 1 && z[0].kind === 'polygon' && z[0].polygon.length === 4 && near(z[0].rx, 0.1) && near(z[0].ry, 0.1));
  steps.at(-1).ok &&= (await page.locator('#ellipseMode.active').count()) === 1;
  // 2 오른쪽 아래 모서리 손잡이를 가로로만 끌기 → 가로만 커짐(비율 변경)
  await drag([[0.50, 0.80], [0.55, 0.80]]);
  z = await check('2 모서리 손잡이 가로로 → 가로만 커짐', (z) => z.length === 1 && near(z[0].rx, 0.15) && near(z[0].ry, 0.1) && near(z[0].x, 0.4));
  // 3 회전 손잡이(위쪽)를 오른쪽으로 → 꼭짓점이 기울어짐(수평이 아님)
  const rot = await page.evaluate(() => { const r = document.getElementById('overlay').getBoundingClientRect(); return 28 / r.height; });
  await drag([[0.40, 0.60 - rot], [0.55, 0.60 - rot]]);
  z = await check('3 회전 손잡이 → 기울어짐', (z) => { const p = z[0].polygon; return p.length === 4 && Math.abs(p[0][1] - p[1][1]) > 0.02; });
  // 3b 기울어진 사각형의 모서리를 바깥으로 → 여전히 직사각형(그림 비율 공간에서 직각)
  { const A = 800 / 1000, q = z[0].polygon[2], c = [z[0].x, z[0].y];
    await drag([[q[0], q[1]], [q[0] + (q[0] - c[0]) * 0.3, q[1] + (q[1] - c[1]) * 0.1]]);
    z = await check('3b 기울어진 사각형 모서리 → 직각 유지', (z) => { const p = z[0].polygon.map(([x, y]) => [x * A, y]);
      const v1 = [p[1][0] - p[0][0], p[1][1] - p[0][1]], v2 = [p[3][0] - p[0][0], p[3][1] - p[0][1]];
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / Math.hypot(...v1) / Math.hypot(...v2); return Math.abs(cos) < 0.02 && Math.abs(z[0].rot) > 0.3; }); }
  // 4 타원 '새로' → 영역 1이 타원으로 바뀜, 모서리 손잡이로 세로만 키우기
  await radio('shapeKind', 'ellipse'); await drag([[0.35, 0.25], [0.65, 0.45]]);
  z = await check('4 타원 새로 → 같은 영역이 타원으로', (z) => z.length === 1 && z[0].kind === 'ellipse' && near(z[0].rx, 0.15) && near(z[0].ry, 0.1));
  await drag([[0.65, 0.45], [0.65, 0.50]]);
  z = await check('5 모서리 손잡이 세로로 → 세로만 커짐', (z) => near(z[0].rx, 0.15) && near(z[0].ry, 0.15));
  // 6 두 손가락을 가로로 벌림 → 가로만 커짐
  await pinch([0.42, 0.35], [0.58, 0.35], [0.38, 0.35], [0.62, 0.35]);
  z = await check('6 두 손가락 가로로 벌림 → 가로만 1.5배', (z) => near(z[0].rx, 0.225, 0.02) && near(z[0].ry, 0.15) && near(z[0].rot, 0, 0.05));
  // 7 두 손가락 대각선 + 돌리기 → 같은 비율 + 기울기
  const before = z[0];
  await pinch([0.45, 0.30], [0.55, 0.40], [0.47, 0.27], [0.53, 0.43]);
  z = await check('7 두 손가락 대각선으로 돌림 → 기울기 생김', (z) => Math.abs(z[0].rot) > 0.15 && near(z[0].rx / z[0].ry, before.rx / before.ry, 0.05));
  // 8 이동 도구: 끌면 위치만 바뀜
  const b8 = z[0];
  await tool('editMode'); await drag([[0.50, 0.35], [0.55, 0.40]]);
  z = await check('8 이동 도구 → 위치만 바뀜', (z) => near(z[0].x, b8.x + 0.05, 0.015) && near(z[0].y, b8.y + 0.05, 0.015) && near(z[0].rx, b8.rx, 0.002) && near(z[0].rot, b8.rot, 0.002));
  // 9 이동 도구에서 두 손가락 → 영역은 그대로(화면 확대)
  const b9 = z[0];
  await pinch([0.45, 0.4], [0.55, 0.4], [0.40, 0.4], [0.60, 0.4]);
  z = await check('9 이동 도구 두 손가락 → 영역 그대로', (z) => near(z[0].rx, b9.rx, 0.002) && near(z[0].x, b9.x, 0.002));
  // 10 되돌리기 → 이동 전 위치
  await page.locator('#undoBtn').click(); await rafs();
  z = await check('10 되돌리기 → 이동 전', (z) => near(z[0].x, b8.x, 0.003));

  await browser.close();
  for (const s of steps) console.log(`${s.ok ? 'OK  ' : '실패'} ${s.name}  ${JSON.stringify(s.z)}`);
  console.log(`오류 ${errors.length}건`, errors.slice(0, 5));
  process.exit(steps.every((s) => s.ok) && !errors.length ? 0 : 1);
})();
