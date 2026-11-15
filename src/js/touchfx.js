// 3-F 플레이 화면 터치 표시. 3-M: 평소 플레이 중에는 아무것도 그리지 않고, 녹화 중(●)이고 '터치한 자리 표시'가 켜져 있을 때만 그린다.
// 모양 셋(내보내기 창에서 고름): 물결 고리(누른 자리에서 작은 고리가 퍼짐) · 작은 점 · 반짝임(작은 별빛). 크기는 예전의 절반 이하.
// 위치는 그림 기준(0~1)이라 화면·영상 크기가 달라도 같은 자리에 그려진다. 밝은 그림에서도 보이게 얇은 어두운 테두리.
const fxLayer=$('fxLayer'),fxCtx=fxLayer.getContext('2d');
let sparkles=[],fxDirty=false,fxLastSpawn=0;
const fxOn=()=>viewerOpen&&liveRecording&&$('videoFx').checked;
function spawnFx(x,y,tap){
 const now=performance.now()/1000,kind=$('videoFxKind').value;
 if(kind==='sparkle'){for(let i=0;i<(tap?4:1);i++)sparkles.push({kind,x,y,t0:now+i*.015,life:.6,a:Math.random()*Math.PI*2,d:.5+Math.random()*.5,s:.75+Math.random()*.5})}
 else if(kind==='ring'&&tap)sparkles.push({kind,x,y,t0:now,life:.45});
 else sparkles.push({kind:'dot',x,y,t0:now,life:tap?.5:.4,s:tap?1:.7});// 끌 때는 작은 점이 자국처럼 남는다
 if(sparkles.length>80)sparkles.splice(0,sparkles.length-80);
}
overlay.addEventListener('pointerdown',e=>{if(!fxOn()||pointers.size>1)return;const p=pointerPos(e);spawnFx(p.x,p.y,true);fxLastSpawn=performance.now()});
overlay.addEventListener('pointermove',e=>{if(!fxOn()||!pointers.has(e.pointerId)||pointers.size>1)return;const now=performance.now();if(now-fxLastSpawn<70)return;fxLastSpawn=now;const p=pointerPos(e);spawnFx(p.x,p.y,false)});
function drawTouchFx(){
 if(!sparkles.length&&!fxDirty)return;
 const dpr=Math.min(window.devicePixelRatio||1,2),W=Math.max(1,Math.round(surface.clientWidth*dpr)),H=Math.max(1,Math.round(surface.clientHeight*dpr));
 if(fxLayer.width!==W||fxLayer.height!==H){fxLayer.width=W;fxLayer.height=H}
 fxCtx.clearRect(0,0,W,H);fxDirty=false;
 const now=performance.now()/1000,unit=Math.max(W,H)/100;// 크기 기준: 화면 긴 변의 1%
 sparkles=sparkles.filter(p=>now-p.t0<p.life);
 const dark=a=>`rgba(40,30,20,${a})`,light=a=>`rgba(255,250,232,${a})`;
 for(const p of sparkles){
  const t=Math.max(0,(now-p.t0)/p.life),ease=1-(1-t)**2,alpha=1-t*t,x=p.x*W,y=p.y*H;
  fxCtx.beginPath();
  if(p.kind==='ring'){
   fxCtx.arc(x,y,unit*(.7+2.1*ease),0,Math.PI*2);
   fxCtx.lineWidth=unit*.5*(1-t*.6);fxCtx.strokeStyle=dark(.3*alpha);fxCtx.stroke();
   fxCtx.lineWidth=unit*.26*(1-t*.6);fxCtx.strokeStyle=light(alpha);fxCtx.stroke();
  }else if(p.kind==='dot'){
   fxCtx.arc(x,y,unit*.85*p.s*(1-t*.3),0,Math.PI*2);
   fxCtx.lineWidth=Math.max(1,unit*.12);fxCtx.strokeStyle=dark(.4*alpha);fxCtx.stroke();
   fxCtx.fillStyle=light(.85*alpha);fxCtx.fill();
  }else{
   const dist=unit*(.8+3*ease*p.d),r=unit*.95*p.s*(1-t*.7),cx=x+Math.cos(p.a)*dist,cy=y+Math.sin(p.a)*dist;
   for(let k=0;k<8;k++){const rr=k%2?r*.36:r,aa=k/8*Math.PI*2-Math.PI/2;fxCtx.lineTo(cx+Math.cos(aa)*rr,cy+Math.sin(aa)*rr)}fxCtx.closePath();
   fxCtx.lineWidth=Math.max(1,unit*.12);fxCtx.strokeStyle=dark(.5*alpha);fxCtx.stroke();
   fxCtx.fillStyle=light(alpha);fxCtx.fill();
  }
  fxDirty=true}
}
function clearTouchFx(){sparkles=[];fxCtx.clearRect(0,0,fxLayer.width,fxLayer.height);fxDirty=false}
