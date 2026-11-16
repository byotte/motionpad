// 얼굴(docs/design/face-reactions.md): '2. 얼굴 · 눈 깜빡임' 섹션, 얼굴 부위(입 3점·눈썹 선) 입력, 표정 값 보관.
// 얼굴은 최대 3개. 얼굴 k의 두 눈 = 눈 깜빡임의 눈 칸 2k·2k+1(눈 깜빡임이 눈 6개까지라 얼굴 3개).
// '적용'을 끄면 깜빡임·표정이 멈추고, 찍은 자리와 표정 값은 그대로 남는다.
const FACE_MAX=3;
const EXPRS=[['smile','웃음'],['shy','부끄러움'],['cry','울먹임'],['angry','화남'],['surprise','놀람']];
// 표정 값(-100~100, 떨림만 0~100). 좌우(L·R = 화면 왼쪽·오른쪽)마다: 눈썹 앞머리·가운데·꼬리, 윗눈꺼풀 앞·가운데·뒤, 아랫눈꺼풀 앞·가운데·뒤, 입꼬리 높이, 입꼬리 좁히기.
// 앞(앞머리) = 얼굴 가운데 쪽. 양수 = 올림(좁히기는 가운데로 모음). 입 가운데(mm)·떨림(tr)은 좌우 공통.
const EXPR_SIDE_KEYS=['bh','bm','bt','uf','um','ub','lf','lm','lb','mc','mn'];
// 프리셋 출발값(설계 §4 표의 방향만 옮긴 것, 3단계에서 눈으로 맞춘다)
const EXPR_PRESETS={
 smile:{s:{bh:30,bm:30,bt:20,uf:0,um:5,ub:-25,lf:50,lm:75,lb:40,mc:70,mn:0},mm:-10,tr:0},
 shy:{s:{bh:35,bm:15,bt:-5,uf:0,um:-5,ub:-10,lf:30,lm:45,lb:25,mc:35,mn:30},mm:0,tr:0},
 cry:{s:{bh:60,bm:20,bt:-40,uf:0,um:-40,ub:-45,lf:10,lm:15,lb:0,mc:-60,mn:10},mm:25,tr:50},
 angry:{s:{bh:-90,bm:-40,bt:30,uf:-45,um:-25,ub:0,lf:25,lm:15,lb:0,mc:-50,mn:20},mm:5,tr:0},
 surprise:{s:{bh:45,bm:75,bt:40,uf:5,um:15,ub:5,lf:0,lm:-10,lb:0,mc:0,mn:60},mm:0,tr:0},
};
function presetExpr(id){const p=EXPR_PRESETS[id];return {sym:true,L:{...p.s},R:{...p.s},mm:p.mm,tr:p.tr}}
function sanitizeExpr(e,id){
 if(!e||typeof e!=='object')return presetExpr(id);
 const v=(x,lo=-100)=>Number.isFinite(x)?clamp(Math.round(x),lo,100):0;
 const side=s=>Object.fromEntries(EXPR_SIDE_KEYS.map(k=>[k,v(s?.[k])]));
 return {sym:e.sym!==false,L:side(e.L),R:side(e.sym!==false?e.L:e.R),mm:v(e.mm),tr:v(e.tr,0)};
}
function blankFace(){return {mouth:null,brows:[],exprs:Object.fromEntries(EXPRS.map(([id])=>[id,presetExpr(id)]))}}
const faceUnit=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
function sanitizeFace(f){
 const out=blankFace();if(!f||typeof f!=='object')return out;
 const m=f.mouth;if(m&&faceUnit(m.l)&&faceUnit(m.r)&&faceUnit(m.c))out.mouth={l:{x:m.l.x,y:m.l.y},r:{x:m.r.x,y:m.r.y},c:{x:m.c.x,y:m.c.y}};
 if(Array.isArray(f.brows))out.brows=f.brows.slice(0,2).map(line=>Array.isArray(line)?line.slice(0,64).filter(faceUnit).map(({x,y})=>({x,y})):[]).filter(line=>line.length>=2);
 for(const [id] of EXPRS)out.exprs[id]=sanitizeExpr(f.exprs?.[id],id);
 return out;
}
let faceOn=false,faces=[],faceSel=0,faceOpen=true;
function faceEyes(k){return [blinkEyes[k*2],blinkEyes[k*2+1]].filter(Boolean).length}
function facesForSave(){return {on:faceOn,list:faces.map(f=>structuredClone(f))}}
// 옛 프로젝트(얼굴 정보 없음): 찍어 둔 눈이 있으면 그 눈을 담을 만큼 얼굴을 만들고 켠다(깜빡이던 그림이 멈추지 않게).
function restoreFaces(d){
 let last=-1;blinkEyes.forEach((eye,i)=>{if(eye)last=i});
 const need=Math.ceil((last+1)/2);
 let list=[];
 if(Array.isArray(d?.list))list=d.list.slice(0,FACE_MAX).map(sanitizeFace);
 else if(d&&Number.isFinite(Number(d.count)))list=Array.from({length:clamp(Math.round(Number(d.count)),0,FACE_MAX)},blankFace);
 while(list.length<need)list.push(blankFace());
 faces=list;faceOn=d&&typeof d==='object'?d.on===true&&faces.length>0:faces.length>0;
 faceSel=0;faceOpen=true;faceChanged();paintFaces();
}
// 되돌리기(zones.js stateSnapshot)에 얼굴과 눈 자리를 함께 담는다: 얼굴을 지우면 그 눈도 지워지므로.
function faceHistory(){return {on:faceOn,list:faces,eyes:blinkEyes}}
function applyFaceHistory(h){
 restoreBlink({eyes:h.eyes,speed:blinkSpeed,interval:blinkInterval});
 faces=(h.list||[]).map(sanitizeFace);faceOn=!!h.on&&faces.length>0;faceChanged();paintFaces();
}
function paintFaces(){
 const box=$('facePanel');if(!box)return;
 faceSel=clamp(faceSel,0,Math.max(0,faces.length-1));
 $('faceOnInput').checked=faceOn;box.classList.toggle('on',faceOn);
 const open=faceOn&&faceOpen;
 $('faceTitle').disabled=!faceOn;$('faceTitle').setAttribute('aria-expanded',String(open));$('faceBody').hidden=!open;
 const chips=faces.map((_,k)=>{
  const b=document.createElement('button');b.type='button';b.className='chip faceItem'+(k===faceSel?' active':'');
  b.setAttribute('role','option');b.setAttribute('aria-selected',String(k===faceSel));
  b.textContent=`얼굴 ${k+1}`;b.onclick=()=>{faceSel=k;if(['faceMouth','faceBrow'].includes(mode))setMode(placeReturn);paintFaces();drawOverlay()};return b;
 });
 if(faces.length<FACE_MAX){const add=document.createElement('button');add.type='button';add.className='btn faceAdd';add.id='faceAdd';add.textContent='+ 얼굴 추가';add.onclick=addFace;chips.push(add)}
 if(faces.length){const del=document.createElement('button');del.type='button';del.className='btn iconBtn faceDel';del.title=del.ariaLabel=`얼굴 ${faceSel+1} 삭제`;del.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>';del.onclick=removeFace;chips.push(del)}
 $('faceList').replaceChildren(...chips);
 const f=faces[faceSel],n=f?faceEyes(faceSel):0;
 const state=(id,text,done)=>{$(id).textContent=text;$(id).classList.toggle('done',done)};
 state('eyeEntryState',n?`눈 ${n}개 적용됨`:'아직 찍지 않음',n>0);
 state('mouthState',f?.mouth?'찍음':'아직 찍지 않음',!!f?.mouth);
 state('browState',f?.brows.length?`${f.brows.length}개 그림`:'아직 그리지 않음',!!f?.brows.length);
 for(const id of ['eyeEntry','faceMouthMode','faceBrowMode'])$(id).disabled=!f;
 for(const b of document.querySelectorAll('#exprList .chip'))b.disabled=!f;
}
function addFace(){
 if(faces.length>=FACE_MAX)return;
 remember();faces.push(blankFace());faceSel=faces.length-1;faceOpen=true;faceChanged();paintFaces();scheduleSave();
 setStatus(`얼굴 ${faceSel+1}이 생겼습니다. ‘눈 찍기 · 설정’을 눌러 두 눈의 위치를 찍어 주세요.`);
}
async function removeFace(){
 const k=faceSel,n=faceEyes(k);
 if(!await askConfirm({title:'얼굴 삭제',message:`얼굴 ${k+1}을 지울까요?`+(n?` 이 얼굴에 찍은 눈 ${n}개의 깜빡임 설정과 입·눈썹 자리, 다듬은 표정도 함께 지워집니다.`:' 찍은 입·눈썹 자리와 다듬은 표정도 함께 지워집니다.'),ok:'얼굴 삭제'}))return;
 remember();
 // 뒤쪽 얼굴의 눈을 한 칸씩 당긴다(얼굴 번호와 눈 칸이 늘 짝을 이루게).
 for(let i=k*2;i<BLINK_MAX_EYES;i++){blinkEyes[i]=blinkEyes[i+2]??null;blinkPatches[i]=blinkPatches[i+2]??null}
 faces.splice(k,1);faceSel=Math.max(0,k-1);blinkEpoch=elapsed;
 if(['faceMouth','faceBrow'].includes(mode))setMode(placeReturn);
 faceChanged();paintFaces();scheduleSave();
}
$('faceOnInput').onchange=()=>{
 remember();faceOn=$('faceOnInput').checked;faceOpen=true;
 if(faceOn&&!faces.length){faces.push(blankFace());faceSel=0;setStatus('얼굴 1이 생겼습니다. ‘눈 찍기 · 설정’을 눌러 두 눈의 위치를 찍어 주세요.')}
 if(faceOn)blinkEpoch=elapsed;
 faceChanged();paintFaces();scheduleSave();
};
$('faceTitle').onclick=()=>{faceOpen=!faceOpen;paintFaces()};

// ── 부위 입력: 그림 위에서 찍는다(축 지정처럼, 확대경 그대로). 끝나면 하던 도구로 돌아간다. ──
let faceDraft=[];
const FACE_MOUTH_PROMPTS=['입: 화면 왼쪽 입꼬리를 눌러 주세요.','입: 화면 오른쪽 입꼬리를 눌러 주세요.','입: 입 가운데(윗입술과 아랫입술이 만나는 선의 가운데)를 눌러 주세요.'];
function faceBrowPrompt(){const total=Math.max(1,faceEyes(faceSel));return total===1?'눈썹: 눈썹을 따라 한 획으로 그어 주세요.':faceDraft.length?'눈썹: 이제 화면 오른쪽 눈썹을 따라 한 획으로 그어 주세요.':'눈썹: 화면 왼쪽 눈썹을 따라 한 획으로 그어 주세요.'}
function faceModeStatus(m){faceDraft=[];if(m==='faceMouth')setStatus(FACE_MOUTH_PROMPTS[0]);if(m==='faceBrow')setStatus(faceBrowPrompt())}
for(const [id,m] of [['faceMouthMode','faceMouth'],['faceBrowMode','faceBrow']])$(id).onclick=()=>{
 if(!ready){setStatus('먼저 그림을 열어 주세요.');return}
 if(m==='faceBrow'&&!faceEyes(faceSel)){setStatus('눈썹은 눈을 기준으로 정리합니다. 먼저 ‘눈 찍기 · 설정’으로 눈을 찍어 주세요.');return}
 setMode(mode===m&&!touchPreview?placeReturn:m);
};
function faceMouthTap(p){
 faceDraft.push({x:p.x,y:p.y});
 if(faceDraft.length<3){setStatus(FACE_MOUTH_PROMPTS[faceDraft.length]);drawOverlay();return}
 let [l,r,c]=faceDraft;if(l.x>r.x)[l,r]=[r,l];
 remember();faces[faceSel].mouth={l,r,c};faceDraft=[];faceChanged();paintFaces();scheduleSave();
 setMode(placeReturn);setStatus('입 자리를 찍었습니다. 표정을 눌러 입 모양을 다듬어 보세요.');
}
function faceBrowStroke(points){
 if(points.length<2){setStatus('눈썹을 따라 조금 더 길게 그어 주세요.');return}
 // 6~24점으로 고르게 줄여 저장(모양·위치만, 굵기는 모름)
 const n=clamp(Math.round(points.length/3),6,24),line=Array.from({length:n},(_,i)=>{const [x,y]=spinePoint(points,i/(n-1));return {x,y}});
 faceDraft.push(line);
 if(faceDraft.length<Math.max(1,Math.min(2,faceEyes(faceSel)))){setStatus(faceBrowPrompt());drawOverlay();return}
 remember();faces[faceSel].brows=faceDraft.slice(0,2);faceDraft=[];faceChanged();paintFaces();scheduleSave();
 setMode(placeReturn);setStatus('눈썹을 그렸습니다. 표정을 눌러 눈썹을 다듬어 보세요.');
}
// 편집 화면 위 표시: 부위를 찍는 동안 이 얼굴의 입·눈썹(찍은 것과 찍는 중인 것)
function drawFaceParts(g,w,h,px){
 if(!['faceMouth','faceBrow'].includes(mode))return;
 const f=faces[faceSel];if(!f)return;
 g.save();g.lineWidth=2*px;g.strokeStyle=g.fillStyle='#ffcf70';g.setLineDash([5*px,4*px]);
 const line=pts=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x*w,p.y*h):g.moveTo(p.x*w,p.y*h));g.stroke()};
 const dot=p=>{g.beginPath();g.arc(p.x*w,p.y*h,4*px,0,Math.PI*2);g.fill()};
 if(mode==='faceMouth'){const m=faceDraft.length?null:f.mouth;if(m){line([m.l,m.c,m.r]);[m.l,m.c,m.r].forEach(dot)}faceDraft.forEach(dot)}
 if(mode==='faceBrow'){(faceDraft.length?faceDraft:f.brows).forEach(line);if(gesture?.type==='faceBrow')line(gesture.points.map(([x,y])=>({x,y})))}
 g.restore();
}

// ── 표정 상세 세팅 창: 고르면 바로 반영, 얼굴 확대 미리보기. 열려 있는 동안 편집 화면에도 그 표정이 보인다. ──
const exprDialog=$('exprDialog'),exprPreview=$('exprPreview');
let exprId='smile',exprSide='L',exprRemembered=false,exprCompare=false,exprFrame=0;
const EXPR_FIELDS=[['bh','앞머리'],['bm','가운데'],['bt','꼬리'],['uf','앞'],['um','가운데'],['ub','뒤'],['lf','앞'],['lm','가운데'],['lb','뒤'],['mc','꼬리 높이'],['mn','꼬리 좁히기'],['mm','가운데'],['tr','떨림']];
function currentExpr(){return faces[faceSel]?.exprs[exprId]}
function paintExprDialog(){
 const e=currentExpr();if(!e)return;
 const name=EXPRS.find(([id])=>id===exprId)[1];
 $('exprTitle').textContent=`얼굴 ${faceSel+1} · ${name} 다듬기`;$('exprPick').value=exprId;
 $('exprSym').checked=e.sym;$('exprSideRow').hidden=e.sym;
 for(const r of document.querySelectorAll('input[name="exprSide"]'))r.checked=r.value===exprSide;
 const side=e.sym?e.L:e[exprSide];
 for(const [k] of EXPR_FIELDS){const v=k==='mm'||k==='tr'?e[k]:side[k];$('expr_'+k).value=v;$('expr_'+k+'V').textContent=(v>0&&k!=='tr'?'+':'')+v}
 const f=faces[faceSel],g=faceGeometry(faceSel),miss=[];
 if(!g.eyes.length)miss.push('눈');if(!f.mouth)miss.push('입');if(!f.brows.length)miss.push('눈썹');
 for(const k of ['bh','bm','bt'])$('expr_'+k).disabled=!g.hasBrow;
 for(const k of ['uf','um','ub','lf','lm','lb'])$('expr_'+k).disabled=!g.eyes.length;
 for(const k of ['mc','mn','mm','tr'])$('expr_'+k).disabled=!f.mouth;
 $('exprHint').textContent=miss.length?`${miss.join('·')} 자리를 찍지 않아 그 부분은 조절할 수 없습니다. ‘2. 얼굴 · 눈 깜빡임’에서 찍어 주세요.`:'막대를 움직이면 바로 반영됩니다. ‘원래 얼굴’을 누르고 있으면 바꾸기 전 모습을 봅니다.';
 faceLive={k:faceSel,id:exprId,amount:1};faceChanged(false);drawExprPreview();
}
function openExprDialog(id){
 if(!ready||!faces[faceSel])return;
 exprId=id;exprSide='L';exprRemembered=false;exprCompare=false;
 exprDialog.showModal();paintExprDialog();
 cancelAnimationFrame(exprFrame);const loop=()=>{if(!exprDialog.open)return;if(currentExpr()?.tr>0)drawExprPreview();exprFrame=requestAnimationFrame(loop)};exprFrame=requestAnimationFrame(loop);
}
function exprEdit(change){
 const e=currentExpr();if(!e)return;
 if(!exprRemembered){remember();exprRemembered=true}
 change(e);if(e.sym)e.R={...e.L};
 faceChanged(false);scheduleSave();paintExprDialog();
}
for(const [k] of EXPR_FIELDS)$('expr_'+k).addEventListener('input',ev=>{const v=Number(ev.target.value);exprEdit(e=>{if(k==='mm'||k==='tr')e[k]=v;else (e.sym?e.L:e[exprSide])[k]=v})});
$('exprSym').onchange=()=>exprEdit(e=>{e.sym=$('exprSym').checked;if(e.sym)e.L={...e[exprSide]};exprSide='L'});
for(const r of document.querySelectorAll('input[name="exprSide"]'))r.onchange=()=>{exprSide=r.value;paintExprDialog()};
$('exprPick').onchange=()=>{exprId=$('exprPick').value;exprSide='L';paintExprDialog()};
$('exprFrom').onchange=()=>{const from=$('exprFrom').value;$('exprFrom').value='';if(!from)return;exprEdit(e=>Object.assign(e,presetExpr(from)));setStatus(`${EXPRS.find(([id])=>id===from)[1]} 프리셋 값에서 다시 시작합니다.`)};
$('exprReset').onclick=async()=>{
 const name=EXPRS.find(([id])=>id===exprId)[1];
 if(!await askConfirm({title:'프리셋으로 되돌리기',message:`${name} 표정에서 고친 값을 모두 지우고 처음 프리셋 값으로 되돌릴까요?`,ok:'되돌리기'}))return;
 exprEdit(e=>Object.assign(e,presetExpr(exprId)));
};
{const b=$('exprCompare'),on=v=>{exprCompare=v;b.setAttribute('aria-pressed',String(v));faceLive=v?null:{k:faceSel,id:exprId,amount:1};faceChanged(false);drawExprPreview()};
 b.addEventListener('pointerdown',e=>{try{b.setPointerCapture(e.pointerId)}catch(_){}on(true)});for(const t of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(t,()=>exprCompare&&on(false));
 b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();if(!exprCompare)on(true)}});b.addEventListener('keyup',()=>exprCompare&&on(false))}
$('exprClose').onclick=()=>exprDialog.close();
exprDialog.addEventListener('close',()=>{cancelAnimationFrame(exprFrame);faceLive=null;faceChanged(false)});
for(const b of document.querySelectorAll('#exprList .chip'))b.onclick=()=>openExprDialog(b.dataset.expr);
window.addEventListener('resize',()=>{if(exprDialog.open)drawExprPreview()});
