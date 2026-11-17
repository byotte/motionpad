// 디자인 조사: 실제 화면에 쓰인 글자 크기·굵기·색·모서리·버튼 높이·여백의 종류와 횟수를 센다. node tools/design/inventory.js
const { chromium } = require('playwright');require('../baseline/detail_mode');const fs=require('fs');
const R=require('path').resolve(__dirname,'../..');const FIX=R+'/tools/baseline/fixtures/character.png';
(async()=>{
 const b=await chromium.launch();const agg={};
 const add=(k,v,ex)=>{agg[k]??={};const e=agg[k][v]??={n:0,ex:[]};e.n++;if(e.ex.length<4&&!e.ex.includes(ex))e.ex.push(ex)};
 for(const [nm,vp] of [['pc',{width:1440,height:900}],['phone',{width:390,height:844}]]){
  const c=await b.newContext({viewport:vp});const p=await c.newPage();
  await p.goto('file://'+R+'/motionpad.html');await p.setInputFiles('#imageFile',FIX);await p.waitForSelector('.workspace:not([hidden])');await p.waitForTimeout(300);
  await p.click('#newRegionBtn');await p.click('#ellipseMode');const r=await p.locator('#view').boundingBox();await p.mouse.move(r.x+r.width*.4,r.y+r.height*.2);await p.mouse.down();await p.mouse.move(r.x+r.width*.6,r.y+r.height*.4,{steps:5});await p.mouse.up();
  const collect=async(scope)=>{const rows=await p.evaluate(scope=>{const out=[];const root=document.querySelector(scope);if(!root)return out;
    for(const e of root.querySelectorAll('*')){const r=e.getBoundingClientRect();if(!(r.width>0&&r.height>0))continue;const cs=getComputedStyle(e);const tag=e.tagName.toLowerCase();const id=e.id?'#'+e.id:(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:tag);
     const hasText=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
     const o={id,tag,type:e.type||'',h:Math.round(r.height),w:Math.round(r.width)};
     if(hasText){o.fs=cs.fontSize;o.fw=cs.fontWeight;o.color=cs.color}
     if(parseFloat(cs.borderTopWidth)>0&&cs.borderTopStyle!=='none'){o.bc=cs.borderTopColor;o.bw=cs.borderTopWidth}
     if(cs.borderTopLeftRadius!=='0px')o.rad=cs.borderTopLeftRadius;
     if(cs.backgroundColor!=='rgba(0, 0, 0, 0)')o.bg=cs.backgroundColor;
     if(['button','select','input','summary'].includes(tag)||e.classList.contains('btn'))o.ctl=tag+(e.type&&tag==='input'?':'+e.type:'');
     if(['margin','padding','gap'].length){o.pad=cs.paddingTop+' '+cs.paddingRight;o.gap=cs.rowGap}
     out.push(o)}return out},scope);
   for(const o of rows){const ex=o.id;if(o.fs){add('글자 크기',o.fs,ex);add('글자 굵기',o.fw,ex);add('글자 색',o.color,ex)}if(o.bc){add('테두리 색',o.bc,ex);add('테두리 두께',o.bw,ex)}if(o.rad)add('모서리',o.rad,ex);if(o.bg)add('바탕색',o.bg,ex);if(o.ctl)add('컨트롤 높이 '+o.ctl,o.h+'px',ex);if(o.ctl&&o.pad!=='0px 0px')add('컨트롤 안쪽 여백',o.pad,ex)}};
  await p.evaluate(()=>{for(const d of document.querySelectorAll('aside details'))d.open=true});await p.waitForTimeout(200);await collect('.app');
  for(const tool of ['wandMode','lassoMode']){await p.click('#'+tool);await p.waitForTimeout(100);await collect('.stagebar, .brushbar, #wandbar, #lassobar')}
  for(const d of ['videoDialog','soundDialog','layoutSettings']){await p.evaluate(d=>{document.getElementById(d).showModal();document.getElementById(d).querySelectorAll('details').forEach(x=>x.open=true)},d);await p.waitForTimeout(150);await collect('#'+d);await p.evaluate(d=>document.getElementById(d).close(),d)}
  await p.evaluate(()=>{const f=document.getElementById('faceOnInput');if(f&&!f.checked)f.click()});await p.waitForTimeout(200);await p.click('#eyeEntry');await p.waitForTimeout(300);await collect('#blinkDialog');await p.click('#blinkClose');
  await p.evaluate(()=>document.querySelector('nav details').open=true);await collect('nav');
  await c.close()}
 const lines=[];for(const [k,vals] of Object.entries(agg)){const arr=Object.entries(vals).sort((a,b)=>b[1].n-a[1].n);lines.push(`## ${k} — ${arr.length}종`);for(const [v,e] of arr)lines.push(`${v}\t${e.n}\t${e.ex.join(' ')}`)}
 console.log(lines.join('\n'));await b.close();
})();
