function drawOverlay(){
 if(!ready)return;
 const w=overlay.width,h=overlay.height;
 ctx.clearRect(0,0,w,h);
 if(viewerOpen||(!$('showZones').checked&&mode==='play'))return;
 if($('showZones').checked){
  ctx.font=`${Math.max(12,w*.018)}px system-ui,sans-serif`;
  ctx.textBaseline='middle';
  for(let i=0;i<zones.length;i++){
   const z=zones[i],preview=maskPreview(i,z,z.id===selected);
   if(preview)ctx.drawImage(preview,0,0,w,h);
  }
  for(const z of zones){
   const tx=clamp(z.x*w,50,w-50),ty=clamp(z.y*h-z.ry*h-19,14,h-14),tw=ctx.measureText(z.name).width;
   ctx.fillStyle='#102a31de';ctx.fillRect(tx-tw/2-7,ty-13,tw+14,26);
   ctx.fillStyle='#e6fff8';ctx.fillText(z.name,tx-tw/2,ty);
  }
 }
const active=getSelected();if(active&&active.pivotEnabled&&$('showZones').checked){ctx.save();ctx.strokeStyle='#ffcf70';ctx.lineWidth=Math.max(2,w*.0028);const x=active.pivotX*w,y=active.pivotY*h;ctx.beginPath();ctx.arc(x,y,Math.max(7,w*.012),0,6.283);ctx.stroke();ctx.beginPath();ctx.moveTo(x-16,y);ctx.lineTo(x+16,y);ctx.moveTo(x,y-16);ctx.lineTo(x,y+16);ctx.stroke();ctx.restore()}
if(active?.extraPivots?.length&&$('showZones').checked){ctx.save();ctx.fillStyle='#f7ab52';for(const [px,py] of active.extraPivots){ctx.beginPath();ctx.arc(px*w,py*h,Math.max(5,w*.008),0,Math.PI*2);ctx.fill()}ctx.restore()}
if(active?.branch?.length&&$('showZones').checked){ctx.save();ctx.strokeStyle='#e3a3ff';ctx.lineWidth=3;ctx.setLineDash([4,7]);ctx.beginPath();active.branch.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke();ctx.restore()}
if(active&&active.spine?.length&&$('showZones').checked){ctx.save();ctx.strokeStyle='#ffcf70';ctx.lineWidth=3;ctx.setLineDash([5,5]);ctx.beginPath();active.spine.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.stroke();ctx.restore()}
if(mode==='wand'&&wandDraft)ctx.drawImage(wandDraft.canvas,0,0,w,h);
if(mode==='lasso'&&outlineDraft?.preview)ctx.drawImage(outlineDraft.preview.canvas,0,0,w,h);
if(mode==='lasso'&&lassoSegments.length){
 const points=lassoSegments.flat(),end=points.at(-1);
 ctx.save();ctx.strokeStyle='#83ffd3';ctx.fillStyle='#83ffd3';ctx.lineWidth=2;
 ctx.beginPath();ctx.moveTo(points[0][0]*w,points[0][1]*h);
 for(const p of points.slice(1))ctx.lineTo(p[0]*w,p[1]*h);
 ctx.stroke();
 ctx.beginPath();ctx.arc(points[0][0]*w,points[0][1]*h,6,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(end[0]*w,end[1]*h,4,0,Math.PI*2);ctx.fill();ctx.restore();
}
if(gesture?.type==='ellipse'){const a=gesture.start,b=gesture.now;ctx.strokeStyle='#7ef1c1';ctx.fillStyle='#7ef1c12a';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse((a.x+b.x)*w/2,(a.y+b.y)*h/2,Math.max(3,Math.abs(a.x-b.x)*w/2),Math.max(3,Math.abs(a.y-b.y)*h/2),0,0,Math.PI*2);ctx.fill();ctx.stroke()}
if(['brush','erase','lasso'].includes(gesture?.type)){ctx.strokeStyle=gesture.type==='erase'?'#ff8888':'#83ffd3';ctx.fillStyle='#83ffd344';ctx.lineCap='round';ctx.lineJoin='round';const r=(gesture.r||.003)*Math.min(renderWidth,renderHeight)*w/renderWidth;ctx.lineWidth=gesture.type==='lasso'?2:r*2;ctx.beginPath();const pts=gesture.points;ctx.moveTo(pts[0][0]*w,pts[0][1]*h);for(const p of pts.slice(1))ctx.lineTo(p[0]*w,p[1]*h);if(pts.length===1)ctx.lineTo(pts[0][0]*w+.01,pts[0][1]*h+.01);ctx.stroke()}}
let resTimeout;new ResizeObserver(()=>{clearTimeout(resTimeout);resTimeout=setTimeout(fit,60)}).observe(stage);new ResizeObserver(()=>{if(viewerOpen){clearTimeout(resTimeout);resTimeout=setTimeout(fit,60)}}).observe($('viewerStage'));
