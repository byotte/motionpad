// 영역 속성 동등성 검사기 (0-3용, 개발 전용)
// 사용: node tools/baseline/schema_check.js legacy-0.5rc23.html motionpad.html
// 이상한 값을 섞은 영역 12개를 두 파일에 똑같이 불러온 뒤
//  ① 저장 결과(속성 순서 포함) ② 영역별 화면 표시값 ③ 슬라이더·체크 조작 후 저장 결과 ④ 되돌리기 후 저장 결과
// 를 글자 단위로 비교한다.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [fileA, fileB] = process.argv.slice(2).map(f => path.resolve(f));
const OUT = path.join(__dirname, 'out', 'schema-check');
fs.mkdirSync(OUT, { recursive: true });
const image = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures', 'character.png')).toString('base64');

const INPUTS = ['nameInput', 'axisInput', 'strengthInput', 'springInput', 'dampingInput', 'widthInput', 'heightInput', 'rotationInput', 'autoInput', 'autoSpeedInput', 'featherInput', 'breathInput', 'waveInput', 'twistInput', 'rippleInput', 'flowInput', 'flowAngleInput', 'spreadInput', 'pivotEnabledInput', 'pivotStrengthInput', 'tapGainInput', 'dragGainInput', 'holdGainInput', 'flickGainInput', 'windStrengthInput', 'windAngleInput', 'windSpeedInput', 'windNoiseInput', 'windDelayInput', 'lockedInput'];
const OUTPUTS = ['strengthValue', 'springValue', 'dampingValue', 'widthValue', 'heightValue', 'autoSpeedValue', 'rotationValue', 'featherValue', 'breathValue', 'waveValue', 'twistValue', 'rippleValue', 'flowValue', 'flowAngleValue', 'spreadValue', 'pivotStrengthValue', 'tapGainValue', 'dragGainValue', 'holdGainValue', 'flickGainValue', 'windStrengthValue', 'windAngleValue', 'windSpeedValue', 'windNoiseValue', 'windDelayValue'];

// 일부러 지저분한 영역들
const zones = [
  { id: 'e1', name: '타원 기본', kind: 'ellipse', x: .5, y: .4, rx: .1, ry: .15 },
  { id: 'e2', name: '범위 밖 값', kind: 'ellipse', x: 2, y: -1, rx: 9, ry: 0, rot: 1.2, scale: 99, strength: 999, spring: -5, damping: '50', autoSpeed: 0, feather: 100, spread: -3, flowAngle: 720, windAngle: -999, windSpeed: 7, tapGain: 500, holdGain: '12', auto: 1, locked: 'yes', pivotEnabled: 0, axis: 'diag', preset: 'nope' },
  { id: 'e3', kind: 'ellipse', x: null, y: '0.3', rx: 'abc', ry: undefined, breath: null, wave: '7', twist: 12.5, ripple: 3, flow: 40.1, pivotX: 2, pivotY: null, pivotStrength: 33, axis: 'weird', name: '' },
  { id: 'b1', name: '붓', kind: 'brush', strokes: [{ r: .03, points: [[.2, .2], [.25, .3], [.3, .35]] }, { r: 9, points: [[2, -1]] }, { r: .02, points: [] }], windStrength: 40, windNoise: 10, windDelay: 90, dragGain: 0, flickGain: 200 },
  { id: 'p1', name: '다각형', kind: 'polygon', polygon: [[.6, .6], [.8, .6], [.8, .8], ['x', .8]], spine: [[.6, .6], [.7, .7], [5, 5]], branch: [[.1, .1]], extraPivots: [[.2, .2], [.3, .3], [.4, .4]] },
  { id: 'r1', name: '래스터', kind: 'raster', runs: [[1000, 50], [2000, 30], [9999999, 4], [500, 0]], x: .3, y: .7, rx: .05, ry: .05, baseX: .31, baseY: .69 },
  { id: 'u1', name: '알 수 없는 종류', kind: 'triangle', x: .4, y: .4 },
  { id: 'n1', name: '이름이 아주 아주 아주 아주 아주 길어서 잘려야 하는 영역', kind: 'ellipse', x: .2, y: .8, tailCutout: true, breathSpeed: 9 },
  { id: 'n2', name: '몸체', kind: 'ellipse', x: .5, y: .6, rx: .3, ry: .35, isBase: true, feather: 3, spread: 2 },
  { id: '', name: '빈 아이디', kind: 'ellipse', x: .7, y: .2, strength: 'NaN', spring: Infinity },
  { id: 'e5', name: '프리셋', kind: 'ellipse', x: .45, y: .55, preset: 'hair', tailCutout: 'true', extra: 'ignored' },
  { id: 'e6', name: '음수', kind: 'ellipse', x: .1, y: .1, rot: -2.5, flowAngle: -45.6, windAngle: 45.5, autoSpeed: 1.25, windSpeed: 1.25 },
];
const project = { format: 'motionpad-project', version: 2, editorVersion: 'test', audioName: '', savedAt: '', extra: {}, zones, image, audio: null };
fs.writeFileSync(path.join(OUT, 'input.motionpad.json'), JSON.stringify(project));

async function run(browser, file) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  // 빈 아이디 영역의 새 아이디를 같게 하려고 난수를 고정
  await context.addInitScript(() => { let a = 7; Math.random = () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.dismiss());
  await page.goto('file://' + file);
  await page.setInputFiles('#backupFile', path.join(OUT, 'input.motionpad.json'));
  await page.waitForSelector('.workspace:not([hidden])');
  await page.evaluate(() => { for (const id of ['partsPanel', 'advanced', 'effects', 'windPanel', 'anchorPanel']) { const d = document.getElementById(id); if (d) d.open = true; } });
  const save = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('backupBtn').click())]);
    const f = path.join(OUT, 'tmp.json'); await dl.saveAs(f);
    const d = JSON.parse(fs.readFileSync(f, 'utf8')); delete d.savedAt; delete d.image; delete d.editorVersion; return JSON.stringify(d);
  };
  const result = { errors };
  result.saved = await save();
  // 영역별 화면 표시값
  result.ui = [];
  const n = await page.locator('#zoneList .chip').count();
  for (let i = 0; i < n; i++) {
    await page.locator('#zoneList .chip').nth(i).click();
    result.ui.push(await page.evaluate(([ins, outs]) => ({
      inputs: ins.map(id => { const e = document.getElementById(id); return e.type === 'checkbox' ? e.checked : e.value; }),
      outputs: outs.map(id => document.getElementById(id).textContent),
      rows: ['widthRow', 'heightRow', 'rotationRow'].map(id => document.getElementById(id).hidden),
    }), [INPUTS, OUTPUTS]));
  }
  // 조작: 두 번째 영역(범위 밖 값)과 첫 영역에서 모든 입력을 한 번씩 바꾼다
  for (const idx of [1, 0]) {
    await page.locator('#zoneList .chip').nth(idx).click();
    await page.evaluate(ins => {
      for (const id of ins) {
        const e = document.getElementById(id);
        if (id === 'lockedInput') continue; // 잠그면 이후 조작이 막히므로 마지막에
        if (e.type === 'checkbox') { e.checked = !e.checked; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); continue; }
        if (e.tagName === 'SELECT') { e.selectedIndex = (e.selectedIndex + 1) % e.options.length; }
        else if (id === 'nameInput') e.value = '바뀐 이름';
        else { const min = Number(e.min || 0), max = Number(e.max || 100), step = Number(e.step) || 1; e.value = String(Math.round(((min + max) / 2 + step * 3) / step) * step); }
        e.dispatchEvent(new Event('focus')); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const l = document.getElementById('lockedInput'); l.checked = !l.checked; l.dispatchEvent(new Event('input', { bubbles: true }));
    }, INPUTS);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  }
  result.afterEdit = await save();
  // 되돌리기 5번
  for (let k = 0; k < 5; k++) { if (await page.locator('#undoBtn').isEnabled()) await page.locator('#undoBtn').click(); }
  result.afterUndo = await save();
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const a = await run(browser, fileA), b = await run(browser, fileB);
  await browser.close();
  let ok = true;
  const check = (label, x, y) => {
    const same = JSON.stringify(x) === JSON.stringify(y); ok = ok && same;
    console.log(`${same ? '같음' : '다름'}  ${label}`);
    if (!same) { fs.writeFileSync(path.join(OUT, label + '-A.json'), JSON.stringify(x, null, 1)); fs.writeFileSync(path.join(OUT, label + '-B.json'), JSON.stringify(y, null, 1)); }
  };
  check('불러온-뒤-저장', a.saved, b.saved);
  check('영역별-화면-표시', a.ui, b.ui);
  check('조작-뒤-저장', a.afterEdit, b.afterEdit);
  check('되돌리기-뒤-저장', a.afterUndo, b.afterUndo);
  check('페이지-오류', a.errors, b.errors);
  console.log(`영역 ${JSON.parse(a.saved).zones.length}개, 화면 확인 ${a.ui.length}개, 오류 ${a.errors.length}/${b.errors.length}`);
  console.log(ok ? '결과: 완전히 같음' : '결과: 차이 있음 → ' + OUT);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
