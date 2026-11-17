// I(시험판) 얼굴 자동 초안: 두 눈의 양 끝만 찍으면(4번) 눈꺼풀 위아래·눈썹·입을 그림 밝기로 짐작해 초안을 채우고,
// 찍힌 점·선을 끌어서 고친다. 무거운 모델 없이 밝기 훑기만 쓴다. 지금의 직접 찍기는 그대로이고 같은 칸(눈 점·입·눈썹)에 값을 채울 뿐이다.
// 빼려면 이 파일과 index.html·app.html의 한 줄씩을 지우면 된다.
const fd={pick:null,edit:false,drag:null,layer:null};
function fdLum(){// 편집용 그림의 밝기(0~255)
 const g=document.createElement('canvas');g.width=renderWidth;g.height=renderHeight;
 const c=g.getContext('2d',{willReadFrequently:true});c.drawImage(bitmap,0,0);
 const d=c.getImageData(0,0,renderWidth,renderHeight).data,L=new Float32Array(renderWidth*renderHeight);
 for(let i=0;i<L.length;i++)L[i]=.3*d[i*4]+.59*d[i*4+1]+.11*d[i*4+2];
 return L;
}
function fdAt(L,x,y){const X=clamp(Math.round(x),0,renderWidth-1),Y=clamp(Math.round(y),0,renderHeight-1);return L[Y*renderWidth+X]}
// 한 눈: 두 끝(화소) → 윗·아랫꺼풀 가운데(화소). 가운데에서 눈 선에 직각으로 훑어, 가장 바깥의 어두운 곳(눈 윤곽선)을 찾는다.
function fdEye(L,a,b){
 const w=Math.hypot(b.x-a.x,b.y-a.y),m={x:(a.x+b.x)/2,y:(a.y+b.y)/2},u={x:(b.x-a.x)/w,y:(b.y-a.y)/w},n={x:u.y,y:-u.x};// n: 위쪽
 const up=n.y<0?n:{x:-n.x,y:-n.y};
 const lid=dir=>{
  const far=[];for(let t=.5*w;t<=.65*w;t+=1)far.push(fdAt(L,m.x+dir.x*t,m.y+dir.y*t));
  const skin=far.sort((p,q)=>p-q)[far.length>>1]||200;
  let best=-1;for(let t=.06*w;t<=.55*w;t+=.5){if(fdAt(L,m.x+dir.x*t,m.y+dir.y*t)<skin*.62)best=t}
  return {t:best>0?best:.28*w,found:best>0};
 };
 const top=lid(up),bot=lid({x:-up.x,y:-up.y});
 return {top:{x:m.x+up.x*top.t,y:m.y+up.y*top.t},bot:{x:m.x-up.x*bot.t,y:m.y-up.y*bot.t},up,w,m,topT:top.t,found:top.found&&bot.found};
}
// 띠 안에서 가로로 이어진 어두운 줄을 찾는다(눈썹·입). 가로축 u, 세로축 v(찾는 쪽), 시작 거리 t0~t1, 가로 폭 ±half.
function fdLine(L,c,u,v,t0,t1,half,skin){
 const pts=[];
 for(let s=-half;s<=half;s+=Math.max(1,half/16)){
  // 가장 어두운 곳이 아니라 시작 쪽에서 가장 가까운 어두운 줄(멀리 있는 머리카락·옷깃을 잡지 않게)
  let bt=-1;
  for(let t=t0;t<=t1;t+=1){const x=c.x+u.x*s+v.x*t,y=c.y+u.y*s+v.y*t;if(fdAt(L,x,y)<skin*.7){bt=t;break}}
  if(bt>=0)pts.push({s,t:bt});
 }
 if(pts.length<4)return null;
 const med=[...pts].sort((a,b)=>a.t-b.t)[pts.length>>1].t,band=(t1-t0)*.22;
 const keep=pts.filter(p=>Math.abs(p.t-med)<band);
 if(keep.length<4)return null;
 // 이어진 가장 긴 구간
 const step=Math.max(1,half/16);let run=[],bestRun=[];
 for(const p of keep){if(run.length&&p.s-run[run.length-1].s>step*1.6)run=[];run.push(p);if(run.length>bestRun.length)bestRun=[...run]}
 if(bestRun.length<4)return null;
 return bestRun.map(p=>({x:c.x+u.x*p.s+v.x*p.t,y:c.y+u.y*p.s+v.y*p.t}));
}
function fdBuild(points){// points: 화소 [왼눈 a,b, 오른눈 a,b]
 const L=fdLum(),W=renderWidth,H=renderHeight,miss=[];
 const sort=(a,b)=>a.x<=b.x?[a,b]:[b,a];
 let [a1,b1]=sort(points[0],points[1]),[a2,b2]=sort(points[2],points[3]);
 if(a2.x<a1.x)[a1,b1,a2,b2]=[a2,b2,a1,b1];
 const e1=fdEye(L,a1,b1),e2=fdEye(L,a2,b2);
 if(!e1.found||!e2.found)miss.push('눈꺼풀 일부(눈 너비로 짐작)');
 const N=p=>({x:p.x/W,y:p.y/H});
 const eye=(a,b,e,old)=>({points:[N(a),N(b),N(e.top),N(e.bot)],protection:old?.protection||[],cover:old?.cover??24,curve:old?.curve??0});
 const skinAt=e=>{const v=[];for(let t=.5*e.w;t<=.65*e.w;t++)v.push(fdAt(L,e.m.x+e.up.x*t,e.m.y+e.up.y*t));return v.sort((p,q)=>p-q)[v.length>>1]||200};
 const brow=e=>{const u={x:-e.up.y,y:e.up.x};return fdLine(L,e.m,u,e.up,e.topT+.15*e.w,e.topT+1.2*e.w,.5*e.w,skinAt(e))};
 const brows=[brow(e1),brow(e2)];
 if(!brows[0]||!brows[1])miss.push('눈썹');
 const C={x:(e1.m.x+e2.m.x)/2,y:(e1.m.y+e2.m.y)/2},D=Math.hypot(e2.m.x-e1.m.x,e2.m.y-e1.m.y),u={x:(e2.m.x-e1.m.x)/D,y:(e2.m.y-e1.m.y)/D},down={x:-u.y,y:u.x};
 const dn=down.y>0?down:{x:-down.x,y:-down.y};
 const mouthLine=fdLine(L,C,u,dn,.55*D,1.4*D,.3*D,(skinAt(e1)+skinAt(e2))/2);
 let mouth=null;
 if(mouthLine&&mouthLine.length>=3){const l=mouthLine[0],r=mouthLine[mouthLine.length-1],c=mouthLine[mouthLine.length>>1];mouth={l:N(l),r:N(r),c:N(c)}}
 else miss.push('입');
 return {eyes:[e1,e2].map((e,i)=>eye(i?a2:a1,i?b2:b1,e,blinkEyes[faceSel*2+i])),brows:brows.filter(Boolean).map(line=>line.filter((_,i)=>i%2===0||i===line.length-1).map(N)),mouth,miss};
}
function fdApply(draft){
 remember();
 const eyes=[...blinkEyes];eyes[faceSel*2]=draft.eyes[0];eyes[faceSel*2+1]=draft.eyes[1];
 const list=structuredClone(faces);
 if(draft.mouth)list[faceSel].mouth=draft.mouth;
 if(draft.brows.length)list[faceSel].brows=draft.brows;
 applyFaceHistory({on:true,list,eyes});
 scheduleSave();
}
// ── 화면: 찍기(4점) → 초안 → 끌어 고치기 ──
function fdLayer(){
 if(fd.layer)return fd.layer;
 const c=document.createElement('canvas');c.className='fdLayer';$('surface').append(c);
 c.addEventListener('pointerdown',fdDown);c.addEventListener('pointermove',fdMove);
 for(const t of ['pointerup','pointercancel'])c.addEventListener(t,()=>{if(fd.drag){fd.drag=null;fdApply(fd.cur)}});
 fd.layer=c;return c;
}
function fdPos(e){const r=fd.layer.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
function fdStart(){
 if(!ready)return;
 if(!faceOn||!faces[faceSel])$('faceOnInput').checked||$('faceOnInput').click();
 setMode('pan');fd.pick=[];fd.edit=false;fd.cur=null;
 const c=fdLayer();c.hidden=false;fdDraw();
 setStatus('자동 초안(시험): 화면 왼쪽 눈의 양 끝을 차례로 누르세요.');
}
function fdStop(){fd.pick=null;fd.edit=false;fd.cur=null;if(fd.layer)fd.layer.hidden=true;$('fdDone').hidden=true}
const FD_PROMPTS=['화면 왼쪽 눈의 양 끝을 차례로 누르세요.','화면 왼쪽 눈의 다른 끝을 누르세요.','화면 오른쪽 눈의 한 끝을 누르세요.','화면 오른쪽 눈의 다른 끝을 누르세요.'];
function fdDown(e){
 e.preventDefault();e.stopPropagation();
 const p=fdPos(e);
 if(fd.pick){
  fd.pick.push(p);fdDraw();
  if(fd.pick.length<4){setStatus('자동 초안(시험): '+FD_PROMPTS[fd.pick.length]);return}
  const draft=fdBuild(fd.pick.map(q=>({x:q.x*renderWidth,y:q.y*renderHeight})));
  fd.pick=null;fdApply(draft);fd.edit=true;fdSnapshot();$('fdDone').hidden=false;fdDraw();
  setStatus(draft.miss.length?`${draft.miss.join('·')}은(는) 찾지 못했습니다. 직접 찍거나 그려 주세요. 나머지 점은 끌어서 고칠 수 있습니다.`:'초안을 넣었습니다. 틀린 점은 끌어서 고치고 ‘초안 완료’를 누르세요.');
  return;
 }
 if(!fd.edit)return;
 let best=null,bd=.025;
 for(const h of fdHandles()){const d=Math.hypot(h.p.x-p.x,(h.p.y-p.y)*renderHeight/renderWidth);if(d<bd){bd=d;best=h}}
 if(best){fd.drag=best;fd.layer.setPointerCapture(e.pointerId)}
}
function fdMove(e){
 if(!fd.drag)return;
 const p=fdPos(e);fd.drag.set({x:clamp(p.x,0,1),y:clamp(p.y,0,1)});fdDraw();
}
function fdSnapshot(){fd.cur={eyes:[structuredClone(blinkEyes[faceSel*2]),structuredClone(blinkEyes[faceSel*2+1])],mouth:structuredClone(faces[faceSel].mouth),brows:structuredClone(faces[faceSel].brows),miss:[]}}
function fdHandles(){// 끌 수 있는 점: 눈 4점×2, 입 3점, 눈썹 선의 점
 const out=[],c=fd.cur;if(!c)return out;
 c.eyes.forEach(eye=>eye?.points.forEach((p,i)=>out.push({p,set:v=>{eye.points[i]=v}})));
 if(c.mouth)for(const k of ['l','r','c'])out.push({p:c.mouth[k],set:v=>{c.mouth[k]=v}});
 c.brows.forEach(line=>line.forEach((p,i)=>out.push({p,set:v=>{line[i]=v}})));
 return out;
}
function fdDraw(){
 const c=fd.layer;if(!c||c.hidden)return;
 const r=c.getBoundingClientRect(),k=devicePixelRatio||1;c.width=Math.max(1,r.width*k);c.height=Math.max(1,r.height*k);
 const g=c.getContext('2d'),W=c.width,H=c.height,dot=(p,col)=>{g.beginPath();g.arc(p.x*W,p.y*H,5*k,0,7);g.fillStyle=col;g.fill();g.lineWidth=2*k;g.strokeStyle=CV.pointEdge;g.stroke()};
 if(fd.pick)fd.pick.forEach(p=>dot(p,CV.point));
 if(fd.edit&&fd.cur){
  g.strokeStyle=CV.point;g.lineWidth=2*k;
  for(const line of [...fd.cur.brows,...(fd.cur.mouth?[[fd.cur.mouth.l,fd.cur.mouth.c,fd.cur.mouth.r]]:[])]){g.beginPath();line.forEach((p,i)=>i?g.lineTo(p.x*W,p.y*H):g.moveTo(p.x*W,p.y*H));g.stroke()}
  for(const h of fdHandles())dot(h.p,CV.point);
 }
}
$('fdStart').onclick=()=>fdStart();
$('fdDone').onclick=()=>{fdStop();setStatus('초안을 마쳤습니다. 표정을 눌러 확인해 보세요.')};
window.MotionPadFaceDraft=Object.freeze({build:pts=>fdBuild(pts),start:()=>fdStart()});// 시험 도구용
