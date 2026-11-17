// H-4 그림 자르기(크기 바꾸기는 다음 단계). 파일 메뉴 '그림 자르기…' → 그림 위 틀(모서리 손잡이·끌어 옮기기) + 비율(자유·원본·9:16·3:4·1:1) → 자르기.
// 원본 파일(imgBlob)에서 잘라 새 원본을 만든다(편집용 사본이 아니라 원본 화질). 그림 자체는 되돌리기 기록에 없어서
// 되돌리기에 넣지 않고, 자르기 전에 확인창을 띄운 뒤 되돌리기 기록을 비운다.
// 좌표(모두 0~1 비율)를 새 틀에 맞게 옮긴다: 영역(타원·다각형은 모양 그대로, 붓·래스터·기울인 타원은 384 격자로 다시 그림),
// 축·추가 축·가이드 선·가지 선, 눈 깜빡임 점·앞머리 붓, 얼굴의 입·눈썹·귀. 틀 밖으로 완전히 나간 영역은 지운다(확인창에 이름).
let cropState=null;// {x,y,w,h}: 그림 기준 0~1, ratio: 'free'|'orig'|숫자(가로/세로, 화소 기준)
function cropRatioValue(r){return r==='orig'?sourceSize.w/sourceSize.h:r==='free'?0:Number(r)}
function cropFit(ratio){// 비율에 맞는 가장 큰 가운데 틀
 if(!ratio)return {x:0,y:0,w:1,h:1};
 const imgR=sourceSize.w/sourceSize.h;
 if(ratio>imgR){const h=imgR/ratio;return {x:0,y:(1-h)/2,w:1,h}}
 const w=ratio/imgR;return {x:(1-w)/2,y:0,w,h:1};
}
function openCrop(){
 if(!ready){showNotice('그림 자르기','먼저 그림을 열어 주세요.');return}
 setMode('pan');
 cropState={...cropFit(0),ratio:'free'};
 for(const b of $('cropRatio').querySelectorAll('button'))b.classList.toggle('on',b.dataset.r==='free');
 $('cropBar').hidden=false;$('cropBox').hidden=false;
 paintCrop();
 setStatus('틀의 모서리를 끌어 남길 부분을 정하고 ‘자르기’를 누르세요.');
}
function closeCrop(){cropState=null;$('cropBar').hidden=true;$('cropBox').hidden=true}
function paintCrop(){
 if(!cropState)return;
 const r=$('surface').getBoundingClientRect(),s=$('stage').getBoundingClientRect(),b=$('cropBox');
 b.style.left=(r.left-s.left+cropState.x*r.width)+'px';b.style.top=(r.top-s.top+cropState.y*r.height)+'px';
 b.style.width=(cropState.w*r.width)+'px';b.style.height=(cropState.h*r.height)+'px';
 $('cropSize').textContent=`${Math.round(cropState.w*sourceSize.w)}×${Math.round(cropState.h*sourceSize.h)}`;
}
{
 let drag=null;
 $('cropBox').addEventListener('pointerdown',e=>{
  if(!cropState)return;
  e.preventDefault();e.stopPropagation();
  const r=$('surface').getBoundingClientRect();
  drag={id:e.pointerId,handle:e.target.dataset.h||'move',sx:e.clientX,sy:e.clientY,start:{...cropState},W:r.width,H:r.height};
  $('cropBox').setPointerCapture(e.pointerId);
 });
 $('cropBox').addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=(e.clientX-drag.sx)/drag.W,dy=(e.clientY-drag.sy)/drag.H,s=drag.start,min=.04;
  let {x,y,w,h}=s;
  if(drag.handle==='move'){x=clamp(s.x+dx,0,1-s.w);y=clamp(s.y+dy,0,1-s.h)}
  else{
   const left=drag.handle.includes('w'),top=drag.handle.includes('n');
   let x1=left?clamp(s.x+dx,0,s.x+s.w-min):s.x,x2=left?s.x+s.w:clamp(s.x+s.w+dx,s.x+min,1);
   let y1=top?clamp(s.y+dy,0,s.y+s.h-min):s.y,y2=top?s.y+s.h:clamp(s.y+s.h+dy,s.y+min,1);
   w=x2-x1;h=y2-y1;
   const ratio=cropRatioValue(cropState.ratio);
   if(ratio){// 화소 기준 비율 유지: 세로를 가로에 맞춘다(넘치면 가로를 세로에 맞춘다)
    const k=ratio*sourceSize.h/sourceSize.w;
    let nh=w/k;if(nh>(top?y2:1-y1)){nh=top?y2:1-y1;w=nh*k}h=nh;
    if(left)x1=x2-w;
    if(top)y1=y2-h;
   }
   x=x1;y=y1;
  }
  Object.assign(cropState,{x,y,w,h});paintCrop();
 });
 for(const t of ['pointerup','pointercancel'])$('cropBox').addEventListener(t,()=>{drag=null});
}
for(const b of $('cropRatio').querySelectorAll('button'))b.onclick=()=>{
 if(!cropState)return;
 cropState={...cropFit(cropRatioValue(b.dataset.r)),ratio:b.dataset.r};
 for(const o of $('cropRatio').querySelectorAll('button'))o.classList.toggle('on',o===b);
 paintCrop();
};
$('cropCancel').onclick=()=>{closeCrop();setStatus('자르기를 취소했습니다.')};
$('cropApply').onclick=async()=>{if(cropState)await applyCrop({...cropState})};
$('menuCrop').onclick=()=>{document.querySelectorAll('nav details[open]').forEach(d=>d.open=false);openCrop()};
window.addEventListener('resize',()=>paintCrop());
// ── 좌표 옮기기(가장 틀리기 쉬운 곳: 시험 fix_check.js h4) ──
function cropPointMap(c){
 const P=(x,y)=>[(x-c.x)/c.w,(y-c.y)/c.h];
 return {P,pt:p=>{const [x,y]=P(p.x,p.y);return {x,y}},arr:p=>P(p[0],p[1])};
}
function cropZone(z,c,rUnit){
 const {P,arr}=cropPointMap(c);
 const out=structuredClone(clean(z));
 [out.x,out.y]=P(z.x,z.y);[out.baseX,out.baseY]=P(z.baseX??z.x,z.baseY??z.y);
 out.rx=z.rx/c.w;out.ry=z.ry/c.h;
 if(Number.isFinite(z.pivotX)){[out.pivotX,out.pivotY]=P(z.pivotX,z.pivotY)}
 out.extraPivots=(z.extraPivots||[]).map(arr);out.spine=(z.spine||[]).map(arr);out.branch=(z.branch||[]).map(arr);
 const vector=z.kind==='polygon'||(z.kind==='ellipse'&&Math.abs(z.rot||0)<.01);
 if(z.kind==='polygon')out.polygon=z.polygon.map(arr);
 if(!vector){// 붓·래스터·기울인 타원: 옛 마스크를 새 격자로 다시 찍는다
  const old=rawMaskCanvas(z).getContext('2d').getImageData(0,0,TILE,TILE).data,bits=new Uint8Array(TILE*TILE);
  for(let j=0;j<TILE;j++)for(let i=0;i<TILE;i++){
   const u=c.x+(i+.5)/TILE*c.w,v=c.y+(j+.5)/TILE*c.h;
   if(u<0||u>=1||v<0||v>=1)continue;
   const oi=Math.floor(u*TILE),oj=Math.floor(v*TILE);
   if(old[(oj*TILE+oi)*4+3]>100)bits[j*TILE+i]=1;
  }
  Object.assign(out,{kind:'raster',runs:bitsToRuns(bits),strokes:[],polygon:[],rot:0,scale:1});
 }
 return out;
}
function zoneInsideCrop(z){// 틀 안에 조금이라도 남는가(옮긴 뒤 좌표로)
 if(z.kind==='raster')return z.runs.length>0;
 if(z.kind==='polygon')return z.polygon.some(([x,y])=>x>0&&x<1&&y>0&&y<1)||(z.x>0&&z.x<1&&z.y>0&&z.y<1);
 return z.x+z.rx>0&&z.x-z.rx<1&&z.y+z.ry>0&&z.y-z.ry<1;
}
function cropExtra(extra,c,rUnit){
 const {pt}=cropPointMap(c);
 const e=structuredClone(extra);
 for(const eye of e.blink?.eyes||[]){
  if(!eye)continue;
  eye.points=eye.points.map(pt);
  for(const s of eye.protection||[]){s.points=(s.points||[]).map(pt);if(Number.isFinite(s.radius))s.radius*=rUnit}
 }
 for(const f of e.faces?.list||[]){
  if(f.mouth)f.mouth={l:pt(f.mouth.l),r:pt(f.mouth.r),c:pt(f.mouth.c)};
  f.brows=(f.brows||[]).map(l=>l.map(pt));f.ears=(f.ears||[]).map(l=>l.map(pt));
 }
 return e;
}
async function applyCrop(c){
 c={x:clamp(c.x,0,1),y:clamp(c.y,0,1),w:clamp(c.w,.01,1),h:clamp(c.h,.01,1)};
 const px={x:Math.round(c.x*sourceSize.w),y:Math.round(c.y*sourceSize.h),w:Math.max(1,Math.round(c.w*sourceSize.w)),h:Math.max(1,Math.round(c.h*sourceSize.h))};
 const rUnit=Math.min(sourceSize.w,sourceSize.h)/Math.min(px.w,px.h);// 붓 굵기는 짧은 변 기준이라 짧은 변이 줄면 굵기 비율이 커진다
 const moved=zones.map(z=>cropZone(z,c,rUnit));// 범위로 자르기(sanitize) 전에 틀 밖인지 본다
 const gone=moved.filter(z=>!zoneInsideCrop(z)).map(z=>z.name);
 const msg='자르면 되돌릴 수 없습니다. 먼저 프로젝트를 저장해 두는 것을 권합니다.'+(gone.length?` 틀 밖으로 나가는 영역 ${gone.length}개(${gone.join(', ')})는 지워집니다.`:'');
 if(!await askConfirm({title:'그림 자르기',message:msg,ok:'자르기'}))return false;
 const src=await loadImage(imgBlob),cv=document.createElement('canvas');cv.width=px.w;cv.height=px.h;
 cv.getContext('2d').drawImage(src,px.x,px.y,px.w,px.h,0,0,px.w,px.h);
 const type=/jpeg|webp/.test(imgBlob.type)?imgBlob.type:'image/png';
 const blob=await new Promise(r=>cv.toBlob(r,type,.95));
 const extra=cropExtra(extraState(),c,rUnit),keepSel=selected;
 await useBlob(blob,false);
 zones=moved.filter(zoneInsideCrop).map((z,i)=>{const o=sanitize(z,i);if(o.kind==='raster'){recalcRaster(o);o.baseX=o.x;o.baseY=o.y}return o});
 normalizeBaseOrder();selected=zones.some(z=>z.id===keepSel)?keepSel:zones[0]?.id||null;
 restoreExtra(extra);
 hitSpots=[];hitCracks=[];
 undoStack=[];redoStack=[];refreshHistory();
 closeCrop();markZonesKnown();markMask();updateUI();scheduleSave();
 setStatus(`그림을 잘랐습니다 · ${px.w}×${px.h}`+(gone.length?` · 지운 영역 ${gone.length}개`:''));
 return true;
}
