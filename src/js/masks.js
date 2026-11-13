function strokePath(g,s,w,h){const pts=s.points;if(!pts.length)return;const r=s.r*Math.min(renderWidth,renderHeight);g.save();g.scale(w/renderWidth,h/renderHeight);g.lineWidth=Math.max(.1,2*r);g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(pts[0][0]*renderWidth,pts[0][1]*renderHeight);for(let k=1;k<pts.length;k++)g.lineTo(pts[k][0]*renderWidth,pts[k][1]*renderHeight);if(pts.length===1){g.lineTo(pts[0][0]*renderWidth+.01,pts[0][1]*renderHeight+.01)}g.stroke();g.restore()}
// base는 이미 넓힌(spread) 모양이다
function createMask(z,base){const softened=document.createElement('canvas');softened.width=softened.height=TILE;const soft=softened.getContext('2d');const blur=Math.round(Math.max(0,z.feather||0)*.63);if(blur){soft.filter=`blur(${blur}px)`;soft.drawImage(base,0,0);soft.filter='none'}else soft.drawImage(base,0,0);return softened}


// 2-M: 빈자리는 먼저 부드럽게 채워 바로 보여 주고(smoothFillF), 뒤에서 조각 붙이기(patchFillSteps)로 다듬어 바꿔 넣는다.
const fillJobs=[];let fillTimer=0;
function plateInUse(plate){return plate===backgroundPlate||plate===tailPlate||plate===tailBasePlate}
function writePlate(job){
 const {work,image,inside,width,height,plate}=job;
 work.getContext('2d').putImageData(image,0,0);
 if(plate===work)return;
 // Keep the unmasked part of the source at its original resolution.
 const dest=plate.getContext('2d',{willReadFrequently:true});
 dest.drawImage(bitmap,0,0);
 const original=dest.getImageData(0,0,plate.width,plate.height),data=image.data;
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
}
function queueFill(job){
 fillJobs.push(job);
 // 모양을 고치는 동안에는 기다렸다가(마지막 변경 0.25초 뒤) 시작한다
 clearTimeout(fillTimer);fillTimer=setTimeout(pumpFill,250);
}
function pumpFill(){
 while(fillJobs.length&&(!plateInUse(fillJobs[0].plate)||fillJobs[0].source!==bitmap))fillJobs.shift();
 const job=fillJobs[0];if(!job)return;
 if(!job.steps){
  const {image,inside,width,height}=job,n=width*height,data=image.data,col=new Float32Array(n*3);
  for(let i=0;i<n;i++){const a=data[i*4+3]/255;col[i*3]=data[i*4]*a;col[i*3+1]=data[i*4+1]*a;col[i*3+2]=data[i*4+2]*a}
  job.col=col;
  // 드러나는 띠(이동 상한 5.5% + 전체 움직임)까지만, 큰 그림은 절반 크기에서
  job.steps=patchFillSteps(col,inside,width,height,{top:Math.max(width,height)>500?1:0,em:3,pm:3,band:Math.ceil(.075*Math.max(width,height))});
 }
 const until=performance.now()+10;let done=false;
 while(!done&&performance.now()<until)done=job.steps.next().done;
 if(done){
  fillJobs.shift();
  const {image,inside,width,height,col}=job,data=image.data;
  for(let i=0;i<width*height;i++){
   if(!inside[i])continue;
   const a=data[i*4+3]/255;
   for(let c=0;c<3;c++)data[i*4+c]=a?col[i*3+c]/a:0;
  }
  writePlate(job);
  // 같은 캔버스의 내용만 바뀌었으므로 텍스처·깜빡임 합성을 직접 다시 올린다
  if(gl)syncBaseTexturesGL();
  if(blinkLastStep>0)blinkLastStep=-1;
 }
 if(fillJobs.length)fillTimer=setTimeout(pumpFill,0);
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
  // 투명한 그림도 다루도록 색에 불투명도를 곱해 함께 채운다
  const col=new Float32Array(size*4),known=new Uint8Array(size);
  for(let i=0;i<size;i++){
   const p=i*4,a=data[p+3]/255;
   col[p]=data[p]*a;col[p+1]=data[p+1]*a;col[p+2]=data[p+2]*a;col[p+3]=data[p+3];known[i]=inside[i]?0:1;
  }
  smoothFillF(col,known,width,height,4);
  for(let i=0;i<size;i++){
   if(!inside[i])continue;
   const p=i*4,a=col[p+3]/255;
   for(let channel=0;channel<3;channel++)data[p+channel]=a>0?col[p+channel]/a:0;
   data[p+3]=col[p+3];
  }
 }
 let plate=work;
 if(scale!==1){plate=document.createElement('canvas');plate.width=renderWidth;plate.height=renderHeight}
 const job={plate,work,image,inside,width,height,source:bitmap};
 writePlate(job);
 if(!flat)queueFill(job);
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
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,tailChannels||tailMask);
 }
}
const emptyBaseMask=document.createElement('canvas');emptyBaseMask.width=emptyBaseMask.height=TILE;

let rawMaskPixels=[];
let tailPlate=null,tailSource=null,tailMask=null,tailBasePlate=null,tailOriginalTex=null,tailMaskTex=null;

// 2-D: '외곽까지 흔들기' 영역 최대 4개. 영역 모양은 한 텍스처의 R·G·B·A 채널에 하나씩, 빈자리 배경판은 합친 모양으로 한 장.
const TAIL_MAX=4;let tailChannels=null,tailSources=new Map(),tailLayers=new Map();
function tailCutoutZones(){
 return zones.filter(z=>z.tailCutout&&!z.isBase).slice(0,TAIL_MAX);
}
function tailCutoutZone(){return tailCutoutZones()[0]||null}

function updateTailCutout(){
 tailPlate=tailMask=tailBasePlate=tailChannels=null;tailSource=null;tailSources=new Map();tailLayers=new Map();
 baseForegroundSource=null;
 const cut=tailCutoutZones().filter(z=>rawMasks[zones.indexOf(z)]);
 const list=cut.map(z=>rawMasks[zones.indexOf(z)]);
 if(!list.length)return;
 const union=document.createElement('canvas');
 union.width=union.height=TILE;
 const u=union.getContext('2d',{willReadFrequently:true});
 for(const m of list)u.drawImage(m,0,0);
 const plate=buildBackgroundPlate(union);
 if(!plate)return;
 tailPlate=plate;
 // 2-M: 빈자리는 선택보다 2칸 넓게 파므로 얹는 그림은 3칸 넓힌다. 그 사이 테두리가 원본 그대로 보여, 가만히 있을 때 원본과 같다.
 const layers=list.map(m=>dilateMask(m,3));
 cut.forEach((z,k)=>tailLayers.set(z.id,layers[k]));
 const all=document.createElement('canvas');all.width=all.height=TILE;
 const ag=all.getContext('2d');for(const m of layers)ag.drawImage(m,0,0);
 tailMask=all;
 // 캔버스는 투명한 칸의 색을 지우므로(premultiplied) 픽셀 데이터를 그대로 텍스처로 올린다
 const img=new ImageData(TILE,TILE);
 layers.forEach((m,k)=>{const a=m.getContext('2d',{willReadFrequently:true}).getImageData(0,0,TILE,TILE).data;for(let i=0;i<TILE*TILE;i++)img.data[i*4+k]=a[i*4+3]});
 tailChannels=img;
 const baseIndex=zones.findIndex(z=>z.isBase);
 if(backgroundPlate&&baseIndex>=0&&!baseClipEnabled){
  const both=document.createElement('canvas');
  both.width=both.height=TILE;
  const g=both.getContext('2d');
  g.drawImage(rawMasks[baseIndex],0,0);
  g.drawImage(union,0,0);
  tailBasePlate=buildBackgroundPlate(both);
 }
}

// 영역 하나의 오려낸 그림(캔버스 대체 경로용)
function getTailSource(image=bitmap,z=tailCutoutZone()){
 const key=z?.id;
 if(tailSources.has(key))return tailSources.get(key);
 const mask=tailLayers.get(key)||tailMask;
 const c=document.createElement('canvas');
 c.width=renderWidth;c.height=renderHeight;
 const g=c.getContext('2d');
 g.drawImage(image,0,0);
 g.globalCompositeOperation='destination-in';
 g.drawImage(mask,0,0,renderWidth,renderHeight);
 tailSources.set(key,c);
 return c;
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
// 2-M 접힘 방지: 영역 바깥 칸마다 '영역까지의 거리'를 담은 지도(영역 지도와 같은 배치). 크게 움직일 때 셰이더가 이 거리로 완충 띠를 넓힌다.
const DIST_RANGE=.16;let distTex=null,distAtlas=null,lastDistLayout='';
function zoneDistance(src,clipPixels){
 const a=src.getContext('2d',{willReadFrequently:true}).getImageData(0,0,TILE,TILE).data;
 const n=TILE*TILE,d=new Float32Array(n),A=.955,B=1.37;
 for(let i=0;i<n;i++)d[i]=a[i*4+3]>=128&&(!clipPixels||clipPixels[i*4+3]>=128)?0:1e6;
 for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
  const i=y*TILE+x;let v=d[i];if(!v)continue;
  if(x>0)v=Math.min(v,d[i-1]+A);
  if(y>0){v=Math.min(v,d[i-TILE]+A);if(x>0)v=Math.min(v,d[i-TILE-1]+B);if(x<TILE-1)v=Math.min(v,d[i-TILE+1]+B)}
  d[i]=v;
 }
 for(let y=TILE-1;y>=0;y--)for(let x=TILE-1;x>=0;x--){
  const i=y*TILE+x;let v=d[i];if(!v)continue;
  if(x<TILE-1)v=Math.min(v,d[i+1]+A);
  if(y<TILE-1){v=Math.min(v,d[i+TILE]+A);if(x<TILE-1)v=Math.min(v,d[i+TILE+1]+B);if(x>0)v=Math.min(v,d[i+TILE-1]+B)}
  d[i]=v;
 }
 const out=new ImageData(TILE,TILE),o=out.data,k=255/(DIST_RANGE*TILE);
 for(let i=0;i<n;i++){o[i*4]=o[i*4+1]=o[i*4+2]=255-Math.min(255,d[i]*k);o[i*4+3]=255}
 return out;
}
function updateDistances(entries,baseIndex,clipKey){
 if(!gl||!distTex)return;
 const clipPixels=clipKey?entries[baseIndex].pixels:null;
 const layout=entries.map((c,i)=>{
  const z=zones[i],spread=Math.round(z.spread||0),key=c.shape+'|'+spread+'|'+(i===baseIndex?'':clipKey);
  if(c.distKey!==key){c.distKey=key;c.dist=zoneDistance(c.wide,i===baseIndex?null:clipPixels)}
  return z.id+':'+key;
 }).join('/');
 if(layout===lastDistLayout)return;
 lastDistLayout=layout;
 if(!distAtlas){distAtlas=document.createElement('canvas');distAtlas.width=maskAtlas.width;distAtlas.height=maskAtlas.height}
 const g=distAtlas.getContext('2d');
 g.fillStyle='#000';g.fillRect(0,0,distAtlas.width,distAtlas.height);
 entries.forEach((c,i)=>g.putImageData(c.dist,(i%COLS)*TILE,Math.floor(i/COLS)*TILE));
 gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,distTex);
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,distAtlas);
}
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
 const tailList=tailCutoutZones().map(z=>zones.indexOf(z));
 const tailKey=!tailList.length?'none':JSON.stringify([tailList.map(i=>[zones[i].id,keys[i],entries[i].clipKey]),baseIndex>=0?keys[baseIndex]:'',baseClipEnabled,!!backgroundPlate,renderWidth,renderHeight]);
 if(tailKey!==lastTailKey||lastTailBitmap!==bitmap){updateTailCutout();lastTailKey=tailKey;lastTailBitmap=bitmap}
 rawMaskPixels=entries.map(c=>c.pixels);
 masks=zones.map((z,i)=>{
  const c=entries[i];
  const fx=c.shape+'|'+z.feather+'|'+z.spread;
  const spread=Math.round(z.spread||0),wideKey=c.shape+'|'+spread;
  // 넓힌 모양은 효과 마스크와 거리 지도가 함께 쓴다
  if(c.wideKey!==wideKey){c.wideKey=wideKey;c.wide=spread>0?dilateMask(c.raw,spread):c.raw}
  if(c.fx!==fx){c.fx=fx;c.effect=createMask(z,c.wide);c.effectClipKey=undefined}
  const key=i===baseIndex?'':clipKey;
  if(c.effectClipKey!==key){c.effectClipKey=key;c.effectClipped=i===baseIndex?c.effect:clipMask(c.effect,clip)}
  atlas.drawImage(c.effectClipped,(i%COLS)*TILE,Math.floor(i/COLS)*TILE);
  return c.effectClipped;
 });
 updateDistances(entries,baseIndex,clipKey);
 maskDirty=false;
 maskReady=true;
 if(gl){
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,maskTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,maskAtlas);
  // 그림·배경판·몸체·분리 레이어 텍스처는 내용이 바뀐 경우에만 다시 올린다.
  const sync=[gl,baseMaskCanvas,tailBasePlate||backgroundPlate,tailPlate,bitmap,tailChannels];
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

