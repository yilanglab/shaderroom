import type { ExtendedParams } from './render/extendedEffects'
import type { ReferenceSettings } from './render/referenceEffects'
import type { NewInteractiveId, InteractionSettings, InteractionSnapshot } from './render/interaction'
import type { SurfaceSettings, SurfaceSnapshot, DissolveState } from './render/surfaceEffects'
export type ShaderId = NewInteractiveId | 'contour-lines' | 'watercolor' | 'emboss' | 'pixel-sort' | 'frost' | 'glass-tiles' | 'crt-screen' | 'shatter' | 'fluted-glass' | 'dither' | 'heatmap' | 'comic-line' | 'cross-stitch' | 'original' | 'halftone' | 'pixelate' | 'toon' | 'particle-morph' | 'ascii' | 'engraving' | 'hologram' | 'iridescent' | 'dissolve' | 'glyph-matrix' | 'adaptive-grid' | 'word-mosaic' | 'pixel-glyph'
export type ModelKind = 'fbx' | 'glb' | 'sphere' | 'torus-knot' | 'rounded-cube'
export interface ModelEntry {
  id: string
  name: string
  kind: ModelKind
  url?: string
  source: 'builtin' | 'upload'
  fileName?: string
  fileSize?: number
  sha256?: string
  thumbnail?: string
}
export interface ShaderParams extends Partial<ExtendedParams> {
  fluteAngle?: number
  fluteFrequency?: number
  fluteSoftness?: number
  fluteRefraction?: number
  fluteAberration?: number
  fluteHighlight?: number
  ditherSize?: number
  ditherPattern?: number
  ditherThreshold?: number
  ditherSpread?: number
  heatCold?: string
  heatCool?: string
  heatMid?: string
  heatWarm?: string
  heatHot?: string
  heatContrast?: number
  heatOffset?: number
  heatScale?: number
  heatOrganic?: number
  heatGrain?: number
  comicWidth?: number
  comicHatching?: boolean
  comicHatchGroups?: number
  comicHatchAngle?: number
  comicDetail?: number
  comicInk?: string
  comicPaper?: string
  asciiSize: number
  asciiRandomize: boolean
  asciiSpeed: number
  gridSize: number
  thickness: number
  threshold1: number
  threshold2: number
  lightColor: string
  shadowColor: string
  highlightColor: string
  dotSize: number
  contrast: number
  levels: number
  saturation: number
}
export type BackgroundKind = 'flow' | 'aurora' | 'noise' | 'orbit'
export interface FlowSettings { kind?: BackgroundKind; scale?: number; intensity?: number; grain?: number; enabled: boolean; colors: [string, string, string, string]; speed: number; distortion: number; seed: number }
export interface BackgroundSettings {
  flow?: FlowSettings
  color: string
  grid: boolean
  gridSize: number
  gridOpacity: number
}
export interface LightSettings {
  enabled: boolean
  color: string
  intensity: number
}
export interface DirectionalLightSettings extends LightSettings {
  azimuth: number
  elevation: number
}
export interface LightingSettings {
  ambient: LightSettings
  key: DirectionalLightSettings
  fill: DirectionalLightSettings
}
export interface ViewSettings {
  autoRotate: boolean
  rotateSpeed: number
  scale: number
  rotationX: number
  rotationY: number
  rotationZ: number
}
export interface ParticleSettings {
  count: number
  size: number
  color: string
  highlightColor: string
  duration: number
  morphStartAngle: number
  driftAmplitude: number
  scatter: number
  floatAmplitude: number
  floatSpeed: number
  rotationAxis: 'x' | 'y' | 'z'
  modelRotate: boolean
  modelRotateSpeed: number
}
export interface ParticlePlayback {
  phase: 'logo' | 'to-model' | 'model' | 'to-logo'
  progress: number
  ready: boolean
}
export interface ParticleSnapshot extends ParticlePlayback {
  elapsed: number
  idleElapsed: number
  anchorFloat: number
  anchorModelRotation: number
  transitionDuration: number
  modelRotation: number
  floatOffset: number
  reducedMotion: boolean
}
export interface ModelStats { meshes: number; triangles: number; animations: number }
export interface SceneSnapshot {
  composition?: SceneSnapshot[]
  backgroundFlowTime?: number
  camera: { position: [number, number, number]; target: [number, number, number]; fov: number; near: number; far: number }
  model: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }
  viewport: { width: number; height: number; pixelRatio: number }
  reducedMotion?: boolean
  reference?: { time: number; atlasDataUrl?: string }
  surface?: SurfaceSnapshot
  ascii?: { elapsed: number; tick: number; randomize: boolean }
  particle?: ParticleSnapshot
  interaction?: InteractionSnapshot
}
export interface StageHandle {
  resetView(): void
  syncScale(scale: number): void
  playParticle(): void
  resetParticle(): void
  playDissolve(): void
  setDissolveProgress(value: number): void
  getSnapshot(): SceneSnapshot
}
export interface EffectLayer { shader: ShaderId; params: ShaderParams; reference: ReferenceSettings; interaction: InteractionSettings }
export interface StageProps {
  layers?: EffectLayer[]
  interaction: InteractionSettings
  model: ModelEntry
  shader: ShaderId
  params: ShaderParams
  lighting: LightingSettings
  view: ViewSettings
  reference: ReferenceSettings
  surface: SurfaceSettings
  particle: ParticleSettings
  onDissolveState: (state: DissolveState) => void
  onParticleState: (state: ParticlePlayback) => void
  onScaleChange: (scale: number) => void
  onThumbnail: (id: string, url: string) => void
  onReady: (stats: ModelStats) => void
  onError: (message: string) => void
  onLoading: () => void
}
export type ExportScope = 'background' | 'shader'
export type ExportFormat = 'json' | 'md'
export interface ExportInput {
  layers?: EffectLayer[]
  interaction?: InteractionSettings
  scope: ExportScope
  format: ExportFormat
  model: ModelEntry
  shader: ShaderId
  params: ShaderParams
  background: BackgroundSettings
  lighting: LightingSettings
  view: ViewSettings
  reference: ReferenceSettings
  surface: SurfaceSettings
  particle: ParticleSettings
  snapshot: SceneSnapshot
  stats: ModelStats | null
}
