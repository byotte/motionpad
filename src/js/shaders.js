const VERT=`attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
uniform float u_time;
uniform vec4 u_ambient;
uniform float u_baseExclude;
void main(){
  v_uv=a_uv;
  float topWeight=pow(clamp(1.0-a_uv.y,0.0,1.0),1.5);
  // Smooth, continuous motion: different non-integer oscillation periods suppress mechanical repetition.
  float inhale=.76*sin(u_time*1.40-.30)+.24*sin(u_time*.72+.34);
  float drift=.80*sin(u_time*.98)+.20*sin(u_time*1.51+1.7);
  vec2 delta=vec2(.013*u_ambient.z*drift,.018*u_ambient.y*inhale)*topWeight;
  gl_Position=vec4(a_pos+2.0*delta*(1.0-u_baseExclude),0.0,1.0);
}`;
const FRAG=`precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform sampler2D u_mask;
uniform sampler2D u_baseMask;
uniform sampler2D u_background;
uniform vec4 u_tailCutout;
uniform sampler2D u_tailOriginal,u_tailMask;
uniform float u_baseExclude;
uniform vec4 u_zone[12],u_motion[12],u_fx[12],u_tap[12],u_pivot[12],u_flow[12],u_spine[12],u_spinemotion[12];
uniform vec4 u_chainMid[12],u_branchLine[12],u_branchMotion[12],u_pivotExtra[12],u_pull[12];
uniform int u_count;
uniform float u_time;
uniform vec4 u_ambient;
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
   if(mask<.001&&!cutout)continue;
   vec4 mo=u_motion[i],fx=u_fx[i],tap=u_tap[i],piv=u_pivot[i],fl=u_flow[i],sp=u_spine[i],st=u_spinemotion[i],mid=u_chainMid[i];
   vec2 rel=v_uv-z.xy;
   float anchor=anchoredDistance(v_uv,piv,u_pivotExtra[i]);
   float radius=max(.028,length(z.zw)*1.15);
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
   shift+=clamp(local,vec2(-.055),vec2(.055))*mask;
   flowVector+=vec2(fl.y,fl.z)*fl.x*mask;
   flowWeight+=fl.x*mask;
 }
 // With a separated foreground, ambient transforms sample the base only.
 if(u_baseExclude>.5){
   float tw=pow(clamp(1.0-v_uv.y,0.0,1.0),1.5);
   float inhale=.76*sin(u_time*1.40-.30)+.24*sin(u_time*.72+.34);
   float drift=.80*sin(u_time*.98)+.20*sin(u_time*1.51+1.7);
   vec2 ambientShift=vec2(.013*u_ambient.z*drift,.018*u_ambient.y*inhale)*tw;
   shift+=ambientShift;
   cs0+=ambientShift;cs1+=ambientShift;cs2+=ambientShift;cs3+=ambientShift;
 }
 vec2 uv=clamp(v_uv-clamp(shift,vec2(-.08),vec2(.08)),vec2(.001),vec2(.999));
 vec4 color;
 if(flowWeight>.0001){
   float phase=fract(u_time*.19),phase2=fract(phase+.5);
   vec2 flow=clamp(flowVector,vec2(-.014),vec2(.014));
   vec2 a=clamp(uv-flow*phase,vec2(.001),vec2(.999));
   vec2 b=clamp(uv-flow*phase2,vec2(.001),vec2(.999));
   color=mix(texture2D(u_tex,a),texture2D(u_tex,b),abs(phase*2.0-1.0));
 }else color=texture2D(u_tex,uv);
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

