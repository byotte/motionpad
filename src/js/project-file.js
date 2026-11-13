function safeProjectFilename(name){const base=String(name||'내 프로젝트').trim().replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').replace(/\.+$/,'').slice(0,70)||'내 프로젝트';return base+'.motionpad.json'}
function toDataURL(blob){return new Promise((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>fail(r.error);r.readAsDataURL(blob)})}
function fromDataURL(data){const [head,encoded]=data.split(',');if(!head?.startsWith('data:image/')||!encoded)throw Error('백업 이미지가 올바르지 않음');const type=head.match(/^data:([^;]+)/)?.[1]||'image/png',str=atob(encoded),array=new Uint8Array(str.length);for(let i=0;i<str.length;i++)array[i]=str.charCodeAt(i);return new Blob([array],{type})}
let projectName='내 프로젝트';
let projectSaveInProgress=false;
async function saveProject(requestedName=projectName){
  if(projectSaveInProgress)return;
  if(!imgBlob){setStatus('먼저 이미지를 열어 주세요.');return}

  projectSaveInProgress=true;
  const buttons=[$('backupBtn'),$('saveAsBtn')];
  buttons.forEach(button=>button.disabled=true);
  try{
    const image=imgBlob;
    const audio=audioBlob;
    const name=safeProjectFilename(requestedName);
    // Capture project settings before the asynchronous file reads.
    const snapshot=JSON.stringify({
      format:'motionpad-project',
      version:2,
      editorVersion:'0.5.0-rc.23',
      audioName,
      savedAt:new Date().toISOString(),
      extra:{...extraState(),projectName:requestedName},
      zones:zones.map(clean)
    });
    const data=JSON.parse(snapshot);
    data.image=await toDataURL(image);
    data.audio=audio?await toDataURL(audio):null;
    downloadProject(new Blob([JSON.stringify(data)],{type:'application/json'}),name);markProjectSaved();
    if(image===imgBlob && projectName!==requestedName){
      projectName=requestedName;
      scheduleSave();
    }
  }catch(error){
    showNotice('저장 실패','파일로 저장하지 못했습니다.'+why(error));
  }finally{
    projectSaveInProgress=false;
    buttons.forEach(button=>button.disabled=false);
  }
}
$('backupBtn').onclick=()=>saveProject();
$('saveAsBtn').onclick=()=>{
  if(!imgBlob){setStatus('먼저 이미지를 열어 주세요.');return}
  $('saveAsName').value=projectName;
  $('saveAsDialog').showModal();
  $('saveAsName').select();
};
$('cancelSaveAs').onclick=()=>$('saveAsDialog').close();
$('saveAsForm').onsubmit=event=>{
  event.preventDefault();
  const name=$('saveAsName').value.trim()||'내 프로젝트';
  $('saveAsDialog').close();
  return saveProject(name);
};
function audioFromDataURL(data){if(typeof data!=='string'||!data.startsWith('data:audio/'))return null;const p=data.indexOf(',');if(p<0)return null;const m=data.slice(5,p).split(';')[0],raw=atob(data.slice(p+1)),arr=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return new Blob([arr],{type:m})}
$('restoreBtn').onclick=()=>$('backupFile').click();$('backupFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>MAX_PROJECT_BYTES)throw Error('프로젝트 파일이 너무 큽니다 (최대 45MB).');const d=JSON.parse(await f.text());if(d.format!=='motionpad-project'||![1,2].includes(d.version)||!Array.isArray(d.zones)||typeof d.image!=='string')throw Error('지원하지 않는 프로젝트 파일입니다.');if(d.zones.length>LIMIT)throw Error(`영역은 최대 ${LIMIT}개까지 복원할 수 있습니다.`);const image=fromDataURL(d.image),audio=audioFromDataURL(d.audio);await restoreProjectObject({image,zones:d.zones,audio,audioName:d.audioName||'',extra:d.extra||{}});projectName=d.extra?.projectName||f.name.replace(/\.motionpad\.json$|\.json$/i,'');setStatus('프로젝트 파일을 열었습니다.')}catch(err){showNotice('프로젝트 열기 실패','프로젝트 파일을 열지 못했습니다. MotionPad로 저장한 파일인지 확인해 주세요.'+why(err))}e.target.value=''};
let storedLayoutProject=null;async function boot(){try{db=await openDB();await refreshNamed();const stored=await dbGet();if(stored?.image)storedLayoutProject=stored;}catch(e){console.warn('자동 저장소를 사용할 수 없습니다.',e)}$('resumeProject').hidden=!storedLayoutProject}
window.addEventListener('visibilitychange',()=>{last=performance.now()});window.addEventListener('pagehide',()=>{if(ready&&db)dbPut({image:imgBlob,zones:zones.map(clean),audio:audioBlob,audioName,extra:extraState(),savedAt:Date.now()}).catch(()=>{})});
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
