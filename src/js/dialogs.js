// B: 도움말은 동그라미(ⓘ) 대신 하던 동작을 따라오는 안내줄. 설명은 '잠깐 얹히는 글'이라 원래 안내(setStatus)를 지우지 않는다.
// PC: 항목(이름·막대·버튼이 든 한 줄)에 마우스를 0.15초 올리면 뜨고 떠나면 원래 안내로. 폰: 항목 이름을 누르거나 막대를 잡으면 뜨고 5초 뒤·다른 곳을 누르면 돌아간다.
// 이름을 누르면(PC도) 고정되어 '더 보기'를 누를 수 있다. 대화창 안의 항목은 그 창 아래 안내 칸에 뜬다.
// 그림에서 자리를 찍는 도구(PLACE_MODES)가 켜져 있는 동안은 띄우지 않는다(순서 안내가 덮이면 안 된다).
const HELP_ROW='.field,summary,.faceRow,.toggle,.exprSlider,.exprBox,.empty,.fxRow,.videoRow,.brushbar';
const helpState={row:null,layer:null,pinned:false,timer:0,hoverTimer:0,refold:null};
const helpHover=()=>matchMedia('(hover:hover)').matches;
function helpIdleText(){return helpHover()?'항목에 마우스를 올리면 설명이 나옵니다.':'항목 이름을 누르면 설명이 나옵니다.'}
// 안내 칸 하나에 '설명 층'을 겹쳐 둔다(원래 안내 요소는 그대로, 같은 칸에 겹침)
function helpLayerFor(host){
 if(host._helpLayer)return host._helpLayer;
 const wrap=document.createElement(host.tagName==='SPAN'?'span':'div');
 wrap.className='hintWrap';
 host.replaceWith(wrap);
 wrap.append(host);
 const layer=document.createElement('span');
 layer.className='helpLayer';
 layer.hidden=true;
 const text=document.createElement('span');
 text.className='helpText';
 const more=document.createElement('button');
 more.type='button';
 more.className='helpMore';
 more.textContent='더 보기';
 const full=document.createElement('div');
 full.className='helpFull';
 full.hidden=true;
 more.onclick=()=>{full.hidden=!full.hidden;more.textContent=full.hidden?'더 보기':'접기';clearTimeout(helpState.timer)};
 layer.append(text,more);
 wrap.append(layer,full);
 host._helpLayer={wrap,layer,text,more,full};
 return host._helpLayer;
}
function helpHostOf(row){
 const dialog=row.closest('dialog');
 if(!dialog)return $('status');
 if(dialog.id==='exprDialog')return $('exprHint');
 if(dialog.id==='blinkDialog')return $('blinkHint');
 let line=dialog.querySelector('.dlgHelp');
 if(!line){
  line=document.createElement('p');
  line.className='dlgHelp';
  line.textContent=helpIdleText();
  (dialog.querySelector('.dlgBody')||dialog).append(line);
 }
 return line;
}
function showHelp(row,pin){
 const host=helpHostOf(row);
 if(host===$('status')&&PLACE_MODES.includes(mode))return;
 if(helpState.layer&&helpState.row!==row)clearHelp();
 const h=helpLayerFor(host);
 h.text.textContent=row.dataset.helpShort;
 h.more.hidden=!row.dataset.help;
 h.full.textContent=row.dataset.help||'';
 if(helpState.row!==row){h.full.hidden=true;h.more.textContent='더 보기'}
 h.layer.hidden=false;
 h.wrap.classList.add('helping');
 helpState.row=row;helpState.layer=h;helpState.pinned=helpState.pinned||!!pin;
 // 폰에서 안내줄을 접어 둔 사람: 잠깐 펴서 보여 주고 돌아갈 때 다시 접는다
 const line=host.closest('.guideLine');
 if(line?.classList.contains('folded')){line.classList.remove('folded');helpState.refold=line}
 clearTimeout(helpState.timer);
 if(!helpHover())helpState.timer=setTimeout(()=>{if(helpState.layer?.full.hidden)clearHelp()},5000);
}
function clearHelp(){
 clearTimeout(helpState.timer);clearTimeout(helpState.hoverTimer);
 const h=helpState.layer;
 if(h){h.layer.hidden=true;h.full.hidden=true;h.wrap.classList.remove('helping')}
 helpState.refold?.classList.add('folded');
 helpState.row=helpState.layer=helpState.refold=null;helpState.pinned=false;
}
// 표시를 항목 줄로 옮긴다: HTML의 .helpMark(짧은 한 줄·긴 설명)를 그 줄의 data-help-short·data-help로, 이름 글자는 .helpName
for(const mark of document.querySelectorAll('.helpMark')){
 const row=mark.parentElement.closest(HELP_ROW)||mark.parentElement;
 row.dataset.helpShort=mark.dataset.helpShort;
 if(mark.dataset.help)row.dataset.help=mark.dataset.help;
 const name=row.matches('summary')?row:row.querySelector('label,.faceLabel,b,legend,strong')||row;
 name.classList.add('helpName');
 mark.remove();
}
for(const dlg of document.querySelectorAll('dialog'))if(dlg.querySelector('[data-help-short]'))helpHostOf(dlg.querySelector('[data-help-short]'));
statusHook=()=>{if(helpState.layer&&PLACE_MODES.includes(mode)&&helpState.layer.wrap.contains($('status')))clearHelp()};
document.addEventListener('pointerover',e=>{
 if(e.pointerType!=='mouse'||helpState.pinned)return;
 const row=e.target.closest?.('[data-help-short]');
 clearTimeout(helpState.hoverTimer);
 if(row===helpState.row)return;
 helpState.hoverTimer=setTimeout(()=>row?showHelp(row):clearHelp(),150);// 빠르게 지나갈 때 깜빡이지 않게
});
document.addEventListener('pointerdown',e=>{
 if(e.target.closest('.helpLayer,.helpFull'))return;
 const row=e.target.closest('[data-help-short]');
 if(row&&e.target.closest('.helpName')){if(helpState.row===row&&helpState.pinned)clearHelp();else{clearHelp();showHelp(row,true)}return}
 if(row&&e.target.closest('input,select,button,textarea')){if(!helpState.pinned||helpState.row!==row){clearHelp();showHelp(row)}return}
 if(helpState.layer)clearHelp();
},true);
document.addEventListener('focusin',e=>{const row=e.target.closest?.('[data-help-short]');if(row&&!helpState.pinned&&e.target.matches(':focus-visible'))showHelp(row)});
document.addEventListener('focusout',e=>{const row=e.target.closest?.('[data-help-short]');if(row&&row===helpState.row&&!helpState.pinned&&helpHover()&&!row.matches(':hover'))clearHelp()});
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
