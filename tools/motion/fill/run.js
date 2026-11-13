#!/usr/bin/env node
// 빈자리 메우기 비교 측정.
//   python3 tools/motion/fill/make_cases.py        (시험 세트, 한 번)
//   node tools/motion/fill/run.js [방식 ...]        → 표 + tools/motion/out/fill/results.json + 결과 그림(.bin)
//   python3 tools/motion/fill/sheet.py             → 비교 그림(tools/motion/out/fill/sheet-*.png)
// 채점: 정답(물체를 붙이기 전 배경)과의 색 차이 평균(0~255). 화면에 드러나는 띠만 잰다.
//   near = 가장자리에서 그림 크기의 2%까지(자주 보임), far = 2~5.5%(크게 움직일 때만), rest = 가만히 있을 때도 보이는 테두리 2칸.
//   결 = 밝기 변화량(무늬·선)의 차이. 번져서 무늬가 사라지거나 없던 줄무늬가 생기면 커진다.
'use strict';
const fs = require('fs'), path = require('path');
const A = require('./algos.js');
const OUT = path.resolve(__dirname, '../out/fill'), CASES = path.join(OUT, 'cases');

const METHODS = {
  current: (d, c) => A.fillCurrent(d, c.inside, c.w, c.h, c.nearby),
  smooth: (d, c) => A.fillSmooth(d, c.inside, c.w, c.h),
  patch: (d, c) => A.fillPatch(d, c.inside, c.w, c.h, {}),
  'patch-old': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { local: 0, sharp: .75 }),
  'patch-l15': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { local: .15 }),
  'patch-deep': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { minSize: 20 }),
  'patch-ng': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { guide: 0 }),
  'patch-g3': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { guide: 3 }),
  'patch-m80': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { minSize: 80 }),
  'patch-hf': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { top: 1, em: 3, pm: 3 }),
  'patch-band': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { band: Math.ceil(.06 * Math.max(c.w, c.h)) }),
  'patch-half': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { top: 1 }),
  'patch-fast': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { em: 3, pm: 2 }),
  'patch-p5': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { patch: 5 }),
  'patch-p9': (d, c) => A.fillPatch(d, c.inside, c.w, c.h, { patch: 9 }),
};
const want = process.argv.slice(2).filter(a => !a.startsWith('--'));
const names = want.length ? want : ['current', 'smooth', 'patch'];
const REPEAT = process.argv.includes('--once') ? 1 : 3;

function load(dir) {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')), rd = f => new Uint8Array(fs.readFileSync(path.join(dir, f + '.bin')));
  return { ...m, image: rd('image'), truth: rd('truth'), inside: rd('inside'), nearby: rd('nearby'), band: rd('band'), raw: rd('raw') };
}
function grad(data, w, h) {
  const l = new Float32Array(w * h), g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) l[i] = .299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; g[i] = Math.hypot(l[i + 1] - l[i - 1], l[i + w] - l[i - w]) / 2; }
  return g;
}
function score(c, out) {
  const { w, h } = c, gt = grad(c.truth, w, h), go = grad(out, w, h);
  const s = { near: 0, far: 0, rest: 0, tex: 0 }, n = { near: 0, far: 0, rest: 0, tex: 0 };
  for (let i = 0; i < w * h; i++) {
    if (!c.inside[i]) continue;
    const p = i * 4, e = (Math.abs(out[p] - c.truth[p]) + Math.abs(out[p + 1] - c.truth[p + 1]) + Math.abs(out[p + 2] - c.truth[p + 2])) / 3;
    if (c.band[i] === 1) { s.near += e; n.near++; } else if (c.band[i] === 2) { s.far += e; n.far++; }
    if (c.band[i]) { s.tex += Math.abs(go[i] - gt[i]); n.tex++; }
    if (!c.raw[i]) { s.rest += (Math.abs(out[p] - c.image[p]) + Math.abs(out[p + 1] - c.image[p + 1]) + Math.abs(out[p + 2] - c.image[p + 2])) / 3; n.rest++; }
  }
  return Object.fromEntries(Object.keys(s).map(k => [k, n[k] ? +(s[k] / n[k]).toFixed(2) : 0]));
}

const dirs = fs.readdirSync(CASES).sort().map(d => path.join(CASES, d)).filter(d => fs.existsSync(path.join(d, 'meta.json')));
const results = {};
for (const name of names) {
  const rows = []; fs.mkdirSync(path.join(OUT, 'results', name), { recursive: true });
  for (const dir of dirs) {
    const c = load(dir); let out, best = Infinity;
    for (let r = 0; r < REPEAT; r++) { out = new Uint8ClampedArray(c.image); const t = process.hrtime.bigint(); METHODS[name](out, c); best = Math.min(best, Number(process.hrtime.bigint() - t) / 1e6); }
    fs.writeFileSync(path.join(OUT, 'results', name, c.name + '.bin'), out);
    rows.push({ case: c.name, ms: +best.toFixed(1), ...score(c, out) });
  }
  results[name] = rows;
}
const avg = (rows, k) => +(rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(2);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('case', 22) + names.map(n => pad(n + ' near/far/결/ms', 34)).join(''));
dirs.forEach((d, i) => console.log(pad(path.basename(d), 22) + names.map(n => { const r = results[n][i]; return pad(`${r.near} / ${r.far} / ${r.tex} / ${r.ms}`, 34); }).join('')));
for (const group of ['tight', 'loose', '']) {
  console.log(pad(group ? `평균(${group})` : '평균(전체)', 22) + names.map(n => { const rows = results[n].filter(r => r.case.endsWith(group)); return pad(`${avg(rows, 'near')} / ${avg(rows, 'far')} / ${avg(rows, 'tex')} / ${avg(rows, 'ms')}`, 34); }).join(''));
}
console.log(pad('가만히 있을 때 테두리', 22) + names.map(n => pad(`tight ${avg(results[n].filter(r => r.case.endsWith('tight')), 'rest')} · loose ${avg(results[n].filter(r => r.case.endsWith('loose')), 'rest')}`, 34)).join(''));
const file = path.join(OUT, 'results.json'), old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
fs.writeFileSync(file, JSON.stringify({ ...old, ...results }, null, 1));
