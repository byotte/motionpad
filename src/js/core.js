const $=id=>document.getElementById(id);let view=$('view');const overlay=$('overlay'),ctx=overlay.getContext('2d'),surface=$('surface'),stage=$('stage'),loupe=$('loupe'),loupeCtx=loupe.getContext('2d');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),newId=()=>Math.random().toString(36).slice(2,10);
const LIMIT=12,TILE=384,COLS=4,ROWS=3;let zones=[],selected=null,mode='brush',imgBlob=null,bitmap=null,renderWidth=900,renderHeight=1100,ready=false,db=null,saveTimer=null,saveError=false;
let gl=null,program=null,imageTex=null,maskTex=null,baseMaskTex=null,backgroundTex=null,uni={},draw2d=null,maskAtlas=document.createElement('canvas'),maskReady=false,maskDirty=true;
maskAtlas.width=TILE*COLS;maskAtlas.height=TILE*ROWS;let masks=[];
let touchPreview=false,exportRender=null;// exportRender: 영상 녹화 중 그릴 크기(3-D)
let baseClipEnabled=false,baseBackgroundExclude=true,baseEdge=1,baseMaskCanvas=null,backgroundPlate=null,lastBaseSignature='',lastBaseEdge=-1,baseForegroundSource=null;
let pointers=new Map(),gesture=null,brushSize=10,viewerOpen=false,previousMode='brush',last=performance.now(),elapsed=0;
let undoStack=[],redoStack=[],lastHistoryJSON='',imagePixels=null,edgeScores=null,audioBlob=null,audioName='',sfxBlob=null,sfxName='',sfxBuffer=null,audioURL=null,activeAudio=null,audioCtx=null,audioMaster=null,musicTimer=null,musicPlaying=false,musicTick=0,effectMuted=false;
const stopEvent=e=>e.preventDefault();
const MOTION_PRESETS=Object.freeze({
 soft:{strength:15,spring:11,damping:74,ripple:5,feather:19},
 breathing:{strength:12,spring:8,damping:88,breath:18,breathSpeed:.85,feather:23,spread:10},
 jelly:{strength:30,spring:17,damping:55,ripple:13,feather:17,spread:10},
 tail:{strength:24,spring:9,damping:68,windStrength:38,windSpeed:1.1,windDelay:65,pivotEnabled:true},
 flow:{strength:9,spring:9,damping:85,wave:4,flow:22,feather:22,spread:13},
 wind:{strength:21,spring:10,damping:76,windStrength:52,windSpeed:1.3,windNoise:45,windDelay:75,pivotEnabled:true},
 scarf:{strength:25,spring:8,damping:80,windStrength:65,windAngle:-25,windSpeed:.9,windNoise:25,windDelay:84,pivotEnabled:true}
});
function setStatus(s){const e=$('status');e.textContent=s;e.title=s}
// 작업이 날아갈 수 있는 동작 앞의 확인창. 문구는 부르는 곳에서 상황에 맞게 정한다.
function askConfirm({title,message,ok='확인',cancel='취소'}){
 return new Promise(resolve=>{
  const d=$('confirmDialog');if(!d||d.open){resolve(false);return}
  $('confirmTitle').textContent=title;$('confirmMessage').textContent=message;
  $('confirmOk').textContent=ok;$('confirmCancel').textContent=cancel;$('confirmCancel').hidden=false;$('confirmOk').classList.add('warn');
  const done=v=>{d.close();resolve(v)};
  $('confirmOk').onclick=()=>done(true);$('confirmCancel').onclick=()=>done(false);
  d.oncancel=e=>{e.preventDefault();done(false)};
  d.showModal();$('confirmCancel').focus();
 });
}
// 3-A: 브라우저 기본 알림창(alert) 대신 앱 디자인 알림창. 버튼 하나, 닫으면 끝.
const why=e=>e&&e.message?` (${e.message})`:'';// 알림창 끝에 붙이는 원인(있을 때만)
function showNotice(title,message){
 return new Promise(resolve=>{
  const d=$('confirmDialog');if(!d){resolve();return}
  if(d.open){setStatus(message);resolve();return}
  $('confirmTitle').textContent=title;$('confirmMessage').textContent=message;
  $('confirmOk').textContent='확인';$('confirmOk').classList.remove('warn');$('confirmCancel').hidden=true;
  const done=()=>{d.close();resolve()};
  $('confirmOk').onclick=done;d.oncancel=e=>{e.preventDefault();done()};
  d.showModal();$('confirmOk').focus();
 });
}
// 마지막으로 파일 저장·열기 했을 때와 지금이 다른가(새 그림·프로젝트 열기 전 확인용)
let savedSignature='';
function projectSignature(){try{return JSON.stringify([imgBlob?.size||0,zones.map(clean),extraState()])}catch(_){return String(Math.random())}}
function markProjectSaved(){savedSignature=projectSignature()}
function hasUnsavedWork(){return !!(ready&&imgBlob)&&projectSignature()!==savedSignature}
// 파일로 저장하지 않은 작업이 있으면 새로고침·창 닫기 전에 브라우저가 묻는다(문구는 브라우저가 정한다. 아이폰 사파리는 묻지 않는다).
window.addEventListener('beforeunload',e=>{if(hasUnsavedWork()){e.preventDefault();e.returnValue=''}});
