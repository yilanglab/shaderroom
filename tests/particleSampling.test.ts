import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { sampleLogo, sampleModel, PARTICLE_SAMPLE_SEED, PARTICLE_SAMPLING_RECIPE } from '../src/render/particleSampling'
import { AMS_LOGO_META, AMS_LOGO_SVG } from '../src/render/particleLogo'

function geometry(vertices: number[], indices?: number[]) {
  const result = new THREE.BufferGeometry()
  result.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  if (indices) result.setIndex(indices)
  return result
}

function mesh(vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0]) {
  return new THREE.Mesh(geometry(vertices), new THREE.MeshBasicMaterial())
}

function near(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

test('logo source, public asset and SHA256 preserve the provided SVG exactly', () => {
  const asset = readFileSync(new URL('../public/assets/ams-logo.svg', import.meta.url))
  assert.equal(asset.toString('utf8'), AMS_LOGO_SVG)
  assert.equal(createHash('sha256').update(asset).digest('hex'), AMS_LOGO_META.sha256)
  assert.deepEqual(AMS_LOGO_META.viewBox, [0, 0, 357, 200])
  assert.equal((AMS_LOGO_SVG.match(/<path\s/g) ?? []).length, 8)
  assert.equal(PARTICLE_SAMPLING_RECIPE.seed, PARTICLE_SAMPLE_SEED)
})

test('surface sampling is deterministic by seed and uniformly distributed within triangles', () => {
  const model = mesh()
  const sample = sampleModel(model, 12_000)
  assert.deepEqual(sample, sampleModel(model, 12_000))
  assert.notDeepEqual(sample.positions, sampleModel(model, 12_000, 42).positions)
  let x = 0, y = 0
  for (let offset = 0; offset < sample.positions.length; offset += 3) {
    const px = sample.positions[offset], py = sample.positions[offset + 1]
    assert.ok(px >= 0 && py >= 0 && px + py <= 1.000001)
    assert.equal(sample.positions[offset + 2], 0)
    assert.deepEqual(Array.from(sample.normals.slice(offset, offset + 3)), [0, 0, 1])
    x += px; y += py
  }
  near(x / 12_000, 1 / 3, 0.008)
  near(y / 12_000, 1 / 3, 0.008)
})

test('triangles receive points proportional to their surface areas, not vertex counts', () => {
  const model = mesh([0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 12, 0, 0, 10, 2, 0])
  const { positions } = sampleModel(model, 12_000)
  let large = 0
  for (let offset = 0; offset < positions.length; offset += 3) if (positions[offset] > 5) large++
  near(large / 12_000, 0.8, 0.012)
})

test('sampling retains the normalized root transform and excludes parent translation, rotation and scale', () => {
  const root = new THREE.Group()
  const model = mesh()
  model.rotation.y = 0.6
  model.position.set(0.2, 0.3, -0.4)
  root.add(model)
  root.scale.set(2, 2, 2)
  root.position.set(1, -1, 0.5)
  const before = sampleModel(root, 120)
  const pose = new THREE.Group()
  pose.position.set(13, -17, 31)
  pose.rotation.set(0.6, -1.2, 2)
  pose.scale.setScalar(1.8)
  pose.add(root)
  const after = sampleModel(root, 120)
  for (let index = 0; index < before.positions.length; index++) {
    near(after.positions[index], before.positions[index])
    near(after.normals[index], before.normals[index])
  }
  near(after.normals[0], Math.sin(0.6))
  near(after.normals[1], 0)
  near(after.normals[2], Math.cos(0.6))
})

test('world area accounts for a non-uniform parent scale while output remains parent-local', () => {
  const root = new THREE.Group()
  root.add(mesh([5, 0, 0, 6, 0, 0, 5, 1, 0]))
  root.add(mesh([0, 0, 0, 0, 1, 0, 0, 0, 1]))
  const pose = new THREE.Group()
  pose.scale.set(4, 1, 1)
  pose.add(root)
  const { positions } = sampleModel(root, 12_000)
  let xy = 0
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (positions[offset] > 4) {
      xy++
      assert.ok(positions[offset] <= 6)
    } else assert.equal(positions[offset], 0)
  }
  near(xy / 12_000, 0.8, 0.012)
})

test('indexed geometry, visible material groups and draw ranges match rendered surfaces', () => {
  const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 11, 0, 0, 10, 1, 0]
  const shape = geometry(vertices, [0, 1, 2, 3, 4, 5])
  shape.addGroup(0, 3, 0)
  shape.addGroup(3, 3, 1)
  const hidden = new THREE.MeshBasicMaterial()
  hidden.visible = false
  const visible = new THREE.MeshBasicMaterial()
  const model = new THREE.Mesh(shape, [hidden, visible])
  let sample = sampleModel(model, 50)
  for (let offset = 0; offset < sample.positions.length; offset += 3) assert.ok(sample.positions[offset] >= 10)
  hidden.visible = true
  shape.setDrawRange(0, 3)
  sample = sampleModel(model, 50)
  for (let offset = 0; offset < sample.positions.length; offset += 3) assert.ok(sample.positions[offset] <= 1)
  assert.deepEqual(sample, sampleModel(mesh(), 50))
})

test('hidden meshes and hidden descendants do not contribute particle positions', () => {
  const root = new THREE.Group()
  const visible = mesh()
  const hidden = new THREE.Group()
  hidden.visible = false
  hidden.add(mesh([10, 0, 0, 11, 0, 0, 10, 1, 0]))
  root.add(visible, hidden)
  assert.deepEqual(sampleModel(root, 20), sampleModel(visible, 20))
  root.visible = false
  assert.throws(() => sampleModel(root, 20), /没有可采样的有效三角形/)
})

test('static morph targets are sampled through Mesh.getVertexPosition', () => {
  const model = mesh()
  model.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 2, 1, 0, 2, 0, 1, 2], 3)]
  model.updateMorphTargets()
  model.morphTargetInfluences![0] = 0.5
  const { positions } = sampleModel(model, 30)
  for (let offset = 0; offset < positions.length; offset += 3) assert.equal(positions[offset + 2], 1)
})

test('static skeletal pose and instance transforms are included', () => {
  const shape = geometry([0, 0, 0, 1, 0, 0, 0, 1, 0])
  shape.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4))
  shape.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const skinned = new THREE.SkinnedMesh(shape, new THREE.MeshBasicMaterial())
  const bone = new THREE.Bone()
  skinned.add(bone)
  skinned.bind(new THREE.Skeleton([bone]))
  bone.position.z = 2
  const sample = sampleModel(skinned, 30)
  for (let offset = 0; offset < sample.positions.length; offset += 3) assert.equal(sample.positions[offset + 2], 2)
  const instanced = new THREE.InstancedMesh(shape, new THREE.MeshBasicMaterial(), 2)
  instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 3))
  instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 5))
  const instances = sampleModel(instanced, 100)
  const heights = new Set<number>()
  for (let offset = 0; offset < instances.positions.length; offset += 3) heights.add(instances.positions[offset + 2])
  assert.deepEqual([...heights].sort(), [3, 5])
})

test('invalid indices, non-finite and degenerate triangles are skipped with a clear empty-surface error', () => {
  const model = mesh()
  model.geometry.setIndex([0, 1, 99, 0, 1, 2])
  assert.deepEqual(sampleModel(model, 20), sampleModel(mesh(), 20))
  model.geometry.setIndex([0, 1, 99])
  assert.throws(() => sampleModel(model, 20), /没有可采样的有效三角形/)
  assert.throws(() => sampleModel(mesh([0, 0, 0, 0, 0, 0, 0, 0, 0]), 20), /没有可采样/)
  assert.throws(() => sampleModel(mesh([0, 0, 0, NaN, 0, 0, 0, 1, 0]), 20), /没有可采样/)
  assert.throws(() => sampleModel(new THREE.Mesh(new THREE.BufferGeometry()), 20), /没有可采样/)
})

test('invalid counts, seeds and singular parent transforms fail explicitly', () => {
  for (const count of [0, -1, 1.2, Infinity, NaN, 1_000_001]) {
    assert.throws(() => sampleModel(mesh(), count), /粒子数量/)
    assert.throws(() => sampleLogo(AMS_LOGO_SVG, count), /粒子数量/)
  }
  assert.throws(() => sampleModel(mesh(), 20, NaN), /采样种子/)
  const pose = new THREE.Group()
  const root = mesh()
  pose.scale.set(0, 1, 1)
  pose.add(root)
  assert.throws(() => sampleModel(root, 20), /父级变换不可逆/)
  if (typeof DOMParser === 'undefined') assert.throws(() => sampleLogo(AMS_LOGO_SVG, 20), /DOMParser/)
})
