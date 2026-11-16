// Client-only video recording. Standard MediaRecorder, with browser-dependent codec.
// Frames are captured after the normal animation update, without the editing overlay.
let videoRecorder=null,videoCaptureTrack=null,videoAnimationFrame=0,videoCancelled=false,videoErrorMessage='';
function interruptVideoRecording(reason){
  if(exportPreparing){exportAbort=true;return}
  if(!videoRecorder||videoRecorder.state!=='recording')return;
  videoCancelled=true;videoErrorMessage=reason||'';
  cancelAnimationFrame(videoAnimationFrame);
  try{videoRecorder.stop()}catch(e){console.warn('영상 녹화 중지:',e)}
}
function videoMimeType(withAudio=false){
 if(!window.MediaRecorder)return null;
 const list=withAudio?['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
 for(const t of list){
   if(MediaRecorder.isTypeSupported(t))return t;
 }
 return null;
}
function safeDownloadVideo(blob,name){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 setStatus('영상 저장을 시작했습니다. 다운로드 목록에서 파일을 확인하세요.');
}
// 3-D: 고른 비율·크기·화질로 출력 크기와 그림을 그릴 크기·위치, 비트레이트를 정한다.
const radioValue=name=>document.querySelector(`input[name="${name}"]:checked`)?.value;
const even=n=>Math.max(2,Math.round(n/2)*2);
function videoPlan(sizeOverride){
 const rw=renderWidth,rh=renderHeight,ratio=radioValue('videoRatio')||'image',fitMode=radioValue('videoFit')||'fill';
 const r=ratio==='image'?rw/rh:(([a,b])=>a/b)(ratio.split(':').map(Number));
 let OW=rw,OH=rh;
 if(ratio!=='image'){const tall=r<rw/rh;if(fitMode==='fill'){if(tall){OH=rh;OW=rh*r}else{OW=rw;OH=rw/r}}else{if(tall){OW=rw;OH=rw/r}else{OH=rh;OW=rh*r}}}
 const size=sizeOverride||radioValue('videoSize')||'orig',format=radioValue('videoFormat')||'video';
 // 3-G: 원본 = 처음 연 그림의 크기(편집 사본 1900px가 아니라). 영상은 긴 변 3840(4K), 움짤은 2048까지.
 const up=Math.max(1,Math.max(sourceSize.w,sourceSize.h)/Math.max(rw,rh)||1),maxLong=format==='gif'?2048:3840;
 // 직접 입력: 비율 유지면 가로에 맞춰 같은 비율로, 아니면 적은 가로×세로 그대로(그림과 비율이 다르면 '비율이 다를 때' 방식으로 채운다).
 const custom=size==='custom',cw=clamp(Number($('videoW').value)||0,16,3840),ch=clamp(Number($('videoH').value)||0,16,3840),free=custom&&!$('videoKeepRatio').checked;
 if(free){const a=cw/ch,ia=rw/rh;if(fitMode==='fill'?a<ia:a>=ia){OH=rh;OW=rh*a}else{OW=rw;OH=rw/a}}
 let s=size==='orig'?up:custom?cw/OW:Number(size)/Math.min(OW,OH);
 // 영상 인코더는 긴 변뿐 아니라 픽셀 수도 4K(3840×2160 = 약 830만)까지만 받는다(넘으면 녹화가 실패한다, 3-G 측정).
 const lim4k=format==='gif'?Infinity:Math.sqrt(3840*2160/(OW*OH)),sMax=Math.min(maxLong/Math.max(OW,OH),lim4k);
 const capped=s>sMax*1.001;s=Math.min(s,sMax);
 OW=even(OW*s);OH=even(OH*s);
 const fitActive=ratio!=='image'||free;
 const k=(fitActive&&fitMode==='fit')?Math.min(OW/rw,OH/rh):Math.max(OW/rw,OH/rh);
 const lim=glLimits(),devLong=Math.min(8192,lim.view||4096,lim.tex||4096),dw=rw*k,dh=rh*k,cap=Math.min(1,devLong/Math.max(dw,dh));
 const srcLong=Math.max(sourceSize.w,sourceSize.h)||Math.max(rw,rh),drawLong=Math.max(dw,dh),deviceLimited=drawLong>devLong+1&&srcLong>devLong;
 const fps=Number($('videoFPS').value)||30,duration=Number($('videoDuration').value)||5,q=Number($('videoQuality').value);
 const bpp=.02*15**(q/100),bitrate=Math.round(clamp(bpp*OW*OH*fps,250_000,40_000_000));
 const gifColors=Math.round(32+q/100*224);
 return {format,gifColors,capped,maxLong,deviceLimited,devLong,drawLong,OW,OH,dw,dh,dx:(OW-dw)/2,dy:(OH-dh)/2,vw:Math.max(1,Math.round(dw*cap)),vh:Math.max(1,Math.round(dh*cap)),fps,duration,bitrate,custom,fitActive,bytes:format==='gif'?gifEstimate(OW,OH,fps,duration,gifColors):bitrate*duration/8,ratio,fitMode};
}
// 움짤 용량 추정: 첫 장(전체) + 이후 장(바뀐 부분). 샘플 그림으로 잰 값에 맞춘 대략치.
// 3-N: 그림 전체가 움직이면(몸체 움직이기 켬) 프레임마다 거의 전부가 바뀌어 훨씬 커진다. 한 번 저장하면 실제 크기로 보정한다(gifCal).
let gifCal=0;
function gifEstimate(W,H,fps,duration,colors){const px=W*H,c=.55+.45*colors/256,whole=ambient.enabled&&(ambient.breath>0||ambient.sway>0),per=gifCal||(whole?.6:.07);return px*.45*c+px*per*c*fps*duration}
// 전체 움직임(호흡·흔들림)이 그림을 밀면 가장자리에 검은 줄이 드러난다. 영상에서는 그만큼 살짝 확대해 가린다.
function drawExportFrame(g,plan,W,H,withFx){
 const ov=ambient.enabled?Math.max(.016*ambient.breath,.013*ambient.sway)/100+.002:0,sw=view.width,sh=view.height;
 g.fillStyle='#000';g.fillRect(0,0,W,H);g.drawImage(view,sw*ov,sh*ov,sw*(1-2*ov),sh*(1-2*ov),plan.dx,plan.dy,plan.dw,plan.dh);
 if(hitCracks.length){const fw=crackLayer.width,fh=crackLayer.height;g.drawImage(crackLayer,fw*ov,fh*ov,fw*(1-2*ov),fh*(1-2*ov),plan.dx,plan.dy,plan.dw,plan.dh)}// 갈라짐은 그림의 반응이라 '터치 표시'와 상관없이 담는다
 if(withFx&&sparkles.length){const fw=fxLayer.width,fh=fxLayer.height;g.drawImage(fxLayer,fw*ov,fh*ov,fw*(1-2*ov),fh*(1-2*ov),plan.dx,plan.dy,plan.dw,plan.dh)}
}
const waitFrames=n=>new Promise(r=>{const step=()=>--n<=0?r():requestAnimationFrame(step);requestAnimationFrame(step)});
function fmtBytes(b){return b>=1048576?`${(b/1048576).toFixed(b>=10485760?0:1)}MB`:`${Math.max(1,Math.round(b/1024))}KB`}
// 3-G: 원본·큰 크기를 골랐을 때만 나오는 안내.
function videoWarnings(p){
 const w=[];
 if(p.capped)w.push(p.format==='gif'?`움짤은 긴 변 ${p.maxLong}px까지 저장합니다(그보다 크면 만드는 중 멈추거나 열리지 않을 수 있어서).`:`${p.custom?'입력한 크기가':'원본이'} 커서 4K 크기(긴 변 ${p.maxLong}px, 약 830만 픽셀)에 맞춰 줄여 저장합니다. 영상 녹화기가 받을 수 있는 최대 크기입니다.`);
 if(p.deviceLimited)w.push(`이 기기는 그림을 최대 ${p.devLong}px까지만 그릴 수 있어, 그만큼 그린 뒤 늘려 저장합니다. 크게 확대하면 조금 덜 선명할 수 있습니다.`);
 if(p.format==='gif'&&(Math.max(p.OW,p.OH)>1080||p.bytes>15*1048576))w.push('큰 움짤은 ① 메신저·SNS에 용량 제한으로 안 올라가거나 ② 사진첩·뷰어에서 늦게 열리고 재생이 끊기거나 ③ 만드는 동안 프레임이 빠져 뚝뚝 끊길 수 있습니다. 480~720을 권합니다.');
 return w.length?`<span class="videoWarn">${w.join('<br>')}</span>`:'';
}
function refreshVideoPlan(){
 if(!ready)return;const p=videoPlan(),mime=videoMimeType(),ext=mime?.startsWith('video/mp4')?'MP4':mime?'WebM':'';
 const sizeOrig=document.querySelector('input[name="videoSize"][value="orig"]+span');
 if(sizeOrig){const o=videoPlan('orig');sizeOrig.textContent=`원본 ${o.OW}×${o.OH}`}
 const fmt=document.querySelector('input[name="videoFormat"][value="video"]+span');if(fmt)fmt.textContent=ext?`영상 (${ext})`:'영상';
 const q=Number($('videoQuality').value);$('videoQualityValue').textContent=String(q);
 $('videoCustomRow').hidden=!p.custom;
 // 직접 입력 칸: 고르지 않았을 때는 지금 크기를 따라가고, 비율 유지면 세로는 가로에서 계산해 보여 준다.
 if(!p.custom){$('videoW').value=p.OW;$('videoH').value=p.OH}else if($('videoKeepRatio').checked&&document.activeElement!==$('videoH'))$('videoH').value=p.OH;$('exportVideoBtn').textContent=p.format==='gif'?'움짤 저장':'영상 저장';
 $('videoFitRow').hidden=!p.fitActive;
 $('videoEstimate').innerHTML=`예상: <b>${p.OW}×${p.OH} · ${p.duration}초 · ${p.fps} FPS${p.format==='gif'?` · ${p.gifColors}색`:''} · 약 ${fmtBytes(p.bytes)}</b><br><span class="micro">${p.format==='gif'?(p.bytes>1.5*p.bitrate*p.duration/8?'움짤은 영상보다 훨씬 큽니다. 크기 480·짧은 길이를 권합니다.':'움짤은 색 수가 적어 영상보다 거칠게 보일 수 있습니다.'):'실제 용량은 움직임이 적으면 더 작아질 수 있습니다.'}</span>`+videoWarnings(p);
}
// 형식을 바꾸면 그 형식에 맞는 크기·FPS로 바꿔 둔다(움짤 480·15 FPS, 영상 원본·30 FPS). 이후 사용자가 바꾼 값은 그대로.
for(const r of document.querySelectorAll('input[name="videoFormat"]'))r.addEventListener('change',()=>{const gif=r.value==='gif'&&r.checked;
 const s=document.querySelector(`input[name="videoSize"][value="${gif?'480':'orig'}"]`);if(s)s.checked=true;$('videoFPS').value=gif?'15':'30';refreshVideoPlan()});
// 비율 유지 상태에서 세로를 고치면 가로를 같은 비율로 맞춘다(가로를 고치면 세로는 refreshVideoPlan이 맞춘다).
$('videoH').addEventListener('input',()=>{if(!ready||!$('videoKeepRatio').checked)return;const p=videoPlan('orig'),h=Number($('videoH').value);if(h>0)$('videoW').value=Math.round(h*p.OW/p.OH)});
for(const el of document.querySelectorAll('#videoDialog input,#videoDialog select'))el.addEventListener('input',refreshVideoPlan);
document.querySelector('[data-dialog="videoDialog"]')?.addEventListener('click',()=>setTimeout(()=>{refreshVideoPlan();paintVideoNote()}));
for(const el of document.querySelectorAll('input[name="videoFormat"],#videoMusic'))el.addEventListener('change',paintVideoNote);
// opts.live: 플레이 화면 녹화(● 버튼). 멈출 때까지(최대 60초) 녹화하고 끝 이어붙이기는 하지 않는다. opts.fx: 터치 이펙트 넣기.
const LIVE_MAX=60;
// 연속 움직임 녹화 아래 안내: 형식·배경음악 포함 여부에 따라 바뀐다.
function videoNote(){const gif=radioValue('videoFormat')==='gif',music=$('videoMusic').checked;$('videoMusic').disabled=gif;
 if(gif)return '움짤에는 소리가 담기지 않습니다. ‘연속 움직임’만 담습니다.';
 if(!music)return '소리 없이 ‘연속 움직임’만 담습니다.';
 const name=curTrack==='file'?(audioName||'불러온 음악'):(bgmInfo(curTrack)?.name||'배경음악');
 return `‘연속 움직임’에 배경음악 ‘${name}’을 함께 담습니다. 효과음은 담기지 않습니다.`}
function paintVideoNote(){if(!exportPreparing&&!(videoRecorder&&videoRecorder.state!=='inactive'))$('videoProgress').textContent=videoNote()}
// 녹화 준비: 고른 크기로 그리게 바꾸고, 필요하면 원본 그림을 올린다(3-G). 원본 준비는 몇 초 걸릴 수 있어 먼저 안내를 띄우고 시작한다.
// 준비하는 동안 멈춤(● 다시 누름·화면 전환)이 들어오면 되돌리고 false.
let exportPreparing=false,exportAbort=false;
function endExportRender(){exportRender=null;leaveHiRes();fit()}
async function beginExport(plan,opts){
 exportPreparing=true;exportAbort=false;$('exportVideoBtn').disabled=true;
 try{
  const need=Math.max(plan.vw,plan.vh);
  if(hiResWant(need)){
   const msg='원본 그림을 준비하고 있습니다. 잠시만 기다려 주세요.';$('videoProgress').textContent=msg;if(opts.live)showViewerToast(msg);
   await waitFrames(2);// 안내가 화면에 그려진 뒤에 무거운 일을 시작한다
  }
  exportRender={w:plan.vw,h:plan.vh};fit();
  await enterHiRes(need).catch(e=>console.warn('원본 올리기 실패, 편집 사본으로 녹화',e));
  await waitFrames(3);// 크기를 바꾸면 그림이 지워진다. 다시 그려진 뒤부터 찍어야 첫 장(팔레트·끝 이어붙이기 기준)이 비지 않는다
 }finally{exportPreparing=false}
 if(exportAbort){endExportRender();$('exportVideoBtn').disabled=false;$('videoProgress').textContent='저장을 취소했습니다.';liveDone('');return false}
 if(opts.live)showViewerToast(opts.limit?`녹화 중 · ${opts.limit}초 뒤 자동으로 저장합니다`:`녹화 중 · 다시 누르면 저장합니다(최대 ${LIVE_MAX}초)`);
 return true;
}
async function recordVideo(opts={}){
 if(!ready){showNotice('영상 내보내기','먼저 그림을 열어 주세요.');return}
 if(exportPreparing||videoRecorder&&videoRecorder.state!=='inactive')return;
 const plan=videoPlan();if(opts.live)plan.duration=opts.limit||LIVE_MAX;if(plan.format==='gif')return recordGif(plan,opts);
 // 소리: 플레이 화면 녹화는 들리는 그대로(배경음악·효과음), 연속 움직임 녹화는 '배경음악 포함'일 때 배경음악만.
 const wantMusic=!opts.live&&$('videoMusic').checked;
 const mime=videoMimeType(opts.live||wantMusic);if(!mime){showNotice('영상 내보내기','이 브라우저는 영상 녹화를 지원하지 않습니다. Chrome에서 다시 시도해 주세요.');return}
 const {duration,fps,OW:W,OH:H}=plan;
 const output=document.createElement('canvas');output.width=W;output.height=H;
 const g=output.getContext('2d',{alpha:false});
 const first=document.createElement('canvas');first.width=W;first.height=H;const firstG=first.getContext('2d');
 if(!await beginExport(plan,opts))return;
 const stream=output.captureStream(fps),track=stream.getVideoTracks()[0];videoCaptureTrack=track;
 let sound=null;
 try{sound=opts.live?audioRecordTap():wantMusic?await musicForRecording(duration):null}catch(e){console.warn('녹화 소리',e)}
 if(wantMusic&&!sound)setStatus('배경음악을 준비하지 못해 소리 없이 녹화합니다.');
 if(sound)stream.addTrack(sound.track);
 const chunks=[];let recorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:plan.bitrate,...(sound?{audioBitsPerSecond:160_000}:{})});}
 catch(e){track.stop();sound?.stop();endExportRender();$('exportVideoBtn').disabled=false;liveDone('');showNotice('영상 내보내기','영상 녹화를 시작하지 못했습니다.'+why(e));return}
 blinkEpoch=elapsed;
 videoRecorder=recorder;videoCancelled=false;videoErrorMessage='';
 $('cancelVideoBtn').hidden=false;
 $('videoProgress').textContent=`녹화 준비 중 · ${W}×${H} · ${duration}초 / ${fps} FPS`;
 const start=performance.now();let frameNo=0;const secs=()=>Math.max(1,Math.round((performance.now()-start)/1000));
 recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 recorder.onerror=e=>{console.error('MediaRecorder error',e);videoCancelled=true;videoErrorMessage='이 기기에서 이 크기로는 영상을 만들지 못했습니다. 세부 설정에서 크기를 1080으로 줄여 다시 시도해 주세요.'};
 recorder.onstop=()=>{
  cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;track.stop();sound?.stop();sound?.track.stop();endExportRender();
  $('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;videoRecorder=null;
  if(videoCancelled){$('videoProgress').textContent=videoErrorMessage||'영상 저장을 취소했습니다.';liveDone('');return}
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  if(blob.size<1500){$('videoProgress').textContent='영상 파일 생성에 실패했습니다. 다른 브라우저에서 시도해 주세요.';liveDone('녹화 파일을 만들지 못했습니다.');return}
  const ext=mime.startsWith('video/mp4')?'mp4':'webm',name=String(projectName||'MotionPad').replace(/[\/:*?"<>|]/g,'_');
  const sec=opts.live?secs():duration;safeDownloadVideo(blob,`${name}_${W}x${H}_${sec}s.${ext}`);
  $('videoProgress').textContent=videoNote();liveDone(`영상을 저장했습니다 · ${sec}초 · ${fmtBytes(blob.size)}`);
 };
 recorder.start();sound?.start?.();
 function nextFrame(now){
  if(videoCancelled||recorder.state!=='recording')return;
  const elapsedTime=(now-start)/1000;
  // Record at the selected FPS instead of capturing every display refresh.
  if(elapsedTime>=frameNo/fps||frameNo===0){
    drawExportFrame(g,plan,W,H,opts.fx);
    if(frameNo===0)firstG.drawImage(output,0,0);
    const fade=opts.live?0:Math.max(0,Math.min(1,(elapsedTime-(duration-.42))/.42));
    if(fade>0){g.globalAlpha=fade*fade*(3-2*fade);g.drawImage(first,0,0);g.globalAlpha=1}
    frameNo++;
  }
  $('videoProgress').textContent=`영상 녹화 ${Math.min(duration,elapsedTime).toFixed(1)} / ${duration}초`;if(opts.live)liveTick(elapsedTime);
  if(elapsedTime<duration)videoAnimationFrame=requestAnimationFrame(nextFrame);
  else{setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},140)}
 }
 videoAnimationFrame=requestAnimationFrame(nextFrame);
}
// 3-E 움짤: 같은 방식으로 그린 프레임을 GIF로 바로 인코딩한다. 프레임마다 실제로 흐른 시간을 보여줄 시간으로 써서 속도가 맞다.
async function recordGif(plan,opts={}){
 const {duration,fps,OW:W,OH:H}=plan;
 const output=document.createElement('canvas');output.width=W;output.height=H;
 const g=output.getContext('2d',{alpha:false,willReadFrequently:true});
 const first=document.createElement('canvas');first.width=W;first.height=H;const firstG=first.getContext('2d');
 const enc=createGifEncoder(W,H,{colors:plan.gifColors,extra:opts.fx?[[255,250,232],[255,255,255],[60,48,36]]:[]});
 const fake={state:'recording',stop(){this.state='inactive';finish()}};
 if(!await beginExport(plan,opts))return;
 videoRecorder=fake;videoCancelled=false;videoErrorMessage='';
 blinkEpoch=elapsed;$('cancelVideoBtn').hidden=false;
 let start=0,frameNo=0,pending=null,pendingAt=0,carry=0;
 function push(now){if(!pending)return;const cs=(now-pendingAt)/10+carry,d=Math.max(2,Math.round(cs));carry=cs-d;enc.addFrame(pending,d)}
 function finish(){
  cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;endExportRender();
  $('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;videoRecorder=null;
  if(videoCancelled){$('videoProgress').textContent=videoErrorMessage||'움짤 저장을 취소했습니다.';liveDone('');return}
  const endAt=opts.live?performance.now():start+duration*1000,sec=Math.max(1,Math.round((endAt-start)/1000));push(endAt);
  const blob=new Blob([enc.finish()],{type:'image/gif'}),name=String(projectName||'MotionPad').replace(/[\/:*?"<>|]/g,'_');
  safeDownloadVideo(blob,`${name}_${W}x${H}_${sec}s.gif`);
  $('videoProgress').textContent=videoNote();{const c=.55+.45*plan.gifColors/256,frames=Math.max(1,sec*fps);gifCal=clamp(blob.size/(W*H*c*frames),.02,1.2);refreshVideoPlan()}liveDone(`움짤을 저장했습니다 · ${sec}초 · ${fmtBytes(blob.size)}`);
 }
 function nextFrame(now){
  if(videoCancelled||fake.state!=='recording')return;
  if(!start)start=now;
  const t=(now-start)/1000;
  if(t>=frameNo/fps||frameNo===0){
   drawExportFrame(g,plan,W,H,opts.fx);
   if(frameNo===0)firstG.drawImage(output,0,0);
   const fade=opts.live?0:Math.max(0,Math.min(1,(t-(duration-.42))/.42));
   if(fade>0){g.globalAlpha=fade*fade*(3-2*fade);g.drawImage(first,0,0);g.globalAlpha=1}
   push(now);pending=g.getImageData(0,0,W,H).data;pendingAt=now;frameNo++;
  }
  $('videoProgress').textContent=`움짤 만드는 중 ${Math.min(duration,t).toFixed(1)} / ${duration}초 · ${fmtBytes(enc.size())}`;if(opts.live)liveTick(t);
  if(t<duration)videoAnimationFrame=requestAnimationFrame(nextFrame);else fake.stop();
 }
 videoAnimationFrame=requestAnimationFrame(nextFrame);
}
$('exportVideoBtn').onclick=()=>recordVideo().catch(e=>{console.error(e);exportPreparing=false;endExportRender();$('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;showNotice('영상 내보내기','영상을 저장하다 문제가 생겼습니다.'+why(e))});
// 3-M: 내보내기 창에서 바로 플레이 화면 녹화로 넘어간다(크기·화질·형식은 이 창의 값)
let liveLimit=0;// 내보내기 창에서 넘어온 녹화는 고른 길이만큼만 찍고 저절로 저장한다
$('liveRecBtn').onclick=async()=>{$('videoDialog').close();await enterViewer();liveLimit=Number($('videoDuration').value)||5;if(viewerOpen&&!liveRecording)$('recViewer').click()};
$('cancelVideoBtn').onclick=()=>interruptVideoRecording('사용자가 영상 저장을 취소했습니다.');

// 3-F 플레이 화면 녹화(●). 크기·화질·형식은 '영상으로 내보내기' 창의 값을 쓴다. 버튼 자체는 영상에 찍히지 않는다(그림만 그린다).
let liveRecording=false;
function liveTick(t){const s=Math.floor(t);$('recViewer').querySelector('span').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function liveDone(msg){if(!liveRecording)return;liveRecording=false;const b=$('recViewer');b.classList.remove('recording');b.querySelector('span').textContent='';b.title=b.ariaLabel='녹화 시작';if(msg)showViewerToast(msg)}
function showViewerToast(msg){const h=$('viewerHint');h.textContent=msg;h.classList.remove('dim');clearTimeout(showViewerToast.t);showViewerToast.t=setTimeout(()=>h.classList.add('dim'),3200)}
function stopLiveRecording(){if(exportPreparing){exportAbort=true;return}if(liveRecording&&videoRecorder&&videoRecorder.state==='recording')videoRecorder.stop()}
$('recViewer').onclick=()=>{
 if(liveRecording){stopLiveRecording();return}
 if(videoRecorder&&videoRecorder.state!=='inactive')return;
 if(radioValue('videoFormat')!=='gif'&&!videoMimeType()){showViewerToast('이 브라우저는 영상 녹화를 지원하지 않습니다.');return}
 liveRecording=true;const b=$('recViewer');b.classList.add('recording');b.title=b.ariaLabel='녹화 멈추고 저장';liveTick(0);
 const limit=liveLimit;liveLimit=0;
 recordVideo({live:true,limit,fx:$('videoFx').checked}).catch(e=>{console.error(e);exportPreparing=false;endExportRender();liveDone('녹화하지 못했습니다.'+why(e))});
};
