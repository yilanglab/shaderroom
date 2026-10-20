import type { BackgroundKind, FlowSettings } from '../types'
// Adapted from FlowingGradient's four-color warp structure. See THIRD_PARTY_NOTICES.md.
export const DEFAULT_FLOW: FlowSettings = { enabled: false, kind: 'flow', scale: 1, intensity: 1, grain: 0, colors: ['#0a0015','#6b17e6','#ff4d6a','#ff6b35'], speed: 1, distortion: .5, seed: 0 }

export const BACKGROUND_PRESETS: { kind: BackgroundKind; name: string; shortName: string; preview: string; settings: FlowSettings }[] = [
  { kind: 'flow', name: '流动渐变', shortName: '渐变', preview: 'linear-gradient(135deg,#0a0015,#6b17e6 35%,#ff4d6a 65%,#ff6b35)', settings: { ...DEFAULT_FLOW, enabled: true } },
  { kind: 'aurora', name: '极光', shortName: '极光', preview: 'linear-gradient(155deg,#030e1c 10%,#4adfc2 35%,#20506d 48%,#a674f4 65%,#030e1c 90%)', settings: { ...DEFAULT_FLOW, enabled: true, kind: 'aurora', colors: ['#030e1c','#54e8b2','#a681ff','#163a60'], speed: .7, distortion: .7, scale: 1.4, intensity: 1.2, grain: .015 } },
  { kind: 'noise', name: '噪声纹理', shortName: '噪声', preview: 'repeating-conic-gradient(#859399 0 25%,#455461 0 50%) 0 0 / 3px 3px', settings: { ...DEFAULT_FLOW, enabled: true, kind: 'noise', colors: ['#1b2531','#83939f','#83939f','#1b2531'], speed: 0, distortion: .55, scale: 3, intensity: 1, grain: .16 } },
  { kind: 'orbit', name: '光晕星环', shortName: '星环', preview: 'radial-gradient(ellipse at center,#081222 25%,#72d8ff 30%,#b875f0 37%,#142943 45%,#081222 70%)', settings: { ...DEFAULT_FLOW, enabled: true, kind: 'orbit', colors: ['#070e20','#75d7ff','#d3a0ff','#070e20'], speed: .5, distortion: .35, scale: 1, intensity: 1.3, grain: .025 } },
]
export function backgroundMode(settings: FlowSettings) { return ['flow','aurora','noise','orbit'].indexOf(settings.kind ?? 'flow') }
export function backgroundUniformSettings(settings: FlowSettings) { return { mode: backgroundMode(settings), scale: settings.scale ?? 1, intensity: settings.intensity ?? 1, grain: settings.grain ?? 0 } }

export const FLOW_VERTEX = 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}'
export const FLOW_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 colorA,colorB,colorC,colorD;
uniform float time,speed,distortion,seed,aspect,mode,scale,intensity,grain;
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z)*2.0-1.0;}
vec4 warp(vec2 p,float scale,float z,vec2 a,vec2 b,float reach){vec2 n=vec2(noise3(vec3(p*scale+a,z)),noise3(vec3(p*scale+b,z)));return vec4(p+n*reach*distortion,n);}
vec3 procedural(vec2 uv,float t) {
 vec2 p=(uv-.5)*vec2(aspect,1.0); float off=seed*.17;
 if(mode<1.5) {
   vec3 result=colorA;
   for(int i=0;i<3;i++) {
     float fi=float(i); float ridge=sin(p.x*scale*2.4+fi*1.8+t*.8)*.14*distortion;
     ridge+=noise3(vec3(p.x*scale*1.5,fi*2.1+off,t*.3))*.17*distortion;
     float center=-.22+fi*.2+ridge;
     float d=(p.y-center)*scale;
     float curtain=exp(-abs(d)*12.0)*( .6+.4*sin(p.x*scale*8.0+fi+t));
     float glow=exp(-d*d*12.0)*.14;
     vec3 ink=fi<.5?colorB:(fi<1.5?colorC:mix(colorB,colorC,.5));
     result+=ink*(curtain*.45+glow)*intensity;
   }
   return result;
 }
 if(mode<2.5) {
   vec3 q=vec3(p*scale*3.0,off+t*.3); float n=0.0,amp=.5;
   for(int i=0;i<4;i++){n+=noise3(q)*amp;q=q*2.03+vec3(1.7,9.2,3.1);amp*=.5;}
   return mix(colorA,colorB,clamp(.5+n*distortion*intensity,0.0,1.0));
 }
 float angle=.25+sin(t*.4+off)*.1*distortion;
 p=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*p;
 p.y*=1.7; float radius=length(p);
 float ripple=sin(atan(p.y,p.x)*5.0+t+off)*.035*distortion;
 float d=abs(radius-.48*scale-ripple);
 float ring=exp(-d*50.0),glow=exp(-d*9.0)*.22;
 float orbitAngle=atan(p.y,p.x)+t*.25;
 vec3 ink=mix(colorB,colorC,.5+.5*sin(orbitAngle));
 return colorA+ink*(ring+glow)*intensity;
}
void main(){
 float t=time*speed*.075, off=seed*.17;
 if(mode>.5){vec3 color=procedural(vUv,time*.15); float speck=hash(vec3(floor(gl_FragCoord.xy),seed))-.5;gl_FragColor=vec4(clamp(color+speck*grain,0.0,1.0),1.0);return;}
 vec2 p=(vUv-.5)*scale;
 float angle=noise3(vec3(p*.8+vec2(t*.4,-t*.25),off))*12.5663706*distortion;
 vec2 q=vec2(p.x,p.y/aspect); q=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*q; q.y*=aspect;
 q.x+=sin(q.y*5.0+t*2.0)/50.0*distortion; q.y+=sin(q.x*7.5+t*2.0)/25.0*distortion;
 vec4 w1=warp(q,2.0,t*.5+off,vec2(5.2,1.3),vec2(1.7,9.2),.25);
 vec4 w2=warp(w1.xy,1.5,t*.3+off,vec2(8.3,2.8),vec2(3.1,7.4),.2);
 float hard=pow(clamp(w1.z*.5+.5,0.0,1.0),1.5), edge=mix(.5,.008,hard);
 float t1=smoothstep(-edge,edge,noise3(vec3(w2.xy*1.8,t*.3+off))),t2=smoothstep(-edge,edge,w1.w);
 vec3 color=mix(mix(colorA,colorB,t1),mix(colorC,colorD,t1),t2);
 float fold=max(1.0-abs(t1*2.0-1.0),1.0-abs(t2*2.0-1.0))*hard;
 gl_FragColor=vec4(clamp(color*intensity*((w2.z*.5+.5)*.12+.94)*(1.0+fold*.35),0.0,1.0),1.0);
}`
export const FLOW_RECIPE = { source: 'https://github.com/shader-effects-inc/shaders/blob/main/packages/core/src/shaders/FlowingGradient/index.ts', adaptation: 'GLSL pilot: upstream rotation, shear, two warp levels, four-color zones and fold highlights. Uses smooth trilinear value noise and display-sRGB interpolation rather than upstream volume noise and OKLCH default; not pixel-identical. Additional original GLSL modes: 1 aurora curtains from animated ridges, 2 four-octave noise texture, 3 elliptical luminous ring. Shared color palette, scale, intensity, static grain and seeded field. mode defaults to 0 for older flow settings.', render: 'Independent full-viewport WebGL quad below model canvas and CSS grid. Transparent model canvas; background pass opaque, NoBlending, toneMapped:false, output display-sRGB without another conversion. Colors HEX/255. Pixel ratio capped at 1 for background. Resize updates aspect. Reduced motion freezes time at zero; hidden document pauses clock. Speed zero freezes the current time. Clock accumulates deltaSeconds × configured speed; shader speed uniform stays 1. Resume from exported integrated phase time, or freeze that time for an exact frame.', vertex: FLOW_VERTEX, fragment: FLOW_FRAGMENT }
