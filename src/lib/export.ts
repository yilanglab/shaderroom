import { COMPOSITION_RECIPE, compositionFragment, validateEffectLayers } from './effectComposition'
import { FLOW_RECIPE, backgroundUniformSettings } from '../render/flowBackground'
import { EXTENDED_MODES, EXTENDED_RECIPE, extendedSettings } from '../render/extendedEffects'
import { PILOT_RECIPE, pilotSettings } from '../render/shadersPilot'
import { backgroundStyle } from './backgroundStyle'
import { comicHatchLights } from '../render/comicHatching'
import { DEFAULT_REFERENCE, isReferenceShader, buildReferenceUniforms, buildWordAtlasRecipe, WORD_ATLAS_SOURCE, REFERENCE_RECIPE, REFERENCE_VERTEX, REFERENCE_FRAGMENT } from '../render/referenceEffects'
import { DEFAULT_SURFACE, buildSurfaceUniforms, createDissolve, isSurfaceShader, SURFACE_RECIPE, SURFACE_VERTEX, SURFACE_FRAGMENT } from '../render/surfaceEffects'
import packageJson from '../../package.json'
import { SHADERS } from '../defaults'
import { buildLightRecipe, buildViewLightRecipe, displaySrgbVector, LIGHTING_CONVENTIONS } from '../render/lighting'
import { AMS_LOGO_META, AMS_LOGO_SVG } from '../render/particleLogo'
import { buildParticleUniformValues, PARTICLE_FRAGMENT_SHADER, PARTICLE_RECIPE, PARTICLE_VERTEX_SHADER } from '../render/particleMorph'
import { PARTICLE_SAMPLE_SEED, PARTICLE_SAMPLING_RECIPE } from '../render/particleSampling'
import { SCENE_RECIPE, SHADER_FRAGMENT, SHADER_MODES, SHADER_VERTEX } from '../render/shaders'
import { HEAT_COLORS, HEAT_NUMBERS, HEAT_RECIPE, heatSettings } from '../render/heatmap'
import { DEFAULT_INTERACTION, INTERACTION_RECIPE, interactionMode, isNewInteractive, supportsInteraction } from '../render/interaction'
import { INTERACTIVE_POST_VERTEX, INTERACTIVE_POST_FRAGMENT, INTERACTIVE_MESH_VERTEX, INTERACTIVE_MESH_FRAGMENT, INTERACTIVE_EFFECT_RECIPE, buildInteractiveUniformValues, usesInteractiveMesh } from '../render/interactiveEffects'
import type { BackgroundSettings, ExportInput, LightingSettings, ModelEntry } from '../types'

function backgroundSpec(settings: BackgroundSettings, time = 0) {
  return {
    settings: { ...settings },
    ...(settings.flow?.enabled ? { flow: { ...FLOW_RECIPE, uniforms: { colorA: displaySrgbVector(settings.flow.colors[0]), colorB: displaySrgbVector(settings.flow.colors[1]), colorC: displaySrgbVector(settings.flow.colors[2]), colorD: displaySrgbVector(settings.flow.colors[3]), ...backgroundUniformSettings(settings.flow), time, speed: 1, distortion: settings.flow.distortion, seed: settings.flow.seed, aspect: 'viewport width / height' } } } : {}),
    css: backgroundStyle(settings),
    placement: 'Full-viewport CSS background beneath the transparent WebGL canvas. If flow is present, implement its full-viewport quad below the model and place the transparent CSS grid above the flow quad. Grid sizes are CSS pixels; grid lines are 1 CSS pixel.',
  }
}

function modelSpec(model: ModelEntry) {
  const fileRequired = (model.kind === 'glb' || model.kind === 'fbx')
  return {
    id: model.id, name: model.name, kind: model.kind, source: model.source,
    ...(model.fileName === undefined ? {} : { fileName: model.fileName }),
    ...(model.fileSize === undefined ? {} : { fileSizeBytes: model.fileSize }),
    ...(model.sha256 === undefined ? {} : { sha256: model.sha256 }),
    binaryIncluded: false,
    attachmentRequired: fileRequired,
    ...(model.id === 'claw' && model.source === 'builtin' ? { projectAssetPath: 'public/models/claw.glb' } : {}),
    instructions: fileRequired
      ? model.source === 'upload'
        ? `请另附原始 ${model.kind.toUpperCase()} 文件「${model.fileName ?? model.name}」。文档仅保存文件身份，不包含模型二进制；浏览器临时地址不可用于复现。收到文件后核对字节数与 SHA-256（若有）。`
        : '请另附项目 public/models/claw.glb 原文件，并在复现项目中使用相应公开路径加载。文档不包含 GLB 二进制；仅对已记录的字节数和 SHA-256 进行核对。'
      : '使用 sceneRecipe.geometries 中对应 kind 的几何体创建方式，无需附带 GLB 文件。',
  }
}

function lightingSpec(settings: LightingSettings, camera?: { position: number[]; target: number[] }) {
  return {
    settings: {
      ambient: { ...settings.ambient },
      key: { ...settings.key },
      fill: { ...settings.fill },
    },
    lights: buildLightRecipe(settings),
    referenceFrame: 'camera-facing studio; lights are local offsets, resolvedWorldLights are the captured world positions',
    ...(camera ? { resolvedWorldLights: buildViewLightRecipe(settings, camera) } : {}),
    conventions: LIGHTING_CONVENTIONS,
  }
}

function particleSnapshot(input: ExportInput) {
  const state = input.snapshot.particle
  if (!state?.ready) throw new Error('粒子模型尚未准备完成，请加载完成后再导出。')
  if (state.phase === 'to-model' || state.phase === 'to-logo') throw new Error('粒子正在变形，请等待动画完成后再导出当前状态。')
  return { ...state }
}

function particleExportContent(input: ExportInput, lighting: ReturnType<typeof lightingSpec>) {
  const state = particleSnapshot(input)
  const { renderTarget: _unusedTarget, ...renderer } = SCENE_RECIPE.renderer
  return {
    dependencies: { ...packageJson.dependencies },
    effect: { id: 'particle-morph', name: '粒子变形', renderPath: 'direct-points-render' },
    parameters: { ...input.particle },
    uniforms: buildParticleUniformValues({ settings: input.particle, view: input.view, snapshot: state, lighting: input.lighting, pixelRatio: input.snapshot.viewport.pixelRatio, camera: input.snapshot.camera }),
    attributes: Object.fromEntries(Object.entries(PARTICLE_RECIPE.attributes).map(([name, source]) => [name, {
      itemSize: 3, count: input.particle.count, typedArray: 'Float32Array', source,
    }])),
    uniformConventions: {
      source: 'Values are produced by the same buildParticleUniformValues helper as the live renderer.',
      matrices: 'targetPose is a 16-number Three.js Matrix4.toArray() result in column-major storage; restore it with Matrix4.fromArray().',
      particleColors: 'color and highlightColor are direct HEX/255 display-sRGB channels. The point shader writes display-sRGB, without output color conversion or tone mapping.',
      lights: 'ambientLightColor, keyLightColor and fillLightColor are THREE.Color(HEX) linear RGB multiplied by the corresponding effective intensity. Direction vectors are normalized light positions pointing from the world origin toward each light.',
      timeline: 'morph and turnAngle are derived from the captured phase/progress. modelRotation and floatOffset come directly from the captured snapshot. Apply them before drawing the first frame.',
    },
    sceneRecipe: {
      renderer,
      loaders: SCENE_RECIPE.loaders,
      camera: SCENE_RECIPE.camera,
      lights: lighting.lights,
      geometries: SCENE_RECIPE.geometries,
      normalization: SCENE_RECIPE.normalization,
      framing: SCENE_RECIPE.framing,
      controls: SCENE_RECIPE.controls,
      modelZoom: SCENE_RECIPE.modelZoom,
    },
    particleRecipe: PARTICLE_RECIPE,
    sampling: {
      ...PARTICLE_SAMPLING_RECIPE,
      seed: PARTICLE_SAMPLE_SEED,
      count: input.particle.count,
      countPolicy: { ...PARTICLE_SAMPLING_RECIPE.count },
      triangleSelection: 'The first PRNG draw gives threshold = random() * totalArea. Select the first triangle whose cumulative area is strictly greater than threshold, keeping the recorded traversal order.',
      barycentricCode: 'const root = Math.sqrt(r1); return [1 - root, root * (1 - r2), root * r2];',
      barycentricInputs: 'r1 and r2 are the second and third PRNG draws for each point. Returned weights correspond to triangle vertices [a,b,c] in that exact order; position = a*weight[0] + b*weight[1] + c*weight[2].',
      sourceAsset: 'assets.logo.source',
      targetAsset: 'model',
      buffersIncluded: false,
      precisionPolicy: 'Rebuild both point buffers using the exact seed, traversal order, Float32 rounding and sampling recipe. Preserve point indices for the forward and reverse journey; do not resample when toggling direction.',
    },
    assets: {
      logo: {
        ...AMS_LOGO_META,
        viewBox: [...AMS_LOGO_META.viewBox],
        source: AMS_LOGO_SVG,
        sourceEncoding: 'UTF-8',
        sourceIncluded: true,
        externalFetchRequired: false,
        instructions: 'Use the exact inline SVG source. projectPath identifies the bundled source file; assetPath is relative to the public root and any configured URL base. Do not fetch the logo from a remote URL.',
      },
    },
    model: modelSpec(input.model),
    view: { ...input.view },
    snapshot: structuredClone(input.snapshot),
    animation: {
      state,
      rotationAxis: input.particle.rotationAxis,
      durationSeconds: input.particle.duration,
      progressUpdate: {
        delta: 'dt = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 0.05)',
        formula: 'progress = min(1, progress + dt / transitionDuration)',
        completionEpsilon: 1e-10,
        completion: 'If 1 - progress < completionEpsilon, set progress = 1 before evaluating the timeline and entering the endpoint state. This prevents an extra frame caused by accumulated floating-point error.',
      },
      capturePolicy: 'Only ready, settled logo or model states are exportable. Transition states are blocked until playback settles.',
      restorePolicy: 'Restore snapshot.particle exactly, including elapsed and idleElapsed seconds, modelRotation radians, floatOffset Points-local units, all transition anchors and reducedMotion. To reproduce a static captured frame, pause the clock and use the recorded floatOffset and modelRotation rather than recalculating them from elapsed. Preserve idleElapsed and anchorFloat so replay from the model can return to the same logo floating phase.',
      replayPolicy: 'Follow particleRecipe for both directions using the same sampled attributes. The logo starts morphing at parameters.morphStartAngle degrees of the eased turn; particleRecipe.timeline defines the corresponding start time. Returning follows the reverse timeline and restores the logo. Transition progress is local to its direction; do not interpret to-logo progress as the forward timeline position.',
    },
    units: {
      coordinates: 'Three.js right-handed world coordinates; +Y is up.',
      cameraFov: 'Vertical field of view in degrees.',
      viewRotation: 'rotationX, rotationY and rotationZ are degrees and affect only the target model through targetPose (Euler XYZ). The source logo stays front-facing.',
      modelPose: 'The Points parent uses snapshot.model position and scale. Its rotation remains zero; targetPose is an additional target-only uniform, not a parent rotation.',
      scale: 'snapshot.model.scale already contains view.scale; apply it once to the Points parent. Wheel, pinch and panel scale share the same state.',
      time: 'elapsed, idleElapsed, duration and transitionDuration are seconds. modelRotation and turnAngle are radians. modelRotateSpeed is radians per second around Y; floatSpeed is cycles per second. No exported time or angle is rounded.',
      floatOffset: 'Normalized Points-local units before the shared parent scale; no vertical floating in settled model state.',
      pointSize: 'Particle size is CSS px; gl_PointSize = clamp(size * pixelRatio, 1, 64), without perspective attenuation.',
      viewport: 'CSS width and height plus the captured renderer pixelRatio; use those values for a matching drawing buffer.',
    },
    reproduction: {
      assetsPolicy: 'The SVG source is fully embedded. Supply the GLB or FBX identified by model separately; for FBX follow sceneRecipe.loaders.fbx (static initial pose, embedded textures only), or rebuild its procedural geometry from sceneRecipe.geometries. The GLB must contain its own buffers and images. Configure the local Draco/Meshopt/KTX2 loaders from sceneRecipe.loaders before parsing compressed models; copy the recorded decoder files from the pinned Three.js package and use same-origin paths.',
      samplingPolicy: 'Preserve the imported model root transforms, build the recorded normalization group, and sample that normalized model in pose-local coordinates. Sample the SVG source using the recorded parser, triangulation and normalization recipe. Use the recorded particle count, seed and index pairing for both endpoint buffers. After sampling, hide the target mesh root; only the Points object remains visible in the particle render path.',
      snapshotPolicy: 'Restore the recorded camera, target, viewport and Points parent pose. Build targetPose from the view Euler angles in degrees, converted to XYZ radians. Restore animation.state and its exact current uniforms before the first rendered frame; do not reapply view.scale or view auto-rotation.',
      renderPolicy: 'Render a THREE.Points object with the particle-specific ShaderMaterial directly to the transparent canvas. Use the supplied point attributes, uniforms, GLSL and particleRecipe material settings. The particle effect has its own vertex transformation and lighting; it does not use tDiffuse, a fullscreen quad, a postprocess mode or the mesh white-material replacement.',
      lightingPolicy: 'Keep lighting.settings and sceneRecipe.lights as the effective light configuration. Follow particleRecipe for converting the same lights into particle shader uniforms and shading sampled target normals; do not substitute the fullscreen shader color pipeline.',
    },
    stats: input.stats ? { ...input.stats } : null,
    glsl: { vertex: PARTICLE_VERTEX_SHADER, fragment: PARTICLE_FRAGMENT_SHADER },
  }
}

function buildEffectSpec(input: ExportInput) {
  const base = {
    schemaVersion: '1.2.0',
    documentType: 'shader-room-export',
    generatedAt: new Date().toISOString(),
    scope: input.scope,
    background: backgroundSpec(input.background, input.snapshot.backgroundFlowTime ?? 0),
    lighting: lightingSpec(input.lighting, input.scope === 'shader' ? input.snapshot.camera : undefined),
  }
  if (input.scope === 'background') return base
  if (isNewInteractive(input.shader)) {
    const mode = interactionMode(input.shader)
    const mesh = usesInteractiveMesh(input.shader)
    return {
      ...base,
      dependencies: { ...packageJson.dependencies },
      effect: { id: input.shader, name: SHADERS.find(item => item.id === input.shader)?.name ?? input.shader, mode, renderPath: mesh ? 'interactive-direct-mesh' : 'interactive-original-material-postprocess' },
      parameters: { ...(input.interaction ?? DEFAULT_INTERACTION) },
      model: modelSpec(input.model), view: { ...input.view }, snapshot: structuredClone(input.snapshot),
      sceneRecipe: {
        ...SCENE_RECIPE, lights: base.lighting.lights,
        material: mesh
          ? { type: 'ShaderMaterial', instructions: 'Use the interactive mesh source and interactiveEffectRecipe, preserving static skin/morph/instance transforms. Render directly to transparent canvas; no white replacement or fullscreen pass.' }
          : { type: 'original imported materials', instructions: 'Preserve original materials including alphaTest, maps and embedded textures. Render the lit scene into the transparent linear target, then apply the interactive fullscreen pass.' },
      },
      interactiveEffectRecipe: INTERACTIVE_EFFECT_RECIPE,
      uniforms: { ...buildInteractiveUniformValues(input.shader, input.interaction ?? DEFAULT_INTERACTION, input.lighting), ...(!mesh ? { tDiffuse: 'Original-material linear RGBA8 scene render target; texture binary not embedded' } : {}) },
      shaders: { vertex: mesh ? INTERACTIVE_MESH_VERTEX : INTERACTIVE_POST_VERTEX, fragment: mesh ? INTERACTIVE_MESH_FRAGMENT : INTERACTIVE_POST_FRAGMENT },
      reproduction: {
        assets: 'Use model.instructions and sceneRecipe.loaders, including same-origin Draco/Meshopt/KTX2 decoders. Model binary is not embedded. Preserve imported root transforms and the static initial FBX pose.',
        snapshot: 'Normalize using sceneRecipe.normalization, then apply snapshot.model to the outer pose group exactly once. Restore snapshot.camera, target and viewport. Do not add view.scale or view Euler angles a second time.',
        render: mesh ? 'Direct mesh ShaderMaterial with camera-space interaction; apply interactiveEffectRecipe and exact shaders. Shader output is display-sRGB: no second tone mapping or output conversion.' : 'Pass 1 retains original model materials and captures transparent linear RGBA. Pass 2 applies exact interactive shaders and emits display-sRGB. Preserve alpha, clamp offscreen samples, and disable double color conversion. CSS background remains outside the distortion pass.',
        interaction: 'Restore interaction.snapshot for an exact frame; initialize all interaction.uniforms on the active material. Resume input and clocks using interaction.recipe, independent of model rotation. Radius/resolution are CSS pixels, never multiply them by DPR.',
      },
      stats: input.stats ? { ...input.stats } : null,
    }
  }
  if (input.shader === 'particle-morph') return { ...base, ...particleExportContent(input, base.lighting) }
  if(isReferenceShader(input.shader)) {
    const settings=input.reference??DEFAULT_REFERENCE
    return {
      ...base,dependencies:{...packageJson.dependencies},
      effect:{id:input.shader,name:SHADERS.find(item=>item.id===input.shader)?.name,renderPath:'reference-grid-postprocess'},
      parameters:{...settings},model:modelSpec(input.model),view:{...input.view},snapshot:structuredClone(input.snapshot),
      sceneRecipe:{...SCENE_RECIPE,material:{...SCENE_RECIPE.material,styledEffects:{...SCENE_RECIPE.material.styledEffects,...REFERENCE_RECIPE.inputMaterial}},lights:base.lighting.lights},referenceRecipe:REFERENCE_RECIPE,
      uniforms:{tDiffuse:'Linear RGBA8 neutral-model render target',...buildReferenceUniforms(input.shader,settings,{time:input.snapshot.reference?.time??0,viewport:input.snapshot.viewport})},
      ...(input.shader==='word-mosaic'?{wordAtlas:{recipe:buildWordAtlasRecipe(settings.wordVocabulary),generatorSource:WORD_ATLAS_SOURCE,pngDataUrl:input.snapshot.reference?.atlasDataUrl??null,restore:'Prefer pngDataUrl for exact glyph pixels. Otherwise generate using recipe and generatorSource; platform monospace fonts can differ. Set texture flipY=false, LinearFilter and NoColorSpace.'}}:{}),
      shaders:{vertex:REFERENCE_VERTEX,fragment:REFERENCE_FRAGMENT},
    }
  }
  if (isSurfaceShader(input.shader)) {
    const state = input.snapshot.surface ?? { time: 0, dissolve: createDissolve() }
    const settings = input.surface ?? DEFAULT_SURFACE
    return {
      ...base,
      dependencies: { ...packageJson.dependencies },
      effect: { id: input.shader, name: SHADERS.find(item => item.id === input.shader)?.name, renderPath: 'direct-mesh-shader' },
      parameters: { ...settings },
      uniforms: buildSurfaceUniforms(input.shader, settings, state, input.lighting, input.snapshot),
      model: modelSpec(input.model), view: { ...input.view },
      snapshot: structuredClone({ ...input.snapshot, surface: state }),
      sceneRecipe: { ...SCENE_RECIPE, lights: base.lighting.lights, material: SURFACE_RECIPE.material },
      surfaceRecipe: SURFACE_RECIPE,
      shaders: { vertex: SURFACE_VERTEX, fragment: SURFACE_FRAGMENT },
    }
  }
  const { params, snapshot } = input
  return {
    ...base,
    dependencies: { ...packageJson.dependencies },
    effect: {
      id: input.shader,
      name: SHADERS.find((item) => item.id === input.shader)?.name ?? input.shader,
      mode: SHADER_MODES[input.shader],
      renderPath: input.shader === 'original' ? 'direct-scene-render' : 'render-target-then-fullscreen-quad',
    },
    parameters: { ...params },
    uniforms: {
      stackInputDisplay: 0,
      ...(input.shader in EXTENDED_MODES ? { ...extendedSettings(params) } : {}),
      tDiffuse: 'Texture from the scene pass WebGLRenderTarget (not embedded)',
      ...(['fluted-glass','dither'].includes(input.shader) ? { ...pilotSettings(params), pilotPixelRatio: snapshot.viewport.pixelRatio } : {}),
      ...(input.shader === 'heatmap' ? { ...Object.fromEntries(HEAT_COLORS.map(key => [key, displaySrgbVector(heatSettings(params)[key])])), ...Object.fromEntries(HEAT_NUMBERS.map(key => [key, heatSettings(params)[key]])) } : {}),
      ...(input.shader === 'comic-line' ? {
        tDepth: 'WebGLRenderTarget.depthTexture: THREE.DepthTexture with UnsignedIntType; resized with target',
        cameraNear: snapshot.camera.near, cameraFar: snapshot.camera.far,
        comicWidth: (params.comicWidth ?? 1.2) * snapshot.viewport.pixelRatio,
        comicDetail: params.comicDetail ?? .3,
        comicHatching: params.comicHatching ? 1 : 0, comicHatchGroups: params.comicHatchGroups ?? 3,
        comicHatchAngle: params.comicHatchAngle ?? 35,
        comicPixelRatio: snapshot.viewport.pixelRatio, ...comicHatchLights(input.lighting),
        comicInk: displaySrgbVector(params.comicInk ?? '#292b2c'), comicPaper: displaySrgbVector(params.comicPaper ?? '#ffffff'),
      } : {}),
      resolution: [Math.floor(snapshot.viewport.width * snapshot.viewport.pixelRatio), Math.floor(snapshot.viewport.height * snapshot.viewport.pixelRatio)],
      mode: SHADER_MODES[input.shader],
      asciiSize: params.asciiSize ?? 24, asciiTick: input.snapshot.ascii?.tick ?? 0, gridSize: params.gridSize, thickness: params.thickness,
      threshold1: params.threshold1, threshold2: params.threshold2,
      lightColor: displaySrgbVector(params.lightColor),
      shadowColor: displaySrgbVector(params.shadowColor),
      highlightColor: displaySrgbVector(params.highlightColor),
      dotSize: params.dotSize, contrast: params.contrast,
      levels: params.levels, saturation: params.saturation,
    },
    uniformConventions: {
      ...(input.shader in EXTENDED_MODES ? { extendedEffects: EXTENDED_RECIPE } : {}),
      ...(['fluted-glass','dither'].includes(input.shader) ? { shadersPilot: PILOT_RECIPE } : {}),
      ...(input.shader === 'comic-line' ? { comicHatching: 'Optional static shadow hatching uses decoded view-space normals and scene lights in observer coordinates, matching engraving light coefficients and darkness thresholds. Groups 1/2/3 use comicHatchAngle, comicHatchAngle+90, comicHatchAngle+45 degrees progressively in darker regions; default angle 35 degrees. Spacing 5 CSS pixels; widths .8/.64/.56 CSS pixels. Off preserves pure outlines. Hatching uses comicInk; no paper grain.' } : {}),
      ...(input.shader === 'heatmap' ? { heatmap: HEAT_RECIPE } : {}),
      ...(input.shader === 'comic-line' ? { comicLine: 'Static normal/depth edge detection, mode 21. Override scene material with THREE.MeshNormalMaterial({side:THREE.DoubleSide}) for the offscreen pass, then restore scene.overrideMaterial=null. Attach a THREE.DepthTexture to the RGBA render target. Clear RGBA to transparent, depth to 1. Use the actual camera near/far. Sample normals without color-space conversion. comicWidth is CSS line radius multiplied by pixelRatio; colors are display-sRGB. Fullscreen output is straight alpha, NoBlending, toneMapped:false. No time, lighting, or pointer dependence. Surface threshold suppresses smooth normal changes; depth discontinuities preserve overlapping structure.' } : {}),
      resolution: 'Actual WebGL drawing-buffer width and height in physical pixels; floor(viewport CSS size × recorded pixelRatio). Resize the render target and this uniform together.',
      asciiTick: 'Restore snapshot.ascii.tick for the captured glyph distribution. Resume from snapshot.ascii.elapsed only when asciiRandomize is enabled and reduced motion is off; advance by clamped delta and use floor(elapsed*asciiSpeed). The deterministic variant formula is in sceneRecipe.ascii.variation.',
      asciiSize: 'ASCII cell height in physical drawing-buffer pixels. Width is height*7/9; the embedded 5x7 glyph masks require no fonts. Follow sceneRecipe.ascii.',
      gridSize: 'Physical drawing-buffer pixels (distinct from the CSS background grid).',
      colors: 'lightColor, shadowColor and highlightColor are normalized display-sRGB components decoded directly from the hexadecimal UI colors (HEX/255), without sRGB-to-linear conversion. Scene light colors instead use the normal THREE.Color HEX parsing and sRGB-to-linear conversion.',
      palette: 'Halftone, pixelate and toon interpolate mix(shadowColor, highlightColor, value), then apply saturation. Cross-stitch preserves its threshold behavior: lightColor for the lit stitch and highlightColor for the brightest stitch; shadowColor does not affect cross-stitch.',
      original: 'Original material mode renders the scene directly; the fullscreen shader and its uniforms are provided for completeness but are bypassed in this mode.',
    },
    sceneRecipe: { ...SCENE_RECIPE, lights: base.lighting.lights },
    model: modelSpec(input.model),
    view: { ...input.view },
    snapshot: {
      camera: { ...snapshot.camera, position: [...snapshot.camera.position], target: [...snapshot.camera.target] },
      model: { position: [...snapshot.model.position], rotation: [...snapshot.model.rotation], scale: [...snapshot.model.scale] },
      viewport: { ...snapshot.viewport },
      ...(input.shader === 'ascii' && snapshot.ascii ? { ascii: { ...snapshot.ascii } } : {}),
    },
    units: {
      coordinates: 'Three.js right-handed world coordinates; +Y is up.',
      cameraFov: 'Vertical field of view in degrees.',
      snapshotRotation: 'Euler XYZ radians; includes the accumulated auto-rotation at the captured instant.',
      viewRotation: 'UI rotationX, rotationY, rotationZ are degrees.',
      rotationSpeed: 'Radians per second, applied around Y while autoRotate is enabled.',
      scale: 'Dimensionless multiplier shared by canvas wheel, two-touch pinch and the panel model-scale input. OrbitControls camera dolly is disabled. snapshot.model.scale already contains view.scale; do not multiply it again. See sceneRecipe.modelZoom for limits and input behavior.',
      viewport: 'width and height are CSS pixels; pixelRatio is the captured renderer ratio, not an instruction to read the destination device ratio.',
    },
    reproduction: {
      loaderPolicy: 'For FBX, follow sceneRecipe.loaders.fbx using FBXLoader and no AnimationMixer. Before parsing a GLB, follow sceneRecipe.loaders: copy the five Draco/Basis decoder files from the pinned Three.js package to their public paths, attach DRACOLoader, MeshoptDecoder and KTX2Loader to GLTFLoader, and call ktx2Loader.detectSupport(renderer). Serve decoder assets from the same origin; apply any deployment URL prefix to both decoder paths. Keep embedded model buffers/images self-contained and follow the recorded loader lifecycle.',
      snapshotPolicy: 'Apply normalization from sceneRecipe first, preserving the original glTF root transforms. Apply snapshot.model to the outer model pose group. It is the captured pose and already includes UI pose, scale and accumulated auto-rotation; do not reapply view rotation or scale.',
      animationPolicy: 'For the exact captured frame, disable auto-rotation. To resume the preview, start from snapshot.model.rotation and add view.rotateSpeed × min(deltaSeconds, 0.05) to Y when view.autoRotate is true.',
      cameraPolicy: 'Use the recorded camera position, OrbitControls target, fov, near and far. Use the recorded CSS viewport dimensions and pixelRatio for the exact composition, then update the camera projection matrix.',
      lightingPolicy: 'Use lighting.lights (also copied to sceneRecipe.lights) as the current effective light recipe. Create each THREE.AmbientLight or THREE.DirectionalLight with its recorded HEX color and intensity; normal THREE.Color HEX parsing converts sRGB to linear. For the captured frame, use lighting.resolvedWorldLights positions and targets. During orbit, rebuild these from lighting.lights camera-local offsets using lighting.conventions; never treat the local offsets as fixed world coordinates. For directional lights, apply these resolved positions and targets, and add both the light and its target to the scene. Disabled lights have effective intensity 0; lighting.settings retains their configured intensity and angles. Follow lighting.conventions for directions and units. Do not apply the postprocess HEX/255 convention to scene light colors.',
      renderPolicy: input.shader === 'original'
        ? 'Restore original imported materials and render directly with the sceneRecipe renderer color settings. Do not replace the original materials with the styled white material.'
        : 'Replace model mesh materials with the sceneRecipe white MeshStandardMaterial. Pass 1 renders the lit 3D scene to a transparent linear RGBA8 WebGLRenderTarget. Pass 2 renders a fullscreen quad using the supplied vertex and fragment GLSL, tDiffuse and recorded uniforms. The fragment shader writes display-sRGB; do not apply tone mapping or another output color conversion.',
    },
    stats: input.stats ? { ...input.stats } : null,
    glsl: { vertex: SHADER_VERTEX, fragment: SHADER_FRAGMENT },
  }
}

function buildStandaloneExportSpec(input: ExportInput) {
  const spec = buildEffectSpec(input)
  if (input.scope === 'background' || !supportsInteraction(input.shader) || (!input.interaction && !isNewInteractive(input.shader))) return spec
  const settings = { ...(input.interaction ?? DEFAULT_INTERACTION) }
  const state = structuredClone(input.snapshot.interaction ?? { pointer: [.5, .5], velocity: [0, 0], amount: 0, time: 0 })
  const uniforms = {
    uPointer: state.pointer, uVelocity: state.velocity,
    uInteractionResolution: [input.snapshot.viewport.width, input.snapshot.viewport.height],
    uHover: state.amount,
    uRadius: settings.radius, uStrength: settings.strength,
    uInteractionTime: state.time, uInteractionSpeed: settings.speed,
  }
  return {
    ...spec,
    uniforms: { ...('uniforms' in spec ? spec.uniforms : {}), ...uniforms },
    interaction: { settings, snapshot: state, uniforms, recipe: INTERACTION_RECIPE },
  }
}

export function buildExportSpec(input: ExportInput) {
  if (input.scope === 'background' || !input.layers?.length) return buildStandaloneExportSpec(input)
  validateEffectLayers(input.layers)
  if (input.layers.length === 1) {
    const layer = input.layers[0]
    return buildStandaloneExportSpec({ ...input, ...layer, layers: undefined })
  }
  const base = buildStandaloneExportSpec({ ...input, ...input.layers[0], layers: undefined })
  const layers = input.layers.map((layer, index) => {
    const spec = buildStandaloneExportSpec({ ...input, ...layer, layers: undefined, snapshot: input.snapshot.composition?.[index] ?? input.snapshot })
    const { background: _layerBackground, ...effectSpec } = spec
    const sources = 'shaders' in spec ? spec.shaders : 'glsl' in spec ? spec.glsl : undefined
    return {
      index, ...effectSpec,
      ...('interaction' in spec && spec.interaction ? { interaction: { ...spec.interaction, uniforms: { ...spec.interaction.uniforms, ...(!layer.interaction.enabled ? { uHover: 0 } : {}) } } } : {}),
      uniforms: { ...('uniforms' in spec ? spec.uniforms : {}), stackInputDisplay: index === 0 ? 0 : 1, ...(!layer.interaction.enabled || !supportsInteraction(layer.shader) ? { uHover: 0 } : {}) },
      ...(sources ? { shaders: { ...sources, fragment: compositionFragment(sources.fragment) } } : {}),
      ...('glsl' in spec && sources ? { glsl: { ...sources, fragment: compositionFragment(sources.fragment) } } : {}),
    }
  })
  return {
    ...base,
    effect: { id: 'composition', name: input.layers.map(layer => SHADERS.find(item => item.id === layer.shader)?.name ?? layer.shader).join(' → '), renderPath: 'effect-stack' },
    composition: { ...COMPOSITION_RECIPE, layers },
  }
}

function particleMarkdown(input: ExportInput, json: string): string {
  return `# Shader Room · 粒子变形

当前导出的是 ${input.snapshot.particle?.phase === 'model' ? '模型' : 'AMS Logo'} 稳态。完整 Spec 保留原始数值精度、当前浮动偏移和模型旋转角。SVG 源码已嵌入；目标 GLB / FBX 二进制仍需按 model.instructions 另附。

## 重建步骤

1. 安装 dependencies 指定的版本。以 assets.logo.source 中的完整 SVG 为源，校验 UTF-8 SHA-256 与 viewBox。项目原件位于 ${AMS_LOGO_META.projectPath}，${AMS_LOGO_META.assetPath} 是相对于 public 根及项目 URL base 的资产路径。复现时直接使用内嵌源码，无需远程获取图片。
2. 根据 model.kind 加载随附的 GLB 或 FBX（FBX 使用 sceneRecipe.loaders.fbx 的静态加载规则），或按 sceneRecipe.geometries 创建对应几何体。保留导入根变换，按 sceneRecipe.normalization 归一化。压缩 GLB 必须先按 sceneRecipe.loaders 配置本地 Draco / Meshopt / KTX2：复制固定 Three.js 版本中的五个 decoder 文件，设置同源路径，并执行 ktx2Loader.detectSupport(renderer)。
3. 严格按 sampling 的 seed、Mulberry32 代码、三角形遍历顺序和 Float32 写入顺序构建两套等数量点云。每点第一次随机数决定三角形，第二和第三次随机数分别作为 barycentricCode 的 r1 / r2；返回权重依次对应原三角形的 a / b / c 顶点，不可交换。SVGLoader / ShapeGeometry 采样填充区域并保留镂空；模型按变换后三角形面积采样。按原数组索引配对，切换方向时复用这些点。采样完成后隐藏原目标 mesh 根组，粒子路径仅显示 Points。attributes 列出 position、targetPosition、targetNormal、scatterDirection 的数量、类型与来源；散开方向的独立 seed 和生成公式见 particleRecipe.attributes。
4. 创建 THREE.Points 与专属 ShaderMaterial，应用本文件的两段粒子 GLSL、attributes 和全部 uniforms，直接渲染到透明 canvas。材质、深度和透明度规则遵循 particleRecipe；点大小是 CSS px，实际 gl_PointSize 为 clamp(size × pixelRatio, 1, 64)。粒子路径不使用 RenderTarget、全屏 quad、tDiffuse 或网格后处理 mode。场景灯光配置保留在 lighting 和 sceneRecipe.lights；粒子实际着色使用已计算的线性灯光 uniform，粒子颜色本身为 HEX/255 的 display-sRGB。
5. 应用 snapshot.camera、target、viewport 和 Points 父组的 snapshot.model 缩放。父组不旋转；view 的 XYZ 角度转换成弧度后，只用于 targetPose 对目标模型变换。targetPose 数组按 Three.js Matrix4 的列主序恢复，模型额外自转使用 modelRotation。精确重现导出帧时暂停时钟，直接应用记录的 floatOffset / modelRotation，不要重新计算或再次叠加缩放。
6. 先恢复 animation.state，再按 particleRecipe.timeline 接入点击切换。正向 forwardTime=progress，按 morphStartAngle（默认 35°）与旋转缓动公式反算 startTime，再以 smoothstep(startTime,1,forwardTime) 变为模型；turnAngle 按 timeline 中记录的缓动公式沿 rotationAxis 完整旋转 360°。反向 forwardTime=1-progress，严格逆向执行同一曲线。播放时长使用启动时记录的 max(0.1,duration)，进度按 animation.progressUpdate 累加，并在距离终点小于 1e-10 时吸附到 1，避免浮点误差多留一帧。重复点击在过渡期间忽略。Logo 稳态按保留的 idleElapsed 时钟上下轻浮，粒子按 particleRecipe.drift 缓慢游动；游动在变形时随混合权重消退至零，模型稳态停止浮动并按 modelRotate 开关自转；返回时恢复 anchorFloat 与浮动相位，其他锚点及 reducedMotion 行为按完整 recipe。导出仅允许就绪的 Logo / 模型稳态，两种过渡状态均需等播放结束。
7. 最后应用 background.css 的全屏背景与可选 CSS 网格。保持透明 canvas 合成，保留 snapshot 中的时间、角度、像素比和模型文件身份。

## 完整 Spec

\`\`\`json
${json}
\`\`\`

## 内嵌 AMS SVG

\`\`\`svg
${AMS_LOGO_SVG}\`\`\`

## Particle Vertex GLSL

\`\`\`glsl
${PARTICLE_VERTEX_SHADER}
\`\`\`

## Particle Fragment GLSL

\`\`\`glsl
${PARTICLE_FRAGMENT_SHADER}
\`\`\`
`
}

function markdown(input: ExportInput, spec: ReturnType<typeof buildExportSpec>): string {
  const json = JSON.stringify(spec, null, 2)
  const lightingInstructions = `## Three.js 灯光复现

按 lighting.lights 中的 type、color 和 intensity 创建 THREE.AmbientLight 或 THREE.DirectionalLight。DirectionalLight 的 lighting.lights.position 是观察坐标系中的偏移量：按 lighting.conventions 随镜头旋转换算为世界坐标，确保画面中的光照方向固定。复现静态快照可直接使用 lighting.resolvedWorldLights；拖动时需重新计算，不重复变换已解析坐标。将灯光及 target 对象加入 scene；禁用灯光的实际 intensity 为 0，lighting.settings 保留其配置强度、开关和方向角。方向和单位遵循 lighting.conventions。

场景灯光的 HEX 颜色交给 THREE.Color 常规解析，执行 sRGB→linear 转换。后处理 Shader 的 lightColor / shadowColor / highlightColor 则直接使用 HEX/255 得到的 display-sRGB vec3，不做线性化。这两处颜色处理需分别保留。`
  if (input.scope === 'background') {
    const { css } = spec.background
    return `# Shader Room · 背景与灯光复现\n\n将以下背景应用于覆盖整个 viewport 的容器，3D canvas 保持透明。颜色采用 CSS sRGB；网格间距和线宽单位为 CSS px。灯光使用下方记录的当前配置。若完整参数含 background.flow，使用其中的 vertex、fragment 和 uniforms 建立独立背景画布，置于模型下方，CSS 网格置于渐变上方；仅应用 CSS 无法复现流动渐变及其他程序背景。\n\n\`\`\`css\n.shader-room-background {\n  position: fixed;\n  inset: 0;\n  background-color: ${css.backgroundColor};\n  background-image: ${css.backgroundImage};\n  background-size: ${css.backgroundSize};\n  background-position: ${css.backgroundPosition};\n}\n\`\`\`\n\n${lightingInstructions}\n\n## 完整参数\n\n\`\`\`json\n${json}\n\`\`\`\n`
  }
  if ('composition' in spec) return `# Shader Room · 效果组合复现\n\n按照 composition.layers 数组顺序执行，先执行第 1 层，再执行第 2 层。每层使用自己的完整参数、uniforms、GLSL、字符图集和互动配方；不要合并同名参数。仅渲染一次模型，背景与网格始终在效果栈外。\n\n第 1 层读取线性场景输入；其输出 display-sRGB 以直通道 RGBA8 保存，第二层 stackInputDisplay=1，使用已嵌入的 stackTap 还原线性输入。所有全屏 pass 使用 NoBlending 和 toneMapped:false，不额外执行颜色转换。几何深度与法线另行采集原模型，按 composition.geometryInputs 保留。\n\n${lightingInstructions}\n\n## 完整组合 Spec\n\n\`\`\`json\n${json}\n\`\`\`\n`
  if (isNewInteractive(input.shader)) return [
    '# Shader Room · ' + (SHADERS.find(item => item.id === input.shader)?.name ?? input.shader),
    '## 重建步骤',
    '1. 使用 dependencies 固定版本；按 model.instructions 获取模型，配置 sceneRecipe.loaders 同源解码资源。按 sceneRecipe.normalization 归一化，再恢复 snapshot 相机、viewport 与模型外层姿态。不要重复叠加 view.scale 或旋转。',
    '2. 严格按 effect.renderPath 选择渲染流程：interactive-original-material-postprocess 保留原始材质，将场景渲染到透明 linear RenderTarget，再执行全屏后处理；interactive-direct-mesh 使用专属网格 ShaderMaterial，直接输出至透明画布。禁止套用旧效果的白色替代材质配方。',
    '3. 完整使用 shaders、uniforms 与 interactiveEffectRecipe。GLSL 已内嵌；输出为 display-sRGB，不重复色彩转换或 tone mapping。保持静态骨骼、morph、实例变换和透明度。按 lighting 复现场景光照。',
    '4. 接入 interaction.recipe 的鼠标坐标、跟随缓动、进入退出及减少动态效果规则。uPointer 为左下原点的画布 UV，uRadius 与 uInteractionResolution 使用 CSS px，与 DPR 无关。拖动旋转、离开画布、进入面板或触屏时暂停 Hover；开关与模型自转及效果播放独立。',
    '5. 精确复现当前帧时恢复 interaction.snapshot 并冻结时钟；继续互动时按 interaction.settings 更新 uniforms。背景与网格使用 background.css，位于画布下方，不参与局部折射。',
    '## 完整 Spec（包含全部 GLSL）', '```json', json, '```', '',
  ].join('\n\n')
  if (input.shader === 'particle-morph') return particleMarkdown(input, json)
  if(isReferenceShader(input.shader)) return [
    '# Shader Room · '+SHADERS.find(item=>item.id===input.shader)?.name,
    '## 重建步骤',
    '1. 使用 dependencies 的固定版本；根据 model 加载另附 GLB / FBX 或默认几何。保留静态姿态，按 sceneRecipe.normalization 居中和统一尺寸，再恢复 snapshot 中的外层模型姿态、相机、viewport。不要重复叠加 view.scale 和自转角。',
    '2. 按 lighting 配置当前光照，使用 referenceRecipe.inputMaterial 的中灰 MeshStandardMaterial 渲染模型到透明 linear RGBA8 RenderTarget。再以 shaders、uniforms 和全屏 quad 进行单独后处理。NoBlending，禁止再次做颜色转换；将 background.css 放在透明画布下方。',
    '3. 所有网格尺寸为 CSS 像素，resolution 使用 viewport 的 CSS 宽高，RenderTarget 实际宽高乘 pixelRatio。按 referenceRecipe 重建格子、细分判断、字符选择和明暗。',
    '4. 文字马赛克优先加载 wordAtlas.pngDataUrl 保留精确字形，或用随附 generatorSource 和 recipe 生成图集；保持 flipY=false。其他模式不使用文字图集。',
    '5. 恢复 snapshot.reference.time，tick=floor(time*speed)。animate 关闭或系统减少动态效果时冻结时钟。静态复现还需暂停模型自转。模型文件未嵌入，需另附；图集和 GLSL 已包含在下方 Spec。',
    '## 完整 Spec','```json',json,'```',''
  ].join('\n\n')
  if (isSurfaceShader(input.shader)) return [
    '# Shader Room · ' + SHADERS.find(item => item.id === input.shader)?.name,
    '## 重建步骤',
    '1. 安装 dependencies 固定版本；按 model 与 sceneRecipe.loaders 加载原始 GLB / FBX 或创建内置几何体。二进制模型需另附。保留静态骨骼、实例和 morph 姿态，按 sceneRecipe.normalization 归一化。',
    '2. 恢复 snapshot 的相机、viewport 和外层模型姿态，rotation 为 XYZ 弧度，不要重复叠加 view.scale 或自转角。背景使用 background.css。',
    '3. 为模型网格应用 shaders 中的 ShaderMaterial，并按 surfaceRecipe 配置透明度、深度和颜色空间。直接渲染网格，不使用后处理或白色替代材质。Three.js 自动展开 vertex 中的 ShaderChunk。',
    '4. 应用 uniforms 精确重现当前帧。worldToPose 是外层姿态矩阵的逆矩阵，姿态变化时更新。光照方向为观察坐标系，灯光颜色为 linear，效果调色为 display-sRGB；按 surfaceRecipe 处理。',
    '5. 从 snapshot.surface 恢复效果时钟与溶解状态；动画公式、播放方向、暂停与 reduced-motion 行为见 surfaceRecipe。静态复现时冻结效果时钟与模型自转。',
    '## 完整 Spec（包含全部 GLSL）',
    '```json', json, '```', ''
  ].join('\n\n')

  return `# Shader Room · ${SHADERS.find((item) => item.id === input.shader)?.name ?? input.shader}\n\n这是可交给 Agent 的当前场景复现规范。以下 JSON 是精确值的事实源；保留浮点精度。GLB / FBX 二进制没有嵌入，请按 model.instructions 获取原模型文件。\n\n## 重建步骤\n\n1. 安装 dependencies 中记录的版本。加载 GLB 前，按 sceneRecipe.loaders 从固定版本的 Three.js 包复制五个 Draco / Basis 解码文件到 public/decoders 对应目录；为 GLTFLoader 接入 DRACOLoader、MeshoptDecoder 和 KTX2Loader，并先调用 ktx2Loader.detectSupport(renderer)。解码资源由同源本地路径提供；部署有 URL 前缀时同步修改两个 decoderPath / transcoderPath，加载器生命周期按 recipe 处理。根据 model.kind 加载随文档附带的 GLB 或 FBX（FBX 使用 sceneRecipe.loaders.fbx，保留初始姿态、不播放动画），或使用 sceneRecipe.geometries 创建内置几何体。默认 Claw 原件位于 public/models/claw.glb。上传模型按文件名、字节数与 SHA-256 核对，缺失的指纹不可补造。\n2. 按 sceneRecipe 创建渲染器、相机与控制器，按 lighting.lights 创建当前灯光；sceneRecipe.lights 已同步为同一配方，详见下方灯光复现说明。保留原 GLB root transform，按 sceneRecipe.normalization 居中并统一尺寸，再将 snapshot.model 应用到外层姿态 group。坐标为 Three.js 右手系、Y 向上；snapshot rotation 为 XYZ 欧拉弧度，UI view rotation 为角度。snapshot 已包含缩放和自转累计量，不要再次叠加 view 的姿态。\n3. 使用 snapshot.camera 与 target，以及 snapshot.viewport 的 CSS 尺寸和 pixelRatio。按实际 drawing-buffer 尺寸设置 RenderTarget 与 resolution，Shader 网格单位为物理像素。精确重现当前帧时关闭自转；恢复动画则从 snapshot 的 Y 弧度继续增加 rotateSpeed × min(deltaSeconds, 0.05)。\n4. 原始材质模式直接渲染场景并保留模型原材质。其他模式使用 sceneRecipe.material 的白色 MeshStandardMaterial：第一 pass 将灯光下的 3D 场景渲染到透明 linear RGBA8 WebGLRenderTarget；第二 pass 用全屏 quad、下方 GLSL 与 uniforms 输出效果。GLSL 输出 display-sRGB，禁止再次 tone mapping 或颜色转换。lightColor / shadowColor / highlightColor 直接采用 HEX/255。半调网点、像素化和色阶卡通使用 mix(shadowColor, highlightColor, value) 调色后应用 saturation；十字绣继续按阈值使用 lightColor 与 highlightColor，shadowColor 不影响针脚。\n5. 按 background.css 设置透明 canvas 下方的全屏 CSS 背景；背景网格使用 CSS px，与 Shader 网格不同。保持 alpha 合成。对照完整 spec 检查相机、模型身份、材质、灯光、颜色处理和全部参数。\n\n${lightingInstructions}\n\n## 完整 Spec\n\n\`\`\`json\n${json}\n\`\`\`\n\n## Vertex GLSL\n\n\`\`\`glsl\n${SHADER_VERTEX}\n\`\`\`\n\n## Fragment GLSL\n\n\`\`\`glsl\n${SHADER_FRAGMENT}\n\`\`\`\n`
}

export function buildExportDocument(input: ExportInput): { fileName: string; mimeType: string; content: string } {
  const spec = buildExportSpec(input)
  const effect = input.scope === 'shader' ? input.shader : input.background.grid ? 'grid' : 'solid'
  return {
    fileName: `shader-room-${input.scope}-${effect}.${input.format}`,
    mimeType: input.format === 'json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8',
    content: input.format === 'json' ? `${JSON.stringify(spec, null, 2)}\n` : markdown(input, spec) + ('interaction' in spec ? '\n## 鼠标互动复现\n\n完整实现 interaction.settings、interaction.uniforms 和 interaction.recipe。恢复捕获帧使用 interaction.snapshot；恢复交互时按照配方处理左下原点 UV、CSS 像素半径、跟随及强度缓动，按下拖动、进入面板、离开画布时淡出。触屏保持模型操作，系统减少动态效果时冻结互动时钟、清空速度并直接定位。互动开关独立于模型自转与效果播放，不能只复现静态 Shader。\n' : ''),
  }
}
