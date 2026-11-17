// 맞은 자리(4-2)와 얼굴 이펙트(땀방울·눈물·반짝이·💢·하트). 그림을 휘지 않고 반응 층(#crackLayer)에 그린다 → 영상에도 늘 담긴다.
// 실사 그림에도 어울리게: 물방울은 그 자리 그림을 렌즈처럼 비춰(굴절) 그리고, 반짝이는 빛 번짐, 기호는 테두리 없이 입체감만 준다.

// ── 맞은 자리: 빨개짐 = 셰이더(u_hitMark, 영역 마스크 밖은 잘림), 갈라짐 = 이 층(영역 마스크로 잘림). ──
// 크기는 영역 크기에 비례(hitMarkSize %, 기본 70 = 영역 지름의 70%). 누르고 있거나 끄는 동안에도 빨개진다.
let hitMarkCount=0,hitSpots=[],hitCracks=[],reactLayerUsed=false,hitLastT=0;
const crackLayer=$('crackLayer'),crackCtx=crackLayer.getContext('2d'),crackTmp=document.createElement('canvas');
function hitSpotStrength(s){const age=elapsed-s.at;return s.s*(age<.15?1:Math.exp(-(age-.15)/.45))}
// 영역 지름(그림 화소): 가로·세로 반지름의 기하 평균 × 2
const zoneDiam=z=>2*Math.sqrt(Math.max(1,z.rx*renderWidth)*Math.max(1,z.ry*renderHeight));
function hitMarkUniform(){
 const dt=clamp(elapsed-hitLastT,0,.1);hitLastT=elapsed;
 // 누르고 있거나 끄는 동안: 누른 자리(그림 기준)에 계속 번진다
 const g=typeof gesture!=='undefined'?gesture:null,z=g?.type==='play'&&g.id?zones.find(v=>v.id===g.id):null;
 if(z?.hitMark==='red'&&performance.now()-g.time>180){
  let s=hitSpots.find(v=>v.gest===g);
  if(!s){s={x:g.start.x,y:g.start.y,r:z.hitMarkSize/100*zoneDiam(z)/2,s:.25,at:elapsed,zi:zones.indexOf(z),gest:g};hitSpots.push(s);if(hitSpots.length>4)hitSpots.shift()}
  s.s=Math.min(1.3,hitSpotStrength(s)+dt*1.1);s.at=elapsed;
 }
 const out=new Float32Array(16);hitSpots=hitSpots.filter(s=>hitSpotStrength(s)>.01);
 // w = 영역 번호×4 + 세기(셰이더가 나눠 읽고 그 영역 마스크 밖은 자른다)
 hitSpots.slice(-4).forEach((s,i)=>out.set([s.x,s.y,s.r,Math.max(0,s.zi)*4+Math.min(3.9,hitSpotStrength(s))],i*4));
 hitMarkCount=Math.min(4,hitSpots.length);return out;
}
function markHit(z,p,power){
 if(!z?.hitMark||!p)return;
 const W=renderWidth,H=renderHeight,R=(z.hitMarkSize??70)/100*zoneDiam(z)/2,zi=zones.indexOf(z);
 if(z.hitMark==='red'){
  const near=hitSpots.find(s=>s.zi===zi&&Math.hypot((s.x-p.x)*W,(s.y-p.y)*H)<s.r*.6);
  if(near){near.s=Math.min(1.6,hitSpotStrength(near)+.35+.4*Math.min(1,power));near.at=elapsed}
  else{hitSpots.push({x:p.x,y:p.y,r:R,s:.45+.45*Math.min(1,power),at:elapsed,zi});if(hitSpots.length>4)hitSpots.shift()}
 }
 if(z.hitMark==='crack')hitCracks.push(makeCrack(z,p,power,R)),hitCracks.length>10&&hitCracks.shift();
}
// 갈라짐 한 번: 굵은 금 몇 갈래 + 가지 + 잔금. 크기는 칠 때마다 들쭉날쭉(0.55~1.15배). 선 색은 그 자리 그림보다 어둡게.
function makeCrack(z,p,power,R){
 const W=renderWidth,H=renderHeight;
 const c=document.createElement('canvas');c.width=c.height=1;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,Math.floor(p.x*bitmap.width),Math.floor(p.y*bitmap.height),1,1,0,0,1,1);
 const [r,gg,b]=g.getImageData(0,0,1,1).data;
 const scale=(.55+.6*Math.random())*(.75+.25*Math.min(1,power)),len=Math.max(8,R*scale),segs=[],main=3+Math.floor(Math.random()*3),a0=Math.random()*Math.PI*2;
 const grow=(x,y,ang,l,w,depth)=>{const n=3+Math.floor(Math.random()*3);for(let s=0;s<n;s++){
   const step=l/n*(.6+.8*Math.random());ang+=(Math.random()-.5)*(.6+depth*.5);const nx=x+Math.cos(ang)*step,ny=y+Math.sin(ang)*step;
   segs.push([x/W,y/H,nx/W,ny/H,w*(1-s/n*.75)*(.8+.4*Math.random()),depth]);
   if(depth<2&&Math.random()<(depth?.35:.6))grow(nx,ny,ang+(Math.random()<.5?-1:1)*(.5+Math.random()*.7),l*(.35+.25*Math.random()),w*.55,depth+1);
   x=nx;y=ny}};
 const w0=Math.max(1.4,len*.045);
 for(let i=0;i<main;i++)grow(p.x*W,p.y*H,a0+i/main*Math.PI*2+(Math.random()-.5)*.9,len*(.55+.6*Math.random()),w0*(.7+.6*Math.random()),0);
 // 잔금: 가운데 둘레의 짧고 가는 금
 for(let i=0;i<4+Math.floor(Math.random()*4);i++){const a=Math.random()*Math.PI*2,d=len*.12*Math.random();grow(p.x*W+Math.cos(a)*d,p.y*H+Math.sin(a)*d,a,len*.25*(.5+Math.random()),w0*.35,2)}
 return {id:z.id,x:p.x,y:p.y,segs,dark:`rgb(${Math.round(r*.28)},${Math.round(gg*.24)},${Math.round(b*.24)})`,lite:`rgba(${Math.min(255,r+70)},${Math.min(255,gg+70)},${Math.min(255,b+70)},.55)`,at:elapsed};
}
// 금 하나 = 밝은 테두리(한쪽으로 살짝 비켜) + 어두운 속 → 패인 느낌
function drawCrackSegs(ctx,c,W,H,dx,dy,k){
 ctx.lineCap='round';ctx.lineJoin='round';
 for(const pass of [0,1])for(const [x0,y0,x1,y1,w] of c.segs){
  const lw=Math.max(pass?.7:1,w*k*(pass?1:1.35)),off=pass?0:Math.max(.6,w*k*.45);
  ctx.strokeStyle=pass?c.dark:c.lite;ctx.lineWidth=lw;ctx.beginPath();ctx.moveTo((x0+dx)*W+off,(y0+dy)*H+off);ctx.lineTo((x1+dx)*W+off,(y1+dy)*H+off);ctx.stroke();
 }
}
// 영역 모양은 바뀔 때만 다시 만든다
const crackMasks=new Map();
function crackMask(z){const key=zoneShapeKey(z),hit=crackMasks.get(z.id);if(hit?.key===key)return hit.c;const c=rawMaskCanvas(z);crackMasks.set(z.id,{key,c});return c}
function drawCracks(){
 const dpr=Math.min(window.devicePixelRatio||1,2),W=Math.max(1,Math.round(surface.clientWidth*dpr)),H=Math.max(1,Math.round(surface.clientHeight*dpr));
 if(!gl)faceActive();// 그래픽 가속이 없을 때도 이펙트는 이 층에 그린다
 const fx=hasFaceFx();reactLayerUsed=fx||hitCracks.length>0;
 // 쓰지 않을 때는 층을 숨긴다(빈 캔버스도 화면 전체에 겹쳐 그려져 프레임이 느려진다)
 crackLayer.hidden=!reactLayerUsed;
 if(!reactLayerUsed){if(crackLayer.width>1){crackLayer.width=crackLayer.height=1}return}
 if(crackLayer.width!==W||crackLayer.height!==H){crackLayer.width=W;crackLayer.height=H}
 crackCtx.clearRect(0,0,W,H);
 hitCracks=hitCracks.filter(c=>elapsed-c.at<2.2&&zones.some(z=>z.id===c.id));
 const k=W/renderWidth;
 // 영역마다 따로 그린 뒤 그 영역 모양(마스크)으로 잘라 붙인다(영역 밖으로 삐져나가지 않게)
 for(const z of zones){
  const list=hitCracks.filter(c=>c.id===z.id);if(!list.length)continue;
  if(crackTmp.width!==W||crackTmp.height!==H){crackTmp.width=W;crackTmp.height=H}
  const t=crackTmp.getContext('2d');t.clearRect(0,0,W,H);t.globalCompositeOperation='source-over';
  const [dx,dy]=cpuDeformation(z,z.x,z.y);
  for(const c of list){const age=elapsed-c.at;t.globalAlpha=clamp(age<1.2?1:1-(age-1.2),0,1);const [cx,cy]=cpuDeformation(z,c.x,c.y);drawCrackSegs(t,c,W,H,cx,cy,k)}
  t.globalAlpha=1;t.globalCompositeOperation='destination-in';t.drawImage(crackMask(z),dx*W,dy*H,W,H);
  crackCtx.drawImage(crackTmp,0,0);
 }
 // 물방울이 비출 그림은 원본 그림(화면을 읽으면 그래픽 카드가 매 프레임 멈춰 기다려 크게 느려진다)
 if(fx)drawFaceFx(crackCtx,(x,y)=>[x*k,y*k],k,faceLastActive,elapsed,true,bitmap,1/k);
}

// ── 얼굴 이펙트 ──
// 세부 옵션(표정마다, 0~200%, 100 = 기본): sp 속도, fr 빈도, op 진하기
const fxOpt=(x,key)=>{const o=x.fxo?.[key]||{};return {sp:Math.max(.1,(o.sp??100)/100),fr:Math.max(.1,(o.fr??100)/100),op:clamp((o.op??100)/100,0,2)}};
// 이펙트 자리(그림 화소). 기본 자리 + 사용자가 옮긴 만큼(fxAt, 얼굴 크기 S 단위, u = 눈 선 방향, n = 위)
function faceFxShift(g,f,key){const d=f.fxAt?.[key];return d?fv.add(fv.mul(g.u,d.a*g.S),fv.mul(g.n,d.b*g.S)):{x:0,y:0}}
function faceSweatSpot(g,f,i){
 const p=f.sweatAt?.[i];if(p)return fv.add(g.C,fv.add(fv.mul(g.u,p.a*g.S),fv.mul(g.n,p.b*g.S)));
 const right=g.eyes.find(e=>e.side==='R')||g.eyes.at(-1),base=right?right.outer:g.C;// 관자놀이·이마 근처(화면 오른쪽)
 return fv.add(base,fv.add(fv.mul(g.u,g.S*(.28+.1*(i%2))),fv.mul(g.n,g.S*(.45-.32*i))));
}
function faceFxAnchors(g,f){
 const right=g.eyes.find(e=>e.side==='R')||g.eyes.at(-1),cheek=g.cheeks.find(c=>c.side==='R')||g.cheeks[0];
 const at=(key,p)=>fv.add(p,faceFxShift(g,f,key));
 return {
  tear:at('tear',{x:0,y:0}),// 눈물은 눈마다 아랫꺼풀에 붙고, 옮긴 만큼만 더한다
  anger:at('anger',fv.add(g.C,fv.add(fv.mul(g.n,g.S*1.05),fv.mul(g.u,g.S*.75)))),
  heart:at('heart',cheek?fv.add(cheek.c,fv.mul(g.u,cheek.rx*1.2)):fv.add(g.C,fv.mul(g.u,g.S*.8))),
  sparkle:at('sparkle',fv.add(g.C,fv.mul(g.n,g.S*.35))),
  right,
 };
}
// 이 얼굴에 지금 그릴 이펙트(표정을 섞은 무게로). 옵션은 그 이펙트를 가장 강하게 쓰는 표정 것을 쓴다.
function faceFxPlan(a){
 const f=faces[a.k];if(!f)return null;const P={sweat:0,sweatW:0,tear:0,flow:0,anger:0,angerBig:0,heart:0,sparkle:0,sparkleMore:0,opt:{}};
 const take=(key,w,x)=>{if(!P.opt[key]||w>P.opt[key].w)P.opt[key]={w,...fxOpt(x,key)}};
 for(const [id,w] of a.mix){const x=f.exprs[id];if(!x||w<.05)continue;const m=a.more;
  const sw=x.sw+(m>.3&&(id==='shy'||id==='surprise')&&x.sw?1:0);if(sw&&w>P.sweatW*.8){P.sweat=Math.max(P.sweat,Math.min(3,sw));P.sweatW=Math.max(P.sweatW,w);take('sweat',w,x)}
  if(x.tear){P.tear=Math.max(P.tear,w);take('tear',w,x);if(id==='cry')P.flow=Math.max(P.flow,m*w)}
  if(x.sa){P.anger=Math.max(P.anger,w);take('anger',w,x);if(id==='angry')P.angerBig=Math.max(P.angerBig,m)}
  if(x.sh){P.heart=Math.max(P.heart,w);take('heart',w,x)}
  if(x.ss){P.sparkle=Math.max(P.sparkle,w);take('sparkle',w,x);if(id==='smile')P.sparkleMore=Math.max(P.sparkleMore,m)}
 }
 return P;
}
function hasFaceFx(){return faceLastActive.some(a=>{const p=faceFxPlan(a);return p&&(p.sweat||p.tear||p.anger||p.heart||p.sparkle)})}
// ctx에 그린다. at(px,py) = 그림 화소 → 캔버스 좌표, k = 그림 화소 1개의 캔버스 크기, follow = 그림 움직임 따라가기,
// src = 물방울이 비출 그림(지금 화면), sk = 캔버스 좌표 → src 좌표 배율
function drawFaceFx(ctx,at,k,list,t,follow=true,src=null,sk=1){
 const move=p=>{if(!follow)return p;const ux=p.x/renderWidth,uy=p.y/renderHeight,z=hit(ux,uy);if(!z)return p;const [dx,dy]=cpuDeformation(z,ux,uy);return {x:p.x+dx*renderWidth,y:p.y+dy*renderHeight}};
 for(const a of list){
  const g=faceGeometry(a.k),P=faceFxPlan(a),f=faces[a.k];if(!P||!g.eyes.length)continue;
  const S=g.S,up=Math.atan2(g.n.y,g.n.x),A=faceFxAnchors(g,f);
  ctx.save();ctx.lineJoin=ctx.lineCap='round';
  // 반짝이: 얼굴 둘레에 아무 데서나 나타났다 사라지는 빛(가로·세로로 길게 번진다)
  if(P.sparkle){const o=P.opt.sparkle,n=Math.round(3+3*o.fr+2*P.sparkleMore),c0=move(A.sparkle);
   for(let i=0;i<n;i++){
    const period=(1.1+1.3*fHash(i,7))/o.sp,ph=t/period+fHash(i,3),cyc=Math.floor(ph),q=ph-cyc,life=.45;if(q>life)continue;
    const ang=-Math.PI*(.05+1.1*fHash(i,cyc))-.0,rad=S*(1.25+1.05*fHash(cyc,i+11));
    const p=fv.add(c0,fv.add(fv.mul(g.u,Math.cos(ang)*rad),fv.mul(g.n,-Math.sin(ang)*rad))),c=at(p.x,p.y);
    const env=Math.sin(q/life*Math.PI),flick=.75+.25*Math.sin(t*40+i*3.1);
    faceGlint(ctx,c[0],c[1],S*k*(.05+.05*fHash(i,cyc+5)),P.sparkle*o.op*env*flick);
   }}
  // 땀방울: 맺힘 → 살짝 부풂 → 짧게 흘러내리며 늘어짐 → 움직이는 도중에 옅어짐(빈도가 낮으면 사이에 쉼)
  if(P.sweat){const o=P.opt.sweat;for(let i=0;i<P.sweat;i++){
   const period=2.4/o.sp+(2.4/o.fr-2.4)*.5,Pq=((t/period+i*.37)%1)*(period*o.sp/2.4);if(Pq>.86)continue;
   const grow=Math.min(1,Pq/.12),swell=Pq<.12?grow:Pq<.35?1+.12*(Pq-.12)/.23:1.12,slide=Pq<.35?0:(Pq-.35)/.5,alpha=P.sweatW*o.op*(Pq<.6?1:1-(Pq-.6)/.26);
   const base=move(fv.add(faceSweatSpot(g,f,i),fv.mul(g.n,-slide*S*.22))),c=at(base.x,base.y);
   faceWaterDrop(ctx,c[0],c[1],S*.065*swell*k,1+.45*slide,up,alpha,src,sk);
  }}
  // 눈물: 아랫꺼풀 곡선 위 바깥쪽 1/3에 기울기를 따라 맺힌다(물이 고인 렌즈). 진할 때는 볼을 타고 흘러내린다.
  if(P.tear){const o=P.opt.tear;for(const e of g.eyes){
   const q=faceQuad(e.inner,e.lo,e.outer,20),p0=fv.add(q[15],A.tear),nx=fv.add(q[16],A.tear),ang=Math.atan2(nx.y-p0.y,nx.x-p0.x),m=move(p0),c=at(m.x,m.y);
   const shine=.88+.12*Math.sin(t*3*o.sp+e.c.x);
   faceWaterLens(ctx,c[0],c[1],e.w*.16*k,e.w*.06*k,ang,P.tear*o.op*shine,src,sk);
   if(P.flow>.05){
    const period=1.8/o.sp,Pq=(t/period)%1*(o.fr),len=Math.min(1,Pq/.6)*e.h*1.6,fade=Pq<.6?1:Math.max(0,1-(Pq-.6)/.4),steps=12,pts=[];
    for(let s=0;s<=steps;s++){const pp=move(fv.add(p0,fv.add(fv.mul(g.n,-len*s/steps),fv.mul(g.u,Math.sin(s*.8)*e.w*.02))));pts.push(at(pp.x,pp.y))}
    ctx.save();ctx.globalAlpha=P.flow*fade*o.op;
    for(const [wid,col] of [[e.w*.07*k,'rgba(0,0,0,.07)'],[e.w*.022*k,'rgba(255,255,255,.55)']]){ctx.lineWidth=Math.max(1,wid);ctx.strokeStyle=col;ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke()}
    ctx.restore();
    const end=pts.at(-1);if(len>e.h*.3)faceWaterDrop(ctx,end[0],end[1],e.w*.05*k,1.2,up,P.flow*fade*o.op,src,sk);
   }
  }}
  // 💢: 머리 위 바깥쪽. 테두리 없이 붉은 그라데이션 + 안쪽 밝은 줄 + 은은한 빛. 진할 때 커진다.
  if(P.anger){const o=P.opt.anger,pos=move(A.anger),c=at(pos.x,pos.y),beat=Math.sin(t*7*o.sp),pop=o.fr<1?Math.max(0,Math.sin(t*o.fr*2)):1;
   faceAnger(ctx,c[0],c[1],S*.2*k*(1+.5*P.angerBig)*(1+.08*beat),P.anger*o.op*pop)}
  // 하트: 기본 자리에서 떠오르며 옅어진다
  if(P.heart){const o=P.opt.heart,n=Math.max(1,Math.round(2*o.fr));for(let i=0;i<n;i++){
   const Pq=(t/(2.2/o.sp)+i/n)%1,pos=move(fv.add(A.heart,fv.add(fv.mul(g.u,S*.12*Math.sin(i*2.3+Pq*3)),fv.mul(g.n,S*(.05+.55*Pq))))),c=at(pos.x,pos.y);
   faceHeart(ctx,c[0],c[1],S*.11*k*(.7+.4*Math.min(1,Pq*3)),Math.sin(Pq*6+i)*.15,P.heart*o.op*(Pq<.7?1:1-(Pq-.7)/.3));
  }}
  ctx.restore();
 }
}
// 물방울(땀): 위가 뾰족하고 아래가 둥근 모양. 안쪽은 그 자리 그림을 확대·뒤집어 비추고(렌즈), 가장자리는 어둡게, 위에 반사광.
function dropPath(ctx,r,h){ctx.beginPath();ctx.moveTo(0,-h);ctx.bezierCurveTo(r*.55,-h*.45,r,-r*.1,r,r*.15);ctx.arc(0,r*.15,r,0,Math.PI);ctx.bezierCurveTo(-r,-r*.1,-r*.55,-h*.45,0,-h);ctx.closePath()}
function faceWaterDrop(ctx,x,y,r,stretch,up,alpha,src,sk){
 if(alpha<=.01||r<=.5)return;const h=r*1.7*stretch;
 ctx.save();ctx.translate(x,y);ctx.rotate(up+Math.PI/2);ctx.globalAlpha=clamp(alpha,0,1);
 // 그림자(아래로 살짝)
 ctx.save();ctx.translate(r*.12,r*.28);dropPath(ctx,r,h);ctx.fillStyle='rgba(0,0,0,.16)';ctx.fill();ctx.restore();
 dropPath(ctx,r,h);ctx.save();ctx.clip();
 if(src){ctx.save();ctx.rotate(-(up+Math.PI/2));ctx.scale(1,-1);const s=r*1.6;// 렌즈: 둘레 그림을 1.4배로 키워 위아래를 뒤집어 비춘다
  try{ctx.drawImage(src,(x-s/1.4)*sk,(y-s/1.4)*sk,2*s/1.4*sk,2*s/1.4*sk,-s,-s,2*s,2*s)}catch(_){}ctx.restore();
  ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(-r*2,-h*2,r*4,h*4)}
 else{ctx.fillStyle='rgba(200,225,245,.35)';ctx.fillRect(-r*2,-h*2,r*4,h*4)}
 const rim=ctx.createRadialGradient(0,r*.1,r*.2,0,r*.1,r*1.15);rim.addColorStop(0,'rgba(0,0,0,0)');rim.addColorStop(.75,'rgba(0,0,0,.08)');rim.addColorStop(1,'rgba(0,0,0,.32)');
 ctx.fillStyle=rim;ctx.fillRect(-r*2,-h*2,r*4,h*4);ctx.restore();
 ctx.lineWidth=Math.max(.6,r*.07);ctx.strokeStyle='rgba(255,255,255,.28)';dropPath(ctx,r,h);ctx.stroke();
 faceSpecular(ctx,-r*.38,-r*.05,r*.32);faceSpecular(ctx,r*.42,r*.62,r*.14,.5);
 ctx.restore();
}
// 고인 눈물: 아랫꺼풀을 따라 길쭉한 렌즈
function faceWaterLens(ctx,x,y,rx,ry,ang,alpha,src,sk){
 if(alpha<=.01||rx<=.5)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=clamp(alpha,0,1);
 ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.save();ctx.clip();
 if(src){ctx.save();ctx.rotate(-ang);ctx.scale(1,-1);try{ctx.drawImage(src,(x-rx*.8)*sk,(y-rx*.8)*sk,rx*1.6*sk,rx*1.6*sk,-rx*1.1,-rx*1.1,rx*2.2,rx*2.2)}catch(_){}ctx.restore()}
 const rim=ctx.createRadialGradient(0,0,ry*.3,0,0,rx);rim.addColorStop(0,'rgba(255,255,255,.08)');rim.addColorStop(1,'rgba(0,0,0,.28)');ctx.fillStyle=rim;ctx.fillRect(-rx,-rx,rx*2,rx*2);ctx.restore();
 ctx.lineWidth=Math.max(.6,ry*.12);ctx.strokeStyle='rgba(255,255,255,.35)';ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,Math.PI*1.05,Math.PI*1.95);ctx.stroke();
 faceSpecular(ctx,-rx*.35,-ry*.25,ry*.55);
 ctx.restore();
}
function faceSpecular(ctx,x,y,r,a=1){const gr=ctx.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(255,255,255,${.95*a})`);gr.addColorStop(.45,`rgba(255,255,255,${.5*a})`);gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
// 반짝이 빛: 밝은 점 + 가로·세로로 길게, 대각선으로 짧게 번지는 빛줄기(더하기 합성)
function faceGlint(ctx,x,y,r,alpha){
 if(alpha<=.01||r<=.3)return;
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(alpha,0,1);ctx.translate(x,y);
 const core=ctx.createRadialGradient(0,0,0,0,0,r*2.2);core.addColorStop(0,'rgba(255,255,250,1)');core.addColorStop(.25,'rgba(255,246,215,.7)');core.addColorStop(1,'rgba(255,230,180,0)');
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,r*2.2,0,Math.PI*2);ctx.fill();
 for(const [ang,len,wid,a] of [[0,r*9,r*.22,1],[Math.PI/2,r*7,r*.2,.95],[Math.PI/4,r*3,r*.12,.5],[-Math.PI/4,r*3,r*.12,.5]]){
  ctx.save();ctx.rotate(ang);const lg=ctx.createLinearGradient(-len,0,len,0);lg.addColorStop(0,'rgba(255,240,210,0)');lg.addColorStop(.5,`rgba(255,252,240,${a})`);lg.addColorStop(1,'rgba(255,240,210,0)');
  ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(-len,0);ctx.quadraticCurveTo(0,-wid,len,0);ctx.quadraticCurveTo(0,wid,-len,0);ctx.fill();ctx.restore()}
 ctx.restore();
}
function faceAnger(ctx,x,y,sz,alpha){
 if(alpha<=.01)return;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(alpha,0,1);ctx.lineCap='round';
 for(let q=0;q<4;q++){ctx.save();ctx.rotate(q*Math.PI/2+.2);
  const path=()=>{ctx.beginPath();ctx.moveTo(sz*.22,-sz*.95);ctx.quadraticCurveTo(sz*.28,-sz*.28,sz*.95,-sz*.22)};
  ctx.shadowColor='rgba(255,40,30,.55)';ctx.shadowBlur=sz*.35;
  const gr=ctx.createLinearGradient(sz*.2,-sz*.95,sz*.95,-sz*.2);gr.addColorStop(0,'#ff6a52');gr.addColorStop(.5,'#e3241f');gr.addColorStop(1,'#a8100f');
  path();ctx.strokeStyle=gr;ctx.lineWidth=Math.max(1.5,sz*.24);ctx.stroke();ctx.shadowBlur=0;
  path();ctx.strokeStyle='rgba(255,215,200,.55)';ctx.lineWidth=Math.max(.6,sz*.06);ctx.stroke();
  ctx.restore()}
 ctx.restore();
}
function faceHeart(ctx,x,y,sz,rot,alpha){
 if(alpha<=.01)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.globalAlpha=clamp(alpha,0,1);
 const path=()=>{ctx.beginPath();ctx.moveTo(0,sz*.9);ctx.bezierCurveTo(-sz*1.4,-sz*.1,-sz*.6,-sz*1.1,0,-sz*.35);ctx.bezierCurveTo(sz*.6,-sz*1.1,sz*1.4,-sz*.1,0,sz*.9)};
 ctx.shadowColor='rgba(255,90,140,.5)';ctx.shadowBlur=sz*.6;
 const gr=ctx.createRadialGradient(-sz*.3,-sz*.45,sz*.1,0,0,sz*1.3);gr.addColorStop(0,'#ffb3c8');gr.addColorStop(.5,'#f2577f');gr.addColorStop(1,'#b81e4b');
 path();ctx.fillStyle=gr;ctx.fill();ctx.shadowBlur=0;
 faceSpecular(ctx,-sz*.42,-sz*.42,sz*.3,.8);
 ctx.restore();
}
