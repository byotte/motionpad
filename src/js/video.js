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
async function recordVideo(){
 if(!ready){alert('먼저 이미지를 불러와 주세요.');return}
 if(videoRecorder&&videoRecorder.state!=='inactive')return;
 const mime=videoMimeType();if(!mime){alert('현재 브라우저는 동영상 녹화를 지원하지 않습니다. Chrome에서 다시 시도해 주세요.');return}
 const duration=Number($('videoDuration').value)||5,fps=Number($('videoFPS').value)||30;
 const target=Math.min(1280,renderWidth),W=Math.round(target),H=Math.max(1,Math.round(target*renderHeight/renderWidth));
 const output=document.createElement('canvas');output.width=W;output.height=H;
 const g=output.getContext('2d',{alpha:false});
 const first=document.createElement('canvas');first.width=W;first.height=H;const firstG=first.getContext('2d');
 const stream=output.captureStream(fps),track=stream.getVideoTracks()[0];videoCaptureTrack=track;
 const chunks=[];let recorder;
 try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(8_000_000,Math.max(1_200_000,W*H*3))});}
 catch(e){track.stop();alert('영상 인코더를 시작하지 못했습니다: '+e.message);return}
 blinkEpoch=elapsed;
 videoRecorder=recorder;videoCancelled=false;videoErrorMessage='';
 $('exportVideoBtn').disabled=true;$('cancelVideoBtn').hidden=false;
 $('videoProgress').textContent=`녹화 준비 중 · ${duration}초 / ${fps} FPS`;
 const start=performance.now();let frameNo=0;
 recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 recorder.onerror=e=>{console.error('MediaRecorder error',e);videoCancelled=true;videoErrorMessage='인코더 오류로 영상 저장을 취소했습니다.'};
 recorder.onstop=()=>{
  cancelAnimationFrame(videoAnimationFrame);videoAnimationFrame=0;track.stop();
  $('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;videoRecorder=null;
  if(videoCancelled){$('videoProgress').textContent=videoErrorMessage||'영상 저장을 취소했습니다.';return}
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  if(blob.size<1500){$('videoProgress').textContent='영상 파일 생성에 실패했습니다. 다른 브라우저에서 시도해 주세요.';return}
  const ext=mime.startsWith('video/mp4')?'mp4':'webm',name=String(projectName||'MotionPad').replace(/[\/:*?"<>|]/g,'_');
  safeDownloadVideo(blob,`${name}_${duration}s.${ext}`);
  $('videoProgress').textContent=`저장 완료 · ${duration}초 · ${ext.toUpperCase()} · ${Math.max(1,Math.round(blob.size/1024))}KB`;
 };
 recorder.start();
 function nextFrame(now){
  if(videoCancelled||recorder.state!=='recording')return;
  const elapsedTime=(now-start)/1000;
  // Record at the selected FPS instead of capturing every display refresh.
  if(elapsedTime>=frameNo/fps||frameNo===0){
    g.clearRect(0,0,W,H);g.drawImage(view,0,0,W,H);
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
$('exportVideoBtn').onclick=()=>recordVideo().catch(e=>{console.error(e);$('exportVideoBtn').disabled=false;$('cancelVideoBtn').hidden=true;alert('영상 저장 중 오류: '+e.message)});
$('cancelVideoBtn').onclick=()=>interruptVideoRecording('사용자가 영상 저장을 취소했습니다.');

