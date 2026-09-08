import * as THREE from 'three'

export const REFERENCE_IDS = ['glyph-matrix', 'adaptive-grid', 'word-mosaic', 'pixel-glyph'] as const
export type ReferenceId = typeof REFERENCE_IDS[number]
export function isReferenceShader(id: string): id is ReferenceId { return (REFERENCE_IDS as readonly string[]).includes(id) }
export const DEFAULT_REFERENCE = {
  glyphSize: 8, glyphStroke: 1.1, glyphGlow: .35, glyphContrast: 1.3, glyphColor: '#ffe85a',
  adaptiveSize: 48, adaptiveDepth: 3, adaptiveThreshold: .18, adaptiveLineWidth: 1,
  adaptiveLineColor: '#b2b8c5', adaptiveDarkColor: '#172851', adaptiveLightColor: '#a394ef',
  wordHeight: 12, wordGap: 2, wordFill: .55, wordColor: '#e6d4c1', wordDarkColor: '#653a45', wordLightColor: '#667cb7',
  wordVocabulary: 'shader pixel signal render texture vertex fragment matrix surface light shadow space motion pattern noise color digital',
  pixelSize: 6, pixelAspect: 1.2, pixelGap: .7, pixelLevels: 7, pixelBrightness: .7, pixelCharacters: .1, pixelScan: .08, pixelColor: '#c4cad1',
  animate: false, speed: 3,
}
export type ReferenceSettings = typeof DEFAULT_REFERENCE
export interface ReferenceState { time: number; viewport: { width: number; height: number; pixelRatio: number } }
export function buildWordAtlasRecipe(vocabulary: string) {
  const words = vocabulary.split(/[\s,，;；]+/u).filter(Boolean).map(word => Array.from(word).slice(0, 24).join('')).slice(0, 64)
  if (!words.length) words.push('pixel')
  const slots = Array.from({ length: 64 }, (_, i) => {
    const limit = [4, 6, 9, 24][Math.floor(i / 16)]
    const pool = words.filter(word => Array.from(word).length <= limit)
    return pool.length ? pool[i % pool.length] : [...words].sort((a, b) => a.length - b.length)[0]
  })
  return { slots, width: 2048, height: 256, columns: 8, rows: 8, cellWidth: 256, cellHeight: 32, words, font: '20px monospace', padding: 8 }
}
/** Export this exact source with the settings; no network font or asset required. */
export const WORD_ATLAS_SOURCE = `function createWordAtlasCanvas(recipe) {
  const canvas = document.createElement('canvas');
  canvas.width = recipe.width; canvas.height = recipe.height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffffff'; ctx.font = recipe.font;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (let i = 0; i < 64; i++) {
    const word = recipe.slots[i];
    ctx.save(); ctx.translate((i % 8) * 256 + 128, Math.floor(i / 8) * 32 + 16);
    ctx.scale(224 / Math.max(1, ctx.measureText(word).width), 1);
    ctx.fillText(word, 0, 0); ctx.restore();
  }
  return canvas;
}`
function createWordAtlasCanvas(recipe: ReturnType<typeof buildWordAtlasRecipe>) {
  const canvas = document.createElement('canvas'); canvas.width = recipe.width; canvas.height = recipe.height
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#ffffff'; ctx.font = recipe.font
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
  for (let i = 0; i < 64; i++) {
    const word = recipe.slots[i]
    ctx.save(); ctx.translate((i % 8) * 256 + 128, Math.floor(i / 8) * 32 + 16)
    ctx.scale(224 / Math.max(1, ctx.measureText(word).width), 1)
    ctx.fillText(word, 0, 0); ctx.restore()
  }
  return canvas
}
export const REFERENCE_INPUT_MATERIAL = { color: '#b6b6b6', roughness: .4, metalness: .1, side: 'DoubleSide' } as const
export const REFERENCE_RECIPE = {
  inputMaterial: REFERENCE_INPUT_MATERIAL,
  pipeline: 'Render neutral #b6b6b6 model with current lighting to linear RGBA target, then fullscreen postprocess. Output is display-sRGB with alpha, NoBlending and no tone/color conversion chunks. CSS background remains visible.',
  grid: 'Bottom-left origin; all sizes and widths are CSS pixels. viewport width/height are CSS dimensions, pixelRatio is recorded separately. Keep drawing-buffer target at width*pixelRatio,height*pixelRatio.',
  glyph: 'Fixed geometric symbol grid with per-cell stable hash variation, brightness-grouped cross/outline/solid glyphs (shadow 60% cross, midtone 15% cross, highlight 75% solid), and soft glow extending beyond glyph edges.',
  adaptive: 'At most 4 quadtree subdivisions, based on alpha/brightness differences at center and four inset corners. Each child aligns to its parent. Grid exists over entire viewport, tinted continuous source image within model.',
  words: 'Fixed horizontal rows, each four-unit block split into two stable unequal labels. Atlas sampled once per fragment; no per-frame CPU layout. Model center samples determine coverage, underlying source provides color.',
  pixel: 'Quantized grey cells with fine gaps and sparse embedded 3x5 bitmap letters, with dark/light inverse choices and subtle horizontal scan lines.',
  animation: 'Default disabled. Outer runtime advances time only while animate and not prefers-reduced-motion. Tick=floor(time*speed); only sparse letters/symbol choices change, layout is stable.',
  atlas: { font: '20px monospace', cells: 64, size: [2048, 256], flipY: false, colorSpace: 'NoColorSpace', filter: 'LinearFilter', needsUpdate: 'Only when vocabulary changes. Font depends on platform monospace; bundle a font separately if cross-platform glyph pixel identity is required.' },
} as const
export const REFERENCE_VERTEX = `varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.0,1.0);}`
export const REFERENCE_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse, wordAtlas;
uniform vec2 resolution;
uniform float mode,tick,glyphSize,glyphStroke,glyphGlow,glyphContrast;
uniform vec3 glyphColor;
uniform float adaptiveSize,adaptiveDepth,adaptiveThreshold,adaptiveLineWidth;
uniform vec3 adaptiveLineColor,adaptiveDarkColor,adaptiveLightColor;
uniform float wordHeight,wordGap,wordFill;
uniform vec3 wordColor,wordDarkColor,wordLightColor;
uniform float pixelSize,pixelAspect,pixelGap,pixelLevels,pixelBrightness,pixelCharacters,pixelScan;
uniform vec3 pixelColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float lum(vec4 s){return dot(s.rgb,vec3(.299,.587,.114));}
vec4 source(vec2 p){return texture2D(tDiffuse,clamp(p/resolution,vec2(0.0),vec2(1.0)));}
float line(float d,float width){return 1.0-smoothstep(width-.45,width+.45,d);}
float bitmap(vec2 local,float kind){
  vec2 p=floor(local*vec2(3.,5.)); if(p.x<0.||p.x>2.||p.y<0.||p.y>4.)return 0.;
  float bits=kind<1.?31599.:kind<2.?31183.:kind<3.?29671.:kind<4.?23405.:kind<5.?31207.:23147.;
  return mod(floor(bits/pow(2.,p.x+(4.-p.y)*3.)),2.);
}
void main(){
 vec2 p=vUv*resolution;
 if(mode<.5){
  float size=max(4.,glyphSize); vec2 cell=floor(p/size); vec4 s=source((cell+.5)*size);
  if(s.a<.08){gl_FragColor=vec4(0.);return;}
  float b=clamp((sqrt(max(lum(s),0.))-.5)*glyphContrast*.7+.45,0.,1.);
  vec2 q=(fract(p/size)-.5)*size; float r=size*.29;
  float rnd=hash(cell+floor(tick)*.173);
  float choice=b<.50?(rnd<.60?0.:1.):b<.60?(rnd<.15?0.:1.):(rnd<.75?3.:1.);
  float dist=choice<1.?min(abs(q.x-q.y),abs(q.x+q.y))*.7071:abs(max(abs(q.x),abs(q.y))-r);
  float inside=1.-smoothstep(r,r+.7,max(abs(q.x),abs(q.y)));
  float ink=choice>2.5?inside:line(dist,glyphStroke*.5)*inside;
  float outside=max(max(abs(q.x),abs(q.y))-r,0.);
  float glowDistance=choice>2.5?outside:dist;
  float halo=exp(-glowDistance*glowDistance/3.)*exp(-outside*outside/3.)*glyphGlow;
  float opacity=clamp(ink+halo,0.,1.);
  gl_FragColor=vec4(glyphColor*(.6+.4*b),opacity*s.a);return;
 }
 if(mode<1.5){
  float size=max(8.,adaptiveSize); vec2 origin=floor(p/size)*size;
  for(int depth=0;depth<4;depth++){
   vec4 a=source(origin+size*vec2(.15,.15)),b=source(origin+size*vec2(.85,.15));
   vec4 c=source(origin+size*vec2(.15,.85)),d=source(origin+size*vec2(.85,.85)),e=source(origin+size*.5);
   float lo=min(min(lum(a)*a.a,lum(b)*b.a),min(lum(c)*c.a,min(lum(d)*d.a,lum(e)*e.a)));
   float hi=max(max(lum(a)*a.a,lum(b)*b.a),max(lum(c)*c.a,max(lum(d)*d.a,lum(e)*e.a)));
   float amin=min(min(a.a,b.a),min(c.a,min(d.a,e.a))),amax=max(max(a.a,b.a),max(c.a,max(d.a,e.a)));
   if(float(depth)>=adaptiveDepth || max(hi-lo,(amax-amin)*.6)<adaptiveThreshold)break;
   size*=.5; origin=floor(p/size)*size;
  }
  vec2 local=p-origin; float border=line(min(min(local.x,local.y),min(size-local.x,size-local.y)),adaptiveLineWidth*.5);
  vec4 s=texture2D(tDiffuse,vUv); float light=smoothstep(.06,.90,clamp(lum(s),0.,1.));
  vec3 col=mix(adaptiveDarkColor,adaptiveLightColor,light);
  float alpha=max(s.a,border*.5);
  gl_FragColor=vec4(mix(col,adaptiveLineColor,border),alpha);return;
 }
 if(mode<2.5){
  float h=max(8.,wordHeight); float row=floor(p.y/h); float unit=h*1.35;
  float block=floor(p.x/(unit*4.)); float split=1.+floor(hash(vec2(block,row))*3.);
  float offset=mod(p.x,unit*4.); float section=step(split*unit,offset);
  float start=block*4.*unit+section*split*unit; float width=mix(split,4.-split,section)*unit;
  vec2 center=vec2(start+width*.5,(row+.5)*h); vec4 s=source(center);
  if(s.a<.08){gl_FragColor=vec4(0.);return;}
  vec2 local=vec2((p.x-start)/width,fract(p.y/h));
  float gap=max(.5,wordGap); float edge=min(min(local.x*width,(1.-local.x)*width),min(local.y*h,(1.-local.y)*h));
  float mask=smoothstep(gap*.5,gap*.5+.6,edge);
  float id=(mix(split,4.-split,section)-1.)*16.+floor(hash(vec2(block*2.+section,row)+tick*.13)*16.);
  vec2 atlasUV=(vec2(mod(id,8.),floor(id/8.))+vec2(local.x,1.-local.y))/8.;
  float text=texture2D(wordAtlas,atlasUV).a;
  float b=clamp(lum(s),0.,1.); vec3 fill=mix(wordDarkColor,wordLightColor,b);
  float opacity=max(text,wordFill)*mask*s.a;
  gl_FragColor=vec4(mix(fill,wordColor,text),opacity);return;
 }
 vec2 size=vec2(max(4.,pixelSize)*max(.5,pixelAspect),max(4.,pixelSize));
 vec2 cell=floor(p/size); vec4 s=source((cell+.5)*size);
 if(s.a<.08){gl_FragColor=vec4(0.);return;}
 vec2 q=fract(p/size); float gap=min(min(q.x*size.x,(1.-q.x)*size.x),min(q.y*size.y,(1.-q.y)*size.y));
 float mask=smoothstep(pixelGap*.5,pixelGap*.5+.65,gap);
 float levels=max(2.,floor(pixelLevels)); float b=clamp(pow(max(lum(s),0.),.7)*pixelBrightness,0.,1.);
 b=floor(b*(levels-1.)+.5)/(levels-1.); float rnd=hash(cell+tick*.11);
 float marked=step(rnd,pixelCharacters); float inv=step(.5,hash(cell+17.));
 float letter=bitmap((q-.2)/.6,floor(hash(cell+tick*.3+3.)*6.));
 float grey=mix(b,mix(mix(.12,.8,inv),mix(.85,.03,inv),letter),marked);
 grey*=1.-pixelScan*(.5+.5*sin(p.y*3.14159));
 gl_FragColor=vec4(pixelColor*grey,mask*s.a);
}`
function rgb(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) }
export function buildReferenceUniforms(id: ReferenceId, settings: ReferenceSettings, state: ReferenceState): Record<string, number | number[]> {
  const values: Record<string, number | number[]> = { mode: REFERENCE_IDS.indexOf(id), resolution: [state.viewport.width, state.viewport.height], tick: Math.floor(Math.max(0, state.time) * settings.speed) }
  for (const [key, value] of Object.entries(settings)) {
    if (key === 'wordVocabulary' || key === 'animate' || key === 'speed') continue
    values[key] = typeof value === 'string' ? rgb(value) : value as number
  }
  return values
}
export function createReferenceMaterial(texture: THREE.Texture) {
  return new THREE.ShaderMaterial({ vertexShader: REFERENCE_VERTEX, fragmentShader: REFERENCE_FRAGMENT,
    uniforms: { tDiffuse: { value: texture }, wordAtlas: { value: null } }, depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending, toneMapped: false })
}
export function updateReferenceMaterial(material: THREE.ShaderMaterial, settings: ReferenceSettings, id: ReferenceId, state: ReferenceState) {
  for (const [name, value] of Object.entries(buildReferenceUniforms(id, settings, state))) {
    const previous = material.uniforms[name]
    if (!previous) material.uniforms[name] = { value: Array.isArray(value) ? value.length === 2 ? new THREE.Vector2(...value as [number, number]) : new THREE.Vector3(...value as [number, number, number]) : value }
    else if (Array.isArray(value)) previous.value.fromArray(value)
    else previous.value = value
  }
  if (id === 'word-mosaic' && material.userData.vocabulary !== settings.wordVocabulary) {
    material.uniforms.wordAtlas.value?.dispose()
    const texture = new THREE.CanvasTexture(createWordAtlasCanvas(buildWordAtlasRecipe(settings.wordVocabulary)))
    texture.flipY = false; texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter; texture.generateMipmaps = false
    material.uniforms.wordAtlas.value = texture; material.userData.vocabulary = settings.wordVocabulary
  }
}
export function disposeReferenceMaterial(material: THREE.ShaderMaterial) { material.uniforms.wordAtlas.value?.dispose(); material.dispose() }

export function getReferenceAtlasDataUrl(material: THREE.ShaderMaterial): string {
  const canvas = material.uniforms.wordAtlas.value?.image as HTMLCanvasElement | undefined
  return canvas?.toDataURL('image/png') ?? ''
}
