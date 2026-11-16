/* 오디오: 효과음·배경음악 */
/* 효과음: 사용자가 만든 녹음 17개. 목록은 묶음(마찰음·효과음) 순, 묶음 안은 가나다순. 고르는 칸에서는 묶음 이름을 흐린 제목(optgroup)으로 보인다. */
const SFX_LIST=[{id:'ball',group:'마찰음',name:'공'},{id:'metal',group:'마찰음',name:'금속'},{id:'blunt-hit',group:'마찰음',name:'둔탁한 타격'},{id:'wood',group:'마찰음',name:'목재'},{id:'heavy-thud',group:'마찰음',name:'묵직한 울림'},{id:'water',group:'마찰음',name:'물'},{id:'water-surface',group:'마찰음',name:'물 표면'},{id:'iron-bowl',group:'마찰음',name:'쇠 그릇'},{id:'cloth-flap',group:'마찰음',name:'옷 펄럭임'},{id:'glass',group:'마찰음',name:'유리잔'},{id:'skin-hard',group:'마찰음',name:'피부 강하게'},{id:'skin-rub',group:'마찰음',name:'피부 문지름'},{id:'skin-soft',group:'마찰음',name:'피부 약하게'},{id:'machine',group:'효과음',name:'기계음'},{id:'ttoing',group:'효과음',name:'뚀잉'},{id:'boing',group:'효과음',name:'띠요옹'},{id:'bubble',group:'효과음',name:'버블'}];
const builtinSfx64={'ball':'@@base64(sfx/ball.wav)','metal':'@@base64(sfx/metal.wav)','blunt-hit':'@@base64(sfx/blunt-hit.wav)','wood':'@@base64(sfx/wood.wav)','heavy-thud':'@@base64(sfx/heavy-thud.wav)','water':'@@base64(sfx/water.wav)','water-surface':'@@base64(sfx/water-surface.wav)','iron-bowl':'@@base64(sfx/iron-bowl.wav)','cloth-flap':'@@base64(sfx/cloth-flap.wav)','glass':'@@base64(sfx/glass.wav)','skin-hard':'@@base64(sfx/skin-hard.wav)','skin-rub':'@@base64(sfx/skin-rub.wav)','skin-soft':'@@base64(sfx/skin-soft.wav)','machine':'@@base64(sfx/machine.wav)','ttoing':'@@base64(sfx/ttoing.wav)','boing':'@@base64(sfx/boing.wav)','bubble':'@@base64(sfx/bubble.wav)'};
const SFX_DEFAULT=SFX_LIST[0].id;
function paintSfxOptions(){for(const id of ['sfxTypeInput','viewerEffects']){const s=$(id),file=s.querySelector('option[value="file"]');s.querySelectorAll('optgroup').forEach(g=>g.remove());const groups=new Map();
 for(const t of SFX_LIST){if(!groups.has(t.group)){const g=document.createElement('optgroup');g.label=t.group;groups.set(t.group,g);s.insertBefore(g,file)}const o=document.createElement('option');o.value=t.id;o.textContent=t.name;groups.get(t.group).appendChild(o)}
 s.value=SFX_DEFAULT}}
paintSfxOptions();
const builtinSfxBuffers=new Map();
function decodeBuiltinSfx(){
 if(!audioCtx)return;
 for(const [name,data] of Object.entries(builtinSfx64)){
   if(builtinSfxBuffers.has(name))continue;
   // Set an in-progress marker so simultaneous touches never schedule duplicate decoding.
   builtinSfxBuffers.set(name,null);
   try{const raw=atob(data),bytes=new Uint8Array(raw.length);for(let i=0;i<bytes.length;i++)bytes[i]=raw.charCodeAt(i);
     audioCtx.decodeAudioData(bytes.buffer).then(buf=>builtinSfxBuffers.set(name,buf)).catch(e=>{builtinSfxBuffers.delete(name);console.warn('SFX decoding',e)});
   }catch(e){builtinSfxBuffers.delete(name);console.warn(e)}
 }
}
function playBuiltinSfx(kind,power){
 if(!audioCtx)return false;
 const buffer=builtinSfxBuffers.get(kind);if(!buffer)return false;
 const src=audioCtx.createBufferSource(),gain=audioCtx.createGain();src.buffer=buffer;
 const vol=Number($('sfxVolume').value)/100;
 gain.gain.value=Math.min(.75,.75*vol*clamp(power,.30,1.7));
 src.connect(gain);gain.connect(audioMaster);src.start();return true;
}

function ensureAudio(){if(audioCtx)return;const A=window.AudioContext||window.webkitAudioContext;if(!A)throw Error('오디오 지원이 없는 브라우저입니다.');audioCtx=new A();audioMaster=audioCtx.createGain();audioMaster.gain.value=.75;audioMaster.connect(audioCtx.destination);decodeBuiltinSfx()}
/* 음악 단계: 배경음악은 녹음 곡. '몽환적인'만 앱에 들어 있고, 나머지는 고를 때 물어보고 한 곡씩 내려받아 이 브라우저(IndexedDB)에 둔다. */
const BGM_BASE='https://byotte.github.io/motionpad/bgm/',BGM_BUILTIN='@@base64(bgm/dreamy.mp3)';
const BGM_TRACKS=[{id:'dream',name:'몽환적인',builtin:true},{id:'tense',name:'긴장감'},{id:'cute',name:'깜찍한'},{id:'sticky',name:'끈적한'},{id:'gloomy',name:'슬프고 습한'},{id:'playful',name:'장난스러운'},{id:'korean',name:'한국적인'}];
const bgmHave=new Set(['dream']),bgmBuffers=new Map();let curTrack='dream',bgmGain=null,bgmSources=[],bgmTimer=null,bgmBusy=false;
const bgmInfo=id=>BGM_TRACKS.find(t=>t.id===id);
function validTrack(t){return t==='file'||bgmInfo(t)?t:'dream'}
function paintTrackOptions(){for(const id of ['trackSelect','viewerTrack']){const s=$(id),f=s.querySelector('option[value="file"]');s.querySelectorAll('option:not([value="file"])').forEach(o=>o.remove());for(const t of BGM_TRACKS){const o=document.createElement('option');o.value=t.id;o.textContent=bgmHave.has(t.id)?t.name:t.name+' ↓';s.insertBefore(o,f)}s.value=curTrack}}
async function refreshBgmHave(){if(!db)return;try{for(const k of await dbKeys())if(typeof k==='string'&&k.startsWith('bgm:'))bgmHave.add(k.slice(4));paintTrackOptions()}catch(e){console.warn(e)}}
async function bgmBytes(id){if(bgmInfo(id).builtin){const raw=atob(BGM_BUILTIN),b=new Uint8Array(raw.length);for(let i=0;i<b.length;i++)b[i]=raw.charCodeAt(i);return b.buffer}const blob=db?await getNamed('bgm:'+id):null;return blob?blob.arrayBuffer():null}
// 받지 않은 곡이면 물어보고 내려받는다. 받았으면 true.
async function ensureBgm(id){if(bgmHave.has(id))return true;if(bgmBusy)return false;const t=bgmInfo(id);
 if(!await askConfirm({title:'배경음악 내려받기',message:`‘${t.name}’ 곡(약 1.4MB)을 내려받을까요? 한 번 받으면 이 브라우저에 저장되어 다음부터는 바로 재생됩니다.`,ok:'내려받기'}))return false;
 bgmBusy=true;setStatus(`‘${t.name}’ 곡을 내려받는 중…`);
 try{const r=await fetch(BGM_BASE+id+'.mp3');if(!r.ok)throw Error(r.status);const blob=await r.blob();if(db)await dbPutKey('bgm:'+id,blob);else bgmBuffers.set(id,await (ensureAudio(),audioCtx.decodeAudioData(await blob.arrayBuffer())));bgmHave.add(id);paintTrackOptions();setStatus(`‘${t.name}’ 곡을 받았습니다.`);return true}
 catch(e){console.warn(e);showNotice('내려받지 못했습니다','인터넷 연결을 확인한 뒤 다시 골라 주세요.');return false}finally{bgmBusy=false}}
async function bgmBuffer(id){if(bgmBuffers.has(id))return bgmBuffers.get(id);if(!await ensureBgm(id))return null;const bytes=await bgmBytes(id);if(!bytes)return null;const buf=await audioCtx.decodeAudioData(bytes);bgmBuffers.set(id,buf);return buf}
// 이음새 없는 반복: 곡 끝과 다음 회차 처음을 1.5초 겹쳐 잇는다.
function playBgmLoop(buf){const X=Math.min(1.5,buf.duration/4);bgmGain=audioCtx.createGain();bgmGain.gain.value=Number($('musicVolume').value)/100;bgmGain.connect(audioCtx.destination);const g=bgmGain;
 const seg=(t,first)=>{if(bgmGain!==g)return;const s=audioCtx.createBufferSource(),f=audioCtx.createGain(),end=t+buf.duration;s.buffer=buf;s.connect(f);f.connect(g);f.gain.setValueAtTime(first?1:0,t);if(!first)f.gain.linearRampToValueAtTime(1,t+X);f.gain.setValueAtTime(1,end-X);f.gain.linearRampToValueAtTime(0,end);s.start(t);s.stop(end);bgmSources.push(s);s.onended=()=>{bgmSources=bgmSources.filter(x=>x!==s)};bgmTimer=setTimeout(()=>seg(end-X,false),Math.max(0,(end-X-audioCtx.currentTime-1)*1000))};
 seg(audioCtx.currentTime+.05,true)}
function setMusicVolume(v){if(activeAudio)activeAudio.volume=v/100;if(bgmGain)bgmGain.gain.value=v/100}
function stopMusic(){musicPlaying=false;clearTimeout(bgmTimer);bgmTimer=null;for(const s of bgmSources)try{s.stop()}catch(_){}bgmSources=[];if(bgmGain){bgmGain.disconnect();bgmGain=null}if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;activeAudio=null}$('musicBtn').textContent='▶ 음악';paintMusicPreview()}
async function startMusic(){stopMusic();ensureAudio();await audioCtx.resume();const type=curTrack;if(type==='file'){if(!audioBlob){setStatus('먼저 음악 파일을 불러와 주세요.');return}if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(audioBlob);activeAudio=new Audio(audioURL);activeAudio.loop=true;activeAudio.volume=Number($('musicVolume').value)/100;try{await activeAudio.play()}catch(e){setStatus('재생하려면 화면에서 다시 ▶ 버튼을 눌러 주세요.');activeAudio=null;return}}
 else{const buf=await bgmBuffer(type);if(!buf||curTrack!==type||musicPlaying)return;playBgmLoop(buf)}musicPlaying=true;$('musicBtn').textContent='❚❚ 음악';paintMusicPreview()}
$('musicBtn').onclick=()=>{if(musicPlaying)stopMusic();else startMusic().catch(e=>setStatus('음악 재생 실패: '+e.message))};
// 소리 창에서 들어 보기: 음악은 재생·일시정지 겸용, 효과음은 한 번 울린다. 창을 닫으면 음악도 멈춘다.
function paintMusicPreview(){const b=$('musicPreview');b.querySelector('use').setAttribute('href',musicPlaying?'#i-pause':'#i-play');b.setAttribute('aria-pressed',String(musicPlaying));b.title=b.ariaLabel=musicPlaying?'배경음악 멈추기':'배경음악 들어 보기'}
$('musicPreview').onclick=()=>{if(musicPlaying)stopMusic();else startMusic().catch(e=>setStatus('음악 재생 실패: '+e.message))};
$('sfxPreview').onclick=()=>{const m=effectMuted;effectMuted=false;try{playSfx(1)}finally{effectMuted=m}};
$('soundDialog').addEventListener('close',()=>{if(musicPlaying)stopMusic()});
function setTrack(t){curTrack=validTrack(t);$('trackSelect').value=curTrack;$('viewerTrack').value=curTrack;if(musicPlaying)startMusic().catch(console.warn);scheduleSave()}
// 목록에서 고를 때: 받지 않은 곡이면 먼저 물어본다(취소하면 하던 곡 그대로).
async function chooseTrack(t){if(t!=='file'&&!await ensureBgm(t)){paintTrackOptions();return}setTrack(t)}
$('trackSelect').onchange=e=>chooseTrack(e.target.value);$('viewerTrack').onchange=e=>chooseTrack(e.target.value);paintTrackOptions();
$('musicVolume').oninput=e=>{$('musicVolumeValue').textContent=e.target.value+'%';$('viewerMusicVolume').value=e.target.value;setMusicVolume(e.target.value);scheduleSave()};$('viewerMusicVolume').oninput=e=>{$('musicVolume').value=e.target.value;$('musicVolumeValue').textContent=e.target.value+'%';setMusicVolume(e.target.value);scheduleSave()};
$('sfxVolume').oninput=e=>{$('sfxVolumeValue').textContent=e.target.value+'%';scheduleSave()};$('muteViewer').onclick=()=>{effectMuted=!effectMuted;$('muteViewer').textContent=effectMuted?'▶ 효과음':'❚❚ 효과음';$('muteViewer').setAttribute('aria-pressed',String(!effectMuted))};
// 3-M: 내 효과음 파일. 짧은 소리 하나를 불러와 터치할 때마다 낸다(프로젝트에 함께 저장).
function playFileSfx(power){
 if(!sfxBlob)return;
 if(!sfxBuffer){if(sfxBuffer===null){sfxBuffer=false;sfxBlob.arrayBuffer().then(b=>audioCtx.decodeAudioData(b)).then(buf=>{sfxBuffer=buf}).catch(e=>{sfxBuffer=null;console.warn('효과음 파일',e)})}return}
 const src=audioCtx.createBufferSource(),gain=audioCtx.createGain();src.buffer=sfxBuffer;
 gain.gain.value=Math.min(1,Number($('sfxVolume').value)/100*clamp(power,.3,1.7));
 src.connect(gain);gain.connect(audioMaster);src.start(0,0,Math.min(sfxBuffer.duration,4));
}
function paintSfxFile(){for(const id of ['sfxTypeInput','viewerEffects']){const o=$(id).querySelector('option[value="file"]');o.hidden=o.disabled=!sfxBlob;o.textContent=sfxBlob?`불러온 효과음 · ${sfxName}`.slice(0,40):'불러온 효과음'}}
$('sfxFileBtn').onclick=()=>$('sfxFile').click();
$('sfxFile').onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;if(!f.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|webm)$/i.test(f.name)){showNotice('효과음 파일','오디오 파일(mp3·wav 등)을 골라 주세요.');return}if(f.size>2*1024*1024){showNotice('효과음 파일','효과음 파일은 2MB 이하의 짧은 소리만 쓸 수 있습니다.');return}sfxBlob=f;sfxName=f.name;sfxBuffer=null;paintSfxFile();$('sfxTypeInput').value='file';$('sfxTypeInput').dispatchEvent(new Event('change'));try{ensureAudio();playFileSfx(1)}catch(_){}setStatus('효과음 파일을 불러왔습니다: '+f.name)};
paintSfxFile();
$('musicFileBtn').onclick=()=>$('musicFile').click();$('musicFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|webm)$/i.test(f.name)){showNotice('음악 파일','오디오 파일(mp3·wav 등)을 골라 주세요.');return}if(f.size>15*1024*1024){showNotice('음악 파일','음악 파일은 15MB 이하만 쓸 수 있습니다. 더 작은 파일을 골라 주세요.');return}audioBlob=f;audioName=f.name;setTrack('file');scheduleSave();setStatus('음악 파일을 불러왔습니다: '+f.name);e.target.value=''};
