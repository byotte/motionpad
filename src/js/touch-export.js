// F-1: 터치 파일에 넣을 내장 효과음 = 전체 설정 하나 + 영역마다 고른 것(빼먹으면 받은 쪽에서 소리가 빠진다)
function touchSfxIds(){return [...new Set([sfxType,...zones.map(z=>z.sfx)])].filter(id=>id&&Object.hasOwn(builtinSfx64,id))}
/* 터치 파일 내보내기: 받은 사람이 열어서 바로 만져 보는 html 파일 하나. 서버 없이 파일만 주고받는다.
   TOUCH_SHELL은 효과음·음악을 뺀 이 앱의 사본(gzip+base64)으로, 빌드가 채운다(tools/build.js).
   여기에 그림(편집용 크기, WebP)·영역·설정, 고른 효과음 하나, 고르면 배경음악 한 곡을 넣어 저장한다.
   받은 쪽에서는 core.js의 touchData가 채워지고, bootTouch()가 플레이 화면으로 바로 연다. */
const TOUCH_SHELL='@@touchshell',TOUCH_SHELL_BYTES=Number('@@touchsize')||0;
const b64Size=n=>Math.ceil(n/3)*4;
let touchImageCache=null;
async function touchImageBlob(){
 if(touchImageCache?.src===bitmap)return touchImageCache.blob;
 const blob=await new Promise(ok=>bitmap.toBlob(ok,'image/webp',.9));
 touchImageCache={src:bitmap,blob};return blob;
}
function touchMusicName(){return curTrack==='file'?(audioName||'불러온 음악'):(bgmInfo(curTrack)?.name||'배경음악')}
async function touchMusicBlob(){
 if(curTrack==='file')return audioBlob?new Blob([audioBlob],{type:audioBlob.type||'audio/mpeg'}):null;
 if(!bgmHave.has(curTrack))return null;
 const bytes=await bgmBytes(curTrack);return bytes?new Blob([bytes],{type:'audio/mpeg'}):null;
}
async function touchPlan(){
 const img=await touchImageBlob(),music=await touchMusicBlob().catch(()=>null);
 const sfx=(sfxType==='file'?b64Size(sfxBlob?.size||0):0)+touchSfxIds().reduce((n,id)=>n+(builtinSfx64[id]?.length||0),0);
 const base=TOUCH_SHELL_BYTES+b64Size(img?.size||0)+sfx+JSON.stringify(zones.map(clean)).length+JSON.stringify(extraState()).length+2048;
 return {img,music,base,musicBytes:music?b64Size(music.size):0};
}
async function paintTouchPlan(){
 if(!ready)return;
 const box=$('touchMusic'),label=$('touchMusicLabel');
 try{
  const p=await touchPlan();
  box.disabled=!p.music;if(!p.music)box.checked=false;
  label.textContent=p.music?`배경음악 포함 · ‘${touchMusicName()}’ ${fmtBytes(p.musicBytes)}`:'배경음악 포함 (고른 곡이 없습니다)';
  const total=p.base+(box.checked?p.musicBytes:0);
  $('touchEstimate').innerHTML=`예상: <b>약 ${fmtBytes(total)}</b>`+(p.music&&!box.checked?`<br><span class="micro">배경음악을 넣으면 약 ${fmtBytes(p.base+p.musicBytes)}</span>`:'');
 }catch(e){console.warn('터치 파일 계산',e);$('touchEstimate').textContent='예상 용량을 계산하지 못했습니다.'}
}
document.querySelector('[data-dialog="touchDialog"]')?.addEventListener('click',()=>setTimeout(paintTouchPlan));
$('touchMusic').addEventListener('change',paintTouchPlan);
async function gunzipText(b64){
 const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
 return new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
const escapeHtml=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function saveTouchBlob(blob,name){
 if(canPickSaveLocation){
  try{const h=await window.showSaveFilePicker({suggestedName:name,types:[{description:'MotionPad 터치 파일',accept:{'text/html':['.html']}}]});const w=await h.createWritable();await w.write(blob);await w.close();return h.name}
  catch(e){if(e?.name==='AbortError')return null;throw e}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return name;
}
$('touchExportBtn').onclick=async()=>{
 if(!ready){showNotice('터치 파일로 내보내기','먼저 그림을 열어 주세요.');return}
 if(!TOUCH_SHELL||!window.DecompressionStream){showNotice('터치 파일로 내보내기','이 브라우저에서는 터치 파일을 만들 수 없습니다. 최신 크롬에서 다시 시도해 주세요.');return}
 const btn=$('touchExportBtn');btn.disabled=true;
 try{
  const p=await touchPlan(),withMusic=$('touchMusic').checked&&!!p.music;
  const shell=await gunzipText(TOUCH_SHELL);
  const project={format:'motionpad-project',version:2,zones:zones.map(clean),
   extra:{...extraState(),projectName,track:withMusic?'file':'dream'},
   audioName:withMusic?touchMusicName():'',sfxName,
   image:await toDataURL(p.img),audio:withMusic?await toDataURL(p.music):null,
   sfx:sfxType==='file'&&sfxBlob?await toDataURL(sfxBlob):null};
  const sfxs=Object.fromEntries(touchSfxIds().map(id=>[id,builtinSfx64[id]]));
  const data={project,music:withMusic,sfxId:sfxType,sfx64:builtinSfx64[sfxType]||null,sfxs};
  const json=JSON.stringify(data).replace(/</g,'\\u003c');
  const at=shell.indexOf('<body>\n');if(at<0)throw Error('터치 파일 틀이 올바르지 않습니다');
  const inject=`<script>document.documentElement.classList.add('touchFile')<\/script><script type="application/json" id="mpTouch">${json}<\/script>\n`;
  const html=(shell.slice(0,at+7)+inject+shell.slice(at+7)).replace('<title>MotionPad</title>',`<title>${escapeHtml(projectName||'MotionPad')} · MotionPad</title>`);
  const blob=new Blob([html],{type:'text/html'});
  const name=String(projectName||'MotionPad').trim().replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').slice(0,70)+'_터치.html';
  const saved=await saveTouchBlob(blob,name);
  if(saved){$('touchDialog').close();setStatus(`터치 파일을 저장했습니다 · ${saved} · ${fmtBytes(blob.size)}`)}
 }catch(e){showNotice('터치 파일로 내보내기','터치 파일을 만들지 못했습니다.'+why(e))}
 finally{btn.disabled=false}
};
// 받은 쪽: 안에 든 그림을 열고 곧바로 플레이 화면으로. 편집·자동 저장·녹화는 쓰지 않는다.
let touchMusicStarted=false;
async function bootTouch(){
 try{
  const d=touchData.project;
  await restoreProjectObject({image:fromDataURL(d.image),zones:d.zones||[],audio:audioFromDataURL(d.audio),audioName:d.audioName||'',sfx:audioFromDataURL(d.sfx),sfxName:d.sfxName||'',extra:d.extra||{}});
  projectName=d.extra?.projectName||'MotionPad';
  await enterViewer();
  const music=!!touchData.music,sfx=sfxType!=='off';
  $('musicBtn').hidden=!music;$('viewerMusicVolume').closest('label').hidden=!music;
  $('muteViewer').hidden=!sfx;$('viewerSfxVolume').closest('label').hidden=!sfx;
  $('viewerAudio').hidden=!music&&!sfx;
  // 폰은 첫 터치 전에는 소리를 낼 수 없다. 음악이 들어 있으면 첫 터치에 함께 튼다(그 뒤 멈추면 그대로 둔다).
  if(music)$('viewerStage').addEventListener('pointerdown',()=>{if(touchMusicStarted)return;touchMusicStarted=true;if(!musicPlaying)startMusic().catch(()=>{})});
 }catch(e){showNotice('터치 파일','그림을 열지 못했습니다.'+why(e))}
}
