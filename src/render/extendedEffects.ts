// WebGL adaptations inspired by Shader Effects Inc. See THIRD_PARTY_NOTICES.md.
// These bounded screen-space kernels intentionally do not reproduce upstream WebGPU simulations/SDFs.
export const EXTENDED_MODES = { 'contour-lines': 30, watercolor: 31, emboss: 32, 'pixel-sort': 33, frost: 34, 'glass-tiles': 35, 'crt-screen': 36, shatter: 37 } as const
export const EXTENDED_DEFAULTS = {
  contourCount: 14, contourWidth: .13, contourDistribution: 1,
  watercolorBrush: 4, watercolorBleed: 1.2, watercolorGrain: .12, watercolorStrength: .85,
  embossDepth: 3, embossAngle: 45, embossStrength: 1.3,
  sortLength: 48, sortAngle: 90, sortThreshold: .1, sortStrength: .75,
  frostDensity: 90, frostBlur: 3, frostStrength: .7,
  tileCount: 14, tileRefraction: .8, tileAngle: 0, tileGap: .025,
  crtScanlines: 350, crtScanStrength: .3, crtPhosphor: .35, crtBrightness: 1.2, crtVignette: .35,
  shatterDensity: 8, shatterOffset: 8, shatterCrack: .035, shatterAberration: 1.2,
}
export type ExtendedKey = keyof typeof EXTENDED_DEFAULTS
export type ExtendedParams = typeof EXTENDED_DEFAULTS
export const EXTENDED_KEYS = Object.keys(EXTENDED_DEFAULTS) as ExtendedKey[]
export function extendedSettings(params: object) {
  const values = params as Partial<Record<ExtendedKey, number>>
  return Object.fromEntries(EXTENDED_KEYS.map(key => [key, values[key] ?? EXTENDED_DEFAULTS[key]])) as typeof EXTENDED_DEFAULTS
}
export interface ExtendedControl { key: ExtendedKey; label: string; min: number; max: number; step: number; unit?: string }
export const EXTENDED_CONTROLS: Record<keyof typeof EXTENDED_MODES, ExtendedControl[]> = {
  'contour-lines': [{ key:'contourCount', label:'等高线层数', min:3,max:40,step:1 },{ key:'contourWidth',label:'线条宽度',min:.03,max:.4,step:.01 },{ key:'contourDistribution',label:'曲线分布',min:.3,max:3,step:.05 }],
  watercolor: [{ key:'watercolorBrush',label:'笔触大小',min:1,max:12,step:.5 },{ key:'watercolorBleed',label:'渗色程度',min:0,max:5,step:.1 },{ key:'watercolorGrain',label:'纸张颗粒',min:0,max:.4,step:.01 },{ key:'watercolorStrength',label:'效果强度',min:0,max:1,step:.05 }],
  emboss: [{ key:'embossDepth',label:'压印深度',min:-8,max:8,step:.25 },{ key:'embossAngle',label:'光照方向',min:0,max:360,step:1,unit:'°' },{ key:'embossStrength',label:'起伏对比',min:.2,max:3,step:.05 }],
  'pixel-sort': [{ key:'sortLength',label:'排序条带长度',min:8,max:120,step:1 },{ key:'sortAngle',label:'排序方向',min:0,max:180,step:1,unit:'°' },{ key:'sortThreshold',label:'亮度门槛',min:0,max:1,step:.01 },{ key:'sortStrength',label:'混合强度',min:0,max:1,step:.05 }],
  frost: [{ key:'frostDensity',label:'晶体密度',min:20,max:220,step:1 },{ key:'frostBlur',label:'霜层模糊',min:0,max:12,step:.5 },{ key:'frostStrength',label:'结霜强度',min:0,max:1,step:.05 }],
  'glass-tiles': [{ key:'tileCount',label:'玻璃块数量',min:4,max:40,step:1 },{ key:'tileRefraction',label:'折射强度',min:0,max:2,step:.05 },{ key:'tileAngle',label:'拼贴方向',min:0,max:180,step:1,unit:'°' },{ key:'tileGap',label:'块间缝隙',min:0,max:.15,step:.005 }],
  'crt-screen': [{ key:'crtScanlines',label:'扫描线数量',min:80,max:700,step:10 },{ key:'crtScanStrength',label:'扫描线强度',min:0,max:.8,step:.05 },{ key:'crtPhosphor',label:'荧光颗粒',min:0,max:1,step:.05 },{ key:'crtBrightness',label:'荧光亮度',min:.5,max:2,step:.05 },{ key:'crtVignette',label:'暗角强度',min:0,max:1,step:.05 }],
  shatter: [{ key:'shatterDensity',label:'碎片密度',min:3,max:18,step:1 },{ key:'shatterOffset',label:'碎片错位',min:0,max:30,step:.5 },{ key:'shatterCrack',label:'裂纹宽度',min:0,max:.15,step:.005 },{ key:'shatterAberration',label:'边缘色散',min:0,max:4,step:.1 }],
}
export const EXTENDED_RECIPE = {
  source: 'https://github.com/shader-effects-inc/shaders',
  adaptation: 'Original bounded WebGL1 screen-space adaptations inspired by the named upstream effects; not pixel-identical ports. Input linear straight RGBA, output display-sRGB straight RGBA. Preserve the model silhouette; background is composed separately. All effects are static.',
  contour: 'Quantized Rec.601 luminance with derivative-estimated contour footprint, distribution power, custom ink/paper colors.',
  watercolor: 'Four 3x3 quadrant Kuwahara mean/variance filters, seeded bleed warp, pigment edge accumulation and stationary paper grain. Ignore transparent samples to avoid black fringes.',
  emboss: 'Model alpha and luminance form a screen-space heightfield. Central difference slopes produce directional relief. It does not use upstream SDF shapes.',
  pixelSort: 'Each directional strip sorts eight opaque representative taps by display luminance using fixed bounded rank comparisons. Threshold excludes dark samples. Not the upstream persistent cursor-driven compute simulation.',
  frost: 'Static crystal-cell refraction and nine-tap alpha-aware blur, pale ice tint and crystal-edge highlights. Not a volumetric ice material.',
  glassTiles: 'Aspect-correct rotated square cells, curved local offset refraction, beveled highlights and adjustable gaps.',
  crt: 'Scanlines, RGB phosphor strip modulation, static grain and vignette, applied only to model RGBA.',
  shatter: 'Nine-neighbor seeded Voronoi nearest/second-nearest distance, per-fragment refraction shift, cracks and premultiplied RGB separation. Static fragments, no physics simulation.',
}
export const EXTENDED_GLSL = `
uniform float contourCount,contourWidth,contourDistribution;
uniform float watercolorBrush,watercolorBleed,watercolorGrain,watercolorStrength;
uniform float embossDepth,embossAngle,embossStrength;
uniform float sortLength,sortAngle,sortThreshold,sortStrength;
uniform float frostDensity,frostBlur,frostStrength;
uniform float tileCount,tileRefraction,tileAngle,tileGap;
uniform float crtScanlines,crtScanStrength,crtPhosphor,crtBrightness,crtVignette;
uniform float shatterDensity,shatterOffset,shatterCrack,shatterAberration;
float exHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
vec2 exHash2(vec2 p){return vec2(exHash(p),exHash(p+vec2(19.3,71.7)));}
vec3 exDisplay(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
vec4 exTap(vec2 p){if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0)return vec4(0.0);vec4 s=texture2D(tDiffuse,p);return vec4(exDisplay(s.rgb),s.a);}
float exLuma(vec3 c){return dot(c,vec3(.299,.587,.114));}
float exHeight(vec2 p){vec4 s=exTap(p);return s.a*(.35+.65*exLuma(s.rgb));}
vec4 exContour(vec2 uv){
 vec4 s=exTap(uv);float h=pow(max(exLuma(s.rgb),.0001),contourDistribution)*contourCount;
 float hx=pow(max(exLuma(exTap(uv+vec2(1.0,0.0)/resolution).rgb),.0001),contourDistribution)*contourCount;
 float hy=pow(max(exLuma(exTap(uv+vec2(0.0,1.0)/resolution).rgb),.0001),contourDistribution)*contourCount;
 float gradient=abs(hx-h)+abs(hy-h),footprint=clamp(gradient,.015,.2);float d=min(fract(h),1.0-fract(h));
 float line=(1.0-smoothstep(contourWidth*.5,contourWidth*.5+footprint,d))*smoothstep(.001,.015,gradient);
 return vec4(mix(highlightColor,shadowColor,line),s.a);
}
vec4 exQuadrant(vec2 uv,vec2 signQ){
 vec3 mean=vec3(0.0),squares=vec3(0.0);float weight=0.0;
 for(int x=0;x<3;x++){for(int y=0;y<3;y++){
  vec4 s=exTap(uv+signQ*vec2(float(x),float(y))*watercolorBrush*.5/resolution);
  mean+=s.rgb*s.a;squares+=s.rgb*s.rgb*s.a;weight+=s.a;
 }}mean/=max(weight,.001);squares/=max(weight,.001);
 return vec4(mean,dot(abs(squares-mean*mean),vec3(1.0))+(weight<.1?100.0:0.0));
}
vec4 exWatercolor(vec2 uv){
 vec4 source=exTap(uv);vec2 noise=exHash2(floor(uv*resolution/4.0))-.5;
 vec2 p=uv+noise*watercolorBleed/resolution;
 vec4 best=exQuadrant(p,vec2(1.0));vec4 q=exQuadrant(p,vec2(-1.0,1.0));if(q.a<best.a)best=q;
 q=exQuadrant(p,vec2(1.0,-1.0));if(q.a<best.a)best=q;q=exQuadrant(p,vec2(-1.0));if(q.a<best.a)best=q;
 float edge=abs(exHeight(uv+vec2(2.0,0.0)/resolution)-exHeight(uv-vec2(2.0,0.0)/resolution))+abs(exHeight(uv+vec2(0.0,2.0)/resolution)-exHeight(uv-vec2(0.0,2.0)/resolution));
 float grain=exHash(floor(uv*resolution))-.5;
 vec3 paint=mix(best.rgb,highlightColor,.12)*(1.0-edge*.5)+grain*watercolorGrain;
 return vec4(clamp(mix(source.rgb,paint,watercolorStrength),0.0,1.0),source.a);
}
vec4 exEmboss(vec2 uv){
 vec4 src=exTap(uv);vec2 px=vec2(2.0)/resolution;
 vec2 slope=vec2(exHeight(uv+vec2(px.x,0.0))-exHeight(uv-vec2(px.x,0.0)),exHeight(uv+vec2(0.0,px.y))-exHeight(uv-vec2(0.0,px.y)))*embossDepth;
 vec3 n=normalize(vec3(-slope,1.0));float a=radians(embossAngle);vec3 light=normalize(vec3(cos(a),sin(a),.6));
 float shade=clamp(.5+(dot(n,light)-.5145)*embossStrength,0.0,1.0);
 return vec4(mix(shadowColor,highlightColor,shade),src.a);
}
vec4 exPixelSort(vec2 uv){
 vec4 src=exTap(uv);float a=radians(sortAngle);vec2 dir=vec2(cos(a),sin(a));vec2 pixel=uv*resolution;
 float along=dot(pixel,dir),start=floor(along/max(sortLength,1.0))*sortLength;
 float desired=clamp(floor((along-start)/sortLength*8.0),0.0,7.0),bestDistance=100.0;vec4 sorted=src;
 for(int i=0;i<8;i++){
  vec2 p=uv+dir*(start+(float(i)+.5)*sortLength/8.0-along)/resolution;vec4 c=exTap(p);float l=exLuma(c.rgb),rank=0.0;
  for(int j=0;j<8;j++){
   vec4 other=exTap(uv+dir*(start+(float(j)+.5)*sortLength/8.0-along)/resolution);float ol=exLuma(other.rgb);
   if(ol<l||(abs(ol-l)<.00001&&j<i))rank+=1.0;
  }
  float distance=abs(rank-desired);if(c.a>.05&&l>=sortThreshold&&distance<bestDistance){sorted=c;bestDistance=distance;}
 }
 float strength=sortStrength*step(sortThreshold,exLuma(src.rgb));
 return vec4(mix(src.rgb,sorted.rgb,strength),src.a);
}
vec4 exFrost(vec2 uv){
 vec4 src=exTap(uv);vec2 cells=uv*vec2(resolution.x/resolution.y,1.0)*frostDensity;
 vec2 rand=exHash2(floor(cells));vec2 p=uv+(rand-.5)*frostStrength*8.0/resolution;
 vec3 color=vec3(0.0);float weight=0.0;
 for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){vec4 s=exTap(p+vec2(float(x),float(y))*frostBlur/resolution);color+=s.rgb*s.a;weight+=s.a;}}
 color/=max(weight,.001);vec2 local=fract(cells);float crystal=pow(abs(sin((local.x+local.y*(rand.x*2.0-1.0))*12.0)),16.0);
 color=mix(color,vec3(.78,.89,.96),frostStrength*(.12+.12*crystal));
 return vec4(mix(src.rgb,color,frostStrength),src.a);
}
vec4 exTiles(vec2 uv){
 float a=radians(tileAngle),asp=resolution.x/resolution.y;mat2 rot=mat2(cos(a),sin(a),-sin(a),cos(a));
 vec2 p=rot*((uv-.5)*vec2(asp,1.0))*tileCount,local=fract(p)-.5;
 vec2 shift=vec2(rot[0].x*local.x+rot[0].y*local.y,rot[1].x*local.x+rot[1].y*local.y)*tileRefraction/max(tileCount,1.0)/vec2(asp,1.0)*.35;
 vec4 s=exTap(uv+shift);float edge=min(.5-abs(local.x),.5-abs(local.y));float bevel=1.0-smoothstep(.0,.06,edge);
 s.rgb=clamp(s.rgb+bevel*.12*tileRefraction,0.0,1.0);s.a*=smoothstep(tileGap,tileGap+.012,edge);return s;
}
vec4 exCRT(vec2 uv){
 vec4 s=exTap(uv);float scan=1.0-crtScanStrength*(.5+.5*cos(uv.y*crtScanlines*6.2831853));
 float stripe=mod(floor(uv.x*resolution.x),3.0);vec3 phosphor=vec3(stripe<.5?1.0:.65,stripe>.5&&stripe<1.5?1.0:.65,stripe>1.5?1.0:.65);
 float vignette=1.0-crtVignette*smoothstep(.1,.72,length(uv-.5));
 s.rgb=clamp(s.rgb*scan*mix(vec3(1.0),phosphor,crtPhosphor)*crtBrightness*vignette+(exHash(floor(uv*resolution))-.5)*crtPhosphor*.035,0.0,1.0);return s;
}
vec4 exShatter(vec2 uv){
 float asp=resolution.x/resolution.y;vec2 p=uv*vec2(asp,1.0)*shatterDensity,base=floor(p);float nearest=100.0,second=100.0;vec2 chosen=base;
 for(int x=-1;x<=1;x++){for(int y=-1;y<=1;y++){vec2 cell=base+vec2(float(x),float(y));vec2 v=cell+exHash2(cell)-p;float d=dot(v,v);if(d<nearest){second=nearest;nearest=d;chosen=cell;}else if(d<second){second=d;}}}
 vec2 shift=(exHash2(chosen+13.2)-.5)*shatterOffset/resolution,split=normalize(shift+vec2(.0001))*shatterAberration/resolution;
 vec4 r=exTap(uv+shift+split),g=exTap(uv+shift),b=exTap(uv+shift-split);float alpha=max(r.a,max(g.a,b.a));
 vec3 color=vec3(r.r*r.a,g.g*g.a,b.b*b.a)/max(alpha,.001);float edge=sqrt(second)-sqrt(nearest);float crack=1.0-smoothstep(shatterCrack,shatterCrack+.025,edge);
 color=mix(color,vec3(.65,.8,.9),crack*.45);alpha*=1.0-crack*.4;return vec4(clamp(color,0.0,1.0),alpha);
}
vec4 renderExtended(vec2 uv,float effectMode){
 if((effectMode<34.5 || (effectMode>35.5 && effectMode<36.5)) && texture2D(tDiffuse,uv).a<.001)return vec4(0.0);
 if(effectMode<30.5)return exContour(uv);if(effectMode<31.5)return exWatercolor(uv);if(effectMode<32.5)return exEmboss(uv);if(effectMode<33.5)return exPixelSort(uv);if(effectMode<34.5)return exFrost(uv);if(effectMode<35.5)return exTiles(uv);if(effectMode<36.5)return exCRT(uv);return exShatter(uv);
}
`
