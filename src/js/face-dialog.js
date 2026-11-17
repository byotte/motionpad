// 표정 세부 설정 창: 고르면 바로 반영, 얼굴 확대 미리보기(확대·축소). 열려 있는 동안 편집 화면에도 그 표정이 보인다.
// 옵션은 눈·입·홍조·이펙트 묶음. 이펙트는 미리보기에서 끌어 자리를 옮기고, 세부 옵션(속도·빈도·진하기)을 이펙트마다 둔다.
const exprDialog=$('exprDialog'),exprPreview=$('exprPreview');
let exprId='smile',exprSide='L',exprRemembered=false,exprCompare=false,exprFrame=0,exprZoom=1,exprZoomManual=false;
const EXPR_TOP=['mm','tr','bl','ba'];
const EXPR_FIELDS=['bh','bm','bt','uf','um','ub','lf','lm','lb','mc','mm','mn','tr','ba','bl'];
const EXPR_FX_TOGGLES=[['exprTear','tear'],['exprSa','sa'],['exprSh','sh'],['exprSs','ss']];
function currentExpr(){return faces[faceSel]?.exprs[exprId]}
const exprFxWhich=()=>document.querySelector('input[name="exprFxWhich"]:checked')?.value||'sweat';
function paintExprDialog(){
 const e=currentExpr();if(!e)return;
 const name=EXPRS.find(([id])=>id===exprId)[1];
 $('exprTitle').textContent=`얼굴 ${faceSel+1} · ${name} 세부 설정`;$('exprPick').value=exprId;
 for(const o of $('exprPreset').options)if(o.value)o.textContent=`${EXPRS.find(([id])=>id===o.value)[1]} 프리셋`+(o.value===exprId?' (처음 값)':'');
 $('exprSym').checked=e.sym;$('exprSideRow').hidden=e.sym;
 for(const r of document.querySelectorAll('input[name="exprSide"]'))r.checked=r.value===exprSide;
 const side=e.sym?e.L:e[exprSide];
 for(const k of EXPR_FIELDS){const v=EXPR_TOP.includes(k)?e[k]??50:side[k];$('expr_'+k).value=v;$('expr_'+k+'V').textContent=(v>0&&!['tr','bl','ba'].includes(k)?'+':'')+v}
 const f=faces[faceSel],g=faceGeometry(faceSel),miss=[];
 if(!g.eyes.length)miss.push('눈');if(!f.mouth)miss.push('입');if(!f.brows.length)miss.push('눈썹');
 for(const k of ['bh','bm','bt'])$('expr_'+k).disabled=!g.hasBrow;
 for(const k of ['uf','um','ub','lf','lm','lb','ba','bl'])$('expr_'+k).disabled=!g.eyes.length;
 for(const k of ['mc','mn','mm','tr'])$('expr_'+k).disabled=!f.mouth;
 for(const r of document.querySelectorAll('input[name="exprSweat"]')){r.checked=Number(r.value)===e.sw;r.disabled=!g.eyes.length}
 for(const [id,key] of EXPR_FX_TOGGLES){$(id).checked=!!e[key];$(id).disabled=!g.eyes.length}
 $('exprEar').checked=!!e.ear;$('exprBlushStyle').value=f.blushStyle;
 $('exprBlushStyle').options[0].textContent=`자동 · ${{grad:'그라데이션',fine:'잔 빗금',manga:'만화 빗금'}[g.autoStyle]}`;
 const o=e.fxo[exprFxWhich()];for(const k of ['sp','fr','op']){$('expr_fx_'+k).value=o[k];$('expr_fx_'+k+'V').textContent=o[k]+'%'}
 if(e.ear&&!f.ears.length)miss.push('귀');
 $('exprHint').textContent=miss.length?`${miss.join('·')} 자리를 찍지 않아 그 부분은 조절할 수 없습니다. ‘2. 얼굴 · 눈 깜빡임’에서 찍어 주세요.`:'막대를 움직이면 바로 반영됩니다. 이펙트는 미리보기에서 끌어 옮길 수 있습니다.';
 $('exprZoomReset').textContent=Math.round(exprZoom*100)+'%';
 faceLive={k:faceSel,id:exprId,amount:1};faceChanged(false);drawExprPreview();
}
function openExprDialog(id){
 if(!ready||!faces[faceSel])return;
 exprId=id;exprSide='L';exprRemembered=false;exprCompare=false;exprZoom=1;exprZoomManual=false;
 exprDialog.showModal();paintExprDialog();
 cancelAnimationFrame(exprFrame);const loop=()=>{if(!exprDialog.open)return;const e=currentExpr();if(e&&(e.tr>0||e.sw||e.tear||e.sa||e.sh||e.ss))drawExprPreview();exprFrame=requestAnimationFrame(loop)};exprFrame=requestAnimationFrame(loop);
}
function exprEdit(change){
 const e=currentExpr();if(!e)return;
 if(!exprRemembered){remember();exprRemembered=true}
 change(e);if(e.sym)e.R={...e.L};
 faceChanged(false);scheduleSave();paintExprDialog();
}
for(const k of EXPR_FIELDS)$('expr_'+k).addEventListener('input',ev=>{const v=Number(ev.target.value);exprEdit(e=>{if(EXPR_TOP.includes(k))e[k]=v;else (e.sym?e.L:e[exprSide])[k]=v})});
for(const [id,key] of EXPR_FX_TOGGLES)$(id).onchange=()=>exprEdit(e=>{e[key]=$(id).checked});
for(const r of document.querySelectorAll('input[name="exprSweat"]'))r.onchange=()=>exprEdit(e=>{e.sw=Number(r.value)});
for(const r of document.querySelectorAll('input[name="exprFxWhich"]'))r.onchange=()=>paintExprDialog();
for(const k of ['sp','fr','op'])$('expr_fx_'+k).addEventListener('input',ev=>exprEdit(e=>{e.fxo[exprFxWhich()][k]=Number(ev.target.value)}));
$('exprFxHome').onclick=()=>exprEdit(()=>{const f=faces[faceSel],w=exprFxWhich();if(w==='sweat')f.sweatAt=[];else delete f.fxAt[w]});
$('exprEar').onchange=()=>{exprEdit(e=>{e.ear=$('exprEar').checked});paintFaces()};
$('exprBlushStyle').onchange=()=>exprEdit(()=>{faces[faceSel].blushStyle=$('exprBlushStyle').value;faceChanged()});
$('exprSym').onchange=()=>exprEdit(e=>{e.sym=$('exprSym').checked;if(e.sym)e.L={...e[exprSide]};exprSide='L'});
for(const r of document.querySelectorAll('input[name="exprSide"]'))r.onchange=()=>{exprSide=r.value;paintExprDialog()};
$('exprPick').onchange=()=>{exprId=$('exprPick').value;exprSide='L';paintExprDialog()};
// 프리셋 불러오기: 고르면 지금 값을 그 프리셋 값으로 바꾼다(고친 값이 사라지므로 확인).
$('exprPreset').onchange=async()=>{
 const from=$('exprPreset').value;$('exprPreset').value='';if(!from)return;
 const name=EXPRS.find(([id])=>id===from)[1],mine=EXPRS.find(([id])=>id===exprId)[1];
 if(!await askConfirm({title:'프리셋 불러오기',message:from===exprId?`${mine} 표정에서 고친 값을 모두 지우고 처음 프리셋 값으로 되돌릴까요?`:`${mine} 표정의 지금 값을 지우고 ${name} 프리셋 값으로 바꿀까요?`,ok:from===exprId?'처음 값으로':'불러오기'}))return;
 exprEdit(e=>Object.assign(e,presetExpr(from)));
};
// 확대·축소(위 메뉴줄). 이펙트를 고르는 동안은 얼굴 둘레까지 보이게 저절로 물러난다(직접 바꾼 뒤에는 그대로).
function setExprZoom(z,manual=true){exprZoom=clamp(z,.3,3);if(manual)exprZoomManual=true;$('exprZoomReset').textContent=Math.round(exprZoom*100)+'%';drawExprPreview()}
$('exprZoomIn').onclick=()=>setExprZoom(exprZoom*1.25);$('exprZoomOut').onclick=()=>setExprZoom(exprZoom/1.25);$('exprZoomReset').onclick=()=>setExprZoom(1);
$('exprFxBox').addEventListener('pointerdown',()=>{if(!exprZoomManual&&exprZoom>.55)setExprZoom(.55,false)});
exprPreview.addEventListener('wheel',e=>{e.preventDefault();setExprZoom(exprZoom*(e.deltaY<0?1.1:1/1.1))},{passive:false});
{const b=$('exprCompare'),on=v=>{exprCompare=v;b.setAttribute('aria-pressed',String(v));faceLive=v?null:{k:faceSel,id:exprId,amount:1};faceChanged(false);drawExprPreview()};
 b.addEventListener('pointerdown',e=>{try{b.setPointerCapture(e.pointerId)}catch(_){}on(true)});for(const t of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(t,()=>exprCompare&&on(false));
 b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!exprCompare)on(true)}});b.addEventListener('keyup',()=>exprCompare&&on(false))}
// 이펙트 옮기기: 미리보기에서 가장 가까운 이펙트(켜진 것)를 끈다. 땀방울은 하나씩, 나머지는 그 이펙트 전체가 함께 옮겨진다.
{let drag=null;
 const toImg=ev=>{const r=exprPreview.getBoundingClientRect(),V=exprView;return {x:V.vx+(ev.clientX-r.left)/r.width*V.vw,y:V.vy+(ev.clientY-r.top)/r.height*V.vh}};
 exprPreview.addEventListener('pointerdown',ev=>{
  const e=currentExpr(),f=faces[faceSel];if(!e||!exprView||!f)return;
  const p=toImg(ev),g=faceGeometry(faceSel),A=faceFxAnchors(g,f),cand=[];
  for(let i=0;i<e.sw;i++)cand.push({key:'sweat',i,at:faceSweatSpot(g,f,i)});
  if(e.tear)for(const eye of g.eyes){const q=faceQuad(eye.inner,eye.lo,eye.outer,20);cand.push({key:'tear',at:fv.add(q[15],A.tear)})}
  if(e.ss)cand.push({key:'sparkle',at:A.sparkle});if(e.sa)cand.push({key:'anger',at:A.anger});if(e.sh)cand.push({key:'heart',at:A.heart});
  let best=null,bd=g.S*.35/Math.max(.5,exprZoom);for(const c of cand){const d=fv.len(fv.sub(c.at,p));if(d<bd){bd=d;best=c}}
  if(!best)return;
  drag={...best,start:p,orig:best.key==='sweat'?null:{...(f.fxAt[best.key]||{a:0,b:0})},remembered:false};
  try{exprPreview.setPointerCapture(ev.pointerId)}catch(_){}ev.preventDefault();
  const radio=document.querySelector(`input[name="exprFxWhich"][value="${best.key}"]`);if(radio&&!radio.checked){radio.checked=true;paintExprDialog()}
 });
 exprPreview.addEventListener('pointermove',ev=>{
  if(!drag)return;const f=faces[faceSel],g=faceGeometry(faceSel),p=toImg(ev);
  if(!drag.remembered){remember();drag.remembered=true}
  if(drag.key==='sweat'){const d=fv.sub(p,g.C);f.sweatAt[drag.i]={a:clamp(fv.dot(d,g.u)/g.S,-3,3),b:clamp(fv.dot(d,g.n)/g.S,-3,3)}}
  else{const d=fv.sub(p,drag.start);f.fxAt[drag.key]={a:clamp(drag.orig.a+fv.dot(d,g.u)/g.S,-3,3),b:clamp(drag.orig.b+fv.dot(d,g.n)/g.S,-3,3)}}
  scheduleSave();drawExprPreview();
 });
 for(const t of ['pointerup','pointercancel'])exprPreview.addEventListener(t,()=>{drag=null});
}
$('exprClose').onclick=()=>exprDialog.close();
exprDialog.addEventListener('close',()=>{cancelAnimationFrame(exprFrame);faceLive=null;faceChanged(false)});
for(const b of document.querySelectorAll('#exprList .chip'))b.onclick=()=>openExprDialog(b.dataset.expr);
window.addEventListener('resize',()=>{if(exprDialog.open)drawExprPreview()});
