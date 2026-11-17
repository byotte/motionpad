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
 smile:{s:{bh:30,bm:30,bt:20,uf:0,um:5,ub:-25,lf:50,lm:75,lb:40,mc:70,mn:0},mm:-10,tr:0,bl:25,ba:50,sw:0,tear:false,sa:false,sh:false,ss:true},
 shy:{s:{bh:35,bm:15,bt:-5,uf:0,um:-5,ub:-10,lf:30,lm:45,lb:25,mc:35,mn:-30},mm:0,tr:0,bl:80,ba:50,sw:2,tear:false,sa:false,sh:false,ss:false},
 cry:{s:{bh:60,bm:20,bt:-40,uf:0,um:-40,ub:-45,lf:10,lm:15,lb:0,mc:-60,mn:-10},mm:25,tr:50,bl:10,ba:50,sw:0,tear:true,sa:false,sh:false,ss:false},
 angry:{s:{bh:-90,bm:-40,bt:30,uf:-45,um:-25,ub:0,lf:25,lm:15,lb:0,mc:-50,mn:-20},mm:5,tr:0,bl:45,ba:50,sw:0,tear:false,sa:true,sh:false,ss:false},
 surprise:{s:{bh:45,bm:75,bt:40,uf:5,um:15,ub:5,lf:0,lm:-10,lb:0,mc:0,mn:-60},mm:0,tr:0,bl:0,ba:50,sw:1,tear:false,sa:false,sh:false,ss:false},
};
function presetExpr(id){const p=EXPR_PRESETS[id];return {fxo:Object.fromEntries(FX_KEYS.map(k=>[k,{sp:100,fr:100,op:100}])),sym:true,L:{...p.s},R:{...p.s},mm:p.mm,tr:p.tr,bl:p.bl,ba:p.ba,ear:false,sw:p.sw,tear:p.tear,sa:p.sa,sh:p.sh,ss:p.ss}}
function sanitizeExpr(e,id){
 if(!e||typeof e!=='object')return presetExpr(id);
 const v=(x,lo=-100)=>Number.isFinite(x)?clamp(Math.round(x),lo,100):0;
 const side=s=>Object.fromEntries(EXPR_SIDE_KEYS.map(k=>[k,v(s?.[k])]));
 return {sym:e.sym!==false,L:side(e.L),R:side(e.sym!==false?e.L:e.R),mm:v(e.mm),tr:v(e.tr,0),bl:Number.isFinite(e.bl)?v(e.bl,0):EXPR_PRESETS[id].bl,ba:Number.isFinite(e.ba)?v(e.ba,0):50,ear:e.ear===true,sw:Number.isFinite(e.sw)?clamp(Math.round(e.sw),0,3):EXPR_PRESETS[id].sw,...Object.fromEntries(['tear','sa','sh','ss'].map(k=>[k,typeof e[k]==='boolean'?e[k]:EXPR_PRESETS[id][k]])),
  fxo:Object.fromEntries(FX_KEYS.map(k=>[k,Object.fromEntries(['sp','fr','op'].map(o=>[o,Number.isFinite(e.fxo?.[k]?.[o])?clamp(Math.round(e.fxo[k][o]),0,200):100]))]))};
}
const FX_KEYS=['sweat','tear','sparkle','anger','heart'];// 이펙트(세부 옵션 sp 속도·fr 빈도·op 진하기, 0~200%)
const BLUSH_STYLES=['auto','grad','fine','manga'];
function blankFace(){return {mouth:null,brows:[],ears:[],blushStyle:'auto',sweatAt:[],fxAt:{},exprs:Object.fromEntries(EXPRS.map(([id])=>[id,presetExpr(id)]))}}
const faceUnit=p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
function sanitizeFace(f){
 const out=blankFace();if(!f||typeof f!=='object')return out;
 const m=f.mouth;if(m&&faceUnit(m.l)&&faceUnit(m.r)&&faceUnit(m.c))out.mouth={l:{x:m.l.x,y:m.l.y},r:{x:m.r.x,y:m.r.y},c:{x:m.c.x,y:m.c.y}};
 if(Array.isArray(f.brows))out.brows=f.brows.slice(0,2).map(line=>Array.isArray(line)?line.slice(0,64).filter(faceUnit).map(({x,y})=>({x,y})):[]).filter(line=>line.length>=2);
 if(Array.isArray(f.ears))out.ears=f.ears.slice(0,2).map(line=>Array.isArray(line)?line.slice(0,64).filter(faceUnit).map(({x,y})=>({x,y})):[]).filter(line=>line.length>=2);
 if(BLUSH_STYLES.includes(f.blushStyle))out.blushStyle=f.blushStyle;
 if(f.fxAt&&typeof f.fxAt==='object')for(const k of FX_KEYS){const p=f.fxAt[k];if(Number.isFinite(p?.a)&&Number.isFinite(p?.b))out.fxAt[k]={a:clamp(p.a,-3,3),b:clamp(p.b,-3,3)}}
 if(Array.isArray(f.sweatAt))out.sweatAt=f.sweatAt.slice(0,4).map(p=>Number.isFinite(p?.a)&&Number.isFinite(p?.b)?{a:clamp(p.a,-3,3),b:clamp(p.b,-3,3)}:null);
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
 if(faceOn||zones.some(z=>z.hitMark==='red'))setTimeout(faceSupportNotice,0);// 얼굴·빨개짐이 든 프로젝트를 열 때
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
  b.textContent=`얼굴 ${k+1}`;b.onclick=()=>{faceSel=k;if(['faceMouth','faceBrow','faceEar'].includes(mode))setMode(placeReturn);paintFaces();drawOverlay()};return b;
 });
 if(faces.length<FACE_MAX){const add=document.createElement('button');add.type='button';add.className='btn faceAdd';add.id='faceAdd';add.textContent='+ 얼굴 추가';add.onclick=addFace;chips.push(add)}
 if(faces.length){const del=document.createElement('button');del.type='button';del.className='btn iconBtn faceDel';del.title=del.ariaLabel=`얼굴 ${faceSel+1} 삭제`;del.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>';del.onclick=removeFace;chips.push(del)}
 $('faceList').replaceChildren(...chips);
 const f=faces[faceSel],n=f?faceEyes(faceSel):0;
 const state=(id,text,done)=>{$(id).textContent=text;$(id).classList.toggle('done',done)};
 state('eyeEntryState',n?`눈 ${n}개 적용됨`:'아직 찍지 않음',n>0);
 state('mouthState',f?.mouth?'찍음':'아직 찍지 않음',!!f?.mouth);
 state('browState',f?.brows.length?`${f.brows.length}개 그림`:'아직 그리지 않음',!!f?.brows.length);
 state('earState',f?.ears.length?`${f.ears.length}개 그림`:'아직 그리지 않음',!!f?.ears.length);
 $('faceEarRow').hidden=!f||!(f.ears.length||Object.values(f.exprs).some(e=>e.ear));
 for(const id of ['eyeEntry','faceMouthMode','faceBrowMode','faceEarMode'])$(id).disabled=!f;
 for(const b of document.querySelectorAll('#exprList .chip'))b.disabled=!f;
 paintFaceOptions();
}
function addFace(){
 if(faces.length>=FACE_MAX)return;
 remember();faces.push(blankFace());faceSel=faces.length-1;faceOpen=true;faceChanged();paintFaces();scheduleSave();
 setStatus(`얼굴 ${faceSel+1}이 생겼습니다. ‘눈 찍기 · 설정’을 눌러 두 눈의 위치를 찍어 주세요.`);
}
async function removeFace(){
 const k=faceSel,n=faceEyes(k);
 if(!await askConfirm({title:'얼굴 삭제',message:`얼굴 ${k+1}을 지울까요?`+(n?` 이 얼굴에 찍은 눈 ${n}개의 깜빡임 설정과 입·눈썹 자리, 세부 설정한 표정도 함께 지워집니다.`:' 찍은 입·눈썹 자리와 세부 설정한 표정도 함께 지워집니다.'),ok:'얼굴 삭제'}))return;
 remember();
 // 뒤쪽 얼굴의 눈을 한 칸씩 당긴다(얼굴 번호와 눈 칸이 늘 짝을 이루게).
 for(let i=k*2;i<BLINK_MAX_EYES;i++){blinkEyes[i]=blinkEyes[i+2]??null;blinkPatches[i]=blinkPatches[i+2]??null}
 faces.splice(k,1);faceRefsAfterRemove(k);faceSel=Math.max(0,k-1);blinkEpoch=elapsed;
 if(['faceMouth','faceBrow','faceEar'].includes(mode))setMode(placeReturn);
 faceChanged();paintFaces();updateUI();scheduleSave();
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
function faceModeStatus(m){faceDraft=[];if(m==='faceMouth')setStatus(FACE_MOUTH_PROMPTS[0]);if(m==='faceBrow')setStatus(faceBrowPrompt());if(m==='faceEar')setStatus('귀: 귀의 바깥 선을 따라 한 획으로 그어 주세요. 양쪽 귀가 보이면 두 획입니다.')}
for(const [id,m] of [['faceMouthMode','faceMouth'],['faceBrowMode','faceBrow'],['faceEarMode','faceEar']])$(id).onclick=()=>{
 if(!ready){setStatus('먼저 그림을 열어 주세요.');return}
 if(m==='faceBrow'&&!faceEyes(faceSel)){setStatus('눈썹은 눈을 기준으로 정리합니다. 먼저 ‘눈 찍기 · 설정’으로 눈을 찍어 주세요.');return}
 setMode(mode===m&&!touchPreview?placeReturn:m);
};
function faceMouthTap(p){
 faceDraft.push({x:p.x,y:p.y});
 if(faceDraft.length<3){setStatus(FACE_MOUTH_PROMPTS[faceDraft.length]);drawOverlay();return}
 let [l,r,c]=faceDraft;if(l.x>r.x)[l,r]=[r,l];
 remember();faces[faceSel].mouth={l,r,c};faceDraft=[];faceChanged();paintFaces();scheduleSave();
 setMode(placeReturn);setStatus('입 자리를 찍었습니다. 아래 ‘표정 세부 설정’에서 표정을 눌러 입 모양을 바꿔 보세요.');
}
function faceBrowStroke(points){
 if(points.length<2){setStatus('눈썹을 따라 조금 더 길게 그어 주세요.');return}
 // 6~24점으로 고르게 줄여 저장(모양·위치만, 굵기는 모름)
 const n=clamp(Math.round(points.length/3),6,24),line=Array.from({length:n},(_,i)=>{const [x,y]=spinePoint(points,i/(n-1));return {x,y}});
 faceDraft.push(line);
 if(faceDraft.length<Math.max(1,Math.min(2,faceEyes(faceSel)))){setStatus(faceBrowPrompt());drawOverlay();return}
 remember();faces[faceSel].brows=faceDraft.slice(0,2);faceDraft=[];faceChanged();paintFaces();scheduleSave();
 setMode(placeReturn);setStatus('눈썹을 그렸습니다. 아래 ‘표정 세부 설정’에서 표정을 눌러 눈썹 모양을 바꿔 보세요.');
}
// 귀(홍조의 '귀도 붉게'에만 쓴다): 한 획마다 바로 저장, 두 획이면 끝. 한쪽만 보이면 버튼을 다시 눌러 마친다.
function faceEarStroke(points){
 if(points.length<2){setStatus('귀를 따라 조금 더 길게 그어 주세요.');return}
 const n=clamp(Math.round(points.length/3),6,24),line=Array.from({length:n},(_,i)=>{const [x,y]=spinePoint(points,i/(n-1));return {x,y}});
 if(!faceDraft.length)remember();faceDraft.push(line);
 faces[faceSel].ears=faceDraft.slice(0,2);faceChanged();paintFaces();scheduleSave();
 if(faceDraft.length>=2){faceDraft=[];setMode(placeReturn);setStatus('귀를 그렸습니다.');return}
 setStatus('귀 하나를 그렸습니다. 다른 쪽 귀도 그리거나, 다 됐으면 ‘귀 그리기’를 다시 눌러 마칩니다.');drawOverlay();
}
// 편집 화면 위 표시: 부위를 찍는 동안 이 얼굴의 입·눈썹(찍은 것과 찍는 중인 것)
function drawFaceParts(g,w,h,px){
 if(!['faceMouth','faceBrow','faceEar'].includes(mode))return;
 const f=faces[faceSel];if(!f)return;
 // 찍은 점은 눈 깜빡임 창처럼 또렷하게: 노란 점 + 어두운 테두리 + 순서 번호
 g.save();g.lineWidth=2*px;g.strokeStyle='#ffcf70';g.setLineDash([5*px,4*px]);
 const line=pts=>{g.save();g.strokeStyle='#1d1d24';g.lineWidth=4*px;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x*w,p.y*h):g.moveTo(p.x*w,p.y*h));g.stroke();g.restore();g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p.x*w,p.y*h):g.moveTo(p.x*w,p.y*h));g.stroke()};
 const dot=(p,n)=>{g.save();g.setLineDash([]);g.beginPath();g.arc(p.x*w,p.y*h,6*px,0,Math.PI*2);g.fillStyle='#ffcf70';g.fill();g.lineWidth=2*px;g.strokeStyle='#1d1d24';g.stroke();
  if(n){g.font=`700 ${11*px}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.lineWidth=3*px;g.strokeText(n,p.x*w,p.y*h-14*px);g.fillStyle='#fff';g.fillText(n,p.x*w,p.y*h-14*px)}g.restore()};
 if(mode==='faceMouth'){const m=faceDraft.length?null:f.mouth;if(m){line([m.l,m.c,m.r]);dot(m.l,'1');dot(m.r,'2');dot(m.c,'3')}if(faceDraft.length>1)line(faceDraft.length>2?[faceDraft[0],faceDraft[2],faceDraft[1]]:faceDraft);faceDraft.forEach((p,i)=>dot(p,String(i+1)))}
 if(mode==='faceBrow'||mode==='faceEar'){(faceDraft.length?faceDraft:mode==='faceEar'?f.ears:f.brows).forEach(line);if(gesture?.type===mode)line(gesture.points.map(([x,y])=>({x,y})))}
 g.restore();
}

// ── 4단계: 영역·몸체에서 표정 가져다 쓰기. 고르는 칸은 '얼굴 k · 표정' 목록(얼굴이 하나면 표정 이름만). ──
function faceRefParse(v){const m=/^([0-2]):(\w+)$/.exec(v||'');return m&&faces[+m[1]]&&EXPRS.some(([id])=>id===m[2])?{k:+m[1],id:m[2]}:null}
function faceOptionList(withNone){
 const out=withNone?[['','없음']]:[];
 faces.forEach((_,k)=>{for(const [id,name] of EXPRS)out.push([`${k}:${id}`,faces.length>1?`얼굴 ${k+1} · ${name}`:name])});
 return out;
}
function paintFaceOptions(){
 const show=faceOn&&faces.length>0;
 for(const el of document.querySelectorAll('.faceOnly'))el.hidden=!show;
 for(const [id,none] of [['ambientFaceInput',true],['autoFaceInput',true],['tapFaceInput',false],['comboFaceInput',false]]){
  const sel=$(id),keep=sel.value;
  sel.replaceChildren(...faceOptionList(none).map(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;return o}));
  sel.value=keep;
 }
 $('ambientFaceInput').value=faceRefParse(ambient.face)?ambient.face:'';
 $('ambientFaceAmt').value=ambient.faceAmt;$('ambientFaceAmtValue').textContent=ambient.faceAmt+'%';
 $('ambientFaceAmtRow').hidden=!$('ambientFaceInput').value;
 const z=getSelected();if(z)paintFaceRows(z);
}
function paintFaceRows(z){
 $('hitMarkSizeRow').hidden=!z.hitMark;// 맞은 자리는 얼굴 없이도 쓴다
 if(!$('autoFaceInput').options.length)return;
 for(const [id,key] of [['autoFaceInput','autoFace'],['tapFaceInput','tapFace'],['comboFaceInput','comboFace']])$(id).value=faceRefParse(z[key])?z[key]:id==='autoFaceInput'?'':($(id).options[0]?.value||'');
 $('autoFaceAmtRow').hidden=!faceRefParse(z.autoFace);
 $('tapFaceRows').hidden=!z.tapFaceOn;$('comboRows').hidden=!z.comboOn;$('comboFaceRow').hidden=z.comboMode!=='other';
 for(const b of document.querySelectorAll('.faceTune'))b.disabled=!faceRefParse($(b.dataset.for).value);
}
// 몸체의 평소 표정(전체 하나): 바꾸는 순간 되돌리기 지점
$('ambientFaceInput').onchange=()=>{remember();ambient.face=$('ambientFaceInput').value;paintFaceOptions();scheduleSave();previewMotion()};
$('ambientFaceAmt').addEventListener('pointerdown',()=>remember(),{passive:true});
$('ambientFaceAmt').addEventListener('input',()=>{ambient.faceAmt=Number($('ambientFaceAmt').value);$('ambientFaceAmtValue').textContent=ambient.faceAmt+'%';scheduleSave()});
// [세부 설정]: 고른 얼굴·표정의 상세 세팅 창을 바로 연다
for(const b of document.querySelectorAll('.faceTune'))b.onclick=()=>{const r=faceRefParse($(b.dataset.for).value);if(!r)return;faceSel=r.k;paintFaces();openExprDialog(r.id)};
// 얼굴을 지우면 그 얼굴을 쓰던 칸은 비우고, 뒤 얼굴 번호는 하나씩 당긴다.
function faceRefsAfterRemove(k){
 const fix=(v,fallback)=>{const m=/^([0-2]):(\w+)$/.exec(v||'');if(!m)return v;const i=+m[1];return i===k?fallback(m[2]):i>k?`${i-1}:${m[2]}`:v};
 ambient.face=fix(ambient.face,()=>'');
 for(const z of zones){z.autoFace=fix(z.autoFace,()=>'');z.tapFace=fix(z.tapFace,id=>{z.tapFaceOn=false;return `0:${id}`});z.comboFace=fix(z.comboFace,id=>`0:${id}`)}
}

// 그래픽 기능이 모자라 얼굴판 셰이더를 못 쓰는 기기(또는 그래픽 가속이 없는 브라우저)에서는 휘기·홍조·빨개짐이 안 보인다.
// 그 기능을 쓰려는 순간 한 번 알린다(설정은 그대로 저장되니 다른 기기에서는 보인다).
let faceNoticeShown=false;
function faceSupportNotice(){
 if(faceNoticeShown||(gl&&faceSupported)||!ready)return;
 faceNoticeShown=true;
 showNotice('이 기기에서는 일부 효과가 보이지 않습니다',`이 ${gl?'기기':'브라우저'}의 그래픽 기능으로는 얼굴 표정(눈·눈썹·입 움직임), 홍조, 맞은 자리의 빨개짐을 그릴 수 없습니다. 눈 깜빡임, 땀방울·눈물·만화 기호, 갈라짐은 그대로 됩니다. 설정한 표정은 프로젝트에 저장되므로 다른 기기에서 열면 보입니다.`);
}
$('faceOnInput').addEventListener('change',()=>{if(faceOn)faceSupportNotice()});
$('hitMarkInput').addEventListener('change',()=>{if($('hitMarkInput').value==='red')faceSupportNotice()});
