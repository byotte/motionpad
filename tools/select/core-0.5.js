// 1-A 이전(0-5 시점) 선택 계산 함수. 측정 비교 기준용으로만 쓴다(앱에는 들어가지 않음).
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
// 마술봉: 범위 슬라이더 값 → 비용 상한(이하이면 선택)
function wandLimit(range){return 2*range}
// 간략 범위지정: 범위 슬라이더 값(-24~24) → 점수 하한(이상이면 선택)
function outlineThreshold(range,hasBoundary){
 const bias=Math.sign(range)*Math.round(Math.abs(range)+232*(Math.abs(range)/24)**4);
 return (hasBoundary?1:0)-bias;
}
