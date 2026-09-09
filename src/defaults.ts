import { publicPath } from './lib/publicPath'
import type { BackgroundSettings, LightingSettings, ModelEntry, ParticleSettings, ShaderId, ShaderParams, ViewSettings } from './types'

export const DEFAULT_MODELS: ModelEntry[] = [
  { id: 'claw', name: 'Claw 龙虾', kind: 'glb', url: publicPath('models/claw.glb'), source: 'builtin', fileName: 'claw.glb', fileSize: 140620, sha256: 'c01fc6e429f4d1c0d81c00306858be5451b2d497a009d875890d63b118bc17f5' },
  { id: 'knot', name: '环面纽结', kind: 'torus-knot', source: 'builtin' },
  { id: 'sphere', name: '球体', kind: 'sphere', source: 'builtin' },
  { id: 'cube', name: '圆角方块', kind: 'rounded-cube', source: 'builtin' },
]
export const SHADERS: { id: ShaderId; name: string; description: string; tag: string }[] = [
  { id: 'original', name: '原始材质', description: '查看模型自身的颜色与材质', tag: '基础' },
  { id: 'comic-line', name: '漫画线描', description: '白色填充与清晰的轮廓、结构墨线', tag: '漫画 · 线稿' },
  { id: 'lens-distortion', name: '流动透镜', description: '鼠标周围的放大、折射与轻微色散', tag: '鼠标 · 光学' },
  { id: 'liquid-ripple', name: '液面涟漪', description: '光滑影像随鼠标泛起波纹', tag: '鼠标 · 流体' },
  { id: 'magnetic-pull', name: '磁力拉伸', description: '表面向鼠标聚拢并弹性恢复', tag: '鼠标 · 软体' },
  { id: 'prism-trail', name: '棱镜拖影', description: '移动时产生彩色分离与短暂拖尾', tag: '鼠标 · 色散' },
  { id: 'material-reveal', name: '材质显影', description: '金属表面显露发光结构网格', tag: '鼠标 · 显影' },
  { id: 'elastic-indent', name: '弹性压痕', description: '局部表面凹陷与外围隆起', tag: '鼠标 · 触感' },
  { id: 'cross-stitch', name: '十字绣', description: '以交叉针脚重绘光影', tag: 'CLAW 原版' },
  { id: 'halftone', name: '半调网点', description: '用大小变化的圆点表现明暗', tag: '印刷' },
  { id: 'pixelate', name: '像素化', description: '将连续画面化为像素色块', tag: '像素' },
  { id: 'toon', name: '色阶卡通', description: '让光影分成清晰的色阶', tag: '风格化' },
  { id: 'ascii', name: 'ASCII 字符', description: '以字符疏密重绘模型光影', tag: '字符艺术' },
  { id: 'engraving', name: '铜版雕刻', description: '交错刻线与纸墨质感', tag: '版画' },
  { id: 'hologram', name: '全息扫描', description: '透明轮廓与流动扫描光带', tag: '动画' },
  { id: 'iridescent', name: '虹彩金属', description: '流动虹彩与金属反射', tag: '材质' },
  { id: 'dissolve', name: '边缘溶解', description: '沿噪声边界消散与重组', tag: '动画' },
  { id: 'glyph-matrix', name: '几何字符', description: '几何符号与黄色辉光', tag: '符号 · 辉光' },
  { id: 'adaptive-grid', name: '自适应网格', description: '连续影像与分级网格', tag: '细分 · 影像' },
  { id: 'word-mosaic', name: '文字马赛克', description: '词语标签拼接模型轮廓', tag: '词块 · 拼贴' },
  { id: 'pixel-glyph', name: '像素字符', description: '灰阶矩阵与稀疏字符', tag: '灰阶 · 矩阵' },
  { id: 'particle-morph', name: '粒子变形', description: '从 AMS 标志旋转变为模型', tag: '动画' },
]
export const DEFAULT_PARAMS: ShaderParams = {
  comicWidth: 1.2, comicDetail: .3, comicInk: '#292b2c', comicPaper: '#ffffff',
  asciiSize: 24, asciiRandomize: false, asciiSpeed: 3,
  gridSize: 14, thickness: 0.25, threshold1: 0.64, threshold2: 0.97,
  lightColor: '#8cc4ff', shadowColor: '#233140', highlightColor: '#ffffff', dotSize: 0.46,
  contrast: 1, levels: 4, saturation: 1,
}
export const DEFAULT_BACKGROUND: BackgroundSettings = { color: '#4e70ef', grid: true, gridSize: 64, gridOpacity: 0.08 }
// Backgrounds are independent of lighting and remain editable after selection.
export const EFFECT_BACKGROUNDS: Record<ShaderId, BackgroundSettings> = {
  'comic-line': { ...DEFAULT_BACKGROUND, color: '#f7f7f5', grid: true, gridSize: 48, gridOpacity: .14 },
  'lens-distortion': { ...DEFAULT_BACKGROUND, color: '#b8c9de', grid: true, gridOpacity: .14 },
  'liquid-ripple': { ...DEFAULT_BACKGROUND, color: '#183a49', grid: false },
  'magnetic-pull': { ...DEFAULT_BACKGROUND, color: '#282238', grid: false },
  'prism-trail': { ...DEFAULT_BACKGROUND, color: '#10131f', grid: false },
  'material-reveal': { ...DEFAULT_BACKGROUND, color: '#15242d', grid: false },
  'elastic-indent': { ...DEFAULT_BACKGROUND, color: '#cfbcad', grid: false },
  original: { ...DEFAULT_BACKGROUND, color: '#dce1e8', gridOpacity: 0.18 },
  'cross-stitch': { ...DEFAULT_BACKGROUND },
  halftone: { ...DEFAULT_BACKGROUND, color: '#d6bea0', grid: false },
  pixelate: { ...DEFAULT_BACKGROUND, color: '#25304d', gridSize: 32, gridOpacity: 0.04 },
  toon: { ...DEFAULT_BACKGROUND, color: '#a6cbbc', grid: false },
  ascii: { ...DEFAULT_BACKGROUND, color: '#101820', grid: false },
  engraving: { ...DEFAULT_BACKGROUND, color: '#c7b99e', grid: false },
  hologram: { ...DEFAULT_BACKGROUND, color: '#06131f', gridOpacity: 0.035 },
  iridescent: { ...DEFAULT_BACKGROUND, color: '#211b32', grid: false },
  dissolve: { ...DEFAULT_BACKGROUND, color: '#211917', grid: false },
  'glyph-matrix': { ...DEFAULT_BACKGROUND, color: '#160d03', grid: false },
  'adaptive-grid': { ...DEFAULT_BACKGROUND, color: '#050609', grid: false },
  'word-mosaic': { ...DEFAULT_BACKGROUND, color: '#100b12', grid: false },
  'pixel-glyph': { ...DEFAULT_BACKGROUND, color: '#030405', grid: false },
  'particle-morph': { ...DEFAULT_BACKGROUND, color: '#080e24', grid: false },
}
export const DEFAULT_LIGHTING: LightingSettings = {
  ambient: { enabled: true, color: '#ffffff', intensity: 1.5 },
  key: { enabled: true, color: '#ffffff', intensity: 3, azimuth: 45, elevation: 35.264389682754654 },
  fill: { enabled: true, color: '#aabbff', intensity: 1.5, azimuth: -135, elevation: -35.264389682754654 },
}
export const DEFAULT_VIEW: ViewSettings = { autoRotate: true, rotateSpeed: 0.35, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0 }
export const DEFAULT_PARTICLE: ParticleSettings = {
  count: 18000, size: 2.4, color: '#8cc4ff', highlightColor: '#ffffff',
  duration: 1.5, morphStartAngle: 35, driftAmplitude: 0.055, scatter: 0.35, floatAmplitude: 0.08, floatSpeed: 0.35,
  rotationAxis: 'y', modelRotate: true, modelRotateSpeed: 0.35,
}
export const BACKGROUND_COLORS = [
  { name: '鸢尾蓝', color: '#4e70ef' }, { name: '薄荷绿', color: '#a6cbbc' },
  { name: '杏子橙', color: '#eead88' }, { name: '莓果粉', color: '#d897af' },
  { name: '雾紫', color: '#b6ace0' }, { name: '柠檬黄', color: '#e2ce84' },
  { name: '石墨黑', color: '#222631' }, { name: '云朵白', color: '#eff1f5' },
]
