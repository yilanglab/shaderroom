import { DEFAULT_REFERENCE } from '../src/render/referenceEffects'
import { DEFAULT_SURFACE } from '../src/render/surfaceEffects'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as THREE from 'three'
import { DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_PARAMS, DEFAULT_PARTICLE, DEFAULT_VIEW } from '../src/defaults'
import { buildExportDocument, buildExportSpec } from '../src/lib/export'
import { buildLightRecipe, LIGHTING_CONVENTIONS } from '../src/render/lighting'
import { AMS_LOGO_META, AMS_LOGO_SVG } from '../src/render/particleLogo'
import { PARTICLE_FRAGMENT_SHADER, PARTICLE_RECIPE, PARTICLE_VERTEX_SHADER } from '../src/render/particleMorph'
import { PARTICLE_SAMPLE_SEED, PARTICLE_SAMPLING_RECIPE, sampleModel } from '../src/render/particleSampling'
import { SCENE_RECIPE, SHADER_FRAGMENT, SHADER_MODES, SHADER_VERTEX } from '../src/render/shaders'
import type { ExportInput, LightingSettings, ParticleSnapshot } from '../src/types'

function customLighting(): LightingSettings {
  return {
    ambient: { enabled: false, color: '#80c0ff', intensity: 0.65 },
    key: { enabled: true, color: '#ff8040', intensity: 2.75, azimuth: 90, elevation: 0 },
    fill: { enabled: true, color: '#204080', intensity: 0, azimuth: -20.125, elevation: 63.75 },
  }
}

function input(patch: Partial<ExportInput> = {}): ExportInput {
  return {
    scope: 'shader', format: 'json', shader: 'cross-stitch',
    model: { id: 'upload-test', name: '测试模型', kind: 'glb', source: 'upload', fileName: '测试模型.glb', fileSize: 412, sha256: 'a'.repeat(64), url: 'blob:private-upload', thumbnail: 'data:image/png;base64,private-thumbnail' },
    params: { ...DEFAULT_PARAMS, gridSize: 12.125, thickness: 0, contrast: 1.123456789123 },
    background: { ...DEFAULT_BACKGROUND, grid: true },
    lighting: structuredClone(DEFAULT_LIGHTING),
    view: { ...DEFAULT_VIEW, scale: 1.37, rotationX: 32 },
    reference: { ...DEFAULT_REFERENCE },
    surface: { ...DEFAULT_SURFACE },
    particle: { ...DEFAULT_PARTICLE },
    snapshot: {
      camera: { position: [2.345678901, 1, 12], target: [0.1, -0.2, 0], fov: 30, near: 0.1, far: 100 },
      model: { position: [0, 0, 0], rotation: [0.5585053606381855, 4.981123456789, 0], scale: [1.37, 1.37, 1.37] },
      viewport: { width: 1001, height: 801, pixelRatio: 1.25 },
    },
    stats: { meshes: 1, triangles: 4, animations: 0 },
    ...patch,
  }
}

function particleInput(phase: ParticleSnapshot['phase'] = 'logo'): ExportInput {
  const source = input({ shader: 'particle-morph', lighting: customLighting() })
  source.particle = { ...DEFAULT_PARTICLE, count: 12000, duration: 3.1234567890123, rotationAxis: 'z', modelRotate: true, modelRotateSpeed: 0.2134567890123, color: '#1234ab', highlightColor: '#fedcba' }
  source.snapshot.model.rotation = [0, 0, 0]
  source.snapshot.particle = {
    phase, progress: phase === 'model' ? 1 : 0, ready: true,
    elapsed: 13.1234567890123, idleElapsed: 7.1234567890123,
    modelRotation: phase === 'model' ? 8.91234567890123 : 0,
    floatOffset: phase === 'logo' ? 0.05234567890123 : 0,
    anchorFloat: 0.05234567890123, anchorModelRotation: 0, transitionDuration: 4.1234567890123,
    reducedMotion: false,
  }
  return source
}

test('shader JSON preserves captured state, complete sources, dependencies and reproducible uniforms', () => {
  const source = input()
  const document = buildExportDocument(source)
  const result = JSON.parse(document.content)
  assert.equal(document.fileName, 'shader-room-shader-cross-stitch.json')
  assert.match(document.mimeType, /application\/json/)
  assert.equal(result.schemaVersion, '1.2.0')
  assert.ok(Number.isFinite(Date.parse(result.generatedAt)))
  assert.deepEqual(result.parameters, source.params)
  assert.deepEqual(result.snapshot, source.snapshot)
  assert.deepEqual(result.view, source.view)
  assert.deepEqual(result.background.settings, source.background)
  assert.deepEqual(result.uniforms.resolution, [1251, 1001])
  assert.equal(result.uniforms.mode, SHADER_MODES['cross-stitch'])
  assert.deepEqual(result.uniforms.lightColor, [140 / 255, 196 / 255, 1])
  assert.deepEqual(result.uniforms.shadowColor, [35 / 255, 49 / 255, 64 / 255])
  assert.deepEqual(result.uniforms.highlightColor, [1, 1, 1])
  assert.equal(result.uniforms.thickness, 0)
  assert.equal(result.glsl.vertex, SHADER_VERTEX)
  assert.equal(result.glsl.fragment, SHADER_FRAGMENT)
  assert.match(result.glsl.fragment, /uniform vec3 shadowColor;/)
  assert.match(result.glsl.fragment, /mix\(shadowColor, highlightColor, value\)/)
  assert.deepEqual(result.sceneRecipe, SCENE_RECIPE)
  assert.equal(result.sceneRecipe.controls.enableZoom, false)
  assert.equal(result.sceneRecipe.controls.touches.TWO, null)
  assert.equal(result.sceneRecipe.controls.minDistance, result.sceneRecipe.controls.maxDistance)
  assert.deepEqual([result.sceneRecipe.modelZoom.min, result.sceneRecipe.modelZoom.max, result.sceneRecipe.modelZoom.step], [0.4, 2, 0.01])
  assert.match(result.units.scale, /shared by canvas wheel, two-touch pinch and the panel/)
  assert.deepEqual(result.lighting.settings, source.lighting)
  assert.deepEqual(result.lighting.lights, result.sceneRecipe.lights)
  assert.deepEqual(result.lighting.conventions, LIGHTING_CONVENTIONS)
  assert.equal(result.sceneRecipe.loaders.draco.localFiles.length + result.sceneRecipe.loaders.ktx2.localFiles.length, 5)
  assert.match(result.reproduction.loaderPolicy, /detectSupport\(renderer\)/)
  assert.equal(result.dependencies.three, '0.183.2')
  assert.equal(result.model.fileName, source.model.fileName)
  assert.equal(result.model.fileSizeBytes, source.model.fileSize)
  assert.equal(result.model.sha256, source.model.sha256)
  assert.equal(result.model.attachmentRequired, true)
  assert.equal(result.model.binaryIncluded, false)
  assert.ok(!document.content.includes('blob:'))
  assert.ok(!document.content.includes('data:image'))
  assert.ok(!('url' in result.model))
  assert.ok(!('thumbnail' in result.model))
})

test('background export contains standalone CSS and current lighting without shader or model data', () => {
  const lighting = customLighting()
  const document = buildExportDocument(input({ scope: 'background', lighting }))
  const spec = JSON.parse(document.content)
  assert.equal(document.fileName, 'shader-room-background-grid.json')
  assert.equal(spec.scope, 'background')
  assert.equal(spec.schemaVersion, '1.2.0')
  assert.deepEqual(spec.lighting.settings, lighting)
  assert.deepEqual(spec.lighting.lights, buildLightRecipe(lighting))
  assert.deepEqual(spec.lighting.conventions, LIGHTING_CONVENTIONS)
  assert.deepEqual(spec.lighting.lights.map((light: { intensity: number }) => light.intensity), [0, 2.75, 0])
  assert.equal(spec.background.css.backgroundSize, '64px 64px')
  assert.equal(spec.background.css.backgroundColor, DEFAULT_BACKGROUND.color)
  assert.match(spec.background.css.backgroundImage, /rgba\(255, 255, 255, 0\.08\)/)
  assert.equal((spec.background.css.backgroundImage.match(/linear-gradient/g) ?? []).length, 2)
  assert.ok(!('model' in spec))
  assert.ok(!('glsl' in spec))
  assert.ok(!('sceneRecipe' in spec))
  const solid = JSON.parse(buildExportDocument(input({ scope: 'background', background: { ...DEFAULT_BACKGROUND, grid: false, gridOpacity: 0 } })).content)
  assert.equal(solid.background.css.backgroundImage, 'none')
  assert.equal(solid.background.settings.gridOpacity, 0)
})

test('shader exports the effective custom light recipe and retains disabled and zero-intensity settings', () => {
  const lighting = customLighting()
  const document = buildExportDocument(input({ lighting }))
  const spec = JSON.parse(document.content)
  assert.deepEqual(spec.lighting.settings, lighting)
  assert.deepEqual(spec.lighting.lights, buildLightRecipe(lighting))
  assert.deepEqual(spec.sceneRecipe.lights, spec.lighting.lights)
  assert.notDeepEqual(spec.sceneRecipe.lights, SCENE_RECIPE.lights)
  const [ambient, key, fill] = spec.sceneRecipe.lights
  assert.deepEqual(ambient, { id: 'ambient', type: 'AmbientLight', color: '#80c0ff', intensity: 0 })
  assert.equal(spec.lighting.settings.ambient.intensity, 0.65)
  assert.equal(spec.lighting.settings.ambient.enabled, false)
  assert.equal(key.color, '#ff8040')
  assert.equal(key.intensity, 2.75)
  assert.equal(key.position[1], 0)
  assert.ok(key.position[0] > 0)
  assert.ok(Math.abs(key.position[2]) < 1e-12)
  assert.deepEqual(key.target, [0, 0, 0])
  assert.equal(fill.intensity, 0)
  assert.equal(spec.lighting.settings.fill.enabled, true)
  assert.equal(spec.lighting.settings.fill.azimuth, -20.125)
  assert.match(spec.reproduction.lightingPolicy, /THREE\.DirectionalLight/)
  assert.match(spec.reproduction.lightingPolicy, /sRGB to linear/)
})

test('both export scopes take an independent snapshot of every light setting', () => {
  for (const scope of ['shader', 'background'] as const) {
    const lighting = customLighting()
    const expected = structuredClone(lighting)
    const spec = buildExportSpec(input({ scope, lighting }))
    lighting.ambient.color = '#000000'
    lighting.key.azimuth = 0
    lighting.fill.enabled = false
    assert.deepEqual(spec.lighting.settings, expected)
    spec.lighting.settings.ambient.intensity = 99
    spec.lighting.settings.key.intensity = 99
    spec.lighting.settings.fill.intensity = 99
    assert.deepEqual([lighting.ambient.intensity, lighting.key.intensity, lighting.fill.intensity], [0.65, 2.75, 0])
  }
})

test('all shader palette colors retain exact display-sRGB channels across colored and endpoint inputs', () => {
  for (const shader of ['cross-stitch', 'halftone', 'pixelate', 'toon'] as const) {
    const params = { ...DEFAULT_PARAMS, lightColor: '#1234ab', shadowColor: '#804020', highlightColor: '#fedcba' }
    const spec = JSON.parse(buildExportDocument(input({ shader, params })).content)
    assert.deepEqual(spec.uniforms.lightColor, [18 / 255, 52 / 255, 171 / 255])
    assert.deepEqual(spec.uniforms.shadowColor, [128 / 255, 64 / 255, 32 / 255])
    assert.deepEqual(spec.uniforms.highlightColor, [254 / 255, 220 / 255, 186 / 255])
    assert.deepEqual(spec.parameters, params)
    assert.match(spec.uniformConventions.colors, /HEX\/255/)
    assert.match(spec.uniformConventions.palette, /Cross-stitch preserves its threshold behavior/)
    assert.equal(spec.glsl.fragment, SHADER_FRAGMENT)
  }
  const endpoints = JSON.parse(buildExportDocument(input({ params: { ...DEFAULT_PARAMS, lightColor: '#000000', shadowColor: '#ffffff', highlightColor: '#00ff00' } })).content)
  assert.deepEqual(endpoints.uniforms.lightColor, [0, 0, 0])
  assert.deepEqual(endpoints.uniforms.shadowColor, [1, 1, 1])
  assert.deepEqual(endpoints.uniforms.highlightColor, [0, 1, 0])
})

test('original materials use the direct scene path and missing model hashes are not invented', () => {
  const result = JSON.parse(buildExportDocument(input({ shader: 'original', model: { id: 'claw', name: 'Claw', kind: 'glb', source: 'builtin', fileName: 'claw.glb', url: '/models/claw.glb' } })).content)
  assert.equal(result.effect.mode, 0)
  assert.equal(result.effect.renderPath, 'direct-scene-render')
  assert.equal(result.model.projectAssetPath, 'public/models/claw.glb')
  assert.ok(!('sha256' in result.model))
  assert.ok(!('fileSizeBytes' in result.model))
  assert.match(result.reproduction.renderPolicy, /original imported materials/)
})

test('Markdown includes a parseable full spec, GLSL and actionable reproduction instructions', () => {
  const document = buildExportDocument(input({ format: 'md' }))
  assert.match(document.mimeType, /text\/markdown/)
  assert.match(document.content, /RenderTarget/)
  assert.match(document.content, /全屏 quad/)
  assert.match(document.content, /XYZ 欧拉弧度/)
  assert.match(document.content, /GLB \/ FBX 二进制没有嵌入/)
  assert.match(document.content, /pixelRatio/)
  assert.match(document.content, /复制五个 Draco \/ Basis 解码文件到 public\/decoders/)
  assert.match(document.content, /同源本地路径/)
  assert.match(document.content, /THREE\.AmbientLight/)
  assert.match(document.content, /THREE\.DirectionalLight/)
  assert.match(document.content, /sRGB→linear/)
  assert.match(document.content, /lightColor \/ shadowColor \/ highlightColor/)
  assert.match(document.content, /mix\(shadowColor, highlightColor, value\)/)
  const specText = document.content.match(/```json\n([\s\S]*?)\n```/)?.[1]
  assert.ok(specText)
  const spec = JSON.parse(specText)
  assert.deepEqual(spec.snapshot, input().snapshot)
  assert.ok(document.content.includes(`\n${SHADER_VERTEX}\n`))
  assert.ok(document.content.includes(`\n${SHADER_FRAGMENT}\n`))
  const lighting = customLighting()
  const background = buildExportDocument(input({ scope: 'background', format: 'md', lighting }))
  assert.match(background.content, /```css/)
  assert.match(background.content, /background-size: 64px 64px/)
  assert.match(background.content, /THREE\.DirectionalLight/)
  assert.match(background.content, /sRGB→linear/)
  assert.match(background.content, /HEX\/255/)
  const backgroundSpecText = background.content.match(/```json\n([\s\S]*?)\n```/)?.[1]
  assert.ok(backgroundSpecText)
  const backgroundSpec = JSON.parse(backgroundSpecText)
  assert.deepEqual(backgroundSpec.lighting.settings, lighting)
  assert.deepEqual(backgroundSpec.lighting.lights, buildLightRecipe(lighting))
})

test('particle endpoint exports preserve independent Points uniforms, exact playback state and shared scale', () => {
  for (const phase of ['logo', 'model'] as const) {
    const source = particleInput(phase)
    const document = buildExportDocument(source)
    const spec = JSON.parse(document.content)
    assert.equal(document.fileName, 'shader-room-shader-particle-morph.json')
    assert.equal(spec.schemaVersion, '1.2.0')
    assert.equal(spec.effect.renderPath, 'direct-points-render')
    assert.ok(!('mode' in spec.effect))
    assert.ok(!('tDiffuse' in spec.uniforms))
    assert.ok(!('mode' in spec.uniforms))
    assert.ok(!('postProcessing' in spec.sceneRecipe))
    assert.ok(!('renderTarget' in spec.sceneRecipe.renderer))
    assert.deepEqual(spec.parameters, source.particle)
    assert.deepEqual(spec.animation.state, source.snapshot.particle)
    assert.deepEqual(spec.snapshot, source.snapshot)
    assert.deepEqual(spec.snapshot.model.scale, [1.37, 1.37, 1.37])
    assert.deepEqual(spec.snapshot.model.rotation, [0, 0, 0])
    assert.deepEqual(spec.view, source.view)
    assert.equal(spec.animation.durationSeconds, 3.1234567890123)
    assert.equal(spec.animation.state.idleElapsed, 7.1234567890123)
    assert.equal(spec.animation.state.anchorFloat, 0.05234567890123)
    assert.equal(spec.animation.state.transitionDuration, 4.1234567890123)
    assert.equal(spec.animation.progressUpdate.completionEpsilon, 1e-10)
    assert.equal(spec.uniforms.morph, phase === 'logo' ? 0 : 1)
    assert.equal(spec.uniforms.turnAngle, phase === 'logo' ? 0 : 2 * Math.PI)
    assert.equal(spec.uniforms.modelRotation, source.snapshot.particle?.modelRotation)
    assert.equal(spec.uniforms.floatOffset, source.snapshot.particle?.floatOffset)
    assert.deepEqual(spec.uniforms.rotationAxis, [0, 0, 1])
    assert.deepEqual(spec.uniforms.color, [18 / 255, 52 / 255, 171 / 255])
    assert.deepEqual(spec.uniforms.highlightColor, [254 / 255, 220 / 255, 186 / 255])
    assert.deepEqual(spec.uniforms.ambientLightColor, [0, 0, 0])
    assert.deepEqual(spec.uniforms.fillLightColor, [0, 0, 0])
    assert.equal(spec.uniforms.keyLightColor[0], 2.75)
    assert.equal(spec.uniforms.targetPose.length, 16)
    assert.notEqual(spec.uniforms.targetPose[5], 1)
    assert.equal(spec.uniforms.size, source.particle.size)
    assert.equal(spec.uniforms.pixelRatio, source.snapshot.viewport.pixelRatio)
    assert.deepEqual(Object.keys(spec.uniforms).sort(), [...PARTICLE_RECIPE.uniforms].sort())
    assert.deepEqual(Object.keys(spec.attributes).sort(), Object.keys(PARTICLE_RECIPE.attributes).sort())
    assert.equal(spec.attributes.position.count, source.particle.count)
    assert.equal(spec.attributes.targetPosition.typedArray, 'Float32Array')
    assert.equal(spec.attributes.targetNormal.itemSize, 3)
    assert.equal(spec.glsl.vertex, PARTICLE_VERTEX_SHADER)
    assert.equal(spec.glsl.fragment, PARTICLE_FRAGMENT_SHADER)
    assert.notEqual(spec.glsl.vertex, SHADER_VERTEX)
    assert.deepEqual(spec.particleRecipe, PARTICLE_RECIPE)
    assert.match(spec.particleRecipe.timeline.forwardTime, /to-model:progress; to-logo:1-progress/)
    assert.match(spec.particleRecipe.modelRotation, /\[-pi,pi\)/)
    assert.match(spec.animation.restorePolicy, /idleElapsed and anchorFloat/)
    assert.deepEqual(spec.sceneRecipe.lights, buildLightRecipe(source.lighting))
    assert.equal(spec.model.fileSizeBytes, source.model.fileSize)
    assert.equal(spec.model.sha256, source.model.sha256)
    assert.equal(spec.model.attachmentRequired, true)
    assert.ok(!document.content.includes('blob:'))
    assert.ok(!document.content.includes('data:image'))
  }
})

test('particle exports embed the exact local SVG and sufficient deterministic sampling metadata', () => {
  const spec = JSON.parse(buildExportDocument(particleInput()).content)
  const asset = spec.assets.logo
  const bytes = readFileSync(new URL('../public/assets/ams-logo.svg', import.meta.url))
  assert.equal(asset.projectPath, 'public/assets/ams-logo.svg')
  assert.equal(asset.assetPath, 'assets/ams-logo.svg')
  assert.equal(asset.originalFilename, 'amsLOGO.svg')
  assert.deepEqual([asset.width, asset.height, ...asset.viewBox], [357, 200, 0, 0, 357, 200])
  assert.equal(asset.source, AMS_LOGO_SVG)
  assert.equal(asset.source, bytes.toString('utf8'))
  assert.equal(asset.sha256, createHash('sha256').update(bytes).digest('hex'))
  assert.equal(asset.sha256, AMS_LOGO_META.sha256)
  assert.equal(asset.sourceIncluded, true)
  assert.equal(asset.externalFetchRequired, false)
  assert.ok(!/\b(?:href|src)\s*=/.test(asset.source))
  assert.equal(spec.sampling.seed, PARTICLE_SAMPLE_SEED)
  assert.equal(spec.sampling.count, 12000)
  assert.deepEqual(spec.sampling.countPolicy, PARTICLE_SAMPLING_RECIPE.count)
  assert.equal(spec.sampling.logo.curveSegments, 32)
  assert.equal(spec.sampling.randomCode, PARTICLE_SAMPLING_RECIPE.randomCode)
  assert.match(spec.sampling.randomCode, /Math\.imul/)
  assert.equal(spec.sampling.precision, PARTICLE_SAMPLING_RECIPE.precision)
  assert.equal(spec.sampling.traversalOrder, PARTICLE_SAMPLING_RECIPE.traversalOrder)
  assert.match(spec.sampling.pairing, /pair equal point indices/)
})

test('particle exports reject both transition directions and missing readiness while background stays independent', () => {
  for (const phase of ['to-model', 'to-logo'] as const) {
    const source = particleInput(phase)
    source.snapshot.particle!.progress = 0.73123456789012
    assert.throws(() => buildExportDocument(source), /动画完成/)
    const background = JSON.parse(buildExportDocument({ ...source, scope: 'background' }).content)
    assert.ok(!('animation' in background))
    assert.ok(!('particleRecipe' in background))
    assert.ok(!('assets' in background))
    assert.ok(!('uniforms' in background))
    assert.deepEqual(background.lighting.settings, source.lighting)
  }
  const notReady = particleInput()
  notReady.snapshot.particle!.ready = false
  assert.throws(() => buildExportDocument(notReady), /准备完成/)
  assert.throws(() => buildExportDocument(input({ shader: 'particle-morph' })), /准备完成/)
})

test('the exported PRNG and barycentric recipe reconstruct actual model samples in the same point order', () => {
  const source = particleInput()
  source.particle.count = 4
  const spec = JSON.parse(buildExportDocument(source).content)
  const makeRandom = new Function('seed', `let state = seed >>> 0; return () => { ${spec.sampling.randomCode} };`) as (seed: number) => () => number
  const weights = new Function('r1', 'r2', spec.sampling.barycentricCode) as (r1: number, r2: number) => number[]
  const random = makeRandom(spec.sampling.seed)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 3, 0], 3))
  const material = new THREE.MeshBasicMaterial()
  const mesh = new THREE.Mesh(geometry, material)
  try {
    const actual = sampleModel(mesh, spec.sampling.count, spec.sampling.seed).positions
    const reconstructed = new Float32Array(spec.sampling.count * 3)
    for (let point = 0; point < spec.sampling.count; point++) {
      random() // The first draw selects the only triangle; the next two select its point.
      const [, b, c] = weights(random(), random())
      reconstructed.set([2 * b, 3 * c, 0], point * 3)
    }
    assert.deepEqual(reconstructed, actual)
  } finally {
    geometry.dispose()
    material.dispose()
  }
})

test('particle Markdown delivers the exact SVG, dedicated GLSL and both-direction reconstruction instructions', () => {
  const source = particleInput('model')
  source.format = 'md'
  source.snapshot.particle!.reducedMotion = true
  const document = buildExportDocument(source)
  assert.equal(document.fileName, 'shader-room-shader-particle-morph.md')
  assert.match(document.content, /THREE\.Points/)
  assert.match(document.content, /正向 forwardTime=progress/)
  assert.match(document.content, /反向 forwardTime=1-progress/)
  assert.match(document.content, /idleElapsed/)
  assert.match(document.content, /anchorFloat/)
  assert.match(document.content, /目标 GLB \/ FBX 二进制仍需/)
  assert.match(document.content, /public\/assets\/ams-logo\.svg/)
  assert.match(document.content, /粒子路径不使用 RenderTarget/)
  assert.match(document.content, /clamp\(size × pixelRatio, 1, 64\)/)
  assert.ok(document.content.includes(`\n${PARTICLE_VERTEX_SHADER}\n`))
  assert.ok(document.content.includes(`\n${PARTICLE_FRAGMENT_SHADER}\n`))
  assert.ok(document.content.includes(`\n${AMS_LOGO_SVG}`))
  const json = document.content.match(/```json\n([\s\S]*?)\n```/)?.[1]
  assert.ok(json)
  const spec = JSON.parse(json)
  assert.equal(spec.animation.state.reducedMotion, true)
  assert.deepEqual(spec.snapshot.particle, source.snapshot.particle)
  assert.equal(spec.glsl.fragment, PARTICLE_FRAGMENT_SHADER)
})

test('FBX export retains attachment identity and the static loader recipe', () => {
  for (const shader of ['original', 'particle-morph'] as const) {
    const source = shader === 'particle-morph' ? particleInput() : input({ shader })
    source.model = { id: 'fbx-test', name: 'cube', kind: 'fbx', source: 'upload', fileName: 'cube.fbx', sha256: 'abc', fileSize: 100 }
    const spec = JSON.parse(buildExportDocument(source).content)
    assert.equal(spec.model.kind, 'fbx')
    assert.equal(spec.model.attachmentRequired, true)
    assert.match(spec.model.instructions, /FBX/)
    assert.match(spec.sceneRecipe.loaders.fbx.import, /FBXLoader/)
    assert.match(spec.sceneRecipe.loaders.fbx.behavior, /initial pose/)
  }
})

test('ASCII exports include the selected cell size and self-contained glyphs', () => {
  const source = input({ shader: 'ascii' })
  source.params.asciiSize = 36
  source.snapshot.ascii = { elapsed: 4.25, tick: 12, randomize: false }
  const spec = JSON.parse(buildExportDocument(source).content)
  assert.equal(spec.effect.mode, 6)
  assert.equal(spec.uniforms.asciiSize, 36)
  assert.equal(spec.uniforms.asciiTick, 12)
  assert.deepEqual(spec.snapshot.ascii, source.snapshot.ascii)
  assert.equal(spec.sceneRecipe.ascii.glyphs.length, 8)
  assert.match(spec.glsl.fragment, /float asciiMask/)
  let previous = 0
  for (const glyph of spec.sceneRecipe.ascii.glyphs) {
    assert.equal(glyph.rows.length, 7)
    assert.ok(glyph.rows.every((row: number) => row >= 0 && row <= 31))
    const filled = glyph.rows.reduce((total: number, row: number) => total + row.toString(2).replace(/0/g, '').length, 0)
    assert.ok(filled >= previous)
    previous = filled
  }
})

test('all four surface effects export direct mesh GLSL, exact clocks and parseable Markdown', () => {
  for (const shader of ['engraving','hologram','iridescent','dissolve'] as const) {
    const source=input({shader})
    source.snapshot.surface={time:4.123456789,dissolve:{progress:.45,start:0,target:1,elapsed:.9,duration:1.8,playing:true}}
    const spec=buildExportSpec(source)
    assert.ok('surfaceRecipe' in spec)
    assert.equal(spec.effect.renderPath,'direct-mesh-shader')
    assert.equal(spec.uniforms.time,4.123456789)
    assert.equal(spec.uniforms.dissolveProgress,.45)
    assert.equal(spec.surfaceRecipe.material.blending,'NoBlending')
    assert.ok(spec.shaders.vertex.includes('skinning_vertex'))
    assert.ok(spec.shaders.fragment.includes('dissolveProgress'))
    assert.ok(!('tDiffuse' in spec.uniforms))
    const md=buildExportDocument({...source,format:'md'}).content
    const json=md.match(/```json\s+([\s\S]*?)\s+```/)?.[1]
    assert.ok(json)
    assert.equal(JSON.parse(json).effect.id,shader)
    source.snapshot.surface.time=999
    assert.equal(spec.snapshot.surface.time,4.123456789)
  }
})


test('four reference effects export independent postprocessing, exact frozen ticks and neutral input', () => {
  for(const shader of ['glyph-matrix','adaptive-grid','word-mosaic','pixel-glyph'] as const) {
    const source=input({shader})
    source.reference={...DEFAULT_REFERENCE,animate:false,speed:4,wordVocabulary:'one two 三'}
    source.snapshot.reference={time:3.123456789,atlasDataUrl:'data:image/png;base64,atlas-pixels'}
    const spec=JSON.parse(buildExportDocument(source).content)
    assert.equal(spec.effect.renderPath,'reference-grid-postprocess')
    assert.equal(spec.uniforms.tick,12)
    assert.equal(spec.referenceRecipe.inputMaterial.color,'#b6b6b6')
    assert.equal(spec.sceneRecipe.material.styledEffects.color,'#b6b6b6')
    assert.deepEqual(spec.uniforms.resolution,[1001,801])
    assert.equal(spec.snapshot.reference.time,3.123456789)
    assert.ok(spec.shaders.fragment.includes('adaptiveDepth'))
    if(shader==='word-mosaic') {
      assert.deepEqual(spec.wordAtlas.recipe.words,['one','two','三'])
      assert.equal(spec.wordAtlas.pngDataUrl,source.snapshot.reference.atlasDataUrl)
      assert.ok(spec.wordAtlas.generatorSource.includes('createWordAtlasCanvas'))
    }
    const md=buildExportDocument({...source,format:'md'}).content
    const json=md.match(/```json\s+([\s\S]*?)\s+```/)?.[1]
    assert.ok(json);assert.equal(JSON.parse(json).effect.id,shader)
    assert.ok(!md.includes('blob:private-upload'))
  }
})
