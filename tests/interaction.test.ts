import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_PARAMS, DEFAULT_PARTICLE, DEFAULT_VIEW } from '../src/defaults'
import { buildExportDocument, buildExportSpec } from '../src/lib/export'
import { buildPrompt } from '../src/lib/prompt'
import { DEFAULT_INTERACTION, INTERACTIVE_IDS, NEW_INTERACTIVE_IDS, interactionUniforms, supportsInteraction, updateInteractionUniforms } from '../src/render/interaction'
import { INTERACTIVE_POST_VERTEX, INTERACTIVE_POST_FRAGMENT, INTERACTIVE_MESH_VERTEX, INTERACTIVE_MESH_FRAGMENT } from '../src/render/interactiveEffects'
import { DEFAULT_REFERENCE } from '../src/render/referenceEffects'
import { DEFAULT_SURFACE } from '../src/render/surfaceEffects'
import type { ExportInput } from '../src/types'

function input(shader: ExportInput['shader'] = 'lens-distortion'): ExportInput {
  return {
    scope: 'shader', format: 'json', shader,
    model: { id: 'test', name: 'test.glb', kind: 'glb', source: 'upload', fileName: 'test.glb', url: 'blob:private-local-only' },
    params: { ...DEFAULT_PARAMS }, particle: { ...DEFAULT_PARTICLE },
    reference: { ...DEFAULT_REFERENCE }, surface: { ...DEFAULT_SURFACE }, stats: null,
    background: { ...DEFAULT_BACKGROUND }, lighting: structuredClone(DEFAULT_LIGHTING), view: { ...DEFAULT_VIEW },
    interaction: { ...DEFAULT_INTERACTION, radius: 153.125, follow: .17, enabled: true },
    snapshot: {
      camera: { position: [0, 0, 10], target: [0, 0, 0], fov: 30, near: .1, far: 100 },
      model: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      viewport: { width: 901, height: 701, pixelRatio: 2 },
      interaction: { pointer: [.23, .78], velocity: [.14, -.25], amount: .7125, time: 12.123456789 },
      ...(shader === 'particle-morph' ? { particle: {
        phase: 'logo' as const, progress: 0, ready: true, elapsed: 0, idleElapsed: 0,
        modelRotation: 0, floatOffset: 0, anchorFloat: 0, anchorModelRotation: 0,
        transitionDuration: 1.5, reducedMotion: false,
      } } : {}),
    },
  }
}

test('interaction availability covers requested effects and excludes deferred materials', () => {
  assert.equal(NEW_INTERACTIVE_IDS.length, 6)
  assert.equal(INTERACTIVE_IDS.length, 12)
  for (const id of ['original', 'toon', 'cross-stitch', 'engraving', 'iridescent', 'dissolve', 'comic-line', 'pixelate', 'pixel-glyph', 'word-mosaic']) {
    assert.equal(supportsInteraction(id), false)
    assert.equal('interaction' in buildExportSpec(input(id as Parameters<typeof input>[0])), false)
  }
  for (const id of INTERACTIVE_IDS) assert.equal(supportsInteraction(id), true)
  assert.equal(DEFAULT_INTERACTION.enabled, true)
})

test('live interaction uniforms preserve CSS pixel units and normalized pointer across high DPR', () => {
  const source = input()
  const material = new THREE.ShaderMaterial({ uniforms: interactionUniforms() })
  updateInteractionUniforms(material, source.interaction!, source.snapshot.interaction!, 901, 701)
  assert.deepEqual(material.uniforms.uInteractionResolution.value.toArray(), [901, 701])
  assert.deepEqual(material.uniforms.uPointer.value.toArray(), [.23, .78])
  assert.deepEqual(material.uniforms.uVelocity.value.toArray(), [.14, -.25])
  assert.equal(material.uniforms.uRadius.value, 153.125)
  assert.equal(material.uniforms.uHover.value, .7125)
  assert.equal(material.uniforms.uInteractionTime.value, 12.123456789)
  material.dispose()
})

test('all six new effects export their actual renderer sources and original-material or mesh recipe', () => {
  for (const id of NEW_INTERACTIVE_IDS) {
    const source = input(id)
    const spec = JSON.parse(buildExportDocument(source).content)
    const mesh = ['magnetic-pull', 'material-reveal', 'elastic-indent'].includes(id)
    assert.equal(spec.effect.renderPath, mesh ? 'interactive-direct-mesh' : 'interactive-original-material-postprocess')
    assert.equal(spec.shaders.vertex, mesh ? INTERACTIVE_MESH_VERTEX : INTERACTIVE_POST_VERTEX)
    assert.equal(spec.shaders.fragment, mesh ? INTERACTIVE_MESH_FRAGMENT : INTERACTIVE_POST_FRAGMENT)
    assert.ok(spec.interactiveEffectRecipe)
    assert.ok(spec.sceneRecipe.loaders)
    assert.ok(spec.sceneRecipe.normalization)
    assert.equal(spec.sceneRecipe.material.type, mesh ? 'ShaderMaterial' : 'original imported materials')
    assert.equal(spec.model.binaryIncluded, false)
    assert.equal(spec.model.url, undefined)
    assert.deepEqual(spec.interaction.settings, source.interaction)
    assert.deepEqual(spec.interaction.snapshot, source.snapshot.interaction)
    assert.deepEqual(spec.uniforms.uInteractionResolution, [901, 701])
    assert.equal(spec.uniforms.uRadius, 153.125)
    assert.equal(spec.uniforms.uHover, .7125)
    assert.match(spec.interaction.recipe.coordinateSpace, /bottom-left/)
    assert.match(spec.interaction.recipe.smoothing, /Reduced motion/)
    assert.match(spec.interaction.recipe.input, /pointerdown/)
    const md = buildExportDocument({ ...source, format: 'md' }).content
    assert.match(md, /interactive-original-material-postprocess/)
    assert.match(md, /interactive-direct-mesh/)
    assert.match(md, /减少动态效果/)
  }
})

test('background-only strips interaction while both and effect-only preserve executable hover contract', () => {
  for (const id of INTERACTIVE_IDS) {
  const source = input(id as ExportInput['shader'])
  const background = buildExportSpec({ ...source, scope: 'background' })
  assert.equal('interaction' in background, false)
  assert.equal('shaders' in background, false)
  assert.equal('model' in background, false)
  assert.doesNotMatch(buildPrompt(source, 'background'), /uPointer|interactiveEffectRecipe/)
  for (const scope of ['both', 'effect'] as const) {
    const prompt = buildPrompt(source, scope)
    assert.match(prompt, /"interaction"/)
    if ((NEW_INTERACTIVE_IDS as readonly string[]).includes(id)) assert.match(prompt, /"interactiveEffectRecipe"/)
    assert.match(prompt, /uPointer/)
    if (scope === 'effect') assert.doesNotMatch(prompt, /"background":/)
  }
  }
})

test('existing hover effects preserve disabled state and the precise fading displacement snapshot', () => {
  for (const shader of ['particle-morph', 'ascii', 'halftone', 'hologram', 'adaptive-grid', 'glyph-matrix'] as const) {
    const source = input(shader)
    source.interaction!.enabled = false
    const result = JSON.parse(buildExportDocument(source).content)
    assert.equal(result.interaction.settings.enabled, false)
    assert.equal(result.uniforms.uHover, .7125)
    assert.equal(result.interaction.snapshot.amount, .7125)
    assert.match(shader === 'particle-morph' ? result.glsl.vertex : (result.shaders ?? result.glsl).fragment, /uPointer/)
  }
  const legacy = input('ascii')
  delete legacy.interaction
  assert.equal('interaction' in buildExportSpec(legacy), false)
  assert.equal('interaction' in buildExportSpec(input('iridescent')), false)
})
