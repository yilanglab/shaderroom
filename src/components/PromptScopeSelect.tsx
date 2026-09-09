import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import type { PromptScope } from '../lib/prompt'

const options: { value: PromptScope; label: string; detail: string }[] = [
  { value: 'both', label: '背景与效果', detail: '完整场景与效果配置' },
  { value: 'background', label: '仅背景', detail: '背景、网格与场景光照' },
  { value: 'effect', label: '仅效果', detail: '模型、Shader 与必要光照' },
]
export function PromptScopeSelect({ value, onChange }: { value: PromptScope; onChange: (value: PromptScope) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  return <div className="prompt-scope" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); trigger.current?.focus() }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) { setOpen(true); return }
      const items = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
      const current = items.indexOf(document.activeElement as HTMLButtonElement)
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
  }}>
    <button ref={trigger} type="button" className="prompt-scope-trigger" aria-label={`复制内容：${options.find(item => item.value === value)!.label}`} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>{options.find(item => item.value === value)!.label}<ChevronDown size={14} /></button>
    {open && <div className="prompt-scope-menu" id={id} role="menu" aria-label="复制内容">{options.map(item => <button type="button" key={item.value} role="menuitemradio" aria-checked={item.value === value} tabIndex={-1} onClick={() => { onChange(item.value); setOpen(false); trigger.current?.focus() }}><span><strong>{item.label}</strong><small>{item.detail}</small></span><Check size={14} style={{ opacity: item.value === value ? 1 : 0 }} /></button>)}</div>}
  </div>
}
