#!/usr/bin/env node
// 실제 그림 시험(정답 없음, 눈으로 판정). tools/select/real.json의 누를 곳·둘러쌀 곳을 이전/지금 계산 함수로 돌려
// 나란히 그린 그림을 만든다.
//
//   node tools/select/try.js [--old tools/select/core-0.5.js] [--new src/js/select-core.js]
//   → tools/select/out/real/<그림>-<도구>-<이름>.png  (왼쪽 이전, 오른쪽 지금. 초록=선택, 노랑=올가미, 빨강=누른 곳)
// 그림은 앱과 같이 긴 변 768로 줄여 계산한다(줄인 PNG는 out/real-src/에 캐시).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('./bench.js');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out', 'real');
const SRC = path.join(__dirname, 'out', 'real-src');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const cores = [['이전', opt('--old', path.join(__dirname, 'core-0.5.js'))], ['지금', opt('--new', path.join(ROOT, 'src/js/select-core.js'))]]
  .map(([label, f]) => [label, B.loadCore(path.resolve(f))]);

function prepare(file) {
  fs.mkdirSync(SRC, { recursive: true });
  const out = path.join(SRC, path.basename(file).replace(/\.\w+$/, '') + '.png');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(file).mtimeMs) {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
r = min(1, 768 / max(im.size))
im.resize((max(2, round(im.width * r)), max(2, round(im.height * r))), Image.BILINEAR).save(sys.argv[2])`, file, out]);
  }
  return B.readPNG(out);
}

function draw(img, sel, lasso, point) {
  const { width: w, height: h, rgba } = img, rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    let r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    if (sel[i]) { r = r * 0.45; g = g * 0.45 + 140; b = b * 0.45 + 70; } else { r *= 0.6; g *= 0.6; b *= 0.6; }
    if (lasso && lasso[i] && (!lasso[i - 1] || !lasso[i + 1] || !lasso[i - w] || !lasso[i + w])) { r = 255; g = 220; b = 0; }
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  if (point) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const x = Math.round(point[0] * w) + dx, y = Math.round(point[1] * h) + dy;
    if (x >= 0 && y >= 0 && x < w && y < h && dx * dx + dy * dy <= 16) rgb.set([255, 40, 40], (y * w + x) * 3);
  }
  return rgb;
}
function sideBySide(file, w, h, pics) {
  const gap = 8, W = w * pics.length + gap * (pics.length - 1), out = Buffer.alloc(W * h * 3, 255);
  pics.forEach((p, k) => { for (let y = 0; y < h; y++) p.copy(out, (y * W + k * (w + gap)) * 3, y * w * 3, (y + 1) * w * 3); });
  B.writePNG(file, W, h, out);
}

const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'real.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
for (const item of real.images) {
  const img = prepare(path.join(ROOT, item.file)), { width: w, height: h } = img;
  const stem = path.basename(item.file).replace(/\.\w+$/, '');
  const graphs = cores.map(([, core]) => core.selectionGraph(img.rgba, w, h));
  for (const s of item.wand || []) {
    const seed = Math.min(h - 1, Math.floor(s.point[1] * h)) * w + Math.min(w - 1, Math.floor(s.point[0] * w));
    const pics = cores.map(([label, core], k) => {
      const t = Date.now(), map = core.selectionCosts(graphs[k], [seed], null, true), range = core.initialWandRange(map, 30), lim = core.wandLimit(range);
      const sel = Uint8Array.from(map, (c) => c <= lim);
      console.log(`${stem} 마술봉 ${s.name} [${label}] 범위 ${range}, ${sel.reduce((a, b) => a + b, 0)}px, ${Date.now() - t}ms`);
      return draw(img, sel, null, s.point);
    });
    sideBySide(path.join(OUT, `${stem}-wand-${s.name}.png`), w, h, pics);
  }
  for (const s of item.outline || []) {
    const lasso = B.lassoMask(s.points, w, h);
    const pics = cores.map(([label, core], k) => {
      const t = Date.now(), map = core.outlineCosts(graphs[k], lasso, [], []);
      const th = core.outlineThreshold(0, map.some((v) => v > 1 && v < 256));
      const sel = Uint8Array.from(map, (c, i) => lasso[i] && c >= th);
      console.log(`${stem} 간략 ${s.name} [${label}] ${sel.reduce((a, b) => a + b, 0)}px, ${Date.now() - t}ms`);
      return draw(img, sel, lasso, null);
    });
    sideBySide(path.join(OUT, `${stem}-outline-${s.name}.png`), w, h, pics);
  }
}
