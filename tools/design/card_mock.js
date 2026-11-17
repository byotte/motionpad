// C단계 간단 카드 시안(부품 조각): node tools/design/card_mock.js → docs/progress/img/C-card-mock-{pc,phone}.png
// 실제 앱 CSS(tokens·base·controls·panel)를 그대로 쓰고 카드 부분만 시안 CSS를 더한다.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const css = ['tokens', 'base', 'controls', 'panel'].map(n => fs.readFileSync(path.join(ROOT, 'src/css', n + '.css'), 'utf8')).join('\n');
const mock = `
body{margin:0;background:var(--bg);font-family:system-ui,"Noto Sans KR",sans-serif}
.board{display:flex;flex-wrap:wrap;gap:18px;padding:18px;align-items:flex-start}
.state{display:flex;flex-direction:column;gap:6px}
.state>h3{margin:0;color:var(--help);font-size:var(--fs-help);font-weight:var(--fw-help)}
.card{box-sizing:border-box;width:var(--w);padding:var(--sp2) 10px var(--sp3);background:var(--panel);border:1px solid var(--line);border-radius:var(--r-box)}
.cardHead{display:flex;align-items:center;gap:var(--sp1);margin-bottom:var(--sp2)}
.cardHead .zones{display:flex;gap:var(--sp1);overflow:hidden;flex:1;min-width:0}
.more{margin-left:auto;flex:none;border:0;background:transparent;color:var(--accentInk);font:inherit;font-size:var(--fs-item);font-weight:var(--fw-item)}
.chip{display:inline-flex;align-items:center;min-height:var(--ctl-h);padding:0 10px;border:1px solid var(--line);white-space:nowrap}
.chip.add{border-style:dashed;color:var(--accentInk);background:transparent;font-weight:var(--fw-title)}
.ask{margin:var(--sp1) 0 var(--sp2);color:var(--ink);font-size:var(--fs-item);font-weight:var(--fw-title)}
.parts{display:flex;gap:var(--sp1);flex-wrap:nowrap;overflow:hidden;margin-bottom:var(--sp2)}
.parts .chip{background:transparent}
.parts .chip.active{background:transparent;box-shadow:inset 0 0 0 1px var(--accent)}
.row{display:flex;align-items:center;gap:var(--sp2);margin-top:var(--sp2)}
.row>.name{flex:none;width:44px;color:var(--item);font-size:var(--fs-item)}
.seg{display:inline-flex;gap:var(--sp1)}
.seg span{display:inline-flex;align-items:center;min-height:var(--ctl-h);padding:0 8px;white-space:nowrap;border:1px solid var(--line);border-radius:var(--r-ctl);color:var(--item);font-size:var(--fs-item)}
.seg span.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);color:var(--ink)}
.big{display:flex;gap:var(--sp2);margin:var(--sp2) 0}
.big .btn{flex:1;min-height:44px;justify-content:center;font-weight:var(--fw-title)}
.lead{margin:0 0 var(--sp1);color:var(--item);font-size:var(--fs-item)}
.lineBtn{display:flex;align-items:center;justify-content:space-between;margin-top:var(--sp2)}
.sw{display:inline-flex;align-items:center;gap:var(--sp1);color:var(--item);font-size:var(--fs-help)}
.sw i{position:relative;width:28px;height:16px;border-radius:var(--r-round);background:var(--accent)}
.sw i::before{content:"";position:absolute;top:2px;left:14px;width:12px;height:12px;border-radius:var(--r-round);background:var(--onAccent)}
.faceLine{margin-top:var(--sp2);border:0;background:transparent;padding:0;color:var(--accentInk);font:inherit;font-size:var(--fs-item);font-weight:var(--fw-title)}
.stroke{margin-top:var(--sp2)}
.note{max-width:var(--w);margin:0;color:var(--help);font-size:var(--fs-help)}
`;
const zones = (sel, list) => `<div class="zones">${list.map(n => `<span class="chip${n === sel ? ' active' : ''}">${n}</span>`).join('')}<span class="chip add">+ 다른 부위</span></div>`;
const PARTS = ['볼', '가슴·배', '머리카락', '꼬리', '귀', '옷자락', '기타'];
const parts = sel => `<div class="parts">${PARTS.map(p => `<span class="chip${p === sel ? ' active' : ''}">${p}</span>`).join('')}</div>`;
const seg = (opts, on) => `<span class="seg">${opts.map(o => `<span class="${o === on ? 'on' : ''}">${o}</span>`).join('')}</span>`;
const states = [
  ['① 영역이 없음', `<div class="cardHead"><b class="ask" style="margin:0">움직일 곳을 골라 보세요</b><button class="more">자세히 ▸</button></div>
    <p class="lead">마술봉으로 누르거나 올가미로 대충 둘러 그리면 됩니다.</p>
    <div class="big"><button class="btn">눌러서 고르기<br>(마술봉)</button><button class="btn">둘러 그리기<br>(올가미)</button></div>
    <div class="lineBtn"><span class="lead" style="margin:0">전체 숨쉬기</span><span class="sw"><i></i>켜기</span></div>`],
  ['② 영역을 골랐고 부위는 아직', `<div class="cardHead">${zones('영역 1', ['영역 1'])}<button class="more">자세히 ▸</button></div>
    <p class="ask">이 부분은 무엇인가요?</p>${parts('')}`],
  ['③ 부위를 정함(꼬리)', `<div class="cardHead">${zones('꼬리', ['볼', '꼬리'])}<button class="more">자세히 ▸</button></div>
    ${parts('꼬리')}
    <div class="row"><span class="name">크기</span>${seg(['약', '중', '강'], '중')}<button class="btn" style="margin-left:auto">방향 긋기</button></div>
    <div class="row"><span class="name">저절로</span>${seg(['끔', '느리게', '보통', '빠르게'], '보통')}</div>`],
  ['③-1 자세히에서 손댐(볼, 저절로 끔)', `<div class="cardHead">${zones('볼', ['볼', '꼬리'])}<button class="more">자세히 ▸</button></div>
    ${parts('볼')}
    <div class="row"><span class="name">크기</span>${seg(['약', '중', '강', '직접 맞춤'], '직접 맞춤')}</div>
    <div class="row"><span class="name">저절로</span>${seg(['끔', '느리게', '보통', '빠르게'], '끔')}</div>`],
  ['④ 영역은 있고 아무것도 안 고름', `<div class="cardHead">${zones('', ['볼', '꼬리'])}<button class="more">자세히 ▸</button></div>
    <div class="lineBtn"><span class="lead" style="margin:0">전체 숨쉬기</span><span class="sw"><i></i>켜기</span></div>
    <button class="faceLine">+ 얼굴 표정·눈 깜빡임 넣기</button>`],
];
const page = (w, theme) => `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8"><style>${css}${mock}</style></head><body><div class="board" style="--w:${w}px">
${states.map(([t, body]) => `<div class="state"><h3>${t}</h3><div class="card">${body}</div></div>`).join('')}
<p class="note">카드는 늘 같은 자리(폰: 그림 아래, PC: 오른쪽 옵션 칸 맨 위). 줄은 최대 4줄. '자세히 ▸'를 누르면 지금 패널, 거기서 '◂ 간단히'.</p></div></body></html>`;
(async () => {
  const b = await chromium.launch();
  for (const [name, w, vw] of [['pc', 300, 1000], ['phone', 390, 840]]) {
    const p = await b.newPage({ viewport: { width: vw, height: 400 }, deviceScaleFactor: 2 });
    await p.setContent(page(w, 'violet'));
    const out = path.join(ROOT, 'docs/progress/img', `C-card-mock-${name}.png`);
    await p.screenshot({ path: out, fullPage: true }); console.log(out);
  }
  await b.close();
})();
