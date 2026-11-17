// I 시험판 판정용: 샘플 그림마다 두 눈 끝(화소)을 넣고 초안을 만들어 그림 위에 그려 본다 → tools/face-draft/out/*.png, 표는 docs/progress/I.md
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const CASES = [
  ['character', 'tools/baseline/fixtures/character.png', [[318, 400], [372, 400], [423, 400], [477, 400]]],
  ['001', 'samples/001.png', [[340, 321], [366, 325], [409, 336], [441, 335]]],
  ['002-left', 'samples/002.png', [[295, 355], [362, 355], [467, 314], [516, 310]]],
  ['002-right', 'samples/002.png', [[734, 365], [811, 370], [919, 424], [986, 433]]],
  ['003', 'samples/003.jpg', [[300, 790], [322, 795], [382, 782], [407, 785]]],
];
(async () => {
  const b = await chromium.launch();
  for (const [name, file, pts] of CASES) {
    const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto('file://' + path.join(ROOT, 'motionpad-face-draft.html'));
    await page.setInputFiles('#imageFile', path.join(ROOT, file)); await page.waitForSelector('.workspace:not([hidden])');
    const r = await page.evaluate(pts => {
      const d = window.MotionPadFaceDraft.build(pts.map(([x, y]) => ({ x, y })));
      return { d, w: window.MotionPadDebug.state().image };
    }, pts);
    console.log(name, JSON.stringify({ miss: r.d.miss, brows: r.d.brows.length, mouth: !!r.d.mouth }));
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ file, pts, draft: r.d }));
    await page.close();
  }
  await b.close();
})();
