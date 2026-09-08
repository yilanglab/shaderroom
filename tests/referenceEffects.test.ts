import test from 'node:test'
import * as THREE from 'three'
import assert from 'node:assert/strict'
import { DEFAULT_REFERENCE, REFERENCE_IDS, REFERENCE_RECIPE, buildReferenceUniforms, buildWordAtlasRecipe, isReferenceShader, createReferenceMaterial, updateReferenceMaterial, disposeReferenceMaterial } from '../src/render/referenceEffects'

test('reference uniform snapshots use CSS size and frozen animation time, colors are display RGB', () => {
  const state = { time: 2.25, viewport: { width: 900, height: 600, pixelRatio: 2 } }
  const settings = { ...DEFAULT_REFERENCE, pixelColor: '#ff8000', speed: 4 }
  const values = buildReferenceUniforms('pixel-glyph', settings, state)
  assert.deepEqual(values.resolution, [900, 600]); assert.equal(values.tick, 9)
  assert.deepEqual(values.pixelColor, [1, 128 / 255, 0])
  assert.ok(!('wordVocabulary' in values)); assert.ok(!('animate' in values))
  for (const [i, id] of REFERENCE_IDS.entries()) assert.equal(buildReferenceUniforms(id, settings, state).mode, i)
  assert.equal(isReferenceShader('original'), false); assert.equal(isReferenceShader('glyph-matrix'), true)
})
test('word atlas sanitizes and bounds local vocabulary with deterministic layout', () => {
  assert.deepEqual(buildWordAtlasRecipe('one, two，three\nfour').words, ['one', 'two', 'three', 'four'])
  assert.deepEqual(buildWordAtlasRecipe('  ').words, ['pixel'])
  const input = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ')
  const recipe = buildWordAtlasRecipe(input)
  assert.equal(recipe.words.length, 64); assert.equal(recipe.width, recipe.columns * recipe.cellWidth)
  assert.equal(recipe.height, recipe.rows * recipe.cellHeight)
  assert.deepEqual(recipe, buildWordAtlasRecipe(input))
  assert.equal(Array.from(buildWordAtlasRecipe('😀'.repeat(30)).words[0]).length, 24)
  assert.equal(REFERENCE_RECIPE.atlas.flipY, false)
})

test('live material receives the same exported uniforms and retains input texture', () => {
  const texture = new THREE.Texture()
  const material = createReferenceMaterial(texture)
  const state = { time: 1, viewport: { width: 1280, height: 720, pixelRatio: 2 } }
  updateReferenceMaterial(material, DEFAULT_REFERENCE, 'glyph-matrix', state)
  assert.equal(material.uniforms.tDiffuse.value, texture)
  assert.deepEqual(material.uniforms.resolution.value.toArray(), [1280, 720])
  const values = buildReferenceUniforms('glyph-matrix', DEFAULT_REFERENCE, state)
  assert.deepEqual(material.uniforms.glyphColor.value.toArray(), values.glyphColor)
  const sizeUniform = material.uniforms.glyphSize
  updateReferenceMaterial(material, { ...DEFAULT_REFERENCE, glyphSize: 10 }, 'pixel-glyph', state)
  assert.equal(material.uniforms.glyphSize, sizeUniform)
  assert.equal(sizeUniform.value, 10); assert.equal(material.uniforms.mode.value, 3)
  assert.equal(material.blending, THREE.NoBlending)
  disposeReferenceMaterial(material); texture.dispose()
})
