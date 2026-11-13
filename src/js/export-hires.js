// 3-G 원본 해상도로 녹화하기. 편집은 긴 변 1900px 사본으로 하고(가볍게), 녹화하는 동안만 원본 그림을 그래픽 카드에 올린다.
// 채움판(외곽 흔들기·배경 제외용으로 구멍을 메운 그림)은 1900 사본에서 만든 것이라, 원본 위에 '메운 자리'만 덮어 쓴다.
// 그래서 몸체·배경·흔들리는 부위 모두 원본 화질이고, 움직일 때 잠깐 드러나는 채움 자리만 1900 기준이다.
let sourceSize={w:0,h:0},hiResActive=false;
function glLimits(){
 if(!gl)return {tex:0,view:0};
 const vp=gl.getParameter(gl.MAX_VIEWPORT_DIMS)||[4096,4096];
 return {tex:gl.getParameter(gl.MAX_TEXTURE_SIZE)||4096,view:Math.min(vp[0],vp[1],gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096)};
}
// 채움판과 사본이 다른 곳(=메운 자리)만 알파로 남긴 가림막. 2칸 넓히고 살짝 흐리게 해 이음매가 안 보이게 한다.
function plateHoleMask(plate){
 const W=renderWidth,H=renderHeight,a=document.createElement('canvas');a.width=W;a.height=H;
 const pg=document.createElement('canvas');pg.width=W;pg.height=H;const p=pg.getContext('2d',{willReadFrequently:true});p.drawImage(plate,0,0,W,H);
 const pd=p.getImageData(0,0,W,H).data;p.clearRect(0,0,W,H);p.drawImage(bitmap,0,0,W,H);const bd=p.getImageData(0,0,W,H).data;
 const out=new ImageData(W,H);
 for(let i=0;i<pd.length;i+=4){if(Math.abs(pd[i]-bd[i])+Math.abs(pd[i+1]-bd[i+1])+Math.abs(pd[i+2]-bd[i+2])>6)out.data[i+3]=255}
 const g=a.getContext('2d');g.putImageData(out,0,0);
 const b=document.createElement('canvas');b.width=W;b.height=H;const bg=b.getContext('2d');bg.filter='blur(1.5px)';
 for(const [dx,dy] of [[0,0],[-2,0],[2,0],[0,-2],[0,2]])bg.drawImage(a,dx,dy);
 return b;
}
function hiPlate(plate,hi){
 const c=document.createElement('canvas');c.width=hi.width;c.height=hi.height;const g=c.getContext('2d');
 const m=document.createElement('canvas');m.width=hi.width;m.height=hi.height;const mg=m.getContext('2d');
 mg.drawImage(plateHoleMask(plate),0,0,hi.width,hi.height);mg.globalCompositeOperation='source-in';mg.drawImage(plate,0,0,hi.width,hi.height);
 g.drawImage(hi,0,0);g.drawImage(m,0,0);return c;
}
// 필요한 긴 변(px)만큼 원본을 올린다. 사본으로 충분하거나 WebGL이 없으면 아무것도 하지 않는다.
async function enterHiRes(needLong){
 if(!gl||!imgBlob||hiResActive)return null;
 const curLong=Math.max(renderWidth,renderHeight),srcLong=Math.max(sourceSize.w,sourceSize.h);
 const want=Math.min(srcLong,Math.ceil(needLong),glLimits().tex);
 if(want<=curLong*1.02)return null;
 const src=await loadImage(imgBlob),s=want/Math.max(src.naturalWidth,src.naturalHeight);
 const hi=document.createElement('canvas');hi.width=Math.max(1,Math.round(src.naturalWidth*s));hi.height=Math.max(1,Math.round(src.naturalHeight*s));
 hi.getContext('2d').drawImage(src,0,0,hi.width,hi.height);
 const bgPlate=tailBasePlate||backgroundPlate,body=tailPlate?hiPlate(tailPlate,hi):hi,back=bgPlate?hiPlate(bgPlate,hi):hi;
 gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,imageTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,body);
 if(backgroundTex){gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,backgroundTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,back)}
 if(tailPlate&&tailOriginalTex){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,tailOriginalTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,hi)}
 gl.activeTexture(gl.TEXTURE0);
 hiResActive=true;return {w:hi.width,h:hi.height};
}
function leaveHiRes(){
 if(!hiResActive)return;hiResActive=false;
 if(gl){if(baseMaskTex&&backgroundTex)syncBaseTexturesGL();else uploadImage()}
}
