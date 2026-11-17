#!/usr/bin/env node
// 3-G 확인: 큰 그림(3200×4000, 고운 줄무늬)을 원본 크기 영상으로 저장하고, 프레임을 뽑아 선명도를 본다.
//   node tools/motion/hires_check.js [대상.html] [이름] [--live]   → tools/motion/out/hires/<이름>.{mp4,png} + 준비 시간·안내 표시 여부
//   --live: 감상 화면의 ● 녹화로 저장(같은 원본 경로를 타는지).
// 헤드리스(소프트웨어 그래픽)는 이 크기에서 초당 1장 남짓이라 몇 분 걸린다.
'use strict';
const { chromium } = require('playwright');require('../baseline/detail_mode');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out/hires');
const args = process.argv.slice(2).filter(a => !a.startsWith('--')), LIVE = process.argv.includes('--live');
const TARGET = path.resolve(args[0] || path.join(ROOT, 'motionpad.html')), NAME = args[1] || 'run';
fs.mkdirSync(OUT, { recursive: true });
const IMG = path.join(OUT, 'stripes.png');
if (!fs.existsSync(IMG)) cp.execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
W,H=3200,4000
im=Image.new("RGB",(W,H),(236,228,214));d=ImageDraw.Draw(im)
for y in range(2800,H,4): d.line([(0,y),(W,y)],fill=(120,96,80))          # 바닥: 4px 간격 1px 가로줄
d.ellipse([900,600,2300,2200],fill=(250,222,200),outline=(60,40,30),width=6)   # 얼굴
for x in range(1000,2200,4): d.line([(x,1000),(x,1800)],fill=(150,90,90))     # 얼굴: 4px 간격 1px 세로줄
d.ellipse([1150,1150,1350,1350],fill=(40,30,30));d.ellipse([1850,1150,2050,1350],fill=(40,30,30))
d.polygon([(2200,2300),(3000,2000),(3100,2700),(2400,2900)],fill=(210,150,90),outline=(60,40,30))  # 꼬리
for y in range(2050,2900,4): d.line([(2450,y),(2950,y)],fill=(120,70,30))
im.save(sys.argv[1])`, IMG]);
const rafs = (p, n) => p.evaluate(n => new Promise(r => { let k = 0; const f = () => ++k >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);

(async () => {
  const browser = await chromium.launch(), errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true }), page = await ctx.newPage();
  await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto('file://' + TARGET);
  await page.setInputFiles('#imageFile', IMG); await page.waitForSelector('.workspace:not([hidden])'); await rafs(page, 3);
  // 꼬리에 타원 영역 하나, '외곽까지 흔들기'를 켠다(채움판 합성 경로를 타게)
  const box = await page.locator('#view').boundingBox(), P = (x, y) => [box.x + box.width * x, box.y + box.height * y];
  await page.locator('#ellipseMode').click();
  await page.mouse.move(...P(.68, .50)); await page.mouse.down(); await page.mouse.move(...P(.98, .73), { steps: 8 }); await page.mouse.up(); await rafs(page, 2);
  await page.evaluate(() => { const c = document.getElementById('tailCutoutInput'); if (c && !c.checked) c.click(); }); await rafs(page, 5);
  console.log('외곽까지 흔들기', await page.evaluate(() => document.getElementById('tailCutoutInput').checked), JSON.stringify(await page.evaluate(() => window.MotionPadDebug.state().renderer)));
  // 준비 동안 화면이 얼마나 굳는지: 프레임 사이 가장 긴 틈과 안내 문구가 보였는지 기록
  await page.evaluate(() => { const w = window.__probe = { gap: 0, seen: '', t0: 0, last: performance.now(), on: true };
    const f = now => { if (!w.on) return; w.gap = Math.max(w.gap, now - w.last); w.last = now;
      const a = document.getElementById('videoProgress').textContent, b = document.getElementById('viewerHint')?.textContent || ''; for (const s of [a, b]) if (/원본 그림을 준비/.test(s)) w.seen = s;
      requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await page.evaluate(() => { document.getElementById('videoDuration').value = '3'; document.getElementById('videoFPS').value = '15'; document.querySelector('input[name="videoSize"][value="orig"]').checked = true; });
  const t0 = Date.now(); let dl;
  if (LIVE) {
    await page.locator('#viewerBtn').click(); await rafs(page, 5);
    await page.locator('#recViewer').click();
    await page.waitForFunction(() => /녹화 중/.test(document.getElementById('viewerHint').textContent), null, { timeout: 120000 });
    console.log('준비 시간(누른 뒤 녹화 시작까지)', Date.now() - t0, 'ms');
    await page.waitForTimeout(4000);
    [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.locator('#recViewer').click()]);
  } else {
    await page.evaluate(() => document.querySelector('[data-dialog="videoDialog"]').click()); await rafs(page, 3);
    console.log('예상:', (await page.locator('#videoEstimate').innerText()).replace(/\n/g, ' / '));
    const p = page.waitForEvent('download', { timeout: 600000 });
    await page.locator('#exportVideoBtn').click();
    await page.waitForFunction(() => /영상 녹화|실패|못했/.test(document.getElementById('videoProgress').textContent), null, { timeout: 120000 });
    console.log('준비 시간(누른 뒤 녹화 시작까지)', Date.now() - t0, 'ms');
    dl = await p;
  }
  const probe = await page.evaluate(() => { const w = window.__probe; w.on = false; return { gap: Math.round(w.gap), seen: w.seen }; });
  console.log('안내 문구:', probe.seen || '(안 보임)', '· 가장 길게 굳은 시간', probe.gap, 'ms');
  const tmp = path.join(OUT, NAME + '.tmp'); await dl.saveAs(tmp);
  const file = path.join(OUT, NAME + (fs.readFileSync(tmp).subarray(4, 8).toString() === 'ftyp' ? '.mp4' : '.webm')); fs.renameSync(tmp, file);
  console.log('저장', dl.suggestedFilename(), fs.statSync(file).size, 'bytes');
  // 프레임 뽑기: <video>에 올려 캔버스로(ffmpeg 없음)
  const b64 = fs.readFileSync(file).toString('base64'), mime = file.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  const frame = await page.evaluate(async ({ b64, mime }) => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([u], { type: mime }));
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('영상 열기 실패')); });
    if (isFinite(v.duration) && v.duration > .6) { v.currentTime = Math.min(v.duration * .5, 1); await new Promise(r => v.onseeked = r); }
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
    return { w: c.width, h: c.height, png: c.toDataURL('image/png').split(',')[1] };
  }, { b64, mime });
  fs.writeFileSync(path.join(OUT, NAME + '.png'), Buffer.from(frame.png, 'base64'));
  console.log('프레임', frame.w + '×' + frame.h, '→', path.join(OUT, NAME + '.png'));
  console.log('오류', errors.length, errors.slice(0, 3));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
