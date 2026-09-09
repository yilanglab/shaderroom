import * as THREE from 'three'
import { buildLightRecipe, displaySrgbVector } from './lighting'
import { INTERACTION_GLSL, interactionMode, interactionUniforms, type InteractionSettings } from './interaction'
import type { LightingSettings, ShaderId } from '../types'

export const INTERACTIVE_EFFECT_RECIPE = {
  modes: { 'lens-distortion': 0, 'liquid-ripple': 1, 'magnetic-pull': 2, 'prism-trail': 3, 'material-reveal': 4, 'elastic-indent': 5 },
  post: 'Modes 0,1,3: render original model materials into linear-sRGB RGBA8 render target, then full-screen post fragment. Sample straight RGBA; return zero beyond texture edges. Convert linear RGB to display-sRGB once; NoBlending, depthTest/depthWrite false, toneMapped false. CSS background stays outside the distortion.',
  mesh: 'Modes 2,4,5: replace model mesh material with supplied mesh ShaderMaterial, DoubleSide, NoBlending, toneMapped false, depthTest/depthWrite true. Three.js morph/skin/instance chunks run before view-space deformation. Output display-sRGB directly. Use camera-local light directions from buildLightRecipe and linear light colours times intensity.',
  geometry: 'For magnetic-pull and elastic-indent, static non-skinned non-instanced meshes without morph attributes may use TessellateModifier from pinned three/addons/modifiers/TessellateModifier.js: maxEdgeLength=length(local bounding-box size)/24, maxIterations=min(7,floor(log2(min(80000,remainingBudget)/triangles))). Only when iteration >=1; global added-geometry budget 240000 triangles. Clone geometry and decode position,normal,color,uv,uv1 into Float32 attributes via getComponent before the modifier to preserve normalized/interleaved GLB attributes. Retain original geometry and restore when effect changes. Shader deformation is bounded in view-space and does not change stored model buffers.',
  lens: 'Soft radial UV compression creates local magnification. Dispersion is CSS pixel radial channel offset, gated at the soft boundary; alpha=max(sample alphas) and each channel is alpha-weighted to avoid black or colored transparent fringes.',
  ripple: 'Expanding sinusoidal radial waves with falloff and a small sampling offset controlled by smoothed cursor velocity. uInteractionTime drives phase, uInteractionSpeed changes wave speed.',
  prism: 'Five weighted directional samples per RGB channel, shift from cursor velocity; channel-separated trailing energy grows with velocity and settles when motion stops. No hard screen slices.',
  magnetic: 'Pull vertices toward the cursor view-plane intersection plus a modest camera-facing bulge, weighted by radius and strength. Model returns as uHover fades.',
  indent: 'Camera-space center depression with an outer raised ring. Shared hover envelope smoothly restores the surface on exit. Recomputed derivative normal on deformed region.',
  reveal: 'Camera-facing metallic base reveals a charcoal material with a luminous procedural structure grid within the hover region; derivative-antialiased view-space grid, not original mesh topology.',
}
export const INTERACTIVE_POST_VERTEX = `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`
export const INTERACTIVE_POST_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uEffectMode,uMagnification,uDispersion,uSoftness;
${INTERACTION_GLSL}
vec4 readScene(vec2 uv){if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))return vec4(0.);return texture2D(tDiffuse,uv);}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec4 splitSample(vec2 uv,vec2 shift){
 vec4 r=readScene(uv+shift),g=readScene(uv),b=readScene(uv-shift);
 float a=max(r.a,max(g.a,b.a));
 return vec4(vec3(r.r*r.a,g.g*g.a,b.b*b.a)/max(a,.00001),a);
}
void main(){
 vec2 delta=(vUv-uPointer)*uInteractionResolution;
 float radius=max(uRadius,1.),d=length(delta)/radius;
 float w=(1.-smoothstep(max(0.,1.-uSoftness),1.,d))*uHover;
 vec2 dir=delta/max(length(delta),1.);
 vec2 uv=vUv; vec4 col;
 if(uEffectMode<.5){
   float lens=(1.-smoothstep(0.,1.,d))*w*uStrength;
   uv=uPointer+(vUv-uPointer)/mix(1.,uMagnification,lens);
   vec2 chroma=dir/uInteractionResolution*uDispersion*w*sin(clamp(d,0.,1.)*3.14159);
   col=splitSample(uv,chroma);
 }else if(uEffectMode<1.5){
   float wave=sin(d*26.-uInteractionTime*uInteractionSpeed*7.);
   float envelope=hoverWeight(vUv)*(1.-exp(-d*6.));
   uv+=dir/uInteractionResolution*wave*9.*uStrength*envelope;
   uv-=uVelocity*.006*envelope*uStrength;
   col=splitSample(uv,dir/uInteractionResolution*uDispersion*.3*envelope);
 }else{
   vec2 movement=clamp(uVelocity,vec2(-1.5),vec2(1.5));
   float speed=clamp(length(movement)*3.,0.,1.);
   vec2 shift=movement*.025*w*uStrength;
   vec4 acc=vec4(0.);float total=0.;
   for(int i=0;i<5;i++){
     float t=float(i)/4.;float weight=exp(-t*2.5);
     vec4 s=splitSample(vUv+shift*t,shift*(.2+t*.35)+dir/uInteractionResolution*uDispersion*w*speed);
     acc+=vec4(s.rgb*s.a,s.a)*weight;total+=weight;
   }
   acc/=total;col=vec4(acc.rgb/max(acc.a,.00001),acc.a);
 }
 gl_FragColor=vec4(encode(col.rgb),col.a);
}
`
export const INTERACTIVE_MESH_VERTEX = `
#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
${INTERACTION_GLSL}
uniform float uEffectMode;
varying vec3 vPosition,vNormal;
varying vec4 vClip;
varying float vDeform;
void main(){
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
 vec2 uv=gl_Position.xy/gl_Position.w*.5+.5;
 float weight=hoverWeight(uv);vDeform=weight;
 float viewRadius=2.*abs(mvPosition.z)*uRadius/(uInteractionResolution.y*projectionMatrix[1][1]);
 vec2 cursorView=(uPointer*2.-1.)*(-mvPosition.z)/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
 if(uEffectMode>1.5&&uEffectMode<2.5){
   mvPosition.xy+=(cursorView-mvPosition.xy)*weight*uStrength*.75;
   mvPosition.z+=viewRadius*weight*uStrength*.35;
 }else if(uEffectMode>4.5){
   float d=length((uv-uPointer)*uInteractionResolution)/max(uRadius,1.);
   float bowl=exp(-d*d*12.);
   float ring=exp(-pow((d-.65)*7.,2.))*.26;
   mvPosition.z+=(-bowl+ring)*viewRadius*uStrength*uHover*.65;
 }
 vPosition=mvPosition.xyz;vNormal=normalize(transformedNormal);
 gl_Position=projectionMatrix*mvPosition;
 vClip=gl_Position;
}
`
export const INTERACTIVE_MESH_FRAGMENT = `
precision highp float;
${INTERACTION_GLSL}
uniform float uEffectMode;
uniform vec3 uInteractionColor,ambientLightColor,keyLightColor,fillLightColor,keyLightDirection,fillLightDirection;
varying vec3 vPosition,vNormal;
varying vec4 vClip;
varying float vDeform;
void main(){
 vec3 normal=normalize(vNormal)*(gl_FrontFacing?1.:-1.);
 vec3 deformedNormal=normalize(cross(dFdx(vPosition),dFdy(vPosition)));
 if(dot(deformedNormal,normal)<0.)deformedNormal=-deformedNormal;
 if(uEffectMode<2.5||uEffectMode>4.5)normal=normalize(mix(normal,deformedNormal,clamp(vDeform*2.,0.,1.)));
 vec3 view=normalize(-vPosition);
 vec3 light=ambientLightColor*.24+keyLightColor*.38*max(dot(normal,keyLightDirection),0.)+fillLightColor*.38*max(dot(normal,fillLightDirection),0.);
 float spec=pow(max(dot(normal,normalize(view+keyLightDirection)),0.),uEffectMode>4.5?24.:65.);
 float rim=pow(1.-abs(dot(normal,view)),3.);
 vec3 color=uInteractionColor*(.12+light)+vec3(spec*.55)+uInteractionColor*rim*.25;
 if(uEffectMode>3.5&&uEffectMode<4.5){
   float weight=hoverWeight(vClip.xy/vClip.w*.5+.5)*uStrength;
   vec2 grid=vPosition.xy*12.;
   vec2 dist=abs(fract(grid-.5)-.5)/max(fwidth(grid),vec2(.0001));
   float line=1.-smoothstep(.5,1.5,min(dist.x,dist.y));
   vec3 reveal=vec3(.035,.045,.065)+uInteractionColor*(line*.95+rim*.2);
   color=mix(color,reveal,weight);
 }
 gl_FragColor=vec4(clamp(color,0.,1.),1.);
}
`
export function buildInteractiveUniformValues(id: ShaderId, settings: InteractionSettings, lighting: LightingSettings) {
  const lights=buildLightRecipe(lighting)
  return {
    uEffectMode: interactionMode(id), uMagnification: settings.magnification, uDispersion: settings.dispersion, uSoftness: settings.softness,
    uInteractionColor: displaySrgbVector(settings.color),
    ambientLightColor: new THREE.Color(lights[0].color).multiplyScalar(lights[0].intensity).toArray(),
    keyLightColor: new THREE.Color(lights[1].color).multiplyScalar(lights[1].intensity).toArray(),
    fillLightColor: new THREE.Color(lights[2].color).multiplyScalar(lights[2].intensity).toArray(),
    keyLightDirection: new THREE.Vector3(...lights[1].position).normalize().toArray(),
    fillLightDirection: new THREE.Vector3(...lights[2].position).normalize().toArray(),
  }
}
export function createInteractiveMaterial(mesh: boolean) {
  return new THREE.ShaderMaterial({ vertexShader: mesh?INTERACTIVE_MESH_VERTEX:INTERACTIVE_POST_VERTEX, fragmentShader: mesh?INTERACTIVE_MESH_FRAGMENT:INTERACTIVE_POST_FRAGMENT, uniforms: { ...interactionUniforms(), tDiffuse: {value:null} }, side: THREE.DoubleSide, depthTest:mesh,depthWrite:mesh,blending:THREE.NoBlending,toneMapped:false })
}
export function updateInteractiveMaterial(material: THREE.ShaderMaterial, id: ShaderId, settings: InteractionSettings, lighting: LightingSettings) {
  for(const [key,value] of Object.entries(buildInteractiveUniformValues(id,settings,lighting))){
    const uniform=material.uniforms[key]??(material.uniforms[key]={value:typeof value==='number'?0:new THREE.Vector3()})
    if(typeof value==='number')uniform.value=value;else uniform.value.fromArray(value)
  }
}
export const usesInteractiveMesh = (id: string) => ['magnetic-pull','material-reveal','elastic-indent'].includes(id)
