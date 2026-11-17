// G-2 1단계: 연속 움직임 영상의 끝·처음 이음매가 얼마나 티 나는지. 꼬리(바람)·몸체 호흡이 있는 그림을 4초 영상으로 저장하고
// 끝 직전·끝·처음 프레임을 나란히 붙여 본다. node tools/motion/loop_seam.js → docs/progress/img/G-loop-seam.png, tools/motion/out/loop/seam.mp4
'use strict';
const { chromium } = require('playwright');require('../baseline/detail_mode');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '../..'), OUT = path.join(__dirname, 'out/loop');
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(ROOT, 'tools/baseline/fixtures/character.png');
const proj = { format: 'motionpad-project', version: 2, image: 'data:image/png;base64,' + fs.readFileSync(FIX).toString('base64'), audio: null,
  zones: [{ name: '꼬리', kind: 'ellipse', x: .78, y: .58, rx: .14, ry: .17, preset: 'tail', strength: 24, spring: 9, damping: 68, windStrength: 80, windSpeed: 1.1, windDelay: 65, pivotEnabled: true, pivotX: .68, pivotY: .7 }],
  extra: { ambient: { enabled: true, breath: 60, sway: 50, face: '', faceAmt: 50 } } };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); } catch (_) {} });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(ROOT, 'motionpad.html'));
  const pf = path.join(OUT, 'p.motionpad.json'); fs.writeFileSync(pf, JSON.stringify(proj));
  await page.setInputFiles('#backupFile', pf); await page.waitForSelector('.workspace:not([hidden])'); await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('videoDuration').value = '4'; document.getElementById('videoFPS').value = '24'; document.querySelector('input[name="videoSize"][value="720"]').checked = true; });
  await page.evaluate(() => document.querySelector('[data-dialog="videoDialog"]').click());
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.evaluate(() => document.getElementById('exportVideoBtn').click())]);
  const file = path.join(OUT, 'seam.mp4'); await dl.saveAs(file);
  const b64 = fs.readFileSync(file).toString('base64');
  const frames = await page.evaluate(async b64 => {
    const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(new Blob([u], { type: 'video/mp4' }));
    await new Promise(r => v.onloadeddata = r);
    const out = [], c = document.createElement('canvas'); c.width = v.videoWidth / 2; c.height = v.videoHeight / 2; const g = c.getContext('2d');
    for (const t of [v.duration - .5, v.duration - .25, v.duration - .02, 0, .25]) { v.currentTime = Math.max(0, t); await new Promise(r => v.onseeked = r); g.drawImage(v, 0, 0, c.width, c.height); out.push(c.toDataURL('image/png').split(',')[1]); }
    return { d: v.duration, out };
  }, b64);
  frames.out.forEach((f, i) => fs.writeFileSync(path.join(OUT, `f${i}.png`), Buffer.from(f, 'base64')));
  await b.close();
  cp.execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
d=sys.argv[1];ims=[Image.open(f"{d}/f{i}.png").convert('RGB') for i in range(5)]
w,h=ims[0].size;out=Image.new('RGB',(w*5+40,h),(40,40,48))
for i,im in enumerate(ims): out.paste(im,(i*w+(40 if i>=3 else 0),0))
out.save(sys.argv[2])`, OUT, path.join(ROOT, 'docs/progress/img/G-loop-seam.png')]);
  console.log('길이', frames.d.toFixed(2), '초 →', 'docs/progress/img/G-loop-seam.png');
})();
