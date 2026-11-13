// 2-M 빈자리 메우기. 캔버스를 쓰지 않는 순수 계산(측정 도구 tools/motion/fill 이 이 파일을 그대로 불러 쓴다).
// 1) smoothFillF: 사방의 색이 고르게 스며들게 한다(즉시). 2) patchFillSteps: 둘레와 닮은 조각을 찾아 붙인다(나눠서 계산).

// col: Float32Array(n*C), known[i]=1이면 아는 칸. 모르는 칸을 채운다. 절반 크기로 줄여 채운 뒤 키우고, 이웃 평균으로 다듬는다.
function smoothFillF(col, known, w, h, C = 3, relax = 3) {
  const n = w * h; let holes = 0;
  for (let i = 0; i < n; i++) if (!known[i]) holes++;
  if (!holes || holes === n) return;
  if (w > 1 || h > 1) {
    const cw = (w + 1) >> 1, ch = (h + 1) >> 1, cc = new Float32Array(cw * ch * C), ck = new Uint8Array(cw * ch), cnt = new Uint8Array(cw * ch);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!known[i]) continue;
      const j = (y >> 1) * cw + (x >> 1); for (let k = 0; k < C; k++) cc[j * C + k] += col[i * C + k]; cnt[j]++;
    }
    for (let j = 0; j < cw * ch; j++) if (cnt[j]) { for (let k = 0; k < C; k++) cc[j * C + k] /= cnt[j]; ck[j] = 1; }
    smoothFillF(cc, ck, cw, ch, C, relax);
    for (let y = 0; y < h; y++) {
      const fy = (y + .5) / 2 - .5, y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(ch - 1, y0 + 1), ty = Math.min(1, Math.max(0, fy - y0));
      for (let x = 0; x < w; x++) {
        const i = y * w + x; if (known[i]) continue;
        const fx = (x + .5) / 2 - .5, x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(cw - 1, x0 + 1), tx = Math.min(1, Math.max(0, fx - x0));
        const a = (y0 * cw + x0) * C, b = (y0 * cw + x1) * C, c = (y1 * cw + x0) * C, d = (y1 * cw + x1) * C;
        for (let k = 0; k < C; k++) col[i * C + k] = (cc[a + k] * (1 - tx) + cc[b + k] * tx) * (1 - ty) + (cc[c + k] * (1 - tx) + cc[d + k] * tx) * ty;
      }
    }
  }
  for (let it = 0; it < relax; it++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (known[i]) continue;
    const l = x > 0 ? i - 1 : i, r = x < w - 1 ? i + 1 : i, u = y > 0 ? i - w : i, d = y < h - 1 ? i + w : i;
    for (let k = 0; k < C; k++) col[i * C + k] = .25 * (col[l * C + k] + col[r * C + k] + col[u * C + k] + col[d * C + k]);
  }
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function* patchFillSteps(col0, inside, w, h, opts = {}) {
  const P = opts.patch || 7, R = P >> 1, rnd = mulberry(opts.seed || 1);
  const minSize = opts.minSize || 40, EM = opts.em || 4, PM = opts.pm || 4, top = opts.top || 0;
  const guide = opts.guide === undefined ? 1 : opts.guide;
  const local = opts.local === undefined ? .3 : opts.local, sharp = opts.sharp === undefined ? .25 : opts.sharp;
  // 단계(피라미드) 만들기
  const levels = [{ w, h, col: col0, hole: Uint8Array.from(inside) }];
  let budget = 0;
  while (Math.min(levels[levels.length - 1].w, levels[levels.length - 1].h) / 2 >= minSize) {
    const f = levels[levels.length - 1], cw = (f.w + 1) >> 1, ch = (f.h + 1) >> 1;
    const col = new Float32Array(cw * ch * 3), hole = new Uint8Array(cw * ch), cnt = new Uint8Array(cw * ch), tot = new Uint8Array(cw * ch);
    for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
      const i = y * f.w + x, j = (y >> 1) * cw + (x >> 1); tot[j]++;
      if (f.hole[i]) continue;
      col[j * 3] += f.col[i * 3]; col[j * 3 + 1] += f.col[i * 3 + 1]; col[j * 3 + 2] += f.col[i * 3 + 2]; cnt[j]++;
    }
    let any = 0;
    for (let j = 0; j < cw * ch; j++) { if (cnt[j] === tot[j]) { col[j * 3] /= cnt[j]; col[j * 3 + 1] /= cnt[j]; col[j * 3 + 2] /= cnt[j]; } else { hole[j] = 1; any++; } }
    levels.push({ w: cw, h: ch, col, hole });
    if (!any) break;
  }
  let prev = null;
  for (let li = levels.length - 1; li >= top; li--) {
    const L = levels[li], W = L.w, H = L.h, n = W * H, col = L.col, hole = L.hole;
    // 조각 중심으로 쓸 수 있는 곳(조각 전체가 그림 안이고 빈칸이 없다)
    const srcOK = new Uint8Array(n);
    { const rowBad = new Uint8Array(n);
      for (let y = 0; y < H; y++) { let last = -1e9; for (let x = 0; x < W; x++) { if (hole[y * W + x]) last = x; if (x - last <= R) rowBad[y * W + x] = 1; } last = 1e9; for (let x = W - 1; x >= 0; x--) { if (hole[y * W + x]) last = x; if (last - x <= R) rowBad[y * W + x] = 1; } }
      for (let x = R; x < W - R; x++) { let last = -1e9; const bad = new Uint8Array(H);
        for (let y = 0; y < H; y++) { if (rowBad[y * W + x]) last = y; if (y - last <= R) bad[y] = 1; } last = 1e9;
        for (let y = H - 1; y >= 0; y--) { if (rowBad[y * W + x]) last = y; if (last - y <= R) bad[y] = 1; }
        for (let y = R; y < H - R; y++) if (!bad[y]) srcOK[y * W + x] = 1; } }
    // 빈칸의 깊이(가장자리에서 몇 칸)
    const depth = new Float32Array(n).fill(0); { for (let i = 0; i < n; i++) depth[i] = hole[i] ? 1e9 : 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!hole[i]) continue; let d = depth[i]; if (x > 0) d = Math.min(d, depth[i - 1] + 1); else d = Math.min(d, 1e8); if (y > 0) d = Math.min(d, depth[i - W] + 1); depth[i] = d; }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!hole[i]) continue; let d = depth[i]; if (x < W - 1) d = Math.min(d, depth[i + 1] + 1); if (y < H - 1) d = Math.min(d, depth[i + W] + 1); depth[i] = d; } }
    // 정밀하게 메울 칸: band가 있으면 그 깊이까지만(나머지는 부드러운 채움 그대로 고정)
    const bandPx = opts.band ? opts.band / (1 << li) + R + 1 : 1e9;
    const work = new Uint8Array(n); let holes = 0;
    for (let i = 0; i < n; i++) if (hole[i] && depth[i] <= bandPx) { work[i] = 1; holes++; }
    // 처음 색: 가장 거친 단계는 부드러운 채움, 그 뒤는 앞 단계 결과를 키운 것
    if (!prev) { const known = new Uint8Array(n); for (let i = 0; i < n; i++) known[i] = hole[i] ? 0 : 1; smoothFillF(col, known, W, H, 3); }
    else for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!hole[i]) continue; const j = (Math.min(prev.h - 1, y >> 1) * prev.w + Math.min(prev.w - 1, x >> 1)) * 3; col[i * 3] = prev.col[j]; col[i * 3 + 1] = prev.col[j + 1]; col[i * 3 + 2] = prev.col[j + 2]; }
    if (!holes) { prev = L; continue; }
    // 길잡이: 부드러운 채움을 조각 크기로 흐린 그림. 가져올 조각의 평균색이 여기서 벗어나면 벌점 → 엉뚱한 곳의 무늬를 막는다
    const G = new Float32Array(n * 3);
    if (guide) { const base = Float32Array.from(col), known = new Uint8Array(n); for (let i = 0; i < n; i++) known[i] = hole[i] ? 0 : 1;
      if (prev) { for (let i = 0; i < n; i++) if (hole[i]) base[i * 3] = base[i * 3 + 1] = base[i * 3 + 2] = 0; smoothFillF(base, known, W, H, 3); }
      const tmp = new Float32Array(n * 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0, b = 0, c = 0, k = 0; for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue; const j = (y * W + xx) * 3; a += base[j]; b += base[j + 1]; c += base[j + 2]; k++; } const i = (y * W + x) * 3; tmp[i] = a / k; tmp[i + 1] = b / k; tmp[i + 2] = c / k; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0, b = 0, c = 0, k = 0; for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const j = (yy * W + x) * 3; a += tmp[j]; b += tmp[j + 1]; c += tmp[j + 2]; k++; } const i = (y * W + x) * 3; G[i] = a / k; G[i + 1] = b / k; G[i + 2] = c / k; } }
    // 맞출 조각 중심(조각이 메울 칸에 걸치는 모든 곳)
    const isT = new Uint8Array(n), list = [];
    { const row = new Uint8Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (work[y * W + x]) for (let dx = -R; dx <= R; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) row[y * W + xx] = 1; }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (row[y * W + x]) for (let dy = -R; dy <= R; dy++) { const yy = y + dy; if (yy >= 0 && yy < H) isT[yy * W + x] = 1; }
      for (let i = 0; i < n; i++) if (isT[i]) list.push(i); }
    const nnf = new Int32Array(n).fill(-1), dist = new Float32Array(n).fill(Infinity);
    const patchDist = (ti, si, limit) => {
      const tx = ti % W, ty = (ti - tx) / W, sx = si % W, sy = (si - sx) / W; let d = 0, cnt = 0, pen = 0;
      if (guide) { const g0 = G[ti * 3] - G[si * 3], g1 = G[ti * 3 + 1] - G[si * 3 + 1], g2 = G[ti * 3 + 2] - G[si * 3 + 2]; pen = guide * (g0 * g0 + g1 * g1 + g2 * g2); if (pen > limit) return Infinity; }
      for (let dy = -R; dy <= R; dy++) { const y = ty + dy; if (y < 0 || y >= H) continue;
        let a = (y * W + tx - R) * 3, b = ((sy + dy) * W + sx - R) * 3;
        for (let dx = -R; dx <= R; dx++, a += 3, b += 3) { const x = tx + dx; if (x < 0 || x >= W) continue;
          const d0 = col[a] - col[b], d1 = col[a + 1] - col[b + 1], d2 = col[a + 2] - col[b + 2]; d += d0 * d0 + d1 * d1 + d2 * d2; cnt++; }
        if (d > limit * cnt + limit * P * P) return Infinity; }
      return d / cnt + pen;
    };
    const lim = local ? Math.max(P * 2, local * Math.max(W, H)) : 1e9;
    const randomSource = t => { const tx = t % W, ty = (t - tx) / W;
      for (let k = 0; k < 300; k++) { const sx = Math.round(tx + (rnd() * 2 - 1) * Math.min(lim, W)), sy = Math.round(ty + (rnd() * 2 - 1) * Math.min(lim, H)); if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue; const i = sy * W + sx; if (srcOK[i]) return i; }
      for (let k = 0; k < 300; k++) { const i = (rnd() * n) | 0; if (srcOK[i]) return i; } return -1; };
    // 처음 대응: 앞 단계의 대응을 두 배로 키운다
    for (const i of list) {
      let s = -1;
      if (prev && prev.nnf) { const x = i % W, y = (i - x) / W, pj = Math.min(prev.h - 1, y >> 1) * prev.w + Math.min(prev.w - 1, x >> 1), ps = prev.nnf[pj];
        if (ps >= 0) { const px = ps % prev.w, py = (ps - px) / prev.w, sx = px * 2 + (x & 1), sy = py * 2 + (y & 1); if (sx < W && sy < H && srcOK[sy * W + sx]) s = sy * W + sx; } }
      if (s < 0) s = randomSource(i);
      nnf[i] = s;
    }
    if (nnf[list[0]] < 0) { prev = L; continue; }
    const vote = () => {
      // 믿을 만한 정도: 차이가 작을수록, 가장자리에 가까울수록 크게
      const sample = []; for (let k = 0; k < list.length; k += Math.max(1, (list.length / 400) | 0)) if (isFinite(dist[list[k]])) sample.push(dist[list[k]]);
      sample.sort((a, b) => a - b); const sigma = Math.max(4, sample[(sample.length * sharp) | 0] || 4);
      const acc = new Float32Array(n * 4);
      for (const i of list) { const s = nnf[i]; if (s < 0) continue;
        const wgt = Math.exp(-dist[i] / (2 * sigma)) * Math.pow(1.3, -Math.min(depth[i], 30)) + 1e-12;
        const tx = i % W, ty = (i - tx) / W, sx = s % W, sy = (s - sx) / W;
        for (let dy = -R; dy <= R; dy++) { const y = ty + dy; if (y < 0 || y >= H) continue;
          for (let dx = -R; dx <= R; dx++) { const x = tx + dx; if (x < 0 || x >= W) continue; const q = y * W + x; if (!work[q]) continue;
            const b = ((sy + dy) * W + sx + dx) * 3; acc[q * 4] += wgt * col[b]; acc[q * 4 + 1] += wgt * col[b + 1]; acc[q * 4 + 2] += wgt * col[b + 2]; acc[q * 4 + 3] += wgt; } } }
      for (let q = 0; q < n; q++) if (work[q] && acc[q * 4 + 3] > 0) { const a = acc[q * 4 + 3]; col[q * 3] = acc[q * 4] / a; col[q * 3 + 1] = acc[q * 4 + 1] / a; col[q * 3 + 2] = acc[q * 4 + 2] / a; }
    };
    const maxRad = Math.min(Math.max(W, H), Math.ceil(lim)), ems = li === levels.length - 1 ? EM + 2 : li === top ? Math.max(1, EM - 2) : EM;
    for (let em = 0; em < ems; em++) {
      for (const i of list) dist[i] = patchDist(i, nnf[i], Infinity);
      for (let it = 0; it < PM; it++) {
        const fwd = it % 2 === 0, step = fwd ? -1 : 1;
        for (let k = fwd ? 0 : list.length - 1; fwd ? k < list.length : k >= 0; k += fwd ? 1 : -1) {
          if (++budget >= 500) { budget = 0; yield; }
          const i = list[k], x = i % W, y = (i - x) / W; let best = nnf[i], bd = dist[i];
          // 이웃의 대응을 물려받기
          const nx = x + step; if (nx >= 0 && nx < W && nnf[y * W + nx] >= 0) { const s = nnf[y * W + nx] - step; if (s >= 0 && s < n && srcOK[s] && s !== best) { const d = patchDist(i, s, bd); if (d < bd) { bd = d; best = s; } } }
          const ny = y + step; if (ny >= 0 && ny < H && nnf[ny * W + x] >= 0) { const s = nnf[ny * W + x] - step * W; if (s >= 0 && s < n && srcOK[s] && s !== best) { const d = patchDist(i, s, bd); if (d < bd) { bd = d; best = s; } } }
          // 둘레를 점점 좁혀 가며 무작위로 찾기
          const bx = best % W, by = (best - bx) / W;
          for (let rad = maxRad; rad >= 1; rad >>= 1) {
            const sx = bx + Math.round((rnd() * 2 - 1) * rad), sy = by + Math.round((rnd() * 2 - 1) * rad);
            if (sx < R || sy < R || sx >= W - R || sy >= H - R || Math.abs(sx - x) > lim || Math.abs(sy - y) > lim) continue; const s = sy * W + sx; if (!srcOK[s]) continue;
            const d = patchDist(i, s, bd); if (d < bd) { bd = d; best = s; }
          }
          nnf[i] = best; dist[i] = bd;
        }
      }
      vote(); yield;
    }
    L.nnf = nnf; prev = L;
  }
  // 결과 쓰기(top이 1 이상이면 부드럽게 키운다)
  for (let li = top; li > 0; li--) {
    const C = levels[li], F = levels[li - 1];
    for (let y = 0; y < F.h; y++) { const fy = (y + .5) / 2 - .5, y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(C.h - 1, y0 + 1), ty = Math.min(1, Math.max(0, fy - y0));
      for (let x = 0; x < F.w; x++) { const i = y * F.w + x; if (!F.hole[i]) continue;
        const fx = (x + .5) / 2 - .5, x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(C.w - 1, x0 + 1), tx = Math.min(1, Math.max(0, fx - x0));
        const a = (y0 * C.w + x0) * 3, b = (y0 * C.w + x1) * 3, c = (y1 * C.w + x0) * 3, d = (y1 * C.w + x1) * 3;
        for (let k = 0; k < 3; k++) F.col[i * 3 + k] = (C.col[a + k] * (1 - tx) + C.col[b + k] * tx) * (1 - ty) + (C.col[c + k] * (1 - tx) + C.col[d + k] * tx) * ty; } }
  }
}
