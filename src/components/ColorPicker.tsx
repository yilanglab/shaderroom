import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Pipette, X } from 'lucide-react'
import { captureColorScene, pixelHex, sampleCoordinates } from '../render/colorSampling'
import './colorPicker.css'

type Props = { label: string; value: string; onChange: (value: string) => void; className?: string }
type Scene = ReturnType<typeof captureColorScene>
const palette = ['#ffffff', '#222631', '#4e70ef', '#65e7ff', '#de86ff', '#ff9950', '#f0e8d6', '#74d6ac']

export function ColorPicker({ label, value, onChange, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [scene, setScene] = useState<Scene | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const screen = useRef<HTMLCanvasElement>(null)
  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => {
    if (scene && screen.current) { screen.current.width = scene.canvas.width; screen.current.height = scene.canvas.height; screen.current.getContext('2d')?.drawImage(scene.canvas, 0, 0); overlay.current?.focus() }
  }, [scene])
  useEffect(() => {
    if (!open) return
    dialog.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const container = scene ? overlay.current : dialog.current
        const items = container?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
        if (items?.length) {
          const first = items[0], last = items[items.length - 1]
          if (event.shiftKey && (document.activeElement === first || document.activeElement === container)) { event.preventDefault(); last.focus() }
          else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container)) { event.preventDefault(); first.focus() }
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation()
        if (scene) { setScene(null); dialog.current?.focus() } else { setOpen(false); trigger.current?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open, scene])
  function change(next: string) { onChange(next); setDraft(next); setError('') }
  function pick() {
    setError('')
    try { setScene(captureColorScene()) } catch (reason) { setError((reason as Error).message || '取色失败，请重试') }
  }
  return <div className={`color-picker-field ${className}`}>
    <span>{label}</span>
    <button type="button" className="color-picker-trigger" ref={trigger} aria-label={`${label} ${value.toUpperCase()}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      const rect = trigger.current!.getBoundingClientRect()
      setPosition({ left: Math.max(8, Math.min(window.innerWidth - 272, rect.right - 264)), top: Math.max(8, Math.min(window.innerHeight - 280, rect.bottom + 8)) }); setOpen(!open); setError('')
    }}><i style={{ backgroundColor: value }} /><code>{value.toUpperCase()}</code></button>
    {open && createPortal(<>
      <div className="color-picker-backdrop" onClick={() => { setOpen(false); trigger.current?.focus() }} />
      <div ref={dialog} tabIndex={-1} className="color-picker-dialog" role="dialog" aria-label={`${label}选择器`} style={position}>
        <div className="color-picker-heading"><strong>{label}</strong><button aria-label="关闭颜色选择器" onClick={() => { setOpen(false); trigger.current?.focus() }}><X size={16} /></button></div>
        <div className="color-picker-palette">{palette.map(color => <button key={color} aria-label={`选择颜色 ${color}`} style={{ backgroundColor: color }} onClick={() => change(color)} />)}</div>
        <div className="color-picker-inputs"><label>颜色<input type="color" aria-label={`${label}调色板`} value={value} onChange={e => change(e.target.value)} /></label><label>HEX<input aria-label={`${label} HEX`} value={draft} maxLength={7} onChange={e => { const next = e.target.value; setDraft(next); if (/^#[\da-f]{6}$/i.test(next)) change(next) }} onBlur={() => { if (!/^#[\da-f]{6}$/i.test(draft)) { setDraft(value); setError('请输入完整的六位 HEX 颜色，例如 #4E70EF') } }} /></label></div>
        <button className="color-picker-eyedropper" onClick={pick}><Pipette size={16} />吸管取色</button>
        <p className="color-picker-note">可从模型与背景画面取色，按 Esc 取消。</p>
        {error && <p className="color-picker-error" role="alert">{error}</p>}
      </div>
      {scene && <div ref={overlay} tabIndex={-1} role="dialog" aria-label="画面取色，点击选择颜色，Esc 取消" className="color-picker-sampling" onClick={e => {
        if (e.clientX < scene.rect.left || e.clientX >= scene.rect.right || e.clientY < scene.rect.top || e.clientY >= scene.rect.bottom) { setScene(null); setError('请在模型与背景预览画面内取色'); return }
        try { const [x, y] = sampleCoordinates(e.clientX, e.clientY, scene.rect, scene.canvas.width, scene.canvas.height); change(pixelHex(scene.ctx.getImageData(x, y, 1, 1).data)); setScene(null); dialog.current?.focus() } catch { setScene(null); setError('无法读取画面颜色，请重新加载模型后重试') }
      }}><canvas ref={screen} style={{ left: scene.rect.left, top: scene.rect.top, width: scene.rect.width, height: scene.rect.height } as CSSProperties} /><div className="color-picker-sampling-hint" onClick={e => e.stopPropagation()}>点击画面吸取颜色 · Esc 取消<button onClick={() => { setScene(null); dialog.current?.focus() }}>取消</button></div></div>}
    </>, document.body)}
  </div>
}
