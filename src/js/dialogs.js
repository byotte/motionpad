const localHelp=$('localHelp');
function showLocalHelp(button){
 localHelp.textContent=button.dataset.help;
 localHelp.hidden=false;
 const rect=button.getBoundingClientRect();
 localHelp.style.left=Math.max(8,Math.min(rect.left,innerWidth-localHelp.offsetWidth-8))+'px';
 localHelp.style.top=(rect.top>=localHelp.offsetHeight+8?rect.top-localHelp.offsetHeight-4:rect.bottom+4)+'px';
}
document.querySelectorAll('[data-help]').forEach(button=>{
 button.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover)').matches)showLocalHelp(button);});
 button.addEventListener('mouseleave',()=>{localHelp.hidden=true;});
 button.onclick=()=>localHelp.hidden?showLocalHelp(button):localHelp.hidden=true;
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-help]'))localHelp.hidden=true;});
window.addEventListener('scroll',()=>{localHelp.hidden=true;},true);
document.querySelectorAll('[data-dialog]').forEach(button=>{
 button.onclick=()=>{
  $(button.dataset.dialog).showModal();
 };
});
$('startImage').onclick=()=>$('imageBtn').click();
$('startProject').onclick=()=>$('restoreBtn').click();
$('resumeProject').onclick=async()=>{
 if(!storedLayoutProject)return;
 try{await restoreProjectObject(storedLayoutProject);setMode('play');}
 catch(err){alert('이전 작업을 열지 못했습니다: '+err.message);}
};
for(const id of ['imageBtn','restoreBtn'])$(id).addEventListener('click',()=>$('filesDialog').close());

$('refineRegion').onclick=()=>{$('appendInput').checked=true;setMode('brush');$('stage').scrollIntoView({block:'nearest'});};
$('finishEdit').onclick=()=>{setMode('play');$('editFields').scrollIntoView({block:'nearest'});};
$('leaveEdit').onclick=()=>{
 if(editCheckpoint){
   const {state,undo,redo,last}=editCheckpoint;
   undoStack=undo;
   redoStack=redo;
   lastHistoryJSON=last;
   historyApply(state);
 }
 setMode('play');
};
$('menuNew').onclick=()=>$('imageBtn').click();
$('menuOpen').onclick=()=>$('restoreBtn').click();
$('layoutSettings').addEventListener('focusin',paintQuality);
const namedProjects=$('projectSelect');
const showNamedProjects=()=>$('legacyMenu').hidden=![...namedProjects.options].some(option=>option.value);
new MutationObserver(showNamedProjects).observe(namedProjects,{childList:true});
showNamedProjects();
$('openMusic').addEventListener('click',()=>$('trackSelect').focus());
$('openEffects').addEventListener('click',()=>$('sfxVolume').focus());
const effectSelect=$('sfxTypeInput'),viewerEffects=$('viewerEffects');
viewerEffects.onchange=()=>{
 effectSelect.value=viewerEffects.value;
 effectSelect.dispatchEvent(new Event('change'));
};
effectSelect.addEventListener('change',()=>{viewerEffects.value=effectSelect.value;});
$('viewerBtn').addEventListener('click',()=>{viewerEffects.value=effectSelect.value;});
const maskSettings=document.querySelector('.maskDisplay');
const maskDialog=$('maskDialog');
// 모든 대화창의 × 와 '닫기' 버튼
document.addEventListener('click',event=>{const b=event.target.closest('.dlgX,.dlgClose');if(b)b.closest('dialog')?.close();});
$('maskMenu').onclick=()=>{
 maskDialog.querySelector('.dlgBody').append(maskSettings);
 maskDialog.showModal();
};
maskDialog.addEventListener('close',()=>document.querySelector('.side').append(maskSettings));
for(const menu of document.querySelectorAll('.topMenu')){
 menu.addEventListener('toggle',()=>{if(menu.open)for(const other of document.querySelectorAll('.topMenu[open]'))if(other!==menu)other.open=false;});
 menu.addEventListener('click',event=>{if(event.target.closest('button'))menu.open=false;});
}
document.addEventListener('click',event=>{
 if(!event.target.closest('.topMenu'))for(const menu of document.querySelectorAll('.topMenu[open]'))menu.open=false;
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')for(const menu of document.querySelectorAll('.topMenu[open]'))menu.open=false;
});
setMode('play');
