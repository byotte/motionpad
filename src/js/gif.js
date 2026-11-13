// 3-E 움짤(GIF) 만들기. 외부 라이브러리 없이 직접 인코딩한다(캔버스 없는 순수 계산).
// 팔레트는 첫 프레임에서 한 번 만든다(움직임만 있고 색은 거의 그대로라서). 각 프레임은 앞 프레임과 달라진 사각형만 저장한다.
// 쓰는 법: const gif=createGifEncoder(W,H,{colors}); gif.addFrame(rgba,보여줄시간_1/100초); ... const bytes=gif.finish();
const BAYER4=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function createGifEncoder(W,H,{colors=256,dither=1}={}){
 const out=[];let pos=0;
 const byte=b=>{out.push(b&255)},word=w=>{byte(w);byte(w>>8)},str=s=>{for(const ch of s)byte(ch.charCodeAt(0))};
 let palette=null,bits=8,lookup=null,prev=null;
 // 중간 자르기(median cut)로 팔레트 만들기. 5비트(32단계) 색 히스토그램 위에서 계산해 빠르다.
 function buildPalette(rgba,want){
  const hist=new Uint32Array(32768);
  for(let i=0;i<rgba.length;i+=4)hist[((rgba[i]>>3)<<10)|((rgba[i+1]>>3)<<5)|(rgba[i+2]>>3)]++;
  const cols=[];for(let c=0;c<32768;c++)if(hist[c])cols.push(c);
  let boxes=[cols];
  const ch=(c,k)=>k===0?c>>10:k===1?(c>>5)&31:c&31;
  while(boxes.length<want){
   let best=-1,bi=-1,bk=0;
   for(let i=0;i<boxes.length;i++){const b=boxes[i];if(b.length<2)continue;
    for(let k=0;k<3;k++){let lo=31,hi=0;for(const c of b){const v=ch(c,k);if(v<lo)lo=v;if(v>hi)hi=v}
     let n=0;for(const c of b)n+=hist[c];const score=(hi-lo)*Math.sqrt(n);if(score>best){best=score;bi=i;bk=k}}}
   if(bi<0||best<=0)break;
   const b=boxes[bi].sort((x,y)=>ch(x,bk)-ch(y,bk));let total=0;for(const c of b)total+=hist[c];
   let acc=0,cut=1;for(let i=0;i<b.length-1;i++){acc+=hist[b[i]];if(acc>=total/2){cut=i+1;break}}
   boxes.splice(bi,1,b.slice(0,cut),b.slice(cut));
  }
  const pal=[];for(const b of boxes){let n=0,r=0,g=0,bl=0;for(const c of b){const w=hist[c];n+=w;r+=w*((c>>10)<<3|4);g+=w*(((c>>5)&31)<<3|4);bl+=w*((c&31)<<3|4)}pal.push([Math.round(r/n),Math.round(g/n),Math.round(bl/n)])}
  return pal;
 }
 function nearest(c){
  if(lookup[c]!==65535)return lookup[c];
  const r=(c>>10)<<3|4,g=((c>>5)&31)<<3|4,b=(c&31)<<3|4;let bi=0,bd=1e9;
  for(let i=0;i<palette.length;i++){const p=palette[i],d=(p[0]-r)**2*2+(p[1]-g)**2*4+(p[2]-b)**2*3;if(d<bd){bd=d;bi=i}}
  return lookup[c]=bi;
 }
 function lzw(idx,minCode){
  const clear=1<<minCode,eoi=clear+1;let size=minCode+1,next=eoi+1;const dict=new Map();
  const bytes=[];let acc=0,nb=0;const emit=code=>{acc|=code<<nb;nb+=size;while(nb>=8){bytes.push(acc&255);acc>>>=8;nb-=8}};
  emit(clear);let cur=idx[0];
  for(let i=1;i<idx.length;i++){const k=idx[i],key=cur*4096+k,hit=dict.get(key);
   if(hit!==undefined){cur=hit;continue}
   emit(cur);
   if(next<4096){dict.set(key,next++);if(next>(1<<size)&&size<12)size++}
   else{emit(clear);dict.clear();size=minCode+1;next=eoi+1}
   cur=k}
  emit(cur);emit(eoi);if(nb>0)bytes.push(acc&255);
  return bytes;
 }
 function header(){
  str('GIF89a');word(W);word(H);byte(0xF0|(bits-1));byte(0);byte(0);
  for(let i=0;i<(1<<bits);i++){const p=palette[i]||[0,0,0];byte(p[0]);byte(p[1]);byte(p[2])}
  str('!\xFF\x0BNETSCAPE2.0');byte(3);byte(1);word(0);byte(0);// 무한 반복
 }
 return {
  addFrame(rgba,delay=4){
   if(!palette){palette=buildPalette(rgba,Math.max(2,Math.min(256,colors)));bits=Math.max(1,Math.ceil(Math.log2(palette.length)));lookup=new Uint16Array(32768).fill(65535);header()}
   const idx=new Uint8Array(W*H);
   // 4×4 순서 디더링: 자리마다 같은 무늬라 가만히 있는 부분은 프레임 사이에 그대로다(용량 유지). 그라데이션 줄무늬를 줄인다.
   const amp=dither;
   for(let y=0,j=0;y<H;y++)for(let x=0;x<W;x++,j++){const i=j*4,o=amp?(BAYER4[(y&3)*4+(x&3)]-7.5)*amp:0;
    const r=Math.min(255,Math.max(0,rgba[i]+o)),gg=Math.min(255,Math.max(0,rgba[i+1]+o)),b=Math.min(255,Math.max(0,rgba[i+2]+o));
    idx[j]=nearest(((r>>3)<<10)|((gg>>3)<<5)|(b>>3))}
   let x0=0,y0=0,x1=W-1,y1=H-1;
   if(prev){x0=W;y0=H;x1=-1;y1=-1;
    for(let y=0;y<H;y++){const row=y*W;for(let x=0;x<W;x++)if(idx[row+x]!==prev[row+x]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;y1=y}}
    if(x1<0){x0=y0=0;x1=y1=0}}// 바뀐 곳이 없으면 1픽셀만
   const w=x1-x0+1,h=y1-y0+1,sub=new Uint8Array(w*h);
   for(let y=0;y<h;y++)sub.set(idx.subarray((y+y0)*W+x0,(y+y0)*W+x0+w),y*w);
   byte(0x21);byte(0xF9);byte(4);byte(0x04);word(Math.max(2,Math.round(delay)));byte(0);byte(0);// 그대로 두기(disposal 1)
   byte(0x2C);word(x0);word(y0);word(w);word(h);byte(0);
   const minCode=Math.max(2,bits);byte(minCode);
   const data=lzw(sub,minCode);for(let i=0;i<data.length;i+=255){const n=Math.min(255,data.length-i);byte(n);for(let k=0;k<n;k++)out.push(data[i+k])}byte(0);
   prev=idx;
  },
  size(){return out.length},
  finish(){byte(0x3B);return new Uint8Array(out)}
 };
}
