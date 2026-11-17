// 얼굴 기능 전후 프레임 계측(2026-11-17): node tools/motion/face_perf.js <html> <old|new> <zone|blink|shy|cry> <pc|phone>
// 장면: zone = 영역 1개 자동, blink = + 눈 깜빡임 2개, shy = + 평소 표정 부끄러움 100%(휘기·홍조 빗금·땀), cry = + 울먹임 100%(입술 떨림 = 매 프레임 지도 다시 합침·눈물). old는 얼굴 기능 전 배포본(git show 32c14b5:motionpad.html). phone = 390×844 배율 3, CPU 4배 느리게.
const { chromium } = require('playwright'); const path=require('path'),fs=require('fs');
const [file,kind,scene,dev,opt]=process.argv.slice(2);// opt 'cut' = 영역에 빈자리 채우기(외곽 흔들기)도 켬(E2: 얹는 그림에도 표정)
const buf=fs.readFileSync('tools/baseline/fixtures/character.png');const W0=buf.readUInt32BE(16),H0=buf.readUInt32BE(20),f=Math.min(1,1900/Math.max(W0,H0)),rw=Math.round(W0*f),rh=Math.round(H0*f);
const EYES=[[[.395,.40],[.48,.40],[.437,.36],[.437,.44]],[[.52,.40],[.605,.40],[.563,.36],[.563,.44]]];
(async()=>{
 const b=await chromium.launch();
 const ctx=await b.newContext(dev==='phone'?{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}:{viewport:{width:1440,height:900}});
 await ctx.addInitScript(()=>{try{localStorage.setItem('motionpad-theme','dark')}catch(_){}});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
 await p.goto('file://'+path.resolve(file));
 await p.setInputFiles('#imageFile','tools/baseline/fixtures/character.png');await p.waitForSelector('.workspace:not([hidden])');
 await p.evaluate(()=>{const r=document.querySelector('input[name="displayQuality"][value="high"]');r.checked=true;r.dispatchEvent(new Event('change',{bubbles:true}))});
 const click=async sel=>p.evaluate(s=>document.querySelector(s).click(),sel);
 const ov=await p.locator('#overlay').boundingBox();const at=(x,y)=>[ov.x+x*ov.width,ov.y+y*ov.height];
 await click('#ellipseMode');await p.mouse.move(...at(.36,.25));await p.mouse.down();await p.mouse.move(...at(.64,.55),{steps:4});await p.mouse.up();
 await p.evaluate(()=>{const a=document.getElementById('autoInput');a.checked=true;a.dispatchEvent(new Event('input',{bubbles:true}));a.dispatchEvent(new Event('change',{bubbles:true}))});
 if(opt==='cut')await p.evaluate(()=>{const c=document.getElementById('tailCutoutInput');if(!c.checked)c.click()});
 if(scene!=='zone'){
  if(kind==='new')await click('#faceOnInput');
  await click('#eyeEntry');await p.waitForTimeout(300);
  for(let e=0;e<2;e++){if(e)await p.selectOption('#blinkEye',{index:1});
   const c=await p.locator('#blinkPreview').boundingBox();const A=c.width/c.height,w=Math.max(rw,rh*A),h=w/A,r={x:(rw-w)/2,y:(rh-h)/2,w,h};
   for(const [x,y] of EYES[e])await p.mouse.click(c.x+(x*rw-r.x)/r.w*c.width,c.y+(y*rh-r.y)/r.h*c.height);
   await click('#blinkApply');}
  await click('#blinkClose');
 }
 if(scene==='shy'||scene==='cry'){
  await click('#faceMouthMode');for(const pt of [[.48,.468],[.518,.468],[.499,.474]])await p.mouse.click(...at(...pt));
  await click('#faceBrowMode');
  for(const line of [[[.41,.36],[.45,.352],[.495,.353]],[[.52,.353],[.565,.352],[.607,.36]]]){await p.mouse.move(...at(...line[0]));await p.mouse.down();for(const q of line.slice(1))await p.mouse.move(...at(...q),{steps:6});await p.mouse.up();}
  await p.evaluate(s=>{const a=document.getElementById('ambientFaceInput');a.value='0:'+s;a.dispatchEvent(new Event('change',{bubbles:true}));const m=document.getElementById('ambientFaceAmt');m.value='100';m.dispatchEvent(new Event('input',{bubbles:true}))},scene);
 }
 await click('#viewerBtn');await p.waitForTimeout(800);
 const cdp=await ctx.newCDPSession(p);await cdp.send('Performance.enable');
 if(dev==='phone')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 await p.waitForTimeout(800);
 const m0=(await cdp.send('Performance.getMetrics')).metrics;
 const frames=await p.evaluate(()=>new Promise(r=>{const out=[];let last=performance.now();const t0=last;const f=now=>{out.push(now-last);last=now;now-t0<5000?requestAnimationFrame(f):r(out)};requestAnimationFrame(f)}));
 const m1=(await cdp.send('Performance.getMetrics')).metrics;
 const g=(m,k)=>m.find(x=>x.name===k).value;
 const fr=frames.slice(1).sort((a,b)=>a-b),avg=fr.reduce((a,b)=>a+b,0)/fr.length;
 const js=(g(m1,'ScriptDuration')-g(m0,'ScriptDuration'))*1000/fr.length;
 console.log(JSON.stringify({kind,scene,dev,opt,fps:+(1000/avg).toFixed(1),p95:+fr[Math.floor(fr.length*.95)].toFixed(1),jsPerFrame:+js.toFixed(2),errs}));
 await b.close();
})();
