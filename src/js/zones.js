function stateSnapshot(){return JSON.stringify({zones:zones.map(clean),selected,base:{clip:baseClipEnabled,exclude:baseBackgroundExclude,edge:baseEdge},ambient:{...ambient},mask:{color:$('maskColorInput').value,opacity:$('maskOpacityInput').value},face:faceHistory()})}
// E5: 표정 창은 창을 연 뒤에 쌓인 기록만 되돌린다. 바닥 = 창을 열 때 기록 깊이(앞에서 밀려난 칸 수를 더한 절대 위치).
let historyShifts=0,exprUndoFloor=Infinity,exprRedoFloor=0;
function exprCanUndo(){return undoStack.length+historyShifts>exprUndoFloor}
function exprCanRedo(){return redoStack.length>exprRedoFloor}
function setExprHistoryFloor(){exprUndoFloor=undoStack.length+historyShifts;exprRedoFloor=redoStack.length}
function pushHistory(snap){
 undoStack.push(snap);
 while(undoStack.length>35||undoStack.reduce((n,v)=>n+v.length,0)>9_000_000){undoStack.shift();historyShifts++}
 redoStack=[];
}
function historyUndo(){if(!undoStack.length)return false;redoStack.push(stateSnapshot());historyApply(undoStack.pop());return true}
function historyRedo(){if(!redoStack.length)return false;undoStack.push(stateSnapshot());historyApply(redoStack.pop());return true}
function refreshHistory(){
 $('undoBtn').disabled=!undoStack.length&&!(mode==='lasso'&&lassoSegments.length);$('redoBtn').disabled=!redoStack.length;
 exprRedoFloor=Math.min(exprRedoFloor,redoStack.length);
 $('exprUndo').disabled=!exprCanUndo();$('exprRedo').disabled=!exprCanRedo();
}
function remember(){pendingHistory=null;const snap=stateSnapshot();if(snap===lastHistoryJSON||undoStack[undoStack.length-1]===snap)return;if(!lastHistoryJSON)lastHistoryJSON=snap;pushHistory(snap);refreshHistory();lastHistoryJSON=''}
// E4: 막대·고르는 칸은 누르거나 초점이 갈 때 그때 모습을 들고만 있다가, 값이 실제로 바뀐 첫 순간에 기록에 넣는다.
// (만지기만 하고 값을 안 바꾸면 되돌리기 칸이 생기지 않는다)
let pendingHistory=null;
function rememberOnChange(el){
 pendingHistory={snap:stateSnapshot(),el};
}
function commitPendingHistory(){
 if(!pendingHistory)return;
 const {snap}=pendingHistory;
 pendingHistory=null;
 if(undoStack[undoStack.length-1]===snap)return;
 pushHistory(snap);
 lastHistoryJSON='';
 refreshHistory();
}
document.addEventListener('input',commitPendingHistory,true);
document.addEventListener('change',commitPendingHistory,true);
document.addEventListener('focusout',e=>{if(pendingHistory?.el===e.target)pendingHistory=null},true);
function historyApply(snap){pendingHistory=null;const d=JSON.parse(snap);if(d.face)applyFaceHistory(d.face);zones=d.zones.slice(0,LIMIT).map(sanitize);normalizeBaseOrder();baseClipEnabled=!!d.base?.clip;baseBackgroundExclude=d.base?.exclude!==false;baseEdge=clamp(d.base?.edge??1,0,8);lastBaseSignature='';selected=d.selected;if(!getSelected())selected=zones[0]?.id||null;if(d.ambient){Object.assign(ambient,d.ambient);$('ambientOn').checked=ambient.enabled;for(const [k,id] of [['breath','ambientBreath'],['sway','ambientSway'],['light','ambientLight']])$(id).value=ambient[k];updateAmbientLabels();paintFaceOptions()}if(d.mask){$('maskColorInput').value=d.mask.color;$('maskOpacityInput').value=d.mask.opacity;$('maskOpacityValue').textContent=d.mask.opacity+'%'}markMask();updateUI();refreshBaseUI();scheduleSave();refreshHistory();leaveFacePlaceMode()}
$('undoBtn').onclick=()=>{if(mode==='lasso'&&lassoSegments.length){$('lassoUndo').click();return}clearSelectionDrafts();if(historyUndo())setStatus('실행 취소했습니다.')};
$('redoBtn').onclick=()=>{clearSelectionDrafts();if(historyRedo())setStatus('다시 실행했습니다.')};
function recalcPolygon(z){let x0=1,y0=1,x1=0,y1=0;for(const p of z.polygon){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1])}z.x=(x0+x1)/2;z.y=(y0+y1)/2;z.rx=Math.max(.009,(x1-x0)/2);z.ry=Math.max(.009,(y1-y0)/2)}
function getBase(){return zones.find(z=>z.isBase)||null}
function normalizeBaseOrder(){let seen=false;for(const z of zones){if(z.isBase){if(seen)z.isBase=false;else seen=true}}zones.sort((a,b)=>Number(!!b.isBase)-Number(!!a.isBase));}
function getSelected(){return zones.find(z=>z.id===selected)||null}
function radiusXY(r){const m=Math.min(renderWidth,renderHeight);return [r*m/renderWidth,r*m/renderHeight]}
function recalcBounds(z){if(z.kind!=='brush'||!z.strokes.length)return;let x0=1,y0=1,x1=0,y1=0;for(const st of z.strokes){const [rx,ry]=radiusXY(st.r);for(const p of st.points){x0=Math.min(x0,p[0]-rx);y0=Math.min(y0,p[1]-ry);x1=Math.max(x1,p[0]+rx);y1=Math.max(y1,p[1]+ry)}}z.x=(x0+x1)/2;z.y=(y0+y1)/2;z.rx=Math.max(.009,(x1-x0)/2);z.ry=Math.max(.009,(y1-y0)/2)}
function markMask(){maskDirty=true}
// 3-I: 몸체 지정은 '완장'(1. 영역의 버튼), 움직일 대상(이미지 전체/몸체)은 3. 몸체 움직이기에서 고른다. 대상 = 기존 '배경 제외' 값.
function refreshBaseUI(){
 const z=getBase(),sel=getSelected(),bodyOn=!!z&&baseBackgroundExclude,on=$('ambientOn').checked;
 $('markBaseBtn').textContent=sel?.isBase?'몸체 지정 해제':'이 영역을 몸체로 지정';
 $('baseHint').textContent=sel?.isBase?'':z?`지금 몸체: ${z.name}`:'몸체가 없습니다(그림 전체가 움직입니다).';
 $('baseClipRow').hidden=!sel?.isBase;$('baseClipInput').checked=baseClipEnabled;
 for(const r of document.querySelectorAll('input[name="bodyTarget"]')){r.checked=(r.value==='body')===bodyOn;if(r.value==='body'){r.disabled=!z;r.parentElement.classList.toggle('dimOff',!z)}}
 $('bodyTargetHint').hidden=!!z;$('baseEdgeRow').hidden=!bodyOn;
 for(const id of ['bodyTarget','baseEdgeRow','ambientFx'])$(id).classList.toggle('dimOff',!on);
 $('baseEdgeInput').value=baseEdge;$('baseEdgeVal').textContent=String(baseEdge);
 $('bodyState').textContent=!on?'꺼짐':bodyOn?`몸체: ${z.name}`:'그림 전체';
}
$('markBaseBtn').onclick=()=>{
 const z=getSelected();if(!z)return;remember();
 if(z.isBase){z.isBase=false;baseClipEnabled=false;}else{
   for(const v of zones)v.isBase=false;
   z.isBase=true;baseBackgroundExclude=true;// 완장을 채우면 움직일 대상도 몸체로. 0-2: 경계 부드러움·바깥 확장 값을 덮어쓰지 않는다
 }
 normalizeBaseOrder();lastBaseSignature='';markMask();updateUI();scheduleSave();
 setStatus(z.isBase?'몸체로 지정했습니다. 이제 몸체만 움직이고 배경은 고정됩니다.':'몸체 지정을 해제했습니다.');
};
$('baseClipInput').onchange=e=>{remember();baseClipEnabled=e.target.checked;markMask();scheduleSave();setStatus(baseClipEnabled?'자동 크롭을 적용했습니다. 원본 마스크는 유지됩니다.':'자동 크롭을 해제해 원본 영역을 복원했습니다.')};
for(const r of document.querySelectorAll('input[name="bodyTarget"]'))r.onchange=()=>{if(!r.checked)return;remember();baseBackgroundExclude=r.value==='body';markMask();scheduleSave();refreshBaseUI();setStatus(baseBackgroundExclude?'몸체만 움직이고 배경은 고정됩니다.':'배경까지 그림 전체가 움직입니다.')};
$('baseEdgeInput').oninput=e=>{baseEdge=Number(e.target.value);$('baseEdgeVal').textContent=String(baseEdge);markMask();scheduleSave()};
function updateValues(){const z=getSelected();if(!z)return;$('zoneList').replaceChildren(...zones.map(zoneItem));for(const {key,ui} of ZONE_UI)if(ui.output)$(ui.output).textContent=(ui.fmt||String)(z[key]);updateQuickMotion(z);paintFaceRows(z);for(const d of document.querySelectorAll('.dirDial'))d.paint?.();refreshChangedMarks();renderCard()}
// 2-F: 영역 목록. PC는 세로 목록(이름 + 켜진 효과 이름표 + 잠금), 폰은 가로 이름표(CSS). 몸체는 늘 맨 앞.
function zoneTags(z){const t=[],pc=v=>`${Math.round(v)}%`;
 if(z.isBase)t.push(['몸체','움직일 몸체']);
 if(z.tailCutout)t.push(['채움','빈자리 채우기']);
 if(z.auto)t.push(['자동',`자동으로 움직이기 · 속도 ${Number(z.autoSpeed).toFixed(1)}`]);
 if(z.windStrength>0)t.push(['바람',`바람 강도 ${pc(z.windStrength)}`]);
 if(z.flow>0)t.push(['흐름',`흐름 ${z.flow}`]);
 if(z.breath>8||z.preset==='breathing')t.push(['호흡',`호흡 ${z.breath}`]);// 기본값(8) 이하의 약한 호흡은 모든 영역에 있어 표시하지 않는다
 if(z.wave>0)t.push(['물결',`물결 ${z.wave}`]);
 if(z.twist>0)t.push(['비틀림',`비틀림 ${z.twist}`]);
 if(z.ripple>0)t.push(['파동',`터치 파동 ${z.ripple}`]);
 if(!z.isBase&&z.strength>0&&z.pull>0)t.push(['당김',`잡아당김 ${pc(z.pull)} · 반응 세기 ${z.strength}`]);
 return t}
function zoneItem(item){const b=document.createElement('button');b.type='button';b.className='chip zoneItem'+(item.id===selected?' active':'')+(item.isBase?' baseChip':'');b.setAttribute('role','option');b.setAttribute('aria-selected',String(item.id===selected));
 const name=document.createElement('span');name.className='zoneName';name.textContent=item.name;if(item.isBase){const star=document.createElement('span');star.className='baseMark';star.textContent='★ ';star.setAttribute('aria-label','몸체');name.prepend(star)}
 const tags=document.createElement('span');tags.className='zoneTags';const list=zoneTags(item);for(const [label,tip] of list){const s=document.createElement('span');s.className='zoneTag';s.textContent=label;s.title=tip;tags.append(s)}
 b.title=[item.name,...list.map(t=>t[1]),...(item.locked?['잠금']:[])].join('\n');
 b.append(name,tags);if(item.locked){const lock=document.createElementNS('http://www.w3.org/2000/svg','svg');lock.setAttribute('class','ic zoneLock');lock.setAttribute('aria-label','잠금');const u=document.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#i-lock');lock.append(u);b.append(lock)}
 b.onclick=()=>{clearSelectionDrafts();selected=item.id;updateUI()};b.oncontextmenu=e=>{e.preventDefault();clearTimeout(pressTimer);selected=item.id;updateUI();showZoneMenu(item)};let pressTimer=null;b.addEventListener('pointerdown',()=>{clearTimeout(pressTimer);pressTimer=setTimeout(()=>{selected=item.id;updateUI();showZoneMenu(item)},620)});for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>clearTimeout(pressTimer));return b}
function updateUI(){const z=getSelected(),base=getBase();$('zoneCount').textContent=`${zones.length}개`;$('zoneList').replaceChildren(...zones.map(zoneItem));$('zoneList').hidden=!zones.length;
 refreshBaseUI();$('partsName').textContent=z?z.name:'';
 paintNoZoneGuide();$('noZone').hidden=!!z;$('editFields').hidden=$('zoneDetail').hidden=$('motionFields').hidden=!z;$('noZoneMotion').hidden=!!z;refreshBaseUI();renderCard();if(!z)return;for(const {key,ui} of ZONE_UI){const node=$(ui.input),val=ui.toInput?ui.toInput(z[key]):z[key];if(ui.check)node.checked=val;else node.value=val}updateValues()}
// 0-2: prompt() 대신 앱 자체 메뉴
let zoneMenuTarget=null;
function showZoneMenu(z){if(!z||$('zoneMenuDialog').open)return;zoneMenuTarget=z.id;$('zoneMenuTitle').textContent=`‘${z.name}’ 영역`;$('zoneMenuLock').textContent=z.locked?'잠금 해제':'잠금';$('zoneMenuDialog').showModal()}
function zoneMenuAction(action){const z=zones.find(a=>a.id===zoneMenuTarget);$('zoneMenuDialog').close();zoneMenuTarget=null;if(!z)return;selected=z.id;if(action==='duplicate')duplicateZone();else if(action==='delete')deleteZone();else if(action==='lock'){remember();z.locked=!z.locked;updateUI();scheduleSave()}}
$('zoneMenuDuplicate').onclick=()=>zoneMenuAction('duplicate');$('zoneMenuDelete').onclick=()=>zoneMenuAction('delete');$('zoneMenuLock').onclick=()=>zoneMenuAction('lock');
$('effects').open=false;
$('clearBranchBtn').onclick=()=>{const z=getSelected();if(!z||z.locked)return;remember();z.branch=[];z.branchNodes=null;updateUI();scheduleSave();setStatus('가지 선을 삭제했습니다.')};
$('clearExtraPivotsBtn').onclick=async()=>{const z=getSelected();if(!z||z.locked||!z.extraPivots?.length)return;if(!await askConfirm({title:'추가 축 삭제',message:`‘${z.name}’ 영역에 놓은 추가 축 ${z.extraPivots.length}개를 모두 지울까요?`,ok:'추가 축 삭제'}))return;remember();z.extraPivots=[];updateUI();scheduleSave();setStatus('추가 축을 삭제했습니다.')};


// 3-M: 축·가이드 선은 화면을 바꾸지 않고 그 자리에서 지정한다. 같은 버튼을 다시 누르면 하던 도구로 돌아간다.
for(const [id,m] of [['pivotMode','pivot'],['extraPivotMode','extraPivot'],['spineMode','spine']])$(id).onclick=()=>setMode(mode===m&&!touchPreview?placeReturn:m);
$('branchMode').onclick=()=>setMode('branch');$('panMode').onclick=()=>setMode('pan');
$('brushMode').onclick=()=>setMode('brush');$('eraseMode').onclick=()=>setMode('erase');$('wandMode').onclick=()=>setMode('wand');$('lassoMode').onclick=()=>setMode('lasso');$('ellipseMode').onclick=()=>setMode('ellipse');$('editMode').onclick=()=>setMode('edit');$('showZones').onchange=()=>{};
$('brushInput').oninput=e=>{brushSize=Number(e.target.value);$('brushValue').textContent=brushSize+'%'};$('toleranceInput').oninput=e=>$('toleranceValue').textContent=e.target.value;$('magnetInput').oninput=e=>$('magnetValue').textContent=e.target.value+'%';
for(const {key,ui} of ZONE_UI){const id=ui.input,conv=ui.fromInput||(ui.check?x=>x:Number);$(id).addEventListener(ui.event||'input',e=>{const z=getSelected();if(!z)return;const value=conv(ui.check?e.target.checked:e.target.value);if(z[key]===value)return;z[key]=value;if(LEVEL_KEYS.includes(key))z.level='';if(ui.mask)markMask();if(key==='name')updateUI();else updateValues();scheduleSave();if(!ui.noPreview)previewMotion()})}
for(const {ui} of ZONE_UI){const e=$(ui.input);e.addEventListener('pointerdown',ev=>{if(getSelected())rememberOnChange(ev.currentTarget)},{passive:true});e.addEventListener('focus',ev=>{if(getSelected())rememberOnChange(ev.currentTarget)})}
async function deleteZone(){const z=getSelected();if(!z)return;if(!await askConfirm({title:'영역 삭제',message:`‘${z.name}’ 영역과 그 움직임 설정을 지울까요? 실행 취소로 되돌릴 수 있습니다.`,ok:'영역 삭제'}))return;if(!zones.includes(z))return;remember();zones=zones.filter(a=>a.id!==z.id);if(z.isBase){baseClipEnabled=false;lastBaseSignature=''}selected=zones[0]?.id||null;updateUI();markMask();scheduleSave()}
$('toolDeleteBtn').onclick=()=>{if(!getSelected()){setStatus('지울 영역을 먼저 선택해 주세요.');return}deleteZone()};$('toolDuplicateBtn').onclick=()=>{if(!getSelected()){setStatus('복제할 영역을 먼저 선택해 주세요.');return}duplicateZone()};function duplicateZone(){const z=getSelected();if(!z)return;if(zones.length>=LIMIT){setStatus('영역 개수 제한입니다.');return}remember();const copy=structuredClone(clean(z));copy.tailCutout=false;copy.isBase=false;copy.id=newId();copy.name=z.name+' 복사';copy.x=clamp(copy.x+.03,0,1);copy.y=clamp(copy.y+.03,0,1);if(copy.pivotX!=null)copy.pivotX=clamp(copy.pivotX+.03,0,1);if(copy.pivotY!=null)copy.pivotY=clamp(copy.pivotY+.03,0,1);if(Array.isArray(copy.spine))copy.spine.forEach(p=>{p[0]=clamp(p[0]+.03,0,1);p[1]=clamp(p[1]+.03,0,1)});if(Array.isArray(copy.branch))copy.branch.forEach(p=>{p[0]=clamp(p[0]+.03,0,1);p[1]=clamp(p[1]+.03,0,1)});if(Array.isArray(copy.extraPivots))copy.extraPivots.forEach(p=>{p[0]=clamp(p[0]+.03,0,1);p[1]=clamp(p[1]+.03,0,1)});if(copy.kind==='brush')copy.strokes.forEach(st=>st.points.forEach(p=>{p[0]=clamp(p[0]+.03,0,1);p[1]=clamp(p[1]+.03,0,1)}));if(copy.kind==='polygon')copy.polygon.forEach(p=>{p[0]=clamp(p[0]+.03,0,1);p[1]=clamp(p[1]+.03,0,1)});const zz=sanitize(copy,zones.length);if(zz.kind==='raster'){rasterize(zz);recalcRaster(zz)}zones.push(zz);selected=zz.id;markMask();updateUI();scheduleSave();setMode('edit')}
// 선택 방식(1-A): 교체(값 new) = 선택한 영역의 모양을 바꿈(움직임 설정은 유지), 더하기, 빼기. 선택한 영역이 없으면 새 영역.
// 3-M: 새 영역 이름은 도구와 상관없이 '영역 N'(겹치지 않는 번호)
function nextZoneName(){const names=new Set(zones.map(z=>z.name));let n=zones.length+1;while(names.has(`영역 ${n}`))n++;return `영역 ${n}`}
function selectOp(){return document.querySelector('input[name="selectOp"]:checked')?.value||'new'}
function setSelectOp(op){const r=document.querySelector(`input[name="selectOp"][value="${op}"]`);if(r)r.checked=true}
function editableSelected(){const z=getSelected();return z&&!z.locked?z:null}
// 도형 추가(타원·사각형). shape = {kind:'ellipse',x,y,rx,ry} 또는 {kind:'polygon',polygon:[[x,y],...]}(사각형은 꼭짓점 4개)
function addShape(shape){
 const z=editableSelected(),op=selectOp();
 if(z&&op==='new'){// 모양만 바꾸고 움직임 설정은 유지. 도형 모양 그대로 둬서 나중에 손잡이로 다듬을 수 있게 한다
  remember();
  if(shape.kind==='ellipse')Object.assign(z,{kind:'ellipse',x:shape.x,y:shape.y,rx:shape.rx,ry:shape.ry,rot:0,scale:1,baseX:shape.x,baseY:shape.y,runs:[],strokes:[],polygon:[]});
  else{Object.assign(z,{kind:'polygon',polygon:shape.polygon.map(p=>p.slice()),rot:0,scale:1,runs:[],strokes:[]});recalcPolygon(z);z.baseX=z.x;z.baseY=z.y}
  markMask();updateUI();scheduleSave();replacedNotice(z);return true}
 if(z||op==='subtract'){const temp=sanitize(shape,zones.length);return applySelectionBits(rasterize(temp))}
 if(zones.length>=LIMIT){setStatus(`영역 최대 ${LIMIT}개`);return false}
 remember();const n=sanitize({id:newId(),name:nextZoneName(),...shape},zones.length);zones.push(n);selected=n.id;markMask();updateUI();scheduleSave();return true}
function addEllipse(x,y,rx=.12,ry=.12){return addShape({kind:'ellipse',x,y,rx,ry})}
function bitsToRuns(bits){const runs=[];let i=0;while(i<bits.length){if(!bits[i]){i++;continue}let st=i;while(i<bits.length&&bits[i])i++;runs.push([st,i-st])}return runs}
function runsToBits(runs){const bits=new Uint8Array(TILE*TILE);for(const [st,len] of runs||[])bits.fill(1,clamp(st,0,bits.length),clamp(st+len,0,bits.length));return bits}
function rawMaskCanvas(z){const c=document.createElement('canvas');c.width=c.height=TILE;const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='white';g.strokeStyle='white';if(z.kind==='ellipse'){g.beginPath();g.ellipse(z.x*TILE,z.y*TILE,Math.max(1,z.rx*TILE),Math.max(1,z.ry*TILE),z.rot||0,0,2*Math.PI);g.fill()}else if(z.kind==='brush'){for(const st of z.strokes)strokePath(g,st,TILE,TILE)}else if(z.kind==='polygon'){if(z.polygon.length){g.beginPath();g.moveTo(z.polygon[0][0]*TILE,z.polygon[0][1]*TILE);for(const p of z.polygon.slice(1))g.lineTo(p[0]*TILE,p[1]*TILE);g.closePath();g.fill()}}else if(z.kind==='raster'){const a=g.createImageData(TILE,TILE);const bits=runsToBits(z.runs);for(let i=0;i<bits.length;i++)if(bits[i]){let j=i*4;a.data[j]=a.data[j+1]=a.data[j+2]=a.data[j+3]=255}const raw=document.createElement('canvas');raw.width=raw.height=TILE;raw.getContext('2d').putImageData(a,0,0);g.save();g.translate(z.x*TILE,z.y*TILE);g.rotate(z.rot||0);g.scale(z.scale||1,z.scale||1);g.translate(-(z.baseX??z.x)*TILE,-(z.baseY??z.y)*TILE);g.drawImage(raw,0,0);g.restore() }return c}
function rasterize(z){if(z.kind==='raster'){if(Math.abs((z.x||0)-(z.baseX??z.x))>1e-7||Math.abs((z.y||0)-(z.baseY??z.y))>1e-7||Math.abs((z.scale||1)-1)>1e-7||Math.abs(z.rot||0)>1e-7){const c=rawMaskCanvas(z),a=c.getContext('2d').getImageData(0,0,TILE,TILE).data,bits=new Uint8Array(TILE*TILE);for(let i=0;i<bits.length;i++)bits[i]=a[i*4+3]>100?1:0;z.runs=bitsToRuns(bits);z.baseX=z.x;z.baseY=z.y;z.scale=1;z.rot=0;recalcRaster(z)}return runsToBits(z.runs)}const c=rawMaskCanvas(z),a=c.getContext('2d').getImageData(0,0,TILE,TILE).data,bits=new Uint8Array(TILE*TILE);for(let i=0;i<bits.length;i++)bits[i]=a[i*4+3]>100?1:0;z.kind='raster';z.runs=bitsToRuns(bits);z.strokes=[];z.polygon=[];z.baseX=z.x;z.baseY=z.y;z.scale=1;z.rot=0;return bits}
function paintBits(bits,points,r,subtract){const c=document.createElement('canvas');c.width=c.height=TILE;const g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='white';g.strokeStyle='white';strokePath(g,{points,r},TILE,TILE);const a=g.getImageData(0,0,TILE,TILE).data;for(let i=0;i<bits.length;i++)if(a[i*4+3]>75)bits[i]=subtract?0:1}
function recalcRaster(z){const bits=runsToBits(z.runs);let minX=TILE,minY=TILE,maxX=0,maxY=0,hit=false;for(let i=0;i<bits.length;i++)if(bits[i]){const x=i%TILE,y=(i/TILE)|0;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);hit=true}if(hit){z.x=(minX+maxX)/(2*TILE);z.y=(minY+maxY)/(2*TILE);z.rx=Math.max(.009,(maxX-minX)/(2*TILE));z.ry=Math.max(.009,(maxY-minY)/(2*TILE));z.baseX=z.x;z.baseY=z.y;z.rot=0;z.scale=1}}
function addBrush(points,r){const sel=getSelected(),append=sel&&!sel.locked;// 붓은 선택 방식과 무관하게 선택한 영역에 더한다(빼기는 지우개)
if(!append&&zones.length>=LIMIT){setStatus(`영역은 최대 ${LIMIT}개까지입니다.`);return}remember();if(append){{const bits=rasterize(sel);paintBits(bits,points,r,false);sel.runs=bitsToRuns(bits);recalcRaster(sel)}}else{const z=sanitize({id:newId(),name:nextZoneName(),kind:'brush',strokes:[{points,r}]},zones.length);zones.push(z);selected=z.id}markMask();updateUI();scheduleSave()}
function eraseBrush(points,r){const z=getSelected();if(!z){setStatus('먼저 지울 영역을 선택해 주세요.');return}if(z.locked){setStatus('잠긴 영역은 편집할 수 없습니다.');return}remember();const bits=rasterize(z);paintBits(bits,points,r,true);z.runs=bitsToRuns(bits);recalcRaster(z);markMask();updateUI();scheduleSave()}
function applySelectionBits(bits){const name=nextZoneName();
 const z=editableSelected(),op=selectOp();
 if(z){
  let result;
  if(op==='new')result=bits;
  else{result=rasterize(z);for(let i=0;i<bits.length;i++)if(bits[i])result[i]=op==='subtract'?0:1;}
  if(!result.some(Boolean)){setStatus(op==='subtract'?'모두 빼면 영역이 비게 됩니다. 영역을 지우려면 영역 메뉴의 삭제를 쓰세요.':'선택된 부분이 없습니다.');return false}
  remember();
  Object.assign(z,{kind:'raster',runs:bitsToRuns(result),strokes:[],polygon:[]});recalcRaster(z);
  if(op==='new')replacedNotice(z);
 }else{
  if(op==='subtract'){setStatus('뺄 영역을 먼저 선택해 주세요.');return false}
  if(zones.length>=LIMIT){setStatus('영역 개수 제한입니다.');return false}
  remember();const n=sanitize({id:newId(),kind:'raster',name,x:.5,y:.5,rx:.25,ry:.25,runs:bitsToRuns(bits)},zones.length);recalcRaster(n);zones.push(n);selected=n.id;
 }
 markMask();updateUI();scheduleSave();return true}
// A-7: 영역이 하나도 없으면 패널에는 안내 한 줄과 '3. 몸체 움직이기'만(1·4와 꺼진 얼굴 칸은 영역이 생기면 나타난다). 보이기만 바꾼다.
function paintNoZoneGuide(){
 const none=!zones.length;
 $('noZoneGuide').hidden=!none;
 $('zonesPanel').hidden=none;
 $('partsPanel').hidden=none;
 $('facePanel').hidden=none&&!faceOn;
}
// A-8: 숫자는 평소 항목 글자색, 기준값과 다를 때만 강조색(내가 뭘 바꿨는지 보이게). 기준값은 여기 한 곳에서 정한다.
// 영역 값 = 그 영역의 프리셋 값(직접 설정이면 속성표 기본값), 몸체 = 기본값, 그 밖의 막대 = HTML에 적힌 처음 값. 표정 창은 face-dialog.js(그 표정의 프리셋 값).
let zoneDefaultsCache=null;
function zoneBaseline(z,key){
 zoneDefaultsCache??=sanitize({},0);
 const t={...zoneDefaultsCache};
 if(Object.hasOwn(MOTION_PRESETS,z.preset))applyMotionPreset(t,z.preset);
 return t[key];
}
function valueBaseline(input){
 const link=QUICK_LINKS.find(([id])=>id===input.id);
 if(link)return valueBaseline($(link[1]));
 const f=ZONE_UI.find(f=>f.ui.input===input.id);
 if(f){
  const z=getSelected();
  if(!z)return null;
  const b=zoneBaseline(z,f.key);
  return f.ui.toInput?f.ui.toInput(b):b;
 }
 const amb={ambientBreath:'breath',ambientSway:'sway',ambientLight:'light',ambientFaceAmt:'faceAmt'}[input.id];
 if(amb)return AMBIENT_DEFAULT[amb];
 return input.defaultValue;
}
function sameNumber(a,b){return Math.abs(Number(a)-Number(b))<1e-6}
function markOutput(out){
 if(out.closest('.exprSlider'))return;
 const input=out.closest('.field')?.querySelector('input[type=range]');
 if(!input)return;
 const base=valueBaseline(input);
 out.classList.toggle('changed',base!=null&&!sameNumber(input.value,base));
}
function refreshChangedMarks(){for(const o of document.querySelectorAll('output'))markOutput(o)}
document.addEventListener('input',e=>{const o=e.target.closest?.('.field')?.querySelector('output');if(o)markOutput(o)});
