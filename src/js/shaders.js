const VERT=`attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform float u_time;
uniform vec4 u_ambient;
uniform vec2 u_bodyCenter;
uniform float u_baseExclude;
void main(){
  v_uv=a_uv;
  float topWeight=pow(clamp(1.0-a_uv.y,0.0,1.0),1.5);
  // Smooth, continuous motion: different non-integer oscillation periods suppress mechanical repetition.
  float inhale=.76*sin(u_time*1.40-.30)+.24*sin(u_time*.72+.34);
  float drift=.80*sin(u_time*.98)+.20*sin(u_time*1.51+1.7);
  // 3-N 호흡: 가슴(중심)이 좌우로 부풀고 그 위쪽이 살짝 들린다. 중심은 거의 안 움직이고 멀수록 많이 움직인다.
  vec2 bd=a_uv-u_bodyCenter;
  float lift=pow(clamp((u_bodyCenter.y+.12-a_uv.y)/(u_bodyCenter.y+.12),0.0,1.0),1.3);
  float widen=1.0-.65*smoothstep(u_bodyCenter.y,1.0,a_uv.y);
  vec2 breath=vec2(.030*bd.x*widen,-.014*lift)*u_ambient.y*inhale;
  vec2 delta=vec2(.013*u_ambient.z*drift*topWeight,0.0)+vec2(breath.x,-breath.y);
  gl_Position=vec4(a_pos+2.0*delta*(1.0-u_baseExclude),0.0,1.0);
}`;
const FRAG=`precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform sampler2D u_baseMask;
uniform sampler2D u_background;
uniform vec4 u_tailCutout;
uniform sampler2D u_tailOriginal,u_tailMask,u_dist;
// 얼굴·맞은 자리(FACE 판): 쓰는 동안만 이 판으로 그린다. 꺼져 있어도 셰이더에 있는 것만으로 느려지고, 저사양 기기에서는 이 판만 실패할 수 있어서다.
#ifdef FACE
uniform sampler2D u_face;
uniform vec4 u_faceRect[3],u_faceStyle[3],u_hitMark[4];
uniform int u_faceCount,u_hitCount;
uniform vec2 u_imgSize;
#endif
uniform float u_baseExclude;
uniform vec4 u_zone[12],u_motion[12],u_fx[12],u_tap[12],u_pivot[12],u_flow[12],u_spine[12],u_spinemotion[12];
uniform vec4 u_chainMid[12],u_branchLine[12],u_branchMotion[12],u_pivotExtra[12],u_pull[12];
uniform int u_count;
uniform float u_time;
uniform vec4 u_ambient;
uniform vec2 u_bodyCenter;
float anchoredDistance(vec2 uv,vec4 piv,vec4 extra){
 float d=distance(uv,piv.xy);
 if(extra.x>=0.0)d=min(d,distance(uv,extra.xy));
 if(extra.z>=0.0)d=min(d,distance(uv,extra.zw));
 return d;
}
float pointToSegment(vec2 uv,vec2 a,vec2 b,out float t){
 vec2 v=b-a;t=clamp(dot(uv-a,v)/max(dot(v,v),0.00001),0.0,1.0);
 return length(uv-(a+t*v));
}
#ifdef FACE
// 얼굴 표정(유동화): 얼굴 지도(얼굴 k = k번째 칸)의 이동량. 128 = 0, 1020분의 1 = 지도 범위의 비율
vec2 faceShift(vec2 uv){
 vec2 s=vec2(0.0);
 for(int k=0;k<3;k++){
  if(k>=u_faceCount)break;
  vec4 r=u_faceRect[k];vec2 l=(uv-r.xy)/r.zw;
  if(l.x>0.0&&l.x<1.0&&l.y>0.0&&l.y<1.0){vec4 t=texture2D(u_face,vec2((float(k)+l.x)/3.0,l.y));s+=(t.rg*255.0-128.0)/1020.0*r.zw;}
 }
 return s;
}
// 5단계 홍조·빨개짐: 붉은 정도. 얼굴 지도의 B(뺨·귀)에 고운 입자와 넓은 얼룩을 곱하고, 빗금 스타일이면 A 자리에 선을 긋는다.
float fHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float fNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(fHash(i),fHash(i+vec2(1,0)),f.x),mix(fHash(i+vec2(0,1)),fHash(i+vec2(1,1)),f.x),f.y);}
float faceRed(vec2 uv){
 float red=0.0;vec2 px=uv*u_imgSize;
 for(int k=0;k<3;k++){
  if(k>=u_faceCount)break;
  vec4 r=u_faceRect[k];vec2 l=(uv-r.xy)/r.zw;
  if(l.x>0.0&&l.x<1.0&&l.y>0.0&&l.y<1.0){
   vec4 t=texture2D(u_face,vec2((float(k)+l.x)/3.0,l.y));vec4 st=u_faceStyle[k];
   if(t.b+t.a<.002)continue;
   float v=t.b*(.8+.2*fNoise(px*.75))*(.72+.28*fNoise(px/st.w+float(k)*7.0));
   if(st.x>.5&&t.a>.01){
    vec2 nd=vec2(cos(st.y),sin(st.y)),ld=vec2(-nd.y,nd.x);
    float a=dot(px,nd)/st.z,id=floor(a),f=fract(a),along=dot(px,ld),j=fHash(vec2(id,float(k)+3.0));
    bool manga=st.x>1.5;
    float hw=manga?.13:.07,soft=1.0/st.z;
    float line=1.0-smoothstep(hw,hw+soft,abs(f-.5));
    float keep=smoothstep(.2+.35*j,.35+.35*j,t.a);// 가운데에 몰리고 바깥으로 짧아진다(선마다 들쭉날쭉)
    if(!manga)keep*=step(.32,fNoise(vec2(id*3.1,along/(st.z*2.6))));// 섬세한 빗금: 짧게 끊긴 선
    v+=line*keep*(manga?.85:.38)*smoothstep(.0,.15,t.a);
   }
   red+=v;
  }
 }
 return red;
}
float hitRed(vec2 uv){
 float red=0.0;vec2 px=uv*u_imgSize;
 for(int i=0;i<4;i++){
  if(i>=u_hitCount)break;
  vec4 h=u_hitMark[i];if(h.w<=0.0)continue;
  vec2 d=px-h.xy*u_imgSize;float dist=length(d)/h.z*(.88+.24*fNoise(d/(h.z*.35)+float(i)*9.0));
  red+=h.w*pow(max(0.0,1.0-dist*dist),1.4);
 }
 return red*(.8+.2*fNoise(px*.75));
}
#endif
vec4 tailLayer(vec4 color,vec2 source,int k,float light){
 vec4 foreground=texture2D(u_tailOriginal,source);
 vec4 m=texture2D(u_tailMask,source);
 float ch=k==0?m.r:k==1?m.g:k==2?m.b:m.a;
 float inside=step(0.0,source.x)*step(source.x,1.0)*step(0.0,source.y)*step(source.y,1.0);
 float alpha=inside*ch*foreground.a;
 float outAlpha=alpha+color.a*(1.0-alpha);
 vec3 rgb=(foreground.rgb*light*alpha+color.rgb*color.a*(1.0-alpha))/max(outAlpha,.00001);
 return vec4(rgb,outAlpha);
}
void main(){
 vec2 shift=vec2(0.0),flowVector=vec2(0.0);
 float flowWeight=0.0;
 vec2 cs0=vec2(0.0),cs1=vec2(0.0),cs2=vec2(0.0),cs3=vec2(0.0);
 for(int i=0;i<12;i++){
   if(i>=u_count)break;
   vec4 z=u_zone[i];
   if(abs(v_uv.x-z.x)>z.z+.19 || abs(v_uv.y-z.y)>z.w+.19)continue;
   float fi=float(i);
   vec2 tile=vec2(mod(fi,4.0),floor(fi/4.0));
   float mask=texture2D(u_mask,(tile+v_uv)/vec2(4.0,3.0)).a;
   float fi2=float(i);
   bool cutout=abs(fi2-u_tailCutout.x)<.5||abs(fi2-u_tailCutout.y)<.5||abs(fi2-u_tailCutout.z)<.5||abs(fi2-u_tailCutout.w)<.5;
   vec4 st=u_spinemotion[i];
   // 2-M: st.w>0 = 이 영역이 지금 경계 띠가 접힐 만큼 크게 움직일 수 있다(값 = 띠가 버티는 이동량). 그때는 영역 밖도 계산한다.
   bool wide=st.w>0.0;
   if(mask<.001&&!cutout&&!wide)continue;
   vec4 mo=u_motion[i],fx=u_fx[i],tap=u_tap[i],piv=u_pivot[i],fl=u_flow[i],sp=u_spine[i],mid=u_chainMid[i];
   vec2 rel=v_uv-z.xy;
   float anchor=anchoredDistance(v_uv,piv,u_pivotExtra[i]);
   // 축에서 멀어질수록 크게: 축이 영역 끝에 있으면 반대쪽 끝까지 고르게 커지도록 축~가장 먼 끝 거리를 쓴다(축이 가운데면 이전과 같음).
   float radius=max(.028,max(length(z.zw)*1.15,length(abs(piv.xy-z.xy)+z.zw)));
   float pinWeight=smoothstep(.018,radius,anchor);
   float pivotWeight=mix(1.0,pinWeight,piv.z*clamp(piv.w*1.65,0.0,1.0));
   // 2-B 잡아당김: 끌기 변위 D를 누른 지점 둘레에 모은다. pull 0 = 영역 전체가 함께 이동(이전과 같음).
   vec4 pl=u_pull[i];float pull=mid.z;
   float reach=max(.02,length(z.zw)*mix(1.1,.42,pull));
   float grab=exp(-dot(v_uv-pl.xy,v_uv-pl.xy)/(reach*reach));
   vec2 pulled=pl.zw*grab*(1.0+6.0*pull);
   pulled/=1.0+length(pulled)/.06;
   vec2 local=(mo.xy-pl.zw+mix(pl.zw,pulled,pull))*pivotWeight+rel*mo.z*pivotWeight;
   // Local breathing is a smooth displacement field, not a hard rectangular scale.
   float tBreath=u_time*mo.w,phase=fl.w;
   float inhale=.76*sin(tBreath*1.40+phase*.12-.3)+.24*sin(tBreath*.72+phase*.08+.34);
   float r=length(rel/max(z.zw,vec2(.03)));
   float inner=smoothstep(0.0,.44,r)*(1.0-smoothstep(.88,2.2,r));
   local+=normalize(rel+vec2(.0001))*(fx.x*.0105)*inhale*inner*pivotWeight;
   // Wavy and twisting motion are smooth and spatially graded.
   local.x+=sin(rel.y*42.0+u_time*1.9+phase)*fx.y*.0036*pivotWeight;
   local.y+=sin(rel.x*38.0+u_time*1.5+phase)*fx.y*.0022*pivotWeight;
   local+=vec2(-rel.y,rel.x)*sin(u_time*1.25+phase)*fx.z*.023*pivotWeight;
   // 6-node chain: mid/tip offsets have separate, smoothly overlapping influence zones.
   if(st.z>.5){
     vec2 line=sp.zw-sp.xy;float t=0.0;
     float proximity=1.0-smoothstep(.035,.21,pointToSegment(v_uv,sp.xy,sp.zw,t));
     float tipWeight=smoothstep(.40,.99,t);
     float midWeight=sin(3.14159265*t);
     local+=(mid.xy*midWeight+st.xy*tipWeight)*proximity*pivotWeight;
   }
   vec4 bl=u_branchLine[i],bm=u_branchMotion[i];
   if(bm.z>.5){
     float t=0.0;
     float prox=1.0-smoothstep(.026,.13,pointToSegment(v_uv,bl.xy,bl.zw,t));
     local+=bm.xy*t*t*prox*pivotWeight;
   }
   float age=tap.z;
   if(age>=0.0&&age<1.6){
     float radius=distance(v_uv,tap.xy);
     float ripple=sin(radius*75.0-age*23.0)*exp(-age*3.0)*(1.0-smoothstep(0.0,1.6,age));
     local+=normalize(rel+vec2(.0001))*ripple*fx.w*.0036*tap.w*pivotWeight;
   }
   // Effect safety: bounded distortion without changing the user's sliders.
   if(cutout){
     vec2 c=clamp(local,vec2(-.055),vec2(.055));
     if(abs(fi2-u_tailCutout.x)<.5)cs0=c;else if(abs(fi2-u_tailCutout.y)<.5)cs1=c;else if(abs(fi2-u_tailCutout.z)<.5)cs2=c;else cs3=c;
     continue;
   }
   vec2 moved=clamp(local,vec2(-.055),vec2(.055));
   float weight=mask;
   // 2-M 접힘 방지: 이동량이 경계 띠 폭을 넘으면 띠가 접힌다. 그때만 영역 바깥으로 이동량의 2배 폭까지 서서히 줄어드는 띠로 바꾼다(안쪽은 그대로 100%).
   if(wide){
     float amount=length(moved);
     if(amount>.5*st.w){
       float outside=(1.0-texture2D(u_dist,(tile+v_uv)/vec2(4.0,3.0)).r)*.16;
       weight=mix(mask,1.0-smoothstep(0.0,2.0*amount,outside),smoothstep(.5*st.w,st.w,amount));
     }
   }
   shift+=moved*weight;
   flowVector+=vec2(fl.y,fl.z)*fl.x*mask;
   flowWeight+=fl.x*mask;
 }
 // With a separated foreground, ambient transforms sample the base only.
 if(u_baseExclude>.5){
   float tw=pow(clamp(1.0-v_uv.y,0.0,1.0),1.5);
   float inhale=.76*sin(u_time*1.40-.30)+.24*sin(u_time*.72+.34);
   float drift=.80*sin(u_time*.98)+.20*sin(u_time*1.51+1.7);
   vec2 bd=v_uv-u_bodyCenter;
   float lift=pow(clamp((u_bodyCenter.y+.12-v_uv.y)/(u_bodyCenter.y+.12),0.0,1.0),1.3);
   float widen=1.0-.65*smoothstep(u_bodyCenter.y,1.0,v_uv.y);
   vec2 ambientShift=vec2(.013*u_ambient.z*drift*tw,0.0)+vec2(.030*bd.x*widen,-.014*lift)*u_ambient.y*inhale;
   shift+=ambientShift;
   cs0+=ambientShift;cs1+=ambientShift;cs2+=ambientShift;cs3+=ambientShift;
 }
 // 3-N 가장자리 붙잡기: 그림 테두리의 픽셀은 움직이지 않고 안쪽으로 갈수록(약 4.5%) 원래대로 움직인다.
 // 테두리에 닿아 잘린 부위를 당겨도 그림 밖(없는 곳)이 드러나지 않고 그 부위가 늘어나며 따라온다.
 float edgePin=smoothstep(0.0,.045,min(min(v_uv.x,1.0-v_uv.x),min(v_uv.y,1.0-v_uv.y)));
 shift*=edgePin;cs0*=edgePin;cs1*=edgePin;cs2*=edgePin;cs3*=edgePin;
 vec2 uv=clamp(v_uv-clamp(shift,vec2(-.08),vec2(.08)),vec2(.001),vec2(.999));
#ifdef FACE
 if(u_faceCount>0)uv=clamp(uv-faceShift(uv),vec2(.001),vec2(.999));
#endif
 vec4 color;
 if(flowWeight>.0001){
   float phase=fract(u_time*.19),phase2=fract(phase+.5);
   vec2 flow=clamp(flowVector,vec2(-.023),vec2(.023));
   vec2 a=clamp(uv-flow*phase,vec2(.001),vec2(.999));
   vec2 b=clamp(uv-flow*phase2,vec2(.001),vec2(.999));
   color=mix(texture2D(u_tex,a),texture2D(u_tex,b),abs(phase*2.0-1.0));
 }else color=texture2D(u_tex,uv);
#ifdef FACE
 // 피부색에 붉은 기운을 곱하듯 물들인다: 밝은 피부만 붉어지고 선화·음영은 그대로
 // 쓰지 않을 때는 계산하지 않는다(그림 전체 픽셀마다 도는 곳)
 float red=0.0;if(u_hitCount>0)red+=hitRed(uv);if(u_faceCount>0)red+=faceRed(uv);
 if(red>.001){float lum=dot(color.rgb,vec3(.3,.59,.11));color.rgb*=mix(vec3(1.0),vec3(1.0,.62,.64),min(red,1.25)*.62*smoothstep(.18,.55,lum));}
#endif
 float light=1.0+u_ambient.w*(.026*sin(u_time*.98)+.009*sin(u_time*.49+1.0));
 if(u_baseExclude>.5){
   float alpha=texture2D(u_baseMask,uv).a;
   vec4 background=texture2D(u_background,v_uv);
   color.rgb*=light;
   color=mix(background,color,alpha);
 }else color.rgb*=light;
 // 2-D: 분리 영역을 목록 순서대로 위에 겹친다(뒤 영역이 위)
 if(u_tailCutout.x>=0.0)color=tailLayer(color,v_uv-cs0,0,light);
 if(u_tailCutout.y>=0.0)color=tailLayer(color,v_uv-cs1,1,light);
 if(u_tailCutout.z>=0.0)color=tailLayer(color,v_uv-cs2,2,light);
 if(u_tailCutout.w>=0.0)color=tailLayer(color,v_uv-cs3,3,light);
 gl_FragColor=color;
}`;

