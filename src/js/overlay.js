// R3: 캔버스에 그리는 색은 tokens.css의 --cv-* 이름표에서 읽는다. 매 프레임이 아니라 테마가 바뀔 때만(theme.js paintTheme).
const CV={};
function readCanvasColors(){
 const cs=getComputedStyle(document.documentElement);
 for(const k of ['label','labelInk','point','pointEdge','pointInk','pivot2','branch','select','selectFill','shape','shapeFill','erase','handle'])CV[k]=cs.getPropertyValue('--cv-'+k).trim();
}
readCanvasColors();
function drawOverlay(){
 if(!ready)return;
 const w=overlay.width,h=overlay.height;
 ctx.clearRect(0,0,w,h);
 const px=w/Math.max(1,overlay.getBoundingClientRect().width);// 화면 1픽셀 = 캔버스 몇 픽셀
 if(viewerOpen||(!$('showZones').checked&&mode==='play'))return;
 if($('showZones').checked){
  ctx.font=`${Math.max(12,w*.018)}px system-ui,sans-serif`;
  ctx.textBaseline='middle';
  for(let i=0;i<zones.length;i++){
   const z=zones[i],preview=maskPreview(i,z,z.id===selected);
   if(preview)ctx.drawImage(preview,0,0,w,h);
  }
  const si=zones.findIndex(z=>z.id===selected);if(si>=0)strokeContour(ctx,zoneContour(si),w,h,px);
  // A-3: 이름표는 고른 영역 하나에만(모든 영역에 늘 띄우면 그림을 가린다)
  for(const z of zones.filter(z=>z.id===selected)){
   const below=mode==='ellipse'&&z.id===selected&&!z.locked;// 도형 도구: 위쪽 회전 손잡이를 가리지 않게 이름표를 아래로
   const tx=clamp(z.x*w,50,w-50),ty=clamp(below?z.y*h+z.ry*h+19:z.y*h-z.ry*h-19,14,h-14),tw=ctx.measureText(z.name).width;
   ctx.fillStyle=CV.label;ctx.fillRect(tx-tw/2-7,ty-13,tw+14,26);
   ctx.fillStyle=CV.labelInk;ctx.fillText(z.name,tx-tw/2,ty);
  }
 }
const active=getSelected();if(active&&active.pivotEnabled&&$('showZones').checked){ctx.save();ctx.strokeStyle=CV.point;ctx.lineWidth=Math.max(2,w*.0028);const x=active.pivotX*w,y=active.pivotY*h;ctx.beginPath();ctx.arc(x,y,Math.max(7,w*.012),0,6.283);ctx.stroke();ctx.beginPath();ctx.moveTo(x-16,y);ctx.lineTo(x+16,y);ctx.moveTo(x,y-16);ctx.lineTo(x,y+16);ctx.stroke();ctx.restore()}
if(active?.extraPivots?.length&&$('showZones').checked){ctx.save();ctx.fillStyle=CV.pivot2;for(const [px,py] of active.extraPivots){ctx.beginPath();ctx.arc(px*w,py*h,Math.max(5,w*.008),0,Math.PI*2);ctx.fill()}ctx.restore()}
if(active?.branch?.length&&$('showZones').checked){ctx.save();ctx.strokeStyle=CV.branch;ctx.lineWidth=3;ctx.setLineDash([4,7]);ctx.beginPath();active.branch.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke();ctx.restore()}
if(active&&active.spine?.length&&$('showZones').checked){ctx.save();ctx.strokeStyle=CV.point;ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.beginPath();active.spine.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke();ctx.restore()}


if(mode==='lasso'&&lassoSegments.length){
 const points=lassoSegments.flat(),end=points.at(-1);
 ctx.save();ctx.strokeStyle=CV.select;ctx.fillStyle=CV.select;ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(points[0][0]*w,points[0][1]*h);
 for(const p of points.slice(1))ctx.lineTo(p[0]*w,p[1]*h);
 ctx.stroke();
 ctx.beginPath();ctx.arc(points[0][0]*w,points[0][1]*h,6,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(end[0]*w,end[1]*h,4,0,Math.PI*2);ctx.fill();ctx.restore();
}
if(gesture?.type==='ellipse'){const a=gesture.start,b=gesture.now;ctx.strokeStyle=CV.shape;ctx.fillStyle=CV.shapeFill;ctx.lineWidth=3;ctx.beginPath();if(gesture.shape==='rect')ctx.rect(Math.min(a.x,b.x)*w,Math.min(a.y,b.y)*h,Math.abs(a.x-b.x)*w,Math.abs(a.y-b.y)*h);else ctx.ellipse((a.x+b.x)*w/2,(a.y+b.y)*h/2,Math.max(3,Math.abs(a.x-b.x)*w/2),Math.max(3,Math.abs(a.y-b.y)*h/2),0,0,Math.PI*2);ctx.fill();ctx.stroke()}
// 도형 도구: 선택한 영역의 틀과 손잡이(모서리 = 크기·비율, 위쪽 동그라미 = 기울기)
if(mode==='ellipse'&&gesture?.type!=='ellipse'){const z=editableSelected();if(z){
 const k=w/Math.max(1,overlay.getBoundingClientRect().width),hs=shapeHandles(z),q=([x,y])=>[x*w,y*h];
 ctx.save();ctx.strokeStyle=CV.handle;ctx.lineWidth=1.5*k;ctx.setLineDash([5*k,4*k]);ctx.beginPath();hs.slice(0,4).forEach((hd,i)=>{const [x,y]=q(hd.p);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.stroke();
 ctx.setLineDash([]);const r=hs[4];ctx.beginPath();ctx.moveTo(...q(r.base));ctx.lineTo(...q(r.p));ctx.stroke();
 ctx.fillStyle=CV.handle;ctx.strokeStyle=CV.pointEdge;ctx.lineWidth=1.5*k;
 for(const hd of hs.slice(0,4)){const [x,y]=q(hd.p);ctx.fillRect(x-5*k,y-5*k,10*k,10*k);ctx.strokeRect(x-5*k,y-5*k,10*k,10*k)}
 {const [x,y]=q(r.p);ctx.beginPath();ctx.arc(x,y,6*k,0,Math.PI*2);ctx.fill();ctx.stroke()}
 ctx.restore()}}
drawFaceParts(ctx,w,h,px);// 얼굴 부위(입·눈썹·귀)를 찍는 동안 찍은 점·선
if(['brush','erase','lasso'].includes(gesture?.type)){ctx.strokeStyle=gesture.type==='erase'?CV.erase:CV.select;ctx.fillStyle=CV.selectFill;ctx.lineCap='round';ctx.lineJoin='round';const r=(gesture.r||.003)*Math.min(renderWidth,renderHeight)*w/renderWidth;ctx.lineWidth=gesture.type==='lasso'?2:r*2;ctx.beginPath();const pts=gesture.points;ctx.moveTo(pts[0][0]*w,pts[0][1]*h);for(const p of pts.slice(1))ctx.lineTo(p[0]*w,p[1]*h);if(pts.length===1)ctx.lineTo(pts[0][0]*w+.01,pts[0][1]*h+.01);ctx.stroke()}}
let resTimeout;new ResizeObserver(()=>{clearTimeout(resTimeout);resTimeout=setTimeout(fit,60)}).observe(stage);new ResizeObserver(()=>{if(viewerOpen){clearTimeout(resTimeout);resTimeout=setTimeout(fit,60)}}).observe($('viewerStage'));
