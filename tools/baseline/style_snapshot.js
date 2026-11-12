// 스타일 스냅숏 비교기 (0-4 CSS 재작성용, 개발 전용)
// 사용: node tools/baseline/style_snapshot.js <기준.html> <새.html> [장면 이름 일부]
// 여러 장면(화면 크기·테마·상태)에서 보이는 모든 요소의 위치·크기·최종 스타일을 뽑아 요소 단위로 비교한다.
// 결과: tools/baseline/out/style/<장면>.json 과 차이 요약(콘솔)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [fileA, fileB, only] = process.argv.slice(2);
const OUT = path.join(__dirname, 'out', 'style');
fs.mkdirSync(OUT, { recursive: true });

const { VP, PROPS, SCENES, prep } = require('./scenes');

async function snapshot(browser, file, [vp, theme, state]) {
  const { width, height, ...rest } = VP[vp];
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...rest });
  await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await context.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await context.addInitScript(t => { try { localStorage.setItem('motionpad-theme', t); } catch (_) {} }, theme);
  const page = await context.newPage();
  await page.goto('file://' + path.resolve(file));
  await prep(page, state);
  await page.clock.runFor(500);
  const data = await page.evaluate(PROPS => {
    const out = {}; const keyOf = new Map();
    const key = el => {
      if (keyOf.has(el)) return keyOf.get(el);
      let k;
      if (el.id) k = '#' + el.id;
      else if (!el.parentElement) k = el.tagName.toLowerCase();
      else { const sib = [...el.parentElement.children].filter(c => c.tagName === el.tagName); k = key(el.parentElement) + '>' + el.tagName.toLowerCase() + (sib.length > 1 ? `[${sib.indexOf(el)}]` : ''); }
      keyOf.set(el, k); return k;
    };
    for (const el of document.querySelectorAll('body, body *')) {
      if (['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName)) continue;
      const rects = el.getClientRects(); if (!rects.length) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const rec = { rect: [r.x, r.y, r.width, r.height].map(v => Math.round(v * 2) / 2) };
      for (const p of PROPS) rec[p] = cs[p];
      for (const pseudo of ['::before', '::after']) { const ps = getComputedStyle(el, pseudo); if (ps.content && ps.content !== 'none' && ps.content !== 'normal') rec[pseudo] = [ps.content, ps.color, ps.fontSize, ps.display, ps.width, ps.height, ps.borderTopWidth, ps.borderTopLeftRadius].join(' | '); }
      out[key(el)] = rec;
    }
    return out;
  }, PROPS);
  await context.close();
  return data;
}

(async () => {
  const browser = await chromium.launch();
  const totals = {}; let sceneCount = 0, clean = 0;
  const report = [];
  for (const sc of SCENES) {
    const name = sc.join('-');
    if (only && !name.includes(only)) continue;
    sceneCount++;
    const a = await snapshot(browser, fileA, sc), b = await snapshot(browser, fileB, sc);
    const diffs = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!a[k]) { diffs.push([k, '(새 쪽에만 보임)', '', JSON.stringify(b[k].rect)]); continue; }
      if (!b[k]) { diffs.push([k, '(기준에만 보임)', JSON.stringify(a[k].rect), '']); continue; }
      for (const p of Object.keys(a[k])) {
        const x = JSON.stringify(a[k][p]), y = JSON.stringify(b[k][p]);
        if (x !== y) diffs.push([k, p, a[k][p], b[k][p]]);
      }
      for (const p of Object.keys(b[k])) if (!(p in a[k])) diffs.push([k, p, undefined, b[k][p]]);
    }
    for (const d of diffs) totals[d[1]] = (totals[d[1]] || 0) + 1;
    if (!diffs.length) clean++;
    report.push({ scene: name, count: diffs.length, diffs });
    fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(diffs, null, 1));
    console.log(`${diffs.length ? '차이 ' + String(diffs.length).padStart(4) : '같음     '}  ${name}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ totals, report: report.map(r => [r.scene, r.count]) }, null, 1));
  console.log(`\n장면 ${sceneCount}개 중 완전히 같음 ${clean}개`);
  console.log('속성별 차이 수:', Object.entries(totals).sort((x, y) => y[1] - x[1]).slice(0, 20).map(([k, v]) => `${k} ${v}`).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
