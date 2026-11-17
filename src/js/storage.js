async function restoreProjectObject(o){stopMusic();await useBlob(o.image,true);zones=(o.zones||[]).slice(0,LIMIT).map(sanitize);normalizeBaseOrder();selected=zones[0]?.id||null;markZonesKnown();audioBlob=o.audio||null;audioName=o.audioName||'';sfxBlob=o.sfx||null;sfxName=o.sfxName||'';sfxBuffer=null;paintSfxFile();restoreExtra(o.extra||{});setMode("play");undoStack=[];redoStack=[];refreshHistory();markMask();updateUI();scheduleSave();markProjectSaved()}

function openDB(){return new Promise((ok,fail)=>{if(!('indexedDB'in window))return fail(Error('IndexedDB 지원 안 됨'));const req=indexedDB.open('motionpad-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error)})}
function dbPutKey(key,v){return new Promise((ok,fail)=>{const t=db.transaction('projects','readwrite');t.objectStore('projects').put(v,key);t.oncomplete=ok;t.onerror=()=>fail(t.error)})}
// savedSig: 마지막 파일 저장 때의 모습. 이어하기 뒤에도 '파일로 저장 안 한 변경' 여부를 그대로 잇는다.
function dbPut(v){return dbPutKey('active',{...v,savedSig:v.savedSig??savedSignature})}
function dbKeys(){return new Promise((ok,fail)=>{const t=db.transaction('projects','readonly');const r=t.objectStore('projects').getAllKeys();r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
function dbDelete(k){return new Promise((ok,fail)=>{const t=db.transaction('projects','readwrite');t.objectStore('projects').delete(k);t.oncomplete=ok;t.onerror=()=>fail(t.error)})}
function getNamed(k){return new Promise((ok,fail)=>{const t=db.transaction('projects','readonly'),r=t.objectStore('projects').get(k);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
async function refreshNamed(){if(!db)return;try{const keys=(await dbKeys()).filter(k=>typeof k==='string'&&k.startsWith('named:'));const sel=$('projectSelect'),keep=sel.value;sel.replaceChildren();if(!keys.length){const o=document.createElement('option');o.value='';o.textContent='저장된 프로젝트 없음';sel.add(o)}for(const k of keys){const o=document.createElement('option');o.value=k;o.textContent=k.slice(6);sel.add(o)}if(keys.includes(keep))sel.value=keep}catch(e){console.warn(e)}}
$('saveNamedBtn').onclick=async()=>{if(!ready)return;try{if(!db)throw Error('현재 브라우저에서 기기 저장을 사용할 수 없습니다.');const name=projectName.trim()||'내 프로젝트';await dbPutKey('named:'+name,{image:imgBlob,audio:audioBlob,audioName,sfx:sfxBlob,sfxName,zones:zones.map(clean),extra:extraState(),savedAt:Date.now()});await refreshNamed();$('projectSelect').value='named:'+name;setStatus('이전 방식의 브라우저 저장을 완료했습니다.')}catch(e){showNotice('저장 실패','기기에 저장하지 못했습니다.'+why(e))}};
$('loadNamedBtn').onclick=async()=>{const k=$('projectSelect').value;if(!k)return;if(!await askConfirm({title:'보관한 프로젝트 열기',message:`‘${k.slice(6)}’을(를) 열까요? 지금 작업을 파일로 저장하지 않았다면 사라집니다.`,ok:'열기'}))return;try{await restoreProjectObject(await getNamed(k));setStatus('브라우저에 저장된 프로젝트를 불러왔습니다. 파일로 저장해 두는 것을 권장합니다.')}catch(e){showNotice('열기 실패','보관한 프로젝트를 열지 못했습니다.'+why(e))}};
$('deleteNamedBtn').onclick=async()=>{const k=$('projectSelect').value;if(!k)return;if(!await askConfirm({title:'보관한 프로젝트 삭제',message:`기기에 보관한 ‘${k.slice(6)}’을(를) 지울까요? 지우면 되돌릴 수 없습니다.`,ok:'삭제'}))return;try{await dbDelete(k);await refreshNamed();setStatus('저장된 프로젝트를 삭제했습니다.')}catch(e){showNotice('삭제 실패','보관한 프로젝트를 지우지 못했습니다.'+why(e))}};
function dbGet(){return new Promise((ok,fail)=>{const t=db.transaction('projects','readonly');const r=t.objectStore('projects').get('active');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)})}
function scheduleSave(){if(!ready||!db)return;clearTimeout(saveTimer);saveTimer=setTimeout(async()=>{try{await dbPut({image:imgBlob,zones:zones.map(clean),audio:audioBlob,audioName,sfx:sfxBlob,sfxName,extra:extraState(),savedAt:Date.now()});saveError=false}catch(e){if(!saveError){setStatus('자동 저장에 실패했습니다. 프로젝트 파일로 저장해 주세요.');saveError=true}console.warn(e)}},700)}
const MAX_PROJECT_BYTES=160*1024*1024,MAX_PROJECT_LABEL='160MB';
function downloadProject(blob,name){
  if(!blob.size)throw Error('저장할 데이터가 없습니다.');
  if(blob.size>MAX_PROJECT_BYTES)throw Error(`프로젝트 파일이 ${MAX_PROJECT_LABEL}를 넘습니다. 이미지나 음악 용량을 줄여 주세요.`);

  const link=document.createElement('a');
  const url=URL.createObjectURL(blob);
  try{
    link.href=url;
    link.download=name;
    document.body.append(link);
    link.click();
  }finally{
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  setStatus('다운로드를 요청했습니다. 파일 이름과 위치는 브라우저의 다운로드 목록에서 확인해 주세요.');
}

