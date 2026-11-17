// Ambient and audio UI are deliberately independent of the selected region.
const AMBIENT_DEFAULT={enabled:true,breath:35,sway:30,light:0,face:'',faceAmt:50,idleFace:'',idleEvery:'mid'};// F-3 idleFace·idleEvery: 가끔 짓는 표정
const ambient={...AMBIENT_DEFAULT};// 3-M: 조명 숨쉬기는 체감되지 않아 뺐다(늘 0)
let playerVisible=true, sfxType=SFX_DEFAULT, zoomLevel=1,panX=0,panY=0;
let qualityMode='auto',qualityScale=1,meshSegments=[32,48],frames=0,fpsLast=performance.now(),fps=60,slowSeconds=0,fastSeconds=0,visibleRAF=true;
function applyZoom(){if(viewerOpen){surface.style.transform='';return}if(zoomLevel<=1){panX=panY=0}const limitX=Math.max(0,stage.clientWidth*.55*zoomLevel),limitY=Math.max(0,stage.clientHeight*.55*zoomLevel);panX=clamp(panX,-limitX,limitX);panY=clamp(panY,-limitY,limitY);surface.style.transform=`translate(${panX}px,${panY}px) scale(${zoomLevel})`;const b=$('zoomResetBtn');if(b)b.textContent=Math.round(zoomLevel*100)+'%'}
function setZoom(next){zoomLevel=clamp(next,1,4);if(zoomLevel===1){panX=panY=0}applyZoom()}
$('zoomInBtn').onclick=()=>setZoom(zoomLevel+.25);
$('zoomOutBtn').onclick=()=>setZoom(zoomLevel-.25);
$('zoomResetBtn').onclick=()=>setZoom(1);
// 3-M: 쓰던 도구를 그대로 둔다. A-5: 그리는 도구가 아니면 올가미(대충 둘러 그려도 윤곽에 맞는다)
$('newRegionBtn').onclick=()=>{clearSelectionDrafts();selected=null;setSelectOp('new');updateUI();if(touchPreview||!['brush','wand','lasso','ellipse'].includes(mode))setMode(['wand','lasso','ellipse'].includes(mode)?mode:'lasso');setStatus('새 영역: 올가미로 대략 둘러 그리거나 마술봉으로 누르세요. 기존 영역에 더하려면 영역을 다시 선택하세요.')};
function updateRendererBadge(){
  const badge=$('engineBadge');if(!badge)return;
  const renderer=gl?'WebGL':'Canvas';const quality=qualityMode==='auto'?'자동':qualityMode==='balanced'?'가볍게':'선명하게';
  badge.textContent=`${renderer} · ${Math.max(0,Math.round(fps))} FPS · ${quality}`;
  badge.title=`렌더링: ${renderer} / 속도: ${Math.round(fps)} FPS / 품질: ${quality}`;
}
$('fpsToggle').onclick=()=>{const b=$('fpsToggle');b.dataset.enabled=b.dataset.enabled==='true'?'false':'true';b.textContent=b.dataset.enabled==='true'?Math.round(fps)+' FPS':'FPS';updateRendererBadge()};
function readAmbient(){
 const values={enabled:$('ambientOn').checked,breath:Number($('ambientBreath').value),sway:Number($('ambientSway').value),light:Number($('ambientLight').value)};
 if(Object.keys(values).every(key=>ambient[key]===values[key]))return;
 if(values.enabled!==ambient.enabled)remember();// 켜기·끄기는 여기서, 슬라이더는 잡는 순간(아래) 되돌리기 지점을 만든다
 Object.assign(ambient,values);scheduleSave();previewMotion();
}
for(const id of ['ambientOn','ambientBreath','ambientSway','ambientLight'])$(id).addEventListener('input',()=>{readAmbient();updateAmbientLabels();if(id==='ambientOn')refreshBaseUI()});
for(const id of ['ambientBreath','ambientSway','ambientLight','baseEdgeInput','maskColorInput','maskOpacityInput']){$(id).addEventListener('pointerdown',e=>rememberOnChange(e.currentTarget),{passive:true});$(id).addEventListener('focus',e=>rememberOnChange(e.currentTarget))}
function updateAmbientLabels(){for(const [k,id] of [['breath','ambientBreathVal'],['sway','ambientSwayVal'],['light','ambientLightVal']])$(id).textContent=ambient[k]+'%';refreshChangedMarks()}
// 0-2: 옵션 조작 시 모드를 바꾸지 않는다. '터치 미리보기'만 켜서 선택 미리보기·복원 지점을 보존한다.
function setTouchPreview(on){
 on=!!on&&!viewerOpen&&mode!=='play';
 if(touchPreview===on)return;
 touchPreview=on;
 document.querySelector('.workspace')?.classList.toggle('touchPreview',on);
 if(on)setStatus('만져 보기: 그림을 눌러 반응을 확인하세요. 도구를 누르면 편집으로 돌아갑니다.');
 paintTouchTest();
}
// 3-M: 터치 테스트 버튼(안내줄 오른쪽). 도구를 쓰던 중에도 눌러서 움직임을 확인하고, 다시 누르면 하던 도구로 돌아간다.
// A-6: 그림을 만져 보는 상태로 가는 겉의 길은 이 스위치(편집 | 만져 보기)와 '플레이' 둘뿐. 안쪽 값 두 개(mode==='play', touchPreview) 중 하나라도 켜지면 '만져 보기'.
let lastEditTool='lasso';// 만져 보기에서 '편집'으로 돌아갈 때 잡을 도구(그림을 막 열었으면 올가미)
function touchOn(){return touchPreview||mode==='play'}
function paintTouchTest(){
 const b=$('touchTestBtn'),on=touchOn();
 b.setAttribute('aria-pressed',String(on));
 b.classList.toggle('on',on);
 document.querySelector('.workspace')?.classList.toggle('touchOn',on);
}
$('touchTestBtn').onclick=()=>{
 if(mode==='play'){setMode(lastEditTool);setStatus('편집으로 돌아왔습니다.');return}
 setTouchPreview(!touchPreview);
 if(!touchPreview)setStatus('하던 작업으로 돌아왔습니다.');
};
function previewMotion(){
 if(!viewerOpen&&mode!=='play')setTouchPreview(true);
}
// 3-M: 3-1 연속 움직임은 프리셋과 상관없이 늘 방향·세기·속도 셋이다. 세기는 결정 2로 따로(autoStrength, 영역 속성표가 직접 묶음), 속도는 자동 움직임 속도.
const QUICK_LINKS=[['quickSpeed','autoSpeedInput']];
$('tailCutoutInput').onchange=e=>{
 const z=getSelected();
 if(!z||z.isBase)return;
 remember();
 if(e.target.checked&&tailCutoutZones().length>=TAIL_MAX){e.target.checked=false;setStatus(`빈자리 채우기는 영역 ${TAIL_MAX}개까지 켤 수 있습니다.`);return}
 z.tailCutout=e.target.checked;
 markMask();
 scheduleSave();
 previewMotion();
};

function updateQuickMotion(z){
 $('tailCutoutRow').hidden=z.isBase;
 $('tailCutoutInput').checked=!!z.tailCutout;
 $('presetInput').value=z.preset;
 for(const [id,name] of QUICK_LINKS){const input=$(id),adv=$(name);input.min=adv.min;input.max=adv.max;input.step=adv.step;input.value=adv.value}
 $('quickStrengthValue').textContent=$('quickStrength').value;$('quickSpeedValue').textContent=Number($('quickSpeed').value).toFixed(1)+'×';
}
for(const [id,name] of QUICK_LINKS){
 const input=$(id);
 input.addEventListener('pointerdown',e=>{if(getSelected())rememberOnChange(e.currentTarget)},{passive:true});
 input.addEventListener('focus',e=>{if(getSelected())rememberOnChange(e.currentTarget)});
 input.oninput=()=>{if(!getSelected())return;$(name).value=input.value;$(name).dispatchEvent(new Event('input'))};
}
function applyMotionPreset(z,preset){
 if(!Object.hasOwn(MOTION_PRESETS,preset))return false;
 Object.assign(z,{
  preset,auto:false,autoSpeed:1,breath:0,breathSpeed:1,wave:0,flow:0,twist:0,ripple:0,
  windStrength:0,windAngle:0,windSpeed:1,windNoise:30,windDelay:50,feather:17,spread:9
 },MOTION_PRESETS[preset]);
 z.autoStrength=z.strength;// 프리셋은 두 세기를 같은 값으로 시작
 return true;
}
$('presetInput').onchange=e=>{
 const z=getSelected();
 if(!z)return;
 const preset=e.target.value;
 if(preset===z.preset)return;
 remember();
 if(preset==='custom'){z.preset='custom';z.level='';markMask();updateQuickMotion(z);scheduleSave();renderCard();return}
 if(!applyMotionPreset(z,preset))return;
 z.level='m';
 markMask();updateUI();scheduleSave();previewMotion();
 setStatus('프리셋을 적용했습니다. 그림을 터치해 보세요.');
};
function applyPlayerVisibility(){
  const box=$('viewerAudio');box.hidden=!playerVisible;
  if(!playerVisible)return;
  box.classList.add('compact');$('playerCollapse').textContent='♫';$('playerCollapse').title='음악 플레이어 펼치기';
}
$('playerVisibleInput').onchange=()=>{playerVisible=$('playerVisibleInput').checked;applyPlayerVisibility();scheduleSave()};
$('sfxTypeInput').onchange=e=>{sfxType=e.target.value;scheduleSave()};
$('viewerSfxVolume').oninput=e=>{ $('sfxVolume').value=e.target.value;$('sfxVolumeValue').textContent=e.target.value+'%';scheduleSave()};
$('sfxVolume').addEventListener('input',e=>{$('viewerSfxVolume').value=e.target.value});
function playSfx(power=1,z=null){
  if(effectMuted||sfxType==='off')return;
  const vol=Number($('sfxVolume').value)/100;if(!vol)return;
  const kind=z?.sfx&&Object.hasOwn(builtinSfx64,z.sfx)?z.sfx:sfxType;// F-1: 영역에 고른 효과음이 있으면 그것
  try{ensureAudio();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    if(kind==='file'){playFileSfx(power);return}
    playBuiltinSfx(kind,power);
  }catch(e){console.warn('효과음 오류',e)}
}
function extraState(){return {blink:{eyes:blinkEyesForSave(),speed:blinkSpeed,interval:blinkInterval},faces:facesForSave(),base:{clip:baseClipEnabled,exclude:baseBackgroundExclude,edge:baseEdge},projectName:projectName||'내 프로젝트',maskColor:$('maskColorInput').value,maskOpacity:Number($('maskOpacityInput').value),track:$('trackSelect').value,musicVolume:Number($('musicVolume').value),sfxVolume:Number($('sfxVolume').value),sfxType,playerVisible,ambient:{...ambient},qualityMode}}
function restoreExtra(d){
 restoreBlink(d?.blink);restoreFaces(d?.faces);
 baseClipEnabled=!!d?.base?.clip;baseBackgroundExclude=d?.base?.exclude!==false;baseEdge=clamp(Number(d?.base?.edge??1),0,8);lastBaseSignature='';markMask();refreshBaseUI();
  projectName=d?.projectName||'내 프로젝트';
  $('maskColorInput').value=/^#[0-9a-f]{6}$/i.test(d?.maskColor)?d.maskColor:'#45d8a9';
  $('maskOpacityInput').value=Number.isFinite(d?.maskOpacity)?clamp(d.maskOpacity,0,85):32;
  $('maskOpacityValue').textContent=$('maskOpacityInput').value+'%';
  $('musicVolume').value=d?.musicVolume??40;
  $('viewerMusicVolume').value=$('musicVolume').value;
  $('musicVolumeValue').textContent=$('musicVolume').value+'%';
  $('sfxVolume').value=d?.sfxVolume??25;
  $('viewerSfxVolume').value=$('sfxVolume').value;
  $('sfxVolumeValue').textContent=$('sfxVolume').value+'%';
  sfxType=d?.sfxType==='off'||Object.hasOwn(builtinSfx64,d?.sfxType??'')||(d?.sfxType==='file'&&sfxBlob)?d.sfxType:SFX_DEFAULT;$('sfxTypeInput').value=$('viewerEffects').value=sfxType;
  playerVisible=d?.playerVisible!==false;$('playerVisibleInput').checked=playerVisible;
  for(const k of ['enabled','breath','sway'])ambient[k]=d?.ambient?.[k]??AMBIENT_DEFAULT[k];ambient.light=0;
  ambient.face=faceRefOk(d?.ambient?.face)?d.ambient.face:'';ambient.faceAmt=clamp(Number(d?.ambient?.faceAmt??50)||0,0,100);ambient.idleFace=faceRefOk(d?.ambient?.idleFace)?d.ambient.idleFace:'';ambient.idleEvery=['rare','mid','often'].includes(d?.ambient?.idleEvery)?d.ambient.idleEvery:'mid';paintFaceOptions();
  $('ambientOn').checked=ambient.enabled;refreshBaseUI();
  for(const [k,id] of [['breath','ambientBreath'],['sway','ambientSway'],['light','ambientLight']])$(id).value=ambient[k];
  updateAmbientLabels();applyPlayerVisibility();setTrack(d?.track||'dream');
  qualityMode=['auto','high','balanced'].includes(d?.qualityMode)?d.qualityMode:'auto';paintQuality();
  qualityScale=qualityMode==='balanced'?.7:1;meshSegments=qualityMode==='balanced'?[20,30]:[32,48];if(gl)rebuildMesh();fit();
}
// E6(사용자 결정): 새 그림을 열면 움직임·몸체·눈·얼굴 설정은 기본값으로, 소리·선택 색·화질·플레이 화면 표시는 그대로.
function resetSettingsForNewImage(){
 const keep=extraState();
 restoreExtra({maskColor:keep.maskColor,maskOpacity:keep.maskOpacity,track:keep.track,musicVolume:keep.musicVolume,sfxVolume:keep.sfxVolume,sfxType:keep.sfxType,playerVisible:keep.playerVisible,qualityMode:keep.qualityMode});
}
// Make all 'change' events, including effect sliders, part of the undo history.
$('showZones').addEventListener('change',()=>scheduleSave());
$('maskColorInput').oninput=scheduleSave;
$('maskOpacityInput').oninput=e=>{
 $('maskOpacityValue').textContent=e.target.value+'%';
 scheduleSave();
};
$('imageFile').addEventListener('change',()=>{setZoom(1) });
let editCheckpoint=null,placeReturn='play';// placeReturn: 축·가이드 선 지정을 마치면 돌아갈 도구
// A-6: 만져 보는 중 도구를 누르면 스위치가 꺼지고 그 도구로. 켜진 도구를 다시 눌러도 아무 일도 없다(도구가 꺼지며 터치로 가던 길 없앰).
for(const group of [document.querySelector('.stagebar .modegroup'),document.querySelector('.stagebottom .quick')])group.addEventListener('click',event=>{
 const tool=event.target.closest('[data-mode]');
 if(!tool)return;
 if(touchPreview){setTouchPreview(false);if(tool.dataset.mode===mode){event.stopImmediatePropagation();setStatus('하던 작업으로 돌아왔습니다.');}return;}
 if(tool.dataset.mode===mode)event.stopImmediatePropagation();
},true);
const PLACE_MODES=['pivot','extraPivot','spine','branch','faceMouth','faceBrow','faceEar'];// 그림에서 지정하는 도구: 안내줄의 순서 안내를 다른 알림이 덮지 않게
function setMode(m){
  setTouchPreview(false);
  const PLACE=['pivot','extraPivot','spine','branch','faceMouth','faceBrow','faceEar'];
  if(PLACE.includes(m)&&!PLACE.includes(mode))placeReturn=mode;
  // 3-M: 나눠 그리던 올가미가 남아 있으면 도구를 바꿀 때 닫아서 반영한다(그린 사람은 쓰려고 그린 것)
  if(mode!==m&&mode==='lasso'&&lassoSegments.flat().length>=3)finishSegmentedLasso();
  if(mode!==m)clearSelectionDrafts();
  if(m==='play')editCheckpoint=null;
  else if(mode==='play'&&ready&&!viewerOpen){
    editCheckpoint={state:stateSnapshot(),undo:[...undoStack],redo:[...redoStack],last:lastHistoryJSON};
  }
  mode=m;
  if(['brush','erase','wand','lasso','ellipse','edit','pan'].includes(m))lastEditTool=m;
  const editing=m!=='play';
  const workspace=document.querySelector('.workspace');
  workspace.classList.toggle('editing',editing);
  for(const b of document.querySelectorAll('.mode'))b.setAttribute('aria-pressed',String(b.dataset.mode===m));
  if(ready&&!viewerOpen)requestAnimationFrame(fit);
  for(const b of document.querySelectorAll('.mode'))b.classList.toggle('active',b.dataset.mode===m);
  $('brushbar').hidden=!['brush','erase','lasso','wand','ellipse'].includes(m);
  $('selOp').hidden=!['lasso','wand','ellipse'].includes(m);
  $('shapeKind').hidden=m!=='ellipse';
  $('wandbar').hidden=m!=='wand';$('lassobar').hidden=m!=='lasso';
  $('brushLabel').textContent=m==='erase'?'지우개 굵기':'붓 굵기';
  $('brushLabel').hidden=$('brushInput').hidden=$('brushValue').hidden=!['brush','erase'].includes(m);
  $('showZones').checked=m!=='play';
  paintTouchTest();refreshHistory();
  if(m==='play')setStatus('그림을 터치하면 설정한 반응을 확인할 수 있습니다.');
  if(m==='faceMouth'||m==='faceBrow'||m==='faceEar')faceModeStatus(m);
  if(m==='pivot')setStatus('축 지정: 선택한 영역 안에서 고정할 곳을 누르세요. 다른 곳을 누르면 옮겨집니다.');
  if(m==='extraPivot')setStatus('축 추가: 선택한 영역 안에서 축을 더 놓을 곳을 누르세요.');
  if(m==='spine')setStatus('가이드 선: 선택한 영역 안에서 고정할 뿌리부터 흔들릴 끝까지 한 획을 그으세요.');
  if(m==='pan')setStatus('화면 이동을 선택했습니다. 끌어서 확대한 화면을 옮기세요.');
  if(m==='wand')setStatus('마술봉을 선택했습니다. 선택할 부분을 누른 뒤 범위를 조절하세요.');
  if(m==='lasso')setStatus($('encloseInput').checked?'올가미를 선택했습니다. 대상을 대략 둘러 그리면 윤곽에 맞춰 선택됩니다.':'올가미를 선택했습니다. 원하는 범위를 둘러 그려 주세요.');
 const toolHints={
  brush:'붓을 선택했습니다. 움직일 부분을 칠해 주세요.',
  erase:'지우개를 선택했습니다. 선택한 영역에서 뺄 곳을 지워 주세요.',
  ellipse:'도형을 선택했습니다. 끌어서 그린 뒤 손잡이나 두 손가락으로 다듬으세요.',
  edit:'이동을 선택했습니다. 영역을 끌어 위치를 옮기세요.',
  branch:'가지 선 도구를 선택했습니다. 기존 선에서 이어질 방향을 그려 주세요.'
 };
 if(toolHints[m])setStatus(toolHints[m]);
 // 폰형 화면은 안내줄이 좁다: '○○을 선택했습니다.'를 빼고 할 일만 남긴다
 if(matchMedia('(orientation:portrait),(max-width:779px)').matches){const e=$('status'),t=e.textContent.replace(/^[^.]*선택했습니다\.\s*/,'');if(t&&t!==e.textContent)setStatus(t)}
}
function fit(){
  if(!ready)return;
  const box=viewerOpen?$('viewerStage'):stage,r=renderWidth/renderHeight,
    maxW=Math.max(1,box.clientWidth-(viewerOpen?0:12)),maxH=Math.max(1,box.clientHeight-(viewerOpen?0:12));
  const w=Math.max(1,Math.floor(Math.min(maxW,maxH*r))),h=Math.max(1,Math.floor(w/r));
  surface.style.width=w+'px';surface.style.height=h+'px';
  const dpr=Math.min(window.devicePixelRatio||1,2)*qualityScale;
  const f=Math.min(1,1700/Math.max(w*dpr,h*dpr));let W=Math.max(1,Math.floor(w*dpr*f)),H=Math.max(1,Math.floor(h*dpr*f));
  if(exportRender){W=exportRender.w;H=exportRender.h}// 3-D: 영상 녹화 중에는 화면 크기와 상관없이 고른 크기로 그린다
  if(view.width!==W||view.height!==H){for(const c of [view,overlay]){c.width=W;c.height=H}}
  if(gl)gl.viewport(0,0,W,H);
  applyZoom();markMask();updateRendererBadge();
}
function tick(now){
  if(document.hidden){visibleRAF=false;return}
  visibleRAF=true;
  const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt;
  for(const z of zones)MotionPhysics.step(z,dt,elapsed);
  if(gesture?.type==='play'&&gesture.id){
    const z=zones.find(v=>v.id===gesture.id);
    if(z&&!gesture.dragged&&(now-gesture.time)>400){
      const max=.003+(z.strength/80)*.012;
      z.dragging=true;z.desiredX=0;z.desiredY=0;z.desiredScale=-max*.65*(z.holdGain??60)/100;
    }
  }
  try{updateMasks();render();drawOverlay();drawTouchFx();drawCracks()}catch(e){console.error('모션 렌더 오류',e)}
  frames++;if(now-fpsLast>=1000){fps=frames*1000/(now-fpsLast);frames=0;fpsLast=now;
    const b=$('fpsToggle');if(b.dataset.enabled==='true')b.textContent=Math.round(fps)+' FPS';
    updateRendererBadge();
    if(qualityMode==='auto'){
      if(fps<29){slowSeconds++;fastSeconds=0}else if(fps>53){fastSeconds++;slowSeconds=0}else{slowSeconds=fastSeconds=0}
      if(slowSeconds>=3&&qualityScale>.65){qualityScale=.7;slowSeconds=0;meshSegments=[20,30];if(gl)rebuildMesh();fit();if(!PLACE_MODES.includes(mode))setStatus('렌더 품질을 자동으로 조정했습니다.')}else if(fastSeconds>=8&&qualityScale<1){qualityScale=1;fastSeconds=0;meshSegments=[32,48];if(gl)rebuildMesh();fit()}
    }
  }
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    interruptVideoRecording('화면 전환으로 영상 녹화를 취소했습니다. 화면을 켠 상태에서 다시 시도해 주세요.');
    stopMusic();last=performance.now();
  }else{last=performance.now();if(!visibleRAF)requestAnimationFrame(tick)}
});
// Pre-initialized theme and audio controls. Navigation visual state never enters exported project data.

applyPlayerVisibility();
window.MotionPadDebug=Object.freeze({
  dev:{addEllipse:(x,y,rx,ry)=>addEllipse(x,y,rx,ry),sampleBackground:(x,y)=>{if(!backgroundPlate)return null;const c=backgroundPlate,g=c.getContext('2d');return [...g.getImageData(Math.max(0,Math.min(c.width-1,Math.round(x*c.width))),Math.max(0,Math.min(c.height-1,Math.round(y*c.height))),1,1).data]},sfxLoaded:()=>[...builtinSfxBuffers.values()].filter(v=>v&&v.duration>0).length,baseMaskAlpha:(x,y)=>{if(!baseMaskCanvas)return null;const c=baseMaskCanvas;return c.getContext('2d').getImageData(Math.round(x*383),Math.round(y*383),1,1).data[3]}},
  maskStats(){return zones.map(z=>{const c=rawMaskCanvas(z),d=c.getContext('2d').getImageData(0,0,TILE,TILE).data;let count=0,cx=0,cy=0;for(let i=0;i<TILE*TILE;i++){if(d[i*4+3]>100){count++;cx+=i%TILE;cy+=Math.floor(i/TILE)}}return {id:z.id,name:z.name,kind:z.kind,count,centroid:count?[cx/count/TILE,cy/count/TILE]:null}})},state(){return {base:{name:getBase()?.name||null,clip:baseClipEnabled,exclude:baseBackgroundExclude,edge:baseEdge,backgroundReady:!!backgroundPlate},renderer:gl?'webgl':'canvas',fps,theme:document.documentElement.dataset.theme||'violet',image:[renderWidth,renderHeight],zones:zones.map(z=>({name:z.name,kind:z.kind,pivot:[z.pivotX,z.pivotY],motion:[z.motionX,z.motionY,z.motionScale],gesture:[z.tapGain,z.dragGain,z.holdGain,z.flickGain]})),ambient:{...ambient},chains:zones.map(z=>({spineTip:z.spineTip,spineMid:z.spineMid,branchTip:z.branchTip,wind:[z.windX,z.windY],extraPivots:z.extraPivots?.length||0}))}}
});
// 3-M 방향 다이얼: 바람·흐름 방향을 끌어서 돌린다. 값은 숨은 input(각도, 오른쪽 0° · 아래 90°)에 담겨 기존 연결을 그대로 쓴다.
for(const dial of document.querySelectorAll('.dirDial')){
 const input=$(dial.dataset.for);
 dial.innerHTML='<svg viewBox="-13 -13 26 26" aria-hidden="true"><circle r="11.5"/><path class="ticks" d="M9.5 0h2M-9.5 0h-2M0 9.5v2M0 -9.5v-2"/><g class="needle"><path d="M-6 0H7M3.5 -3.5 7 0 3.5 3.5"/></g></svg>';
 const paint=()=>{dial.style.setProperty('--a',input.value+'deg');dial.setAttribute('aria-valuenow',input.value)};
 const set=v=>{v=Math.round(v/5)*5;while(v>180)v-=360;while(v<-180)v+=360;if(String(v)===input.value)return;input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));paint()};
 const fromEvent=e=>{const r=dial.getBoundingClientRect();set(Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI)};
 dial.addEventListener('pointerdown',e=>{if(getSelected())remember();dial.setPointerCapture(e.pointerId);fromEvent(e)});
 dial.addEventListener('pointermove',e=>{if(dial.hasPointerCapture(e.pointerId))fromEvent(e)});
 dial.addEventListener('keydown',e=>{const d={ArrowLeft:-5,ArrowDown:-5,ArrowRight:5,ArrowUp:5}[e.key];if(d){e.preventDefault();if(getSelected())remember();set(Number(input.value)+d)}});
 dial.paint=paint;paint();
}
// 사용자 결정 5(검수 L2): 켜고 끄는 것은 섹션 제목줄 오른쪽 스위치(.headSwitch). 제목줄(summary)을 접고 펴는 동작과 섞이지 않게
// 스위치를 누르면 접기·펴기는 막고 스위치만 바꾼다(지금 입력 길 그대로: input·change 이벤트, 되돌리기 지점).
document.addEventListener('click',e=>{
 const sw=e.target.closest('summary .headSwitch');
 if(!sw)return;
 e.preventDefault();
 const input=sw.querySelector('input');
 if(!input||input.disabled)return;
 rememberOnChange(input);
 input.checked=!input.checked;
 input.dispatchEvent(new Event('input',{bubbles:true}));
 input.dispatchEvent(new Event('change',{bubbles:true}));
},true);
$('faceAddBtn').onclick=()=>{const f=$('faceOnInput');if(!f.checked)f.click()};
// F-2: 터치 반응이 일어날 때 폰 진동(세게 칠수록 조금 길게, 최대 20ms). 진동이 없는 기기(아이폰 등)는 스위치를 감추고 아무 일도 없다.
// 브라우저에 기억(앱 설정). 녹화 중에는 진동하지 않는다.
const canVibrate=typeof navigator.vibrate==='function';
$('vibrateRow').hidden=!canVibrate;
try{$('vibrateInput').checked=localStorage.getItem('motionpad-vibrate')!=='off'}catch(_){}
$('vibrateInput').onchange=e=>{try{localStorage.setItem('motionpad-vibrate',e.target.checked?'on':'off')}catch(_){}};
function haptic(power=1){
 if(!canVibrate||!$('vibrateInput').checked||effectMuted)return;
 if(liveRecording||videoRecorder&&videoRecorder.state!=='inactive')return;
 try{navigator.vibrate(Math.round(clamp(6+power*8,8,20)))}catch(_){}
}
