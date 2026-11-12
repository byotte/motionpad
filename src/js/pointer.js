function hit(x,y){
 if(maskDirty)updateMasks();
 const px=clamp(Math.floor(x*TILE),0,TILE-1),py=clamp(Math.floor(y*TILE),0,TILE-1);
 const alpha=(py*TILE+px)*4+3;
 for(let i=zones.length-1;i>=0;i--){
  if(rawMaskPixels[i]?.[alpha]>=128)return zones[i];
 }
 return null;
}

$('testBtn').onclick=()=>impulse(getSelected());
function placePivot(z,p,additional){
 if(!z){setStatus('먼저 영역을 선택해 주세요.');return false}
 if(z.locked){setStatus('잠긴 영역은 수정할 수 없습니다.');return false}
 if(maskDirty)updateMasks();
 const x=clamp(Math.floor(p.x*TILE),0,TILE-1),y=clamp(Math.floor(p.y*TILE),0,TILE-1);
 const alpha=rawMaskPixels[zones.indexOf(z)]?.[(y*TILE+x)*4+3]??0;
 if(alpha<128){setStatus('선택 영역 안을 눌러 주세요.');return false}
 if(additional&&z.extraPivots.length>=2){setStatus('추가 축은 최대 2개입니다. 기존 축을 삭제해 주세요.');return false}
 remember();
 if(additional){
  z.extraPivots.push([p.x,p.y]);
  setMode('edit');
 }else{
  z.pivotX=p.x;z.pivotY=p.y;
 }
 z.pivotEnabled=true;
 updateUI();scheduleSave();
 setStatus(additional?'추가 축을 지정했습니다.':'기본 축 위치를 지정했습니다.');
 return true;
}
function pointerPos(e){const r=overlay.getBoundingClientRect(),offset=e.pointerType==='touch'&&$('offsetInput').checked&&['brush','erase','lasso'].includes(mode)?Math.min(54,r.height*.14):0;return {x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top-offset)/r.height,0,1)}}
function paintLoupe(p){if(!$('loupeInput').checked||!ready||viewerOpen||!p){loupe.hidden=true;return}loupe.hidden=false;const n=loupe.width=160,m=loupe.height=160,dx=renderWidth*p.x,dy=renderHeight*p.y,size=Math.max(30,Math.min(renderWidth,renderHeight)*.095);loupeCtx.clearRect(0,0,n,m);loupeCtx.imageSmoothingEnabled=true;loupeCtx.drawImage(bitmap,dx-size/2,dy-size/2,size,size,0,0,n,m);loupeCtx.strokeStyle='#ffec64';loupeCtx.lineWidth=1.8;loupeCtx.beginPath();loupeCtx.arc(n/2,m/2,4,0,6.283);loupeCtx.moveTo(n/2-13,m/2);loupeCtx.lineTo(n/2+13,m/2);loupeCtx.moveTo(n/2,m/2-13);loupeCtx.lineTo(n/2,m/2+13);loupeCtx.stroke()}
$('loupeInput').onchange=()=>{if(!$('loupeInput').checked)loupe.hidden=true};
function pixelDistance(a,b){return Math.hypot((a.x-b.x)*renderWidth,(a.y-b.y)*renderHeight)}
function snap(z){const out={};for(const f of ZONE_FIELDS)if(f.snap)out[f.key]=f.snap(z);return out}
function applyTransform(z,origin,dx,dy,scale,angle){scale=clamp(scale,.25,3.5);const r=origin.rot+(angle||0);z.x=clamp(origin.x+dx,.01,.99);z.y=clamp(origin.y+dy,.01,.99);z.rx=Math.max(.009,origin.rx*scale);z.ry=Math.max(.009,origin.ry*scale);z.rot=r;z.scale=origin.scale*scale;
const co=Math.cos(angle||0),si=Math.sin(angle||0);
const transformPin=([x,y])=>{const ax=(x-origin.x)*scale,ay=(y-origin.y)*scale;return [clamp(z.x+ax*co-ay*si,0,1),clamp(z.y+ax*si+ay*co,0,1)]};
if(origin.pivotX!=null&&origin.pivotY!=null){const pin=transformPin([origin.pivotX,origin.pivotY]);z.pivotX=pin[0];z.pivotY=pin[1]}
if(origin.spine?.length){z.spine=origin.spine.map(transformPin);z.chainNodes=null}
if(origin.branch?.length){z.branch=origin.branch.map(transformPin);z.branchNodes=null}
if(origin.extraPivots?.length)z.extraPivots=origin.extraPivots.map(transformPin)
if(z.kind==='brush'){const co=Math.cos(angle||0),si=Math.sin(angle||0);z.strokes=origin.strokes.map(st=>({r:clamp(st.r*scale,.004,.5),points:st.points.map(([x,y])=>{const ax=(x-origin.x)*scale,ay=(y-origin.y)*scale;return [clamp(z.x+ax*co-ay*si,0,1),clamp(z.y+ax*si+ay*co,0,1)]})}));recalcBounds(z);z.rot=0;z.scale=1}
if(z.kind==='polygon'){const co=Math.cos(angle||0),si=Math.sin(angle||0);z.polygon=origin.polygon.map(([x,y])=>{const ax=(x-origin.x)*scale,ay=(y-origin.y)*scale;return [clamp(z.x+ax*co-ay*si,0,1),clamp(z.y+ax*si+ay*co,0,1)]});recalcPolygon(z);z.rot=0;z.scale=1}markMask()}
function pointerCentroid(arr){return {x:(arr[0].x+arr[1].x)/2,y:(arr[0].y+arr[1].y)/2}}
function pointerAngle(arr){return Math.atan2((arr[1].y-arr[0].y)*renderHeight,(arr[1].x-arr[0].x)*renderWidth)}
function pinchBegin(){const arr=[...pointers.values()];if(arr.length<2||!selected)return;const z=getSelected();if(!z||z.locked)return;gesture={type:'pinch',id:z.id,origin:snap(z),dist:Math.max(5,pixelDistance(arr[0],arr[1])),angle:pointerAngle(arr),centroid:pointerCentroid(arr)};remember();setStatus('두 손가락으로 확대, 이동, 회전할 수 있습니다.')}
let spacePanHeld=false;
document.addEventListener('keydown',e=>{
 if(e.code==='Space'&&!e.target.closest?.('input,textarea,select,button,[contenteditable="true"]')&&!blinkDialog.open){
  spacePanHeld=true;e.preventDefault();
 }
});
document.addEventListener('keyup',e=>{if(e.code==='Space')spacePanHeld=false});
window.addEventListener('blur',()=>{spacePanHeld=false});
/* Unified Pointer Events: edit gestures do not overlap touch-performance gestures. */
function beginPinch(){
  const arr=[...pointers.values()],z=getSelected();if(arr.length<2)return;
  const d=Math.max(5,pixelDistance(arr[0],arr[1]));
  if(mode==='edit'&&z&&!z.locked){gesture={type:'pinch',id:z.id,origin:snap(z),dist:d,angle:pointerAngle(arr),centroid:pointerCentroid(arr)};remember();return}
  gesture={type:'pinch-nav',dist:d,zoom:zoomLevel,centroid:pointerCentroid(arr),panX,panY};
  setStatus('두 손가락으로 캔버스를 확대하고 이동합니다. 선택 영역은 변경하지 않습니다.');
}
function stopPlay(z){if(!z)return;z.dragging=false;z.desiredX=z.desiredY=z.desiredScale=0}
overlay.addEventListener('pointerdown',e=>{
  if(!ready)return;e.preventDefault();try{overlay.setPointerCapture(e.pointerId)}catch(_){}
  const p=pointerPos(e);pointers.set(e.pointerId,p);paintLoupe(p);
  if(viewerOpen||mode==='play'||touchPreview){
    if(pointers.size>1)return;
    const z=hit(p.x,p.y);gesture={type:'play',id:z?.id||null,start:p,last:p,time:performance.now(),lastTime:performance.now(),dragged:false};
    if(z){z.dragging=false;z.desiredX=z.desiredY=z.desiredScale=0;z.hitX=p.x;z.hitY=p.y}return;
  }
  if(mode==='pan'||spacePanHeld){
    if(pointers.size!==1)return;gesture={type:'pan',clientX:e.clientX,clientY:e.clientY,panX,panY};return;
  }
  if(pointers.size>1){beginPinch();return}
  if(mode==='wand'){magicSelect(p.x,p.y);return}
  if(mode==='pivot'||mode==='extraPivot'){placePivot(getSelected(),p,mode==='extraPivot');return}
  if(mode==='edit'){
    const z=hit(p.x,p.y);if(z){selected=z.id;gesture=z.locked?null:{type:'move',id:z.id,start:p,origin:snap(z)};if(gesture)remember();updateUI()}
    else{selected=null;gesture=null;updateUI()}return;
  }
  if(mode==='brush'||mode==='erase'){
    gesture={type:mode,points:[[p.x,p.y]],r:brushSize/200,last:p};return;
  }
  if(mode==='ellipse'){gesture={type:'ellipse',start:p,now:p};return}
  if(mode==='lasso'){
   if(outlineDraft&&$('outlineAction').value!=='draw'){correctOutline(p.x,p.y);return;}
   if(outlineDraft)clearOutlineDraft();
   const segmented=$('lassoSegments').checked,enclose=!segmented&&$('encloseInput').checked;
   const end=segmented?lassoSegments.at(-1)?.at(-1):null;
   if(end){
    const rect=overlay.getBoundingClientRect();
    if(Math.hypot((p.x-end[0])*rect.width,(p.y-end[1])*rect.height)>28){
     setStatus('표시된 끝점 근처부터 이어 그려 주세요.');return;
    }
   }
   const first=end||(!segmented&&!enclose&&magnetPoint(p))||[p.x,p.y];
   gesture={type:'lasso',segmented,enclose,points:[first],last:end?{x:end[0],y:end[1]}:p};return;
  }
  if(mode==='spine'||mode==='branch'||mode==='flowdir'){
    if(!getSelected()){setStatus('먼저 영역을 선택하세요.');return}
    gesture={type:mode,points:[[p.x,p.y]],last:p};return;
  }
});
overlay.addEventListener('pointermove',e=>{
  if(!ready||!pointers.has(e.pointerId))return;e.preventDefault();const p=pointerPos(e);paintLoupe(p);
  pointers.set(e.pointerId,p);const g=gesture;if(!g)return;
  if(g.type==='pinch-nav'){if(pointers.size<2)return;const arr=[...pointers.values()],c=pointerCentroid(arr),next=clamp(g.zoom*pixelDistance(arr[0],arr[1])/g.dist,1,4);zoomLevel=next;panX=g.panX+(c.x-g.centroid.x)*stage.clientWidth;panY=g.panY+(c.y-g.centroid.y)*stage.clientHeight;applyZoom();return}
  if(g.type==='pinch'){
    if(pointers.size<2)return;const arr=[...pointers.values()],z=zones.find(v=>v.id===g.id);
    if(z&&!z.locked){const c=pointerCentroid(arr),a=pointerAngle(arr);let da=a-g.angle;
      while(da>Math.PI)da-=Math.PI*2;while(da< -Math.PI)da+=Math.PI*2;
      applyTransform(z,g.origin,c.x-g.centroid.x,c.y-g.centroid.y,pixelDistance(arr[0],arr[1])/g.dist,da);
    }return;
  }
  if(g.type==='pan'){panX=g.panX+e.clientX-g.clientX;panY=g.panY+e.clientY-g.clientY;applyZoom();return}
  if(g.type==='move'){
    if(pointers.size!==1)return;const z=zones.find(v=>v.id===g.id);
    if(z&&!z.locked)applyTransform(z,g.origin,p.x-g.start.x,p.y-g.start.y,1,0);return;
  }
  if(g.type==='ellipse'){g.now=p;return}
  if(['brush','erase','lasso','spine','branch','flowdir'].includes(g.type)){
    const q=g.points[g.points.length-1],prev=g.type==='lasso'?g.last:{x:q[0],y:q[1]},d=pixelDistance(p,prev);
    if(!g.enclose&&d>Math.max(75,Math.min(renderWidth,renderHeight)*.18)){g.jumped=true;return}
    if(g.type==='lasso'){extendLasso(g,p);return}
    if(d>(g.type==='flowdir'?4:3))g.points.push([p.x,p.y]);
    g.last=p;return;
  }
  if(g.type==='play'&&g.id){
    const z=zones.find(v=>v.id===g.id);if(!z)return;
    const length=pixelDistance(p,g.start);g.last=p;
    if(length>9||g.dragged){
      g.dragged=true;z.dragging=true;
      const max=.003+(z.strength/80)*.016,
        gain=(z.dragGain??100)/100,
        dx=p.x-g.start.x,dy=p.y-g.start.y,dist=Math.hypot(dx,dy);
      const mult=Math.min(max,dist*.14)*gain;
      const [vx,vy]=projectMotion(z.axis,dx/Math.max(.0001,dist)*mult,dy/Math.max(.0001,dist)*mult);
      if(z.axis==='pulse')z.desiredScale=-Math.min(.009,dist*.05)*gain;
      z.desiredX=clamp(vx,-.025,.025);z.desiredY=clamp(vy,-.025,.025);
      z.hitX=p.x;z.hitY=p.y;
    }return;
  }
});
function finishPointer(e,cancelled=false){
  if(!pointers.has(e.pointerId))return;
  const p=pointerPos(e),g=gesture;pointers.delete(e.pointerId);if(pointers.size===0)loupe.hidden=true;if(!g)return;
  if(g.type==='pinch-nav'){if(pointers.size<2){gesture=null;applyZoom()}return}
  if(g.type==='pinch'){if(pointers.size<2){gesture=null;updateUI();scheduleSave()}return}
  if(g.type==='move'){if(pointers.size===0){gesture=null;updateUI();scheduleSave()}return}
  if(g.type==='pan'){if(!pointers.size)gesture=null;return}
  if(cancelled){if(g.type==='play')stopPlay(zones.find(v=>v.id===g.id));if(!pointers.size)gesture=null;setStatus('터치가 중단되어 그리기를 취소했습니다.');return}
  if(g.type==='play'){
    if(pointers.size===0){
      const z=zones.find(v=>v.id===g.id);
      if(z){
        const age=(performance.now()-g.time)/1000;
        if(g.dragged){
          const dx=p.x-g.start.x,dy=p.y-g.start.y;
          const len=Math.max(.0001,Math.hypot(dx,dy));
          if(age<.28&&len>.03){
            const gain=(z.flickGain??100)/100;
            const v=clamp(len/Math.max(.12,age)*.34,.15,1.6)*gain;
            stopPlay(z);impact(z,v,p,{x:dx/len,y:dy/len});
          }else stopPlay(z);
        }else if(age<.36){stopPlay(z);impact(z,.65,p)}
        else stopPlay(z);
      }gesture=null;
    }return;
  }
  if(pointers.size>0)return;
  if(g.type==='ellipse'){
    const a=g.start,b=p;let x=(a.x+b.x)/2,y=(a.y+b.y)/2,rx=Math.abs(a.x-b.x)/2,ry=Math.abs(a.y-b.y)/2;
    if(rx<.013||ry<.013){x=a.x;y=a.y;rx=.11;ry=.11}
    addEllipse(x,y,clamp(rx,.015,.48),clamp(ry,.015,.48));gesture=null;setMode('edit');return;
  }
  if(g.type==='brush'||g.type==='erase'){
    const pts=g.points,q={x:pts[pts.length-1][0],y:pts[pts.length-1][1]};
    if(pixelDistance(q,p)<Math.max(12,brushSize*4))pts.push([p.x,p.y]);
    if(g.type==='brush')addBrush(pts,g.r);else eraseBrush(pts,g.r);
    gesture=null;setStatus('한 획을 적용했습니다. 선택 영역을 계속 덧칠할 수 있습니다.');return;
  }
  if(g.type==='lasso'){
    if(g.enclose||pixelDistance(g.last,p)<=Math.max(75,Math.min(renderWidth,renderHeight)*.18))extendLasso(g,p,0);
    gesture=null;
    if(g.segmented){
      if(g.points.length>1){
        g.points.push([p.x,p.y]);
        lassoSegments.push(g.points);
        const points=lassoSegments.flat();
        const start=points[0];
        const rect=overlay.getBoundingClientRect();
        const distanceToStart=point=>Math.hypot((point[0]-start[0])*rect.width,(point[1]-start[1])*rect.height);
        const radius=matchMedia('(pointer:coarse)').matches?20:12;
        if(points.length>=4&&points.some(point=>distanceToStart(point)>radius*1.5)&&distanceToStart([p.x,p.y])<=radius){
          points[points.length-1]=start;
          refreshLassoDraft();
          finishSegmentedLasso(points);
        }else{
          refreshLassoDraft();
          setStatus('끝점에서 이어 그리고 시작점으로 돌아오면 선택이 완료됩니다.');
        }
      }
      return;
    }
    if(g.points.length<3)setStatus('영역을 둘러 그려 주세요.');
    else if(g.enclose)beginOutline(g.points);
    else if(addPolygon(g.points)!==false)setStatus('올가미 선택을 적용했습니다. 붓이나 지우개로 수정할 수 있습니다.');
    return;
  }
  if(g.type==='spine'){
    const z=getSelected();if(z&&!z.locked&&g.points.length>=2){remember();const pts=g.points,n=6;
      z.spine=Array.from({length:n},(_,i)=>{const q=spinePoint(pts,i/(n-1));return q});
      z.pivotEnabled=true;z.pivotX=z.spine[0][0];z.pivotY=z.spine[0][1];z.chainNodes=null;
      updateUI();scheduleSave();setStatus('스프링 선을 지정했습니다. 시작점은 고정되고 끝부분이 늦게 반응합니다.');
    }gesture=null;setMode('edit');return;
  }
  if(g.type==='branch'){
    const z=getSelected();if(z&&!z.locked&&g.points.length>=2){remember();z.branch=Array.from({length:5},(_,i)=>spinePoint(g.points,i/4));z.branchNodes=null;updateUI();scheduleSave();setStatus('가지 선을 지정했습니다. 시작점은 분기점으로 유지됩니다.')}
    gesture=null;setMode('edit');return;
  }
  if(g.type==='flowdir'){
    const z=getSelected();if(z&&!z.locked&&g.points.length>=2){remember();const a=g.points[0],b=g.points[g.points.length-1];
      z.flowAngle=clamp(Math.atan2((b[1]-a[1])*renderHeight,(b[0]-a[0])*renderWidth)*180/Math.PI,-180,180);
      if(z.flow<1)z.flow=17;updateUI();scheduleSave();setStatus('흐름 방향을 지정했습니다.');
    }gesture=null;setMode('edit');return;
  }
  gesture=null;
}
overlay.addEventListener('pointerup',e=>finishPointer(e,false));
overlay.addEventListener('pointercancel',e=>finishPointer(e,true));
overlay.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))finishPointer(e,true)});
overlay.addEventListener('contextmenu',stopEvent);
stage.addEventListener('wheel',e=>{if(viewerOpen)return;e.preventDefault();setZoom(zoomLevel+(e.deltaY<0?.15:-.15))},{passive:false});

