#!/usr/bin/env node
// 검수 오류 재현 시험(작업지시서 0-4). node tools/baseline/fix_check.js [대상.html] [e1 e2 e3 e4 e5 e6 ...]
// 항목을 안 주면 전부. 각 항목은 '정상이면 통과'로 적혀 있다(고치기 전에는 실패해야 한다).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out/fix');
fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2), TARGET = path.resolve(argv.find(a => a.endsWith('.html')) || path.join(ROOT, 'motionpad.html'));
const ONLY = argv.filter(a => !a.endsWith('.html'));
const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const dataURL = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const QUAD = path.join(OUT, 'quad2600.png');
if (!fs.existsSync(QUAD)) cp.execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
W=2600;im=Image.new("RGB",(W,W))
for (x,y,c) in [(0,0,(220,30,30)),(1,0,(30,200,40)),(0,1,(30,60,220)),(1,1,(240,220,30))]: im.paste(c,(x*W//2,y*W//2,(x+1)*W//2,(y+1)*W//2))
im.save(sys.argv[1])`, QUAD]);
const EYE = (cx, cy) => ({ points: [{ x: cx - .05, y: cy }, { x: cx + .05, y: cy }, { x: cx, y: cy - .02 }, { x: cx, y: cy + .02 }], protection: [], cover: 24, curve: 0 });
function project(image, zones, extra) {
  return { format: 'motionpad-project', version: 2, image, audio: null, zones: zones || [], extra: Object.assign({
    blink: { eyes: [EYE(.62, .2), EYE(.85, .2)], speed: 100, interval: 1 },
    faces: { on: true, list: [{ mouth: { l: { x: .68, y: .32 }, r: { x: .8, y: .32 }, c: { x: .74, y: .34 } }, brows: [[{ x: .57, y: .15 }, { x: .67, y: .15 }], [{ x: .8, y: .15 }, { x: .9, y: .15 }]] }] },
    ambient: { enabled: true, breath: 0, sway: 0, face: '0:shy', faceAmt: 100 } }, extra || {}) };
}
async function openProject(page, proj, name) {
  const f = path.join(OUT, name + '.motionpad.json'); fs.writeFileSync(f, JSON.stringify(proj));
  await page.setInputFiles('#backupFile', f); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 6);
}
async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1200, height: 900 }, acceptDownloads: true }), page = await ctx.newPage(), errors = [];
  await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto('file://' + TARGET); page.errors = errors; return page;
}
const results = [];
const report = (id, ok, info) => { results.push({ id, ok }); console.log((ok ? '통과' : '실패'), id, info || ''); };
const tests = {
  // E1: 원본 크기 녹화 중 깜빡임이 그림 왼쪽 위에 줄어든 그림을 덮는지
  async e1(browser) {
    const page = await newPage(browser);
    await openProject(page, project(dataURL(QUAD), [], {}), 'e1');
    await page.evaluate(() => { document.getElementById('videoDuration').value = '3'; document.getElementById('videoFPS').value = '15'; document.querySelector('input[name="videoSize"][value="orig"]').checked = true; });
    await page.evaluate(() => document.querySelector('[data-dialog="videoDialog"]').click()); await rafs(page, 3);
    const dl = page.waitForEvent('download', { timeout: 600000 }).catch(() => null);
    await page.locator('#exportVideoBtn').click();
    await page.waitForFunction(() => /영상 녹화|실패|못했/.test(document.getElementById('videoProgress').textContent), null, { timeout: 180000 });
    await page.waitForTimeout(3000);
    const px = await page.evaluate(() => new Promise(r => requestAnimationFrame(() => { const c = document.createElement('canvas'); c.width = c.height = 100; const g = c.getContext('2d'); g.drawImage(document.getElementById('view'), 0, 0, 100, 100); r([...g.getImageData(45, 45, 1, 1).data].slice(0, 3)); })));
    await dl;
    report('e1', px[0] > 150 && px[1] < 120 && px[2] < 120, '(45,45) 색 ' + px.join(',') + ' (정상 = 빨강)' + (page.errors.length ? ' 오류 ' + page.errors[0] : ''));
  },
};
(async () => {
  const browser = await chromium.launch();
  for (const [id, fn] of Object.entries(tests)) if (!ONLY.length || ONLY.includes(id)) {
    try { await fn(browser); } catch (e) { report(id, false, '예외 ' + String(e).slice(0, 300)); }
  }
  await browser.close();
  const bad = results.filter(r => !r.ok); console.log(bad.length ? `실패 ${bad.length}건` : '모두 통과'); process.exit(bad.length ? 1 : 0);
})();
