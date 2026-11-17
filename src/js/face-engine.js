// 얼굴 표정 엔진(설계 §5·§8): 픽셀 유동화. 얼굴 기준점(눈썹·윗/아랫눈꺼풀·입)을 밀면 둘레가 부드럽게 따라온다.
// 얼굴마다 G×G '얼굴 지도'(이동량)를 CPU가 만들고, 셰이더는 텍스처 1장(8번째 슬롯)에서 읽는다. 얼굴 k = 지도의 k번째 칸.
// 이동량은 표정 값에 비례(기준 지도 × 값의 합)라, 값이 바뀌어도 기준 지도는 다시 만들지 않는다.
const FACE_G=192;
let faceLive=null;// 지금 보일 표정 {k,id,amount}. 2단계: 표정 창이 열린 동안만(영역에서 쓰는 것은 4단계)
let faceLastActive=[],faceTexStyles=null,faceTexSig='',faceGeomCache=[],faceTexDirty=true,faceTexBytes=null,faceTex=null,faceTexCount=0,faceTexRects=null,faceSrc=null;
function faceChanged(geometry=true){if(geometry)faceGeomCache=[];faceTexDirty=true}
const fv={
 sub:(a,b)=>({x:a.x-b.x,y:a.y-b.y}),add:(a,b)=>({x:a.x+b.x,y:a.y+b.y}),mul:(a,k)=>({x:a.x*k,y:a.y*k}),
 mid:(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2}),dot:(a,b)=>a.x*b.x+a.y*b.y,len:a=>Math.hypot(a.x,a.y),
 norm:a=>{const l=Math.hypot(a.x,a.y)||1;return {x:a.x/l,y:a.y/l}},
};
const facePx=p=>({x:p.x*renderWidth,y:p.y*renderHeight});
// 세 점(시작·가운데·끝)을 지나는 곡선을 점 n개로. t = 0(앞) ~ 1(뒤)
function faceQuad(a,m,b,n=24){const c=fv.sub(fv.mul(m,2),fv.mid(a,b));return Array.from({length:n+1},(_,i)=>{const t=i/n,u=1-t;return {x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y,t}})}
function faceLine(pts){let total=0;const d=[0];for(let i=1;i<pts.length;i++){total+=fv.len(fv.sub(pts[i],pts[i-1]));d.push(total)}return pts.map((p,i)=>({x:p.x,y:p.y,t:total?d[i]/total:0}))}
// 얼굴 k의 모양: 방향(u = 화면 오른쪽 쪽 눈 선, n = 위), 크기 S, 곡선마다 휘는 범위와 조절 항목
function faceGeometry(k){
 const key=`${renderWidth}x${renderHeight}`;
 if(faceGeomCache[k]?.key===key)return faceGeomCache[k];
 const f=faces[k]||blankFace();
 const eyes=[blinkEyes[k*2],blinkEyes[k*2+1]].filter(Boolean).map(e=>{const [a,b,up,lo]=e.points.map(facePx);return {a,b,up,lo,c:fv.mid(a,b),w:fv.len(fv.sub(a,b)),h:Math.max(2,fv.len(fv.sub(up,lo)))}}).sort((p,q)=>p.c.x-q.c.x);
 const m=f.mouth&&{l:facePx(f.mouth.l),r:facePx(f.mouth.r),c:facePx(f.mouth.c)};
 let u=eyes.length===2?fv.norm(fv.sub(eyes[1].c,eyes[0].c)):eyes.length?fv.norm(fv.sub(eyes[0].b,eyes[0].a)):m?fv.norm(fv.sub(m.r,m.l)):{x:1,y:0};
 if(u.x<0)u=fv.mul(u,-1);
 const n={x:u.y,y:-u.x};// 위쪽(화면 y는 아래로 커진다)
 const eyeMid=eyes.length===2?fv.mid(eyes[0].c,eyes[1].c):eyes[0]?.c;
 const C=eyeMid||m?.c||{x:renderWidth/2,y:renderHeight/2};
 const S=Math.max(12,eyeMid&&m?fv.len(fv.sub(m.c,eyeMid)):eyes.length===2?fv.len(fv.sub(eyes[1].c,eyes[0].c))*.9:eyes.length?eyes[0].w*1.8:m?fv.len(fv.sub(m.r,m.l))*1.6:60);
 eyes.forEach((e,i)=>{e.side=eyes.length===2?(i?'R':'L'):m?(fv.dot(fv.sub(e.c,m.c),u)<0?'L':'R'):'L'});
 const curves=[],amps={};
 const ctrl=(key,hat,dir,pos,neg)=>{amps[key]={pos,neg};return {key,hat,dir}};
 const brows=f.brows.map(line=>line.map(facePx));
 let hasBrow=false;
 for(const e of eyes){
  const s=e.side,sign=s==='L'?1:-1;// 앞(가운데 쪽) = L 눈은 u 방향, R 눈은 반대
  const [inner,outer]=fv.dot(e.a,u)*sign>fv.dot(e.b,u)*sign?[e.a,e.b]:[e.b,e.a];e.inner=inner;e.outer=outer;
  // 눈썹: 이 눈에 가장 가까운 선. 앞머리 = 가운데 쪽 끝
  let brow=null,best=Infinity;
  for(const line of brows){const mid=line[Math.floor(line.length/2)],d=fv.len(fv.sub(mid,e.c));if(d<best&&fv.dot(fv.sub(mid,e.c),n)>0){best=d;brow=line}}
  const browGap=brow?Math.max(e.h*.3,fv.len(fv.sub(brow[Math.floor(brow.length/2)],e.up))):e.w*.6;
  if(brow){
   hasBrow=true;
   const ordered=fv.dot(brow[0],u)*sign>fv.dot(brow.at(-1),u)*sign?brow:[...brow].reverse();
   // 위로는 이마까지 넓게, 아래로는 눈두덩까지만(눈은 움직이지 않게)
   // 눈썹 굵기만큼(core)은 통째로 움직여 눈썹이 구불거리지 않게 한다
   // 아래로는 눈썹~윗꺼풀 거리의 55%까지만 휜다(윗꺼풀 쪽 45%는 그대로) → 눈두덩만 끌려오고 윗꺼풀 선은 안 딸려 온다
   const core=.22*browGap,rUp=.55*S,rDown=.55*browGap;
   curves.push({pts:faceLine(ordered),rUp,rDown,core,ctrls:[0,1,2].map(h=>ctrl(`${s}.${['bh','bm','bt'][h]}`,h,n,.12*S,Math.min(.1*S,.6*(rDown-core))))});
  }
  // 윗눈꺼풀: 위로는 눈두덩, 아래로는 눈 높이 절반까지만 → 내리면 눈 위쪽이 덮인다
  {const rUp=Math.min(.6*browGap,.5*e.w),rDown=.55*e.h;
   curves.push({pts:faceQuad(inner,e.up,outer),rUp,rDown,ctrls:[0,1,2].map(h=>ctrl(`${s}.${['uf','um','ub'][h]}`,h,n,Math.min(.35*e.h,.6*rUp),.6*rDown))})}
  {const rUp=.55*e.h,rDown=.25*e.w;
   curves.push({pts:faceQuad(inner,e.lo,outer),rUp,rDown,ctrls:[0,1,2].map(h=>ctrl(`${s}.${['lf','lm','lb'][h]}`,h,n,.6*rUp,Math.min(.3*e.h,.6*rDown)))})}
 }
 if(m){
  const half=fv.len(fv.sub(m.r,m.l))/2,r=.6*half+.04*S,amp=Math.min(.07*S,.55*r);
  curves.push({pts:faceQuad(m.l,m.c,m.r),rUp:r,rDown:r,ctrls:[
   ctrl('L.mc',0,n,amp,amp),ctrl('R.mc',2,n,amp,amp),
   ctrl('L.mn',0,fv.mul(u,-1),Math.min(.3*half,.55*r),Math.min(.3*half,.55*r)),ctrl('R.mn',2,u,Math.min(.3*half,.55*r),Math.min(.3*half,.55*r)),
   ctrl('mm',1,n,Math.min(.05*S,.55*r),Math.min(.05*S,.55*r))]});
 }
 // 5단계 뺨 자리 추정(설계 §7, 입력 없이 눈·입으로): 눈 너비 비율 = 고개 돌림, 눈 선 기울기 = 고개 기울기, 눈 크기/눈~입 거리 = 그림체(SD일수록 크고 둥글고 낮게).
 // 양쪽 뺨은 코 자리(입 가운데에서 눈 선과 직각인 선)를 넘지 않고, 눈 바깥 끝을 넘지 않는다.
 const sd=eyes.length?clamp((eyes.reduce((a,e)=>a+e.h,0)/eyes.length/S-.2)/.4,0,1):0;
 const wMax=Math.max(1,...eyes.map(e=>e.w)),noseS=fv.dot(m?m.c:C,u),cheeks=[];
 for(const e of eyes){
  const outward=e.side==='L'?-1:1,corner=m?(e.side==='L'?m.l:m.r):null;
  const down=corner?Math.max(e.h*.4,fv.dot(fv.sub(corner,e.lo),fv.mul(n,-1))):e.w*.9;
  const turn=e.w/wMax;
  let rx=e.w*(.45+.15*sd)*(.55+.45*turn),c=fv.add(fv.add(e.lo,fv.mul(n,-down*(.3+.25*sd))),fv.mul(u,outward*e.w*(.25-.2*sd)*turn));
  const ends=[fv.dot(e.a,u),fv.dot(e.b,u)],outer=outward<0?Math.min(...ends):Math.max(...ends);
  const lo=Math.min(noseS+outward*e.w*.12,outer),hi=Math.max(noseS+outward*e.w*.12,outer);
  rx=Math.max(3,Math.min(rx,(hi-lo)/2));
  const cs=clamp(fv.dot(c,u),lo+rx,hi-rx);c=fv.add(c,fv.mul(u,cs-fv.dot(c,u)));
  cheeks.push({c,rx,ry:rx*(.55+.15*sd),side:e.side});
 }
 const ears=(f.ears||[]).map(line=>line.map(facePx)),earW=Math.max(3,.05*S);
 const autoStyle=sd>.6?'manga':sd<.25?'fine':'grad',style=f.blushStyle&&f.blushStyle!=='auto'?f.blushStyle:autoStyle;
 // 지도 범위: 모든 곡선 + 휘는 범위 + 뺨 + 귀
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const cv of curves){const R=Math.max(cv.rUp,cv.rDown)+2;for(const p of cv.pts){x0=Math.min(x0,p.x-R);y0=Math.min(y0,p.y-R);x1=Math.max(x1,p.x+R);y1=Math.max(y1,p.y+R)}}
 for(const ch of cheeks){const R=ch.rx*1.3*2+2;x0=Math.min(x0,ch.c.x-R);y0=Math.min(y0,ch.c.y-R);x1=Math.max(x1,ch.c.x+R);y1=Math.max(y1,ch.c.y+R)}
 for(const line of ears)for(const p of line){const R=earW*2;x0=Math.min(x0,p.x-R);y0=Math.min(y0,p.y-R);x1=Math.max(x1,p.x+R);y1=Math.max(y1,p.y+R)}
 const rect=x1>x0?{x:Math.max(0,x0),y:Math.max(0,y0),w:Math.max(4,Math.min(renderWidth,x1)-Math.max(0,x0)),h:Math.max(4,Math.min(renderHeight,y1)-Math.max(0,y0))}:null;
 const g={key,eyes,mouth:m,u,n,C,S,curves,amps,rect,hasBrow,basis:null,cheeks,ears,earW,sd,style,autoStyle,red:null};
 faceGeomCache[k]=g;return g;
}
// 조절 항목마다 기준 지도(값 100%일 때 화소 이동량)
function faceBasis(g){
 if(g.basis||!g.rect)return g.basis;
 const G=FACE_G,{rect,n}=g,B={};
 for(const cv of g.curves){
  const R=Math.max(cv.rUp,cv.rDown);
  let bx0=Infinity,by0=Infinity,bx1=-Infinity,by1=-Infinity;for(const p of cv.pts){bx0=Math.min(bx0,p.x);by0=Math.min(by0,p.y);bx1=Math.max(bx1,p.x);by1=Math.max(by1,p.y)}
  const i0=clamp(Math.floor((bx0-R-rect.x)/rect.w*G),0,G-1),i1=clamp(Math.ceil((bx1+R-rect.x)/rect.w*G),0,G-1);
  const j0=clamp(Math.floor((by0-R-rect.y)/rect.h*G),0,G-1),j1=clamp(Math.ceil((by1+R-rect.y)/rect.h*G),0,G-1);
  for(const c of cv.ctrls)B[c.key]??=new Float32Array(G*G*2);
  const pts=cv.pts;
  for(let j=j0;j<=j1;j++){const py=rect.y+(j+.5)/G*rect.h;for(let i=i0;i<=i1;i++){
   const px=rect.x+(i+.5)/G*rect.w;
   let d2=Infinity,t=0,qx=0,qy=0;
   for(let s=0;s<pts.length-1;s++){const a=pts[s],b=pts[s+1],vx=b.x-a.x,vy=b.y-a.y,l2=vx*vx+vy*vy||1e-6;
    const h=clamp(((px-a.x)*vx+(py-a.y)*vy)/l2,0,1),x=a.x+vx*h,y=a.y+vy*h,dd=(px-x)**2+(py-y)**2;
    if(dd<d2){d2=dd;t=a.t+(b.t-a.t)*h;qx=x;qy=y}}
   const side=(px-qx)*n.x+(py-qy)*n.y,r=side>=0?cv.rUp:cv.rDown,d=Math.sqrt(d2);
   if(d>=r)continue;
   const core=cv.core||0,z=Math.max(0,d-core)/(r-core),w=(1-z*z)**2,idx=(j*G+i)*2;
   for(const c of cv.ctrls){const hat=c.hat===0?1-2*t:c.hat===2?2*t-1:1-Math.abs(2*t-1);if(hat<=0)continue;
    const F=B[c.key];F[idx]+=w*hat*c.dir.x;F[idx+1]+=w*hat*c.dir.y}
  }}
 }
 // 성김 형태로 바꿔 둔다(기준 지도마다 0이 아닌 칸만): 입술 떨림처럼 매 프레임 다시 합칠 때 빠르게
 for(const key in B){const F=B[key],idx=[];for(let i=0;i<F.length;i+=2)if(F[i]||F[i+1])idx.push(i);const I=Uint32Array.from(idx),V=new Float32Array(I.length*2);I.forEach((i,j)=>{V[j*2]=F[i];V[j*2+1]=F[i+1]});B[key]={I,V}}
 g.basis=B;return B;
}
// ── 5단계 홍조: 지도의 B = 붉은 정도, A = 빗금이 들어갈 자리. 뺨은 외곽이 살짝 울퉁불퉁한 타원, 넓고 옅은 얼룩을 겹친다. ──
function fHash(x,y){const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s)}
function fNoise(x,y){const i=Math.floor(x),j=Math.floor(y);let a=x-i,b=y-j;a=a*a*(3-2*a);b=b*b*(3-2*b);
 return (fHash(i,j)*(1-a)+fHash(i+1,j)*a)*(1-b)+(fHash(i,j+1)*(1-a)+fHash(i+1,j+1)*a)*b}
function faceRedBasis(g,area=50){
 const sc=area<=50?.5+area/100:1+(area-50)/50;// 면적 0~100 → 뺨 크기 0.5~2배(50 = 추정한 크기)
 if(!g.rect)return null;if(g.red&&g.redArea===Math.round(area/5))return g.red;g.redArea=Math.round(area/5);
 // 귀 덩어리 미리 계산: 귀 방향(u·n) 범위, 띠 두께 = 귀 너비의 35%, 얼굴 쪽(toward: u 방향에서 얼굴 가운데가 어느 쪽인지)
 const earShapes=g.ears.map(pts=>{const U=pts.map(p=>p.x*g.u.x+p.y*g.u.y),N=pts.map(p=>p.x*g.n.x+p.y*g.n.y),u0=Math.min(...U),u1=Math.max(...U)+1e-3,n0=Math.min(...N),n1=Math.max(...N)+1e-3;
  return {pts,u0,u1,n0,n1,depth:Math.max(2,.35*Math.min(u1-u0,n1-n0)),toward:(g.C.x*g.u.x+g.C.y*g.u.y)<(u0+u1)/2?-1:1}});
 const G=FACE_G,{rect}=g,cheek=new Float32Array(G*G),hatch=new Float32Array(G*G),ear=new Float32Array(G*G),ang=Math.atan2(g.u.y,g.u.x);
 for(let j=0;j<G;j++){const py=rect.y+(j+.5)/G*rect.h;for(let i=0;i<G;i++){const px=rect.x+(i+.5)/G*rect.w,idx=j*G+i;
  for(const ch of g.cheeks){
   const dx=px-ch.c.x,dy=py-ch.c.y,lx=dx*g.u.x+dy*g.u.y,ly=-(dx*g.n.x+dy*g.n.y),d=Math.hypot(lx/(ch.rx*sc),ly/(ch.ry*sc));
   if(d>1.35)continue;
   const a=Math.atan2(ly,lx),edge=1+.13*(fNoise(a*1.6+ch.c.x*.01,3.1)-.5)*2;// 외곽 울퉁불퉁
   const z=d/edge;if(z>=1.25)continue;
   const w=Math.pow(Math.max(0,1-(z/1.25)**2),1.6);
   cheek[idx]=Math.max(cheek[idx],w);
   hatch[idx]=Math.max(hatch[idx],Math.pow(Math.max(0,1-z*z),.8));
  }
  for(const E of earShapes){
   // 귀(사용자가 그린 테두리를 닫은 덩어리): 테두리 안쪽 35% 띠와 위쪽 40%는 확실히, 얼굴과 붙은 쪽 아래는 덜 붉게
   const pts=E.pts;let best=Infinity,inside=false;
   for(let s=0,m=pts.length;s<m;s++){const a=pts[s],b=pts[(s+1)%m],vx=b.x-a.x,vy=b.y-a.y,l2=vx*vx+vy*vy||1e-6,h=clamp(((px-a.x)*vx+(py-a.y)*vy)/l2,0,1);best=Math.min(best,Math.hypot(px-a.x-vx*h,py-a.y-vy*h));
    if((a.y>py)!==(b.y>py)&&px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x)inside=!inside}
   const pu=px*g.u.x+py*g.u.y,pn=px*g.n.x+py*g.n.y,up=(pn-E.n0)/(E.n1-E.n0),side=E.toward<0?(pu-E.u0)/(E.u1-E.u0):(E.u1-pu)/(E.u1-E.u0);
   let w;
   if(inside){const band=best<E.depth?1:.5+.5*Math.max(0,1-(best-E.depth)/E.depth);w=up>.6?1:band*(side<.3?.55+.45*side/.3:1)}
   else w=best<g.earW*.7?.85*Math.pow(1-best/(g.earW*.7),1.2):0;
   ear[idx]=Math.max(ear[idx],w)}
 }}
 g.red={cheek,hatch,ear};return g.red;
}
// 섞은 표정의 홍조 세기 → 지도 값(B 붉은 정도, A 빗금 자리). 홍조가 없으면 null.
function faceRedValues(g,expr,amount){
 const sig=`${Math.round((expr.bl||0)*amount*2)}|${Math.round((expr.ba??50)/5)}|${Math.round((expr.earBl||0)*amount*2)}|${g.style}`;if(g.redSig===sig)return g.redVal;g.redSig=sig;return g.redVal=faceRedValuesRaw(g,expr,amount)}
function faceRedValuesRaw(g,expr,amount){
 const bl=(expr.bl||0)/100*amount,eb=(expr.earBl||0)/100*amount;if(bl<=.001&&eb<=.001)return null;
 const B=faceRedBasis(g,expr.ba??50);if(!B)return null;
 const n=B.cheek.length,b=new Float32Array(n),h=new Float32Array(n);
 for(let i=0;i<n;i++){b[i]=Math.min(1,1.7*bl*B.cheek[i]+2*eb*B.ear[i]);h[i]=g.style==='grad'||bl<.01?0:B.hatch[i]}// 빗금 자리는 진하기와 상관없이(진하기는 선의 짙기에만)
 return {b,h};
}
// 셰이더 값: x 스타일(0 그라데이션·1 섬세한 빗금·2 만화 빗금), y 빗금의 가로지르는 방향(각도), z 빗금 간격(그림 화소), w 얼룩 크기(그림 화소)
function faceStyleUniform(g){
 const rx=g.cheeks.length?g.cheeks.reduce((a,c)=>a+c.rx,0)/g.cheeks.length:g.S*.3;
 const st=g.style==='manga'?2:g.style==='fine'?1:0,lineAng=Math.atan2(g.u.y,g.u.x)-1.13;// 선은 '/' 방향(눈 선에서 약 65°)
 return [st,lineAng+Math.PI/2,st===2?2*rx/4.5:Math.max(2.2,rx*.13),Math.max(6,rx*.9)];
}
// 표정 값 → 이동량 지도(화소). 떨림은 입 가운데·꼬리를 작고 빠르게, 일정하지 않게 흔든다.
function faceField(k,expr,amount,time){
 const g=faceGeometry(k),B=faceBasis(g);if(!B||!expr)return null;
 const out=new Float32Array(FACE_G*FACE_G*2),tr=(expr.tr||0)/100*amount;
 const shake=tr?Math.sin(time*37)*.6+Math.sin(time*53+1.3)*.4:0,shake2=tr?Math.sin(time*41+2.1)*.6+Math.sin(time*29+.4)*.4:0;
 for(const key in B){
  let v=key==='mm'?expr.mm:expr[key[0]][key.slice(2)];
  v=v*amount;
  if(key==='mm')v+=30*tr*shake;if(key.endsWith('.mc'))v+=15*tr*(key[0]==='L'?shake:shake2);
  if(!v)continue;
  const a=g.amps[key],coef=clamp(v,-100,100)/100*(v>0?a.pos:a.neg),{I,V}=B[key];
  for(let j=0;j<I.length;j++){const i=I[j];out[i]+=coef*V[j*2];out[i+1]+=coef*V[j*2+1]}
 }
 return out;
}
// ── 4단계: 터치 반응 세기(영역마다). 칠 때마다 쌓이고, 0.4초 머문 뒤 1~2초에 걸쳐 빠진다. 끄는 동안은 유지. ──
function faceHit(z,power){
 if(!z.tapFaceOn)return;
 const now=elapsed;
 z.faceLv=Math.min(1.3,faceReactLevel(z)+.45+.4*Math.min(1,power||0));z.faceAt=now;
 z.faceHits=(z.faceHits||[]).filter(t=>now-t<3);z.faceHits.push(now);
 if(z.comboOn&&z.faceHits.length>=5)z.faceComboAt=now;// 연타 기준: 3초 안에 5번
}
function faceReactLevel(z){
 const dt=elapsed-(z.faceAt??-99),lv=(z.faceLv||0)*(dt<.4?1:Math.exp(-(dt-.4)/.45));
 return z.dragging&&z.tapFaceOn?Math.max(.8,lv):lv<.01?0:lv;
}
// 연타 반응의 무게: 마지막 연타 뒤 1.2초까지 1, 그 뒤 0.8초에 걸쳐 0
function faceComboWeight(z){if(!z.comboOn||z.faceComboAt==null)return 0;return clamp(1-(elapsed-z.faceComboAt-1.2)/.8,0,1)}
// 지금 보일 표정(얼굴마다 섞은 값). 겹치는 규칙(설계 §6):
// 기본 = 몸체 평소 표정 + 움직이는 영역의 표정. 터치 반응이 같은 표정이면 더하고(100%까지), 다른 표정이면 그만큼 기본 표정이 옅어진다.
function faceActive(){
 if(!faceOn||!faces.length)return faceLastActive=[];
 if(faceLive&&faces[faceLive.k]){const e=faces[faceLive.k].exprs[faceLive.id];return faceLastActive=e?[{k:faceLive.k,expr:{...e,earBl:e.ear?e.bl:0},amount:faceLive.amount,mix:new Map([[faceLive.id,1]]),more:0}]:[]}
 const per=new Map(),more=new Map();
 const add=(ref,amt,kind)=>{const r=faceRefParse(ref);if(!r||!(amt>.002))return;if(!per.has(r.k))per.set(r.k,{base:new Map(),touch:new Map()});const m=per.get(r.k)[kind];m.set(r.id,(m.get(r.id)||0)+amt)};
 if(ambient.enabled&&ambient.face)add(ambient.face,ambient.faceAmt/100,'base');
 for(const z of zones){
  if(z.auto&&z.autoFace){const beat=Math.abs(MotionPhysics.wave(elapsed*1.18*(z.autoSpeed||1),z.phase));add(z.autoFace,z.autoFaceAmt/100*(z.autoEnv??1)*(.82+.18*beat),'base')}
  if(z.tapFaceOn&&z.tapFace){
   const lv=faceReactLevel(z);if(!lv)continue;
   const amt=z.tapFaceAmt/100*Math.min(1,lv),cw=faceComboWeight(z);
   if(cw&&z.comboMode!=='other'){const r=faceRefParse(z.tapFace);if(r)more.set(r.k,Math.max(more.get(r.k)||0,cw))}
   if(cw&&z.comboMode==='other'){add(z.comboFace,amt*cw,'touch');add(z.tapFace,amt*(1-cw),'touch')}
   else add(z.tapFace,Math.min(1,amt*(1+.15*cw)+(lv>1?.1*(lv-1):0)),'touch');// 더 진하게: +15%(그 이상의 효과는 6단계)
  }
 }
 const out=[];
 for(const [k,{base,touch}] of per){
  const mix=new Map(base);let lead=0;
  for(const [id,a] of touch){if(base.has(id))mix.set(id,Math.min(1,base.get(id)+a));else{mix.set(id,Math.min(1,(mix.get(id)||0)+a));lead=Math.max(lead,Math.min(1,a))}}
  for(const id of base.keys())if(!touch.has(id))mix.set(id,mix.get(id)*(1-lead));
  const e={L:{},R:{},mm:0,tr:0,bl:0,earBl:0};
  for(const key of EXPR_SIDE_KEYS)e.L[key]=e.R[key]=0;
  let baW=0,baS=0;for(const [id,a] of mix){const x=faces[k].exprs[id];if(!x||a<=0)continue;for(const key of EXPR_SIDE_KEYS){e.L[key]+=a*x.L[key];e.R[key]+=a*x.R[key]}e.mm+=a*x.mm;e.tr+=a*x.tr;e.bl+=a*(x.bl||0);baW+=a*(x.bl||0);baS+=a*(x.bl||0)*(x.ba??50);if(x.ear)e.earBl+=a*(x.bl||0)}
  for(const key of EXPR_SIDE_KEYS){e.L[key]=clamp(e.L[key],-100,100);e.R[key]=clamp(e.R[key],-100,100)}
  e.mm=clamp(e.mm,-100,100);e.tr=clamp(e.tr,0,100);e.bl=clamp(e.bl,0,100);e.ba=baW?baS/baW:50;e.earBl=clamp(e.earBl,0,100);
  out.push({k,expr:e,amount:1,mix,more:more.get(k)||0});
 }
 faceLastActive=out;
 return out;
}
// render()가 부른다: facePrepare = 지도 텍스처를 (바뀌었을 때만) 올리고 보일 얼굴 수를 돌려준다(얼굴판을 쓸지 정함), faceUpload = 셰이더 값.
function facePrepare(){
 if(!faceSupported){faceActive();faceTexCount=0;return 0}// 얼굴판이 없는 기기: 땀·눈물·기호(반응 층)만 그린다
 const list=faceActive().filter(a=>faceGeometry(a.k).rect);
 const animated=list.some(a=>a.expr.tr>0);
 // 섞은 값이 그대로면(가만히 있는 표정) 지도를 다시 만들지 않는다
 const sig=list.map(a=>a.k+JSON.stringify(a.expr,(k,v)=>typeof v==='number'?Math.round(v*a.amount*2)/2:v)).join('|');
 if(sig!==faceTexSig){faceTexSig=sig;faceTexDirty=true}
 if(faceTexDirty||animated){
  faceTexDirty=false;
  const G=FACE_G,W=G*FACE_MAX;faceTexBytes??=new Uint8Array(W*G*4);faceTexBytes.fill(0);
  for(let i=0;i<faceTexBytes.length;i+=4){faceTexBytes[i]=faceTexBytes[i+1]=128}
  faceTexRects=new Float32Array(FACE_MAX*4);faceTexStyles=new Float32Array(FACE_MAX*4);
  list.forEach((a,slot)=>{
   const g=faceGeometry(a.k),F=faceField(a.k,a.expr,a.amount,elapsed);if(!F)return;
   faceTexRects.set([g.rect.x/renderWidth,g.rect.y/renderHeight,g.rect.w/renderWidth,g.rect.h/renderHeight],slot*4);
   const R=faceRedValues(g,a.expr,a.amount);faceTexStyles.set(faceStyleUniform(g),slot*4);
   for(let j=0;j<G;j++)for(let i=0;i<G;i++){const s=(j*G+i)*2,o=(j*W+slot*G+i)*4;
    faceTexBytes[o]=clamp(Math.round(128+F[s]/g.rect.w*1020),0,255);faceTexBytes[o+1]=clamp(Math.round(128+F[s+1]/g.rect.h*1020),0,255);
    if(R){faceTexBytes[o+2]=Math.round(clamp(R.b[j*G+i],0,1)*255);faceTexBytes[o+3]=Math.round(clamp(R.h[j*G+i],0,1)*255)}}
  });
  faceTexCount=list.length;
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,faceTex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,W,G,0,gl.RGBA,gl.UNSIGNED_BYTE,faceTexBytes);
 }
 return faceTexCount;
}
function faceUpload(){
 if(program!==programFace)return;
 gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,faceTex);
 gl.uniform1i(uni.faceCount,faceTexCount);
 if(faceTexRects){gl.uniform4fv(uni.faceRect,faceTexRects);gl.uniform4fv(uni.faceStyle,faceTexStyles)}
}
// 표정 창 미리보기: 같은 지도로 그림을 CPU에서 휘어 얼굴만 크게 보여 준다.
function drawExprPreview(){
 if(!exprDialog.open)return;
 const k=faceSel,g=faceGeometry(k),box=exprPreview.parentElement,ctx=exprPreview.getContext('2d');
 // 가로·세로를 같은 비율로 줄인다(따로 자르면 폰처럼 화소가 촘촘한 화면에서 얼굴이 찌그러진다)
 const dpr=Math.min(2,window.devicePixelRatio||1),bw=Math.max(1,box.clientWidth*dpr),bh=Math.max(1,box.clientHeight*dpr),fit=Math.min(1,720/Math.max(bw,bh)),cw=Math.max(1,Math.round(bw*fit)),ch=Math.max(1,Math.round(bh*fit));
 if(exprPreview.width!==cw||exprPreview.height!==ch){exprPreview.width=cw;exprPreview.height=ch}
 if(faceSrc?.bitmap!==bitmap||faceSrc.w!==renderWidth){const c=document.createElement('canvas');c.width=renderWidth;c.height=renderHeight;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bitmap,0,0,renderWidth,renderHeight);faceSrc={bitmap,w:renderWidth,data:x.getImageData(0,0,renderWidth,renderHeight).data}}
 const r=g.rect||{x:0,y:0,w:renderWidth,h:renderHeight};
 // 보이는 범위: 지도 범위를 미리보기 비율에 맞춰 넓힌다
 const A=cw/ch,vw=Math.max(r.w,r.h*A)*1.05/exprZoom,vh=vw/A,vx=r.x+r.w/2-vw/2,vy=r.y+r.h/2-vh/2;// exprZoom: 위 메뉴줄의 확대·축소
 const F=!exprCompare&&g.rect?faceField(k,currentExpr(),1,elapsed):null,G=FACE_G,W=renderWidth,H=renderHeight,src=faceSrc.data;
 const ce=currentExpr(),Rv=!exprCompare&&g.rect&&ce?faceRedValues(g,{...ce,earBl:ce.ear?ce.bl:0},1):null,st=faceStyleUniform(g);
 // 셰이더 faceRed와 같은 계산(미리보기용)
 const nd=[Math.cos(st[1]),Math.sin(st[1])],ld=[-nd[1],nd[0]];
 const redAt=(x,y)=>{const fx=(x-r.x)/r.w*G-.5,fy=(y-r.y)/r.h*G-.5;if(fx<0||fy<0||fx>=G-1||fy>=G-1)return 0;
  const i=fx|0,j=fy|0,a=fx-i,b=fy-j,p=j*G+i,q=p+G,lerp=A=>(A[p]*(1-a)+A[p+1]*a)*(1-b)+(A[q]*(1-a)+A[q+1]*a)*b;
  const tb=lerp(Rv.b),ta=lerp(Rv.h);if(tb+ta<.002)return 0;
  let v=tb*(.8+.2*fNoise(x*.75,y*.75))*(.72+.28*fNoise(x/st[3]+k*7,y/st[3]+k*7));
  if(st[0]>.5&&ta>.01){const s=(x*nd[0]+y*nd[1])/st[2],id=Math.floor(s),f=s-id,along=x*ld[0]+y*ld[1],jj=fHash(id,k+3),manga=st[0]>1.5,hw=manga?.13:.07,soft=1/st[2];
   const line=1-smoothstep(hw,hw+soft,Math.abs(f-.5));let keep=smoothstep(.2+.35*jj,.35+.35*jj,ta);if(!manga)keep*=fNoise(id*3.1,along/(st[2]*2.6))>=.32?1:0;
   v+=line*keep*(manga?.85:.5)*smoothstep(0,.15,ta)*Math.min(1,tb*1.4)}
  return v};
 const img=ctx.createImageData(cw,ch),out=img.data;
 const fieldAt=(x,y,o)=>{const fx=(x-r.x)/r.w*G-.5,fy=(y-r.y)/r.h*G-.5;if(fx<0||fy<0||fx>=G-1||fy>=G-1){o[0]=o[1]=0;return}
  const i=fx|0,j=fy|0,a=fx-i,b=fy-j,p=(j*G+i)*2,q=p+G*2;
  o[0]=(F[p]*(1-a)+F[p+2]*a)*(1-b)+(F[q]*(1-a)+F[q+2]*a)*b;o[1]=(F[p+1]*(1-a)+F[p+3]*a)*(1-b)+(F[q+1]*(1-a)+F[q+3]*a)*b};
 const d=[0,0];
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
  let sx=vx+(x+.5)/cw*vw,sy=vy+(y+.5)/ch*vh;
  if(F){fieldAt(sx,sy,d);sx-=d[0];sy-=d[1]}
  const o=(y*cw+x)*4;
  if(sx<0||sy<0||sx>W-1||sy>H-1){out[o+3]=0;continue}
  const ix=Math.min(W-2,sx|0),iy=Math.min(H-2,sy|0),a=sx-ix,b=sy-iy,p=(iy*W+ix)*4,q=p+W*4;
  for(let c=0;c<4;c++)out[o+c]=(src[p+c]*(1-a)+src[p+4+c]*a)*(1-b)+(src[q+c]*(1-a)+src[q+4+c]*a)*b;
  if(Rv){const red=redAt(sx,sy);if(red>.001){const lum=(.3*out[o]+.59*out[o+1]+.11*out[o+2])/255,m=Math.min(red+red*red,2.2)*.6*smoothstep(.15,.55,lum);out[o+1]*=1-.38*m;out[o+2]*=1-.36*m}}
 }
 ctx.putImageData(img,0,0);
 exprView={vx,vy,vw,vh,cw,ch};
 // 물방울이 비출 그림: 이펙트를 얹기 전 미리보기 그대로
 if(exprSnap.width!==cw||exprSnap.height!==ch){exprSnap.width=cw;exprSnap.height=ch}exprSnap.getContext('2d').putImageData(img,0,0);
 if(!exprCompare&&ce)drawFaceFx(ctx,(x,y)=>[(x-vx)/vw*cw,(y-vy)/vh*ch],cw/vw,[{k,expr:ce,amount:1,mix:new Map([[exprId,1]]),more:0}],elapsed,false,exprSnap,1);
}
let exprView=null;const exprSnap=document.createElement('canvas');
