// 3-F 플레이 화면 터치 이펙트(사용자 선택: 반짝임). 누르면 작은 별빛 몇 개가 톡 튀어 사라지고, 끌면 지나간 자리에 드문드문 생긴다.
// 위치는 그림 기준(0~1)이라 화면·영상 크기가 달라도 같은 자리에 그려진다. 밝은 그림에서도 보이게 얇은 어두운 테두리.
const fxLayer=$('fxLayer'),fxCtx=fxLayer.getContext('2d');
let sparkles=[],fxDirty=false,fxLastSpawn=0;
const FX_LIFE=.7;
function spawnSparkles(x,y,n){const now=performance.now()/1000;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2;sparkles.push({x,y,t0:now+i*.015,a,d:.5+Math.random()*.5,s:.75+Math.random()*.5})}if(sparkles.length>80)sparkles.splice(0,sparkles.length-80)}
overlay.addEventListener('pointerdown',e=>{if(!viewerOpen||pointers.size>1)return;const p=pointerPos(e);spawnSparkles(p.x,p.y,5);fxLastSpawn=performance.now()});
overlay.addEventListener('pointermove',e=>{if(!viewerOpen||!pointers.has(e.pointerId)||pointers.size>1)return;const now=performance.now();if(now-fxLastSpawn<70)return;fxLastSpawn=now;const p=pointerPos(e);spawnSparkles(p.x,p.y,2)});
function drawTouchFx(){
 if(!sparkles.length&&!fxDirty)return;
 const dpr=Math.min(window.devicePixelRatio||1,2),W=Math.max(1,Math.round(surface.clientWidth*dpr)),H=Math.max(1,Math.round(surface.clientHeight*dpr));
 if(fxLayer.width!==W||fxLayer.height!==H){fxLayer.width=W;fxLayer.height=H}
 fxCtx.clearRect(0,0,W,H);fxDirty=false;
 const now=performance.now()/1000,unit=Math.max(W,H)/100;// 별 크기 기준: 화면 긴 변의 1%
 sparkles=sparkles.filter(p=>now-p.t0<FX_LIFE);
 for(const p of sparkles){const t=Math.max(0,(now-p.t0)/FX_LIFE),ease=1-(1-t)**2,dist=unit*(1.5+7*ease*p.d),r=unit*1.9*p.s*(1-t*.7);
  const cx=p.x*W+Math.cos(p.a)*dist,cy=p.y*H+Math.sin(p.a)*dist,alpha=1-t*t;
  fxCtx.beginPath();for(let k=0;k<8;k++){const rr=k%2?r*.36:r,aa=k/8*Math.PI*2-Math.PI/2;fxCtx.lineTo(cx+Math.cos(aa)*rr,cy+Math.sin(aa)*rr)}fxCtx.closePath();
  fxCtx.lineWidth=Math.max(1,unit*.16);fxCtx.strokeStyle=`rgba(40,30,20,${.55*alpha})`;fxCtx.stroke();
  fxCtx.fillStyle=`rgba(255,248,214,${alpha})`;fxCtx.fill();fxDirty=true}
}
function clearTouchFx(){sparkles=[];fxCtx.clearRect(0,0,fxLayer.width,fxLayer.height);fxDirty=false}
