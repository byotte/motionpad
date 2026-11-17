/* UI skin control: independent from project format and animation state. */
const themeRadios=[...document.querySelectorAll('input[name="appTheme"]')];
try{const stored=localStorage.getItem('motionpad-theme');const theme=(stored==='teal'||stored==='basic')?'light':stored;if(['violet','light','mono'].includes(theme))document.documentElement.dataset.theme=theme}catch(_){}
function paintTheme(){
 const theme=document.documentElement.dataset.theme||'violet';
 for(const radio of themeRadios)radio.checked=radio.value===theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
 readCanvasColors();drawOverlay();
}
paintTheme();
for(const radio of themeRadios)radio.onchange=()=>{
 document.documentElement.dataset.theme=radio.value;
 try{localStorage.setItem('motionpad-theme',radio.value)}catch(_){}
 paintTheme();
};
const playerFrame=$('viewerAudio'),playerCollapse=$('playerCollapse');
playerCollapse.onclick=()=>{const folded=playerFrame.classList.toggle('compact');playerCollapse.textContent=folded?'♫':'_';playerCollapse.title=folded?'음악 플레이어 펼치기':'음악 플레이어 접기';playerCollapse.setAttribute('aria-label',playerCollapse.title)};
function setQualityMode(value){qualityMode=value;qualityScale=qualityMode==='balanced'?.7:1;meshSegments=qualityMode==='balanced'?[20,30]:[32,48];if(gl)rebuildMesh();fit();scheduleSave()}
function paintQuality(){for(const radio of document.querySelectorAll('input[name="displayQuality"]'))radio.checked=radio.value===qualityMode}
for(const radio of document.querySelectorAll('input[name="displayQuality"]'))radio.onchange=()=>setQualityMode(radio.value);
