import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'

export function InfoTip({ text }: { text: string }) {
  const id = useId()
  const trigger = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const [visible, setVisible] = useState(false)
  function close() {
    clearTimeout(timer.current)
    setVisible(false)
  }
  function open() {
    clearTimeout(timer.current)
    const rect = trigger.current!.getBoundingClientRect()
    setPosition({ left: Math.max(8, Math.min(innerWidth - 248, rect.left)), top: rect.bottom + 8 })
    timer.current = setTimeout(() => setVisible(true), 80)
  }
  useEffect(() => {
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => { clearTimeout(timer.current); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close) }
  }, [])
  return <span className="info-tip-wrap" onMouseEnter={open} onMouseLeave={close}>
    <span ref={trigger} className="info-tip-trigger" tabIndex={0} role="img" aria-label={text} onFocus={open} onBlur={close} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}><Info size={13} aria-hidden="true" /></span>
    {position && createPortal(<span id={id} role="tooltip" className="panel-tooltip info-tooltip" data-visible={visible} style={position} onMouseEnter={() => { clearTimeout(timer.current); setVisible(true) }} onMouseLeave={close}>{text}</span>, document.body)}
  </span>
}
