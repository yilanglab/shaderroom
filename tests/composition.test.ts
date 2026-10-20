import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_BACKGROUND, DEFAULT_LIGHTING, DEFAULT_PARAMS, DEFAULT_PARTICLE, DEFAULT_VIEW } from '../src/defaults'
import { DEFAULT_SURFACE } from '../src/render/surfaceEffects'
import { DEFAULT_REFERENCE } from '../src/render/referenceEffects'
import { DEFAULT_INTERACTION } from '../src/render/interaction'
import { buildExportSpec, buildExportDocument } from '../src/lib/export'
import { buildPrompt } from '../src/lib/prompt'
import { compositionFragment, isComposableShader } from '../src/lib/effectComposition'
import type { ExportInput, EffectLayer, ShaderId } from '../src/types'

function layer(shader: ShaderId, contrast = 1): EffectLayer {
  return { shader, params: { ...DEFAULT_PARAMS, contrast }, reference: { ...DEFAULT_REFERENCE }, interaction: { ...DEFAULT_INTERACTION } }
}
function input(layers?: EffectLayer[]): ExportInput {
  return { scope:'shader', format:'md', shader:'heatmap', layers,
    model:{ id:'sphere', name:'球体',kind:'sphere',source:'builtin' },
    params:{...DEFAULT_PARAMS}, reference:{...DEFAULT_REFERENCE}, interaction:{...DEFAULT_INTERACTION},
    particle:{...DEFAULT_PARTICLE}, surface:{...DEFAULT_SURFACE}, stats:null, background:{...DEFAULT_BACKGROUND}, lighting:structuredClone(DEFAULT_LIGHTING), view:{...DEFAULT_VIEW},
    snapshot:{camera:{position:[0,0,8],target:[0,0,0],near:.1,far:100,fov:30},model:{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]},viewport:{width:800,height:600,pixelRatio:1}},
  }
}
function stack(source: ExportInput) { return buildExportSpec(source) as any }

test('composition preserves two execution orders and independent parameter sets',()=>{
  const a=layer('heatmap',1.2), b=layer('pixelate',1.8)
  const first=stack(input([a,b])), second=stack(input([b,a]))
  assert.equal(first.effect.renderPath,'effect-stack')
  assert.deepEqual(first.composition.layers.map((x:any)=>x.effect.id),['heatmap','pixelate'])
  assert.deepEqual(second.composition.layers.map((x:any)=>x.effect.id),['pixelate','heatmap'])
  assert.deepEqual(first.composition.layers.map((x:any)=>x.parameters.contrast),[1.2,1.8])
  assert.deepEqual(first.composition.layers.map((x:any)=>x.uniforms.stackInputDisplay),[0,1])
  assert.match(first.composition.layers[1].glsl.fragment,/vec4 stackTap/)
  a.params.contrast=9
  assert.equal(first.composition.layers[0].parameters.contrast,1.2)
})

test('invalid stacks are rejected instead of silently truncating or changing order',()=>{
  assert.throws(()=>stack(input([layer('heatmap'),layer('heatmap')])),/重复/)
  assert.throws(()=>stack(input([layer('heatmap'),layer('toon'),layer('pixelate')])),/最多/)
  assert.throws(()=>stack(input([layer('heatmap'),layer('particle-morph')])),/不支持/)
  assert.equal(isComposableShader('engraving'),false)
})

test('no stack keeps standalone export; background scope omits stack completely',()=>{
  assert.equal('composition' in stack(input()),false)
  const source=input([layer('heatmap'),layer('pixelate')]);source.scope='background'
  assert.equal('composition' in stack(source),false)
  assert.equal('effect' in stack(source),false)
})

test('combined and effect-only prompts retain ordering recipe, without overriding host background',()=>{
  const source=input([layer('heatmap'),layer('pixelate')])
  const both=buildExportDocument(source).content
  assert.match(both,/效果组合复现/)
  assert.match(both,/stackInputDisplay=1/)
  const effect=buildPrompt(source,'effect')
  assert.match(effect,/保留宿主背景/)
  assert.match(effect,/"renderPath": "effect-stack"/)
  const json=JSON.parse(effect.split('```json\n')[1].split('\n```')[0])
  assert.equal('background' in json,false)
  // Layer specs need only effect data; background never enters either pass.
  assert.deepEqual(json.composition.layers.map((x:any)=>x.index),[0,1])
  assert.ok(json.composition.layers.every((x:any)=>!('background' in x)))
})

test('sampling adapter handles whitespace and grouped sampler declarations idempotently',()=>{
  const source='precision highp float; uniform sampler2D tDiffuse, wordAtlas; void main(){gl_FragColor=texture2D ( tDiffuse , vec2(.5));}'
  const result=compositionFragment(source)
  assert.match(result,/gl_FragColor=stackTap\(vec2/)
  assert.match(result,/uniform sampler2D tDiffuse, wordAtlas;[\s\S]*vec4 stackTap/)
  assert.equal(compositionFragment(result),result)
})

test('per-layer reference snapshots preserve independent glyph atlases and clocks',()=>{
  const source=input([layer('word-mosaic'),layer('glyph-matrix')])
  source.snapshot.composition=[
    {...structuredClone(source.snapshot),reference:{time:3.25,atlasDataUrl:'data:image/png;base64,first'}},
    {...structuredClone(source.snapshot),reference:{time:8.75,atlasDataUrl:'data:image/png;base64,second'}},
  ]
  const result=stack(source).composition.layers
  assert.equal(result[0].wordAtlas.pngDataUrl,'data:image/png;base64,first')
  assert.equal(result[0].snapshot.reference.time,3.25)
  assert.equal(result[1].snapshot.reference.time,8.75)
})

test('new effect uniforms export custom settings and complete reproduction recipe',()=>{
  const source=input();source.shader='watercolor';source.params.watercolorBrush=7.5;source.params.watercolorBleed=2.7
  const result=stack(source)
  assert.equal(result.uniforms.watercolorBrush,7.5)
  assert.equal(result.uniforms.watercolorBleed,2.7)
  assert.match(result.uniformConventions.extendedEffects.watercolor,/Kuwahara/)
  assert.equal(result.uniforms.stackInputDisplay,0)
})


test('a disabled layer does not inherit another layer hover activation',()=>{
  const disabled=layer('lens-distortion');disabled.interaction.enabled=false
  const source=input([disabled,layer('pixelate')])
  source.snapshot.interaction={pointer:[.5,.5],velocity:[0,0],amount:.8,time:2}
  const result=stack(source).composition.layers
  assert.equal(result[0].uniforms.uHover,0)
  assert.equal(result[0].interaction.uniforms.uHover,0)
  assert.equal(result[1].uniforms.uHover,0)
})
