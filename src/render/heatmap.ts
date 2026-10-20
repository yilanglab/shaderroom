import type { ShaderParams } from '../types'

export const HEAT_DEFAULTS = { heatCold: '#05072e', heatCool: '#124bff', heatMid: '#1ce5dc', heatWarm: '#fff329', heatHot: '#ff3615', heatContrast: 1.25, heatOffset: 0, heatScale: 3, heatOrganic: .25, heatGrain: .035 }
export const HEAT_COLORS = ['heatCold', 'heatCool', 'heatMid', 'heatWarm', 'heatHot'] as const
export const HEAT_PRESETS: { name: string; colors: [string, string, string, string, string] }[] = [
  { name: '经典热成像', colors: ['#05072e', '#124bff', '#1ce5dc', '#fff329', '#ff3615'] },
  { name: '紫电桃红', colors: ['#13052e', '#4823d9', '#ab40fa', '#ff408e', '#ffd1bd'] },
  { name: '熔岩余烬', colors: ['#100b20', '#661536', '#d43b27', '#ff9c32', '#fff3c2'] },
  { name: '极地冰蓝', colors: ['#030f2b', '#174879', '#288fa8', '#85dbd5', '#f0ffed'] },
  { name: '酸性荧光', colors: ['#120927', '#512292', '#b535c6', '#d4ef47', '#faffca'] },
  { name: '暮色珊瑚', colors: ['#302052', '#7162bc', '#c886cc', '#f49da0', '#ffe6b1'] },
  { name: '墨绿金砂', colors: ['#061d24', '#175553', '#508875', '#c3b65d', '#fff1c5'] },
]
export const HEAT_NUMBERS = ['heatContrast', 'heatOffset', 'heatScale', 'heatOrganic', 'heatGrain'] as const
export function heatSettings(params: ShaderParams) { return Object.fromEntries(Object.entries(HEAT_DEFAULTS).map(([key, value]) => [key, params[key as keyof ShaderParams] ?? value])) as typeof HEAT_DEFAULTS }
export const HEAT_RECIPE = 'Mode 22: render MeshNormalMaterial(DoubleSide) into the linear RGBA target with transparent clear. Decode view-space normals from RGB. Heat combines directional normal response, view-facing rim and a static screen-space sinusoidal organic field. Map through five evenly spaced editable display-sRGB colors using smoothstep, then add static grain. Preserve model alpha. No time or hover input; this is a stylized thermal palette, not temperature measurement. Export all heat uniforms. Fullscreen output uses NoBlending, toneMapped:false, no further color conversion.'
export const HEAT_GLSL = `
uniform vec3 heatCold, heatCool, heatMid, heatWarm, heatHot;
uniform float heatContrast, heatOffset, heatScale, heatOrganic, heatGrain;
vec4 renderHeat(vec2 uv) {
  vec4 sampleValue = texture2D(tDiffuse, uv);
  vec3 n = normalize(sampleValue.rgb * 2.0 - 1.0 + vec3(.00001));
  vec2 p = (uv-.5)*vec2(resolution.x/resolution.y,1.0)*heatScale*6.28318;
  float organic = .5+.25*(sin(p.x+sin(p.y*1.3))+cos(p.y+sin(p.x*.8)));
  float surface = stackInputDisplay > .5 ? dot(sampleValue.rgb,vec3(.299,.587,.114)) : .5+.38*dot(n,normalize(vec3(-.55,-.65,.55)))+.12*(1.0-abs(n.z));
  float t = clamp((mix(surface,organic,heatOrganic)-.5)*heatContrast+.5+heatOffset,0.0,1.0);
  vec3 color;
  if(t<.25) color=mix(heatCold,heatCool,smoothstep(0.0,.25,t));
  else if(t<.5) color=mix(heatCool,heatMid,smoothstep(.25,.5,t));
  else if(t<.75) color=mix(heatMid,heatWarm,smoothstep(.5,.75,t));
  else color=mix(heatWarm,heatHot,smoothstep(.75,1.0,t));
  float grain=fract(sin(dot(floor(uv*resolution),vec2(12.9898,78.233)))*43758.5453)-.5;
  return vec4(clamp(color+grain*heatGrain,0.0,1.0),sampleValue.a);
}`
