import * as THREE from 'three'
import type { ShaderId } from '../types'

export const NEW_INTERACTIVE_IDS = ['lens-distortion', 'liquid-ripple', 'magnetic-pull', 'prism-trail', 'material-reveal', 'elastic-indent'] as const
export type NewInteractiveId = typeof NEW_INTERACTIVE_IDS[number]
export function isNewInteractive(id: string): id is NewInteractiveId { return (NEW_INTERACTIVE_IDS as readonly string[]).includes(id) }
export const INTERACTIVE_IDS: readonly string[] = [...NEW_INTERACTIVE_IDS, 'particle-morph', 'adaptive-grid', 'ascii', 'hologram', 'halftone', 'glyph-matrix']
export function supportsInteraction(id: string) { return INTERACTIVE_IDS.includes(id) }
export interface InteractionSettings {
  enabled: boolean; radius: number; strength: number; follow: number;
  magnification: number; dispersion: number; softness: number; speed: number; color: string
}
export const DEFAULT_INTERACTION: InteractionSettings = { enabled: true, radius: 120, strength: .65, follow: .1, magnification: 1.3, dispersion: 1.5, softness: .35, speed: 1, color: '#88dfff' }
export interface InteractionSnapshot { pointer: [number, number]; velocity: [number, number]; amount: number; time: number }
export function advanceInteraction(state: InteractionSnapshot, target: readonly number[], delta: number, followSeconds: number, eligible: boolean, reduced: boolean) {
  const dt=Number.isFinite(delta)?Math.max(0,Math.min(delta,.05)):0
  const follow=reduced?1:1-Math.exp(-dt/Math.max(.001,followSeconds))
  for(let axis=0;axis<2;axis++) {
    const movement=(target[axis]-state.pointer[axis])*follow
    state.pointer[axis]+=movement
    const velocity=eligible&&!reduced&&dt>0?THREE.MathUtils.clamp(movement/dt,-2,2):0
    state.velocity[axis]+=(velocity-state.velocity[axis])*(reduced?1:1-Math.exp(-dt/.1))
  }
  state.amount+=((eligible?1:0)-state.amount)*(reduced?1:1-Math.exp(-dt/(eligible?.12:.18)))
  if(!reduced&&state.amount>.001)state.time+=dt
}
export const INTERACTION_GLSL = `
uniform vec2 uPointer, uInteractionResolution, uVelocity;
uniform float uHover, uRadius, uStrength, uInteractionTime, uInteractionSpeed;
float hoverWeight(vec2 uv) {
  float d = length((uv - uPointer) * uInteractionResolution) / max(uRadius, 1.0);
  return (1.0 - smoothstep(0.0, 1.0, d)) * uHover;
}
`
export function interactionUniforms() {
  return { uPointer: { value: new THREE.Vector2(.5,.5) }, uInteractionResolution: { value: new THREE.Vector2(1,1) }, uVelocity: { value: new THREE.Vector2() }, uHover: { value: 0 }, uRadius: { value: 120 }, uStrength: { value: .65 }, uInteractionTime: { value: 0 }, uInteractionSpeed: { value: 1 } }
}
export function updateInteractionUniforms(material: THREE.ShaderMaterial, settings: InteractionSettings, state: InteractionSnapshot, width: number, height: number) {
  if (!material.uniforms.uPointer) Object.assign(material.uniforms, interactionUniforms())
  const u=material.uniforms
  u.uPointer.value.set(...state.pointer); u.uVelocity.value.set(...state.velocity)
  u.uInteractionResolution.value.set(width,height); u.uHover.value=state.amount
  u.uRadius.value=settings.radius; u.uStrength.value=settings.strength
  u.uInteractionTime.value=state.time; u.uInteractionSpeed.value=settings.speed
}
export function interactionMode(id: ShaderId) { return NEW_INTERACTIVE_IDS.indexOf(id as NewInteractiveId) }
export const INTERACTION_RECIPE = {
  coordinateSpace: 'uPointer is normalized canvas UV, bottom-left origin; uInteractionResolution and uRadius are CSS pixels, independent of DPR. uVelocity is normalized UV per second.',
  input: 'Only mouse/hover-capable pen over the canvas, no pressed buttons. Suspend on pointerdown, pointerleave, pointercancel, window blur, panels, or unsupported effect; clear on model/effect change. Touch continues OrbitControls only.',
  smoothing: 'pointer += (target-pointer)*(1-exp(-dt/max(follow,.001))); amount approaches enabled hover target with time constant .12 entering and .18 leaving; clamp dt to .05. Velocity is low-pass filtered, clamped to +/-2 UV/s and decays when stationary. Reduced motion snaps pointer and amount, uses zero velocity and frozen interaction time.',
  state: 'enabled is saved per effect and defaults true. Unsupported effects disable the toolbar control. Interaction is separate from model autoRotate and effect timeline animation.',
  uniforms: INTERACTION_GLSL,
}
