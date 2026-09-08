import * as THREE from 'three'
import type { LightingSettings, SceneSnapshot, ShaderId } from '../types'
import { buildLightRecipe, displaySrgbVector } from './lighting'

export const SURFACE_IDS = ['engraving', 'hologram', 'iridescent', 'dissolve'] as const
export type SurfaceId = typeof SURFACE_IDS[number]
export const isSurfaceShader = (id: ShaderId): id is SurfaceId => (SURFACE_IDS as readonly string[]).includes(id)
export const DEFAULT_SURFACE = {
  engravingSpacing: 5, engravingWidth: .8, engravingAngle: 35, engravingContrast: 1.3, engravingGrain: .08,
  engravingInk: '#283347', engravingPaper: '#f0e8d6',
  hologramColor: '#65e7ff', hologramOpacity: .65, hologramLines: 35, hologramScanWidth: .2, hologramSpeed: .6, hologramAnimate: true,
  metalColorA: '#6bdfff', metalColorB: '#de86ff', metalColorC: '#ffd18c', metalRoughness: .22, metalIridescence: .85, metalSpeed: .3, metalAnimate: true,
  dissolveColor: '#b8c7e6', dissolveEdgeColor: '#ff9950', dissolveNoise: 3, dissolveEdgeWidth: .065, dissolveDuration: 1.8, dissolveAxis: 1,
}
export type SurfaceSettings = typeof DEFAULT_SURFACE
export interface DissolveState { progress: number; start: number; target: number; elapsed: number; duration: number; playing: boolean }
export interface SurfaceSnapshot { time: number; dissolve: DissolveState }
export const createDissolve = (progress = 0): DissolveState => ({ progress, start: progress, target: progress, elapsed: 0, duration: 1.8, playing: false })
export function playDissolve(state: DissolveState, duration: number, reducedMotion = false): DissolveState {
  if (state.playing) return state
  const target = state.progress >= .999 ? 0 : 1
  if (reducedMotion) return createDissolve(target)
  return { ...state, start: state.progress, target, elapsed: 0, duration: Math.max(.1, duration * Math.abs(target-state.progress)), playing: true }
}
export function advanceDissolve(state: DissolveState, delta: number, reducedMotion = false): DissolveState {
  if (!state.playing) return state
  if (reducedMotion) return createDissolve(state.target)
  const elapsed = state.elapsed + Math.min(.05, Math.max(0, Number.isFinite(delta) ? delta : 0))
  const t = Math.min(1, elapsed / state.duration)
  if (t >= 1-1e-10) return createDissolve(state.target)
  return { ...state, elapsed, progress: THREE.MathUtils.lerp(state.start, state.target, t*t*(3-2*t)) }
}
export const SURFACE_RECIPE = {
  renderPath: 'direct-mesh-shader', primitive: 'original model meshes, including static skin/morph/instance transforms',
  material: { type: 'ShaderMaterial', side: 'DoubleSide', transparent: false, blending: 'NoBlending', toneMapped: false, depthTest: true, depthWrite: true, alpha: 'Write straight alpha directly to the canvas (renderer premultipliedAlpha=false). Hologram shows the nearest surface; no accumulation of rear transparent layers.' },
  coordinates: 'vSurfaceNormal and vViewDirection are view-space. Light direction uniforms are normalized camera-local studio offsets from lighting.lights; they match the camera-facing light rig. vSurfacePosition = worldToPose * world vertex, in normalized model coordinates before outer pose; worldToPose is inverse(snapshot.model matrix). Pixel pattern uses gl_FragCoord.xy / pixelRatio, in CSS pixels.',
  colors: 'All palette HEX values are converted directly to display-sRGB channels (HEX/255). Scene light colors use linear THREE.Color(hex)*intensity. Fragment output is already display-sRGB: do not add tone mapping or output conversion.',
  engraving: 'Three antialiased line families at angle, angle+90 degrees and angle+45 degrees. Shadow strength controls added crosshatching. Fixed screen-space paper grain; independent ink/paper colors. Spacing and width are CSS pixels.',
  hologram: 'Translucent rim light, narrow horizontal scanlines and a traveling Y scan band in normalized model space. Clock advances only while hologramAnimate is enabled and reduced motion is off. No bloom buffer or external textures.',
  iridescent: 'Procedural camera-space studio reflection bands plus three-color interference tint. Roughness broadens reflections. This is a designed chrome-like shader, not an HDR environment or physically simulated thin film. Clock advances only while metalAnimate is enabled and reduced motion is off.',
  dissolve: 'Directional normalized model coordinate plus smooth 3D fractal noise. Threshold=mix(-.15,1.15,progress); discard below threshold. Color the surviving boundary within dissolveEdgeWidth. Axis 0/1/2 means X/Y/Z. At progress=0 retain the complete mesh; at 1 discard all fragments.',
  animation: 'Preserve snapshot.surface.time and the complete dissolve state. time advances by clamp(delta,0,.05) only for the selected animated hologram/iridescent effect. Play dissolve toward 1 (or 0 when already dissolved); duration=max(.1,settings.dissolveDuration*abs(target-start)); progress=mix(start,target,smoothstep(0,1,elapsed/duration)). Snap to endpoint at t>=1-1e-10. Manual progress cancels playback. Reduced motion stops continuous clocks and resolves dissolve playback immediately. Freeze the clocks for a captured frame. Switching model/effect resets dissolve to visible; retain shared surface time.',
  vertexDependencies: 'Vertex source uses Three.js ShaderChunk includes for batching, morphs and skinning. Use the exported pinned Three.js version and ShaderMaterial so includes and built-in attributes/matrices resolve automatically.',
}

export const SURFACE_VERTEX = /* glsl */ `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform mat4 worldToPose;
varying vec3 vSurfaceNormal;
varying vec3 vViewDirection;
varying vec3 vSurfacePosition;
void main() {
  #include <morphinstance_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>
  vSurfaceNormal = normalize(transformedNormal);
  vViewDirection = -mvPosition.xyz;
  vec4 p = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    p = batchingMatrix * p;
  #endif
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
  #endif
  vSurfacePosition = (worldToPose * modelMatrix * p).xyz;
}
`
export const SURFACE_FRAGMENT = /* glsl */ `
uniform float surfaceMode;
uniform float time;
uniform float pixelRatio;
uniform vec3 ambientLightColor;
uniform vec3 keyLightColor;
uniform vec3 fillLightColor;
uniform vec3 keyLightDirection;
uniform vec3 fillLightDirection;
uniform float engravingSpacing;
uniform float engravingWidth;
uniform float engravingAngle;
uniform float engravingContrast;
uniform float engravingGrain;
uniform vec3 engravingInk;
uniform vec3 engravingPaper;
uniform vec3 hologramColor;
uniform float hologramOpacity;
uniform float hologramLines;
uniform float hologramScanWidth;
uniform float hologramSpeed;
uniform vec3 metalColorA;
uniform vec3 metalColorB;
uniform vec3 metalColorC;
uniform float metalRoughness;
uniform float metalIridescence;
uniform float metalSpeed;
uniform vec3 dissolveColor;
uniform vec3 dissolveEdgeColor;
uniform float dissolveNoise;
uniform float dissolveEdgeWidth;
uniform float dissolveAxis;
uniform float dissolveProgress;
varying vec3 vSurfaceNormal;
varying vec3 vViewDirection;
varying vec3 vSurfacePosition;
float hash3(vec3 p) { p=fract(p*.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float noise3(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float hatch(vec2 p, float angle, float width) {
  float q=dot(p,vec2(cos(angle),sin(angle)))/engravingSpacing;
  float distance=abs(fract(q)-.5)*engravingSpacing;
  return 1.0-smoothstep(max(0.0,width-.5),width+.5,distance);
}
void main() {
  vec3 n=normalize(vSurfaceNormal)*(gl_FrontFacing?1.0:-1.0);
  vec3 view=normalize(vViewDirection);
  vec3 light=ambientLightColor*.2+keyLightColor*.28*max(dot(n,keyLightDirection),0.0)+fillLightColor*.28*max(dot(n,fillLightDirection),0.0);
  float lit=clamp(dot(light,vec3(.299,.587,.114)),0.0,1.0);
  if(surfaceMode<.5) {
    float dark=1.0-clamp((lit-.5)*engravingContrast+.5,0.0,1.0);
    vec2 p=gl_FragCoord.xy/pixelRatio;
    float a=radians(engravingAngle);
    float ink=hatch(p,a,engravingWidth)*smoothstep(.04,.55,dark);
    ink=max(ink,hatch(p,a+1.5707963,engravingWidth*.8)*smoothstep(.35,.8,dark));
    ink=max(ink,hatch(p,a+.7853982,engravingWidth*.7)*smoothstep(.7,1.0,dark));
    float grain=(hash3(vec3(floor(p),7.0))-.5)*engravingGrain;
    gl_FragColor=vec4(clamp(mix(engravingPaper,engravingInk,ink)+grain,0.0,1.0),1.0);
  } else if(surfaceMode<1.5) {
    float rim=pow(1.0-abs(dot(n,view)),2.0);
    float line=pow(.5+.5*sin(vSurfacePosition.y*hologramLines*6.2831853-time*hologramSpeed*2.0),10.0);
    float scanY=mod(time*hologramSpeed,5.0)-2.5;
    float scan=1.0-smoothstep(0.0,hologramScanWidth,abs(vSurfacePosition.y-scanY));
    float alpha=clamp(hologramOpacity*(.12+.6*rim+.3*line+.7*scan),0.0,1.0);
    vec3 color=hologramColor*(.5+.35*lit+.55*rim+.65*scan);
    gl_FragColor=vec4(clamp(color,0.0,1.0),alpha);
  } else if(surfaceMode<2.5) {
    vec3 r=reflect(-view,n);
    float rough=clamp(metalRoughness,.02,1.0);
    float band=smoothstep(.12-.15*rough,.18+.3*rough,abs(r.y+.15));
    float softbox=pow(max(dot(r,normalize(vec3(-.6,.8,1.0))),0.0),mix(100.0,3.0,rough));
    float stripe=1.0-smoothstep(.08,.12+rough*.35,abs(r.x+.42));
    float env=.08+.55*band+.55*stripe+softbox*.9;
    float wave=.5+.5*sin((r.x+r.y*.7)*5.0+time*metalSpeed);
    vec3 tint=mix(metalColorA,metalColorB,wave);
    tint=mix(tint,metalColorC,.5+.5*sin(r.z*4.0-r.y*3.0+time*metalSpeed*.7));
    tint=mix(vec3(.88),tint,metalIridescence);
    vec3 color=tint*env*(.5+.5*lit)+vec3(softbox*.5);
    gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
  } else {
    if(dissolveProgress>=.999999) discard;
    float axis=dissolveAxis<.5?vSurfacePosition.x:(dissolveAxis<1.5?vSurfacePosition.y:vSurfacePosition.z);
    float grain=noise3(vSurfacePosition*dissolveNoise)*.7+noise3(vSurfacePosition*dissolveNoise*2.13)*.3;
    float field=clamp(axis*.25+.5,0.0,1.0)*.65+grain*.35;
    float threshold=mix(-.15,1.15,dissolveProgress);
    if(field<threshold) discard;
    float edge=dissolveProgress>.000001?1.0-smoothstep(0.0,dissolveEdgeWidth,field-threshold):0.0;
    vec3 base=dissolveColor*(.25+.75*lit);
    gl_FragColor=vec4(mix(base,mix(dissolveEdgeColor,vec3(1.0,.95,.75),edge*.6),edge),1.0);

  }
}
`

export function buildSurfaceUniforms(id: SurfaceId, settings: SurfaceSettings, snapshot: SurfaceSnapshot, lighting: LightingSettings, scene: SceneSnapshot) {
  const values: Record<string, number | number[]> = { surfaceMode: SURFACE_IDS.indexOf(id), time: snapshot.time, pixelRatio: scene.viewport.pixelRatio, dissolveProgress: snapshot.dissolve.progress }
  for (const [key,value] of Object.entries(settings)) {
    if (typeof value === 'boolean' || key === 'dissolveDuration') continue
    values[key] = typeof value === 'string' ? displaySrgbVector(value) : value
  }
  const lights=buildLightRecipe(lighting)
  for (const [index,name] of ['ambient','key','fill'].entries()) values[`${name}LightColor`]=new THREE.Color(lights[index].color).multiplyScalar(lights[index].intensity).toArray()
  values.keyLightDirection=new THREE.Vector3(...lights[1].position).normalize().toArray()
  values.fillLightDirection=new THREE.Vector3(...lights[2].position).normalize().toArray()
  const pose=scene.model
  values.worldToPose=new THREE.Matrix4().compose(new THREE.Vector3(...pose.position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation)),new THREE.Vector3(...pose.scale)).invert().toArray()
  return values
}
export function createSurfaceMaterial() {
  return new THREE.ShaderMaterial({ vertexShader: SURFACE_VERTEX, fragmentShader: SURFACE_FRAGMENT, uniforms: {}, transparent: false, blending: THREE.NoBlending, depthTest: true, depthWrite: true, side: THREE.DoubleSide, toneMapped: false })
}
export function updateSurfaceMaterial(material: THREE.ShaderMaterial, values: ReturnType<typeof buildSurfaceUniforms>, id: SurfaceId) {
  material.depthWrite=true
  material.transparent=false
  material.blending=THREE.NoBlending
  material.name=id
  for (const [key,value] of Object.entries(values)) {
    const uniform=material.uniforms[key] ?? (material.uniforms[key]={ value: typeof value==='number'?0:value.length===16?new THREE.Matrix4():new THREE.Vector3() })
    if (typeof value==='number') uniform.value=value
    else uniform.value.fromArray(value)
  }
}
