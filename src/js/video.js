// Client-only video recording. Standard MediaRecorder, with browser-dependent codec.
// Frames are captured after the normal animation update, without the editing overlay.
let videoRecorder=null,videoCaptureTrack=null,videoAnimationFrame=0,videoCancelled=false,videoErrorMessage='';
function interruptVideoRecording(reason){
  if(!videoRecorder||videoRecorder.state!=='recording')return;
  videoCancelled=true;videoErrorMessage=reason||'';
  cancelAnimationFrame(videoAnimationFrame);
  try{videoRecorder.stop()}catch(e){console.warn('영상 녹화 중지:',e)}
}
function videoMimeType(){
 if(!window.MediaRecorder)return null;
 for(const t of ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm']){
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
 const size=sizeOverride||radioValue('videoSize')||'orig';
 let s=size==='orig'?1:Number(size)/Math.min(OW,OH);
 s=Math.min(s,3840/Math.max(OW,OH));
 OW=even(OW*s);OH=even(OH*s);
 const k=(ratio!=='image'&&fitMode==='fit')?Math.min(OW/rw,OH/rh):Math.max(OW/rw,OH/rh);
 const dw=rw*k,dh=rh*k,cap=Math.min(1,4096/Math.max(dw,dh));
 const fps=Number($('videoFPS').value)||30,duration=Number($('videoDuration').value)||5,q=Number($('videoQuality').value);
 const bpp=.02*15**(q/100),bitrate=Math.round(clamp(bpp*OW*OH*fps,250_000,40_000_000));
 return {OW,OH,dw,dh,dx:(OW-dw)/2,dy:(OH-dh)/2,vw:Math.max(1,Math.round(dw*cap)),vh:Math.max(1,Math.round(dh*cap)),fps,duration,bitrate,bytes:bitrate*duration/8,ratio,fitMode};
}
function fmtBytes(b){return b>=1048576?`${(b/1048576).toFixed(b>=10485760?0:1)}MB`:`${Math.max(1,Math.round(b/1024))}KB`}
function refreshVideoPlan(){
 if(!ready)return;const p=videoPlan(),mime=videoMimeType(),ext=mime?.startsWith('video/mp4')?'MP4':mime?'WebM':'';
 const sizeOrig=document.querySelector('input[name="videoSize"][value="orig"]+span');
 if(sizeOrig){const o=videoPlan('orig');sizeOrig.textContent=`원본 ${o.OW}×${o.OH}`}
 const fmt=document.querySelector('input[name="videoFormat"][value="video"]+span');if(fmt)fmt.textContent=ext?`영상 (${ext})`:'영상';
 $('videoQualityValue').textContent=$('videoQuality').value;
 $('videoFitRow').hidden=p.ratio==='image';
 $('videoEstimate').innerHTML=`예상: <b>${p.OW}×${p.OH} · ${p.duration}초 · ${p.fps} FPS · 약 ${fmtBytes(p.bytes)}</b><br><span class="micro">실제 용량은 움직임이 적으면 더 작아질 수 있습니다.</span>`;
}
for(const el of document.querySelectorAll('#videoDialog input,#videoDialog select'))el.addEventListener('input',refreshVideoPlan);
document.querySelector('[data-dialog="videoDialog"]')?.addEventListener('click',()=>setTimeout(refreshVideoPlan));
async function recordVideo(){
 if(!ready){showNotice('영상 내보내기','먼저 그림을 열어 주세요.');return}
 if(videoRecorder&&videoRecorder.state!=='inactive')return;
 const mime=videoMimeType();if(!mime){showNotice('영상 내보내기','이 브라우저는 영상 녹화를 지원하지 않습니다. Chrome에서 다시 시도해 주세요.');return}
 const plan=videoPlan(),{duration,fps,OW:W,OH:H}=plan;
 const output=document.createElement('canvas');output.width=W;output.height=H;
 const g=output.getContext('2d',{alpha:false});
 const first=document.createElement('canvas');first.width=W;first.height=H;const firstG=first.getContext('2d');
 exportRender={w:plan.vw,h:plan.vh};fit();
 const stream=output.captureStream(fps),track=stream.getVideoTracks()[0];videoCaptureTrack=track;
 const chunks=[];let recorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:plan.bitrate});}
 catch(e){track.stop();exportRender=null;fit();showNotice('영상 내보내기','영상 녹화를 시작하지 못했습니다.'+why(e));return}
 blinkEpoch=elapsed;
 videoRecorder=recorder;videoCancelled=false;videoErrorMessage='';
 $('exportVideoBtn').disabled=true;$('cancelVideoBtn').hidden=false;
 $('videoProgress').textContent=`녹화 준비 중 · ${W}×${H} · ${duration}초 / ${fps} FPS`;
 const start=performance.now();let frameNo=0;
 recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 recorder.onerror=e=>{console.error('MediaRecorder error',e);videoCancelled=true;videoErrorMessage='인코더 오류로 영상 저장을 취소했습니다.'};
 recorder.onstop=()=>{
  cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;track.stop();exportRender=null;fit();
  $('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;videoRecorder=null;
  if(videoCancelled){$('videoProgress').textContent=videoErrorMessage||'영상 저장을 취소했습니다.';return}
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  if(blob.size<1500){$('videoProgress').textContent='영상 파일 생성에 실패했습니다. 다른 브라우저에서 시도해 주세요.';return}
  const ext=mime.startsWith('video/mp4')?'mp4':'webm',name=String(projectName||'MotionPad').replace(/[\/:*?"<>|]/g,'_');
  safeDownloadVideo(blob,`${name}_${W}x${H}_${duration}s.${ext}`);
  $('videoProgress').textContent=`저장 완료 · ${W}×${H} · ${duration}초 · ${ext.toUpperCase()} · ${fmtBytes(blob.size)}`;
 };
 recorder.start();
 function nextFrame(now){
  if(videoCancelled||recorder.state!=='recording')return;
  const elapsedTime=(now-start)/1000;
  // Record at the selected FPS instead of capturing every display refresh.
  if(elapsedTime>=frameNo/fps||frameNo===0){
    g.fillStyle='#000';g.fillRect(0,0,W,H);g.drawImage(view,plan.dx,plan.dy,plan.dw,plan.dh);
    if(frameNo===0)firstG.drawImage(output,0,0);
    const fade=Math.max(0,Math.min(1,(elapsedTime-(duration-.42))/.42));
    if(fade>0){g.globalAlpha=fade*fade*(3-2*fade);g.drawImage(first,0,0);g.globalAlpha=1}
    frameNo++;
  }
  $('videoProgress').textContent=`영상 녹화 ${Math.min(duration,elapsedTime).toFixed(1)} / ${duration}초`;
  if(elapsedTime<duration)videoAnimationFrame=requestAnimationFrame(nextFrame);
  else{setTimeout(()=>{if(recorder.state==='recording')recorder.stop()},140)}
 }
 videoAnimationFrame=requestAnimationFrame(nextFrame);
}
$('exportVideoBtn').onclick=()=>recordVideo().catch(e=>{console.error(e);exportRender=null;fit();$('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;showNotice('영상 내보내기','영상을 저장하다 문제가 생겼습니다.'+why(e))});
$('cancelVideoBtn').onclick=()=>interruptVideoRecording('사용자가 영상 저장을 취소했습니다.');

