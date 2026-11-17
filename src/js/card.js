// C: 간단 카드(간단히 / 자세히). 카드는 패널을 줄인 것이 아니라 질문을 바꾼 것이다: "이 부분은 무엇인가요?" 하나가
// 종류·방향·연속 움직임·기본 세기를 한꺼번에 정한다(부위 칩 = 움직임 프리셋을 고르는 다른 얼굴, 값은 영역의 preset 그대로).
// 값은 한 벌: 카드는 영역 속성을 직접 고치는 또 하나의 입력이고, 카드만의 값은 level 하나(zone-schema.js).
// 그리기는 renderCard 한 곳(updateUI·updateValues가 부른다). 매 프레임 그리지 않는다.
var cardReady=false;// renderCard가 이 파일보다 먼저 불릴 수 있어 var(초기화 전 접근 오류를 피한다)
const PARTS=[
 {label:'볼',preset:'jelly',name:'볼'},
 {label:'가슴·배',preset:'breathing',name:'가슴'},
 {label:'머리카락',preset:'wind',name:'머리카락',stroke:true},
 {label:'꼬리',preset:'tail',name:'꼬리',stroke:true},
 {label:'귀',preset:'ear',name:'귀'},
 {label:'옷자락',preset:'scarf',name:'옷자락',stroke:true},
 {label:'기타',preset:'soft',name:''},
];
const EXTRA_PARTS={flow:'흐름·물결',custom:'직접 설정'};// 카드 칩에는 없지만 값이 그것이면 칩 하나를 더 보인다
const LEVEL_F={s:.6,m:1,l:1.5},SPEED_F={slow:.6,mid:1,fast:1.6};
const LEVEL_KEYS=['strength','autoStrength','windStrength','breath','wave','flow','twist'];// 크기가 곱하는 값(자세히에서 손대면 level '')
const AUTO_KEYS=['windStrength','breath','wave','flow','twist'];
const autoStash=new Map();// 저절로를 끄기 직전 값(저장하지 않음, 다시 켜면 되살림)
let knownZoneIds=new Set();// 프로젝트를 열 때 있던 영역: 부위를 묻지 않는다(옛 프로젝트 영역이 전부 '부위 안 정함'으로 보이면 안 된다)
function markZonesKnown(){knownZoneIds=new Set(zones.map(z=>z.id))}
function askPart(z){return !!z&&!z.isBase&&z.preset==='custom'&&!knownZoneIds.has(z.id)}
// 저절로 움직이는가: 한 곳에서 정한다(8 = 영역 이름표가 '호흡'을 다는 기준)
function autoOn(z){return !!z.auto||z.windStrength>0||z.flow>0||z.wave>0||z.twist>0||z.breath>8}
function presetBase(z){
 zoneDefaultsCache??=sanitize({},0);
 const t={...zoneDefaultsCache};
 if(Object.hasOwn(MOTION_PRESETS,z.preset))applyMotionPreset(t,z.preset);
 return t;
}
function fieldClamp(key,v){
 const t=sanitize({[key]:v},0);// 속성표의 범위로 자른다
 return t[key];
}
function speedKey(z){return z.windStrength>0?'windSpeed':z.breath>8?'breathSpeed':'autoSpeed'}
function speedStep(z){
 if(!autoOn(z))return 'off';
 const k=speedKey(z),r=(z[k]||1)/(presetBase(z)[k]||1);
 for(const [s,f] of Object.entries(SPEED_F))if(Math.abs(r-f)<.08)return s;
 return '';
}
function uniquePartName(name,id){
 const used=new Set(zones.filter(z=>z.id!==id).map(z=>z.name));
 if(!used.has(name))return name;
 let n=2;while(used.has(`${name} ${n}`))n++;
 return `${name} ${n}`;
}
function setLevel(z,lv){
 const base=presetBase(z),f=LEVEL_F[lv],off=!autoOn(z);
 for(const k of LEVEL_KEYS){
  if(off&&AUTO_KEYS.includes(k))continue;
  z[k]=fieldClamp(k,base[k]*f);
 }
 z.level=lv;
}
function setAutoStep(z,step){
 if(step==='off'){
  if(autoOn(z))autoStash.set(z.id,Object.fromEntries(['auto',...AUTO_KEYS].map(k=>[k,z[k]])));
  z.auto=false;
  for(const k of AUTO_KEYS)z[k]=0;
  return;
 }
 if(!autoOn(z)){
  const stash=autoStash.get(z.id);
  if(stash)Object.assign(z,stash);
  else{const base=presetBase(z),f=LEVEL_F[z.level]||1;for(const k of AUTO_KEYS)z[k]=fieldClamp(k,base[k]*f)}
  if(!autoOn(z)){z.auto=true;z.autoAxis='y'}// 연속 움직임이 없는 부위(볼·귀·기타)는 위아래로
 }
 const k=speedKey(z);
 z[k]=fieldClamp(k,(presetBase(z)[k]||1)*SPEED_F[step]);
}
// 부위를 고르면: 그 부위 프리셋 값으로 덮고(손댄 값이 있으면 먼저 확인), 이름을 붙이고, 스스로 한 번 튕겨 보인다(소리 없이)
async function choosePart(part){
 const z=getSelected();
 if(!z||z.isBase)return;
 if(z.preset===part.preset&&z.level)return;
 const from=PARTS.find(p=>p.preset===z.preset)?.label||EXTRA_PARTS[z.preset]||'지금';
 if(!askPart(z)&&z.level===''){
  const ok=await askConfirm({title:'움직임 값 바꾸기',message:`‘${from}’에서 직접 맞춘 움직임 값을 ‘${part.label}’ 기본값으로 바꿀까요? 되돌리기로 돌아올 수 있습니다.`,ok:'바꾸기'});
  if(!ok)return;
 }
 remember();
 applyMotionPreset(z,part.preset);
 z.level='m';
 autoStash.delete(z.id);
 if(part.name&&/^영역 \d+$/.test(z.name))z.name=uniquePartName(part.name,z.id);
 markMask();updateUI();scheduleSave();
 impact(z,1,null,null,true);
 if(part.stroke){
  setMode('spine');
  setStatus('붙어 있는 곳에서 끝까지 한 번 그어 주세요. 건너뛰어도 됩니다.');
 }else{
  previewMotion();
  setStatus('다른 부위도 넣으려면 ‘+ 다른 부위’.');
 }
}
// 교체 선택으로 이미 있던 영역의 모양이 바뀐 순간 알린다(동작은 그대로, 사용자 결정 4)
function replacedNotice(z){
 if(!z||askPart(z))return;
 const name=z.name;
 setTimeout(()=>setStatus(`‘${name}’의 모양을 바꿨습니다. 새 부위를 만들려면 ‘+ 다른 부위’를 누르세요.`),0);
}
function cardEdit(fn){
 const z=getSelected();if(!z)return;
 remember();fn(z);markMask();updateUI();scheduleSave();previewMotion();
}
// 간단히 / 자세히: 프로젝트가 아니라 브라우저에 기억(처음 온 사람은 간단히)
function panelMode(){try{return localStorage.getItem('motionpad-panel')==='detail'?'detail':'simple'}catch(_){return 'simple'}}
function setPanelMode(m){
 try{localStorage.setItem('motionpad-panel',m)}catch(_){}
 paintPanelMode();
}
function paintPanelMode(){
 const simple=panelMode()==='simple';
 document.querySelector('.side').classList.toggle('simple',simple);
 document.querySelector('.workspace').classList.toggle('simpleMode',simple);
 if(ready&&!viewerOpen)requestAnimationFrame(fit);
}
function segPaint(box,value){for(const b of box.querySelectorAll('button')){const on=b.dataset.v===value;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))}}
function renderCard(){
 if(!cardReady)return;
 const z=getSelected(),none=!zones.length;
 const zonesBox=$('cardZones');
 if(none){const t=document.createElement('span');t.className='cardTitle';t.textContent='움직일 곳을 골라 보세요';zonesBox.replaceChildren(t)}
 else{
  const add=document.createElement('button');
  add.type='button';add.className='chip cardAdd';add.textContent='+ 다른 부위';
  add.onclick=()=>$('newRegionBtn').click();
  zonesBox.replaceChildren(...zones.map(zoneItem),add);
 }
 $('cardEmpty').hidden=!none;
 const ask=askPart(z),part=!!z&&!z.isBase;
 $('cardAsk').hidden=!ask;
 $('cardParts').hidden=!part;
 $('cardBaseNote').hidden=!(z&&z.isBase);
 $('cardSizeRow').hidden=$('cardAutoRow').hidden=!part||ask;
 $('cardIdle').hidden=part;
 $('cardFace').hidden=!!z||faceOn;
 $('cardBreath').checked=$('ambientOn').checked;
 if(!part)return;
 const chips=PARTS.map(p=>{
  const b=document.createElement('button');
  b.type='button';b.className='chip';b.textContent=p.label;
  const on=!ask&&z.preset===p.preset;
  b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  b.onclick=()=>choosePart(p);
  return b;
 });
 if(!ask&&EXTRA_PARTS[z.preset]){
  const b=document.createElement('button');
  b.type='button';b.className='chip on';b.textContent=EXTRA_PARTS[z.preset];b.setAttribute('aria-pressed','true');
  chips.push(b);
 }
 $('cardParts').replaceChildren(...chips);
 if(ask)return;
 segPaint($('cardSize'),z.level);
 $('cardSize').querySelector('.segCustom').hidden=z.level!=='';
 segPaint($('cardAuto'),speedStep(z));
 const stroke=PARTS.find(p=>p.preset===z.preset)?.stroke;
 $('cardStroke').hidden=!stroke;
 $('cardStroke').textContent=z.spine?.length?'방향 다시 긋기':'방향 긋기';
}
$('cardDetailBtn').onclick=()=>setPanelMode('detail');
$('cardSimpleBtn').onclick=()=>setPanelMode('simple');
$('cardWand').onclick=()=>{$('newRegionBtn').click();setMode('wand');setStatus('움직일 부분을 그림에서 눌러 주세요.')};
$('cardLasso').onclick=()=>{$('newRegionBtn').click();setMode('lasso');setStatus('움직일 부분을 대략 둘러 그려 주세요. 윤곽에 맞춰 선택됩니다.')};
$('cardStroke').onclick=()=>{setMode('spine');setStatus('붙어 있는 곳에서 끝까지 한 번 그어 주세요.')};
$('cardFace').onclick=()=>{setPanelMode('detail');if(!faceOn)$('faceAddBtn').click();$('facePanel').scrollIntoView({block:'nearest'})};
$('cardBreath').onchange=e=>{const a=$('ambientOn');if(a.checked!==e.target.checked){a.checked=e.target.checked;a.dispatchEvent(new Event('change',{bubbles:true}))}};
for(const b of $('cardSize').querySelectorAll('button[data-v]:not(.segCustom)'))b.onclick=()=>cardEdit(z=>setLevel(z,b.dataset.v));
for(const b of $('cardAuto').querySelectorAll('button'))b.onclick=()=>cardEdit(z=>setAutoStep(z,b.dataset.v));
$('ambientOn').addEventListener('change',renderCard);
cardReady=true;
paintPanelMode();
renderCard();
