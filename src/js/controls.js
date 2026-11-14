// Ambient and audio UI are deliberately independent of the selected region.
const ambient={enabled:true,breath:35,sway:30,light:25};
let playerVisible=true, sfxType='soft', zoomLevel=1,panX=0,panY=0;
let qualityMode='auto',qualityScale=1,meshSegments=[32,48],frames=0,fpsLast=performance.now(),fps=60,slowSeconds=0,fastSeconds=0,visibleRAF=true;
function applyZoom(){if(viewerOpen){surface.style.transform='';return}if(zoomLevel<=1){panX=panY=0}const limitX=Math.max(0,stage.clientWidth*.55*zoomLevel),limitY=Math.max(0,stage.clientHeight*.55*zoomLevel);panX=clamp(panX,-limitX,limitX);panY=clamp(panY,-limitY,limitY);surface.style.transform=`translate(${panX}px,${panY}px) scale(${zoomLevel})`;const b=$('zoomResetBtn');if(b)b.textContent=Math.round(zoomLevel*100)+'%'}
function setZoom(next){zoomLevel=clamp(next,1,4);if(zoomLevel===1){panX=panY=0}applyZoom()}
$('zoomInBtn').onclick=()=>setZoom(zoomLevel+.25);
$('zoomOutBtn').onclick=()=>setZoom(zoomLevel-.25);
$('zoomResetBtn').onclick=()=>setZoom(1);
$('newRegionBtn').onclick=()=>{selected=null;setSelectOp('new');updateUI();setMode('brush');setStatus('새 영역을 그려 주세요. 기존 영역에 더하려면 영역을 다시 선택하세요.')};
function updateRendererBadge(){
  const badge=$('engineBadge');if(!badge)return;
  const renderer=gl?'WebGL':'Canvas';const quality=qualityMode==='auto'?'자동':qualityMode==='balanced'?'절전':'고화질';
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
for(const id of ['ambientBreath','ambientSway','ambientLight','baseEdgeInput','maskColorInput','maskOpacityInput']){$(id).addEventListener('pointerdown',()=>remember(),{passive:true});$(id).addEventListener('focus',()=>remember())}
function updateAmbientLabels(){for(const [k,id] of [['breath','ambientBreathVal'],['sway','ambientSwayVal'],['light','ambientLightVal']])$(id).textContent=ambient[k]+'%'}
// 0-2: 옵션 조작 시 모드를 바꾸지 않는다. '터치 미리보기'만 켜서 선택 미리보기·복원 지점을 보존한다.
function setTouchPreview(on){
 on=!!on&&!viewerOpen&&mode!=='play';
 if(touchPreview===on)return;
 touchPreview=on;
 document.querySelector('.workspace')?.classList.toggle('touchPreview',on);
 if(on)setStatus('터치 미리보기 중입니다. 그림을 눌러 반응을 확인하세요. 도구를 누르면 하던 작업으로 돌아갑니다.');
}
function previewMotion(){
 if(!viewerOpen&&mode!=='play')setTouchPreview(true);
}
function motionControls(z){
 if(['tail','wind','scarf'].includes(z.preset))return {
  angle:'windAngleInput',strength:'windStrengthInput',speed:'windSpeedInput',
  hint:'바람에 흔들리는 움직임입니다. 흔들리는 쪽으로 방향을 맞추고, 고정점이 필요하면 ‘1. 영역 → 고정점과 가이드’에서 축을 지정해 주세요.'
 };
 if(z.preset==='breathing')return {
  strength:'breathInput',speed:'breathSpeed',
  hint:'숨 쉬듯 부풀었다 줄어드는 움직임입니다.'
 };
 if(z.preset==='flow')return {
  angle:'flowAngleInput',strength:'flowInput',
  hint:'무늬가 흐르는 움직임입니다. 흐를 방향을 각도로 정해 주세요.'
 };
 // 2-F: 3-1의 세기·속도는 자동 움직임의 것. 이 종류의 자동 움직임은 터치 반응을 스스로 되풀이하므로 세기는 3-2 '반응 세기'와 같은 값이다.
 return {axis:true,strength:'strengthInput',speed:'autoSpeedInput',hint:'‘자동으로 움직이기’를 켜면 이 세기·속도로 계속 흔들립니다. 세기는 터치 움직임의 ‘반응 세기’와 같은 값입니다.'};
}
$('tailCutoutInput').onchange=e=>{
 const z=getSelected();
 if(!z||z.isBase)return;
 remember();
 if(e.target.checked&&tailCutoutZones().length>=TAIL_MAX){e.target.checked=false;setStatus(`외곽까지 흔들기는 영역 ${TAIL_MAX}개까지 켤 수 있습니다.`);return}
 z.tailCutout=e.target.checked;
 markMask();
 scheduleSave();
 previewMotion();
};

function updateQuickMotion(z){
 $('tailCutoutRow').hidden=z.isBase;
 $('tailCutoutInput').checked=!!z.tailCutout;
 const controls=motionControls(z);
 $('presetInput').value=z.preset;
 $('quickDirectionRow').hidden=!controls.angle&&!controls.axis;
 $('quickDirectionRow').querySelector('label').htmlFor=controls.axis?'quickDirection':'quickAngle';
 $('quickDirection').hidden=!controls.axis;
 $('quickDirection').value=z.axis;
 $('quickAngle').hidden=$('quickAngleValue').hidden=!controls.angle;
 if(controls.angle){
  $('quickAngle').value=$(controls.angle).value;
  $('quickAngleValue').textContent=$('quickAngle').value+'°';
 }
 for(const [key,id] of [['strength','quickStrength'],['speed','quickSpeed']]){
  const name=controls[key],input=$(id);
  if(!name)continue;
  if(name==='breathSpeed'){
   input.min=.2;input.max=3;input.step=.1;input.value=z.breathSpeed;
  }else{
   const advanced=$(name);
   input.min=advanced.min;input.max=advanced.max;input.step=advanced.step;input.value=advanced.value;
  }
  const unit=name==='windStrengthInput'?'%':['windSpeedInput','breathSpeed','autoSpeedInput'].includes(name)?'×':'';
  $(id+'Value').textContent=(name==='autoSpeedInput'?Number(input.value).toFixed(1):input.value)+unit;
 }
 const kind=z.preset==='breathing'?'호흡 ':controls.angle&&controls.speed?'바람 ':z.preset==='flow'?'흐름 ':'';
 $('quickStrengthLabel').textContent=kind+'세기';$('quickSpeedLabel').textContent=kind+'속도';
 $('quickSpeedRow').hidden=!controls.speed;
 $('autoSpeedRow').hidden=controls.speed==='autoSpeedInput';
 $('quickMotionHint').textContent=controls.hint;
}
for(const [id,key] of [['quickDirection','axis'],['quickAngle','angle'],['quickStrength','strength'],['quickSpeed','speed']]){
 const input=$(id);
 input.addEventListener('pointerdown',()=>{if(getSelected())remember()},{passive:true});
 input.addEventListener('focus',()=>{if(getSelected())remember()});
 input.oninput=()=>{
  const z=getSelected();if(!z)return;
  const name=key==='axis'?'axisInput':motionControls(z)[key];
  if(!name)return;
  if(name==='breathSpeed'){
   const speed=Number(input.value);
   if(speed===z.breathSpeed)return;
   z.breathSpeed=speed;
   updateQuickMotion(z);scheduleSave();previewMotion();
   return;
  }
  $(name).value=input.value;
  $(name).dispatchEvent(new Event('input'));
 };
}
function applyMotionPreset(z,preset){
 if(!Object.hasOwn(MOTION_PRESETS,preset))return false;
 Object.assign(z,{
  preset,auto:false,autoSpeed:1,breath:0,breathSpeed:1,wave:0,flow:0,twist:0,ripple:0,
  windStrength:0,windAngle:0,windSpeed:1,windNoise:30,windDelay:50,feather:17,spread:9
 },MOTION_PRESETS[preset]);
 return true;
}
$('presetInput').onchange=e=>{
 const z=getSelected();
 if(!z)return;
 const preset=e.target.value;
 if(preset===z.preset)return;
 remember();
 if(preset==='custom'){z.preset='custom';markMask();updateQuickMotion(z);scheduleSave();return}
 if(!applyMotionPreset(z,preset))return;
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
function playSfx(power=1){
  if(effectMuted||sfxType==='off')return;
  const vol=Number($('sfxVolume').value)/100;if(!vol)return;
  try{ensureAudio();if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    const t=audioCtx.currentTime,noise=audioCtx.createBuffer(1,Math.ceil(audioCtx.sampleRate*.15),audioCtx.sampleRate),buf=noise.getChannelData(0);
    let lastN=0;for(let i=0;i<buf.length;i++){const a=(Math.random()*2-1);lastN=lastN*.42+a*.58;buf[i]=lastN}
    const n=audioCtx.createBufferSource(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();n.buffer=noise;
    let length=.085,pitch=900,peak=.12;
    if(['wetClip','hardClip','softClip','mudClip'].includes(sfxType)){if(playBuiltinSfx(sfxType,power))return;}
    if(sfxType==='slap'){length=.115;pitch=1400;peak=.24}
    if(sfxType==='jelly'){length=.14;pitch=480;peak=.11}
    if(sfxType==='water'){length=.13;pitch=650;peak=.09}
    filter.type='lowpass';filter.frequency.setValueAtTime(pitch,t);filter.frequency.exponentialRampToValueAtTime(Math.max(100,pitch*.43),t+length);
    gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(Math.min(.2,peak*vol*clamp(power,.3,1.7)),t+.005);
    gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    n.connect(filter);filter.connect(gain);gain.connect(audioMaster);n.start(t);n.stop(t+length+.005);
  }catch(e){console.warn('효과음 오류',e)}
}
function extraState(){return {blink:{eyes:blinkEyesForSave(),speed:blinkSpeed,interval:blinkInterval},base:{clip:baseClipEnabled,exclude:baseBackgroundExclude,edge:baseEdge},projectName:projectName||'내 프로젝트',maskColor:$('maskColorInput').value,maskOpacity:Number($('maskOpacityInput').value),track:$('trackSelect').value,musicVolume:Number($('musicVolume').value),sfxVolume:Number($('sfxVolume').value),sfxType,playerVisible,ambient:{...ambient},qualityMode}}
function restoreExtra(d){
 restoreBlink(d?.blink);
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
  sfxType=['soft','slap','jelly','water','wetClip','hardClip','softClip','mudClip','off'].includes(d?.sfxType)?d.sfxType:'soft';$('sfxTypeInput').value=sfxType;
  playerVisible=d?.playerVisible!==false;$('playerVisibleInput').checked=playerVisible;
  for(const k of ['enabled','breath','sway','light'])if(d?.ambient?.[k]!=null)ambient[k]=d.ambient[k];
  $('ambientOn').checked=ambient.enabled;refreshBaseUI();
  for(const [k,id] of [['breath','ambientBreath'],['sway','ambientSway'],['light','ambientLight']])$(id).value=ambient[k];
  updateAmbientLabels();applyPlayerVisibility();setTrack(d?.track||'lounge');
  qualityMode=['auto','high','balanced'].includes(d?.qualityMode)?d.qualityMode:'auto';paintQuality();
  qualityScale=qualityMode==='balanced'?.7:1;meshSegments=qualityMode==='balanced'?[20,30]:[32,48];if(gl)rebuildMesh();fit();
}
// Make all 'change' events, including effect sliders, part of the undo history.
$('showZones').addEventListener('change',()=>scheduleSave());
$('maskColorInput').oninput=scheduleSave;
$('maskOpacityInput').oninput=e=>{
 $('maskOpacityValue').textContent=e.target.value+'%';
 scheduleSave();
};
$('imageFile').addEventListener('change',()=>{setZoom(1) });
let editCheckpoint=null;
document.querySelector('.stagebar .modegroup').addEventListener('click',event=>{
 const tool=event.target.closest('[data-mode]');
 if(!tool)return;
 if(touchPreview){setTouchPreview(false);if(tool.dataset.mode===mode){event.stopImmediatePropagation();setStatus('하던 작업으로 돌아왔습니다.');}return;}
 if(tool.dataset.mode!==mode)return;
 event.stopImmediatePropagation();
 setMode('play');
},true);
function setMode(m){
  setTouchPreview(false);
  if(mode!==m)clearSelectionDrafts();
  if(m==='play')editCheckpoint=null;
  else if(mode==='play'&&ready&&!viewerOpen){
    editCheckpoint={state:stateSnapshot(),undo:[...undoStack],redo:[...redoStack],last:lastHistoryJSON};
  }
  mode=m;
  const editing=m!=='play';
  const workspace=document.querySelector('.workspace');
  workspace.classList.toggle('editing',editing);
  workspace.classList.toggle('placing',['pivot','extraPivot','spine','flowdir'].includes(m));
  $('editGuide').hidden=!workspace.classList.contains('placing');
  for(const b of document.querySelectorAll('.mode'))b.setAttribute('aria-pressed',String(b.dataset.mode===m));
  $('leaveEdit').hidden=!editCheckpoint;
  $('finishEdit').textContent='완료';
  $('editInstruction').textContent=({pivot:'고정할 곳을 눌러 주세요.',extraPivot:'고정점을 더 놓을 곳을 눌러 주세요.',spine:'붙어 있는 곳에서 끝까지 그어 주세요.',flowdir:'흐를 방향으로 그어 주세요.'})[m]||'그림에서 부분을 선택하거나 다듬어 주세요.';
  if(ready&&!viewerOpen)requestAnimationFrame(fit);
  for(const b of document.querySelectorAll('.mode'))b.classList.toggle('active',b.dataset.mode===m);
  $('brushbar').hidden=!['brush','erase','lasso','wand','ellipse'].includes(m);
  $('selOp').hidden=!['lasso','wand','ellipse'].includes(m);
  $('shapeKind').hidden=m!=='ellipse';
  $('wandbar').hidden=m!=='wand';$('lassobar').hidden=m!=='lasso';
  $('brushLabel').textContent=m==='erase'?'지우개 굵기':'붓 굵기';
  $('brushLabel').hidden=$('brushInput').hidden=$('brushValue').hidden=!['brush','erase'].includes(m);
  $('showZones').checked=m!=='play';
  if(m==='play')setStatus('그림을 터치하면 설정한 반응을 확인할 수 있습니다.');
  if(m==='pivot')setStatus('선택 영역 안에서 기본 축을 놓을 위치를 눌러 주세요.');
  if(m==='extraPivot')setStatus('선택 영역 안에서 추가 축을 놓을 위치를 한 번 눌러 주세요.');
  if(m==='spine')setStatus('선택 영역 안에서 고정할 뿌리부터 흔들릴 끝까지 한 획을 그려 주세요.');
  if(m==='flowdir')setStatus('흐름 시작점에서 끝점으로 드래그하세요.');
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
  try{updateMasks();render();drawOverlay();drawTouchFx()}catch(e){console.error('모션 렌더 오류',e)}
  frames++;if(now-fpsLast>=1000){fps=frames*1000/(now-fpsLast);frames=0;fpsLast=now;
    const b=$('fpsToggle');if(b.dataset.enabled==='true')b.textContent=Math.round(fps)+' FPS';
    updateRendererBadge();
    if(qualityMode==='auto'){
      if(fps<29){slowSeconds++;fastSeconds=0}else if(fps>53){fastSeconds++;slowSeconds=0}else{slowSeconds=fastSeconds=0}
      if(slowSeconds>=3&&qualityScale>.65){qualityScale=.7;slowSeconds=0;meshSegments=[20,30];if(gl)rebuildMesh();fit();setStatus('렌더 품질을 자동으로 조정했습니다.')}else if(fastSeconds>=8&&qualityScale<1){qualityScale=1;fastSeconds=0;meshSegments=[32,48];if(gl)rebuildMesh();fit()}
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
