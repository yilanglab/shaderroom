import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_LIGHTING } from '../src/defaults'
import { buildLightRecipe, directionalLightPosition, displaySrgbVector, DIRECTIONAL_LIGHT_RADIUS } from '../src/render/lighting'

function closeVector(actual: number[], expected: number[]) {
  assert.equal(actual.length, expected.length)
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-12, `component ${index}: ${value} vs ${expected[index]}`))
}

test('default lights retain the original Claw directions, colors and strength', () => {
  const [ambient, key, fill] = buildLightRecipe(DEFAULT_LIGHTING)
  assert.deepEqual(ambient, { id: 'ambient', type: 'AmbientLight', color: '#ffffff', intensity: 1.5 })
  closeVector(key.position, [5, 5, 5])
  closeVector(fill.position, [-5, -5, -5])
  assert.equal(key.color, '#ffffff')
  assert.equal(key.intensity, 3)
  assert.equal(fill.color, '#aabbff')
  assert.equal(fill.intensity, 1.5)
  assert.deepEqual(key.target, [0, 0, 0])
  assert.deepEqual(fill.target, [0, 0, 0])
})

test('azimuth and elevation obey Y-up cardinal directions and preserve radius', () => {
  closeVector(directionalLightPosition(0, 0), [0, 0, DIRECTIONAL_LIGHT_RADIUS])
  closeVector(directionalLightPosition(90, 0), [DIRECTIONAL_LIGHT_RADIUS, 0, 0])
  closeVector(directionalLightPosition(-90, 0), [-DIRECTIONAL_LIGHT_RADIUS, 0, 0])
  closeVector(directionalLightPosition(0, 90), [0, DIRECTIONAL_LIGHT_RADIUS, 0])
  closeVector(directionalLightPosition(0, -90), [0, -DIRECTIONAL_LIGHT_RADIUS, 0])
  for (const [azimuth, elevation] of [[-173.125, 67.5], [22.5, -43.75], [0, 0]]) {
    const position = directionalLightPosition(azimuth, elevation)
    assert.ok(Math.abs(Math.hypot(...position) - DIRECTIONAL_LIGHT_RADIUS) < 1e-12)
    closeVector(directionalLightPosition(azimuth + 360, elevation), position)
  }
})

test('disabled lights emit zero while preserving user values for re-enabling', () => {
  const settings = structuredClone(DEFAULT_LIGHTING)
  settings.ambient = { enabled: false, color: '#123456', intensity: 4.125 }
  settings.key = { enabled: false, color: '#abcdef', intensity: 7.125, azimuth: 123.45, elevation: -12.75 }
  settings.fill = { enabled: true, color: '#000000', intensity: 0, azimuth: -75, elevation: 8 }
  const before = structuredClone(settings)
  const result = buildLightRecipe(settings)
  assert.deepEqual(result.map(light => light.intensity), [0, 0, 0])
  assert.deepEqual(result.map(light => light.color), ['#123456', '#abcdef', '#000000'])
  assert.deepEqual(settings, before)
  settings.ambient.enabled = true
  settings.key.enabled = true
  assert.deepEqual(buildLightRecipe(settings).map(light => light.intensity), [4.125, 7.125, 0])
  result[1].position[0] = 999
  assert.notEqual(buildLightRecipe(settings)[1].position[0], 999)
})

test('display color vectors preserve exact UI sRGB channels without linearization', () => {
  assert.deepEqual(displaySrgbVector('#233140'), [35 / 255, 49 / 255, 64 / 255])
  assert.deepEqual(displaySrgbVector('#8cc4ff'), [140 / 255, 196 / 255, 1])
  assert.deepEqual(displaySrgbVector('#808080'), [128 / 255, 128 / 255, 128 / 255])
  assert.deepEqual(displaySrgbVector('#000000'), [0, 0, 0])
  assert.deepEqual(displaySrgbVector('#FFFFFF'), [1, 1, 1])
})

test('studio light directions stay fixed in camera space as the camera orbits', async () => {
  const THREE = await import('three')
  const { buildViewLightRecipe } = await import('../src/render/lighting')
  const settings = DEFAULT_LIGHTING
  const base = buildLightRecipe(settings)
  for (const position of [[0,0,10], [10,2,0], [-4,6,-8]]) {
    const target = [1,-1,2]
    const rotation = new THREE.Matrix4().lookAt(new THREE.Vector3(...position),new THREE.Vector3(...target),new THREE.Vector3(0,1,0))
    const resolved = buildViewLightRecipe(settings,{position,target})
    for (const index of [1,2] as const) {
      const local = new THREE.Vector3(...resolved[index].position).sub(new THREE.Vector3(...target)).applyMatrix4(rotation.clone().invert())
      assert.ok(local.distanceTo(new THREE.Vector3(...base[index].position)) < 1e-10)
    }
  }
})
