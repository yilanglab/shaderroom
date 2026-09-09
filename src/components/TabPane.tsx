import { useLayoutEffect, useRef, type ReactNode } from 'react'
import './tabPane.css'

/** Keep both panes mounted so a quick reversal continues from the current frame. */
export function TabPane({ active, side, className, resetKey, children }: {
  active: boolean
  side: 'left' | 'right'
  className: string
  resetKey?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = 0
      ref.current.dataset.scrolled = 'false'
    }
  }, [resetKey])
  return <div ref={ref} className={`tab-pane panel-scroll ${className}`} data-active={active} data-side={side} inert={!active} aria-hidden={!active}
    onScroll={event => { event.currentTarget.dataset.scrolled = String(event.currentTarget.scrollTop > 1) }}>
    {children}
  </div>
}
