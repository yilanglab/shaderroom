import type { ShaderParams } from '../types'
// GLSL adaptation of MIT-licensed Shader Effects, Inc. kernels. See THIRD_PARTY_NOTICES.md.
export const PILOT_DEFAULTS = { fluteAngle: 0, fluteFrequency: 18, fluteSoftness: .65, fluteRefraction: 1.2, fluteAberration: .25, fluteHighlight: .3, ditherSize: 3, ditherPattern: 1, ditherThreshold: .5, ditherSpread: 1 }
export const PILOT_KEYS = Object.keys(PILOT_DEFAULTS) as (keyof typeof PILOT_DEFAULTS)[]
export const PILOT_SOURCE = 'https://github.com/shader-effects-inc/shaders'
export function pilotSettings(params: ShaderParams) { return Object.fromEntries(PILOT_KEYS.map(key => [key, params[key] ?? PILOT_DEFAULTS[key]])) as typeof PILOT_DEFAULTS }
export const PILOT_RECIPE = {
  source: PILOT_SOURCE, license: 'MIT; Shader Effects Inc. Copyright 2026',
  adaptation: 'GLSL/WebGL adaptation, not the upstream WebGPU runtime. No new dependency. White lit model input in linear RGBA; output display-sRGB, straight alpha, NoBlending. CSS background stays outside the filter.',
  flutedGlass: 'Port of flutedGlassGeom + blinnHighlight, bars variant. Centered aspect-correct UV, slope sign(cell)*pow(abs(cell),mix(16,4,softness)), shift -slope*refraction*0.5/frequency. RGB split uses alpha-premultiplied taps to prevent fringe artifacts; transparent outside viewport. Fixed lightAngle 30 and highlightSoftness .3, white highlights. No animation or hover in this pilot.',
  dither: 'Port of ditherBayerQuad/ditherPeriodic and ditherOrderedResult; Bayer 2/4/8 only. Logical CSS-pixel cell centers. Luminance Rec.601 multiplied by alpha; step(0.5+(pattern-0.5)*spread,luma+threshold-0.5). Two display-sRGB inks, retain cell source alpha. No random or time input.',
}
export const PILOT_GLSL = `
uniform float fluteAngle, fluteFrequency, fluteSoftness, fluteRefraction, fluteAberration, fluteHighlight;
uniform float ditherSize, ditherPattern, ditherThreshold, ditherSpread, pilotPixelRatio;
vec3 pilotDisplay(vec3 c) { return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c)); }
vec4 pilotTap(vec2 p) { if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0) return vec4(0.0); return texture2D(tDiffuse,p); }
vec4 renderFluted(vec2 uv) {
 float a=radians(fluteAngle), aspect=resolution.x/resolution.y;
 vec2 axis=vec2(cos(a),sin(a)), p=(uv-.5)*vec2(aspect,1.0);
 float cell=(fract(dot(p,axis)*fluteFrequency)-.5)*2.0;
 float slope=sign(cell)*pow(max(abs(cell),.0001),mix(16.0,4.0,fluteSoftness));
 vec2 shift=-slope*fluteRefraction*.5/max(fluteFrequency,.001)*axis/vec2(aspect,1.0);
 vec2 split=shift*fluteAberration*.5;
 vec4 r=pilotTap(uv+shift+split), g=pilotTap(uv+shift), b=pilotTap(uv+shift-split);
 float alpha=max(r.a,max(g.a,b.a));
 vec3 c=alpha>.0001?vec3(r.r*r.a,g.g*g.a,b.b*b.a)/alpha:vec3(0.0);
 float nz=sqrt(max(0.0,1.0-min(slope*slope,1.0)));
 float spec=pow(max(slope*sin(radians(15.0))+nz*cos(radians(15.0)),0.0),exp2(5.9))*(.04+.96*pow(1.0-nz,5.0))*fluteHighlight;
 return vec4(clamp(pilotDisplay(c)+spec*alpha,0.0,1.0),alpha);
}
float pilotBayer(vec2 q) { return q.y*3.0+q.x*2.0-q.x*q.y*4.0; }
vec4 renderDither(vec2 uv) {
 vec2 logical=resolution/max(pilotPixelRatio,1.0), cell=floor(uv*logical/ditherSize);
 vec4 src=texture2D(tDiffuse,clamp((cell+.5)*ditherSize/logical,vec2(0.0),vec2(1.0)));
 float low=pilotBayer(mod(cell,2.0));
 float middle=pilotBayer(mod(floor(cell/2.0),2.0)), high=pilotBayer(mod(floor(cell/4.0),2.0));
 float pattern=ditherPattern<.5?low/4.0:(ditherPattern<1.5?(low*4.0+middle)/16.0:(low*16.0+middle*4.0+high)/64.0);
 float value=step(.5+(pattern-.5)*ditherSpread,dot(src.rgb,vec3(.299,.587,.114))*src.a+ditherThreshold-.5);
 return vec4(mix(shadowColor,highlightColor,value),src.a);
}`
