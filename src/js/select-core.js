// 선택 계산(화면과 무관한 순수 함수). 앱과 측정 도구(tools/select/bench.js)가 함께 쓴다.
// 이 파일에는 DOM·전역 상태를 쓰지 않는다. 작업 스레드(worker)에도 함수 원문이 그대로 복사된다.
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
 return {width,height,right,down,raw,ridge:lineArtMask(raw,width,height)};
}
// 선화(가는 어두운 줄): 어느 한 방향으로 양옆 2~3칸이 모두 확연히 밝은 픽셀.
// 마술봉은 선화에 들어갈 수는 있어도 거기서 더 퍼지지 않는다 → 자기 외곽선까지만 잡고 선을 타고 번지지 않는다.
function lineArtMask(raw,width,height){
 const size=width*height,light=new Float32Array(size),ridge=new Uint8Array(size);
 for(let i=0;i<size;i++)light[i]=.3*raw[i*4]+.59*raw[i*4+1]+.11*raw[i*4+2];
 const dirs=[[1,0],[0,1],[1,1],[1,-1]];
 for(let y=3;y<height-3;y++)for(let x=3;x<width-3;x++){
  const i=y*width+x,v=light[i]+28;
  for(const [dx,dy] of dirs){
   let hit=false;
   for(let d=2;d<=3&&!hit;d++){
    const a=light[i-(dy*width+dx)*d],b=light[i+(dy*width+dx)*d];
    hit=a>v&&b>v;
   }
   if(hit){ridge[i]=1;break;}
  }
 }
 return ridge;
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
 // 마술봉: 누른 곳이 선화가 아니면, 선화 픽셀에서 더 퍼지려면 '선 넘기 비용'(범위 36 이상)이 든다.
 // 기본 범위에서는 자기 외곽선까지만 잡고, 범위를 넓히면 선 너머의 비슷한 색까지 포함한다(색 차이 기준은 그대로).
 const leaf=seedColor&&graph.ridge&&!graph.ridge[seed]?graph.ridge:null,CROSS=72;
 for(let c=0;c<256;c++)while(head[c]>=0){
  const i=head[c];head[c]=next[i];if(head[c]>=0)prev[head[c]]=-1;
  const floor=leaf&&leaf[i]&&c?Math.max(c,CROSS):c;
  selectionNeighbors(i,width,size,j=>{
   if(costs[j]<=c||(mask&&!mask[j]))return;
   const edge=j===i+1?right[i]:j===i-1?right[j]:j>i?down[i]:down[j];
   const color=seedColor?Math.min(255,Math.round(1.4*Math.sqrt(colorDistanceSquared(raw,seed,j,.56)))):0;
   const rank=Math.max(floor,edge,color);
   if(rank<costs[j])queue(j,rank);
  });
 }
 return costs;
}
// 간략 범위지정(1-A): 둘러싼 테두리에서 흔한 색 = 배경. 배경에서 강한 경계를 넘어야 닿는 곳 = 대상.
// 결과 점수 = 배경으로부터의 장벽 - 자동 기준값. 0보다 크면 대상(앱의 범위 슬라이더가 기준값을 옮긴다).
// 테두리가 가로지른 소수의 색(꼬리 뿌리, 선화)은 배경 씨앗에서 뺀다 → 둘러싼 부위가 잘려 나가지 않는다.
function outlineBackgroundSeeds(raw,width,edge){
 // 테두리 픽셀을 따라가며 색이 이어지는 구간끼리 묶는다. 긴 구간(또는 그와 같은 색) = 배경.
 // 올가미가 물체를 가로지른 짧은 구간(꼬리 뿌리, 머리카락, 선화)은 배경 씨앗에서 빠진다.
 const n=edge.length,index=new Map(),parent=Int32Array.from({length:n},(_,k)=>k);
 edge.forEach((p,k)=>index.set(p,k));
 const find=k=>{while(parent[k]!==k)k=parent[k]=parent[parent[k]];return k};
 const close=(a,b)=>4*Math.sqrt(colorDistanceSquared(raw,a,b))<48;
 for(let k=0;k<n;k++){
  const p=edge[k];
  for(const q of [p+1,p+width-1,p+width,p+width+1]){
   const m=index.get(q);
   if(m!==undefined&&Math.abs(q%width-p%width)<=1&&close(p,q))parent[find(k)]=find(m);
  }
 }
 const groups=new Map();
 for(let k=0;k<n;k++){const r=find(k);let g=groups.get(r);if(!g)groups.set(r,g={members:[],sum:[0,0,0,0]});g.members.push(edge[k]);for(let c=0;c<4;c++)g.sum[c]+=raw[edge[k]*4+c];}
 const list=[...groups.values()].sort((x,y)=>y.members.length-x.members.length);
 const mean=g=>g.sum.map(v=>v/g.members.length);
 const major=list.filter((g,k)=>!k||g.members.length>=n*.1).map(mean);
 const near=(m,c)=>{const d=[0,1,2,3].map(k=>m[k]-c[k]),l=.3*d[0]+.59*d[1]+.11*d[2];return 4*Math.sqrt(.3*(d[0]-l)**2+.59*(d[1]-l)**2+.11*(d[2]-l)**2+l*l+.25*d[3]*d[3])<48};
 const seeds=[];
 for(const g of list){const m=mean(g);if(major.some(c=>near(m,c)))seeds.push(...g.members);}
 return seeds;
}
// 장벽 값별 넓이 곡선에서 가장 평평한(안정된) 지점을 고른다: 배경 잡티는 넘고, 대상의 경계는 넘지 않는 값.
function stableBarrier(costs,mask){
 const hist=new Float64Array(258);let total=0;
 for(let i=0;i<costs.length;i++)if(mask[i]){hist[Math.min(256,costs[i])]++;total++;}
 const above=new Float64Array(258);// above[t] = 장벽 ≥ t 인 넓이
 for(let t=256;t>=0;t--)above[t]=above[t+1]+hist[t];
 const w=6,minArea=Math.max(30,total*.005);
 let best=-1,bestScore=Infinity;
 for(let t=w+2;t<=220;t++){
  const area=above[t];
  if(area<minArea||area>total*.97)continue;
  const score=(above[t-w]-above[t+w])/area;
  if(score<.03)return t;// 잡티를 넘은 뒤 처음 평평해지는 곳(가장 낮은 안정점)
  if(score<bestScore){bestScore=score;best=t;}
 }
 return best<0?32:best;
}
function outlineCosts(graph,mask,keep,remove){
 const {width,right,raw}=graph,size=right.length;
 const edge=[];
 for(let i=0;i<size;i++){
  if(!mask[i])continue;
  if(i%width===0||i%width===width-1||i<width||i>=size-width||
     !mask[i-1]||!mask[i+1]||!mask[i-width]||!mask[i+width])edge.push(i);
 }
 const seeds=outlineBackgroundSeeds(raw,width,edge);
 const bg=selectionCosts(graph,(seeds.length?seeds:edge).concat(remove),mask);
 const level=stableBarrier(bg,mask);
 // 올가미가 가로지른 부위: 테두리 전체를 배경으로 볼 때만 배경이 되는 덩어리.
 // 닿은 길이가 크기에 비해 짧으면(꼬리 뿌리처럼 목만 잘림) 남기고, 길면(옷 옆면이 썰림) 뺀다.
 const cutAll=seeds.length<edge.length?selectionCosts(graph,edge.concat(remove),mask):bg;
 const drop=new Uint8Array(size);
 if(cutAll!==bg){
  const isEdge=new Uint8Array(size);for(const i of edge)isEdge[i]=1;
  const seen=new Uint8Array(size),stack=[];
  for(let i=0;i<size;i++){
   if(seen[i]||!mask[i]||bg[i]<=level||cutAll[i]>level)continue;
   const part=[];let contact=0;seen[i]=1;stack.push(i);
   while(stack.length){
    const p=stack.pop();part.push(p);contact+=isEdge[p];
    selectionNeighbors(p,width,size,q=>{if(!seen[q]&&mask[q]&&bg[q]>level&&cutAll[q]<=level){seen[q]=1;stack.push(q);}});
   }
   if(contact>Math.sqrt(part.length))for(const p of part)drop[p]=1;
  }
 }
 const fg=keep.length?selectionCosts(graph,keep,mask):null;
 const result=new Int16Array(size);
 for(let i=0;i<size;i++){
  if(!mask[i]){result[i]=-512;continue;}
  let score=Math.max(-255,Math.min(255,(drop[i]?cutAll[i]:bg[i])-level));
  if(fg&&fg[i]<bg[i])score=Math.max(score,bg[i]-fg[i]);// 남길 곳: 배경보다 그 점에 가까운 곳을 더한다
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
function wandLimit(range){return Math.min(255,2*range)}// 256 = 선화에 막혀 닿지 못한 곳(어떤 범위로도 잡지 않음)
// 간략 범위지정: 범위 슬라이더 값(-24~24) → 점수 하한(이상이면 선택)
function outlineThreshold(range,hasBoundary){
 const bias=Math.sign(range)*Math.round(Math.abs(range)+232*(Math.abs(range)/24)**4);
 return (hasBoundary?1:0)-bias;
}
// 작업 스레드(worker)에 원문을 복사할 함수들
const SELECT_CORE=[colorDistanceSquared,selectionNeighbors,selectionGraph,lineArtMask,selectionCosts,outlineBackgroundSeeds,stableBarrier,outlineCosts];
