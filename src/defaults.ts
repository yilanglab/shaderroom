import { MODEL_DEFAULT_SCALE } from './render/modelZoom'
import { EXTENDED_DEFAULTS } from './render/extendedEffects'
import { PILOT_DEFAULTS } from './render/shadersPilot'
import { publicPath } from './lib/publicPath'
import { HEAT_DEFAULTS } from './render/heatmap'
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
  { id: 'prism-trail', name: '棱镜拖影', description: '移动时产生彩色分离与短暂拖尾', tag: '鼠标 · 色散' },
  { id: 'cross-stitch', name: '十字 Dither', description: '以交叉针脚重绘光影', tag: 'CLAW 原版' },
  { id: 'pixelate', name: '像素化', description: '将连续画面化为像素色块', tag: '像素' },
  { id: 'toon', name: '色阶卡通', description: '让光影分成清晰的色阶', tag: '风格化' },
  { id: 'ascii', name: 'ASCII 字符', description: '以字符疏密重绘模型光影', tag: '字符艺术' },
  { id: 'particle-morph', name: '粒子变形', description: '从 AMS 标志旋转变为模型', tag: '动画' },
  { id: 'hologram', name: '全息扫描', description: '透明轮廓与流动扫描光带', tag: '动画' },
  { id: 'heatmap', name: '热力图', description: '可自定义冷暖色带与有机热区', tag: '热成像 · 渐变' },
  { id: 'lens-distortion', name: '流动透镜', description: '鼠标周围的放大、折射与轻微色散', tag: '鼠标 · 光学' },
  { id: 'contour-lines', name: '等高线地形', description: '连续曲线重绘模型光影', tag: '地形 · 曲线' },
  { id: 'watercolor', name: '水彩晕染', description: '纸张颗粒与柔和积墨', tag: '绘画 · 纸感' },
  { id: 'emboss', name: '压印浮雕', description: '高光阴影呈现纸面压印', tag: '压印 · 触感' },
  { id: 'pixel-sort', name: '像素排序', description: '局部影像拉成方向性条带', tag: '数字 · 条带' },
  { id: 'crt-screen', name: '荧光显像管', description: '扫描线与荧光颗粒', tag: '复古 · 荧光' },
  { id: 'fluted-glass', name: '百叶玻璃', description: '条纹玻璃折射与色散', tag: 'Shaders · 折射' },
  { id: 'dither', name: '抖色印刷', description: 'Bayer 网格与双色明暗', tag: 'Shaders · 抖色' },
  { id: 'liquid-ripple', name: '液面涟漪', description: '光滑影像随鼠标泛起波纹', tag: '鼠标 · 流体' },
  { id: 'magnetic-pull', name: '磁力拉伸', description: '表面向鼠标聚拢并弹性恢复', tag: '鼠标 · 软体' },
  { id: 'material-reveal', name: '材质显影', description: '金属表面显露发光结构网格', tag: '鼠标 · 显影' },
  { id: 'elastic-indent', name: '弹性压痕', description: '局部表面凹陷与外围隆起', tag: '鼠标 · 触感' },
  { id: 'halftone', name: '半调网点', description: '用大小变化的圆点表现明暗', tag: '印刷' },
  { id: 'engraving', name: '铜版雕刻', description: '交错刻线与纸墨质感', tag: '版画' },
  { id: 'iridescent', name: '虹彩金属', description: '流动虹彩与金属反射', tag: '材质' },
  { id: 'dissolve', name: '边缘溶解', description: '沿噪声边界消散与重组', tag: '动画' },
  { id: 'glyph-matrix', name: '几何字符', description: '几何符号与黄色辉光', tag: '符号 · 辉光' },
  { id: 'adaptive-grid', name: '自适应网格', description: '连续影像与分级网格', tag: '细分 · 影像' },
  { id: 'word-mosaic', name: '文字马赛克', description: '词语标签拼接模型轮廓', tag: '词块 · 拼贴' },
  { id: 'pixel-glyph', name: '像素字符', description: '灰阶矩阵与稀疏字符', tag: '灰阶 · 矩阵' },
]
export const DEFAULT_PARAMS: ShaderParams = {
  ...EXTENDED_DEFAULTS,
  ...PILOT_DEFAULTS,
  ...HEAT_DEFAULTS,
  comicWidth: 1.2, comicDetail: .3, comicInk: '#292b2c', comicPaper: '#ffffff',
  comicHatching: false, comicHatchGroups: 3, comicHatchAngle: 35,
  asciiSize: 24, asciiRandomize: false, asciiSpeed: 3,
  gridSize: 14, thickness: 0.25, threshold1: 0.64, threshold2: 0.97,
  lightColor: '#8cc4ff', shadowColor: '#233140', highlightColor: '#ffffff', dotSize: 0.46,
  contrast: 1, levels: 4, saturation: 1,
}
export const DEFAULT_BACKGROUND: BackgroundSettings = { color: '#4e70ef', grid: true, gridSize: 64, gridOpacity: 0.08 }
// Backgrounds are independent of lighting and remain editable after selection.
export const EFFECT_BACKGROUNDS: Record<ShaderId, BackgroundSettings> = {
  'contour-lines': { ...DEFAULT_BACKGROUND, color: '#ded6c6' },
  watercolor: { ...DEFAULT_BACKGROUND, color: '#eee6d6' },
  emboss: { ...DEFAULT_BACKGROUND, color: '#ddd6c9' },
  'pixel-sort': { ...DEFAULT_BACKGROUND, color: '#111321' },
  frost: { ...DEFAULT_BACKGROUND, color: '#b8d1db' },
  'glass-tiles': { ...DEFAULT_BACKGROUND, color: '#a8beca' },
  'crt-screen': { ...DEFAULT_BACKGROUND, color: '#071710' },
  shatter: { ...DEFAULT_BACKGROUND, color: '#151924' },
  'fluted-glass': { ...DEFAULT_BACKGROUND, color: '#b8c9de' },
  dither: { ...DEFAULT_BACKGROUND, color: '#e7dcc7' },
  heatmap: { ...DEFAULT_BACKGROUND, color: '#030611' },
  'comic-line': { ...DEFAULT_BACKGROUND, color: '#f7f7f5', grid: true, gridSize: 48, gridOpacity: .14 },
  'lens-distortion': { ...DEFAULT_BACKGROUND, color: '#b8c9de', grid: true, gridOpacity: .14 },
  'liquid-ripple': { ...DEFAULT_BACKGROUND, color: '#183a49' },
  'magnetic-pull': { ...DEFAULT_BACKGROUND, color: '#282238' },
  'prism-trail': { ...DEFAULT_BACKGROUND, color: '#10131f' },
  'material-reveal': { ...DEFAULT_BACKGROUND, color: '#15242d' },
  'elastic-indent': { ...DEFAULT_BACKGROUND, color: '#cfbcad' },
  original: { ...DEFAULT_BACKGROUND, color: '#dce1e8', gridOpacity: 0.18 },
  'cross-stitch': { ...DEFAULT_BACKGROUND },
  halftone: { ...DEFAULT_BACKGROUND, color: '#d6bea0' },
  pixelate: { ...DEFAULT_BACKGROUND, color: '#25304d', gridSize: 32, gridOpacity: 0.04 },
  toon: { ...DEFAULT_BACKGROUND, color: '#a6cbbc' },
  ascii: { ...DEFAULT_BACKGROUND, color: '#101820' },
  engraving: { ...DEFAULT_BACKGROUND, color: '#c7b99e' },
  hologram: { ...DEFAULT_BACKGROUND, color: '#06131f', gridOpacity: 0.035 },
  iridescent: { ...DEFAULT_BACKGROUND, color: '#211b32' },
  dissolve: { ...DEFAULT_BACKGROUND, color: '#211917' },
  'glyph-matrix': { ...DEFAULT_BACKGROUND, color: '#160d03' },
  'adaptive-grid': { ...DEFAULT_BACKGROUND, color: '#050609' },
  'word-mosaic': { ...DEFAULT_BACKGROUND, color: '#100b12' },
  'pixel-glyph': { ...DEFAULT_BACKGROUND, color: '#030405' },
  'particle-morph': { ...DEFAULT_BACKGROUND, color: '#080e24' },
}
export const DEFAULT_LIGHTING: LightingSettings = {
  ambient: { enabled: true, color: '#ffffff', intensity: 1.5 },
  key: { enabled: true, color: '#ffffff', intensity: 3, azimuth: 45, elevation: 35.264389682754654 },
  fill: { enabled: true, color: '#aabbff', intensity: 1.5, azimuth: -135, elevation: -35.264389682754654 },
}
export const DEFAULT_VIEW: ViewSettings = { autoRotate: true, rotateSpeed: 0.35, scale: MODEL_DEFAULT_SCALE, rotationX: 0, rotationY: 0, rotationZ: 0 }
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
