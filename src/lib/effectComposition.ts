import type { EffectLayer, ShaderId } from '../types'

const DIRECT_EFFECTS = new Set<ShaderId>(['particle-morph', 'engraving', 'hologram', 'iridescent', 'dissolve', 'magnetic-pull', 'material-reveal', 'elastic-indent'])
export function isComposableShader(shader: ShaderId): boolean { return !DIRECT_EFFECTS.has(shader) }

/** Reject invalid stacks rather than silently dropping or reordering selected effects. */
export function validateEffectLayers(layers: readonly EffectLayer[]): void {
  if (layers.length > 2) throw new Error('效果组合最多支持 2 个效果。')
  if (new Set(layers.map(layer => layer.shader)).size !== layers.length) throw new Error('效果组合不能包含重复效果。')
  if (layers.some(layer => !isComposableShader(layer.shader))) throw new Error('该模型材质或粒子效果暂不支持组合。')
}

/** Every post shader reads linear RGB; intermediate passes store display RGB unchanged. */
export function compositionFragment(source: string): string {
  if (source.includes('uniform float stackInputDisplay;')) return source
  const adapted = source.replace(/texture2D\s*\(\s*tDiffuse\s*,\s*/g, 'stackTap(')
  const adapter = `\nuniform float stackInputDisplay;
vec4 stackTap(vec2 uv) {
  vec4 s = texture2D(tDiffuse, uv);
  if (stackInputDisplay > .5) {
    s.rgb = mix(s.rgb / 12.92, pow((max(s.rgb, vec3(0.0)) + .055) / 1.055, vec3(2.4)), step(vec3(.04045), s.rgb));
  }
  return s;
}\n`
  // Insert after sampler declaration: functions cannot reference an undeclared sampler.
  const declaration = /uniform\s+sampler2D\s+tDiffuse\b[^;]*;/
  if (!declaration.test(adapted)) throw new Error('组合效果缺少 tDiffuse 输入。')
  return adapted.replace(declaration, match => match + adapter)
}

export const COMPOSITION_RECIPE = {
  maxLayers: 2,
  order: 'layers[0] is executed first; layers[1] reads its output. Preserve recorded order.',
  input: 'Capture only the transparent model scene into a linear RGBA8 target; background and CSS grid remain outside every effect pass.',
  intermediate: 'RGBA8 target tagged LinearSRGBColorSpace stores raw display-sRGB output bytes, straight alpha; no tone mapping, output conversion, or blending.',
  uniforms: 'stackInputDisplay=0 for the first pass, 1 for the second. compositionFragment wraps every tDiffuse sample with display-sRGB to linear conversion for the second pass.',
  material: 'Fullscreen passes use depthTest=false, depthWrite=false, blending=THREE.NoBlending, toneMapped=false; each has independent uniforms and parameter state.',
  adaptations: 'Original is an identity post pass encoding linear input to display-sRGB. Heatmap in layer 2 uses previous image luminance instead of scene normal temperature; comic in layer 2 uses previous color edges and luminance shading while retaining original depth.',
  geometryInputs: 'The comic pass retains the original scene depth texture. Contour and emboss operate on image luminance; layer-2 heatmap also uses image luminance rather than normals.',
}
