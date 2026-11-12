// 스타일 비교용 장면 정의 (style_snapshot.js, css_usage.js 공용)
'use strict';
const path = require('path');
const FIXTURE = path.join(__dirname, 'fixtures', 'character.png');
const VP = {
  pc: { width: 1440, height: 900 }, laptop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true }, 'phone-land': { width: 844, height: 390, isMobile: true, hasTouch: true },
  'fold-cover': { width: 344, height: 882, isMobile: true, hasTouch: true }, 'fold-open': { width: 884, height: 1000, isMobile: true, hasTouch: true },
  'fold-open-land': { width: 1000, height: 884, isMobile: true, hasTouch: true },
};
const PROPS = ['display', 'position', 'color', 'backgroundColor', 'backgroundImage', 'borderTopWidth', 'borderTopColor', 'borderTopStyle', 'borderRightWidth', 'borderRightColor', 'borderBottomWidth', 'borderBottomColor', 'borderLeftWidth', 'borderLeftColor',
  'borderTopLeftRadius', 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign', 'opacity', 'boxShadow', 'whiteSpace', 'overflowX', 'overflowY', 'filter', 'backdropFilter', 'accentColor', 'appearance', 'zIndex', 'transform',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'cursor', 'listStyleType'];

// 장면 준비 (페이지 안 상태를 실제 사용 경로로 만든다)
async function prep(page, state) {
  if (state === 'welcome') return;
  await page.setInputFiles('#imageFile', FIXTURE);
  await page.waitForSelector('.workspace:not([hidden])');
  const view = async (x, y) => { const b = await page.locator('#view').boundingBox(); return [b.x + b.width * x, b.y + b.height * y]; };
  if (state === 'editor') return;
  if (['rich', 'wand', 'lasso', 'outline', 'pivot', 'viewer', 'viewer-compact', 'help', 'touchprev', 'dlg-zonemenu'].includes(state)) {
    // 몸체 영역(큰 타원) + 일반 영역(얼굴 타원), 일반 영역 선택 상태
    for (const box of [[.25, .2, .75, .9], [.36, .25, .64, .52]]) {
      await page.locator('#ellipseMode').click();
      const [x0, y0] = await view(box[0], box[1]), [x1, y1] = await view(box[2], box[3]);
      await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 4 }); await page.mouse.up();
      if (box[0] === .25) { await page.evaluate(() => { document.getElementById('ambientPanel').open = true; document.getElementById('basePanel').open = true; }); await page.locator('#markBaseBtn').click(); }
    }
    await page.evaluate(() => { for (const id of ['partsPanel', 'basePanel', 'advanced', 'effects', 'windPanel', 'anchorPanel']) { const d = document.getElementById(id); if (d) d.open = true; } });
  }
  if (state === 'outline') {
    await page.locator('#lassoMode').click();
    await page.evaluate(() => { const e = document.getElementById('encloseInput'); if (!e.checked) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); } });
    const pts = [[.64, .40], [.92, .40], [.92, .76], [.64, .76], [.64, .41]];
    let [x, y] = await view(...pts[0]); await page.mouse.move(x, y); await page.mouse.down();
    for (const p of pts.slice(1)) { [x, y] = await view(...p); await page.mouse.move(x, y, { steps: 8 }); }
    await page.mouse.up();
    await page.waitForFunction(() => !document.getElementById('outlineApply').disabled, null, { timeout: 60000 });
  }
  if (state === 'help') { await page.locator('#wandMode').click(); await page.locator('#wandbar [data-help]').first().click(); }
  if (state === 'touchprev') {
    await page.locator('#wandMode').click();
    await page.evaluate(() => { const e = document.getElementById('strengthInput'); e.value = String(Number(e.value) + 5); e.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  if (state === 'viewer-compact') await page.locator('#viewerBtn').click();
  if (state === 'dlg-zonemenu') await page.locator('#zoneList .chip').last().click({ button: 'right' });
  if (state === 'wand') {
    await page.locator('#wandMode').click();
    const [x, y] = await view(.42, .75); await page.mouse.click(x, y);
    await page.waitForFunction(() => !document.getElementById('wandApply').disabled);
  }
  if (state === 'lasso') {
    await page.locator('#lassoMode').click();
    await page.evaluate(() => { const e = document.getElementById('lassoSegments'); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); });
  }
  if (state === 'pivot') await page.locator('#pivotMode').click();
  if (state === 'viewer') {
    await page.locator('#viewerBtn').click();
    await page.evaluate(() => { const f = document.getElementById('viewerAudio'); if (f.classList.contains('compact')) document.getElementById('playerCollapse').click(); });
  }
  const dialogs = { 'dlg-settings': () => document.querySelector('[data-dialog="layoutSettings"]').click(), 'dlg-sound': () => document.getElementById('openMusic').click(),
    'dlg-video': () => document.querySelector('[data-dialog="videoDialog"]').click(), 'dlg-mask': () => document.getElementById('maskMenu').click(),
    'dlg-saveas': () => document.getElementById('saveAsBtn').click(), 'dlg-blink': () => document.getElementById('eyeEntry').click(),
    'menu-file': () => { document.querySelectorAll('details.topMenu')[0].open = true; }, 'menu-settings': () => { document.querySelectorAll('details.topMenu')[2].open = true; } };
  if (dialogs[state]) await page.evaluate(dialogs[state]);
}

const SCENES = [];
for (const vp of Object.keys(VP)) for (const st of ['welcome', 'editor', 'rich', 'wand', 'lasso']) SCENES.push([vp, 'violet', st]);
for (const th of ['light', 'mono']) for (const st of ['welcome', 'rich', 'wand', 'dlg-settings', 'viewer']) SCENES.push(['pc', th, st]), SCENES.push(['mobile', th, st]);
for (const vp of ['pc', 'mobile', 'phone-land']) for (const st of ['outline', 'help', 'touchprev', 'viewer-compact', 'pivot', 'viewer', 'dlg-settings', 'dlg-sound', 'dlg-video', 'dlg-mask', 'dlg-saveas', 'dlg-blink', 'menu-file', 'menu-settings']) SCENES.push([vp, 'violet', st]);


module.exports = { VP, PROPS, SCENES, prep };
