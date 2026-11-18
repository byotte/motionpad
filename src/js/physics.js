/* MotionPad 0.4.2 : render-independent physics and secondary motion upgrade.
   Coordinates in renderers are normalized image UV (0..1, origin at top-left). */
/* Render-independent physics: output positions and displacements in normalized image UV.
   The Canvas fallback and WebGL shader consume the same motion outputs. */
const MotionPhysics=Object.freeze({
  // 2-C 쉬는 간격: 움직임(약 2.5초/속도) → 부드럽게 멈춤 → autoRest초 쉼 → 다시. 0이면 늘 1(이전과 같음).
  restEnvelope(z,t){
    const rest=clamp(z.autoRest||0,0,6);if(!rest)return 1;
    const active=2.5/(z.autoSpeed||1),fade=Math.min(.6,active/3),period=active+rest;
    const u=(((t+(z.phase||0)*.37)%period)+period)%period;
    if(u>=active)return 0;
    const s=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
    return Math.min(s(u/fade),s((active-u)/fade));
  },
  wave(t,phase=0){return .78*Math.sin(t+phase)+.22*Math.sin(t*.57+phase*.31+.75)},
  wind(z,t){
    const size=clamp((z.windStrength||0)/100,0,1.65);
    if(size===0)return [0,0];
    const speed=z.windSpeed||1,phase=z.phase||0,noise=(z.windNoise||0)/100;
    const gust=clamp(.50+.30*this.wave(t*1.4*speed,phase)+noise*(.15*Math.sin(t*3.1*speed+phase*.7)+.08*Math.sin(t*5.3*speed+phase)),.08,1.15);
    const a=(z.windAngle||0)*Math.PI/180;
    return [Math.cos(a)*gust*size*.024,Math.sin(a)*gust*size*.024];
  },
  chain(z,key,count,dt,t,wind,motion,anchorShift=[0,0]){
    const points=z[key];if(!Array.isArray(points)||points.length<2)return {tip:[0,0],mid:[0,0]};
    const store=key==='branch'?'branchNodes':'chainNodes';
    if(!z[store]||z[store].length!==count){z[store]=Array.from({length:count},(_,i)=>{const p=spinePoint(points,i/(count-1));return {x:p[0],y:p[1],vx:0,vy:0}})}
    const nodes=z[store],k=clamp((z.spring||14),3,30),delay=(z.windDelay??50)/100;
    nodes[0].x=points[0][0]+anchorShift[0];nodes[0].y=points[0][1]+anchorShift[1];nodes[0].vx=nodes[0].vy=0;
    for(let i=1;i<count;i++){
      const f=i/(count-1),p=spinePoint(points,f),prev=nodes[i-1];
      const phaseLag=delay*f*1.0;
      const wave=this.wave(t*(z.windSpeed||1)*1.7-phaseLag*2.1,(z.phase||0)+(key==='branch'?.85:0));
      const dir=(z.windAngle||0)*Math.PI/180;
      const wiggle=clamp((z.windStrength||0)/100,0,1.65)*.007*wave*f*f;
      const toward=[p[0]+anchorShift[0]+(wind[0]+motion[0])*(f*f)+Math.cos(dir)*wiggle,
                    p[1]+anchorShift[1]+(wind[1]+motion[1])*(f*f)+Math.sin(dir)*wiggle];
      // A spring follows both its rest position and the preceding segment's displacement.
      const originPrev=spinePoint(points,(i-1)/(count-1));
      const tx=toward[0]+(prev.x-originPrev[0])*(.10+delay*.20),
            ty=toward[1]+(prev.y-originPrev[1])*(.10+delay*.20);
      const stiffness=clamp(k*(1.22-f*.38),4,36);
      const damp=Math.exp(-(2.3+(100-(z.damping||62))*.047)*dt);
      const ax=clamp((tx-nodes[i].x)*stiffness*stiffness,-2,2),ay=clamp((ty-nodes[i].y)*stiffness*stiffness,-2,2);
      nodes[i].vx=(nodes[i].vx+ax*dt)*damp;nodes[i].vy=(nodes[i].vy+ay*dt)*damp;
      nodes[i].x=clamp(nodes[i].x+nodes[i].vx*dt,p[0]-.055,p[0]+.055);
      nodes[i].y=clamp(nodes[i].y+nodes[i].vy*dt,p[1]-.055,p[1]+.055);
    }
    const middle=nodes[Math.floor(count/2)],midRest=spinePoint(points,Math.floor(count/2)/(count-1));
    const tip=nodes[count-1],rest=points[points.length-1];
    return {tip:[clamp(tip.x-rest[0],-.042,.042),clamp(tip.y-rest[1],-.042,.042)],
           mid:[clamp(middle.x-midRest[0],-.042,.042),clamp(middle.y-midRest[1],-.042,.042)]};
  },
  step(z,dt,t){
    const k=clamp(z.spring||14,3,30),d=clamp(z.damping??62,0,100);
    const friction=Math.exp(-(3.7+(100-d)*.068)*dt);
    const px=z.dragging?(z.desiredX||0):0,py=z.dragging?(z.desiredY||0):0,ps=z.dragging?(z.desiredScale||0):0;
    // A smooth damped spring with an exact stable target during sustained drags.
    for(const [pos,vel,target] of [['physX','physVX',px],['physY','physVY',py],['physScale','physSV',ps]]){
      z[vel]=((z[vel]||0)+(target-(z[pos]||0))*k*k*dt)*friction;
      const lim=pos==='physScale'?.030:.030*(1+1.5*(z.pull??50)/100);
      z[pos]=clamp((z[pos]||0)+z[vel]*dt,-lim,lim);
    }
    const env=this.restEnvelope(z,t)*motionCalm;z.autoEnv=env;// motionCalm: 영역을 그리는 도구를 쓰는 동안 저절로 움직임을 잦아들게(controls.js)
    const wind=this.wind(z,t).map(v=>v*env);
    const strength=clamp(z.autoStrength??z.strength??0,0,80)/80;// 연속 움직임 세기(4-1), 터치 반응 세기(strength)와 따로
    const idle=z.auto?this.wave(t*1.18*(z.autoSpeed||1),z.phase)*strength*env:0;
    const autoAxis=z.autoAxis||z.axis,[axisX,axisY]=TAP_DIRECTIONS[autoAxis]||[0,-1];
    // 양쪽 위로·아래로: 왼쪽 위(아래)로 한 번, 오른쪽 위(아래)로 한 번 번갈아 편다. 가운데를 지날 때 제자리로 내려온다.
    const arc=autoAxis==='arcUp'?-1:autoAxis==='arcDown'?1:0,sw=arc?this.wave(t*1.18*(z.autoSpeed||1),z.phase):0;
    const turn=autoAxis==='tilt'||autoAxis==='spin';
    const idleX=autoAxis==='pulse'||turn?0:arc?idle*.022*.85:idle*.022*axisX;
    const idleY=autoAxis==='pulse'||turn?0:arc?arc*sw*sw*strength*env*.022*.75:idle*.022*axisY;
    // 회전: 갸웃 = 한쪽으로 기울어 잠깐 멈추고 반대쪽으로 기울어 멈춤(sin을 잘라 양 끝에 머문다), 계속 돌기 = 한 방향으로 계속(4초에 한 바퀴 × 빠르기)
    if(z.auto&&autoAxis==='tilt'){const s=clamp(1.7*Math.sin(t*1.3*(z.autoSpeed||1)+z.phase),-1,1);z.rotAngle=s*(.25+.75*strength)*.32*env}
    else if(z.auto&&autoAxis==='spin'){z.spinAngle=((z.spinAngle||0)+dt*(z.autoSpeed||1)*Math.PI*.5*env)%(Math.PI*2);z.rotAngle=z.spinAngle}
    else z.rotAngle=0;
    const idleScale=autoAxis==='pulse'?idle*.065:0;
    // Distinct wind force; a region may move without a hand-drawn spine.
    const w=wind;
    z.windX=w[0];z.windY=w[1];
    z.motionX=clamp(z.physX+idleX+w[0]*.42,-.048,.048);
    z.motionY=clamp(z.physY+idleY+w[1]*.42,-.048,.048);
    z.motionScale=clamp(z.physScale+idleScale,-.08,.08);
    const main=this.chain(z,'spine',6,dt,t,w,[z.physX,z.physY],[0,0]);
    let branchAnchor=[0,0];
    if(z.branch?.length>=2&&z.spine?.length>=2&&z.chainNodes?.length){
      const root=z.branch[0];let best=Infinity,idx=0;
      for(let i=0;i<z.chainNodes.length;i++){const p=spinePoint(z.spine,i/(z.chainNodes.length-1));const d=Math.hypot(p[0]-root[0],p[1]-root[1]);if(d<best){best=d;idx=i}}
      if(best<.16){const base=spinePoint(z.spine,idx/(z.chainNodes.length-1));branchAnchor=[z.chainNodes[idx].x-base[0],z.chainNodes[idx].y-base[1]]}
    }
    const branch=this.chain(z,'branch',5,dt,t,w,[z.physX*.38,z.physY*.38],branchAnchor);
    z.spineTip=main.tip;z.spineMid=main.mid;z.branchTip=branch.tip;
    z.physicsOutput={x:z.motionX,y:z.motionY,scale:z.motionScale,windX:w[0],windY:w[1],
      spineTip:main.tip,spineMid:main.mid,branchTip:branch.tip};
    return z.physicsOutput;
  }
});
function spinePoint(points,t){if(points.length<2)return points[0]||[.5,.5];const p=t*(points.length-1),j=Math.min(points.length-2,Math.floor(p)),f=p-j;return [points[j][0]*(1-f)+points[j+1][0]*f,points[j][1]*(1-f)+points[j+1][1]*f]}
const TAP_DIRECTIONS={x:[1,0],y:[0,-1],diag:[Math.SQRT1_2,Math.SQRT1_2],diagBack:[Math.SQRT1_2,-Math.SQRT1_2]};
function projectMotion(axis,x,y){
 if(axis==='pulse')return [0,0];
 const direction=TAP_DIRECTIONS[axis];
 if(!direction)return [x,y];
 const [ax,ay]=direction,amount=x*ax+y*ay;
 return [amount*ax,amount*ay];
}
function impact(z,intensity=1,p=null,dir=null,quiet=false){// quiet: 소리·표정·맞은 자리 없이 튕기기만(C-4 부위를 고른 직후)
 if(!z)return;
 const f=clamp(intensity,0,2.2),gain=dir?1:(z.tapGain??100)/100;
 const max=.004+z.strength/80*.015;
 const velocity=f*gain*max*(z.spring||14)*.68;
 // 터치 방향은 정하지 않는다: 튕기면 튕긴 쪽, 톡 치면 누른 자리에서 안쪽으로(누른 쪽이 눌리고 반대쪽은 살짝 부푼다). 누른 자리 둘레에 모이는 정도는 '잡아당김'(pull).
 const [x,y]=dir?[dir.x,dir.y]:pressDirection(z,p);
 if(p){z.grabX=p.x;z.grabY=p.y}
 z.physVX=clamp((z.physVX||0)+x*velocity,-.28,.28);
 z.physVY=clamp((z.physVY||0)+y*velocity,-.28,.28);
 z.physSV=clamp((z.physSV||0)-velocity*.18,-.20,.20);// 눌리면서 살짝 납작
 z.hitX=p?.x??z.x;z.hitY=p?.y??z.y;z.hitAt=elapsed;z.hitPower=f*gain;
 if(quiet)return;
 faceHit(z,f*gain);markHit(z,p||{x:z.x,y:z.y},f*gain);
 if(f>0){playSfx(f,z);haptic(f)}
}
function impulse(z,amount=1,p=null,dir=null){impact(z,amount,p,dir)}

// Morphological mask expansion: outside the hand-drawn boundary receives a decaying weight.
function dilateMask(source,radius){
  const w=source.width,h=source.height,base=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h);
  let mask=new Uint8Array(w*h),horizontal=new Uint8Array(w*h),vertical=new Uint8Array(w*h);
  for(let i=0;i<mask.length;i++)mask[i]=base.data[i*4+3];
  const r=Math.max(0,Math.min(26,radius|0));if(!r)return source;
  // Small radius; fast separable max filter, run only when an edited mask changes.
  const deque=new Int32Array(Math.max(w,h)+2*r+2);
  for(let y=0;y<h;y++){
    let head=0,tail=0,next=0;
    for(let x=0;x<w;x++){
      const right=Math.min(w-1,x+r);
      while(next<=right){const v=mask[y*w+next];while(tail>head&&mask[y*w+deque[tail-1]]<=v)tail--;deque[tail++]=next++;}
      while(head<tail&&deque[head]<x-r)head++;
      horizontal[y*w+x]=mask[y*w+deque[head]];
    }
  }
  for(let x=0;x<w;x++){
    let head=0,tail=0,next=0;
    for(let y=0;y<h;y++){
      const bottom=Math.min(h-1,y+r);
      while(next<=bottom){const v=horizontal[next*w+x];while(tail>head&&horizontal[deque[tail-1]*w+x]<=v)tail--;deque[tail++]=next++;}
      while(head<tail&&deque[head]<y-r)head++;
      vertical[y*w+x]=horizontal[deque[head]*w+x];
    }
  }
  for(let i=0;i<vertical.length;i++){base.data[i*4]=255;base.data[i*4+1]=255;base.data[i*4+2]=255;base.data[i*4+3]=vertical[i]}
  const out=document.createElement('canvas');out.width=w;out.height=h;out.getContext('2d').putImageData(base,0,0);return out;
}

// 누른 자리에서 영역 안쪽(가운데)으로. 가운데를 누르면 아래로(위에서 누른 것처럼).
function pressDirection(z,p){
 if(!p)return [0,1];
 const dx=z.x-p.x,dy=z.y-p.y,len=Math.hypot(dx,dy*renderHeight/renderWidth);
 if(len<Math.min(z.rx,z.ry)*.25)return [0,1];
 const l=Math.hypot(dx,dy);return [dx/l,dy/l];
}
