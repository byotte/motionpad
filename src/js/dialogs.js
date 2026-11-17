const localHelp=$('localHelp');
function showLocalHelp(button){
 (button.closest('dialog')||document.body).append(localHelp);// 대화창 안에서는 창 위에 떠야 보인다
 localHelp.textContent=button.dataset.help;
 localHelp.hidden=false;
 const rect=button.getBoundingClientRect();
 localHelp.style.left=Math.max(8,Math.min(rect.left,innerWidth-localHelp.offsetWidth-8))+'px';
 localHelp.style.top=(rect.top>=localHelp.offsetHeight+8?rect.top-localHelp.offsetHeight-4:rect.bottom+4)+'px';
}
document.querySelectorAll('[data-help]').forEach(button=>{
 button.addEventListener('mouseenter',()=>{if(matchMedia('(hover:hover)').matches)showLocalHelp(button);});
 button.addEventListener('mouseleave',()=>{localHelp.hidden=true;});
 button.onclick=e=>{e.preventDefault();e.stopPropagation();if(localHelp.hidden||localHelp.dataset.owner!==button.dataset.help)showLocalHelp(button);else localHelp.hidden=true;localHelp.dataset.owner=button.dataset.help};
});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('[data-help]'))localHelp.hidden=true;});
window.addEventListener('scroll',()=>{localHelp.hidden=true;},true);
document.querySelectorAll('[data-dialog]').forEach(button=>{
 button.onclick=()=>{
  $(button.dataset.dialog).showModal();
 };
});
const keepPrevious=async(title)=>!storedLayoutProject||await askConfirm({title,message:'자동 저장된 이전 작업이 있습니다. 새로 시작하면 이전 작업은 이어할 수 없게 됩니다. 계속할까요?',ok:'새로 시작'});
$('startImage').onclick=async()=>{if(await keepPrevious('새 그림 열기'))$('imageBtn').click()};
$('startProject').onclick=async()=>{if(await keepPrevious('프로젝트 열기'))$('restoreBtn').click()};
$('resumeProject').onclick=async()=>{
 if(!storedLayoutProject)return;
 try{await restoreProjectObject(storedLayoutProject);savedSignature=storedLayoutProject.savedSig??'';setMode('play');}
 catch(err){showNotice('이어하기 실패','이전 작업을 열지 못했습니다.'+why(err));}
};
for(const id of ['imageBtn','restoreBtn'])$(id).addEventListener('click',()=>$('filesDialog').close());

$('menuNew').onclick=async()=>{if(hasUnsavedWork()&&!await askConfirm({title:'새 그림 열기',message:'지금 작업에 파일로 저장하지 않은 변경이 있습니다. 새 그림을 열면 지금 작업은 사라집니다. 그래도 열까요?',ok:'저장하지 않고 열기'}))return;$('imageBtn').click()};
$('menuOpen').onclick=async()=>{if(hasUnsavedWork()&&!await askConfirm({title:'프로젝트 열기',message:'지금 작업에 파일로 저장하지 않은 변경이 있습니다. 다른 프로젝트를 열면 지금 작업은 사라집니다. 그래도 열까요?',ok:'저장하지 않고 열기'}))return;$('restoreBtn').click()};
$('layoutSettings').addEventListener('focusin',paintQuality);
const namedProjects=$('projectSelect');
const showNamedProjects=()=>$('legacyMenu').hidden=$('legacySep').hidden=![...namedProjects.options].some(option=>option.value);
new MutationObserver(showNamedProjects).observe(namedProjects,{childList:true});
showNamedProjects();
// 3-R: '소리'는 창이 하나뿐이라 펼침 메뉴 없이 바로 연다. 다른 메뉴가 펼쳐져 있으면 닫는다.
$('openMusic').addEventListener('click',()=>{for(const m of document.querySelectorAll('.topMenu[open]'))m.open=false});
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
 // 펼친 메뉴가 화면 밖으로 나가 가로 스크롤이 생기지 않게 자리를 맞춘다.
 // 'toggle' 이벤트는 한 번 그려진 뒤에 와서 처음 열 때 메뉴가 튀었다 → open이 붙는 즉시(그리기 전) 맞춘다.
 new MutationObserver(()=>{if(!menu.open)return;for(const other of document.querySelectorAll('.topMenu[open]'))if(other!==menu)other.open=false;
  paintProjectName();const box=menu.querySelector('.topMenuItems');box.style.left='0px';const r=box.getBoundingClientRect(),over=r.right-(document.documentElement.clientWidth-4);if(over>0)box.style.left=Math.max(-r.left+4,-over)+'px'}).observe(menu,{attributes:true,attributeFilter:['open']});
 // 3-M: 메뉴 하나가 펼쳐져 있을 때 옆 메뉴로 마우스를 옮기면 그 메뉴가 펼쳐진다(PC)
 menu.querySelector('summary').addEventListener('pointerenter',e=>{if(e.pointerType!=='mouse'||menu.open)return;const other=document.querySelector('.topMenu[open]');if(other){other.open=false;menu.open=true}});
 menu.addEventListener('click',event=>{if(event.target.closest('button'))menu.open=false;});
}
document.addEventListener('click',event=>{
 if(!event.target.closest('.topMenu'))for(const menu of document.querySelectorAll('.topMenu[open]'))menu.open=false;
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape')for(const menu of document.querySelectorAll('.topMenu[open]'))menu.open=false;
});
// 3-M: 지금 프로젝트 이름. PC는 머리줄, 폰형은 파일 메뉴 맨 위
function paintProjectName(){const on=!!ready,name=projectName||'내 프로젝트';for(const id of ['projectNameLabel','menuProjectName']){const e=$(id);e.hidden=!on;e.textContent=name;e.title='지금 프로젝트: '+name}document.title=on?`MotionPad — ${name}`:'MotionPad'}
setInterval(paintProjectName,700);
// 3-M: 프로젝트 닫기 → 시작 화면으로. 자동 저장본은 남겨 '이전 작업 이어하기'로 되돌아올 수 있다.
$('menuClose').onclick=async()=>{
 if(!ready)return;
 if(hasUnsavedWork()&&!await askConfirm({title:'프로젝트 닫기',message:'지금 작업에 파일로 저장하지 않은 변경이 있습니다. 닫아도 시작 화면의 ‘이전 작업 이어하기’로 한 번은 되돌아올 수 있지만, 다른 그림을 열면 사라집니다. 닫을까요?',ok:'저장하지 않고 닫기'}))return;
 const keep={image:imgBlob,zones:zones.map(clean),audio:audioBlob,audioName,sfx:sfxBlob,sfxName,extra:extraState(),savedAt:Date.now(),savedSig:savedSignature};
 clearTimeout(saveTimer);if(db)try{await dbPut(keep)}catch(e){console.warn(e)}
 stopMusic();setMode('play');clearSelectionDrafts();ready=false;storedLayoutProject=keep;projectFileHandle=null;undoStack=[];redoStack=[];refreshHistory();
 document.querySelector('.workspace').hidden=true;$('welcome').hidden=false;document.querySelector('.header').classList.add('starting');$('resumeProject').hidden=false;paintProjectName();
};
setMode('play');
// 3-N: 폰형 화면에서는 안내줄을 눌러 접고 편다(접힌 상태는 기억). PC는 늘 펼쳐 둔다.
{const line=document.querySelector('.guideLine');try{if(localStorage.getItem('motionpad-guide')==='folded')line.classList.add('folded')}catch(_){}
 line.addEventListener('click',()=>{if(!matchMedia('(orientation:portrait),(max-width:779px)').matches)return;const f=line.classList.toggle('folded');try{localStorage.setItem('motionpad-guide',f?'folded':'open')}catch(_){}requestAnimationFrame(fit)})}
