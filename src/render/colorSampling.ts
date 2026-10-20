export interface ColorCapture { canvas: HTMLCanvasElement; rect: DOMRect }
let backgroundCapture: (() => HTMLCanvasElement) | undefined
export function registerBackgroundCapture(provider: () => HTMLCanvasElement) {
  backgroundCapture = provider
  return () => { if (backgroundCapture === provider) backgroundCapture = undefined }
}
let capture: (() => ColorCapture) | undefined

export function registerColorCapture(provider: () => ColorCapture) {
  capture = provider
  return () => { if (capture === provider) capture = undefined }
}

export function pixelHex(rgba: ArrayLike<number>) {
  return `#${[rgba[0], rgba[1], rgba[2]].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`
}

export function sampleCoordinates(x: number, y: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, width: number, height: number) {
  return [Math.max(0, Math.min(width - 1, Math.floor((x - rect.left) / rect.width * width))), Math.max(0, Math.min(height - 1, Math.floor((y - rect.top) / rect.height * height)))] as const
}

export function captureColorScene() {
  if (!capture) throw new Error('模型画面尚未准备好，请稍后重试')
  const source = capture()
  const workspace = document.querySelector<HTMLElement>('.workspace')
  if (!workspace) throw new Error('未找到预览画面')
  const rect = workspace.getBoundingClientRect()
  const style = getComputedStyle(workspace)
  const ratio = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(rect.width * ratio))
  canvas.height = Math.max(1, Math.round(rect.height * ratio))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('当前浏览器无法读取画面颜色')
  ctx.scale(ratio, ratio)
  ctx.fillStyle = style.backgroundColor
  ctx.fillRect(0, 0, rect.width, rect.height)
  if (backgroundCapture) ctx.drawImage(backgroundCapture(), 0, 0, rect.width, rect.height)
  // The workspace has two white, one-CSS-pixel grid gradients anchored at 0 0.
  if (style.backgroundImage !== 'none') {
    const color = style.backgroundImage.match(/rgba?\([^)]+\)/)?.[0]
    const spacing = parseFloat(style.backgroundSize)
    if (color && Number.isFinite(spacing) && spacing > 0) {
      ctx.fillStyle = color
      for (let y = 0; y < rect.height; y += spacing) ctx.fillRect(0, y, rect.width, 1)
      for (let x = 0; x < rect.width; x += spacing) ctx.fillRect(x, 0, 1, rect.height)
    }
  }
  ctx.drawImage(source.canvas, source.rect.left - rect.left, source.rect.top - rect.top, source.rect.width, source.rect.height)
  return { canvas, rect, ctx }
}
