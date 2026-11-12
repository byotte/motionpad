// 테마 후보 미리보기 이미지 만들기: node tools/design/theme_preview.js <출력.png>
// 실제 motionpad.html 화면에 후보 색만 입혀(PC 편집 화면·폰 편집 화면) 한 장으로 모은다.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { VP, prep } = require('../baseline/scenes');
const ROOT = path.join(__dirname, '..', '..');
const CAND = [['A-1 다크', 'violet'], ['A-2 라이트 · 검은 포인트', 'light'], ['A-3 따뜻한 종이 감성', 'paper'], ['B-1 다크 베이직', 'darkbasic'], ['B-2 라이트 베이직', 'lightbasic'], ['B-3 모노(중간 회색)', 'mono']];
(async () => {
  const out = path.resolve(process.argv[2] || 'theme-preview.png');
  const tmp = path.join(__dirname, '.preview'); fs.mkdirSync(tmp, { recursive: true });
  const html = fs.readFileSync(path.join(ROOT, 'motionpad.html'), 'utf8').replace('</style>', fs.readFileSync(path.join(__dirname, 'theme-candidates.css'), 'utf8') + '\n</style>');
  const page0 = path.join(tmp, 'motionpad-preview.html'); fs.writeFileSync(page0, html);
  const browser = await chromium.launch();
  const shots = [];
  for (const [label, theme] of CAND) for (const vp of ['pc', 'mobile']) {
    const { width, height, ...rest } = VP[vp];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...rest });
    await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await context.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await context.addInitScript(t => { try { localStorage.setItem('motionpad-theme', t); } catch (_) {} document.addEventListener('DOMContentLoaded', () => { document.documentElement.dataset.theme = t; }); }, theme);
    const page = await context.newPage();
    await page.goto('file://' + page0);
    await prep(page, 'rich');
    await page.evaluate(() => { document.querySelectorAll('details.topMenu')[0].open = true; });
    await page.clock.runFor(500);
    const f = path.join(tmp, `${theme}-${vp}.png`); await page.screenshot({ path: f }); shots.push([label, theme, vp, f]);
    await context.close();
  }
  // 한 장으로 모으기
  const rows = CAND.map(([label, theme]) => `<div class="row"><h3>${label}</h3><img class="pc" src="${theme}-pc.png"><img class="m" src="${theme}-mobile.png"></div>`).join('');
  const sheet = path.join(tmp, 'sheet.html');
  fs.writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:#fff;font:600 18px system-ui,"Noto Sans KR",sans-serif;display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .row{display:grid;grid-template-columns:auto auto;gap:8px;align-items:start}.row h3{grid-column:1/-1;margin:0}.pc{width:720px;border:1px solid #ccc}.m{width:195px;border:1px solid #ccc}</style>${rows}`);
  const context = await browser.newContext({ viewport: { width: 1900, height: 1000 } });
  const page = await context.newPage(); await page.goto('file://' + sheet); await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log(out);
})().catch(e => { console.error(e); process.exit(1); });
