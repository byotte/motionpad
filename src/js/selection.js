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
   const script=SELECT_CORE.map(fn=>fn.toString()).join('\n')+`
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
// 고르는 중인 범위(마술봉·간략 범위지정)의 테두리. 처음 그릴 때 한 번만 뽑는다.
function draftContour(d){return d.contour||(d.contour=maskContour(i=>d.bits[i]?255:0))}
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
// 3-M: '적용' 버튼 없이 고른 범위를 곧바로 영역에 반영한다. 범위를 다시 조절하면 방금 반영을 걷어내고 새로 반영한다(되돌리기 기록은 한 칸).
// draftCommit = {base: 반영 전 상태, after: 반영 후 상태}. 그 사이 다른 조작이 있었으면(after와 다르면) 초안은 끝난 것으로 본다.
let draftCommit=null;
function draftLive(){return !!draftCommit&&stateSnapshot()===draftCommit.after}
function commitDraft(bits){
 const again=draftLive(),base=again?draftCommit.base:stateSnapshot();
 if(again)historyApply(base);
 const ok=applySelectionBits(bits);
 if(ok){draftCommit={base,after:stateSnapshot()}}
 else{draftCommit=null;if(again&&undoStack.at(-1)===base){undoStack.pop();refreshHistory()}}
 return ok;
}
// 방금 반영한 선택을 걷어낸다('취소')
function revertDraft(){if(!draftLive()){draftCommit=null;return false}historyApply(draftCommit.base);if(undoStack.at(-1)===draftCommit.base)undoStack.pop();draftCommit=null;refreshHistory();return true}
let wandPreferredRange=Number($('toleranceInput').value);
function clearWandDraft(){
 if(mode==='wand')selectionJob++;
 cancelAnimationFrame(wandFrame);
 wandMap=wandDraft=null;draftCommit=null;
 $('wandCancel').disabled=true;
 $('wandbar').classList.remove('hasPreview');
 $('wandStep').textContent='1. 그림에서 선택할 부분을 누르세요.';
}
function updateWandDraft(){
 if(!wandMap)return;
 const limit=wandLimit(Number($('toleranceInput').value));
 wandDraft=selectionPreview(wandMap,c=>c<=limit);
 $('wandbar').classList.add('hasPreview');$('wandbar').dataset.ready='1';// 시험 도구가 기다리는 신호
 if(!wandDraft.count){setStatus('선택된 부분이 없습니다. 선택 범위를 넓혀 보세요.');return}
 if(!commitDraft(wandDraft.bits)){clearWandDraft();return}// 반영하지 못한 이유는 안내줄에 이미 나와 있다
 setStatus(wandDraft.count>wandDraft.bits.length*.92?'거의 전체가 잡혔습니다. 선택 범위를 좁혀 보세요.':'선택했습니다. 선택 범위를 조절하면 바로 바뀝니다.');
}
$('toleranceInput').addEventListener('input',()=>{
 wandPreferredRange=Number($('toleranceInput').value);
 cancelAnimationFrame(wandFrame);
 wandFrame=requestAnimationFrame(updateWandDraft);
});
$('wandCancel').onclick=()=>{revertDraft();clearWandDraft();setStatus('방금 마술봉 선택을 취소했습니다.');};
function magicSelect(x,y){
 if(!selectionSource)return;
 clearWandDraft();$('wandCancel').disabled=false;$('wandbar').dataset.ready='0';
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
// 3-M: 자잘한 점 걸러내기. 가장 큰 덩어리의 2%(최소 6칸)보다 작은 조각은 버린다. '남길 곳'으로 찍은 점(256)이 든 조각은 남긴다.
function despeckle(preview){
 const bits=preview.bits,n=TILE,label=new Int32Array(bits.length),sizes=[0],stack=[];let id=0,best=0;
 for(let i=0;i<bits.length;i++){if(!bits[i]||label[i])continue;let cnt=0;label[i]=++id;stack.push(i);
  while(stack.length){const q=stack.pop(),x=q%n;cnt++;
   if(x>0&&bits[q-1]&&!label[q-1]){label[q-1]=id;stack.push(q-1)}if(x<n-1&&bits[q+1]&&!label[q+1]){label[q+1]=id;stack.push(q+1)}
   if(q>=n&&bits[q-n]&&!label[q-n]){label[q-n]=id;stack.push(q-n)}if(q<bits.length-n&&bits[q+n]&&!label[q+n]){label[q+n]=id;stack.push(q+n)}}
  sizes.push(cnt);best=Math.max(best,cnt)}
 if(id<2)return;
 const min=Math.max(6,best*.02);let removed=0;
 for(let i=0;i<bits.length;i++)if(bits[i]&&sizes[label[i]]<min){bits[i]=0;removed++}
 if(!removed)return;
 preview.count-=removed;preview.contour=null;
 const g=preview.canvas.getContext('2d'),image=g.getImageData(0,0,n,n);for(let i=0;i<bits.length;i++)if(!bits[i])image.data[i*4+3]=0;g.putImageData(image,0,0);
}
function clearOutlineDraft(){
 if(mode==='lasso')selectionJob++;
 outlineDraft=null;draftCommit=null;$('outlineControls').hidden=true;
}
function updateOutlineDraft(){
 const draft=outlineDraft;
 if(!draft?.map)return;
 const threshold=outlineThreshold(Number($('outlineRange').value),draft.hasBoundary,draft.span);
 draft.preview=selectionPreview(draft.map,c=>c>=threshold);despeckle(draft.preview);
 $('outlineRangeValue').textContent=$('outlineRange').value;$('outlineControls').dataset.ready='1';// 시험 도구가 기다리는 신호
 if(draft.preview.count&&!commitDraft(draft.preview.bits)){clearOutlineDraft();return false}
 return true;
}
function solveOutline(){
 const draft=outlineDraft;
 draft.map=null;draft.preview=null;$('outlineControls').dataset.ready='0';
 $('outlineStep').textContent='경계를 확인하고 있습니다.';
 setStatus('둘러싼 부분의 경계를 확인하고 있습니다.');
 requestSelection('outline',draft.data,map=>{
  if(outlineDraft!==draft)return;
  draft.map=map;
  draft.hasBoundary||=map.some(value=>value>1&&value<256);
  // 3-M: 선택 범위 막대의 양 끝을 이 그림의 점수 범위에 맞춘다(막대 어디서나 고르게 변하도록)
  let lo=0,hi=1;for(const v of map){if(v<=-512||v>=256||v<=-256)continue;if(v<lo)lo=v;if(v>hi)hi=v}draft.span=[lo,hi];
  if(!updateOutlineDraft())return;
  setStatus(draft.hasBoundary?'선택했습니다. 선택 범위를 조절하거나 남길 곳·뺄 곳을 눌러 다듬을 수 있습니다.':'경계가 약한 그림입니다. 선택 범위를 조절하거나 남길 곳·뺄 곳을 눌러 다듬어 주세요.');
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
let outlineFrame=0;$('outlineRange').oninput=()=>{$('outlineRangeValue').textContent=$('outlineRange').value;cancelAnimationFrame(outlineFrame);outlineFrame=requestAnimationFrame(updateOutlineDraft)};
$('outlineUndo').onclick=()=>{
 const previous=outlineDraft?.history.pop();
 if(!previous)return;
 Object.assign(outlineDraft.data,previous);
 $('outlineUndo').disabled=!outlineDraft.history.length;
 solveOutline();
};
$('outlineCancel').onclick=()=>{revertDraft();clearOutlineDraft();setStatus('방금 올가미 선택을 취소했습니다.');};
function refreshLassoDraft(){
 $('lassoUndo').disabled=!lassoSegments.length;refreshHistory();
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
function addPolygon(pts){if(pts.length<3)return;
 if(editableSelected()||selectOp()==='subtract'){const temp=sanitize({kind:'polygon',polygon:pts},zones.length);return applySelectionBits(rasterize(temp),'올가미 '+(zones.length+1))}
 if(zones.length>=LIMIT){setStatus('영역 개수 제한입니다.');return false}remember();const z=sanitize({id:newId(),name:nextZoneName(),kind:'polygon',polygon:pts},zones.length);zones.push(z);selected=z.id;markMask();updateUI();scheduleSave()}

// 3-M: 교체·더하기·빼기를 바꾸면 방금 선택은 끝난 것으로 본다(이미 반영돼 있다). 다음 선택이 새 방식으로 들어간다.
for(const r of document.querySelectorAll('input[name="selectOp"]'))r.addEventListener('change',()=>clearSelectionDrafts());
