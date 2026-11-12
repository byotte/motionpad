// 검토용 장면 스크린샷 (개발 전용): node tools/baseline/shots.js <html> <출력 폴더> <화면-테마-상태> ...
// 예) node tools/baseline/shots.js motionpad.html out/review pc-violet-rich mobile-light-dlg-sound
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { VP, prep } = require('./scenes');
(async () => {
  const [file, outDir, ...names] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const name of names) {
    const vp = Object.keys(VP).sort((a, b) => b.length - a.length).find(v => name.startsWith(v + '-'));
    const [theme, ...st] = name.slice(vp.length + 1).split('-');
    const { width, height, ...rest } = VP[vp];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...rest });
    await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await context.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await context.addInitScript(t => { try { localStorage.setItem('motionpad-theme', t); } catch (_) {} }, theme);
    const page = await context.newPage();
    await page.goto('file://' + path.resolve(file));
    await prep(page, st.join('-'));
    await page.clock.runFor(500);
    await page.screenshot({ path: path.join(outDir, name + '.png') });
    await context.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
