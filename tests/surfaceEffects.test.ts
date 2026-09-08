import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { DEFAULT_LIGHTING } from '../src/defaults'
import { advanceDissolve, playDissolve, createDissolve, buildSurfaceUniforms, DEFAULT_SURFACE } from '../src/render/surfaceEffects'
import type { SceneSnapshot } from '../src/types'

test('dissolve reaches exact endpoints, reverses and ignores duplicate playback', () => {
  let state = playDissolve(createDissolve(), 1.8)
  assert.equal(playDissolve(state, 4), state)
  for (let i=0;i<36;i++) state=advanceDissolve(state,.05)
  assert.equal(state.progress,1)
  assert.equal(state.playing,false)
  state=playDissolve(state,1.8)
  for (let i=0;i<18;i++) state=advanceDissolve(state,.05)
  assert.ok(Math.abs(state.progress-.5)<1e-9)
  for (let i=0;i<18;i++) state=advanceDissolve(state,.05)
  assert.equal(state.progress,0)
  assert.equal(state.playing,false)
})
test('manual seek, partial duration, frame cap and reduced motion are deterministic', () => {
  const partial=playDissolve(createDissolve(.5),2)
  assert.equal(partial.duration,1)
  assert.deepEqual(advanceDissolve(partial,10),advanceDissolve(partial,.05))
  assert.deepEqual(advanceDissolve(partial,NaN),partial)
  assert.equal(playDissolve(createDissolve(),2,true).progress,1)
  assert.equal(advanceDissolve(partial,0,true).progress,1)
  assert.equal(createDissolve(.4).playing,false)
})
test('surface uniforms undo outer pose and keep lights in view space with exact palette channels', () => {
  const pose=new THREE.Matrix4().compose(new THREE.Vector3(1,2,3),new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,.7,.1)),new THREE.Vector3(2,2,2))
  const scene: SceneSnapshot={camera:{position:[0,0,10],target:[0,0,0],fov:30,near:.1,far:100},model:{position:[1,2,3],rotation:[.3,.7,.1],scale:[2,2,2]},viewport:{width:100,height:100,pixelRatio:2}}
  const values=buildSurfaceUniforms('hologram',{...DEFAULT_SURFACE,hologramColor:'#ff8000'},{time:2.123456789,dissolve:createDissolve(.45)},DEFAULT_LIGHTING,scene)
  const identity=new THREE.Matrix4().fromArray(values.worldToPose as number[]).multiply(pose)
  assert.ok(identity.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-12))
  assert.deepEqual(values.hologramColor,[1,128/255,0])
  assert.equal(values.time,2.123456789)
  const rotated=buildSurfaceUniforms('hologram',DEFAULT_SURFACE,{time:0,dissolve:createDissolve()},DEFAULT_LIGHTING,{...scene,camera:{...scene.camera,position:[10,0,0]}})
  assert.deepEqual(values.keyLightDirection,rotated.keyLightDirection)
})
