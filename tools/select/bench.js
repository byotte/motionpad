#!/usr/bin/env node
// 선택 엔진 채점기 (1-A). 브라우저 없이 src/js/select-core.js 의 계산 함수를 직접 돌린다.
//
//   node tools/select/bench.js [이름]                  결과 → tools/select/out/<이름>.json (+ 표 출력)
//   node tools/select/bench.js 이름 --core 파일.js     다른 버전의 계산 함수로 채점
//   node tools/select/bench.js 이름 --base 기준이름    기준 결과와 나란히 비교
//   node tools/select/bench.js 이름 --images           결과 그림 저장(초록=맞음, 빨강=넘침, 파랑=빠짐)
//
// 채점: IoU(정답과 겹친 넓이 / 합친 넓이, 1이 완벽). 정답 마스크의 회색(128) 픽셀은 제외.
// - 마술봉: 한 번 눌렀을 때(앱이 자동으로 고른 범위) 점수와, 범위 슬라이더로 얻을 수 있는 최고 점수.
// - 간략 범위지정: 둘러싼 직후(범위 0) 점수와, 범위 슬라이더(-24~24)로 얻을 수 있는 최고 점수.
//   정답은 '둘러싼 안에 온전히 들어온 부위'(올가미가 가로지른 부위는 원하지 않은 것으로 본다).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../..');
const SET = path.join(HERE, 'set');
const OUT = path.join(HERE, 'out');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const name = args[0] && !args[0].startsWith('--') ? args[0] : 'latest';
const coreFile = path.resolve(opt('--core') || path.join(ROOT, 'src/js/select-core.js'));
const baseName = opt('--base');
const wantImages = args.includes('--images');

// ── PNG 읽기·쓰기 (8비트, 비월형만) ──
function readPNG(file) {
  const buf = fs.readFileSync(file);
  let pos = 8, width, height, type, idat = [], palette = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || data[12]) throw new Error(`${file}: 8비트 비월형 PNG만 지원`);
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type], stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[o + x - ch] : 0, b = y ? px[o - stride + x] : 0, c = x >= ch && y ? px[o - stride + x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[o + x] = v & 255;
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    let r, g, b, al = 255;
    if (type === 0) r = g = b = px[i];
    else if (type === 4) { r = g = b = px[i * 2]; al = px[i * 2 + 1]; }
    else if (type === 3) { const k = px[i] * 3; r = palette[k]; g = palette[k + 1]; b = palette[k + 2]; }
    else { r = px[i * ch]; g = px[i * ch + 1]; b = px[i * ch + 2]; if (ch === 4) al = px[i * 4 + 3]; }
    rgba.set([r, g, b, al], i * 4);
  }
  return { width, height, rgba };
}
function writePNG(file, width, height, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (kind, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(kind), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(body)); return Buffer.concat([len, body, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rgb.copy ? rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3) : raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

// ── 계산 함수 불러오기 ──
function loadCore(file) {
  const ctx = {};
  vm.createContext(ctx);
  const names = ['selectionGraph', 'selectionCosts', 'outlineCosts', 'initialWandRange', 'wandLimit', 'outlineThreshold'];
  vm.runInContext(fs.readFileSync(file, 'utf8') + `\n;({${names.join(',')}})`, ctx);
  return vm.runInContext(`({${names.join(',')}})`, ctx);
}

function lassoMask(points, w, h) {
  // 픽셀 중심이 다각형 안이면 1 (앱의 canvas 채우기 + alpha≥128과 사실상 같다)
  const m = new Uint8Array(w * h), pts = points.map(([x, y]) => [x * w, y * h]);
  for (let y = 0; y < h; y++) {
    const cy = y + 0.5, xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= cy) !== (y1 <= cy)) xs.push(x0 + (cy - y0) / (y1 - y0) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x < Math.min(w, Math.ceil(xs[k + 1] - 0.5)); x++) m[y * w + x] = 1;
  }
  return m;
}
function score(pred, gt) {
  let inter = 0, uni = 0, extra = 0, miss = 0;
  for (let i = 0; i < gt.length; i++) {
    if (gt[i] === 128) continue;
    const p = pred(i), g = gt[i] === 255;
    if (p && g) inter++; if (p || g) uni++; if (p && !g) extra++; if (!p && g) miss++;
  }
  return { iou: uni ? inter / uni : 1, extra, miss };
}
function picture(file, image, gt, pred, w, h, lasso) {
  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    const p = pred(i), g = gt[i];
    let r = image.rgba[i * 4] * 0.45 + 140 * 0.55, gg = image.rgba[i * 4 + 1] * 0.45 + 140 * 0.55, b = image.rgba[i * 4 + 2] * 0.45 + 140 * 0.55;
    if (g !== 128) {
      if (p && g === 255) { r = r * 0.4; gg = gg * 0.4 + 150; b = b * 0.4 + 60; }
      else if (p) { r = r * 0.3 + 200; gg *= 0.3; b *= 0.3; }
      else if (g === 255) { r *= 0.3; gg = gg * 0.3 + 60; b = b * 0.3 + 220; }
    }
    if (lasso && lasso[i] && (!lasso[i - 1] || !lasso[i + 1] || !lasso[i - w] || !lasso[i + w])) { r = 255; gg = 220; b = 0; }
    out[i * 3] = r; out[i * 3 + 1] = gg; out[i * 3 + 2] = b;
  }
  writePNG(file, w, h, out);
}

function run() {
  if (!fs.existsSync(path.join(SET, 'scenarios.json'))) execFileSync('python3', [path.join(HERE, 'make_set.py')], { stdio: 'inherit' });
  const scen = JSON.parse(fs.readFileSync(path.join(SET, 'scenarios.json'), 'utf8'));
  const core = loadCore(coreFile);
  const result = { name, core: path.relative(ROOT, coreFile), date: new Date().toISOString(), wand: {}, outline: {} };
  const imgDir = path.join(OUT, name);
  if (wantImages) fs.mkdirSync(imgDir, { recursive: true });
  for (const style of scen.styles) {
    const image = readPNG(path.join(SET, style, 'image.png'));
    const { width: w, height: h } = image;
    const gtOf = (t) => { const g = readPNG(path.join(SET, style, `gt-${t}.png`)).rgba, m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = g[i * 4]; return m; };
    let t0 = Date.now();
    const graph = core.selectionGraph(image.rgba, w, h);
    const graphMs = Date.now() - t0;
    for (const s of scen.wand) {
      const gt = gtOf(`w-${s.name}`);
      const seed = Math.min(h - 1, Math.floor(s.point[1] * h)) * w + Math.min(w - 1, Math.floor(s.point[0] * w));
      t0 = Date.now();
      const map = core.selectionCosts(graph, [seed], null, true);
      const range = core.initialWandRange(map, 30);
      const ms = Date.now() - t0;
      const at = (r) => { const lim = core.wandLimit(r); return (i) => map[i] <= lim; };
      const one = score(at(range), gt);
      let best = { iou: -1 };
      for (let r = 2; r <= 128; r++) { const sc = score(at(r), gt); if (sc.iou > best.iou) best = { ...sc, range: r }; }
      (result.wand[s.name] ??= {})[style] = { range, iou: one.iou, extra: one.extra, miss: one.miss, best: best.iou, bestRange: best.range, ms };
      if (wantImages) picture(path.join(imgDir, `wand-${s.name}-${style}.png`), image, gt, at(range), w, h);
    }
    for (const s of scen.outline) {
      const lasso = lassoMask(s.points, w, h);
      const gt = gtOf(`o-${s.name}`).map((v, i) => (lasso[i] ? v : v === 128 ? 128 : 0));
      t0 = Date.now();
      const map = core.outlineCosts(graph, lasso, [], []);
      const ms = Date.now() - t0;
      const hasBoundary = map.some((v) => v > 1 && v < 256);
      const at = (r) => { const th = core.outlineThreshold(r, hasBoundary); return (i) => lasso[i] && map[i] >= th; };
      const one = score(at(0), gt);
      let best = { iou: -1 };
      for (let r = -24; r <= 24; r++) { const sc = score(at(r), gt); if (sc.iou > best.iou) best = { ...sc, range: r }; }
      (result.outline[s.name] ??= {})[style] = { iou: one.iou, extra: one.extra, miss: one.miss, best: best.iou, bestRange: best.range, ms };
      if (wantImages) picture(path.join(imgDir, `outline-${s.name}-${style}.png`), image, gt, at(0), w, h, lasso);
    }
    result.graphMs = Math.max(result.graphMs || 0, graphMs);
  }
  // 요약: 한 번에(자동 범위·범위 0) 평균, 슬라이더 최선 평균
  const avg = (kind, key) => { const v = Object.values(result[kind]).flatMap((o) => Object.values(o).map((r) => r[key])); return v.reduce((a, b) => a + b, 0) / v.length; };
  result.summary = { wandOne: avg('wand', 'iou'), wandBest: avg('wand', 'best'), outlineOne: avg('outline', 'iou'), outlineBest: avg('outline', 'best'), wandMs: avg('wand', 'ms'), outlineMs: avg('outline', 'ms') };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(result, null, 1));
  return { result, styles: scen.styles };
}

function table({ result, styles }, base) {
  const f = (v) => (v * 100).toFixed(0).padStart(3);
  const cell = (r, b, key) => (b ? `${f(b[key])}→${f(r[key])}` : f(r[key]));
  for (const [kind, title] of [['wand', '마술봉 (한 번 누름 / 슬라이더 최선)'], ['outline', '간략 범위지정 (범위 0 / 슬라이더 최선)']]) {
    console.log(`\n## ${title}  IoU %`);
    console.log('대상'.padEnd(12) + styles.map((s) => s.padStart(base ? 20 : 12)).join(''));
    for (const [n, row] of Object.entries(result[kind])) {
      console.log(n.padEnd(12) + styles.map((s) => {
        const r = row[s], b = base?.[kind]?.[n]?.[s];
        return `${cell(r, b, 'iou')} /${cell(r, b, 'best')}`.padStart(base ? 20 : 12);
      }).join(''));
    }
  }
  const s = result.summary, b = base?.summary;
  const line = (label, key, pct = true) => console.log(`${label.padEnd(22)}${b ? (pct ? (b[key] * 100).toFixed(1) : b[key].toFixed(0)).padStart(8) + ' →' : ''}${(pct ? (s[key] * 100).toFixed(1) : s[key].toFixed(0)).padStart(8)}`);
  console.log('\n## 평균');
  line('마술봉 한 번 IoU %', 'wandOne'); line('마술봉 최선 IoU %', 'wandBest');
  line('간략 범위지정 범위0 IoU %', 'outlineOne'); line('간략 범위지정 최선 IoU %', 'outlineBest');
  line('마술봉 계산 ms', 'wandMs', false); line('간략 범위지정 계산 ms', 'outlineMs', false);
}

if (require.main === module) {
  const res = run();
  const base = baseName ? JSON.parse(fs.readFileSync(path.join(OUT, `${baseName}.json`), 'utf8')) : null;
  table(res, base);
}
module.exports = { readPNG, writePNG, loadCore, lassoMask, score, SET };
