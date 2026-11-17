// CSS 사용 분석기 (0-4 CSS 재작성용, 개발 전용)
// 사용: node tools/baseline/css_usage.js <html> [출력 css]
// 모든 장면에서 보이는 요소마다 '실제로 이긴 선언'을 브라우저(CDP)에 물어, 한 번이라도 적용된 선언만 남긴 CSS를 만든다.
// :hover·:focus·:disabled·::backdrop·스크롤바 같은 장면으로 재현하기 어려운 상태 규칙은 통째로 남긴다.
'use strict';
const { chromium } = require('playwright');require('./detail_mode');
const fs = require('fs');
const path = require('path');
const { VP, SCENES, prep } = require('./scenes');

const file = path.resolve(process.argv[2]);
const outCss = process.argv[3] || path.join(__dirname, 'out', 'pruned.css');
const KEEP_ALL = /:hover|:focus|:active|:disabled|::backdrop|::-webkit|::-moz|\.dim\b|:checked|\.loupe|\[hidden\]|::before|::after/;

(async () => {
  const browser = await chromium.launch();
  const live = new Map(); // ruleKey -> Set(prop source text index)
  const rules = new Map(); // ruleKey -> {selector, media, props:[{name,value,important,text}], order}
  let order = 0;
  const scenes = process.env.SCENE_LIMIT ? SCENES.slice(0, Number(process.env.SCENE_LIMIT)) : SCENES;
  for (const [vp, theme, state] of scenes) {
    const { width, height, ...rest } = VP[vp];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...rest });
    await context.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await context.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await context.addInitScript(t => { try { localStorage.setItem('motionpad-theme', t); } catch (_) {} }, theme);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const inlineSheets = new Set();
    cdp.on('CSS.styleSheetAdded', e => { if (e.header.isInline && e.header.ownerNode) inlineSheets.add(e.header.styleSheetId); });
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    await page.goto('file://' + file);
    await prep(page, state);
    await page.clock.runFor(500);
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'html, body, body *' });
    const visible = await page.evaluate(() => [...document.querySelectorAll('html, body, body *')].map(el => el.tagName === 'HTML' || el.getClientRects().length > 0));
    for (let n = 0; n < nodeIds.length; n++) {
      let m;
      try { m = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: nodeIds[n] }); } catch { continue; }
      const sets = [{ list: m.matchedCSSRules || [], pseudo: '' }];
      for (const pe of m.pseudoElements || []) sets.push({ list: pe.matches || [], pseudo: pe.pseudoType });
      for (const { list } of sets) {
        const winner = new Map(); // longhand -> [ruleKey, declIndex, important]
        for (const match of list) {
          const r = match.rule;
          if (r.origin !== 'regular' || !r.style.range || !inlineSheets.has(r.style.styleSheetId)) continue;
          const key = 'S:' + r.style.range.startLine + ':' + r.style.range.startColumn;
          if (!rules.has(key)) {
            // 직접 쓴 선언(range 있음)만 선언으로 본다. 단축 속성은 longhandProperties로 개별 속성 목록을 얻는다.
            const props = r.style.cssProperties.filter(p => p.range).map(p => ({ name: p.name, value: p.value.replace(/\s*!important\s*$/i, ''), important: !!p.important, longhands: (p.longhandProperties && p.longhandProperties.length) ? p.longhandProperties.map(l => l.name) : [p.name] }));
            rules.set(key, { selector: r.selectorList.text, media: (r.media || []).map(x => x.text), props, order: order++, line: r.style.range.startLine });
          }
          const info = rules.get(key);
          info.props.forEach((p, decl) => {
            for (const name of p.longhands) {
              const prev = winner.get(name);
              if (!prev || p.important || !prev[2]) winner.set(name, [key, decl, p.important]);
            }
          });
        }
        for (const [, [key, decl]] of winner) { if (!live.has(key)) live.set(key, new Set()); live.get(key).add(decl); }
      }
    }
    await context.close();
    process.stdout.write('.');
  }
  await browser.close();
  // CSS 원문을 직접 나눠 모든 규칙(일치한 적 없는 것 포함)을 원래 순서대로 얻고, CDP 결과와 위치(줄:칸)로 맞춘다
  const html = fs.readFileSync(file, 'utf8');
  const sheet = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>'));
  const parsed = []; let line = 0, col = 0, media = null, depth = 0, buf = '', bodyStart = null, selector = '';
  for (let k = 0; k < sheet.length; k++) {
    const ch = sheet[k];
    if (ch === '/' && sheet[k + 1] === '*') { const e = sheet.indexOf('*/', k + 2); for (let q = k; q < e + 2; q++) { if (sheet[q] === '\n') { line++; col = 0; } else col++; } k = e + 1; continue; }
    if (ch === '{') {
      const head = buf.trim(); buf = '';
      if (head.startsWith('@media')) { media = head.slice(6).trim(); depth++; }
      else { selector = head; bodyStart = `${line}:${col + 1}`; depth++; }
    } else if (ch === '}') {
      depth--;
      if (bodyStart) { parsed.push({ key: bodyStart, selector, media, text: buf.trim() }); bodyStart = null; }
      else media = null;
      buf = '';
    } else buf += ch;
    if (ch === '\n') { line++; col = 0; } else col++;
  }
  const byPosDbg = [...rules.values()].length;
  const byPos = new Map([...rules.entries()].map(([k, r]) => [k.split(':').slice(1).join(':'), [k, r]]));
  let css = '', keptDecl = 0, keptRules = 0, unmatched = 0;
  for (const pr of parsed) {
    const hit = byPos.get(pr.key);
    const keepAll = KEEP_ALL.test(pr.selector);
    let body = '';
    if (keepAll) body = pr.text.replace(/;\s*$/, '');
    else if (hit) {
      const [key, r] = hit;
      const used = [...(live.get(key) || [])].sort((a, b) => a - b);
      body = used.map(i => { const p = r.props[i]; return `${p.name}:${p.value}${p.important ? '!important' : ''}`; }).join(';');
    } else unmatched++;
    if (!body) continue;
    keptRules++; keptDecl += body.split(';').length;
    const rule = `${pr.selector}{${body}}`;
    css += pr.media ? `@media ${pr.media}{${rule}}\n` : rule + '\n';
  }
  console.log(`\nCDP 일치 규칙 ${byPosDbg}개 중 원문과 위치가 맞은 것 ${parsed.filter(p => byPos.has(p.key)).length}개`);
  console.log(`원문 규칙 ${parsed.length}개 (한 번도 일치하지 않은 규칙 ${unmatched}개는 제거) → 남긴 규칙 ${keptRules}개, 선언 ${keptDecl}개`);
  fs.mkdirSync(path.dirname(outCss), { recursive: true });
  fs.writeFileSync(outCss, css);
  console.log(`장면 ${SCENES.length}개 분석, 저장: ${outCss}`);
})().catch(e => { console.error(e); process.exit(1); });
