function colorDistanceSquared(raw,a,b,lightWeight=1){
 const i=a*4,j=b*4;
 const r=raw[i]-raw[j],g=raw[i+1]-raw[j+1],blue=raw[i+2]-raw[j+2],alpha=raw[i+3]-raw[j+3];
 const light=.30*r+.59*g+.11*blue;
 return .30*(r-light)**2+.59*(g-light)**2+.11*(blue-light)**2+lightWeight*light*light+.25*alpha*alpha;
}
function selectionNeighbors(i,width,size,visit){
 const x=i%width;
 if(x)visit(i-1);
 if(x+1<width)visit(i+1);
 if(i>=width)visit(i-width);
 if(i+width<size)visit(i+width);
}
function selectionGraph(raw,width,height){
 const size=width*height,right=new Uint8Array(size),down=new Uint8Array(size);
 const barrier=(a,b)=>Math.min(255,Math.round(4*Math.sqrt(colorDistanceSquared(raw,a,b))));
 for(let i=0;i<size;i++){
  if(i%width+1<width)right[i]=barrier(i,i+1);
  if(i+width<size)down[i]=barrier(i,i+width);
 }
 return {width,height,right,down,raw};
}
function selectionCosts(graph,seeds,mask,seedColor=false){
 const {width,right,down,raw}=graph,size=right.length;
 const costs=new Uint16Array(size);costs.fill(256);
 const head=new Int32Array(256),next=new Int32Array(size),prev=new Int32Array(size);
 head.fill(-1);
 const queue=(i,c)=>{
  const old=costs[i];
  if(old<256){
   if(prev[i]<0)head[old]=next[i];else next[prev[i]]=next[i];
   if(next[i]>=0)prev[next[i]]=prev[i];
  }
  costs[i]=c;prev[i]=-1;next[i]=head[c];
  if(head[c]>=0)prev[head[c]]=i;
  head[c]=i;
 };
 for(const i of seeds)if(costs[i]&&(!mask||mask[i]))queue(i,0);
 const seed=seeds[0];
 for(let c=0;c<256;c++)while(head[c]>=0){
  const i=head[c];head[c]=next[i];if(head[c]>=0)prev[head[c]]=-1;
  selectionNeighbors(i,width,size,j=>{
   if(costs[j]<=c||(mask&&!mask[j]))return;
   const edge=j===i+1?right[i]:j===i-1?right[j]:j>i?down[i]:down[j];
   const color=seedColor?Math.min(255,Math.round(1.4*Math.sqrt(colorDistanceSquared(raw,seed,j,.56)))):0;
   const rank=Math.max(c,edge,color);
   if(rank<costs[j])queue(j,rank);
  });
 }
 return costs;
}
function outlineCosts(graph,mask,keep,remove){
 const {width,right}=graph,size=right.length;
 const edge=[],distance=new Uint16Array(size),fifo=new Int32Array(size);
 let front=0,end=0,center=-1;
 for(let i=0;i<size;i++){
  if(!mask[i])continue;
  if(i%width===0||i%width===width-1||i<width||i>=size-width||
     !mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width]){
   edge.push(i);fifo[end++]=i;distance[i]=1;
  }
 }
 while(front<end){
  const i=fifo[front++];
  if(center<0||distance[i]>distance[center])center=i;
  selectionNeighbors(i,width,size,j=>{
   if(mask[j]&&!distance[j]){distance[j]=distance[i]+1;fifo[end++]=j;}
  });
 }
 const fg=selectionCosts(graph,keep.length?keep:center<0?[]:[center],mask);
 const bg=selectionCosts(graph,edge.concat(remove),mask);
 const result=new Int16Array(size);
 const corrections=keep.map(i=>[i,1]).concat(remove.map(i=>[i,-1]));
 for(let i=0;i<size;i++){
  if(!mask[i]){result[i]=-512;continue;}
  let score=bg[i]-fg[i];
  if(corrections.length&&score===0){
   let best=Infinity;
   for(const [point,sign] of corrections){
    const d=(point%width-i%width)**2+(Math.floor(point/width)-Math.floor(i/width))**2;
    if(d<best){best=d;score=sign;}
   }
   if(best>Math.max(4,(distance[center]||1)**2*.36))score=0;
  }
  result[i]=score;
 }
 for(const i of keep)result[i]=256;
 for(const i of remove)result[i]=-256;
 return result;
}
let selectionSource=null,selectionWorker=null,selectionJob=0;
function prepareSelection(){
 selectionJob++;
 selectionWorker?.terminate();selectionWorker=null;
 const ratio=Math.min(1,768/Math.max(bitmap.width,bitmap.height));
 const width=Math.max(2,Math.round(bitmap.width*ratio)),height=Math.max(2,Math.round(bitmap.height*ratio));
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const g=canvas.getContext('2d',{willReadFrequently:true});
 g.drawImage(bitmap,0,0,width,height);
 const raw=g.getImageData(0,0,width,height).data;
 selectionSource={width,height,raw,graph:null};
}
function requestSelection(kind,data,accept){
 const source=selectionSource,id=++selectionJob;
 if(!source)return;
 const fallback=()=>setTimeout(()=>{
  if(id!==selectionJob)return;
  source.graph??=selectionGraph(source.raw,source.width,source.height);
  accept(kind==='wand'?selectionCosts(source.graph,[data.seed],null,true):outlineCosts(source.graph,data.mask,data.keep,data.remove));
 },0);
 try{
  if(!selectionWorker){
   const script=[colorDistanceSquared,selectionNeighbors,selectionGraph,selectionCosts,outlineCosts].map(fn=>fn.toString()).join('\n')+`
   let graph;
   onmessage=({data:d})=>{
    if(d.raw){graph=selectionGraph(d.raw,d.width,d.height);return;}
    const map=d.kind==='wand'?selectionCosts(graph,[d.seed],null,true):outlineCosts(graph,d.mask,d.keep,d.remove);
    postMessage({id:d.id,map},[map.buffer]);
   };`;
   const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
   try{selectionWorker=new Worker(url);}finally{URL.revokeObjectURL(url);}
   selectionWorker.postMessage({width:source.width,height:source.height,raw:source.raw});
  }
  selectionWorker.onmessage=({data:reply})=>{if(reply.id===id&&id===selectionJob)accept(reply.map);};
  selectionWorker.onerror=()=>{selectionWorker?.terminate();selectionWorker=null;fallback();};
  selectionWorker.postMessage({id,kind,...data});
 }catch{
  selectionWorker?.terminate();selectionWorker=null;fallback();
 }
}
function selectionIndex(x,y){
 const {width,height}=selectionSource;
 return Math.min(height-1,Math.floor(y*height))*width+Math.min(width-1,Math.floor(x*width));
}
function selectionPreview(map,test){
 const {width,height}=selectionSource;
 const bits=new Uint8Array(TILE*TILE),canvas=document.createElement('canvas');
 canvas.width=canvas.height=TILE;
 const g=canvas.getContext('2d'),image=g.createImageData(TILE,TILE);
 let count=0;
 for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
  const i=y*TILE+x;
  const source=Math.floor((y+.5)*height/TILE)*width+Math.floor((x+.5)*width/TILE);
  if(!test(map[source]))continue;
  count++;bits[i]=1;
  const offset=i*4;
  image.data[offset]=39;image.data[offset+1]=227;
  image.data[offset+2]=181;image.data[offset+3]=125;
 }
 g.putImageData(image,0,0);
 return {bits,canvas,count};
}
function outlineMask(points){
 const {width,height}=selectionSource;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const g=canvas.getContext('2d',{willReadFrequently:true});
 g.beginPath();
 for(const [x,y] of points)g.lineTo(x*width,y*height);
 g.closePath();g.fill();
 const rgba=g.getImageData(0,0,width,height).data;
 return Uint8Array.from({length:width*height},(_,i)=>Number(rgba[i*4+3]>=128));
}

let wandMap=null,wandDraft=null,outlineDraft=null,lassoSegments=[],wandFrame=0;
let wandPreferredRange=Number($('toleranceInput').value);
function clearWandDraft(){
 if(mode==='wand')selectionJob++;
 cancelAnimationFrame(wandFrame);
 wandMap=wandDraft=null;
 $('wandApply').disabled=$('wandCancel').disabled=true;
 $('wandbar').classList.remove('hasPreview');
 $('wandStep').textContent='1. 그림에서 선택할 부분을 누르세요.';
}
function updateWandDraft(){
 if(!wandMap)return;
 const limit=2*Number($('toleranceInput').value);
 wandDraft=selectionPreview(wandMap,c=>c<=limit);
 $('wandbar').classList.add('hasPreview');
 $('wandStep').textContent='2. 범위를 조절한 뒤 선택을 적용하세요.';
 $('wandApply').disabled=!wandDraft.count;
 setStatus(wandDraft.count>wandDraft.bits.length*.92?'거의 전체가 잡혔습니다. 범위를 좁혀 보세요.':'미리보기입니다. 범위를 조절한 뒤 적용하세요.');
}
$('toleranceInput').addEventListener('input',()=>{
 wandPreferredRange=Number($('toleranceInput').value);
 cancelAnimationFrame(wandFrame);
 wandFrame=requestAnimationFrame(updateWandDraft);
});
$('wandCancel').onclick=()=>{clearWandDraft();setStatus('마술봉 미리보기를 취소했습니다.');};
$('wandApply').onclick=()=>{
 cancelAnimationFrame(wandFrame);updateWandDraft();
 if(wandDraft?.count&&appendRasterBits(wandDraft.bits,'마술봉 '+(zones.length+1))){
  clearWandDraft();setStatus('마술봉 선택을 적용했습니다.');
 }
};
function initialWandRange(map,requested){
 const histogram=new Uint32Array(256);
 for(const cost of map)if(cost<256)histogram[cost]++;
 let area=0;
 for(let c=0;c<=2*requested;c++){
  const jump=histogram[c];
  if(c>=4&&area>=Math.max(12,map.length*.002)&&jump>=Math.max(area*.9,map.length*.08)){
   return Math.max(2,Math.floor((c-1)/2));
  }
  area+=jump;
 }
 return requested;
}
function magicSelect(x,y){
 if(!selectionSource)return;
 clearWandDraft();$('wandCancel').disabled=false;
 $('wandStep').textContent='색과 경계를 확인하고 있습니다.';
 setStatus('주변의 색과 경계를 확인하고 있습니다.');
 requestSelection('wand',{seed:selectionIndex(x,y)},map=>{
  wandMap=map;
  const range=$('toleranceInput');
  range.value=initialWandRange(map,wandPreferredRange);
  $('toleranceValue').textContent=range.value;
  updateWandDraft();
 });
}
function clearOutlineDraft(){
 if(mode==='lasso')selectionJob++;
 outlineDraft=null;$('outlineControls').hidden=true;
}
function updateOutlineDraft(){
 const draft=outlineDraft;
 if(!draft?.map)return;
 const range=Number($('outlineRange').value);
 const bias=Math.sign(range)*Math.round(Math.abs(range)+232*(Math.abs(range)/24)**4);
 const threshold=(draft.hasBoundary?1:0)-bias;
 draft.preview=selectionPreview(draft.map,c=>c>=threshold);
 $('outlineApply').disabled=!draft.preview.count;
}
function solveOutline(){
 const draft=outlineDraft;
 draft.map=null;draft.preview=null;
 $('outlineApply').disabled=true;
 $('outlineStep').textContent='경계를 확인하고 있습니다.';
 setStatus('둘러싼 부분의 경계를 확인하고 있습니다.');
 requestSelection('outline',draft.data,map=>{
  if(outlineDraft!==draft)return;
  draft.map=map;
  draft.hasBoundary||=map.some(value=>value>1&&value<256);
  updateOutlineDraft();
  $('outlineStep').textContent='미리보기 · 범위를 조절하거나 보정한 뒤 적용하세요.';
  setStatus(draft.hasBoundary?'범위를 조절하거나 남길 곳과 뺄 곳을 눌러 보정하세요.':'경계가 약합니다. 남길 곳과 뺄 곳을 눌러 보정하거나 다시 둘러 그리세요.');
 });
}
function beginOutline(points){
 if(!selectionSource)return;
 const mask=outlineMask(points);
 if(!mask.includes(1)){setStatus('조금 더 넓게 둘러 그려 주세요.');return;}
 outlineDraft={data:{mask,keep:[],remove:[]},history:[],map:null,preview:null};
 $('outlineRange').value=0;$('outlineAction').value='draw';
 $('outlineUndo').disabled=true;
 $('outlineControls').hidden=false;solveOutline();
}
function correctOutline(x,y){
 const data=outlineDraft.data,i=selectionIndex(x,y);
 if(!data.mask[i]){setStatus('둘러싼 범위 안을 눌러 주세요.');return;}
 const target=$('outlineAction').value;
 if(data[target].length>=12){setStatus('적용 후 붓이나 지우개로 마무리해 주세요.');return;}
 outlineDraft.history.push({keep:data.keep.slice(),remove:data.remove.slice()});
 $('outlineUndo').disabled=false;
 data.keep=data.keep.filter(point=>point!==i);
 data.remove=data.remove.filter(point=>point!==i);
 data[target].push(i);solveOutline();
}
$('outlineRange').oninput=updateOutlineDraft;
$('outlineUndo').onclick=()=>{
 const previous=outlineDraft?.history.pop();
 if(!previous)return;
 Object.assign(outlineDraft.data,previous);
 $('outlineUndo').disabled=!outlineDraft.history.length;
 solveOutline();
};
$('outlineApply').onclick=()=>{
 const preview=outlineDraft?.preview;
 if(preview?.count&&appendRasterBits(preview.bits,'외곽 선택')){
  clearOutlineDraft();setStatus('외곽 선택을 적용했습니다.');
 }
};
$('outlineCancel').onclick=()=>{clearOutlineDraft();setStatus('외곽 미리보기를 취소했습니다.');};
function refreshLassoDraft(){
 $('lassoUndo').disabled=!lassoSegments.length;
 $('lassoFinish').disabled=lassoSegments.reduce((n,points)=>n+points.length,0)<3;
}
function clearSelectionDrafts(){
 clearWandDraft();clearOutlineDraft();lassoSegments=[];refreshLassoDraft();
}
$('lassoUndo').onclick=()=>{
 lassoSegments.pop();refreshLassoDraft();setStatus(lassoSegments.length?'표시된 끝점부터 이어 그려 주세요.':'새 경계를 그려 주세요.');
};
function finishSegmentedLasso(points=lassoSegments.flat()){
 if(points.length<3||addPolygon(points)===false)return;
 lassoSegments=[];refreshLassoDraft();setStatus('올가미 선택을 적용했습니다.');
}
$('lassoFinish').onclick=()=>finishSegmentedLasso();
$('lassoSegments').onchange=()=>{
 clearOutlineDraft();
 lassoSegments=[];refreshLassoDraft();
 if($('lassoSegments').checked)$('encloseInput').checked=false;
 setStatus($('lassoSegments').checked?'구간을 그리고 손을 떼세요. 표시된 끝점부터 이어 그릴 수 있습니다.':'한 획으로 둘러 그려 주세요.');
};
$('encloseInput').onchange=()=>{
 clearOutlineDraft();
 if(!$('encloseInput').checked)return;
 $('lassoSegments').checked=false;lassoSegments=[];refreshLassoDraft();
};
function computeEdge(){if(!bitmap)return;prepareSelection();const c=document.createElement('canvas');c.width=c.height=TILE;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,0,0,TILE,TILE);imagePixels=g.getImageData(0,0,TILE,TILE).data;const gray=new Float32Array(TILE*TILE),edge=new Float32Array(TILE*TILE);for(let i=0;i<gray.length;i++){const j=i*4;gray[i]=imagePixels[j]*.299+imagePixels[j+1]*.587+imagePixels[j+2]*.114}for(let y=1;y<TILE-1;y++)for(let x=1;x<TILE-1;x++){const i=y*TILE+x;const ax=-gray[i-TILE-1]-2*gray[i-1]-gray[i+TILE-1]+gray[i-TILE+1]+2*gray[i+1]+gray[i+TILE+1];const ay=-gray[i-TILE-1]-2*gray[i-TILE]-gray[i-TILE+1]+gray[i+TILE-1]+2*gray[i+TILE]+gray[i+TILE+1];edge[i]=Math.min(255,Math.hypot(ax,ay)*.27)}edgeScores=edge}
function magnetPoint(p){
 const level=Number($('magnetInput').value)/100;
 if(!edgeScores||level<.05)return null;
 const x0=clamp(Math.floor(p.x*TILE),1,TILE-2),y0=clamp(Math.floor(p.y*TILE),1,TILE-2);
 const rect=overlay.getBoundingClientRect();
 const radius=Math.ceil(clamp((8+level*20)*TILE/Math.max(1,Math.min(rect.width,rect.height)),3,22));
 const threshold=34-level*13;
 let best=0,point=null;
 for(let y=Math.max(1,y0-radius);y<=Math.min(TILE-2,y0+radius);y++){
  for(let x=Math.max(1,x0-radius);x<=Math.min(TILE-2,x0+radius);x++){
   const distance=Math.hypot(x-x0,y-y0);
   const edge=edgeScores[y*TILE+x];
   if(distance>radius||edge<threshold)continue;
   const score=Math.min(125,edge)-threshold-(distance/radius)*(42-level*18);
   if(score>best){best=score;point=[x/TILE,y/TILE]}
  }
 }
 return point;
}
// Edge-following magnetic scissors. A bounded shortest-path search connects consecutive finger samples.
function magneticPath(from,to,previousPoint){
 const strength=Number($('magnetInput').value)/100;
 if(!edgeScores||strength<.045)return [[to.x,to.y]];
 const a=magnetPoint(from),b=magnetPoint(to);
 if(!a||!b)return [[to.x,to.y]];
 const startPoint=previousPoint||a;
 const sx=clamp(Math.round(startPoint[0]*TILE),1,TILE-2),sy=clamp(Math.round(startPoint[1]*TILE),1,TILE-2),tx=clamp(Math.round(b[0]*TILE),1,TILE-2),ty=clamp(Math.round(b[1]*TILE),1,TILE-2);
 if(sx===tx&&sy===ty)return [];
 const pad=Math.round(3+strength*6),x0=Math.max(1,Math.min(sx,tx)-pad),x1=Math.min(TILE-2,Math.max(sx,tx)+pad),y0=Math.max(1,Math.min(sy,ty)-pad),y1=Math.min(TILE-2,Math.max(sy,ty)+pad),ww=x1-x0+1,hh=y1-y0+1,size=ww*hh;
 if(size>13500)return [[to.x,to.y]];
 const start=(sy-y0)*ww+sx-x0,goal=(ty-y0)*ww+tx-x0;
 const cost=new Float32Array(size);cost.fill(Infinity);
 const previous=new Int32Array(size);previous.fill(-1);const visited=new Uint8Array(size);
 const heap=[];
 const push=(idx,rank)=>{let n=heap.length;heap.push([idx,rank]);while(n){let p=(n-1)>>1;if(heap[p][1]<=rank)break;heap[n]=heap[p];n=p}heap[n]=[idx,rank]};
 const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1][1]<heap[c][1])c++;if(heap[c][1]>=last[1])break;heap[i]=heap[c];i=c}heap[i]=last}return first};
 const diag=Math.hypot(tx-sx,ty-sy)||1,neighbors=[[-1,0,1],[1,0,1],[0,-1,1],[0,1,1],[-1,-1,1.414],[1,-1,1.414],[-1,1,1.414],[1,1,1.414]];
 cost[start]=0;push(start,0);let steps=0,found=false;
 while(heap.length&&steps++<17000){const [cur]=pop();if(visited[cur])continue;visited[cur]=1;if(cur===goal){found=true;break}
  const yy=(cur/ww)|0,xx=cur%ww;
  for(const [dx,dy,dist] of neighbors){const nx=xx+dx,ny=yy+dy;if(nx<0||ny<0||nx>=ww||ny>=hh)continue;const next=ny*ww+nx;if(visited[next])continue;
   const X=x0+nx,Y=y0+ny,gradient=clamp((edgeScores[Y*TILE+X]||0)/140,0,1);
   const lateral=Math.abs((X-sx)*(ty-sy)-(Y-sy)*(tx-sx))/diag;
   const edgePenalty=1+strength*4.5*(1-gradient);
   const corridorPenalty=(lateral/pad)**2*3;
   const candidate=cost[cur]+dist*(edgePenalty+corridorPenalty);
   if(candidate<cost[next]){cost[next]=candidate;previous[next]=cur;push(next,candidate)}}
 }
 if(!found)return [[to.x,to.y]];
 const path=[];let cursor=goal;for(let i=0;i<3000&&cursor>=0;i++){const xx=cursor%ww,yy=(cursor/ww)|0;path.push([(x0+xx)/TILE,(y0+yy)/TILE]);if(cursor===start)break;cursor=previous[cursor]}
 path.reverse();
 const stepsOnEdge=path.filter(([x,y])=>edgeScores[Math.round(y*TILE)*TILE+Math.round(x*TILE)]>=26).length;
 if(stepsOnEdge<path.length*.65||path.length>diag*1.8+3)return [[to.x,to.y]];
 return path.slice(1).filter((p,i,steps)=>{
  const next=steps[i+1],prev=path[i];
  return !next||Math.abs((p[0]-prev[0])*(next[1]-p[1])-(p[1]-prev[1])*(next[0]-p[0]))>1e-8;
 });
}
function extendLasso(gesture,p,minDistance=Math.max(4,Math.min(renderWidth,renderHeight)*.012)){
 const distance=pixelDistance(gesture.last,p);
 if(distance<minDistance||distance===0||gesture.points.length>=2500)return;
 const points=gesture.enclose?[[p.x,p.y]]:magneticPath(gesture.last,p,gesture.points.at(-1));
 gesture.points.push(...points.slice(0,2500-gesture.points.length));
 gesture.last=p;
}
function addPolygon(pts){if(pts.length<3)return;if($('appendInput').checked&&getSelected()&&!getSelected().locked){const temp=sanitize({kind:'polygon',polygon:pts},zones.length);const bits=rasterize(temp);return appendRasterBits(bits,'추가 영역')}if(zones.length>=LIMIT){setStatus('영역 개수 제한입니다.');return false}remember();const z=sanitize({id:newId(),name:`올가미 ${zones.length+1}`,kind:'polygon',polygon:pts},zones.length);zones.push(z);selected=z.id;$('appendInput').checked=true;markMask();updateUI();scheduleSave()}

