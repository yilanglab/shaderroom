import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import './dockTooltip.css'

/** One persistent surface lets neighbouring dock hints travel without closing. */
export function DockTooltipGroup({ children }: { children: ReactNode }) {
  const group = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [hint, setHint] = useState({ label: '', center: 0 })
  const [width, setWidth] = useState(0)
  const [open, setOpen] = useState(false)
  const update = useCallback(() => {
    if (!anchor.current || !group.current) return
    const box = anchor.current.getBoundingClientRect()
    const dock = group.current.getBoundingClientRect()
    setHint({ label: anchor.current.dataset.tooltipLabel ?? '', center: box.left - dock.left + box.width / 2 })
  }, [])
  const show = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return
    const trigger = target.closest<HTMLElement>('.toolbar-tooltip-wrap')
    if (!trigger || !group.current?.contains(trigger)) return
    anchor.current = trigger
    update()
    clearTimeout(timer.current)
    // Only the first hint waits; sibling changes keep the surface visible.
    timer.current = setTimeout(() => setOpen(true), open ? 0 : 80)
  }
  const hide = () => { clearTimeout(timer.current); setOpen(false); anchor.current = null }
  useLayoutEffect(() => {
    if (text.current) setWidth(text.current.offsetWidth + 24)
  }, [hint.label])
  useEffect(() => {
    const element = group.current
    if (!element) return
    const observer = new MutationObserver(update)
    observer.observe(element, { subtree: true, attributes: true, attributeFilter: ['data-tooltip-label'] })
    const resize = new ResizeObserver(update)
    resize.observe(element)
    return () => { observer.disconnect(); resize.disconnect(); clearTimeout(timer.current) }
  }, [update])
  return <div ref={group} className="view-toolbar dock-tooltip-group" aria-label="视图控制"
    onPointerOver={event => { if (event.pointerType === 'mouse') show(event.target) }}
    onPointerLeave={hide} onPointerDown={event => { if (event.pointerType !== 'mouse') hide() }}
    onFocusCapture={event => { if (event.target.matches(':focus-visible')) show(event.target) }}
    onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) hide() }}
    onKeyDown={event => { if (event.key === 'Escape') hide() }}>
    {children}
    <span className="dock-tooltip-motion" data-open={open} aria-hidden="true"
      style={{ width, transform: `translateX(${hint.center - width / 2}px)` }}>
      <span className="panel-tooltip dock-tooltip-surface"><span ref={text} className="dock-tooltip-label">{hint.label}</span></span>
    </span>
  </div>
}
