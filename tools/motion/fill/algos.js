// 빈자리 메우기 후보들 (측정용). 브라우저·node 어디서나 도는 순수 JS(캔버스 없음).
// 공통 약속: data = RGBA Uint8ClampedArray(작업 크기 w×h), inside[i] = 1이면 메울 칸. data를 그 자리에서 고친다.
'use strict';

// ── 0. 지금 방식(src/js/masks.js buildBackgroundPlate의 계산 부분을 그대로 옮김) ──
function accumulateBackgroundLine(data, inside, totals, start, stride, length) {
  let index = 0;
  while (index < length) {
    if (!inside[start + index * stride]) { index++; continue; }
    const first = index;
    while (index < length && inside[start + index * stride]) index++;
    const before = first > 0 ? (start + (first - 1) * stride) * 4 : -1;
    const after = index < length ? (start + index * stride) * 4 : -1;
    if (before < 0 && after < 0) continue;
    for (let k = first; k < index; k++) {
      const left = k - first + 1, right = index - k;
      const blend = before < 0 ? 1 : after < 0 ? 0 : left / (left + right);
      const weight = 1 / (before < 0 ? right : after < 0 ? left : Math.min(left, right));
      const a = before < 0 ? after : before, b = after < 0 ? before : after;
      const alphaA = (1 - blend) * data[a + 3] / 255, alphaB = blend * data[b + 3] / 255;
      const p = (start + k * stride) * 5;
      for (let c = 0; c < 3; c++) totals[p + c] += weight * (alphaA * data[a + c] + alphaB * data[b + c]);
      totals[p + 3] += weight * (alphaA + alphaB);
      totals[p + 4] += weight;
    }
  }
}
function fillCurrent(data, inside, w, h, nearby) {
  const size = w * h; let count = 0, nearCount = 0, visibleCount = 0;
  const sum = [0, 0, 0, 0], squares = [0, 0, 0, 0], visible = [0, 0, 0, 0];
  for (let i = 0; i < size; i++) {
    const p = i * 4;
    if (inside[i]) { count++; continue; }
    visibleCount++;
    for (let c = 0; c < 4; c++) visible[c] += data[p + c];
    if (!nearby[i]) continue;
    nearCount++;
    for (let c = 0; c < 4; c++) { const v = data[p + c]; sum[c] += v; squares[c] += v * v; }
  }
  if (!count || !visibleCount) return;
  const nearbyMean = nearCount ? sum.map(v => v / nearCount) : null;
  const flat = nearbyMean && squares.every((sq, i) => sq / nearCount - nearbyMean[i] ** 2 < 36);
  if (flat) { for (let i = 0; i < size; i++) if (inside[i]) data.set(nearbyMean, i * 4); return; }
  const totals = new Float32Array(size * 5);
  for (let y = 0; y < h; y++) accumulateBackgroundLine(data, inside, totals, y * w, 1, w);
  for (let x = 0; x < w; x++) accumulateBackgroundLine(data, inside, totals, x, w, h);
  const fallback = nearbyMean || visible.map(v => v / visibleCount);
  for (let i = 0; i < size; i++) {
    if (!inside[i]) continue;
    const p = i * 5, k = i * 4, weight = totals[p + 4], alpha = totals[p + 3];
    if (!weight) { data.set(fallback, k); continue; }
    for (let c = 0; c < 3; c++) data[k + c] = alpha ? totals[p + c] / alpha : 0;
    data[k + 3] = 255 * alpha / weight;
  }
}

// ── 1·2. 앱이 쓰는 것과 같은 코드(src/js/fill.js)를 그대로 불러 쓴다 ──
const APP = new Function(require('fs').readFileSync(require('path').resolve(__dirname, '../../../src/js/fill.js'), 'utf8') + '\nreturn { smoothFillF, patchFillSteps };')();
const smoothFillF = APP.smoothFillF;
function toFloat(data, n) { const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = data[i * 4]; c[i * 3 + 1] = data[i * 4 + 1]; c[i * 3 + 2] = data[i * 4 + 2]; } return c; }
function fromFloat(col, data, inside, n) { for (let i = 0; i < n; i++) if (inside[i]) { data[i * 4] = col[i * 3]; data[i * 4 + 1] = col[i * 3 + 1]; data[i * 4 + 2] = col[i * 3 + 2]; data[i * 4 + 3] = 255; } }
function fillSmooth(data, inside, w, h) {
  const n = w * h, col = toFloat(data, n), known = new Uint8Array(n);
  for (let i = 0; i < n; i++) known[i] = inside[i] ? 0 : 1;
  smoothFillF(col, known, w, h, 3);
  fromFloat(col, data, inside, n);
}
// opts는 src/js/fill.js patchFillSteps 설명 참고
function fillPatch(data, inside, w, h, opts = {}) {
  const col = toFloat(data, w * h);
  for (const _ of APP.patchFillSteps(col, inside, w, h, opts)) { /* 측정에서는 쉬지 않고 끝까지 */ }
  fromFloat(col, data, inside, w * h);
}

const api = { fillCurrent, fillSmooth, fillPatch, smoothFillF };
if (typeof module !== 'undefined') module.exports = api;
