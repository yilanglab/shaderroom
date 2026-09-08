import * as THREE from 'three'
import type { LightingSettings, ParticleSettings, ParticleSnapshot, ViewSettings } from '../types'
import { buildViewLightRecipe, displaySrgbVector } from './lighting'

export const PARTICLE_RECIPE = {
  renderPath: 'direct-points-render', primitive: 'THREE.Points', material: { type: 'ShaderMaterial', transparent: true, depthTest: true, depthWrite: false, blending: 'NormalBlending', toneMapped: false },
  attributes: { position: 'sampleLogo XY positions, centered, largest dimension 4', targetPosition: 'sampleModel positions in normalized model parent space', targetNormal: 'sampleModel unit normals in normalized model parent space', scatterDirection: 'Seeded unit vectors; generated once with mulberry32(seed XOR 0x50415254), z=2*r1-1, theta=2*pi*r2, xy=sqrt(1-z*z). Samples keep the same array index correspondence throughout.' },
  timeline: { durationUnit: 'seconds', progress: '0..1 in the current transition direction; logo idle=0, model idle=1', forwardTime: 'logo:0; model:1; to-model:progress; to-logo:1-progress', morph: 'startTime=acos(1-clamp(morphStartAngle,0,300)/180)/pi; morph=smoothstep(startTime,1,forwardTime). morphStartAngle is degrees of the eased turn; default 35.', turnAngle: '2*pi*(.5-.5*cos(pi*forwardTime)) radians about rotationAxis; zero angular velocity at both endpoints. Keep the SVG until the eased turn reaches morphStartAngle, then morph to the model. Reverse playback evaluates this exact timeline backward.', scatter: 'scatterDirection * scatter * sin(pi*morph); zero at both endpoints', frameDelta: 'clamp(deltaSeconds,0,0.05)', transitionDuration: 'Capture max(0.1,settings.duration) when playback starts; changes apply on the next playback.', interruptions: 'Ignore play while transitioning; reset, changing model, changing effect or changing particle count rebuilds at logo state.' },
  transforms: 'Apply targetPose=Matrix4.makeRotationFromEuler(Euler(degToRad(view.rotationX/Y/Z),XYZ)) only to targetPosition/targetNormal. Apply extra Y modelRotation to that target. Mix with the unrotated logo by morph, add scatter, rotate the whole result by turnAngle around rotationAxis, then add world-local Y floatOffset. The Points parent has rotation=(0,0,0), scale=view.scale. Orbit camera still applies; reset entry camera to face the logo.',
  drift: 'Before mixing with the model, add driftAmplitude*vec3(sin(idleElapsed*.7+scatterDirection.x*2*pi),sin(idleElapsed*.9+scatterDirection.y*2*pi),.35*sin(idleElapsed*.5+scatterDirection.z*2*pi)) to each logo position. Uses the frozen idleElapsed during transitions and resumes after return. The mix fades drift to zero at the model endpoint. Reduced motion sets driftAmplitude=0. Small displacements may extend outside the SVG contour.',
  floating: 'Only idle logo advances idleElapsed: floatAmplitude*sin(2*pi*floatSpeed*idleElapsed). Freeze its offset at forward play; transition floatOffset=anchorFloat*(1-morph). Returning restores that same anchor, then resumes the frozen idle clock. Model idle has floatOffset=0.',
  modelRotation: 'Independent of view.autoRotate. In model phase, add modelRotateSpeed*delta only if modelRotate is enabled. On return, wrap the current angle to the equivalent [-pi,pi) orientation and freeze that as anchorModelRotation, then use effective modelRotation=anchorModelRotation*morph. This preserves the first return orientation and removes at most half a turn instead of unwinding accumulated revolutions.',
  reducedMotion: 'Disable idle floating and model rotation. Play moves directly to the opposite terminal state; enabling reduced motion during a transition completes that transition immediately.',
  pointSize: 'size is CSS pixels; gl_PointSize=clamp(size*pixelRatio,1,64), without distance attenuation.',
  color: 'color/highlightColor are direct HEX/255 display-sRGB channels. Shader output is display-sRGB; do not add output or tone mapping conversion. Light colors are THREE.Color(hex) linear values multiplied by their effective intensity. brightness=clamp(.18+luma(ambient*.22+key*.22*max(dot(normal,keyDirection),0)+fill*.22*max(dot(normal,fillDirection),0)),0,1). Mix particle endpoint colors by brightness.',
  fragment: 'Round point sprites: alpha=1-smoothstep(.35,.5,length(gl_PointCoord-.5)); discard alpha<=.001. Normal alpha blending, no depth writes; frustumCulled=false.',
  uniforms: ['idleTime', 'driftAmplitude', 'morph', 'turnAngle', 'rotationAxis', 'modelRotation', 'targetPose', 'scatter', 'floatOffset', 'size', 'pixelRatio', 'color', 'highlightColor', 'ambientLightColor', 'keyLightColor', 'fillLightColor', 'keyLightDirection', 'fillLightDirection'],
} as const

export function sampleParticleTimeline(phase: ParticleSnapshot['phase'], progress: number, morphStartAngle = 35) {
  const p = THREE.MathUtils.clamp(progress, 0, 1)
  const forwardTime = phase === 'logo' ? 0 : phase === 'model' ? 1 : phase === 'to-model' ? p : 1 - p
  const startTime = Math.acos(1 - THREE.MathUtils.clamp(morphStartAngle, 0, 300) / 180) / Math.PI
  const t = THREE.MathUtils.clamp((forwardTime - startTime) / (1 - startTime), 0, 1)
  return { forwardTime, morph: t * t * (3 - 2 * t), turnAngle: 2 * Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * forwardTime)) }
}

export interface ParticleTimelineState extends ParticleSnapshot {
  idleElapsed: number
  anchorFloat: number
  anchorModelRotation: number
  transitionDuration: number
}

export function createParticleTimeline(reducedMotion = false): ParticleTimelineState {
  return { phase: 'logo', progress: 0, ready: true, elapsed: 0, modelRotation: 0, floatOffset: 0, reducedMotion, idleElapsed: 0, anchorFloat: 0, anchorModelRotation: 0, transitionDuration: 4 }
}

function completeTransition(state: ParticleTimelineState): ParticleTimelineState {
  const toModel = state.phase === 'to-model'
  return { ...state, phase: toModel ? 'model' : 'logo', progress: toModel ? 1 : 0, elapsed: 0, modelRotation: toModel ? state.anchorModelRotation : 0, floatOffset: toModel || state.reducedMotion ? 0 : state.anchorFloat }
}

export function playParticleTimeline(state: ParticleTimelineState, settings: ParticleSettings): ParticleTimelineState {
  if (!state.ready || state.phase === 'to-model' || state.phase === 'to-logo') return state
  const next: ParticleTimelineState = {
    ...state, phase: state.phase === 'logo' ? 'to-model' : 'to-logo', progress: 0, elapsed: 0,
    anchorFloat: state.phase === 'logo' ? state.floatOffset : state.anchorFloat,
    anchorModelRotation: state.phase === 'model' ? THREE.MathUtils.euclideanModulo(state.modelRotation + Math.PI, 2 * Math.PI) - Math.PI : 0,
    transitionDuration: Math.max(0.1, settings.duration),
  }
  return state.reducedMotion ? completeTransition(next) : next
}

export function advanceParticleTimeline(state: ParticleTimelineState, delta: number, settings: ParticleSettings, reducedMotion = state.reducedMotion): ParticleTimelineState {
  const dt = THREE.MathUtils.clamp(Number.isFinite(delta) ? delta : 0, 0, 0.05)
  const next = { ...state, reducedMotion }
  if (state.phase === 'to-model' || state.phase === 'to-logo') {
    if (reducedMotion) return completeTransition(next)
    next.elapsed += dt
    next.progress = Math.min(1, state.progress + dt / state.transitionDuration)
    if (1 - next.progress < 1e-10) next.progress = 1
    const { morph } = sampleParticleTimeline(state.phase, next.progress, settings.morphStartAngle)
    next.floatOffset = state.anchorFloat * (1 - morph)
    next.modelRotation = state.anchorModelRotation * morph
    return next.progress >= 1 ? completeTransition(next) : next
  }
  next.elapsed += dt
  if (state.phase === 'logo') {
    if (!reducedMotion) next.idleElapsed += dt
    next.floatOffset = reducedMotion ? 0 : settings.floatAmplitude * Math.sin(2 * Math.PI * settings.floatSpeed * next.idleElapsed)
    next.modelRotation = 0
  } else {
    next.floatOffset = 0
    if (!reducedMotion && settings.modelRotate) next.modelRotation += settings.modelRotateSpeed * dt
  }
  return next
}

export function particleSnapshot(state: ParticleTimelineState): ParticleSnapshot {
  return { ...state }
}

export function buildParticleUniformValues(input: { settings: ParticleSettings; view: ViewSettings; snapshot: ParticleSnapshot; lighting: LightingSettings; pixelRatio: number; camera?: { position: number[]; target: number[] } }) {
  const { settings, view, snapshot, lighting, pixelRatio } = input
  const timeline = sampleParticleTimeline(snapshot.phase, snapshot.progress, settings.morphStartAngle)
  const recipe = buildViewLightRecipe(lighting, input.camera)
  const lightColor = (index: number): [number, number, number] => new THREE.Color(recipe[index].color).multiplyScalar(recipe[index].intensity).toArray() as [number, number, number]
  return {
    morph: timeline.morph, turnAngle: timeline.turnAngle,
    rotationAxis: (settings.rotationAxis === 'x' ? [1, 0, 0] : settings.rotationAxis === 'z' ? [0, 0, 1] : [0, 1, 0]) as [number, number, number],
    modelRotation: snapshot.modelRotation, floatOffset: snapshot.floatOffset,
    targetPose: new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(view.rotationX), THREE.MathUtils.degToRad(view.rotationY), THREE.MathUtils.degToRad(view.rotationZ), 'XYZ')).toArray(),
    scatter: settings.scatter, size: settings.size, pixelRatio,
    idleTime: snapshot.idleElapsed,
    driftAmplitude: snapshot.reducedMotion ? 0 : (settings.driftAmplitude ?? 0.055),
    color: displaySrgbVector(settings.color), highlightColor: displaySrgbVector(settings.highlightColor),
    ambientLightColor: lightColor(0), keyLightColor: lightColor(1), fillLightColor: lightColor(2),
    keyLightDirection: new THREE.Vector3(...recipe[1].position).sub(new THREE.Vector3(...recipe[1].target)).normalize().toArray(),
    fillLightDirection: new THREE.Vector3(...recipe[2].position).sub(new THREE.Vector3(...recipe[2].target)).normalize().toArray(),
  }
}

export const PARTICLE_VERTEX_SHADER = /* glsl */ `
attribute vec3 targetPosition;
attribute vec3 targetNormal;
attribute vec3 scatterDirection;
uniform float morph;
uniform float turnAngle;
uniform vec3 rotationAxis;
uniform float modelRotation;
uniform mat4 targetPose;
uniform float scatter;
uniform float idleTime;
uniform float driftAmplitude;
uniform float floatOffset;
uniform float size;
uniform float pixelRatio;
uniform vec3 ambientLightColor;
uniform vec3 keyLightColor;
uniform vec3 fillLightColor;
uniform vec3 keyLightDirection;
uniform vec3 fillLightDirection;
varying float vBrightness;
vec3 rotateAround(vec3 value, vec3 axis, float angle) {
  return value*cos(angle)+cross(axis,value)*sin(angle)+axis*dot(axis,value)*(1.0-cos(angle));
}
void main() {
  vec3 target = rotateAround((targetPose*vec4(targetPosition,1.0)).xyz,vec3(0.0,1.0,0.0),modelRotation);
  vec3 phase = scatterDirection * 6.283185307179586;
  vec3 drift = vec3(sin(idleTime*.7+phase.x), sin(idleTime*.9+phase.y), sin(idleTime*.5+phase.z)*.35) * driftAmplitude;
  vec3 point = mix(position+drift,target,morph)+scatterDirection*scatter*sin(3.141592653589793*morph);
  point = rotateAround(point,rotationAxis,turnAngle);
  point.y += floatOffset;
  vec3 n = rotateAround(mat3(targetPose)*targetNormal,vec3(0.0,1.0,0.0),modelRotation);
  n = mix(vec3(0.0,0.0,1.0),n,morph);
  n = length(n) > .00001 ? normalize(n) : vec3(0.0,0.0,1.0);
  n = rotateAround(n,rotationAxis,turnAngle);
  vec3 light = ambientLightColor*.22 + keyLightColor*.22*max(dot(n,keyLightDirection),0.0) + fillLightColor*.22*max(dot(n,fillLightDirection),0.0);
  vBrightness = clamp(.18+dot(light,vec3(.299,.587,.114)),0.0,1.0);
  gl_Position = projectionMatrix*modelViewMatrix*vec4(point,1.0);
  gl_PointSize = clamp(size*pixelRatio,1.0,64.0);
}
`

export const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 color;
uniform vec3 highlightColor;
varying float vBrightness;
void main() {
  float alpha = 1.0-smoothstep(.35,.5,length(gl_PointCoord-.5));
  if (alpha <= .001) discard;
  gl_FragColor = vec4(mix(color,highlightColor,vBrightness),alpha);
}
`

export function createParticlePoints(logo: Float32Array, target: Float32Array, normals: Float32Array, seed: number) {
  if (!logo.length || logo.length !== target.length || target.length !== normals.length) throw new Error('粒子采样数量不一致，请重新选择模型。')
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(logo, 3))
  geometry.setAttribute('targetPosition', new THREE.BufferAttribute(target, 3))
  geometry.setAttribute('targetNormal', new THREE.BufferAttribute(normals, 3))
  const directions = new Float32Array(logo.length)
  let randomState = (seed ^ 0x50415254) >>> 0
  const random = () => {
    let t = randomState += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  for (let index = 0; index < directions.length; index += 3) {
    const z = 2 * random() - 1
    const angle = 2 * Math.PI * random()
    const radius = Math.sqrt(1 - z * z)
    directions[index] = radius * Math.cos(angle)
    directions[index + 1] = radius * Math.sin(angle)
    directions[index + 2] = z
  }
  geometry.setAttribute('scatterDirection', new THREE.BufferAttribute(directions, 3))
  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX_SHADER, fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
    uniforms: {
      morph: { value: 0 }, turnAngle: { value: 0 }, rotationAxis: { value: new THREE.Vector3(0, 1, 0) },
      idleTime: { value: 0 }, driftAmplitude: { value: 0 },
      modelRotation: { value: 0 }, targetPose: { value: new THREE.Matrix4() }, scatter: { value: 0 }, floatOffset: { value: 0 }, size: { value: 2.4 }, pixelRatio: { value: 1 },
      color: { value: new THREE.Vector3() }, highlightColor: { value: new THREE.Vector3() },
      ambientLightColor: { value: new THREE.Vector3() }, keyLightColor: { value: new THREE.Vector3() }, fillLightColor: { value: new THREE.Vector3() }, keyLightDirection: { value: new THREE.Vector3() }, fillLightDirection: { value: new THREE.Vector3() },
    },
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  return points
}

export function updateParticleUniforms(points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>, values: ReturnType<typeof buildParticleUniformValues>) {
  for (const [name, value] of Object.entries(values)) {
    const uniform = points.material.uniforms[name]
    if (typeof value === 'number') uniform.value = value
    else if (name === 'targetPose') (uniform.value as THREE.Matrix4).fromArray(value)
    else (uniform.value as THREE.Vector3).fromArray(value)
  }
}
