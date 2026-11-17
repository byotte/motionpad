// C단계 뒤: 앱은 처음에 '간단히'(카드만)로 열린다. 옛 시험 도구는 패널 전체를 쓰므로 '자세히'로 연다.
// require('…/detail_mode') 한 줄로 playwright의 newContext가 만드는 모든 창에 적용. 간단히 화면 사진은 scenes.js prep 끝에서 MP_SIMPLE=1이면 '◂ 간단히'를 누른다.
'use strict';
const pw = require('playwright');
{
  const orig = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = async (...a) => {
    const b = await orig(...a), nc = b.newContext.bind(b), np = b.newPage.bind(b);
    const prep = async ctx => { await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('mp-panel-set')) { localStorage.setItem('motionpad-panel', 'detail'); sessionStorage.setItem('mp-panel-set', '1'); } } catch (_) {} }); return ctx; };
    b.newContext = async (...o) => prep(await nc(...o));
    b.newPage = async (...o) => { const p = await np(...o); await prep(p.context()); return p; };
    return b;
  };
}
