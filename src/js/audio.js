/* 0.3 오디오: 라이선스가 필요한 외부 파일 대신 직접 합성한 음향 */
const builtinSfx64={wetClip:'@@base64(sfx/wet-clip.wav)',hardClip:'@@base64(sfx/hard-clip.wav)',softClip:'@@base64(sfx/soft-clip.wav)',mudClip:'@@base64(sfx/mud-clip.wav)'};
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
function tone(freq,when,duration=.35,shape='sine',level=.08,slide=0){if(!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain(),v=Number($('musicVolume').value)/100;o.type=shape;o.frequency.setValueAtTime(freq,when);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),when+duration*.7);g.gain.setValueAtTime(0,when);g.gain.linearRampToValueAtTime(Math.max(.0001,level*v),when+.035);g.gain.exponentialRampToValueAtTime(.0001,when+duration);o.connect(g);g.connect(audioMaster);o.start(when);o.stop(when+duration+.03)}
function musicStep(){if(!musicPlaying||!audioCtx)return;const type=$('trackSelect').value,step=musicTick++,t=audioCtx.currentTime+.025,chords={lounge:[[0,3,7,10],[5,8,12,15],[7,10,14,17],[2,5,9,12]],dream:[[0,4,7,11],[9,12,16,19],[5,9,12,16],[7,11,14,18]],mystery:[[0,3,7,10],[1,5,8,12],[5,8,12,15],[3,6,10,13]]},base={lounge:110,dream:131,mystery:98}[type],scale=chords[type][Math.floor(step/8)%4];
if(step%2===0){const bass=base*Math.pow(2,scale[0]/12);tone(bass,t,.65,'sine',.12);if(type==='lounge')tone(bass*2,t+.07,.22,'triangle',.03)}
const degree=scale[(step%4)],freq=base*2*Math.pow(2,degree/12);tone(freq,t,type==='dream'?1.25:.38,type==='mystery'?'triangle':'sine',type==='dream'?.065:.075);if(type==='lounge'&&step%4===3)tone(freq*1.5,t+.18,.18,'sine',.025);
}
function stopMusic(){musicPlaying=false;clearInterval(musicTimer);musicTimer=null;if(activeAudio){activeAudio.pause();activeAudio.currentTime=0;activeAudio=null}$('musicBtn').textContent='▶ 음악'}
async function startMusic(){stopMusic();ensureAudio();await audioCtx.resume();const type=$('trackSelect').value;if(type==='file'){if(!audioBlob){setStatus('먼저 음악 파일을 불러와 주세요.');return}if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(audioBlob);activeAudio=new Audio(audioURL);activeAudio.loop=true;activeAudio.volume=Number($('musicVolume').value)/100;try{await activeAudio.play()}catch(e){setStatus('재생하려면 화면에서 다시 ▶ 버튼을 눌러 주세요.');activeAudio=null;return}}musicPlaying=true;musicTick=0;if(type!=='file'){musicStep();musicTimer=setInterval(musicStep,type==='dream'?650:type==='lounge'?430:480)}$('musicBtn').textContent='❚❚ 정지'}
$('musicBtn').onclick=()=>{if(musicPlaying)stopMusic();else startMusic().catch(e=>setStatus('음악 재생 실패: '+e.message))};
function setTrack(t){$('trackSelect').value=t;$('viewerTrack').value=t;if(musicPlaying)startMusic().catch(console.warn);scheduleSave()}
$('trackSelect').onchange=e=>setTrack(e.target.value);$('viewerTrack').onchange=e=>setTrack(e.target.value);
$('musicVolume').oninput=e=>{$('musicVolumeValue').textContent=e.target.value+'%';$('viewerMusicVolume').value=e.target.value;if(activeAudio)activeAudio.volume=e.target.value/100;scheduleSave()};$('viewerMusicVolume').oninput=e=>{$('musicVolume').value=e.target.value;$('musicVolumeValue').textContent=e.target.value+'%';if(activeAudio)activeAudio.volume=e.target.value/100;scheduleSave()};
$('sfxVolume').oninput=e=>{$('sfxVolumeValue').textContent=e.target.value+'%';scheduleSave()};$('muteViewer').onclick=()=>{effectMuted=!effectMuted;$('muteViewer').textContent=effectMuted?'효과음 켜기':'효과음 끄기'};
$('musicFileBtn').onclick=()=>$('musicFile').click();$('musicFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('audio/')&&!/\.(mp3|m4a|wav|ogg|webm)$/i.test(f.name)){showNotice('음악 파일','오디오 파일(mp3·wav 등)을 골라 주세요.');return}if(f.size>15*1024*1024){showNotice('음악 파일','음악 파일은 15MB 이하만 쓸 수 있습니다. 더 작은 파일을 골라 주세요.');return}audioBlob=f;audioName=f.name;setTrack('file');scheduleSave();setStatus('음악 파일을 불러왔습니다: '+f.name);e.target.value=''};
