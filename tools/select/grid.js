#!/usr/bin/env node
// 1-B 측정: 선택 결과를 N×N 격자로 저장할 때 경계가 얼마나 어긋나는지, 저장 크기는 얼마인지.
//
//   node tools/select/grid.js [--images]
//   → 표 출력 + tools/select/out/grid.json (+ --images: tools/select/out/grid/ 확대 비교 그림)
//
// 앱의 흐름을 그대로 흉내 낸다.
//   선택 계산: 긴 변 768 그림에서 (selectionCosts / outlineCosts)
//   저장: 그 결과를 TILE×TILE(정사각, 그림 비율 무시)로 가장 가까운 칸 뽑기(selectionPreview와 같은 식) → runs
//   표시·움직임: TILE 마스크를 그림 크기로 부드럽게 늘림(캔버스·WebGL LINEAR) → 반투명 0.5 기준으로 안팎 판정
// 비교 기준:
//   합성 세트(614×768, 정답 있음): 정답과의 IoU. '768 그대로'가 지금 알고리즘이 낼 수 있는 상한.
//   실제 그림(원본 크기, 정답 없음): '768 계산 결과를 원본 크기로 바로 늘린 것'과의 차이.
//     경계 어긋남(px) = 서로 다른 픽셀 수 / 기준 경계 길이 → 경계가 평균 몇 원본 픽셀 밀렸는지.
//     잃은 넓이 = 기준에는 있는데 격자 저장 후 사라진 비율(가는 머리카락·손가락 끝 등).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('./bench.js');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');
const GRIDS = [384, 512, 768, 1024];
const wantImages = process.argv.includes('--images');
const core = B.loadCore(path.join(ROOT, 'src/js/select-core.js'));

function toGrid(bits, w, h, n) {
  const g = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++)
    g[y * n + x] = bits[Math.floor((y + 0.5) * h / n) * w + Math.floor((x + 0.5) * w / n)];
  return g;
}
// 부드럽게 늘리고(쌍선형) 0.5 기준으로 안팎 판정
function upsample(src, sw, sh, W, H) {
  const out = new Uint8Array(W * H), fx = new Float32Array(W), x0 = new Int32Array(W), x1 = new Int32Array(W);
  for (let X = 0; X < W; X++) {
    const sx = Math.min(sw - 1, Math.max(0, (X + 0.5) * sw / W - 0.5));
    x0[X] = Math.floor(sx); x1[X] = Math.min(sw - 1, x0[X] + 1); fx[X] = sx - x0[X];
  }
  for (let Y = 0; Y < H; Y++) {
    const sy = Math.min(sh - 1, Math.max(0, (Y + 0.5) * sh / H - 0.5)), y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
    const r0 = y0 * sw, r1 = y1 * sw;
    for (let X = 0; X < W; X++) {
      const a = src[r0 + x0[X]] * (1 - fx[X]) + src[r0 + x1[X]] * fx[X];
      const b = src[r1 + x0[X]] * (1 - fx[X]) + src[r1 + x1[X]] * fx[X];
      out[Y * W + X] = a * (1 - fy) + b * fy >= 0.5 ? 1 : 0;
    }
  }
  return out;
}
function boundary(m, W, H) {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (m[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !m[i - 1] || !m[i + 1] || !m[i - W] || !m[i + W])) n++;
  }
  return n;
}
function compare(ref, m, W, H) {
  let diff = 0, lost = 0, area = 0;
  for (let i = 0; i < ref.length; i++) { if (ref[i] !== m[i]) diff++; if (ref[i]) { area++; if (!m[i]) lost++; } }
  return { offset: diff / Math.max(1, boundary(ref, W, H)), lost: lost / Math.max(1, area) };
}
function runs(bits) {
  const r = []; let i = 0;
  while (i < bits.length) { if (!bits[i]) { i++; continue; } const s = i; while (i < bits.length && bits[i]) i++; r.push([s, i - s]); }
  return r;
}
// 영역 테두리 상자만 원본 해상도로 저장할 때(REVIEW 1-B 안)의 runs
function boxRuns(bits, W, H) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let i = 0; i < bits.length; i++) if (bits[i]) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { box: [0, 0, 0, 0], runs: [] };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, b = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) b.set(bits.subarray((y0 + y) * W + x0, (y0 + y) * W + x1 + 1), y * bw);
  return { box: [x0, y0, bw, bh], runs: runs(b) };
}
const kb = (v) => (v / 1024).toFixed(1);

function prepare(file) {
  const dir = path.join(OUT, 'real-src');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, path.basename(file).replace(/\.\w+$/, '') + '.png');
  if (!fs.existsSync(out) || fs.statSync(out).mtimeMs < fs.statSync(file).mtimeMs) {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
r = min(1, 768 / max(im.size))
im.resize((max(2, round(im.width * r)), max(2, round(im.height * r))), Image.BILINEAR).save(sys.argv[2])`, file, out]);
  }
  const size = execFileSync('python3', ['-I', '-c', 'import sys\nfrom PIL import Image\nprint(*Image.open(sys.argv[1]).size)', file]).toString().trim().split(' ').map(Number);
  return { img: B.readPNG(out), W: size[0], H: size[1] };
}

const result = { grids: GRIDS, synthetic: [], real: [] };

// ── 합성 세트: 정답 대비 IoU ──
if (!fs.existsSync(path.join(B.SET, 'scenarios.json'))) execFileSync('python3', [path.join(__dirname, 'make_set.py')], { stdio: 'inherit' });
const scen = JSON.parse(fs.readFileSync(path.join(B.SET, 'scenarios.json'), 'utf8'));
for (const style of scen.styles) {
  const image = B.readPNG(path.join(B.SET, style, 'image.png')), { width: w, height: h } = image;
  const graph = core.selectionGraph(image.rgba, w, h);
  const gtOf = (t) => { const g = B.readPNG(path.join(B.SET, style, `gt-${t}.png`)).rgba, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = g[i * 4]; return m; };
  const cases = [];
  for (const s of scen.wand) {
    const seed = Math.min(h - 1, Math.floor(s.point[1] * h)) * w + Math.min(w - 1, Math.floor(s.point[0] * w));
    const map = core.selectionCosts(graph, [seed], null, true), lim = core.wandLimit(core.initialWandRange(map, 30));
    cases.push({ name: 'w-' + s.name, gt: gtOf(`w-${s.name}`), bits: map.map((v) => (v <= lim ? 1 : 0)) });
  }
  for (const s of scen.outline) {
    const lasso = B.lassoMask(s.points, w, h), map = core.outlineCosts(graph, lasso, [], []);
    const th = core.outlineThreshold(0, map.some((v) => v > 1 && v < 256));
    cases.push({ name: 'o-' + s.name, gt: gtOf(`o-${s.name}`).map((v, i) => (lasso[i] ? v : v === 128 ? 128 : 0)), bits: map.map((v, i) => (lasso[i] && v >= th ? 1 : 0)) });
  }
  for (const c of cases) {
    const row = { style, name: c.name, full: B.score((i) => c.bits[i], c.gt).iou };
    for (const n of GRIDS) { const up = upsample(toGrid(c.bits, w, h, n), n, n, w, h); row[n] = B.score((i) => up[i], c.gt).iou; }
    result.synthetic.push(row);
  }
}

// ── 실제 그림: 원본 크기 기준 경계 어긋남·잃은 넓이·저장 크기 ──
const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'real.json'), 'utf8'));
for (const item of real.images) {
  const { img, W, H } = prepare(path.join(ROOT, item.file)), { width: w, height: h } = img;
  const graph = core.selectionGraph(img.rgba, w, h), stem = path.basename(item.file).replace(/\.\w+$/, '');
  const cases = [];
  for (const s of item.wand) {
    const seed = Math.min(h - 1, Math.floor(s.point[1] * h)) * w + Math.min(w - 1, Math.floor(s.point[0] * w));
    const map = core.selectionCosts(graph, [seed], null, true), lim = core.wandLimit(core.initialWandRange(map, 30));
    cases.push({ tool: '마술봉', name: s.name, bits: map.map((v) => (v <= lim ? 1 : 0)) });
  }
  for (const s of item.outline) {
    const lasso = B.lassoMask(s.points, w, h), map = core.outlineCosts(graph, lasso, [], []);
    const th = core.outlineThreshold(0, map.some((v) => v > 1 && v < 256));
    cases.push({ tool: '범위지정', name: s.name, bits: map.map((v, i) => (lasso[i] && v >= th ? 1 : 0)) });
  }
  for (const c of cases) {
    const ref = upsample(c.bits, w, h, W, H);
    const row = { image: stem, size: [W, H], tool: c.tool, name: c.name, area: ref.reduce((a, b) => a + b, 0), grid: {} };
    const ups = {};
    for (const n of GRIDS) {
      const g = toGrid(c.bits, w, h, n);
      ups[n] = upsample(g, n, n, W, H);
      row.grid[n] = { ...compare(ref, ups[n], W, H), json: JSON.stringify(runs(g)).length };
    }
    const br = boxRuns(ref, W, H);
    row.box = { box: br.box, json: JSON.stringify(br.runs).length };
    result.real.push(row);
    if (wantImages) c.ref = ref, c.ups = ups;
  }
  if (wantImages) item.cases = cases, item.W = W, item.H = H;
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'grid.json'), JSON.stringify(result, null, 1));

// ── 표 ──
const pct = (v) => (v * 100).toFixed(1).padStart(6);
console.log('\n## 합성 세트: 정답 대비 IoU % (768 그대로 / 격자 N으로 저장 후)');
console.log('화풍'.padEnd(10) + '768그대로' + GRIDS.map((n) => String(n).padStart(8)).join(''));
for (const style of scen.styles) {
  const rows = result.synthetic.filter((r) => r.style === style), m = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  console.log(style.padEnd(10) + pct(m('full')).padStart(9) + GRIDS.map((n) => pct(m(n)).padStart(8)).join(''));
}
{ const m = (k) => result.synthetic.reduce((a, r) => a + r[k], 0) / result.synthetic.length; console.log('평균'.padEnd(10) + pct(m('full')).padStart(9) + GRIDS.map((n) => pct(m(n)).padStart(8)).join('')); }

console.log('\n## 실제 그림(원본 크기): 경계 어긋남 원본px / 잃은 넓이 % / runs 크기 KB');
console.log('그림·대상'.padEnd(22) + GRIDS.map((n) => `${n}`.padStart(20)).join('') + '   상자만 원본해상도');
for (const r of result.real) {
  console.log(`${r.image} ${r.tool} ${r.name}`.padEnd(22) + GRIDS.map((n) => {
    const g = r.grid[n]; return `${g.offset.toFixed(2)}px ${(g.lost * 100).toFixed(1)}% ${kb(g.json)}`.padStart(20);
  }).join('') + `   ${kb(r.box.json)}KB`);
}
const avg = (f) => result.real.reduce((a, r) => a + f(r), 0) / result.real.length;
console.log('평균'.padEnd(22) + GRIDS.map((n) => `${avg((r) => r.grid[n].offset).toFixed(2)}px ${(avg((r) => r.grid[n].lost) * 100).toFixed(1)}% ${kb(avg((r) => r.grid[n].json))}`.padStart(20)).join('') + `   ${kb(avg((r) => r.box.json))}KB`);

// ── 확대 비교 그림: 원본 크기에서 경계가 가장 긴 부분 주변 ──
if (wantImages) {
  const dir = path.join(OUT, 'grid'); fs.mkdirSync(dir, { recursive: true });
  const manifest = [];
  for (const item of real.images) for (const c of item.cases) {
    const stem = path.basename(item.file).replace(/\.\w+$/, '');
    const file = path.join(dir, `${stem}-${c.tool}-${c.name}.bin`);
    // 원본 크기 마스크 3개(768 그대로·384·1024)를 python이 원본 그림 위에 그린다
    fs.writeFileSync(file, Buffer.concat([Buffer.from(c.ref), Buffer.from(c.ups[384]), Buffer.from(c.ups[1024])]));
    manifest.push({ src: path.join(ROOT, item.file), bin: file, W: item.W, H: item.H, label: `${stem} ${c.tool} ${c.name}` });
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
}
