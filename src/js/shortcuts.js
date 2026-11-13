// 3-B 단축키(PC). 포토샵·클립스튜디오에 익숙한 키. 글자 입력 중·대화창이 떠 있을 때·감상 화면에서는 쓰지 않는다.
// 도구 버튼의 title에 '(키)'를 덧붙여 마우스를 올리면 보이게 한다.
const TOOL_KEYS={b:'brushMode',e:'eraseMode',w:'wandMode',l:'lassoMode',m:'ellipseMode',v:'editMode',h:'panMode'};
for(const [k,id] of Object.entries(TOOL_KEYS)){const b=$(id);if(b)b.title+=` (${k.toUpperCase()})`}
for(const [id,k] of [['undoBtn','Ctrl+Z'],['redoBtn','Ctrl+Shift+Z'],['zoomInBtn','+'],['zoomOutBtn','-'],['zoomResetBtn','0'],['newRegionBtn','N'],['toolDuplicateBtn','Ctrl+J'],['toolDeleteBtn','Delete'],['viewerBtn','P']]){const b=$(id);if(b)b.title=(b.title||b.textContent.trim())+` (${k})`}
$('backupBtn').title+=' (Ctrl+S)';
function shortcutBlocked(e){
 if(document.querySelector('dialog[open]'))return true;
 const t=e.target;return !!t.closest?.('input:not([type=range]):not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable="true"]');
}
function clickIfUsable(id){const b=$(id);if(!b||b.disabled||b.closest('[hidden]'))return false;b.click();return true}
document.addEventListener('keydown',e=>{
 if(e.defaultPrevented||e.isComposing||viewerOpen||!ready||shortcutBlocked(e))return;
 const mod=e.ctrlKey||e.metaKey,key=e.key.length===1?e.key.toLowerCase():e.key;
 let done=false;
 if(mod&&!e.altKey){
  if(key==='z'&&!e.shiftKey)done=clickIfUsable('undoBtn');
  else if((key==='z'&&e.shiftKey)||key==='y')done=clickIfUsable('redoBtn');
  else if(key==='s'&&!e.shiftKey)done=clickIfUsable('backupBtn');
  else if(key==='o')done=clickIfUsable('menuOpen');
  else if(key==='j')done=clickIfUsable('toolDuplicateBtn');
  if(['z','y','s','o','j'].includes(key)){e.preventDefault();return}
 }
 if(mod||e.altKey)return;
 if(TOOL_KEYS[key])done=clickIfUsable(TOOL_KEYS[key]);
 else if(key==='n')done=clickIfUsable('newRegionBtn');
 else if(key==='p')done=clickIfUsable('viewerBtn');
 else if(key==='+'||key==='=')done=clickIfUsable('zoomInBtn');
 else if(key==='-')done=clickIfUsable('zoomOutBtn');
 else if(key==='0')done=clickIfUsable('zoomResetBtn');
 else if(key==='['||key===']'){const r=$('brushInput');if(!r.closest('[hidden]')){r.value=String(Number(r.value)+(key===']'?2:-2));r.dispatchEvent(new Event('input',{bubbles:true}));done=true}}
 else if(key==='Delete'||key==='Backspace')done=clickIfUsable('toolDeleteBtn');
 else if(key==='Enter'&&!e.target.closest?.('button,summary'))done=['wandApply','outlineApply','lassoFinish','finishEdit'].some(clickIfUsable);
 else if(key==='Escape')done=['wandCancel','outlineCancel'].some(clickIfUsable);// '그만두기'는 작업을 되돌리므로 Esc에 묶지 않는다
 if(done)e.preventDefault();
});
