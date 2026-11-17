// 맞은 자리(4-2)와 얼굴 이펙트(땀방울·눈물·반짝이·💢·하트). 그림을 휘지 않고 위에 그린다 → 영상에도 늘 담긴다.
// 층 둘: #crackLayer(갈라짐, 곱하기로 얹음) · #faceFxLayer(얼굴 이펙트, 그대로 얹음). 쓰지 않을 때는 숨긴다(빈 층도 프레임을 잡아먹는다).
// 이펙트 모양 두 가지(얼굴마다 fxStyle): 실사풍(그림을 비추는 물방울·빛 번짐, 테두리 없음) · 캐주얼·SD(테두리 있는 단순한 모양).

// ── 맞은 자리: 빨개짐 = 셰이더(u_hitMark, 영역 마스크 밖은 잘림), 갈라짐 = #crackLayer(영역 마스크로 잘림). ──
// 크기는 영역 크기에 비례(hitMarkSize %, 기본 70 = 영역 지름의 70%). 누르고 있거나 끄는 동안에도 빨개진다.
let hitMarkCount=0,hitSpots=[],hitCracks=[],faceFxUsed=false,hitLastT=0;
const crackLayer=$('crackLayer'),crackCtx=crackLayer.getContext('2d'),crackTmp=document.createElement('canvas');
const faceFxLayer=$('faceFxLayer'),faceFxCtx=faceFxLayer.getContext('2d');
function hitSpotStrength(s){const age=elapsed-s.at;return s.s*(age<.15?1:Math.exp(-(age-.15)/.45))}
const zoneDiam=z=>2*Math.sqrt(Math.max(1,z.rx*renderWidth)*Math.max(1,z.ry*renderHeight));// 영역 지름(그림 화소)
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
 if(z.hitMark==='crack'){hitCracks.push(makeCrack(z,p,power,R));if(hitCracks.length>10)hitCracks.shift()}
}
// ── 갈라짐: 칠 때마다 무늬 넷 중 하나(그물 금·긴 금·조각 금·잔금) + 크기 0.4~1.15배 + 가운데 잡티. 곱하기로 얹는다. ──
const rnd=(a,b)=>a+Math.random()*(b-a);
function crackWalk(x,y,ang,len,steps,turn){const pts=[[x,y]];for(let s=0;s<steps;s++){ang+=rnd(-turn,turn);x+=Math.cos(ang)*len/steps*rnd(.6,1.4);y+=Math.sin(ang)*len/steps*rnd(.6,1.4);pts.push([x,y])}return {pts,ang}}
function makeCrack(z,p,power,R){
 const W=renderWidth,H=renderHeight,cx=p.x*W,cy=p.y*H;
 const c=document.createElement('canvas');c.width=c.height=1;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(bitmap,Math.floor(p.x*bitmap.width),Math.floor(p.y*bitmap.height),1,1,0,0,1,1);
 const [r,gg,b]=g.getImageData(0,0,1,1).data;
 const L=Math.max(10,R*rnd(.4,1.15)*(.8+.2*Math.min(1,power))),w0=Math.max(1,L*.022),lines=[],wedges=[],specks=[];
 const line=(pts,wA,wB,tone,peak=false)=>lines.push({pts,w:pts.map((_,i)=>{const t=i/Math.max(1,pts.length-1);return peak?wA*Math.sin(Math.PI*clamp(t,.08,.92))+wB:wA+(wB-wA)*t}),tone});
 const branch=(x,y,ang,len,w,depth,turn)=>{const n=3+Math.floor(Math.random()*3),{pts}=crackWalk(x,y,ang,len,n,turn);line(pts,w,w*.15,rnd(.7,.95));
  if(depth<2)for(let i=1;i<pts.length-1;i++)if(Math.random()<(depth?.3:.55))branch(pts[i][0],pts[i][1],ang+(Math.random()<.5?-1:1)*rnd(.5,1.2),len*rnd(.25,.5),w*.55,depth+1,turn)};
 const kind=['web','fissure','shatter','hair'][Math.floor(Math.random()*4)],a0=Math.random()*Math.PI*2;
 if(kind==='web'){const n=5+Math.floor(Math.random()*4);for(let i=0;i<n;i++)branch(cx,cy,a0+i/n*Math.PI*2+rnd(-.4,.4),L*rnd(.5,1),w0*rnd(.7,1.2),0,.7)}
 if(kind==='fissure'){const n=2+Math.floor(Math.random()*2);for(let i=0;i<n;i++){const a=a0+i*rnd(.5,1.2),A=crackWalk(cx,cy,a,L*rnd(.6,1),7,.22),B=crackWalk(cx,cy,a+Math.PI,L*rnd(.4,.8),6,.22);
  const pts=[...B.pts.reverse(),...A.pts.slice(1)];line(pts,w0*1.6,w0*.12,rnd(.8,.95),true);
  for(let k=2;k<pts.length-2;k++)if(Math.random()<.45){const t=crackWalk(pts[k][0],pts[k][1],a+(Math.random()<.5?-1:1)*rnd(.6,1.3),L*rnd(.1,.22),3,.5);line(t.pts,w0*.45,w0*.08,rnd(.6,.85))}}}
 if(kind==='shatter'){const n=3+Math.floor(Math.random()*2);for(let i=0;i<n;i++){const {pts}=crackWalk(cx,cy,a0+i/n*Math.PI*2+rnd(-.5,.5),L*rnd(.6,1.05),6,.45);line(pts,w0*1.1,w0*.15,.9);
  // 금을 따라 길쭉하게 벌어진 조각(가운데가 두꺼운 렌즈 모양) + 빗금
  for(let k=1;k<pts.length-1;k++)if(Math.random()<.45){const [x0,y0]=pts[k-1],[x1,y1]=pts[k+1],dx=x1-x0,dy=y1-y0,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l,wd=l*rnd(.12,.28);
   wedges.push({poly:[[x0,y0],[(x0+x1)/2+nx*wd,(y0+y1)/2+ny*wd],[x1,y1],[(x0+x1)/2-nx*wd*.4,(y0+y1)/2-ny*wd*.4]],tone:rnd(.45,.6)});
   for(let h=0;h<4;h++){const t=(h+1)/5,mx=x0+dx*t,my=y0+dy*t;line([[mx-nx*wd*.3,my-ny*wd*.3],[mx+nx*wd*.8+dx*.05,my+ny*wd*.8+dy*.05]],w0*.25,w0*.25,.85)}}
  branch(pts[pts.length-1][0],pts[pts.length-1][1],a0,L*.3,w0*.5,1,.6)}}
 if(kind==='hair'){const n=8+Math.floor(Math.random()*6);for(let i=0;i<n;i++){const d=L*.6*Math.sqrt(Math.random()),a=Math.random()*Math.PI*2,{pts}=crackWalk(cx+Math.cos(a)*d,cy+Math.sin(a)*d,Math.random()*Math.PI*2,L*rnd(.15,.45),5,.9);line(pts,w0*rnd(.3,.55),w0*.08,rnd(.6,.85))}}
 // 잡티: 가운데에 몰리고 바깥으로 성겨지는 작은 점·얼룩(여러 번 치면 고루 퍼진다)
 const ns=Math.round(rnd(14,34)*(.7+.5*Math.min(1,power)));
 for(let i=0;i<ns;i++){const d=L*rnd(.05,1)*Math.pow(Math.random(),.7),a=Math.random()*Math.PI*2;specks.push({x:cx+Math.cos(a)*d,y:cy+Math.sin(a)*d,rx:Math.max(.5,L*rnd(.004,.02)),ry:Math.max(.5,L*rnd(.004,.014)),rot:Math.random()*Math.PI,tone:rnd(.45,.85)})}
 // 곱하기 색: 그 자리 그림을 아주 어둡게 한 색(tone 1)과 흰색(0) 사이
 const dark=[r*.22,gg*.18,b*.18];
 return {id:z.id,x:p.x,y:p.y,lines,wedges,specks,dark,at:elapsed};
}
const crackTone=(c,t)=>`rgb(${Math.round(255-t*(255-c.dark[0]))},${Math.round(255-t*(255-c.dark[1]))},${Math.round(255-t*(255-c.dark[2]))})`;
function drawCrack(ctx,c,k,ox,oy){
 ctx.lineCap='round';ctx.lineJoin='round';
 const X=x=>(x+ox)*k,Y=y=>(y+oy)*k;
 for(const w of c.wedges){ctx.fillStyle=crackTone(c,w.tone);ctx.beginPath();w.poly.forEach(([x,y],i)=>i?ctx.lineTo(X(x),Y(y)):ctx.moveTo(X(x),Y(y)));ctx.closePath();ctx.fill()}
 for(const l of c.lines){ctx.strokeStyle=crackTone(c,l.tone);for(let i=0;i<l.pts.length-1;i++){ctx.lineWidth=Math.max(.6,(l.w[i]+l.w[i+1])/2*k);ctx.beginPath();ctx.moveTo(X(l.pts[i][0]),Y(l.pts[i][1]));ctx.lineTo(X(l.pts[i+1][0]),Y(l.pts[i+1][1]));ctx.stroke()}}
 for(const s of c.specks){ctx.fillStyle=crackTone(c,s.tone);ctx.beginPath();ctx.ellipse(X(s.x),Y(s.y),s.rx*k,s.ry*k,s.rot,0,Math.PI*2);ctx.fill()}
}
const crackMasks=new Map();// 영역 모양은 바뀔 때만 다시 만든다
function crackMask(z){const key=zoneShapeKey(z),hit=crackMasks.get(z.id);if(hit?.key===key)return hit.c;const c=rawMaskCanvas(z);crackMasks.set(z.id,{key,c});return c}
function fitLayer(c){const dpr=Math.min(window.devicePixelRatio||1,2),W=Math.max(1,Math.round(surface.clientWidth*dpr)),H=Math.max(1,Math.round(surface.clientHeight*dpr));if(c.width!==W||c.height!==H){c.width=W;c.height=H}return [W,H]}
// tick이 매 프레임 부른다: 갈라짐 층과 얼굴 이펙트 층
function drawCracks(){
 hitCracks=hitCracks.filter(c=>elapsed-c.at<2.2&&zones.some(z=>z.id===c.id));
 crackLayer.hidden=!hitCracks.length;
 if(!hitCracks.length){if(crackLayer.width>1)crackLayer.width=crackLayer.height=1}
 else{
  const [W,H]=fitLayer(crackLayer),k=W/renderWidth;
  // 곱하기 층이라 바탕은 흰색(= 그림 그대로)
  crackCtx.globalCompositeOperation='source-over';crackCtx.fillStyle='#fff';crackCtx.fillRect(0,0,W,H);
  for(const z of zones){
   const list=hitCracks.filter(c=>c.id===z.id);if(!list.length)continue;
   if(crackTmp.width!==W||crackTmp.height!==H){crackTmp.width=W;crackTmp.height=H}
   const t=crackTmp.getContext('2d');t.globalCompositeOperation='source-over';t.globalAlpha=1;t.clearRect(0,0,W,H);
   for(const c of list){const age=elapsed-c.at,[dx,dy]=cpuDeformation(z,c.x,c.y);t.globalAlpha=clamp(age<1.2?1:1-(age-1.2),0,1);drawCrack(t,c,k,dx*renderWidth,dy*renderHeight)}
   // 영역 모양 밖은 잘라 내고, 흰 바탕 위에 겹친다(영역 밖으로 삐져나가지 않게)
   const [mx,my]=cpuDeformation(z,z.x,z.y);t.globalAlpha=1;t.globalCompositeOperation='destination-in';t.drawImage(crackMask(z),mx*W,my*H,W,H);
   crackCtx.drawImage(crackTmp,0,0);
  }
 }
 if(!gl)faceActive();// 그래픽 가속이 없을 때도 이펙트는 그린다
 faceFxUsed=hasFaceFx();faceFxLayer.hidden=!faceFxUsed;
 if(!faceFxUsed){if(faceFxLayer.width>1)faceFxLayer.width=faceFxLayer.height=1;return}
 const [W,H]=fitLayer(faceFxLayer),k=W/renderWidth;faceFxCtx.clearRect(0,0,W,H);
 // 물방울이 비출 그림은 원본 그림(화면을 읽으면 그래픽 카드가 매 프레임 멈춰 기다려 크게 느려진다)
 drawFaceFx(faceFxCtx,(x,y)=>[x*k,y*k],k,faceLastActive,elapsed,true,bitmap,1/k);
}

// ── 얼굴 이펙트 ──
const fxOpt=(x,key)=>{const o=x.fxo?.[key]||{};return {sp:Math.max(.1,(o.sp??100)/100),fr:Math.max(.1,(o.fr??100)/100),op:clamp((o.op??100)/100,0,2),sz:clamp((o.sz??100)/100,.2,2)}};
// 모양: 자동이면 그림체로(SD에 가까우면 캐주얼)
function faceFxStyle(g,f){return f?.fxStyle==='real'||f?.fxStyle==='casual'?f.fxStyle:g.sd>.6?'casual':'real'}
// 이펙트 자리 = 기본 자리 + 사용자가 옮긴 만큼(fxAt, 얼굴 크기 S 단위, u = 눈 선 방향, n = 위)
function faceFxShift(g,f,key){const d=f.fxAt?.[key];return d?fv.add(fv.mul(g.u,d.a*g.S),fv.mul(g.n,d.b*g.S)):{x:0,y:0}}
function faceSweatSpot(g,f,i){
 const p=f.sweatAt?.[i];if(p)return fv.add(g.C,fv.add(fv.mul(g.u,p.a*g.S),fv.mul(g.n,p.b*g.S)));
 const right=g.eyes.find(e=>e.side==='R')||g.eyes.at(-1),base=right?right.outer:g.C;// 관자놀이·이마 근처(화면 오른쪽)
 return fv.add(base,fv.add(fv.mul(g.u,g.S*(.28+.1*(i%2))),fv.mul(g.n,g.S*(.45-.32*i))));
}
// 얼굴 외곽 타원(입력 없이 짐작): 가로 = 두 눈 사이 거리의 1.25배(눈 하나면 눈 너비의 2.6배), 세로 = 눈~입 거리의 1.5배
function faceOutline(g){const e=g.eyes,eyeD=e.length===2?fv.len(fv.sub(e[1].c,e[0].c)):(e[0]?.w||g.S)*2.1;return {rx:Math.max(eyeD*1.25,g.S*.8),ry:Math.max(g.S*1.5,eyeD*1.1)}}
function faceFxAnchors(g,f){
 const right=g.eyes.find(e=>e.side==='R')||g.eyes.at(-1),cheek=g.cheeks.find(c=>c.side==='R')||g.cheeks[0];
 const at=(key,p)=>fv.add(p,faceFxShift(g,f,key));
 return {
  tear:at('tear',{x:0,y:0}),// 눈물은 눈마다 아랫꺼풀에 붙고, 옮긴 만큼만 더한다
  anger:at('anger',fv.add(g.C,fv.add(fv.mul(g.n,g.S*1.05),fv.mul(g.u,g.S*.75)))),
  heart:at('heart',cheek?fv.add(cheek.c,fv.mul(g.u,cheek.rx*1.2)):fv.add(g.C,fv.mul(g.u,g.S*.8))),
  sparkle:at('sparkle',fv.add(g.C,fv.mul(g.n,-g.S*.25))),// 얼굴 외곽 타원의 가운데(눈 선보다 조금 아래)
  right,
 };
}
// 이 얼굴에 지금 그릴 이펙트(표정을 섞은 무게로). 옵션은 그 이펙트를 가장 강하게 쓰는 표정 것을 쓴다.
function faceFxPlan(a){
 const f=faces[a.k];if(!f)return null;const P={sweat:0,sweatW:0,tear:0,flow:0,anger:0,angerBig:0,heart:0,sparkle:0,sparkleMore:0,opt:{}};
 const g=faceGeometry(a.k),take=(key,w,x)=>{if(!P.opt[key]||w>P.opt[key].w)P.opt[key]={w,...fxOpt(x,key),casual:(x.fxs?.[key]||(g.sd>.6?'casual':'real'))==='casual'}};// 모양은 이펙트마다(그 이펙트를 가장 강하게 쓰는 표정 것)
 for(const [id,w] of a.mix){const x=f.exprs[id];if(!x||w<.05)continue;const m=a.more;
  const sw=x.sw+(m>.3&&(id==='shy'||id==='surprise')&&x.sw?1:0);if(sw&&w>P.sweatW*.8){P.sweat=Math.max(P.sweat,Math.min(3,sw));P.sweatW=Math.max(P.sweatW,w);take('sweat',w,x)}
  if(x.tear){P.tear=Math.max(P.tear,w);take('tear',w,x);P.tearAmt=P.opt.tear.w===w?(x.ta||0):P.tearAmt;if(id==='cry')P.flow=Math.max(P.flow,m*w)}
  if(x.sa){P.anger=Math.max(P.anger,w);take('anger',w,x);if(id==='angry')P.angerBig=Math.max(P.angerBig,m)}
  if(x.sh){P.heart=Math.max(P.heart,w);take('heart',w,x)}
  if(x.ss){P.sparkle=Math.max(P.sparkle,w);take('sparkle',w,x);if(id==='smile')P.sparkleMore=Math.max(P.sparkleMore,m)}
 }
 return P;
}
function hasFaceFx(){return faceLastActive.some(a=>{const p=faceFxPlan(a);return p&&(p.sweat||p.tear||p.anger||p.heart||p.sparkle)})}
// ctx에 그린다. at(px,py) = 그림 화소 → 캔버스 좌표, k = 그림 화소 1개의 캔버스 크기, follow = 그림 움직임 따라가기,
// src = 물방울이 비출 그림, sk = 캔버스 좌표 → src 좌표 배율
function drawFaceFx(ctx,at,k,list,t,follow=true,src=null,sk=1){
 const move=p=>{if(!follow)return p;const ux=p.x/renderWidth,uy=p.y/renderHeight,z=hit(ux,uy);if(!z)return p;const [dx,dy]=cpuDeformation(z,ux,uy);return {x:p.x+dx*renderWidth,y:p.y+dy*renderHeight}};
 for(const a of list){
  const g=faceGeometry(a.k),P=faceFxPlan(a),f=faces[a.k];if(!P||!g.eyes.length)continue;
  const S=g.S,up=Math.atan2(g.n.y,g.n.x),A=faceFxAnchors(g,f),cas=k=>!!P.opt[k]?.casual;
  ctx.save();ctx.lineJoin=ctx.lineCap='round';
  // 반짝이: 얼굴 둘레 아무 데서나 나타나 한두 번 반짝이고 사라진다. 모양·밝기(3단계)는 하나하나 다르게.
  if(P.sparkle){const o=P.opt.sparkle,n=Math.round(2+3*o.fr+2*P.sparkleMore),c0=move(A.sparkle),FO=faceOutline(g);
   for(let i=0;i<n;i++){
    const period=(1.8+1.6*fHash(i,7))/o.sp,ph=t/period+fHash(i,3),cyc=Math.floor(ph),life=Math.min(.95,.75/o.sp)/period,q=(ph-cyc)/life;if(q>1)continue;
    // 얼굴 외곽(눈·입으로 짐작한 타원) 바로 바깥, 위쪽 반 둘레에
    const ang=-Math.PI*(.05+1.1*fHash(i,cyc)),out=1+.2*fHash(cyc,i+11);
    const p=fv.add(c0,fv.add(fv.mul(g.u,Math.cos(ang)*FO.rx*out),fv.mul(g.n,-Math.sin(ang)*FO.ry*out))),c=at(p.x,p.y);
    const twice=fHash(i+5,cyc)>.55,env=twice?Math.pow(Math.abs(Math.sin(q*Math.PI*2)),1.3)*(q<.5?1:.75):Math.sin(q*Math.PI);
    const level=[.45,.72,1][(i+cyc)%3],fat=fHash(cyc,i+23)>.7,size=S*k*(.045+.035*fHash(i,cyc+5))*(.75+.25*level)*o.sz;
    if(cas('sparkle'))faceStar(ctx,c[0],c[1],size*1.6,P.sparkle*o.op*env*level);
    else faceGlint(ctx,c[0],c[1],size,P.sparkle*o.op*env*level,fat,fHash(i+9,cyc));
   }}
  // 땀방울: 맺힘 → 살짝 부풂 → 짧게 흘러내리며 늘어짐 → 움직이는 도중에 옅어짐(빈도가 낮으면 사이에 쉼)
  if(P.sweat){const o=P.opt.sweat;for(let i=0;i<P.sweat;i++){
   const period=2.4/o.sp+(2.4/o.fr-2.4)*.5,Pq=((t/period+i*.37)%1)*(period*o.sp/2.4);if(Pq>.86)continue;
   const grow=Math.min(1,Pq/.12),swell=Pq<.12?grow:Pq<.35?1+.12*(Pq-.12)/.23:1.12,slide=Pq<.35?0:(Pq-.35)/.5,alpha=P.sweatW*o.op*(Pq<.6?1:1-(Pq-.6)/.26);
   const start=move(faceSweatSpot(g,f,i)),base=move(fv.add(faceSweatSpot(g,f,i),fv.mul(g.n,-slide*S*.22))),c=at(base.x,base.y),r=S*.065*swell*k*o.sz*(.8+.4*fHash(i,13));
   if(cas('sweat'))faceCasualDrop(ctx,c[0],c[1],r,1+.45*slide,up,alpha);
   else{if(slide>.05){const s0=at(start.x,start.y);faceWetTrail(ctx,s0,c,r*.3,alpha*.8)}faceSweatReal(ctx,c[0],c[1],r,(1.8+1.6*fHash(i,7))*(1+.5*slide),up+(fHash(i,9)-.5)*.25,alpha,src,sk,i)}
  }}
  // 눈물: 아랫꺼풀 곡선 위 바깥쪽 1/3에 기울기를 따라 맺힌다. 진할 때는 볼을 타고 흘러내린다.
  if(P.tear){const o=P.opt.tear;for(const e of g.eyes){
   const q=faceQuad(e.inner,e.lo,e.outer,20),p0=fv.add(q[15],A.tear),nx=fv.add(q[16],A.tear),ang0=Math.atan2(nx.y-p0.y,nx.x-p0.x),ang=(-Math.sin(ang0)*-g.n.x+Math.cos(ang0)*-g.n.y)<0?ang0+Math.PI:ang0,// 맺힌 방울(+y)이 늘 아래로 처지게
   m=move(p0),c=at(m.x,m.y);
   const alpha=P.tear*o.op;
   const am=P.tearAmt||0;
   if(!am){if(cas('tear'))faceCasualLens(ctx,c[0],c[1],e.w*.15*k,e.w*.065*k,ang,alpha);else faceTearPool(ctx,c[0],c[1],e.w*.17*k,e.w*.06*k,ang,up,alpha,src,sk,t+e.c.x,0)}
   else{// 보통·많음: 아랫꺼풀을 따라 차오른 물(꺼풀 선 위의 점들), 많음은 바깥쪽 1/3에 불룩 맺힘
    const rim=q.slice(am===1?6:3,20).map(pp=>{const m2=move(fv.add(pp,A.tear));return at(m2.x,m2.y)});
    faceTearRim(ctx,rim,{x:-g.n.x,y:-g.n.y},e.h*k*(am===1?.09:.13),am,alpha,src,sk,cas('tear'),t+e.c.x)}
   if(P.flow>.05){
    const Pq=(t/1.8)%1,len=Math.min(1,Pq/.6)*e.h*1.6,fade=Pq<.6?1:Math.max(0,1-(Pq-.6)/.4),steps=12,pts=[];
    for(let s=0;s<=steps;s++){const pp=move(fv.add(p0,fv.add(fv.mul(g.n,-len*s/steps),fv.mul(g.u,Math.sin(s*.8)*e.w*.02))));pts.push(at(pp.x,pp.y))}
    if(len>1)faceTearStream(ctx,pts,e.w*.05*k,P.flow*fade*o.op,cas('tear'),up,src,sk);
   }
  }}
  // 💢: 머리 위 바깥쪽. 진할 때 커진다.
  if(P.anger){const o=P.opt.anger,pos=move(A.anger),c=at(pos.x,pos.y),beat=Math.sin(t*7*o.sp),pop=o.fr<1?Math.max(0,Math.sin(t*o.fr*2)):1,sz=S*.2*k*(1+.5*P.angerBig)*(1+.08*beat)*o.sz;
   if(cas('anger'))faceAngerCasual(ctx,c[0],c[1],sz,P.anger*o.op*pop);else faceAnger(ctx,c[0],c[1],sz,P.anger*o.op*pop)}
  // 하트: 얼굴에서 둥실 떠올라 한 번 반짝이고, 비눗방울처럼 '뾱' 터지며 사라진다
  if(P.heart){const o=P.opt.heart,n=Math.max(1,Math.round(2*o.fr));for(let i=0;i<n;i++){
   const ph=t/(2.6/o.sp)+i/n,Pq=ph%1,v=fHash(i,Math.floor(ph));if(Pq>.92)continue;// v: 이 하트의 모양·색(한 번 떠오를 때마다 바뀜)
   const rise=Math.min(Pq,.78),pos=move(fv.add(A.heart,fv.add(fv.mul(g.u,S*(.1*Math.sin(i*2.3+rise*5)+.15*(i%2?-1:1)*fHash(i,Math.floor(t/(2.6/o.sp))))),fv.mul(g.n,S*(.05+.6*rise))))),c=at(pos.x,pos.y);
   const base=S*.11*k*(.55+.45*Math.min(1,Pq*4))*o.sz;
   if(Pq<.78){faceHeartShape(ctx,c[0],c[1],base*(.8+.4*v),Math.sin(Pq*6+i)*.15+(v-.5)*.4,P.heart*o.op,cas('heart'),v);
    const fl=Pq>.48&&Pq<.66?Math.sin((Pq-.48)/.18*Math.PI):0;if(fl>0)faceGlint(ctx,c[0]-base*.35,c[1]-base*.4,base*.22,P.heart*o.op*fl,false,.5)}// 한 번 반짝
   else faceHeartPop(ctx,c[0],c[1],base*(.8+.4*v),(Pq-.78)/.14,P.heart*o.op,cas('heart'),i,v);
  }}
  ctx.restore();
 }
}
// ── 실사풍 모양 ──
function dropPath(ctx,r,h){ctx.beginPath();ctx.moveTo(0,-h);ctx.bezierCurveTo(r*.55,-h*.45,r,-r*.1,r,r*.15);ctx.arc(0,r*.15,r,0,Math.PI);ctx.bezierCurveTo(-r,-r*.1,-r*.55,-h*.45,0,-h);ctx.closePath()}
function faceSpecular(ctx,x,y,r,a=1){const gr=ctx.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(255,255,255,${.95*a})`);gr.addColorStop(.45,`rgba(255,255,255,${.5*a})`);gr.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gr;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
// 렌즈: 둘레 그림을 1.4배로 키우고 뒤집어 비춘다(clip 안에서 부른다)
function faceRefract(ctx,src,sk,x,y,s,rot){if(!src)return;ctx.save();ctx.rotate(-rot);ctx.scale(1,-1);try{ctx.drawImage(src,(x-s/1.4)*sk,(y-s/1.4)*sk,2*s/1.4*sk,2*s/1.4*sk,-s,-s,2*s,2*s)}catch(_){}ctx.restore()}
// 땀방울(실사): 투명한 물방울. 안은 그림을 비추고, 한쪽에 얇은 어두운 테두리, 위에 강한 반사광·아래에 부드러운 반사.
function faceWaterDrop(ctx,x,y,r,stretch,up,alpha,src,sk){
 if(alpha<=.01||r<=.5)return;const h=r*1.7*stretch,rot=up+Math.PI/2;
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.globalAlpha=clamp(alpha,0,1);
 ctx.save();ctx.translate(r*.15,r*.3);dropPath(ctx,r,h);ctx.fillStyle='rgba(0,0,0,.14)';ctx.fill();ctx.restore();
 dropPath(ctx,r,h);ctx.save();ctx.clip();faceRefract(ctx,src,sk,x,y,r*1.6,rot);
 const rim=ctx.createRadialGradient(-r*.2,0,r*.2,0,r*.1,r*1.15);rim.addColorStop(0,'rgba(255,255,255,.06)');rim.addColorStop(.7,'rgba(0,0,0,.06)');rim.addColorStop(1,'rgba(0,0,0,.3)');
 ctx.fillStyle=rim;ctx.fillRect(-r*2,-h*2,r*4,h*4);ctx.restore();
 ctx.lineWidth=Math.max(.6,r*.1);ctx.strokeStyle='rgba(40,30,30,.4)';ctx.beginPath();ctx.arc(0,r*.15,r*.95,-.2,Math.PI*.75);ctx.stroke();// 그늘진 쪽 테두리
 faceSpecular(ctx,-r*.35,-r*.15,r*.38);faceSpecular(ctx,r*.3,r*.7,r*.22,.55);
 ctx.restore();
}
// 땀방울(실사, 레퍼런스): 아래는 둥근 방울, 위로 가늘게 늘어진 물줄기. 안은 그림을 비추고, 그늘 쪽 얇은 테두리,
// 방울 위쪽에 길쭉한 강한 반사광·작은 점 반사, 아래 테두리에 밝은 빛. 방울마다 길이·기울기가 다르고 가끔 작은 물방울이 곁에.
function faceSweatReal(ctx,x,y,r,len,up,alpha,src,sk,seed){
 if(alpha<=.01||r<=.5)return;const L=r*len,rot=up+Math.PI/2,tw=r*.22;
 const path=()=>{ctx.beginPath();ctx.moveTo(-tw,-L);ctx.quadraticCurveTo(-tw*1.1,-L*.45,-r*.92,-r*.15);ctx.arc(0,0,r,Math.PI*1.05,Math.PI*-.05,true);ctx.quadraticCurveTo(tw*1.2,-L*.45,tw,-L);ctx.arc(0,-L,tw,0,Math.PI,true);ctx.closePath()};
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.globalAlpha=clamp(alpha,0,1);
 ctx.save();ctx.translate(r*.12,r*.25);path();ctx.fillStyle='rgba(0,0,0,.12)';ctx.fill();ctx.restore();
 path();ctx.save();ctx.clip();faceRefract(ctx,src,sk,x,y,Math.max(r*1.6,L*.7),rot);
 const g1=ctx.createLinearGradient(-r,0,r,0);g1.addColorStop(0,'rgba(0,0,0,.22)');g1.addColorStop(.35,'rgba(255,255,255,.06)');g1.addColorStop(.8,'rgba(0,0,0,.05)');g1.addColorStop(1,'rgba(0,0,0,.28)');
 ctx.fillStyle=g1;ctx.fillRect(-r*2,-L-r,r*4,L+r*3);ctx.restore();
 ctx.lineWidth=Math.max(.6,r*.09);ctx.strokeStyle='rgba(40,30,30,.38)';ctx.beginPath();ctx.arc(0,0,r*.95,-.15,Math.PI*.8);ctx.stroke();
 ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=Math.max(.5,r*.08);ctx.beginPath();ctx.arc(0,0,r*.78,Math.PI*.2,Math.PI*.7);ctx.stroke();
 ctx.fillStyle='rgba(255,255,255,.92)';ctx.beginPath();ctx.ellipse(-r*.38,-r*.28,r*.13,r*.42,.15,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.ellipse(-tw*.2,-L*.55,tw*.35,L*.12,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.6)';ctx.fill();
 faceSpecular(ctx,-r*.1,-r*.55,r*.16,.9);
 ctx.restore();
}
// 흘러내린 자국: 젖은 광택 줄
function faceWetTrail(ctx,a,b,w,alpha){ctx.save();ctx.globalAlpha=clamp(alpha,0,1)*.6;ctx.lineCap='round';ctx.strokeStyle='rgba(0,0,0,.08)';ctx.lineWidth=Math.max(1,w*2);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=Math.max(.6,w*.6);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.restore()}
// 고인 눈물(실사): 아랫꺼풀을 따라 길쭉한 물. 어두운 테두리 조각 + 흰 반사 덩어리 몇 개 + 아래로 살짝 맺힌 방울(레퍼런스).
// 고인 눈물(실사, 레퍼런스): 아랫꺼풀을 따라 고인 물. 어두운 테두리 조각 + 흰 반사 덩어리. 양(am 0 적음·1 보통·2 많음)이 많을수록
// 꺼풀을 따라 길고 두꺼워지고, 아래로 맺힌 방울이 커져 '많음'은 금방이라도 흐를 듯 그렁그렁하다.
function faceTearPool(ctx,x,y,rx,ry,ang,up,alpha,src,sk,seed,am=0){
 if(alpha<=.01||rx<=.5)return;
 rx*=[1,1.3,1.55][am];ry*=[1,1.5,2][am];const drip=[.6,1.1,1.8][am],sway=am===2?.08*Math.sin(seed*3.1):0;
 ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=clamp(alpha,0,1);
 const dx=rx*.15,dy=ry*(1+drip)*(1+sway);
 const shape=()=>{ctx.beginPath();ctx.moveTo(-rx,0);ctx.bezierCurveTo(-rx*.6,-ry*1.05,rx*.6,-ry*1.05,rx,0);ctx.bezierCurveTo(rx*.75,ry*.8,dx+ry*.9,ry*.8,dx+ry*.7,dy-ry*.5);
  ctx.bezierCurveTo(dx+ry*.75,dy+ry*.15,dx-ry*.75,dy+ry*.15,dx-ry*.7,dy-ry*.5);ctx.bezierCurveTo(dx-ry*.8,ry*.8,-rx*.7,ry*.85,-rx,0);ctx.closePath()};
 shape();ctx.save();ctx.clip();faceRefract(ctx,src,sk,x,y,Math.max(rx,dy)*1.3,ang);
 const rim=ctx.createRadialGradient(0,ry*.3,ry*.3,0,ry*.3,Math.max(rx,dy)*1.1);rim.addColorStop(0,'rgba(255,255,255,.08)');rim.addColorStop(1,'rgba(0,0,0,.25)');ctx.fillStyle=rim;ctx.fillRect(-rx*2,-rx*2,rx*4,rx*4+dy*2);ctx.restore();
 ctx.lineWidth=Math.max(.7,ry*.16);ctx.strokeStyle='rgba(30,22,28,.6)';shape();ctx.setLineDash([rx*.5,rx*.25,rx*.8,rx*.3]);ctx.stroke();ctx.setLineDash([]);
 const sh=.85+.15*Math.sin(seed*2.7);ctx.fillStyle=`rgba(255,255,255,${.95*sh})`;
 for(const [bx,by,bw,bh] of [[-rx*.45,-ry*.35,rx*.28,ry*.32],[rx*.25,-ry*.4,rx*.14,ry*.22],[dx-ry*.25,dy-ry*.35,ry*.18,ry*.3]]){ctx.beginPath();ctx.ellipse(bx,by,bw,bh,-.3,0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
// 차오른 눈물(보통·많음, 레퍼런스): 아랫꺼풀 선을 따라 얇게 고인 물. 위쪽 가장자리는 꺼풀 선에 붙고 아래로 두께가 있다(가운데~바깥이 두껍다).
// 많음은 바깥쪽 1/3에 물이 불룩 맺혀 금방이라도 흐를 듯. 안은 그림을 비추고, 아래 테두리는 어두운 조각, 위에는 흰 반사 줄·덩어리.
function faceTearRim(ctx,pts,down,th,am,alpha,src,sk,casual,seed){
 if(alpha<=.01||pts.length<3||th<=.3)return;const n=pts.length;
 const thick=i=>{const u=i/(n-1);let w=Math.pow(Math.sin(Math.PI*u),.7)*(.6+.6*u);if(am===2)w*=1+1.7*Math.exp(-Math.pow((u-.72)/.1,2))*(1+.06*Math.sin(seed*3.3));return th*w};
 const top=pts.map(([x,y],i)=>[x-down.x*thick(i)*.25,y-down.y*thick(i)*.25]),bot=pts.map(([x,y],i)=>[x+down.x*thick(i),y+down.y*thick(i)]);
 const shape=()=>{ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));for(let i=n-1;i>=0;i--)ctx.lineTo(...bot[i]);ctx.closePath()};
 ctx.save();ctx.globalAlpha=clamp(alpha,0,1);ctx.lineJoin='round';ctx.lineCap='round';
 if(casual){shape();ctx.fillStyle='rgba(170,215,255,.6)';ctx.fill();ctx.lineWidth=Math.max(1,th*.2);ctx.strokeStyle='rgba(70,130,200,.8)';ctx.stroke()}
 else{
  const [cx,cy]=pts[Math.floor(n*.6)],R=Math.hypot(pts[n-1][0]-pts[0][0],pts[n-1][1]-pts[0][1])*.6+th*3;
  shape();ctx.save();ctx.clip();if(src){ctx.save();ctx.translate(cx,cy);ctx.scale(1,-1);try{ctx.drawImage(src,(cx-R/1.3)*sk,(cy-R/1.3)*sk,2*R/1.3*sk,2*R/1.3*sk,-R,-R,2*R,2*R)}catch(_){}ctx.restore()}
  ctx.fillStyle='rgba(255,255,255,.07)';ctx.fill();ctx.restore();
  ctx.beginPath();bot.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.setLineDash([th*1.6,th*.7,th*2.4,th*.9]);ctx.lineWidth=Math.max(.7,th*.16);ctx.strokeStyle='rgba(30,22,28,.55)';ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();top.slice(Math.floor(n*.2),Math.floor(n*.85)).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.lineWidth=Math.max(.6,th*.18);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.92)';for(const u of am===2?[.45,.7,.78]:[.5,.75]){const i=Math.round(u*(n-1)),[x,y]=pts[i],d=thick(i)*.45;ctx.beginPath();ctx.ellipse(x+down.x*d,y+down.y*d,Math.max(.6,th*.28),Math.max(.6,th*.18),Math.atan2(down.y,down.x)+Math.PI/2,0,Math.PI*2);ctx.fill()}
 }
 ctx.restore();
}
function faceTearStream(ctx,pts,w,alpha,casual,up,src,sk){
 if(alpha<=.01)return;ctx.save();ctx.globalAlpha=clamp(alpha,0,1);ctx.lineCap='round';ctx.lineJoin='round';
 const path=()=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p))};
 if(casual){path();ctx.strokeStyle='rgba(60,125,195,.85)';ctx.lineWidth=Math.max(1.5,w*1.3);ctx.stroke();path();ctx.strokeStyle='rgba(175,220,255,.95)';ctx.lineWidth=Math.max(1,w*.8);ctx.stroke()}
 else{path();ctx.strokeStyle='rgba(30,22,28,.45)';ctx.lineWidth=Math.max(1.2,w*1.2);ctx.stroke();path();ctx.strokeStyle='rgba(235,240,245,.55)';ctx.lineWidth=Math.max(.8,w*.85);ctx.stroke();path();ctx.strokeStyle='rgba(255,255,255,.9)';ctx.lineWidth=Math.max(.5,w*.25);ctx.stroke()}
 ctx.restore();
 const e=pts.at(-1);if(casual)faceCasualDrop(ctx,e[0],e[1],w*1.1,1.1,up,alpha);else faceWaterDrop(ctx,e[0],e[1],w*1.1,1.1,up,alpha,src,sk);
}
// 반짝이(실사): 밝은 점 + 가로로 길고 세로로 짧은 빛줄기 + 짧은 대각선. 뚱뚱한 것은 점이 크고 줄기가 짧고 굵다.
function faceGlint(ctx,x,y,r,alpha,fat=false,v=.5){
 if(alpha<=.01||r<=.3)return;
 ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=clamp(alpha,0,1);ctx.translate(x,y);
 const cr=r*(fat?3:2.1);const core=ctx.createRadialGradient(0,0,0,0,0,cr);core.addColorStop(0,'rgba(255,255,250,1)');core.addColorStop(.25,'rgba(255,246,215,.7)');core.addColorStop(1,'rgba(255,230,180,0)');
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,cr,0,Math.PI*2);ctx.fill();
 // 가로·세로 길이는 따로 무작위(어느 쪽으로도 치우치지 않게), 둘 다 예전 세로(7r)의 60% 이하
 const w2=fHash(v*53,4),H=r*(fat?1.6+.9*v:2.5+1.7*v),V=r*(fat?1.6+.9*w2:2.5+1.7*w2),wd=r*(fat?.38:.2);
 for(const [ang,len,wid,a] of [[0,H,wd,1],[Math.PI/2,V,wd*.9,.9],[Math.PI/4,r*(fat?1.6:2.4),wd*.55,.45],[-Math.PI/4,r*(fat?1.6:2.4),wd*.55,.45]]){
  ctx.save();ctx.rotate(ang);const lg=ctx.createLinearGradient(-len,0,len,0);lg.addColorStop(0,'rgba(255,240,210,0)');lg.addColorStop(.5,`rgba(255,252,240,${a})`);lg.addColorStop(1,'rgba(255,240,210,0)');
  ctx.fillStyle=lg;ctx.beginPath();ctx.moveTo(-len,0);ctx.quadraticCurveTo(0,-wid,len,0);ctx.quadraticCurveTo(0,wid,-len,0);ctx.fill();ctx.restore()}
 ctx.restore();
}
// 💢(실사): 테두리 없이 차분한 붉은색(채도를 낮춘 진홍) 그라데이션 + 은은한 빛
function faceAnger(ctx,x,y,sz,alpha){
 if(alpha<=.01)return;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(alpha,0,1);ctx.lineCap='round';
 for(let q=0;q<4;q++){ctx.save();ctx.rotate(q*Math.PI/2+.2);
  const path=()=>{ctx.beginPath();ctx.moveTo(sz*.22,-sz*.95);ctx.quadraticCurveTo(sz*.28,-sz*.28,sz*.95,-sz*.22)};
  ctx.shadowColor='rgba(170,35,30,.4)';ctx.shadowBlur=sz*.3;
  const gr=ctx.createLinearGradient(sz*.2,-sz*.95,sz*.95,-sz*.2);gr.addColorStop(0,'#d6564a');gr.addColorStop(.5,'#b3302a');gr.addColorStop(1,'#7c1a18');
  path();ctx.strokeStyle=gr;ctx.lineWidth=Math.max(1.5,sz*.24);ctx.stroke();ctx.shadowBlur=0;
  path();ctx.strokeStyle='rgba(255,200,185,.4)';ctx.lineWidth=Math.max(.6,sz*.05);ctx.stroke();
  ctx.restore()}
 ctx.restore();
}
function heartPath(ctx,sz){ctx.beginPath();ctx.moveTo(0,sz*.9);ctx.bezierCurveTo(-sz*1.4,-sz*.1,-sz*.6,-sz*1.1,0,-sz*.35);ctx.bezierCurveTo(sz*.6,-sz*1.1,sz*1.4,-sz*.1,0,sz*.9);ctx.closePath()}
// 하트 색: 캐주얼은 분홍·빨강·연분홍·살구 중 하나(단색), 실사는 네온 분홍·자홍
const HEART_FLAT=['#ff5c8a','#ff8fab','#e8304f','#ffc2d1','#ff7a6b','#f9a8c9'];
// 하트(실사 = 네온: 외곽선만 빛남 · 겹 외곽선 · 빛나는 채움 중 v로 고름 / 캐주얼 = 테두리 없이 단색 채움, 은은한 번짐)
// 하트(디테일하게 = 빛줄기로 그린 하트, 레퍼런스: 가는 흰 심 + 색 번짐, 굵기가 고르지 않고 아래 끝이 살짝 열림, 둘레에 빛 알갱이.
// v로 색(분홍·라벤더 / 하늘·푸른빛)과 겹줄 여부가 바뀐다. 캐주얼 = 테두리 없는 단색 채움)
function heartPt(t,sz){const s=Math.sin(t);return [sz*s*s*s/1.05,-sz*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))/16-sz*.15]}
function faceHeartShape(ctx,x,y,sz,rot,alpha,casual,v=.5){
 if(alpha<=.01||sz<=.3)return;
 ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.globalAlpha=clamp(alpha,0,1);
 if(casual){const col=HEART_FLAT[Math.floor(v*HEART_FLAT.length)%HEART_FLAT.length];ctx.shadowColor=col;ctx.shadowBlur=sz*.35;heartPath(ctx,sz);ctx.fillStyle=col;ctx.fill();ctx.restore();return}
 // 색은 하트 톤 안에서만: 분홍 · 장미 · 빨강
 const tone=Math.floor(v*3)%3,glow=[[255,120,190],[255,90,140],[255,60,80]][tone],mid=[[255,205,232],[255,190,210],[255,175,180]][tone],gap=.05+.06*fHash(v*97,1),N=48;
 ctx.lineCap='round';
 const trail=(s,a)=>{let prev=heartPt(gap,s);for(let i=1;i<=N;i++){const t=gap+(Math.PI*2-2*gap)*i/N,p=heartPt(t,s),w=sz*(.04+.05*Math.abs(Math.sin(t*1.1+v*3)))*(i<4||i>N-4?.5:1);
   for(const [lw,col,blur] of [[w*5,`rgba(${glow},${.12*a})`,sz*.5],[w*2.2,`rgba(${mid},${.55*a})`,sz*.15],[w*.8,`rgba(255,255,255,${.95*a})`,0]]){ctx.shadowColor=`rgba(${glow},${a})`;ctx.shadowBlur=blur;ctx.strokeStyle=col;ctx.lineWidth=Math.max(.5,lw);ctx.beginPath();ctx.moveTo(...prev);ctx.lineTo(...p);ctx.stroke()}
   prev=p}};
 trail(sz,1);if(fHash(v*31,2)>.55)trail(sz*.93,.45);ctx.shadowBlur=0;
 // 빛 알갱이: 아래 양옆으로 흩날리며 깜빡인다
 ctx.globalCompositeOperation='lighter';
 for(let i=0;i<14;i++){const a=fHash(i,v*13)*Math.PI*2,side=i%2?1:-1,px=side*sz*(.5+.7*fHash(i,5)),py=sz*(.1+.6*fHash(i,7)),r=sz*(.02+.05*fHash(i,9)),tw=.5+.5*Math.sin(performance.now()/180+i*1.7);
  const gr=ctx.createRadialGradient(px,py,0,px,py,r*3);gr.addColorStop(0,`rgba(${i%3?glow:mid},${.9*tw})`);gr.addColorStop(1,`rgba(${glow},0)`);ctx.fillStyle=gr;ctx.beginPath();ctx.arc(px,py,r*3,0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
// 터지는 하트: 살짝 부풀며 옅어지고, 작은 조각과 얇은 고리가 퍼진다(비눗방울이 '뾱')
function faceHeartPop(ctx,x,y,sz,q,alpha,casual,seed,v=.5){
 q=clamp(q,0,1);const col=casual?HEART_FLAT[Math.floor(v*HEART_FLAT.length)%HEART_FLAT.length]:'rgba(245,60,160,.9)';
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(alpha*(1-q),0,1);
 if(q<.35){heartPath(ctx,sz*(1+q*1.2));ctx.fillStyle=col;ctx.globalAlpha*=.55;ctx.fill();ctx.globalAlpha=clamp(alpha*(1-q),0,1)}
 ctx.lineWidth=Math.max(.8,sz*.08);ctx.strokeStyle=col;ctx.beginPath();ctx.arc(0,0,sz*(.6+1.2*q),0,Math.PI*2);ctx.stroke();
 ctx.fillStyle=col;for(let i=0;i<7;i++){const a=i/7*Math.PI*2+seed,d=sz*(.5+1.6*q);ctx.beginPath();ctx.arc(Math.cos(a)*d,Math.sin(a)*d,Math.max(.6,sz*.1*(1-q)),0,Math.PI*2);ctx.fill()}
 ctx.restore();
}
// ── 캐주얼·SD 모양: 테두리 있는 단순한 도형 ──
function faceCasualDrop(ctx,x,y,r,stretch,up,alpha){
 if(alpha<=.01||r<=.3)return;const h=r*1.7*stretch;
 ctx.save();ctx.translate(x,y);ctx.rotate(up+Math.PI/2);ctx.globalAlpha=clamp(alpha,0,1);
 dropPath(ctx,r,h);ctx.fillStyle='rgba(175,220,255,.75)';ctx.fill();ctx.lineWidth=Math.max(1,r*.16);ctx.strokeStyle='rgba(60,125,195,.9)';ctx.stroke();
 ctx.beginPath();ctx.ellipse(-r*.35,-r*.05,r*.18,r*.3,-.3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.95)';ctx.fill();ctx.restore();
}
function faceCasualLens(ctx,x,y,rx,ry,ang,alpha){
 if(alpha<=.01)return;ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=clamp(alpha,0,1);
 ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fillStyle='rgba(170,215,255,.6)';ctx.fill();ctx.lineWidth=Math.max(1,ry*.25);ctx.strokeStyle='rgba(70,130,200,.8)';ctx.stroke();
 ctx.beginPath();ctx.ellipse(-rx*.35,-ry*.3,rx*.22,ry*.28,0,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.9)';ctx.fill();ctx.restore();
}
// 💢(캐주얼): 굵은 빨간 획 + 검은 테두리 + 아래로 비킨 그림자(레퍼런스)
function faceAngerCasual(ctx,x,y,sz,alpha){
 if(alpha<=.01)return;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(alpha,0,1);ctx.lineCap='round';
 const arm=()=>{ctx.beginPath();ctx.moveTo(sz*.2,-sz*.95);ctx.quadraticCurveTo(sz*.22,-sz*.22,sz*.95,-sz*.2)};
 for(const pass of [0,1,2])for(let q=0;q<4;q++){ctx.save();ctx.rotate(q*Math.PI/2+.15);
  if(pass===0){ctx.translate(sz*.06,sz*.08);arm();ctx.strokeStyle='#000';ctx.lineWidth=sz*.42;ctx.stroke()}
  if(pass===1){arm();ctx.strokeStyle='#000';ctx.lineWidth=sz*.42;ctx.stroke()}
  if(pass===2){arm();ctx.strokeStyle='#ff1f1f';ctx.lineWidth=sz*.26;ctx.stroke()}
  ctx.restore()}
 ctx.restore();
}
function faceStar(ctx,x,y,sz,alpha){
 if(alpha<=.01)return;ctx.save();ctx.translate(x,y);ctx.globalAlpha=clamp(alpha,0,1);ctx.beginPath();
 for(let q=0;q<8;q++){const rr=q%2?sz*.28:sz,aa=q/8*Math.PI*2-Math.PI/2;ctx.lineTo(Math.cos(aa)*rr,Math.sin(aa)*rr)}ctx.closePath();
 ctx.fillStyle='#fffbe0';ctx.fill();ctx.lineWidth=Math.max(1,sz*.12);ctx.strokeStyle='rgba(150,110,20,.85)';ctx.stroke();ctx.restore();
}
