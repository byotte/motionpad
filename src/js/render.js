/* Rendering adapter. Physics emits UV-displacements independently of GLSL or Canvas. */
let meshVBO=null,meshIBO=null,meshIndexCount=0;
function rebuildMesh(){
  if(!gl||!program)return;
  const [cols,rows]=meshSegments,vertices=[],indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
    const u=x/cols,v=y/rows;vertices.push(u*2-1,1-v*2,u,v);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  meshIndexCount=indices.length;
  if(!meshVBO)meshVBO=gl.createBuffer();if(!meshIBO)meshIBO=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,meshVBO);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,meshIBO);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  for(const [name,ofs] of [['a_pos',0],['a_uv',2]]){
    const idx=gl.getAttribLocation(program,name);if(idx<0)continue;
    gl.enableVertexAttribArray(idx);gl.vertexAttribPointer(idx,2,gl.FLOAT,false,16,ofs*4);
  }
}
function setupGL(){
  try{
    gl=view.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'default'});
    if(!gl)throw Error('WebGL을 사용할 수 없습니다.');
    view.addEventListener('webglcontextlost',e=>{e.preventDefault();if(!gl)return;gl=null;program=null;meshVBO=meshIBO=null;const fresh=document.createElement('canvas');fresh.id='view';view.replaceWith(fresh);view=fresh;draw2d=view.getContext('2d');fit();setStatus('그래픽 연결이 끊겨 기본 렌더링으로 전환했습니다.');},{once:true});
    const vs=compile(gl,gl.VERTEX_SHADER,VERT),fs=compile(gl,gl.FRAGMENT_SHADER,FRAG);
    program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link: '+gl.getProgramInfoLog(program));
    gl.useProgram(program);
    uni={pull:gl.getUniformLocation(program,'u_pull[0]'),zone:gl.getUniformLocation(program,'u_zone[0]'),motion:gl.getUniformLocation(program,'u_motion[0]'),fx:gl.getUniformLocation(program,'u_fx[0]'),tap:gl.getUniformLocation(program,'u_tap[0]'),pivot:gl.getUniformLocation(program,'u_pivot[0]'),flow:gl.getUniformLocation(program,'u_flow[0]'),spine:gl.getUniformLocation(program,'u_spine[0]'),spinemotion:gl.getUniformLocation(program,'u_spinemotion[0]'),chainMid:gl.getUniformLocation(program,'u_chainMid[0]'),branchLine:gl.getUniformLocation(program,'u_branchLine[0]'),branchMotion:gl.getUniformLocation(program,'u_branchMotion[0]'),pivotExtra:gl.getUniformLocation(program,'u_pivotExtra[0]'),baseExclude:gl.getUniformLocation(program,'u_baseExclude'),tailCutout:gl.getUniformLocation(program,'u_tailCutout'),time:gl.getUniformLocation(program,'u_time'),count:gl.getUniformLocation(program,'u_count'),ambient:gl.getUniformLocation(program,'u_ambient'),bodyCenter:gl.getUniformLocation(program,'u_bodyCenter')};
    rebuildMesh();
    function newTexture(unit){const tex=gl.createTexture();gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return tex}
    imageTex=newTexture(gl.TEXTURE0);maskTex=newTexture(gl.TEXTURE1);baseMaskTex=newTexture(gl.TEXTURE2);backgroundTex=newTexture(gl.TEXTURE3);
    tailOriginalTex=newTexture(gl.TEXTURE4);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,emptyBaseMask);
    tailMaskTex=newTexture(gl.TEXTURE5);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,emptyBaseMask);
    gl.uniform1i(gl.getUniformLocation(program,'u_tailOriginal'),4);
    gl.uniform1i(gl.getUniformLocation(program,'u_tailMask'),5);
    distTex=newTexture(gl.TEXTURE6);lastDistLayout='';
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,emptyBaseMask);
    gl.uniform1i(gl.getUniformLocation(program,'u_dist'),6);
    faceTex=newTexture(gl.TEXTURE7);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([128,128,0,255]));faceChanged(false);
    gl.uniform1i(gl.getUniformLocation(program,'u_face'),7);uni.faceRect=gl.getUniformLocation(program,'u_faceRect[0]');uni.faceCount=gl.getUniformLocation(program,'u_faceCount');
    gl.uniform1i(gl.getUniformLocation(program,'u_tex'),0);gl.uniform1i(gl.getUniformLocation(program,'u_mask'),1);gl.uniform1i(gl.getUniformLocation(program,'u_baseMask'),2);gl.uniform1i(gl.getUniformLocation(program,'u_background'),3);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    return true;
  }catch(e){
    console.warn('WebGL 실행 실패; Canvas 2D로 전환:',e);
    gl=null;program=null;meshVBO=meshIBO=null;
    const fresh=document.createElement('canvas');fresh.id='view';view.replaceWith(fresh);view=fresh;
    draw2d=view.getContext('2d');fit();return false;
  }
}

function distSegment(px,py,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((px-a[0])*dx+(py-a[1])*dy)/Math.max(.000001,dx*dx+dy*dy),0,1);
 return [Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy),t];
}
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
function cpuDeformation(z,x,y){
 const relX=x-z.x,relY=y-z.y,radius=Math.max(.028,Math.hypot(z.rx,z.ry)*1.15,z.pivotEnabled?Math.hypot(Math.abs((z.pivotX??z.x)-z.x)+z.rx,Math.abs((z.pivotY??z.y)-z.y)+z.ry):0);
 let near=Math.hypot(x-(z.pivotX??z.x),y-(z.pivotY??z.y));
 for(const p of (z.extraPivots||[]))near=Math.min(near,Math.hypot(x-p[0],y-p[1]));
 const pin=smoothstep(.018,radius,near),pivotWeight=z.pivotEnabled?1+(pin-1)*clamp((z.pivotStrength??60)/100*1.65,0,1):1;
 const pull=(z.pull??50)/100,reach=Math.max(.02,Math.hypot(z.rx,z.ry)*(1.1+(.42-1.1)*pull));
 const grab=Math.exp(-((x-(z.grabX??z.x))**2+(y-(z.grabY??z.y))**2)/(reach*reach)),D=[z.physX||0,z.physY||0];
 let px=D[0]*grab*(1+6*pull),py=D[1]*grab*(1+6*pull);const soft=1+Math.hypot(px,py)/.06;px/=soft;py/=soft;
 let dx=((z.motionX||0)-D[0]+D[0]+(px-D[0])*pull)*pivotWeight+relX*(z.motionScale||0)*pivotWeight;
 let dy=((z.motionY||0)-D[1]+D[1]+(py-D[1])*pull)*pivotWeight+relY*(z.motionScale||0)*pivotWeight;
 const t=elapsed*(z.breathSpeed??1),phase=z.phase;
 const inhale=.76*Math.sin(t*1.4+phase*.12-.3)+.24*Math.sin(t*.72+phase*.08+.34);
 const rd=Math.hypot(relX/Math.max(z.rx,.03),relY/Math.max(z.ry,.03));
 const inner=smoothstep(0,.44,rd)*(1-smoothstep(.88,2.2,rd));
 const l=Math.hypot(relX+.0001,relY+.0001);
 const pulse=(z.breath||0)*(z.autoEnv??1)/40*.0105*inhale*inner*pivotWeight;
 dx+=(relX+.0001)/l*pulse;dy+=(relY+.0001)/l*pulse;
 dx+=Math.sin(relY*42+elapsed*1.9+z.phase)*(z.wave||0)*(z.autoEnv??1)/40*.0036*pivotWeight;
 dy+=Math.sin(relX*38+elapsed*1.5+z.phase)*(z.wave||0)*(z.autoEnv??1)/40*.0022*pivotWeight;
 dx-=relY*Math.sin(elapsed*1.25+z.phase)*(z.twist||0)*(z.autoEnv??1)/35*.023*pivotWeight;
 dy+=relX*Math.sin(elapsed*1.25+z.phase)*(z.twist||0)*(z.autoEnv??1)/35*.023*pivotWeight;
 if(z.spine?.length>=2){
   const [dist,t]=distSegment(x,y,z.spine[0],z.spine[z.spine.length-1]);
   const influence=(1-smoothstep(.035,.21,dist))*pivotWeight;
   const mid=Math.sin(Math.PI*t),tip=smoothstep(.4,.99,t);
   dx+=(z.spineMid?.[0]||0)*mid*influence+(z.spineTip?.[0]||0)*tip*influence;
   dy+=(z.spineMid?.[1]||0)*mid*influence+(z.spineTip?.[1]||0)*tip*influence;
 }
 if(z.branch?.length>=2){
   const [dist,t]=distSegment(x,y,z.branch[0],z.branch[z.branch.length-1]);
   const infl=(1-smoothstep(.026,.13,dist))*t*t*pivotWeight;
   dx+=(z.branchTip?.[0]||0)*infl;dy+=(z.branchTip?.[1]||0)*infl;
 }
 if((z.ripple||0)&&elapsed-z.hitAt>=0&&elapsed-z.hitAt<1.6){
   const age=elapsed-z.hitAt,rad=Math.hypot(x-z.hitX,y-z.hitY);
   const pulse=Math.sin(rad*75-age*23)*Math.exp(-age*3)*(1-smoothstep(0,1.6,age))*(z.ripple/40)*.0036*z.hitPower*pivotWeight;
   dx+=(relX+.0001)/l*pulse;dy+=(relY+.0001)/l*pulse;
 }
 if((z.flow||0)>0){const flow=(z.flow||0)*(z.autoEnv??1)/40*.008,theta=(z.flowAngle||0)*Math.PI/180;dx+=Math.cos(theta)*flow*Math.sin(elapsed*.7);dy+=Math.sin(theta)*flow*Math.sin(elapsed*.7)}
 return [clamp(dx,-.065,.065),clamp(dy,-.065,.065)];
}
function canvasWarpRegion(g,z,w,h,source=bitmap){
 const x0=clamp(z.x-z.rx-.10,0,1),y0=clamp(z.y-z.ry-.10,0,1),x1=clamp(z.x+z.rx+.10,0,1),y1=clamp(z.y+z.ry+.10,0,1);
 if(x1-x0<.001||y1-y0<.001)return;
 const nx=qualityScale<.8?7:11,ny=qualityScale<.8?8:13;
 const dx=(x1-x0)*w/nx,dy=(y1-y0)*h/ny;
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
   const X=x0*w+i*dx,Y=y0*h+j*dy,sw=Math.max(.5,dx+.75),sh=Math.max(.5,dy+.75);
   const u=(X+dx*.5)/w,v=(Y+dy*.5)/h,[mx,my]=cpuDeformation(z,u,v);
   const xs=clamp((X-mx*w)*renderWidth/w,0,Math.max(0,renderWidth-sw*renderWidth/w));
   const ys=clamp((Y-my*h)*renderHeight/h,0,Math.max(0,renderHeight-sh*renderHeight/h));
   g.drawImage(source,xs,ys,Math.min(renderWidth-xs,sw*renderWidth/w),Math.min(renderHeight-ys,sh*renderHeight/h),X,Y,sw,sh);
 }
}

function render(){
 if(!ready||!bitmap)return;
 const blinkChanged=updateBlinkScene();
 if(gl&&blinkChanged){
  uploadBlinkTexture(gl.TEXTURE0,imageTex,blinkScene||tailPlate||bitmap);
  if(tailPlate)uploadBlinkTexture(gl.TEXTURE4,tailOriginalTex,blinkOriginal||bitmap);
 }
 if(gl){
   const zp=new Float32Array(LIMIT*4),mo=new Float32Array(LIMIT*4),fx=new Float32Array(LIMIT*4),tp=new Float32Array(LIMIT*4),pv=new Float32Array(LIMIT*4),fl=new Float32Array(LIMIT*4),sp=new Float32Array(LIMIT*4),sm=new Float32Array(LIMIT*4),cm=new Float32Array(LIMIT*4),bl=new Float32Array(LIMIT*4),bm=new Float32Array(LIMIT*4),pe=new Float32Array(LIMIT*4);
   const pu=new Float32Array(LIMIT*4);
   for(let i=0;i<zones.length;i++){
     const z=zones[i],dir=z.flowAngle*Math.PI/180;
     zp.set([z.x,z.y,z.rx,z.ry],i*4);
     mo.set([z.motionX||0,z.motionY||0,z.motionScale||0,z.breathSpeed??1],i*4);
     const env=z.autoEnv??1;
     fx.set([z.breath/40*env,z.wave/40*env,z.twist/35*env,z.ripple/40],i*4);
     tp.set([z.hitX,z.hitY,elapsed-z.hitAt,z.hitPower],i*4);
     pv.set([z.pivotX??z.x,z.pivotY??z.y,z.pivotEnabled?1:0,(z.pivotStrength??60)/100],i*4);
     fl.set([(z.flow||0)/40*.014*env,Math.cos(dir),Math.sin(dir),z.phase],i*4);
     const a=z.spine?.[0]||[z.x,z.y],b=z.spine?.[z.spine.length-1]||[z.x,z.y];
     sp.set([a[0],a[1],b[0],b[1]],i*4);
     // 2-M: 경계 띠가 접히지 않고 버티는 이동량(safe)과, 이 영역이 지금 낼 수 있는 이동량의 상한. 상한이 절반을 넘을 때만 셰이더가 거리 지도를 본다.
     const safe=Math.max(1,Math.round(Math.max(0,z.feather||0)*.63)*2.5)/TILE,reachR=Math.hypot(z.rx,z.ry)+.19;
     const bound=Math.hypot(z.motionX||0,z.motionY||0)+2*Math.hypot(z.physX||0,z.physY||0)+Math.abs(z.motionScale||0)*reachR+(.0105*z.breath/40+.006*z.wave/40+.023*z.twist/35*reachR)*env+.0036*z.ripple/40*(z.hitPower||0)+Math.hypot(z.spineTip?.[0]||0,z.spineTip?.[1]||0)+Math.hypot(z.spineMid?.[0]||0,z.spineMid?.[1]||0)+Math.hypot(z.branchTip?.[0]||0,z.branchTip?.[1]||0);
     sm.set([z.spineTip?.[0]||0,z.spineTip?.[1]||0,z.spine?.length>=2?1:0,bound>.5*safe?safe:0],i*4);
     cm.set([z.spineMid?.[0]||0,z.spineMid?.[1]||0,(z.pull??50)/100,0],i*4);
     pu.set([z.grabX??z.x,z.grabY??z.y,z.physX||0,z.physY||0],i*4);
     const ba=z.branch?.[0]||[z.x,z.y],bb=z.branch?.[z.branch.length-1]||[z.x,z.y];
     bl.set([ba[0],ba[1],bb[0],bb[1]],i*4);bm.set([z.branchTip?.[0]||0,z.branchTip?.[1]||0,z.branch?.length>=2?1:0,0],i*4);
     const ep=z.extraPivots||[];pe.set([ep[0]?.[0]??-1,ep[0]?.[1]??-1,ep[1]?.[0]??-1,ep[1]?.[1]??-1],i*4);
   }
   gl.useProgram(program);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,imageTex);
   gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTex);
   gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,baseMaskTex);
   gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,backgroundTex);
   gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,distTex);
   faceUpload();
   for(const [name,data] of [['zone',zp],['motion',mo],['fx',fx],['tap',tp],['pivot',pv],['flow',fl],['spine',sp],['spinemotion',sm],['chainMid',cm],['branchLine',bl],['branchMotion',bm],['pivotExtra',pe],['pull',pu]])if(uni[name])gl.uniform4fv(uni[name],data);
   const tl=tailPlate?tailCutoutZones().map(z=>zones.indexOf(z)):[];
   gl.uniform4f(uni.tailCutout,tl[0]??-1,tl[1]??-1,tl[2]??-1,tl[3]??-1);
   gl.uniform1f(uni.baseExclude,baseBackgroundExclude&&backgroundPlate?1:0);
   {const b=getBase();gl.uniform2f(uni.bodyCenter,b?b.x:.5,b?clamp(b.y-b.ry*.25,.1,.9):.45)}// 호흡의 중심 = 몸체의 가슴께(없으면 그림 가운데 조금 위)
   gl.uniform4f(uni.ambient,ambient.enabled?1:0,ambient.enabled?ambient.breath/100:0,ambient.enabled?ambient.sway/100:0,ambient.enabled?ambient.light/100:0);
   gl.uniform1f(uni.time,elapsed);gl.uniform1i(uni.count,zones.length);
   gl.drawElements(gl.TRIANGLES,meshIndexCount,gl.UNSIGNED_SHORT,0);
   return;
 }
 if(!draw2d)return;
 const w=view.width,h=view.height;
 draw2d.clearRect(0,0,w,h);
 const cutouts=tailPlate?tailCutoutZones():[];
 const scene=blinkScene||tailPlate||bitmap;
 const b=ambient.enabled?ambient.breath/100:0,s=ambient.enabled?ambient.sway/100:0;
 const scale=1+MotionPhysics.wave(elapsed*1.40,-.30)*b*.0073;
 const separated=baseBackgroundExclude&&baseMaskCanvas&&backgroundPlate;
 const base=separated?getBase():null;
 if(base){
   draw2d.drawImage(tailBasePlate||backgroundPlate,0,0,w,h);
   if(!baseForegroundSource){
    baseForegroundSource=document.createElement('canvas');
    baseForegroundSource.width=renderWidth;baseForegroundSource.height=renderHeight;
    const source=baseForegroundSource.getContext('2d');
    source.drawImage(scene,0,0,renderWidth,renderHeight);
    source.globalCompositeOperation='destination-in';
    source.drawImage(baseMaskCanvas,0,0,renderWidth,renderHeight);
   }
   const fg=baseForegroundCache||(baseForegroundCache=document.createElement('canvas'));
   if(fg.width!==w||fg.height!==h){fg.width=w;fg.height=h}
   const p=fg.getContext('2d');
   p.clearRect(0,0,w,h);
   p.save();
   p.translate(w/2+MotionPhysics.wave(elapsed*.98)*s*w*.0036,h);
   p.scale(scale,scale);
   p.translate(-w/2,-h);
   if(hasLocalMotion(base))canvasWarpRegion(p,base,w,h,baseForegroundSource);
   else p.drawImage(baseForegroundSource,0,0,w,h);
   p.restore();
   applyCanvasLight(p,w,h,true);
   draw2d.drawImage(fg,0,0);
 }else{
   draw2d.save();draw2d.translate(w/2+MotionPhysics.wave(elapsed*.98)*s*w*.0036,h);draw2d.scale(scale,scale);draw2d.translate(-w/2,-h);
   draw2d.drawImage(scene,0,0,w,h);draw2d.restore();
 }

 for(let i=0;i<zones.length;i++){
   const z=zones[i];
   if(z===base||cutouts.includes(z)||!hasLocalMotion(z))continue;
   let f=fallbacks[i];if(!f||f.width!==w||f.height!==h){f=document.createElement('canvas');f.width=w;f.height=h;fallbacks[i]=f}
   const g=f.getContext('2d');g.clearRect(0,0,w,h);
   canvasWarpRegion(g,z,w,h,scene);
   g.globalCompositeOperation='destination-in';g.drawImage(masks[i],0,0,w,h);
   g.globalCompositeOperation='source-over';draw2d.drawImage(f,0,0);
 }

 for(const cutout of cutouts){
   draw2d.save();
   draw2d.translate(w/2+MotionPhysics.wave(elapsed*.98)*s*w*.0036,h);
   draw2d.scale(scale,scale);
   draw2d.translate(-w/2,-h);
   canvasWarpRegion(draw2d,cutout,w,h,getTailSource(blinkOriginal||bitmap,cutout));
   draw2d.restore();
 }
 if(!base)applyCanvasLight(draw2d,w,h);
}

function hasLocalMotion(z){
 return Math.abs(z.motionX||0)+Math.abs(z.motionY||0)+Math.abs(z.motionScale||0)>=.00002||
  z.breath||z.wave||z.flow||z.twist||z.ripple||z.spine?.length||z.branch?.length;
}

function applyCanvasLight(g,w,h,foregroundOnly=false){
 if(!ambient.enabled||!ambient.light)return;
 const light=(.026*Math.sin(elapsed*.98)+.009*Math.sin(elapsed*.49+1))*ambient.light/100;
 g.save();
 if(foregroundOnly)g.globalCompositeOperation='source-atop';
 g.fillStyle=light<0?'#000':'#fff';
 g.globalAlpha=Math.abs(light);
 g.fillRect(0,0,w,h);
 g.restore();
}

