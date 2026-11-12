function strokePath(g,s,w,h){const pts=s.points;if(!pts.length)return;const r=s.r*Math.min(renderWidth,renderHeight);g.save();g.scale(w/renderWidth,h/renderHeight);g.lineWidth=Math.max(.1,2*r);g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(pts[0][0]*renderWidth,pts[0][1]*renderHeight);for(let k=1;k<pts.length;k++)g.lineTo(pts[k][0]*renderWidth,pts[k][1]*renderHeight);if(pts.length===1){g.lineTo(pts[0][0]*renderWidth+.01,pts[0][1]*renderHeight+.01)}g.stroke();g.restore()}
function createMask(z,base=rawMaskCanvas(z)){const softened=document.createElement('canvas');softened.width=softened.height=TILE;const soft=softened.getContext('2d');const blur=Math.round(Math.max(0,z.feather||0)*.63);const spread=Math.round(z.spread||0);if(spread>0)base=dilateMask(base,spread);if(blur){soft.filter=`blur(${blur}px)`;soft.drawImage(base,0,0);soft.filter='none'}else soft.drawImage(base,0,0);return softened}


// Interpolate between the visible endpoints of each masked run.
function accumulateBackgroundLine(data,inside,totals,start,stride,length){
 let index=0;
 while(index<length){
  if(!inside[start+index*stride]){index++;continue}
  const first=index;
  while(index<length&&inside[start+index*stride])index++;
  const before=first>0?(start+(first-1)*stride)*4:-1;
  const after=index<length?(start+index*stride)*4:-1;
  if(before<0&&after<0)continue;
  for(let k=first;k<index;k++){
   const left=k-first+1,right=index-k;
   const blend=before<0?1:after<0?0:left/(left+right);
   const weight=1/(before<0?right:after<0?left:Math.min(left,right));
   const a=before<0?after:before,b=after<0?before:after;
   const alphaA=(1-blend)*data[a+3]/255,alphaB=blend*data[b+3]/255;
   const p=(start+k*stride)*5;

   for(let channel=0;channel<3;channel++){
    totals[p+channel]+=weight*(alphaA*data[a+channel]+alphaB*data[b+channel]);
   }
   totals[p+3]+=weight*(alphaA+alphaB);
   totals[p+4]+=weight;
  }
 }
}

function buildBackgroundPlate(mask){
 const scale=Math.min(1,850/Math.max(renderWidth,renderHeight));
 const width=Math.max(1,Math.round(renderWidth*scale)),height=Math.max(1,Math.round(renderHeight*scale));
 const work=document.createElement('canvas');
 work.width=width;work.height=height;
 const g=work.getContext('2d',{willReadFrequently:true});
 g.drawImage(bitmap,0,0,width,height);
 const image=g.getImageData(0,0,width,height),data=image.data;
 const footprint=dilateMask(mask,2);
 const maskAtWorkSize=source=>{
  g.clearRect(0,0,width,height);g.drawImage(source,0,0,width,height);
  return g.getImageData(0,0,width,height).data;
 };
 const covered=maskAtWorkSize(footprint);
 const nearby=maskAtWorkSize(dilateMask(mask,8));
 const size=width*height,inside=new Uint8Array(size);
 let count=0,nearCount=0,visibleCount=0;
 const sum=[0,0,0,0],squares=[0,0,0,0],visible=[0,0,0,0];
 for(let i=0;i<size;i++){
  const p=i*4;
  if(covered[p+3]>=128){inside[i]=1;count++;continue}
  visibleCount++;
  for(let channel=0;channel<4;channel++)visible[channel]+=data[p+channel];
  if(nearby[p+3]<128)continue;
  nearCount++;
  for(let channel=0;channel<4;channel++){
   const value=data[p+channel];
   sum[channel]+=value;squares[channel]+=value*value;
  }
 }
 // A whole-image selection leaves no visible background to estimate.
 if(!count||!visibleCount)return null;
 const nearbyMean=nearCount?sum.map(value=>value/nearCount):null;
 const flat=nearbyMean&&squares.every((square,i)=>square/nearCount-nearbyMean[i]**2<36);
 if(flat){
  for(let i=0;i<size;i++)if(inside[i])data.set(nearbyMean,i*4);
 }else{
  const totals=new Float32Array(size*5);
  for(let y=0;y<height;y++)accumulateBackgroundLine(data,inside,totals,y*width,1,width);
  for(let x=0;x<width;x++)accumulateBackgroundLine(data,inside,totals,x,width,height);
  const fallback=nearbyMean||visible.map(value=>value/visibleCount);
  for(let i=0;i<size;i++){
   if(!inside[i])continue;
   const p=i*5,k=i*4,weight=totals[p+4],alpha=totals[p+3];
   if(!weight){data.set(fallback,k);continue}
   for(let channel=0;channel<3;channel++)data[k+channel]=alpha?totals[p+channel]/alpha:0;
   data[k+3]=255*alpha/weight;
  }
 }
 g.putImageData(image,0,0);
 if(scale===1)return work;

 // Keep the unmasked part of the source at its original resolution.
 const plate=document.createElement('canvas');
 plate.width=renderWidth;plate.height=renderHeight;
 const dest=plate.getContext('2d',{willReadFrequently:true});
 dest.drawImage(bitmap,0,0);
 const original=dest.getImageData(0,0,plate.width,plate.height);
 for(let y=0;y<plate.height;y++){
  const row=Math.min(height-1,Math.floor((y+.5)*height/plate.height))*width;
  for(let x=0;x<plate.width;x++){
   const i=row+Math.min(width-1,Math.floor((x+.5)*width/plate.width));
   if(!inside[i])continue;
   const p=(y*plate.width+x)*4,q=i*4;
   for(let channel=0;channel<4;channel++)original.data[p+channel]=data[q+channel];
  }
 }
 dest.putImageData(original,0,0);
 return plate;
}

function updateBaseTextures(){
 const z=getBase();
 if(!z){
  baseMaskCanvas=null;backgroundPlate=null;baseForegroundSource=null;
  lastBaseSignature='';return;
 }
 const signature=JSON.stringify([z.kind,z.x,z.y,z.rx,z.ry,z.rot,z.scale,z.baseX,z.baseY,z.strokes,z.polygon,z.runs])+':'+renderWidth+'x'+renderHeight;
 const maskChanged=signature!==lastBaseSignature;
 if(maskChanged){
  backgroundPlate=null;baseForegroundSource=null;
  baseMaskCanvas=null;lastBaseSignature=signature;
 }
 if(!baseBackgroundExclude)return;
 if(!maskChanged&&baseMaskCanvas&&lastBaseEdge===baseEdge)return;
 const base=rawMaskCanvas(z);
 if(!baseMaskCanvas)backgroundPlate=buildBackgroundPlate(base);
 const b=document.createElement('canvas');
 b.width=b.height=TILE;
 const bg=b.getContext('2d');
 if(baseEdge)bg.filter='blur('+baseEdge+'px)';
 bg.drawImage(base,0,0);
 baseMaskCanvas=b;lastBaseEdge=baseEdge;
 baseForegroundSource=null;
}
function syncBaseTexturesGL(){
 if(!gl||!baseMaskTex||!backgroundTex)return;
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,baseMaskTex);
 const m=baseMaskCanvas||emptyBaseMask;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,m);
 gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,backgroundTex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tailBasePlate||backgroundPlate||bitmap);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,imageTex);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tailPlate||bitmap);
 if(tailPlate){
  gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,tailOriginalTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,tailMaskTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tailMask);
 }
}
const emptyBaseMask=document.createElement('canvas');emptyBaseMask.width=emptyBaseMask.height=TILE;

let rawMaskPixels=[];
let tailPlate=null,tailSource=null,tailMask=null,tailBasePlate=null,tailOriginalTex=null,tailMaskTex=null;

function tailCutoutZone(){
 return zones.find(z=>z.tailCutout&&!z.isBase)||null;
}

function updateTailCutout(){
 tailPlate=tailSource=tailMask=tailBasePlate=null;
 baseForegroundSource=null;
 const index=zones.indexOf(tailCutoutZone());
 if(index<0)return;
 const mask=rawMasks[index];
 const plate=buildBackgroundPlate(mask);
 if(!plate)return;
 tailPlate=plate;
 tailMask=mask;
 const baseIndex=zones.findIndex(z=>z.isBase);
 if(backgroundPlate&&baseIndex>=0&&!baseClipEnabled){
  const union=document.createElement('canvas');
  union.width=union.height=TILE;
  const g=union.getContext('2d');
  g.drawImage(rawMasks[baseIndex],0,0);
  g.drawImage(mask,0,0);
  tailBasePlate=buildBackgroundPlate(union);
 }
}

function getTailSource(image=bitmap){
 if(tailSource)return tailSource;
 tailSource=document.createElement('canvas');
 tailSource.width=renderWidth;
 tailSource.height=renderHeight;
 const g=tailSource.getContext('2d');
 g.drawImage(image,0,0);
 g.globalCompositeOperation='destination-in';
 g.drawImage(tailMask,0,0,renderWidth,renderHeight);
 return tailSource;
}
const maskPreviews=new WeakMap();

function clipMask(mask,clip){
 if(!clip)return mask;
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=TILE;
 const g=canvas.getContext('2d',{willReadFrequently:true});
 g.drawImage(mask,0,0);
 g.globalCompositeOperation='destination-in';
 g.drawImage(clip,0,0);
 return canvas;
}

// 0-2: 영역별 캐시. 모양이 바뀐 영역만 원본 마스크를, 모양·경계값이 바뀐 영역만 효과 마스크를 다시 만든다.
const zoneMaskCache=new Map();
let lastTailKey=null,lastTailBitmap=null,lastGLSync=[];
function zoneShapeKey(z){return JSON.stringify([z.kind,z.x,z.y,z.rx,z.ry,z.rot,z.scale,z.baseX,z.baseY,z.kind==='brush'?z.strokes:0,z.kind==='polygon'?z.polygon:0,z.kind==='raster'?z.runs:0])}
function updateMasks(){
 if(!maskDirty||!ready)return;
 updateBaseTextures();
 const atlas=maskAtlas.getContext('2d');
 atlas.clearRect(0,0,maskAtlas.width,maskAtlas.height);
 const baseIndex=zones.findIndex(z=>z.isBase);
 const keys=zones.map(zoneShapeKey);
 const live=new Set();
 const entries=zones.map((z,i)=>{
  live.add(z.id);
  let c=zoneMaskCache.get(z.id);
  if(!c||c.shape!==keys[i]){c={shape:keys[i],raw:rawMaskCanvas(z)};zoneMaskCache.set(z.id,c)}
  return c;
 });
 for(const id of [...zoneMaskCache.keys()])if(!live.has(id))zoneMaskCache.delete(id);
 const originals=entries.map(c=>c.raw);
 const clip=baseClipEnabled?originals[baseIndex]:null;
 const clipKey=clip?keys[baseIndex]:'';
 rawMasks=entries.map((c,i)=>{
  const key=i===baseIndex?'':clipKey;
  if(c.clipped===undefined||c.clipKey!==key){c.clipKey=key;c.clipped=i===baseIndex?c.raw:clipMask(c.raw,clip);c.pixels=c.clipped.getContext('2d').getImageData(0,0,TILE,TILE).data}
  return c.clipped;
 });
 // '외곽까지 흔들기' 배경은 그 영역·몸체의 원본 마스크나 그림이 바뀔 때만 다시 만든다.
 const tailIndex=zones.indexOf(tailCutoutZone());
 const tailKey=tailIndex<0?'none':JSON.stringify([zones[tailIndex].id,keys[tailIndex],entries[tailIndex].clipKey,baseIndex>=0?keys[baseIndex]:'',baseClipEnabled,!!backgroundPlate,renderWidth,renderHeight]);
 if(tailKey!==lastTailKey||lastTailBitmap!==bitmap||(tailIndex>=0&&tailMask!==rawMasks[tailIndex])){updateTailCutout();lastTailKey=tailKey;lastTailBitmap=bitmap}
 rawMaskPixels=entries.map(c=>c.pixels);
 masks=zones.map((z,i)=>{
  const c=entries[i];
  const fx=c.shape+'|'+z.feather+'|'+z.spread;
  if(c.fx!==fx){c.fx=fx;c.effect=createMask(z,c.raw);c.effectClipKey=undefined}
  const key=i===baseIndex?'':clipKey;
  if(c.effectClipKey!==key){c.effectClipKey=key;c.effectClipped=i===baseIndex?c.effect:clipMask(c.effect,clip)}
  atlas.drawImage(c.effectClipped,(i%COLS)*TILE,Math.floor(i/COLS)*TILE);
  return c.effectClipped;
 });
 maskDirty=false;
 maskReady=true;
 if(gl){
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,maskTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,maskAtlas);
  // 그림·배경판·몸체·분리 레이어 텍스처는 내용이 바뀐 경우에만 다시 올린다.
  const sync=[gl,baseMaskCanvas,tailBasePlate||backgroundPlate,tailPlate,bitmap,tailMask];
  if(sync.some((v,i)=>v!==lastGLSync[i])){
   syncBaseTexturesGL();lastGLSync=sync;
   if(blinkLastStep>0)blinkLastStep=-1;
  }
 }else if(blinkLastStep>0)blinkLastStep=-1;
}
function maskPreview(i,z,isSelected){
 const mask=rawMasks[i];
 if(!mask)return null;
 const color=z.isBase?'#e8b967':isSelected?$('maskColorInput').value:'#acd6f7';
 const opacity=isSelected?Number($('maskOpacityInput').value)/100:.13;
 const key=color+':'+opacity+':'+isSelected;
 const cached=maskPreviews.get(mask);
 if(cached?.key===key)return cached.canvas;
 const canvas=document.createElement('canvas');
 canvas.width=canvas.height=TILE;
 const g=canvas.getContext('2d');
 g.globalAlpha=opacity;
 g.drawImage(mask,0,0);
 g.globalAlpha=1;
 g.globalCompositeOperation='source-in';
 g.fillStyle=color;
 g.fillRect(0,0,TILE,TILE);
 g.globalCompositeOperation='source-over';
 if(isSelected){
  const outline=g.createImageData(TILE,TILE),pixels=rawMaskPixels[i];
  const inside=(x,y)=>x>=0&&y>=0&&x<TILE&&y<TILE&&pixels[(y*TILE+x)*4+3]>=128;
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
   if(!inside(x,y))continue;
   const edge=!inside(x-1,y)||!inside(x+1,y)||!inside(x,y-1)||!inside(x,y+1);
   const inner=!inside(x-2,y)||!inside(x+2,y)||!inside(x,y-2)||!inside(x,y+2);
   if(!inner)continue;
   const k=(y*TILE+x)*4;
   outline.data[k]=outline.data[k+1]=outline.data[k+2]=edge?20:255;
   outline.data[k+3]=230;
  }
  const edgeCanvas=document.createElement('canvas');
  edgeCanvas.width=edgeCanvas.height=TILE;
  edgeCanvas.getContext('2d').putImageData(outline,0,0);
  g.drawImage(edgeCanvas,0,0);
 }
 maskPreviews.set(mask,{key,canvas});
 return canvas;
}

