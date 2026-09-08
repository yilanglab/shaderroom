import { publicPath } from '../lib/publicPath'
import { ASCII_GLSL, ASCII_RECIPE } from './ascii'
import type { ShaderId } from '../types'
import { DEFAULT_LIGHTING } from '../defaults'
import { buildLightRecipe, LIGHTING_CONVENTIONS } from './lighting'
import { MODEL_SCALE_RANGE, MODEL_ZOOM_WHEEL } from './modelZoom'
import { PARTICLE_RECIPE } from './particleMorph'

/** Shared, JSON-safe rendering contract consumed by both the live stage and exports. */
export const SHADER_MODES: Record<ShaderId, number> = {
  original: 0, 'cross-stitch': 1, halftone: 2, pixelate: 3, toon: 4, 'particle-morph': 5, ascii: 6, engraving: 7, hologram: 8, iridescent: 9, dissolve: 10, 'glyph-matrix': 11, 'adaptive-grid': 12, 'word-mosaic': 13, 'pixel-glyph': 14,
}

export const SCENE_RECIPE = {
  particle: PARTICLE_RECIPE,
  ascii: ASCII_RECIPE,
  loaders: {
    fbx: { import: 'three/addons/loaders/FBXLoader.js', setup: "new FBXLoader(manager).parse(arrayBuffer, '')", behavior: 'For model.kind=fbx use FBXLoader, keep initial pose and do not create AnimationMixer. Register a TextureLoader handler matching all extensions: load only embedded images using the blob or data URL scheme, return tagged empty textures for external paths, then remove those tagged maps from materials. Revoke embedded blob URLs after image load/error. Preserve material colors, root transforms and normal normalization. No external texture requests or companion files are needed.' },
    gltf: { import: 'three/addons/loaders/GLTFLoader.js', setup: 'new GLTFLoader().setDRACOLoader(dracoLoader).setKTX2Loader(ktx2Loader).setMeshoptDecoder(MeshoptDecoder)', supportedCompressionExtensions: ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu'] },
    draco: { import: 'three/addons/loaders/DRACOLoader.js', decoderPath: publicPath('decoders/draco/'), workerLimit: 2, setup: `new DRACOLoader().setDecoderPath(${JSON.stringify(publicPath("decoders/draco/"))}).setWorkerLimit(2)`, localFiles: ['public/decoders/draco/draco_decoder.js', 'public/decoders/draco/draco_wasm_wrapper.js', 'public/decoders/draco/draco_decoder.wasm'], copyFrom: 'node_modules/three/examples/jsm/libs/draco/gltf/', behavior: 'Load WASM decoder plus wrapper on demand; use the local JavaScript decoder if WebAssembly is unavailable.' },
    meshopt: { import: 'three/addons/libs/meshopt_decoder.module.js', namedExport: 'MeshoptDecoder', setup: 'gltfLoader.setMeshoptDecoder(MeshoptDecoder)', behavior: 'The Three.js module embeds its decoder WASM and is bundled by Vite. It needs no external resource URL. No Meshopt worker pool is created.' },
    ktx2: { import: 'three/addons/loaders/KTX2Loader.js', transcoderPath: publicPath('decoders/basis/'), workerLimit: 2, setup: `new KTX2Loader().setTranscoderPath(${JSON.stringify(publicPath("decoders/basis/"))}).setWorkerLimit(2).detectSupport(renderer)`, localFiles: ['public/decoders/basis/basis_transcoder.js', 'public/decoders/basis/basis_transcoder.wasm'], copyFrom: 'node_modules/three/examples/jsm/libs/basis/', behavior: 'Detect renderer compression support before parsing. Load the local Basis Universal transcoder on demand for embedded KTX2 textures.' },
    assets: 'Copy the five listed decoder files to the public folders. Serve them from the same origin using the configured paths; no CDN, provider or remote transcoder is used. If deploying beneath a URL prefix, prepend that prefix to both decoder paths.',
    lifecycle: 'Reuse one GLTFLoader, DRACOLoader and KTX2Loader per mounted stage. On unmount, ignore stale load results and dispose their scene resources. Wait for already-started GLB parsing to settle before disposing Draco/KTX2 workers and worker Blob URLs, preventing late initialization from recreating workers. Meshopt has no per-stage worker resources.',
  },
  renderer: {
    engine: 'three', version: '0.183.2', alpha: true, antialias: true,
    clearColor: '#000000', clearAlpha: 0, premultipliedAlpha: false, toneMapping: 'NoToneMapping',
    outputColorSpace: 'SRGBColorSpace', pixelRatio: 'min(devicePixelRatio, 2)',
    shadows: false, renderTarget: { format: 'RGBAFormat', type: 'UnsignedByteType', colorSpace: 'LinearSRGBColorSpace', depthBuffer: true, stencilBuffer: false, minFilter: 'LinearFilter', magFilter: 'LinearFilter', samples: 0 },
  },
  camera: { type: 'PerspectiveCamera', fov: 45, near: 0.1, far: 100, farAdjustment: 'max(100, initialDistance * 5); exported snapshot.camera.far is the actual value.', initialDirection: [0, 0, 1], target: [0, 0, 0], viewOffset: null },
  lights: buildLightRecipe(DEFAULT_LIGHTING),
  lightingConventions: LIGHTING_CONVENTIONS,
  material: { styledEffects: { type: 'MeshStandardMaterial', color: '#ffffff', roughness: 0.4, metalness: 0.1, side: 'DoubleSide', transparent: false }, original: 'Keep every GLTF mesh material and material array; procedural meshes use the same white MeshStandardMaterial. No animation clips are played.' },
  geometries: {
    sphere: { type: 'SphereGeometry', radius: 1.5, widthSegments: 64, heightSegments: 48 },
    'torus-knot': { type: 'TorusKnotGeometry', radius: 1, tube: 0.34, tubularSegments: 180, radialSegments: 24, p: 2, q: 3 },
    'rounded-cube': { type: 'RoundedBoxGeometry', width: 2.4, height: 2.4, depth: 2.4, segments: 6, radius: 0.32 },
  },
  normalization: {
    normalizedLargestDimension: 4,
    bounds: 'Update the loaded root world matrices, then new Box3().setFromObject(root); use its center and size.',
    transform: 'Let s = 4 / max(size.x, size.y, size.z). Wrap the unchanged loaded root in a Group with scale=(s,s,s) and position=-center*s. Wrap that normalization group in the user pose group.',
    snapshot: 'snapshot.model describes the outer pose group, after normalization. position and scale are world-unit translation and unitless scale; rotation is Euler XYZ in radians, including accumulated auto-rotation. GLTF root transforms remain inside the normalization group.',
  },
  framing: {
    desktopBreakpoint: 900, desktopReservedWidth: 650, mobileReservedWidth: 48,
    desktopReservedHeight: 240, mobileReservedHeight: 280, safety: 0.9,
    formula: 'radius = length(originalBounds.size) * normalizationScale / 2. availableWidth = max(160, width - (width > 900 ? 650 : 48)); availableHeight = max(180, height - (width > 900 ? 240 : 280)); halfAngle = atan(tan(fov*pi/360) * min(availableWidth/height, availableHeight/height) * 0.9); initialDistance = radius / sin(halfAngle). Camera distance stays at initialDistance; on resize recompute it while retaining the orbit direction and view.scale. User scale is deliberately not auto-fitted.',
  },
  controls: { type: 'OrbitControls', enableDamping: true, dampingFactor: 0.08, enablePan: false, enableZoom: false, touches: { ONE: 'ROTATE', TWO: null }, rotateSpeed: 0.7, minDistance: 'initialDistance', maxDistance: 'initialDistance', target: [0, 0, 0] },
  modelZoom: { ...MODEL_SCALE_RANGE, wheel: { ...MODEL_ZOOM_WHEEL, formula: 'deltaPixels = deltaY for pixel mode, deltaY * linePixels for line mode, or deltaY * canvas.clientHeight for page mode (fallbackPagePixels when height is zero). nextScale = clamp(continuousScale * exp(clamp(-deltaPixels * exponentPerPixel, -50, 50)), min, max). Round the published value to two decimals and retain sub-step accumulation.' }, state: 'view.scale is the single source for canvas wheel, two-touch pinch and the panel model-scale control. Apply it only to pose.scale; camera dolly is disabled. Reset view or select another model to restore 1.', inputScope: 'Only wheel and touch gestures starting on the canvas change model scale. Scrolling either panel scrolls its content. Preserve camera orbit direction and model pose while scaling.', pinch: 'Multiply current scale by the ratio of new to previous two-touch distance, clamp to the shared range, then round to two decimals. Keep fractional accumulation between events; rebase when the panel changes scale. End or cancel the gesture when a tracked pointer is released.' },
  rotation: { inputUnit: 'degrees', snapshotUnit: 'radians', order: 'XYZ', autoRotateSpeedUnit: 'radians/second', formula: 'pose.rotation = radians(view.rotationX, view.rotationY, view.rotationZ) + (0, accumulatedAutoRotation, 0); accumulatedAutoRotation += view.rotateSpeed * min(frameDeltaSeconds, 0.05) while view.autoRotate is true.', initialAutoRotation: 0, scale: 'pose.scale = (view.scale, view.scale, view.scale)' },
  colorPipeline: {
    sceneInput: 'GLTF color textures use their GLTFLoader-assigned color spaces. Three.js lighting runs in linear sRGB. Assign light HEX colors with light.color.set(hex), allowing standard sRGB-to-linear conversion; actual intensities and directional positions come from the current light recipe. No tone mapping or exposure adjustment.',
    original: 'Render the scene directly to the transparent canvas with renderer.outputColorSpace=SRGBColorSpace, preserving original materials.',
    styledEffects: 'Temporarily replace mesh materials with the shared white standard material. Render to linear RGBA8 target. Feed that texture into the postprocess shader; thresholds operate on linear target RGB, exactly as the original Claw stitch shader.',
    parameterColors: 'Decode #RRGGBB directly to display-sRGB channels divided by 255. Assign with THREE.Color().setRGB(r/255,g/255,b/255) without a color-space conversion, exactly matching exported uniform numbers.',
    output: 'Postprocess outputs display-sRGB directly; do not append colorspace_fragment or tonemapping_fragment. The full-screen ShaderMaterial uses transparent=false, depthTest=false, depthWrite=false and NoBlending; alpha is written directly to the alpha canvas for CSS background compositing.',
  },
  postProcessing: {
    modes: SHADER_MODES,
    vertexGeometry: { type: 'PlaneGeometry', width: 2, height: 2 },
    camera: { type: 'OrthographicCamera', left: -1, right: 1, top: 1, bottom: -1, near: 0, far: 1 },
    resolution: 'renderer.getDrawingBufferSize(); renderTarget has those physical pixel dimensions. gridSize is measured in physical pixels, not CSS pixels.',
    grid: 'gridUV = floor(vUv * resolution / gridSize) * gridSize / resolution; centerUV = gridUV + gridSize * 0.5 / resolution; local = fract(vUv * resolution / gridSize). Grid origin is the bottom-left of the full viewport.',
    crossStitch: 'Claw original algorithm: center alpha < 0.1 is empty; both local coordinates must be >0.05 and <0.95; abs(local.x-local.y)<thickness or abs(local.x+local.y-1)<thickness makes a stitch. brightness=dot(linearRGB, vec3(.299,.587,.114)); brightness>threshold2 uses highlightColor, else brightness>threshold1 uses lightColor, else transparent.',
    palette: 'For halftone, pixelate and toon: color=mix(shadowColor,highlightColor,value); outputRGB=clamp(mix(vec3(dot(color,vec3(.299,.587,.114))),color,saturation),0,1). shadowColor and highlightColor are independent display-sRGB endpoint colors. The cross-stitch lightColor remains separate.',
    halftone: 'Sample the physical grid center. brightness=clamp((luma-0.5)*contrast+0.5,0,1). Radius=clamp(dotSize*(0.25+0.75*brightness),0.03,0.7). Draw a smooth circular dot in the grid using palette(brightness), including shadowColor/highlightColor/saturation; outside dots is transparent.',
    pixelate: 'Fill each physical grid cell from its center sample. brightness=clamp((luma-0.5)*contrast+0.5,0,1); count=max(2,floor(levels)); quantized=floor(brightness*(count-1)+0.5)/(count-1). color=mix(shadowColor,highlightColor,quantized), then adjust display-sRGB saturation. Thus gridSize controls pixel dimensions, levels controls palette steps, and saturation controls palette chroma.',
    toon: 'Sample every fragment without a grid. Clamp levels to at least 2; quantize= floor(brightness*(levels-1)+0.5)/(levels-1). Map quantize through the same palette and saturation as pixelate; retain the source alpha.',
    uniforms: ['tDiffuse', 'resolution', 'mode', 'asciiSize', 'asciiTick', 'gridSize', 'thickness', 'threshold1', 'threshold2', 'lightColor', 'shadowColor', 'highlightColor', 'dotSize', 'contrast', 'levels', 'saturation'],
  },
} as const

export const SHADER_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const SHADER_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float mode;
uniform float gridSize;
uniform float asciiSize;
uniform float asciiTick;
uniform float thickness;
uniform float threshold1;
uniform float threshold2;
uniform vec3 lightColor;
uniform vec3 shadowColor;
uniform vec3 highlightColor;
uniform float dotSize;
uniform float contrast;
uniform float levels;
uniform float saturation;
varying vec2 vUv;

float luma(vec3 rgb) { return dot(rgb, vec3(0.299, 0.587, 0.114)); }
float adjustedBrightness(vec3 rgb) { return clamp((luma(rgb) - 0.5) * contrast + 0.5, 0.0, 1.0); }
float quantizedBrightness(float value) {
  float count = max(2.0, floor(levels));
  return floor(value * (count - 1.0) + 0.5) / (count - 1.0);
}
vec3 palette(float value) {
  vec3 color = mix(shadowColor, highlightColor, value);
  return clamp(mix(vec3(luma(color)), color, saturation), 0.0, 1.0);
}
${ASCII_GLSL}
void main() {
  if (mode < 0.5) {
    gl_FragColor = texture2D(tDiffuse, vUv);
    return;
  }
  float cellSize = max(gridSize, 1.0);
  vec2 cell = mode > 5.5 ? vec2(max(asciiSize, 9.0)*7.0/9.0, max(asciiSize, 9.0)) : vec2(cellSize);
  vec2 gridUV = floor(vUv * resolution / cell) * cell / resolution;
  vec2 centerUV = gridUV + (cell * 0.5) / resolution;
  vec4 texel = texture2D(tDiffuse, mode > 3.5 && mode < 4.5 ? vUv : centerUV);
  vec2 local = fract(vUv * resolution / cell);
  if (texel.a < 0.1) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (mode < 1.5) {
    float d1 = abs(local.x - local.y);
    float d2 = abs(local.x + local.y - 1.0);
    bool inBounds = local.x > 0.05 && local.x < 0.95 && local.y > 0.05 && local.y < 0.95;
    bool isCross = (d1 < thickness || d2 < thickness) && inBounds;
    float brightness = luma(texel.rgb);
    if (!isCross) gl_FragColor = vec4(0.0);
    else if (brightness > threshold2) gl_FragColor = vec4(highlightColor, 1.0);
    else if (brightness > threshold1) gl_FragColor = vec4(lightColor, 1.0);
    else gl_FragColor = vec4(0.0);
    return;
  }
  float brightness = adjustedBrightness(texel.rgb);
  if (mode > 5.5) {
    gl_FragColor = vec4(palette(brightness), texel.a * asciiMask(brightness, local, floor(vUv * resolution / cell)));
  } else if (mode < 2.5) {
    float radius = clamp(dotSize * (0.25 + 0.75 * brightness), 0.03, 0.7);
    float edge = 1.0 / cellSize;
    float alpha = 1.0 - smoothstep(radius - edge, radius + edge, length(local - 0.5));
    gl_FragColor = vec4(palette(brightness), texel.a * alpha);
  } else if (mode < 3.5) {
    gl_FragColor = vec4(palette(quantizedBrightness(brightness)), texel.a);
  } else {
    gl_FragColor = vec4(palette(quantizedBrightness(brightness)), texel.a);
  }
}
`
