// 얼굴 설계 1단계(docs/design/face-reactions.md §2·§3): '2. 얼굴 · 눈 깜빡임' 섹션.
// 얼굴은 최대 3개. 얼굴 k의 두 눈 = 눈 깜빡임의 눈 칸 2k·2k+1(눈 깜빡임이 눈 6개까지라 얼굴 3개).
// '적용'을 끄면 깜빡임(뒤에는 표정도)이 멈추고, 찍은 자리는 그대로 남는다.
const FACE_MAX=3;
let faceOn=false,faceCount=0,faceSel=0,faceOpen=true;
function faceEyes(k){return [blinkEyes[k*2],blinkEyes[k*2+1]].filter(Boolean).length}
function facesForSave(){return {on:faceOn,count:faceCount}}
// 옛 프로젝트(얼굴 정보 없음): 찍어 둔 눈이 있으면 그 눈을 담을 만큼 얼굴을 만들고 켠다(깜빡이던 그림이 멈추지 않게).
function restoreFaces(d){
 let last=-1;blinkEyes.forEach((eye,i)=>{if(eye)last=i});
 const need=Math.ceil((last+1)/2);
 if(d&&typeof d==='object'){faceCount=clamp(Math.max(Math.round(Number(d.count))||0,need),0,FACE_MAX);faceOn=d.on===true&&faceCount>0}
 else{faceCount=need;faceOn=need>0}
 faceSel=0;faceOpen=true;paintFaces();
}
function paintFaces(){
 const box=$('facePanel');if(!box)return;
 faceSel=clamp(faceSel,0,Math.max(0,faceCount-1));
 $('faceOnInput').checked=faceOn;box.classList.toggle('on',faceOn);
 const open=faceOn&&faceOpen;
 $('faceTitle').disabled=!faceOn;$('faceTitle').setAttribute('aria-expanded',String(open));$('faceBody').hidden=!open;
 const chips=Array.from({length:faceCount},(_,k)=>{
  const b=document.createElement('button');b.type='button';b.className='chip faceItem'+(k===faceSel?' active':'');
  b.setAttribute('role','option');b.setAttribute('aria-selected',String(k===faceSel));
  b.textContent=`얼굴 ${k+1}`;b.onclick=()=>{faceSel=k;paintFaces()};return b;
 });
 if(faceCount<FACE_MAX){const add=document.createElement('button');add.type='button';add.className='btn faceAdd';add.id='faceAdd';add.textContent='+ 얼굴 추가';add.onclick=addFace;chips.push(add)}
 if(faceCount){const del=document.createElement('button');del.type='button';del.className='btn iconBtn faceDel';del.title=del.ariaLabel=`얼굴 ${faceSel+1} 삭제`;del.innerHTML='<svg class="ic" aria-hidden="true"><use href="#i-trash"/></svg>';del.onclick=removeFace;chips.push(del)}
 $('faceList').replaceChildren(...chips);
 const n=faceCount?faceEyes(faceSel):0;
 $('eyeEntryState').textContent=n?`눈 ${n}개 적용됨`:'아직 찍지 않음';
 $('eyeEntryState').classList.toggle('done',n>0);
 $('eyeEntry').disabled=!faceCount;
}
// 얼굴이 생기면 안내줄로 눈 찍기를 알린다(창은 '눈 찍기 · 설정'을 눌러야 열린다, 사용자 피드백).
function addFace(){
 if(faceCount>=FACE_MAX)return;
 faceSel=faceCount++;faceOpen=true;paintFaces();scheduleSave();
 setStatus(`얼굴 ${faceSel+1}이 생겼습니다. ‘눈 찍기 · 설정’을 눌러 두 눈의 위치를 찍어 주세요.`);
}
async function removeFace(){
 const k=faceSel,n=faceEyes(k);
 if(!await askConfirm({title:'얼굴 삭제',message:`얼굴 ${k+1}을 지울까요?`+(n?` 이 얼굴에 찍은 눈 ${n}개의 깜빡임 설정도 함께 지워집니다.`:''),ok:'얼굴 삭제'}))return;
 // 뒤쪽 얼굴의 눈을 한 칸씩 당긴다(얼굴 번호와 눈 칸이 늘 짝을 이루게).
 for(let i=k*2;i<BLINK_MAX_EYES;i++){blinkEyes[i]=blinkEyes[i+2]??null;blinkPatches[i]=blinkPatches[i+2]??null}
 faceCount--;faceSel=Math.max(0,k-1);blinkEpoch=elapsed;
 paintFaces();scheduleSave();
}
$('faceOnInput').onchange=()=>{
 faceOn=$('faceOnInput').checked;faceOpen=true;
 if(faceOn&&!faceCount){addFace();return}
 if(faceOn)blinkEpoch=elapsed;
 paintFaces();scheduleSave();
};
$('faceTitle').onclick=()=>{faceOpen=!faceOpen;paintFaces()};
