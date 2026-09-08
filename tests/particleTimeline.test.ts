import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_LIGHTING, DEFAULT_PARTICLE, DEFAULT_VIEW } from '../src/defaults'
import { advanceParticleTimeline, buildParticleUniformValues, createParticleTimeline, particleSnapshot, playParticleTimeline, sampleParticleTimeline } from '../src/render/particleMorph'
import type { ParticleTimelineState } from '../src/render/particleMorph'
import type { ParticleSettings } from '../src/types'

function advance(state: ParticleTimelineState, seconds: number, settings: ParticleSettings = DEFAULT_PARTICLE) {
  for (let index = 0; index < Math.round(seconds / 0.025); index += 1) state = advanceParticleTimeline(state, 0.025, settings)
  return state
}

test('forward rotates one eased revolution, with the legacy 180 degree start available', () => {
  assert.deepEqual(sampleParticleTimeline('logo', 0, 180), { forwardTime: 0, morph: 0, turnAngle: 0 })
  assert.equal(sampleParticleTimeline('to-model', 0.25, 180).morph, 0)
  const half = sampleParticleTimeline('to-model', 0.5, 180)
  assert.equal(half.morph, 0)
  assert.ok(Math.abs(half.turnAngle - Math.PI) < 1e-12)
  assert.equal(sampleParticleTimeline('to-model', 0.75, 180).morph, 0.5)
  assert.equal(sampleParticleTimeline('model', 1, 180).turnAngle, 2 * Math.PI)
  assert.equal(sampleParticleTimeline('model', 1, 180).morph, 1)
  const epsilon = 1e-5
  assert.ok(sampleParticleTimeline('to-model', epsilon, 180).turnAngle / epsilon < 0.001)
  assert.ok((2 * Math.PI - sampleParticleTimeline('to-model', 1 - epsilon, 180).turnAngle) / epsilon < 0.001)
})

test('reverse samples exactly the same timeline backward', () => {
  for (const p of [0, 0.1, 0.25, 0.5, 0.73, 0.9, 1]) {
    assert.deepEqual(sampleParticleTimeline('to-logo', p), sampleParticleTimeline('to-model', 1 - p))
  }
})

test('play is ordered and a completed model rotates by default without vertical floating', () => {
  let state = playParticleTimeline(createParticleTimeline(), DEFAULT_PARTICLE)
  assert.equal(state.phase, 'to-model')
  assert.equal(playParticleTimeline(state, DEFAULT_PARTICLE), state)
  state = advance(state, DEFAULT_PARTICLE.duration)
  assert.equal(state.phase, 'model')
  assert.equal(state.progress, 1)
  assert.equal(state.floatOffset, 0)
  assert.equal(state.modelRotation, 0)
  state = advance(state, 2)
  assert.equal(state.floatOffset, 0)
  assert.ok(Math.abs(state.modelRotation - DEFAULT_PARTICLE.modelRotateSpeed * 2) < 1e-10)
  state = advance(playParticleTimeline(state, DEFAULT_PARTICLE), DEFAULT_PARTICLE.duration)
  assert.equal(state.phase, 'logo')
  assert.equal(state.progress, 0)
})

test('return restores the frozen float anchor, then resumes its idle phase without jumping', () => {
  const floating = advance(createParticleTimeline(), 0.3)
  assert.notEqual(floating.floatOffset, 0)
  const started = playParticleTimeline(floating, DEFAULT_PARTICLE)
  const halfway = advance(started, 0.15)
  assert.equal(halfway.floatOffset, floating.floatOffset)
  const model = advance(halfway, DEFAULT_PARTICLE.duration - 0.15)
  assert.equal(model.phase, 'model')
  const logo = advance(playParticleTimeline(model, DEFAULT_PARTICLE), DEFAULT_PARTICLE.duration)
  assert.equal(logo.floatOffset, floating.floatOffset)
  assert.equal(logo.idleElapsed, floating.idleElapsed)
  const next = advanceParticleTimeline(logo, 1 / 120, DEFAULT_PARTICLE)
  assert.ok(Math.abs(next.floatOffset - logo.floatOffset) < 0.003)
})

test('independent model rotation stops when disabled and reverse never unwinds old revolutions', () => {
  let model = advance(playParticleTimeline(createParticleTimeline(), DEFAULT_PARTICLE), DEFAULT_PARTICLE.duration)
  const spinning = { ...DEFAULT_PARTICLE, modelRotate: true, modelRotateSpeed: 0.6 }
  model = advance(model, 0.5, spinning)
  assert.ok(Math.abs(model.modelRotation - 0.3) < 1e-12)
  assert.equal(advance(model, 0.5, { ...DEFAULT_PARTICLE, modelRotate: false }).modelRotation, model.modelRotation)
  model.modelRotation = 200 * Math.PI + 0.3
  const returning = playParticleTimeline(model, DEFAULT_PARTICLE)
  assert.ok(Math.abs(returning.anchorModelRotation - 0.3) < 1e-10)
  const next = advanceParticleTimeline(returning, 1 / 120, DEFAULT_PARTICLE)
  assert.ok(Math.abs(Math.cos(next.modelRotation) - Math.cos(model.modelRotation)) < 0.0001)
  assert.ok(Math.abs(next.modelRotation) < Math.PI)
  const logo = advance(returning, DEFAULT_PARTICLE.duration)
  assert.equal(logo.modelRotation, 0)
})

test('reduced motion disables idle animation and resolves playback directly to endpoints', () => {
  let state = advance(createParticleTimeline(true), 1, { ...DEFAULT_PARTICLE, modelRotate: true })
  assert.equal(state.floatOffset, 0)
  state = playParticleTimeline(state, DEFAULT_PARTICLE)
  assert.equal(state.phase, 'model')
  assert.equal(advance(state, 1, { ...DEFAULT_PARTICLE, modelRotate: true }).modelRotation, 0)
  state = playParticleTimeline(state, DEFAULT_PARTICLE)
  assert.equal(state.phase, 'logo')
  const active = advance(playParticleTimeline(createParticleTimeline(), DEFAULT_PARTICLE), 1)
  assert.equal(advanceParticleTimeline(active, 0, DEFAULT_PARTICLE, true).phase, 'model')
})

test('duration is captured on play and frame delta is bounded', () => {
  const start = playParticleTimeline(createParticleTimeline(), { ...DEFAULT_PARTICLE, duration: 2 })
  assert.equal(advanceParticleTimeline(start, 100, DEFAULT_PARTICLE).progress, 0.025)
  assert.equal(advanceParticleTimeline(start, -10, DEFAULT_PARTICLE).progress, 0)
  assert.equal(advance(start, 2, { ...DEFAULT_PARTICLE, duration: 10 }).phase, 'model')
})

test('snapshot retains replay anchors and uniform values preserve color, light and pose conventions', () => {
  const state = advance(playParticleTimeline(advance(createParticleTimeline(), 0.2), DEFAULT_PARTICLE), DEFAULT_PARTICLE.duration)
  const snapshot = particleSnapshot(state)
  assert.equal(snapshot.anchorFloat, state.anchorFloat)
  assert.equal(snapshot.idleElapsed, state.idleElapsed)
  assert.equal(snapshot.transitionDuration, DEFAULT_PARTICLE.duration)
  const uniform = buildParticleUniformValues({
    settings: { ...DEFAULT_PARTICLE, color: '#123456', highlightColor: '#fedcba', rotationAxis: 'z' },
    view: { ...DEFAULT_VIEW, rotationX: 90, scale: 2 }, snapshot,
    lighting: { ...DEFAULT_LIGHTING, ambient: { ...DEFAULT_LIGHTING.ambient, enabled: false } }, pixelRatio: 2,
  })
  assert.deepEqual(uniform.color, [18 / 255, 52 / 255, 86 / 255])
  assert.deepEqual(uniform.highlightColor, [254 / 255, 220 / 255, 186 / 255])
  assert.deepEqual(uniform.rotationAxis, [0, 0, 1])
  assert.deepEqual(uniform.ambientLightColor, [0, 0, 0])
  assert.equal(uniform.targetPose[0], 1)
  assert.equal(uniform.targetPose[6], 1)
  assert.equal(uniform.size, DEFAULT_PARTICLE.size)
  assert.equal(uniform.pixelRatio, 2)
  assert.equal(uniform.morph, 1)
})


test('morph begins at the selected eased angle, defaults to 35 degrees and stays reversible', () => {
  assert.equal(DEFAULT_PARTICLE.floatSpeed, 0.35)
  for (const angle of [0, 35, 90, 105, 120, 180, 300]) {
    const start = Math.acos(1-angle/180)/Math.PI
    assert.equal(sampleParticleTimeline('to-model', start, angle).morph, 0)
    assert.ok(Math.abs(sampleParticleTimeline('to-model', start, angle).turnAngle-angle*Math.PI/180)<1e-12)
    assert.ok(sampleParticleTimeline('to-model', start+.01, angle).morph>0)
    for (const p of [.2,.5,.8]) assert.deepEqual(sampleParticleTimeline('to-logo',p,angle),sampleParticleTimeline('to-model',1-p,angle))
  }
  assert.ok(sampleParticleTimeline('to-model',.5).morph>0)
})

test('logo drift uses the captured idle clock and reduced motion disables it', () => {
  const snapshot = advance(createParticleTimeline(), .5)
  const input = { settings: DEFAULT_PARTICLE, view: DEFAULT_VIEW, snapshot, lighting: DEFAULT_LIGHTING, pixelRatio: 1 }
  assert.equal(buildParticleUniformValues(input).idleTime, snapshot.idleElapsed)
  assert.equal(buildParticleUniformValues(input).driftAmplitude, .055)
  assert.equal(buildParticleUniformValues({...input,snapshot:{...snapshot,reducedMotion:true}}).driftAmplitude, 0)
  const moving = advance(playParticleTimeline(snapshot, DEFAULT_PARTICLE), 1)
  assert.equal(moving.idleElapsed, snapshot.idleElapsed)
})
