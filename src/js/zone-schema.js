/* 0-3: 영역 속성표. 저장(clean)·불러오기 검사(sanitize)·화면 반영(updateUI/updateValues)·입력 연결·이동 스냅샷(snap)을
   모두 이 표 하나에서 만든다. 속성을 추가·변경할 때는 여기만 고친다. 표의 순서 = 저장 파일의 속성 순서(포맷 v2 그대로).
   항목: key, save(z)=저장값, read(z,ctx)=검사된 값, snap(z)=이동 스냅샷 값(위치·모양만),
         ui={input, output?, fmt?(v)=표시글, toInput?(v), fromInput?(값), check?, event?, mask?, noPreview?} */
const zNum=(val,d)=>Number.isFinite(Number(val))?Number(val):d;
const zPoints=(list,max,d)=>Array.isArray(list)?list.slice(0,max).map(p=>[clamp(zNum(p[0],d),0,1),clamp(zNum(p[1],d),0,1)]):[];
const copyPoints=list=>(list||[]).map(p=>[...p]);
const num=(key,def,min,max,ui)=>({key,save:z=>z[key],read:z=>clamp(zNum(z[key],def),min,max),ui});
const flag=(key,ui)=>({key,save:z=>z[key],read:z=>!!z[key],ui});
const pct=v=>`${v}%`,deg=v=>`${Math.round(v)}°`;
const faceRefOk=v=>typeof v==='string'&&/^[0-2]:(smile|shy|cry|angry|surprise)$/.test(v);
const AUTO_AXES=['x','y','diag','diagBack','arcUp','arcDown','pulse'];
const ZONE_FIELDS=[
 {key:'tailCutout',save:z=>!!z.tailCutout,read:z=>z.tailCutout===true},
 {key:'preset',save:z=>z.preset,read:z=>Object.hasOwn(MOTION_PRESETS,z.preset)?z.preset:"custom"},
 {key:'breathSpeed',save:z=>z.breathSpeed,read:z=>clamp(zNum(z.breathSpeed,1),.2,3)},
 {key:'isBase',save:z=>!!z.isBase,read:z=>!!z.isBase},
 {key:'id',save:z=>z.id,read:z=>String(z.id||newId())},
 {key:'name',save:z=>z.name,read:(z,c)=>String(z.name||`영역 ${c.i+1}`).slice(0,26),ui:{input:'nameInput',event:'change',fromInput:x=>x,noPreview:true}},
 {key:'kind',save:z=>z.kind,read:(z,c)=>c.kind},
 {key:'x',save:z=>z.x,read:z=>clamp(zNum(z.x,.5),.001,.999),snap:z=>z.x},
 {key:'y',save:z=>z.y,read:z=>clamp(zNum(z.y,.5),.001,.999),snap:z=>z.y},
 {key:'rx',save:z=>z.rx,read:z=>clamp(zNum(z.rx,.12),.009,.5),snap:z=>z.rx},
 {key:'ry',save:z=>z.ry,read:z=>clamp(zNum(z.ry,.12),.009,.5),snap:z=>z.ry},
 {key:'rot',save:z=>z.rot||0,read:z=>zNum(z.rot,0),snap:z=>z.rot||0},
 {key:'scale',save:z=>z.scale||1,read:z=>clamp(zNum(z.scale,1),.15,5),snap:z=>z.scale||1},
 {key:'baseX',save:z=>z.baseX,read:z=>clamp(zNum(z.baseX,z.x??.5),0,1),snap:z=>z.baseX},
 {key:'baseY',save:z=>z.baseY,read:z=>clamp(zNum(z.baseY,z.y??.5),0,1),snap:z=>z.baseY},
 {key:'strokes',save:z=>z.kind==='brush'?z.strokes.map(s=>({r:s.r,points:s.points.map(p=>[p[0],p[1]])})):[],read:(z,c)=>c.strokes,snap:z=>z.strokes.map(s=>({r:s.r,points:s.points.map(p=>[...p])}))},
 {key:'polygon',save:z=>z.kind==='polygon'?z.polygon.map(p=>[p[0],p[1]]):[],read:(z,c)=>c.polygon,snap:z=>z.polygon.map(p=>[...p])},
 {key:'runs',save:z=>z.kind==='raster'?z.runs.map(a=>[...a]):[],read:(z,c)=>c.runs},
 {key:'axis',save:z=>z.axis,read:z=>['x','y','diag','diagBack','pulse','follow'].includes(z.axis)?z.axis:'follow',ui:{input:'axisInput',fromInput:x=>x}},
 num('strength',26,0,80,{input:'strengthInput',output:'strengthValue'}),
 num('spring',14,3,30,{input:'springInput',output:'springValue'}),
 num('damping',62,0,100,{input:'dampingInput',output:'dampingValue',fmt:pct}),
 flag('auto',{input:'autoInput',check:true}),
 num('autoSpeed',1,.2,3,{input:'autoSpeedInput'}),
 num('feather',8,0,45,{input:'featherInput',output:'featherValue',mask:true}),
 num('breath',8,0,40,{input:'breathInput',output:'breathValue'}),
 num('wave',0,0,40,{input:'waveInput',output:'waveValue'}),
 num('twist',0,0,60,{input:'twistInput',output:'twistValue'}),
 num('ripple',0,0,40,{input:'rippleInput',output:'rippleValue'}),
 num('flow',0,0,65,{input:'flowInput',output:'flowValue'}),
 num('flowAngle',0,-180,180,{input:'flowAngleInput',output:'flowAngleValue',fmt:deg}),
 num('spread',9,0,26,{input:'spreadInput',output:'spreadValue',mask:true}),
 flag('pivotEnabled',{input:'pivotEnabledInput',check:true}),
 {key:'pivotX',save:z=>z.pivotX,read:z=>clamp(zNum(z.pivotX,z.x??.5),0,1),snap:z=>z.pivotX},
 {key:'pivotY',save:z=>z.pivotY,read:z=>clamp(zNum(z.pivotY,z.y??.5),0,1),snap:z=>z.pivotY},
 num('pivotStrength',60,0,100,{input:'pivotStrengthInput',output:'pivotStrengthValue',fmt:pct}),
 {key:'spine',save:z=>z.spine,read:z=>zPoints(z.spine,40,.5),snap:z=>copyPoints(z.spine)},
 {key:'branch',save:z=>z.branch,read:z=>zPoints(z.branch,30,.5),snap:z=>copyPoints(z.branch)},
 {key:'extraPivots',save:z=>z.extraPivots,read:z=>zPoints(z.extraPivots,2,.5),snap:z=>copyPoints(z.extraPivots)},
 num('windStrength',0,0,165,{input:'windStrengthInput',output:'windStrengthValue',fmt:v=>`${Math.round(v/1.65)}%`}),// 3-M: 상한을 올렸다(예전 100 = 지금 약 60%)
 num('windAngle',0,-180,180,{input:'windAngleInput',output:'windAngleValue',fmt:v=>`${v}°`}),
 num('windSpeed',1,.2,5,{input:'windSpeedInput',output:'windSpeedValue',fmt:v=>`${v.toFixed(1)}×`}),
 num('windNoise',30,0,100,{input:'windNoiseInput',output:'windNoiseValue',fmt:pct}),
 num('windDelay',50,0,100,{input:'windDelayInput',output:'windDelayValue',fmt:pct}),
 num('tapGain',100,0,200,{input:'tapGainInput',output:'tapGainValue',fmt:pct}),
 num('dragGain',100,0,200,{input:'dragGainInput',output:'dragGainValue',fmt:pct}),
 num('holdGain',60,0,200,{input:'holdGainInput',output:'holdGainValue',fmt:pct}),
 num('flickGain',100,0,200,{input:'flickGainInput',output:'flickGainValue',fmt:pct}),
 num('pull',50,0,100,{input:'pullInput',output:'pullValue',fmt:pct}),
 num('autoRest',0,0,6,{input:'autoRestInput',output:'autoRestValue',fmt:v=>v?`${v.toFixed(1)}초`:'쉬지 않음'}),
 flag('locked',{input:'lockedInput',check:true,noPreview:true}),
 // 3-M: 연속 움직임의 방향. 터치 방향(axis)과 따로 둔다. 예전 파일에는 없으므로 axis에서 정한다(끄는 쪽 = 위아래).
 {key:'autoAxis',save:z=>z.autoAxis,read:z=>AUTO_AXES.includes(z.autoAxis)?z.autoAxis:AUTO_AXES.includes(z.axis)?z.axis:'y',ui:{input:'quickDirection',fromInput:x=>x}},
 // 얼굴 표정 4단계: 연속 움직임 동안의 표정, 터치 표정 반응, 연타 반응. 값 'k:표정' = 얼굴 k(0부터)의 그 표정. 예전 파일에는 없다(= 끔).
 {key:'autoFace',save:z=>z.autoFace||'',read:z=>faceRefOk(z.autoFace)?z.autoFace:'',ui:{input:'autoFaceInput',fromInput:x=>x}},
 num('autoFaceAmt',60,0,100,{input:'autoFaceAmt',output:'autoFaceAmtValue',fmt:pct}),
 flag('tapFaceOn',{input:'tapFaceOn',check:true}),
 {key:'tapFace',save:z=>z.tapFace,read:z=>faceRefOk(z.tapFace)?z.tapFace:'0:surprise',ui:{input:'tapFaceInput',fromInput:x=>x}},
 num('tapFaceAmt',70,0,100,{input:'tapFaceAmt',output:'tapFaceAmtValue',fmt:pct}),
 flag('comboOn',{input:'comboOn',check:true}),
 {key:'comboMode',save:z=>z.comboMode,read:z=>z.comboMode==='other'?'other':'more',ui:{input:'comboMode',fromInput:x=>x}},
 {key:'hitMark',save:z=>z.hitMark||'',read:z=>['red','crack'].includes(z.hitMark)?z.hitMark:'',ui:{input:'hitMarkInput',fromInput:x=>x}},
 {key:'comboFace',save:z=>z.comboFace,read:z=>faceRefOk(z.comboFace)?z.comboFace:'0:angry',ui:{input:'comboFaceInput',fromInput:x=>x}},
];
// 저장하지 않는 실행 중 상태(물리·터치). 불러올 때마다 초기화된다.
function zoneRuntime(i){return {s:0,v:0,phase:i*1.7+.2,hitDX:0,hitDY:1,hitPulse:0,hitX:.5,hitY:.5,grabX:.5,grabY:.5,hitAt:-20,hitPower:0,physX:0,physY:0,physVX:0,physVY:0,physScale:0,physSV:0,dragging:false,desiredX:0,desiredY:0,desiredScale:0,chainNodes:null,branchNodes:null,spineTip:[0,0],spineMid:[0,0],branchTip:[0,0],windX:0,windY:0,physicsOutput:null}}
const ZONE_UI=ZONE_FIELDS.filter(f=>f.ui);
function clean(z){const out={};for(const f of ZONE_FIELDS)out[f.key]=f.save(z);return out}
function sanitize(z,i){const kind=['brush','ellipse','raster','polygon'].includes(z.kind)?z.kind:'ellipse';const n=zNum;
let strokes=[];if(kind==='brush'&&Array.isArray(z.strokes))strokes=z.strokes.slice(0,80).map(s=>({r:clamp(n(s.r,.05),.005,.25),points:(Array.isArray(s.points)?s.points:[]).slice(0,2500).map(p=>[clamp(n(p[0],0),0,1),clamp(n(p[1],0),0,1)])})).filter(s=>s.points.length);
const polygon=(kind==='polygon'&&Array.isArray(z.polygon)?z.polygon:[]).slice(0,3500).map(p=>[clamp(n(p[0],0),0,1),clamp(n(p[1],0),0,1)]);
const runs=(kind==='raster'&&Array.isArray(z.runs)?z.runs:[]).slice(0,150000).map(v=>[Math.max(0,Math.floor(n(v[0],0))),Math.max(0,Math.floor(n(v[1],0)))]).filter(([a,b])=>b&&a<TILE*TILE);
const ctx={i,kind,strokes,polygon,runs},v={};for(const f of ZONE_FIELDS)v[f.key]=f.read(z,ctx);Object.assign(v,zoneRuntime(i));
if(kind==='brush'&&strokes.length)recalcBounds(v);if(kind==='polygon'&&polygon.length)recalcPolygon(v);return v}
