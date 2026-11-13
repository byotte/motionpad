// 큰 빈자리(몸체만 한 타원)에서의 시간. node tools/motion/fill/big.js
const fs = require('fs'), path = require('path'), A = require('./algos.js');
const dir = path.resolve(__dirname, '../out/fill/cases/001-1-tail-tight'), m = JSON.parse(fs.readFileSync(dir + '/meta.json'));
const truth = new Uint8Array(fs.readFileSync(dir + '/truth.bin')), { w, h } = m;
for (const [label, rx, ry] of [['그림의 3%', .1, .1], ['그림의 12%', .2, .2], ['그림의 30%', .31, .31]]) {
  const inside = new Uint8Array(w * h); let n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (((x / w - .5) / rx) ** 2 + ((y / h - .5) / ry) ** 2 < 1) { inside[y * w + x] = 1; n++; }
  const run = (name, f) => { const d = new Uint8ClampedArray(truth), t = process.hrtime.bigint(); f(d); return name + ' ' + (Number(process.hrtime.bigint() - t) / 1e6).toFixed(0) + 'ms'; };
  const band = Math.ceil(.06 * Math.max(w, h));
  console.log(label, (100 * n / w / h).toFixed(1) + '%', [
    run('지금', d => A.fillCurrent(d, inside, w, h, inside)), run('부드럽게', d => A.fillSmooth(d, inside, w, h)),
    run('조각', d => A.fillPatch(d, inside, w, h, {})), run('조각+띠만', d => A.fillPatch(d, inside, w, h, { band })),
    run('조각 절반크기', d => A.fillPatch(d, inside, w, h, { top: 1, em: 3, pm: 3 })), run('조각 절반크기+띠만', d => A.fillPatch(d, inside, w, h, { top: 1, em: 3, pm: 3, band })),
  ].join(' | '));
}
