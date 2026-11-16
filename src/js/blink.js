const blinkDialog=$('blinkDialog'),blinkPreview=$('blinkPreview');
const blinkView=blinkPreview.getContext('2d');
let blinkPoints=[],blinkPatch=null,blinkFrame=0;
let blinkRect=null,blinkCropStart=null,blinkCropping=false;
const blinkPrompts=['화면에서 왼쪽 눈꼬리를 찍어 주세요.','같은 눈의 오른쪽 눈꼬리를 찍어 주세요.',
 '윗눈꺼풀 선의 가운데를 찍어 주세요.','아랫눈꺼풀 선의 가운데를 찍어 주세요.'];
let blinkProtection=[],blinkProtecting=false,blinkStroke=null;
// 눈은 6개까지(눈이 셋 이상이거나 여러 인물이 있는 그림). 저장할 때는 뒤쪽 빈 칸을 떼어 예전과 같은 모양(최소 2칸)으로 적는다.
const BLINK_MAX_EYES=6;
let blinkEyes=Array(BLINK_MAX_EYES).fill(null),blinkPatches=Array(BLINK_MAX_EYES).fill(null),blinkSpeed=100,blinkInterval=4.5,blinkEpoch=0;
let blinkLastStep=-1,blinkLastTail=null,blinkScene=null,blinkOriginal=null;
let blinkComposite=null,blinkTailComposite=null,blinkOverlay=null;
function restoreBlink(settings){
 const number=(v,fallback,min,max)=>Number.isFinite(v)?clamp(v,min,max):fallback;
 blinkSpeed=number(settings?.speed,100,50,160);
 blinkInterval=number(settings?.interval,4.5,2,10);
 blinkEyes=Array.from({length:BLINK_MAX_EYES},(_,i)=>{
  const eye=settings?.eyes?.[i];
  if(!Array.isArray(eye?.points)||eye.points.length!==4||
    !eye.points.every(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1))return null;
  const protection=Array.isArray(eye.protection)?eye.protection.slice(0,40).filter(stroke=>
   Number.isFinite(stroke?.radius)&&Array.isArray(stroke.points)).map(stroke=>({
    radius:clamp(stroke.radius,.001,.2),taper:stroke.taper===true,sampleOnly:stroke.sampleOnly===true,
    points:stroke.points.slice(0,800).filter(p=>Number.isFinite(p?.x)&&Number.isFinite(p?.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1)
   })).filter(stroke=>stroke.points.length):[];
  return {points:eye.points.map(({x,y})=>({x,y})),protection,cover:number(eye.cover,24,5,65),curve:number(eye.curve,0,-1,1)};
 });
 blinkPatches=blinkEyes.map(eye=>eye?makeBlinkPatch(eye.points.map(p=>({x:p.x*renderWidth,y:p.y*renderHeight})),eye.cover,eye.protection):null);
 blinkEpoch=elapsed;blinkLastTail=null;
 blinkScene=blinkOriginal=blinkComposite=blinkTailComposite=blinkOverlay=null;
 paintEyeEntryState();
}
// 얼굴 설계 1단계: 눈 표시는 '2. 얼굴 · 눈 깜빡임'(face.js)이 그린다.
function paintEyeEntryState(){paintFaces()}
function blinkEyesForSave(){let n=blinkEyes.length;while(n>2&&!blinkEyes[n-1])n--;return blinkEyes.slice(0,n)}
// '편집할 눈' 목록: 고른 얼굴의 두 눈(얼굴 k = 눈 칸 2k·2k+1). 적용한 눈에는 ✓.
function paintBlinkEyeOptions(first){
 const sel=$('blinkEye'),base=faceSel*2,keep=clamp(first??(sel.value===''?base:Number(sel.value)),base,base+1);
 paintEyeEntryState();
 $('blinkTitle').textContent=`얼굴 ${faceSel+1} · 눈 깜빡임`;
 sel.replaceChildren(...[0,1].map(j=>{const i=base+j,o=document.createElement('option');o.value=String(i);o.textContent=`눈 ${j+1}`+(blinkEyes[i]?' ✓':'');return o}));
 sel.value=String(keep);
}
function loadBlinkEye(){
 blinkUndoStack.length=blinkRedoStack.length=0;
 const eye=blinkEyes[Number($('blinkEye').value)];
 blinkProtection=structuredClone(eye?.protection||[]);setBlinkProtection(false);
 blinkPoints=eye?.points.map(p=>({x:p.x*renderWidth,y:p.y*renderHeight}))||[];
 $('blinkCover').value=eye?.cover??24;$('blinkCurve').value=(eye?.curve??0)*100;$('blinkAmount').value=0;
}
function drawBlinkLayer(g,patch){
 const {left,angle,scale,originY,output}=patch;
 g.save();g.translate(left.x,left.y);g.rotate(angle);g.scale(1/scale,1/scale);
 g.drawImage(output,0,-originY);g.restore();
}
function uploadBlinkTexture(unit,texture,source){
 gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,texture);
 gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,source);
}
function updateBlinkScene(){
 // 2-A: 간격(초)마다 한 번. 적용 직후 1초 뒤 첫 깜빡임(기본 4.5초일 때 이전과 같다)
 const t=((elapsed-blinkEpoch+blinkInterval-1)%blinkInterval)*1000*blinkSpeed/100;
 const open=clamp((t-105)/145,0,1);
 const amount=t<75?1-(1-t/75)**2:1-open*(2-open);
 const step=faceOn&&blinkPatches.some(Boolean)?Math.round(amount*16):0;
 if(step===blinkLastStep&&tailPlate===blinkLastTail&&!maskDirty)return false;
 const changed=step>0||blinkLastStep>0;
 blinkLastStep=step;blinkLastTail=tailPlate;
 blinkScene=blinkOriginal=null;
 if(!changed)return false;
 baseForegroundSource=null;tailSource=null;tailSources=new Map();
 if(!step)return true;
 blinkOverlay??=blinkCanvas(renderWidth,renderHeight);
 const layer=blinkOverlay.getContext('2d');
 layer.clearRect(0,0,renderWidth,renderHeight);
 blinkPatches.forEach((patch,index)=>{
  if(!patch)return;
  paintBlinkPatch(step/16,patch,blinkEyes[index].curve);
  drawBlinkLayer(layer,patch);
 });
 blinkComposite??=blinkCanvas(renderWidth,renderHeight);
 const original=blinkComposite.getContext('2d');
 original.clearRect(0,0,renderWidth,renderHeight);
 original.drawImage(bitmap,0,0);original.drawImage(blinkOverlay,0,0);
 blinkOriginal=blinkScene=blinkComposite;
 if(tailPlate){
  layer.globalCompositeOperation='destination-out';
  layer.drawImage(tailMask,0,0,renderWidth,renderHeight);
  layer.globalCompositeOperation='source-over';
  blinkTailComposite??=blinkCanvas(renderWidth,renderHeight);
  const scene=blinkTailComposite.getContext('2d');
  scene.clearRect(0,0,renderWidth,renderHeight);
  scene.drawImage(tailPlate,0,0);scene.drawImage(blinkOverlay,0,0);
  blinkScene=blinkTailComposite;
 }
 return true;
}
function blinkCanvas(w,h){
 const canvas=document.createElement('canvas');
 canvas.width=w;canvas.height=h;
 return canvas;
}
function drawBlinkProtection(g,strokes){
 const unit=Math.min(renderWidth,renderHeight);
 g.lineCap='round';g.lineJoin='round';
 for(const {radius,points,taper} of strokes){
  if(taper&&points.length>1){
   const centers=points.map(p=>({x:p.x*renderWidth,y:p.y*renderHeight}));
   const distances=[0];
   for(let i=1;i<centers.length;i++){
    const a=centers[i-1],b=centers[i];
    distances.push(distances[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
   }
   const length=distances.at(-1);
   if(length>0){
    const radii=distances.map(d=>radius*unit*(1-.94*(d/length)**1.35));
    g.fillStyle=g.strokeStyle;
    g.beginPath();
    for(let i=0;i<centers.length;i++){
     const a=centers[i],r=radii[i];
     g.moveTo(a.x+r,a.y);g.arc(a.x,a.y,r,0,Math.PI*2);g.closePath();
     if(i===0)continue;
     const b=centers[i-1],previous=radii[i-1],d=distances[i]-distances[i-1];
     if(!d)continue;
     const nx=(a.y-b.y)/d,ny=(b.x-a.x)/d;
     g.moveTo(b.x+nx*previous,b.y+ny*previous);
     g.lineTo(a.x+nx*r,a.y+ny*r);
     g.lineTo(a.x-nx*r,a.y-ny*r);
     g.lineTo(b.x-nx*previous,b.y-ny*previous);g.closePath();
    }
    g.fill();continue;
   }
  }
  if(!points.length)continue;
  g.lineWidth=radius*unit*2;
  g.beginPath();g.moveTo(points[0].x*renderWidth,points[0].y*renderHeight);
  if(points.length===1)g.lineTo(points[0].x*renderWidth+.01,points[0].y*renderHeight);
  for(const p of points.slice(1))g.lineTo(p.x*renderWidth,p.y*renderHeight);
  g.stroke();
 }
}
function blinkSkinColor(data,mask,w,h,x,y,radius,fallback){
 const candidates=[];
 for(let dx=-radius;dx<=radius;dx+=2){
  for(const dy of [-3,0,3]){
   const i=(clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1))*4;
   if(mask[i+3]>32||data[i+3]<200)continue;
   candidates.push({i,light:data[i]*.299+data[i+1]*.587+data[i+2]*.114});
  }
 }
 if(!candidates.length)return fallback;
 candidates.sort((a,b)=>a.light-b.light);
 const start=Math.floor(candidates.length*.36),end=Math.max(start+1,Math.ceil(candidates.length*.86));
 const sum=[0,0,0];
 for(let i=start;i<end;i++)for(let c=0;c<3;c++)sum[c]+=data[candidates[i].i+c];
 return sum.map(v=>v/(end-start));
}
function bridgeBlinkLashGaps(columns){
 const maxGap=Math.max(3,Math.floor(columns.length*.28));
 for(let start=0;start<columns.length;){
  if(!columns[start].lashHidden){start++;continue}
  let end=start+1;
  while(end<columns.length&&columns[end].lashHidden)end++;
  const left=columns[start-1],right=columns[end];
  // Only reconstruct short, bracketed gaps with a visible line at both ends.
  if(end-start<=maxGap&&left?.darkness>=.16&&right?.darkness>=.16){
   for(let i=start;i<end;i++){
    const t=(i-start+1)/(end-start+1);
    columns[i].darkness=left.darkness*(1-t)+right.darkness*t;
   }
  }
  start=end;
 }
}
function makeBlinkPatch(points,cover,protection=[]){
 if(points.length!==4)return null;
 const [left,right,upper,lower]=points;
 const angle=Math.atan2(right.y-left.y,right.x-left.x);
 const width=Math.hypot(right.x-left.x,right.y-left.y);
 const heightAt=p=>(p.y-left.y)*Math.cos(angle)-(p.x-left.x)*Math.sin(angle);
 const top=heightAt(upper),bottom=heightAt(lower);
 if(width<10||right.x<=left.x||top>=-.5||bottom<=.5){
  return null;
 }
 const scale=Math.min(1,384/width);
 const gap=(bottom-top)*scale;
 const margin=Math.max(2,gap*cover/100);
 const originY=Math.ceil(-top*scale+margin+4);
 const w=Math.ceil(width*scale),h=Math.ceil(originY+bottom*scale+margin+5);
 const canvas=blinkCanvas(w,h),g=canvas.getContext('2d',{willReadFrequently:true});
 g.translate(0,originY);g.scale(scale,scale);g.rotate(-angle);g.translate(-left.x,-left.y);
 g.drawImage(bitmap,0,0);
 const original=g.getImageData(0,0,w,h);
 g.save();g.resetTransform();g.clearRect(0,0,w,h);g.restore();
 drawBlinkProtection(g,protection.filter(stroke=>!stroke.sampleOnly));
 const protectedPixels=g.getImageData(0,0,w,h).data;
 drawBlinkProtection(g,protection.filter(stroke=>stroke.sampleOnly));
 const excludedPixels=protection.some(stroke=>stroke.sampleOnly)?g.getImageData(0,0,w,h).data:protectedPixels;
 const output=blinkCanvas(w,h);
 const columns=[];
 for(let x=0;x<w;x++){
  const u=(x+.5)/w,arch=4*u*(1-u);
  const upper=originY+top*scale*arch,lower=originY+bottom*scale*arch;
  const spread=margin*Math.sqrt(arch);
  const topPixel=(Math.max(0,Math.round(upper-spread-2))*w+x)*4;
  const bottomPixel=(Math.min(h-1,Math.round(lower+spread+2))*w+x)*4;
  const radiusSkin=Math.max(4,Math.min(26,Math.round(w*.08)));
  const source=original.data;
  const fallback=[source[bottomPixel],source[bottomPixel+1],source[bottomPixel+2]];
  const bottomColor=blinkSkinColor(source,excludedPixels,w,h,x,Math.floor(bottomPixel/4/w),radiusSkin,fallback);
  const topColor=blinkSkinColor(source,excludedPixels,w,h,x,Math.floor(topPixel/4/w),radiusSkin,bottomColor);
  let darkest=-1;
  const radius=Math.max(2,Math.min(8,gap*.15));
  for(let y=Math.max(0,Math.floor(upper-radius));y<Math.min(h,upper+radius);y++){
   const p=(y*w+x)*4;
   const luminance=i=>original.data[i]*.299+original.data[i+1]*.587+original.data[i+2]*.114;
   if(protectedPixels[p+3]<32&&original.data[p+3]>200&&(darkest<0||luminance(p)<luminance(darkest)))darkest=p;
  }
  const skinLight=topColor[0]*.299+topColor[1]*.587+topColor[2]*.114;
  const lashLight=darkest<0?skinLight:source[darkest]*.299+source[darkest+1]*.587+source[darkest+2]*.114;
  let lashHidden=false;
  for(let dy=-1;dy<=1;dy++){
   const y=clamp(Math.round(upper)+dy,0,h-1);
   if(protectedPixels[(y*w+x)*4+3]>=128)lashHidden=true;
  }
  columns.push({arch,upper,lower,spread,topColor,bottomColor,lashHidden,
   darkness:clamp(1-lashLight/Math.max(1,skinLight),0,.95)});
 }
 bridgeBlinkLashGaps(columns);
 return {left,angle,scale,top:top*scale,bottom:bottom*scale,originY,w,h,margin,gap,original,output,
  columns,protectedPixels,result:output.getContext('2d').createImageData(w,h)};
}
function paintBlinkPatch(amount,patch=blinkPatch,curve=Number($('blinkCurve').value)/100){
 const {top,bottom,originY,w,h,margin,gap,original,output,result,columns,protectedPixels}=patch;
 const input=original.data,out=result.data;
 out.set(input);
 for(let x=0;x<w;x++){
  const {arch,upper,lower,spread,topColor,bottomColor,darkness}=columns[x];
  const seam=lower;
  const movingTop=upper+(seam-upper)*amount+curve*gap*.2*arch*amount*(1-amount);
  const edge=Math.max(.8,Math.min(3,margin*.45));
  const lineWidth=Math.max(1,Math.min(4,gap*.10));
  for(let y=Math.max(0,Math.floor(upper-spread-2));y<Math.min(h,lower+spread+2);y++){
   const py=y+.5,k=(y*w+x)*4;
   const upperCover=clamp((py-upper+spread)/edge,0,1)*clamp((movingTop-py)/.85+.5,0,1);
   const blend=upperCover*clamp(amount*8,0,1)*clamp(arch*6,0,1);
   const skinMix=clamp((py-upper)/Math.max(1,lower-upper),0,1);
   const offset=py-movingTop;
   const ink=clamp(darkness,0,.95)*clamp(1-Math.abs(offset)/(lineWidth+1),0,1)*clamp(amount*8,0,1)*clamp(arch*6,0,1);
   const crease=.08*Math.max(0,1-Math.abs(offset+lineWidth+1)/(lineWidth+1))*amount;
   const protection=protectedPixels[k+3]/255;
   if(py>lower+lineWidth||protection===1)continue;
   for(let channel=0;channel<3;channel++){
    const skin=topColor[channel]*(1-skinMix)+bottomColor[channel]*skinMix;
    const shaded=(input[k+channel]*(1-blend)+skin*blend)*(1-Math.max(ink,crease));
    out[k+channel]=shaded*(1-protection)+input[k+channel]*protection;
   }
  }
 }
 output.getContext('2d').putImageData(result,0,0);
}
let blinkProtCanvas=null,blinkPan=null,blinkPanned=false,blinkSpace=false,blinkHover=false;
// 3-N 눈 창의 보기 범위(확대·이동). rect=null 이면 전체 보기. 캔버스 크기도 여기서 맞춘다.
// 3-Q: 캔버스는 그림 모양이 아니라 창의 그림 칸 전체를 쓴다. 보기 범위(rect)는 늘 그 칸과 같은 비율이고, 그림 밖은 빈 바탕으로 보인다.
function blinkWholeView(){const st=blinkPreview.parentElement,A=Math.max(.2,st.clientWidth/Math.max(1,st.clientHeight)),w=Math.max(renderWidth,renderHeight*A),h=w/A;return {x:(renderWidth-w)/2,y:(renderHeight-h)/2,w,h,A}}
function setBlinkView(rect){
 const whole=blinkWholeView(),A=whole.A;
 if(!rect)rect=whole;
 else{// 가운데와 크기를 지키면서 칸 비율에 맞춘다. 전체 보기보다 넓어지지 않고, 그림이 화면 밖으로 완전히 나가지 않는다.
  const cx=clamp(rect.x+rect.w/2,0,renderWidth),cy=clamp(rect.y+rect.h/2,0,renderHeight);
  const w=clamp(Math.max(rect.w,rect.h*A),24,whole.w),h=w/A;
  rect=w>=whole.w*.999?whole:{x:cx-w/2,y:cy-h/2,w,h};
 }
 blinkRect={x:rect.x,y:rect.y,w:rect.w,h:rect.h};
 const st=blinkPreview.parentElement,dpr=Math.min(window.devicePixelRatio||1,2),W=Math.max(1,Math.round(st.clientWidth*dpr)),H=Math.max(1,Math.round(st.clientHeight*dpr));
 if(blinkPreview.width!==W||blinkPreview.height!==H){blinkPreview.width=W;blinkPreview.height=H}
 $('blinkZoomReset').textContent=Math.round(whole.w/rect.w*100)+'%';drawBlinkPreview();
}
// f배 확대. (cx,cy)=그림 좌표의 기준점이 화면에서 제자리에 머문다
function zoomBlink(f,cx,cy){const r=blinkRect||blinkWholeView();cx??=r.x+r.w/2;cy??=r.y+r.h/2;setBlinkView({x:cx-(cx-r.x)/f,y:cy-(cy-r.y)/f,w:r.w/f,h:r.h/f})}
// 두 손가락 확대·이동(폰)
const blinkTouches=new Map();let blinkPinch=null;
function blinkPinchState(){const [a,b]=[...blinkTouches.values()];return {d:Math.max(8,Math.hypot(a.x-b.x,a.y-b.y)),mx:(a.x+b.x)/2,my:(a.y+b.y)/2}}
function drawBlinkPreview(){
 if(!bitmap)return;
 const rect=blinkRect||{x:0,y:0,w:renderWidth,h:renderHeight};
 const sx=blinkPreview.width/rect.w,sy=blinkPreview.height/rect.h;
 blinkView.setTransform(sx,0,0,sy,-rect.x*sx,-rect.y*sy);
 blinkView.save();blinkView.resetTransform();blinkView.clearRect(0,0,blinkPreview.width,blinkPreview.height);blinkView.restore();
 blinkView.drawImage(bitmap,0,0);
 const amount=Number($('blinkAmount').value)/100;
 if(blinkPatch&&amount>0){
  paintBlinkPatch(amount);
  const {left,angle,scale,originY,output}=blinkPatch;
  blinkView.save();
  blinkView.translate(left.x,left.y);blinkView.rotate(angle);blinkView.scale(1/scale,1/scale);
  blinkView.drawImage(output,0,-originY);
  blinkView.restore();
 }
 if(blinkProtecting){
  // 3-N: 여러 번 덧그려도 진해지지 않게, 따로 불투명하게 그린 뒤 한 번만 반투명으로 얹는다
  const c=blinkProtCanvas||(blinkProtCanvas=document.createElement('canvas'));c.width=blinkPreview.width;c.height=blinkPreview.height;
  const g=c.getContext('2d');g.setTransform(blinkView.getTransform());g.strokeStyle=g.fillStyle='rgb(72,221,201)';
  drawBlinkProtection(g,blinkStroke?[...blinkProtection,blinkStroke]:blinkProtection);
  blinkView.save();blinkView.resetTransform();blinkView.globalAlpha=.45;blinkView.drawImage(c,0,0);blinkView.restore();
 }
 if(blinkPoints.length<4){
  blinkView.fillStyle='#79f6d1';blinkView.strokeStyle='#181818';blinkView.lineWidth=1.5/sx;
  for(const {x,y} of blinkPoints){
   blinkView.beginPath();blinkView.arc(x,y,4/sx,0,Math.PI*2);blinkView.fill();blinkView.stroke();
  }
 }
}
function refreshBlinkSetup(){
 $('blinkHint').textContent=blinkPrompts[blinkPoints.length]||'미리보기를 확인하고 현재 눈 적용을 눌러 주세요.';
 blinkPatch=makeBlinkPatch(blinkPoints,Number($('blinkCover').value),blinkProtection);
 if(blinkPoints.length===4&&!blinkPatch)$('blinkHint').textContent='눈꼬리는 왼쪽부터 찍고, 위아래 점은 눈꼬리를 잇는 선 양쪽에 찍어 주세요.';
 $('blinkApply').disabled=!blinkPatch;
 $('blinkRemove').disabled=!blinkEyes[Number($('blinkEye').value)];
 $('blinkUndo').disabled=!blinkUndoStack.length;
 $('blinkRedo').disabled=!blinkRedoStack.length;
 for(const id of ['blinkAmount','blinkPlay','blinkHold','blinkCurve','blinkCover'])$(id).disabled=!blinkPatch;
 $('blinkHold').checked=!!blinkPatch&&Number($('blinkAmount').value)>=100;paintBlinkValues();
 drawBlinkPreview();
}
// 3-M: 조절 막대 옆 숫자
function paintBlinkValues(){$('blinkSpeedValue').textContent=$('blinkSpeed').value+'%';$('blinkCurveValue').textContent=$('blinkCurve').value;$('blinkCoverValue').textContent=$('blinkCover').value;$('blinkBrushWidthValue').textContent=$('blinkBrushWidth').value}
function stopBlinkPreview(){
 cancelAnimationFrame(blinkFrame);
 blinkFrame=0;
}
$('eyeEntry').onclick=()=>{
 if(!ready){setStatus('먼저 그림을 열어 주세요.');return}
 blinkRect=null;blinkCropping=false;paintBlinkEyeOptions(faceSel*2);$('blinkSpeed').value=blinkSpeed;paintBlinkInterval();
 loadBlinkEye();
 blinkUndoStack.length=blinkRedoStack.length=0;
 blinkDialog.showModal();setBlinkView(null);refreshBlinkSetup();
};
function blinkPointer(e){
 const r=blinkPreview.getBoundingClientRect();
 const area=blinkRect||{x:0,y:0,w:renderWidth,h:renderHeight};
 return {x:clamp(area.x+(e.clientX-r.left)*area.w/r.width,0,renderWidth),
 y:clamp(area.y+(e.clientY-r.top)*area.h/r.height,0,renderHeight)};
}
blinkPreview.style.touchAction='none';
$('blinkCrop').onclick=()=>{stopBlinkPreview();setBlinkProtection(false);blinkCropping=true;$('blinkHint').textContent='확대할 눈 주변을 네모로 드래그해 주세요.'};
$('blinkWhole').onclick=()=>{
 blinkCropping=false;rememberBlinkEdit();setBlinkView(null);refreshBlinkSetup();
};
function setBlinkProtection(active){
 blinkProtecting=active;blinkStroke=null;
 $('blinkProtect').setAttribute('aria-pressed',String(active));
 $('blinkBrushOptions').hidden=!active;
}
function blinkStrokePoint(e){
 const p=blinkPointer(e);
 return {x:p.x/renderWidth,y:p.y/renderHeight};
}
$('blinkProtect').onclick=()=>{
 stopBlinkPreview();blinkCropping=false;
 setBlinkProtection(!blinkProtecting);
 if(blinkProtecting)$('blinkHint').textContent='앞머리의 굵은 쪽에서 끝까지 가운데를 따라 한 번 그어 주세요. 붓 굵기는 시작 부분에 맞추세요.';
 else refreshBlinkSetup();
 drawBlinkPreview();
};
const blinkUndoStack=[],blinkRedoStack=[];
function blinkEditSnapshot(){return structuredClone({points:blinkPoints,protection:blinkProtection,rect:blinkRect});}// 3-N: 확대 범위도 되돌리기에 넣는다
function rememberBlinkEdit(){
 blinkUndoStack.push(blinkEditSnapshot());
 if(blinkUndoStack.length>45)blinkUndoStack.shift();
 blinkRedoStack.length=0;
}
function stepBlinkEdit(from,to){
 if(!from.length)return;
 stopBlinkPreview();
 to.push(blinkEditSnapshot());
 const snapshot=from.pop();
 blinkPoints=snapshot.points;blinkProtection=snapshot.protection;setBlinkView(snapshot.rect||null);
 $('blinkAmount').value=0;refreshBlinkSetup();
}
blinkPreview.onpointerdown=e=>{
 if(e.pointerType==='touch'){blinkTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(blinkTouches.size===2){blinkStroke=null;blinkCropStart=null;blinkPan=null;blinkPinch={...blinkPinchState(),rect:{...blinkRect}};drawBlinkPreview();return}
  if(blinkTouches.size>2)return}
 if(blinkSpace&&blinkRect){blinkPan={sx:e.clientX,sy:e.clientY,rect:{...blinkRect}};blinkPreview.setPointerCapture(e.pointerId);return}
 if(blinkProtecting){
  if(blinkProtection.length>=40)return;
  const bounds=blinkPreview.getBoundingClientRect();
  const radius=clamp(Number($('blinkBrushWidth').value)*.5*(blinkRect?.w||renderWidth)/bounds.width/Math.min(renderWidth,renderHeight),.001,.2);
  const sampleOnly=$('blinkSampleOnly').checked;
  blinkStroke={radius,taper:!sampleOnly,sampleOnly,points:[blinkStrokePoint(e)]};
  blinkPreview.setPointerCapture(e.pointerId);drawBlinkPreview();return;
 }
 if(!blinkCropping)return;
 blinkCropStart=blinkPointer(e);
 blinkPreview.setPointerCapture(e.pointerId);
};
blinkPreview.onpointermove=e=>{
 if(blinkTouches.has(e.pointerId))blinkTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(blinkPinch){if(blinkTouches.size<2)return;const s=blinkPinchState(),b=blinkPreview.getBoundingClientRect(),r=blinkPinch.rect,f=s.d/blinkPinch.d,w=r.w/f,h=r.h/f;
  // 처음 두 손가락 가운데에 있던 그림의 점이 지금 가운데 아래에 오도록
  const ix=r.x+(blinkPinch.mx-b.left)/b.width*r.w,iy=r.y+(blinkPinch.my-b.top)/b.height*r.h;
  setBlinkView({x:ix-(s.mx-b.left)/b.width*w,y:iy-(s.my-b.top)/b.height*h,w,h});return}
 if(blinkPan){const b=blinkPreview.getBoundingClientRect(),r=blinkPan.rect;setBlinkView({...r,x:r.x-(e.clientX-blinkPan.sx)*r.w/b.width,y:r.y-(e.clientY-blinkPan.sy)*r.h/b.height});return}
 if(blinkStroke){
  if(blinkStroke.points.length<800)blinkStroke.points.push(blinkStrokePoint(e));
  drawBlinkPreview();return;
 }
 if(!blinkCropStart)return;
 drawBlinkPreview();
 const p=blinkPointer(e);
 blinkView.strokeStyle='#76ffd3';blinkView.lineWidth=2*(blinkRect?.w||renderWidth)/blinkPreview.width;
 blinkView.strokeRect(blinkCropStart.x,blinkCropStart.y,p.x-blinkCropStart.x,p.y-blinkCropStart.y);
};
blinkPreview.onpointerup=e=>{
 blinkTouches.delete(e.pointerId);
 if(blinkPinch){if(blinkTouches.size<2){blinkPinch=null;blinkPanned=true;setTimeout(()=>{blinkPanned=false},350)}return}
 if(blinkPan){blinkPan=null;blinkPanned=true;return}
 if(blinkStroke){
  rememberBlinkEdit();blinkProtection.push(blinkStroke);blinkStroke=null;refreshBlinkSetup();return;
 }
 if(!blinkCropStart)return;
 const p=blinkPointer(e),start=blinkCropStart;blinkCropStart=null;
 const w=Math.abs(p.x-start.x),h=Math.abs(p.y-start.y);
 if(w<10||h<10)return;
 rememberBlinkEdit();setBlinkView({x:Math.min(p.x,start.x),y:Math.min(p.y,start.y),w,h});refreshBlinkSetup();
 $('blinkHint').textContent=blinkPrompts[blinkPoints.length]||'확대한 눈의 감김 정도를 확인해 보세요.';
};
blinkPreview.onpointercancel=e=>{blinkTouches.delete(e.pointerId);blinkPinch=null;blinkCropStart=null;blinkStroke=null;drawBlinkPreview()};
blinkPreview.onclick=e=>{
 if(blinkPanned){blinkPanned=false;return}
 if(blinkProtecting)return;
 if(blinkCropping){blinkCropping=false;return}
 if(blinkPoints.length>=4)return;
 rememberBlinkEdit();
 blinkPoints.push(blinkPointer(e));
 refreshBlinkSetup();
};
$('blinkUndo').onclick=()=>stepBlinkEdit(blinkUndoStack,blinkRedoStack);
$('blinkRedo').onclick=()=>stepBlinkEdit(blinkRedoStack,blinkUndoStack);
$('blinkAmount').oninput=()=>{stopBlinkPreview();drawBlinkPreview()};
// 3-M: 감긴 눈 모양·눈꺼풀 보정 범위를 만지는 동안은 눈을 감긴 채로 보여 준다('눈 감은 모습 보기'가 켜진다). 끄면 뜬 눈으로 돌아간다.
$('blinkCurve').oninput=()=>{stopBlinkPreview();$('blinkAmount').value=100;$('blinkHold').checked=true;paintBlinkValues();drawBlinkPreview()};
$('blinkCover').oninput=()=>{stopBlinkPreview();$('blinkAmount').value=100;refreshBlinkSetup()};
$('blinkHold').onchange=()=>{stopBlinkPreview();$('blinkAmount').value=$('blinkHold').checked?100:0;drawBlinkPreview()};
$('blinkSpeed').oninput=paintBlinkValues;$('blinkBrushWidth').oninput=paintBlinkValues;
$('blinkPlay').onclick=()=>{
 stopBlinkPreview();$('blinkHold').checked=false;
 const start=performance.now();
 function frame(now){
  const t=(now-start)*Number($('blinkSpeed').value)/100;
  const open=clamp((t-105)/145,0,1);
  $('blinkAmount').value=100*(t<75?1-(1-t/75)**2:1-open*(2-open));
  drawBlinkPreview();
  blinkFrame=t<250?requestAnimationFrame(frame):0;
 }
 blinkFrame=requestAnimationFrame(frame);
};
$('blinkEye').onchange=()=>{stopBlinkPreview();loadBlinkEye();refreshBlinkSetup()};
$('blinkApply').onclick=()=>{
 if(!blinkPatch)return;
 const index=Number($('blinkEye').value);
 blinkEyes[index]={points:blinkPoints.map(p=>({x:p.x/renderWidth,y:p.y/renderHeight})),
  protection:structuredClone(blinkProtection),cover:Number($('blinkCover').value),curve:Number($('blinkCurve').value)/100};
 blinkPatches[index]=blinkPatch;
 blinkEpoch=elapsed;
 scheduleSave();paintBlinkEyeOptions();refreshBlinkSetup();
 setBlinkProtection(false);drawBlinkPreview();
 $('blinkHint').textContent='이 눈을 적용했습니다. 다른 눈을 선택하거나 창을 닫아 보세요.';
};
$('blinkRemove').onclick=async()=>{
 const index=Number($('blinkEye').value);
 if(!await askConfirm({title:'눈 제거',message:`얼굴 ${faceSel+1}의 눈 ${index%2+1} 깜빡임 설정(눈꼬리·눈꺼풀 위치, 앞머리 보호)을 지울까요?`,ok:'이 눈 제거'}))return;
 blinkEyes[index]=blinkPatches[index]=null;
 stopBlinkPreview();paintBlinkEyeOptions();loadBlinkEye();refreshBlinkSetup();scheduleSave();
};
$('blinkSpeed').onchange=()=>{blinkSpeed=Number($('blinkSpeed').value);scheduleSave()};
function paintBlinkInterval(){$('blinkInterval').value=blinkInterval;$('blinkIntervalValue').textContent=blinkInterval.toFixed(1)+'초'}
$('blinkInterval').oninput=()=>{blinkInterval=Number($('blinkInterval').value);$('blinkIntervalValue').textContent=blinkInterval.toFixed(1)+'초'};
$('blinkInterval').onchange=()=>{blinkInterval=Number($('blinkInterval').value);blinkEpoch=elapsed;scheduleSave()};
$('blinkClose').onclick=()=>blinkDialog.close();
blinkDialog.addEventListener('close',stopBlinkPreview);

// 3-N 눈 창 확대·이동: − 100% + 버튼, 마우스 휠(가리킨 곳 기준), 스페이스 바를 누른 채 끌기
$('blinkZoomIn').onclick=()=>zoomBlink(1.25);$('blinkZoomOut').onclick=()=>zoomBlink(1/1.25);$('blinkZoomReset').onclick=()=>$('blinkWhole').click();
blinkPreview.addEventListener('wheel',e=>{e.preventDefault();const p=blinkPointer(e);zoomBlink(e.deltaY<0?1.2:1/1.2,p.x,p.y)},{passive:false});
blinkPreview.addEventListener('pointerenter',()=>{blinkHover=true});blinkPreview.addEventListener('pointerleave',()=>{blinkHover=false});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&blinkDialog.open&&blinkHover&&!e.target.closest?.('input[type=text],select')){blinkSpace=true;e.preventDefault();blinkPreview.style.cursor='grab'}},true);
document.addEventListener('keyup',e=>{if(e.code==='Space'){blinkSpace=false;blinkPreview.style.cursor=''}});
window.addEventListener('resize',()=>{if(blinkDialog.open)setBlinkView(blinkRect)});
