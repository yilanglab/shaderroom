export const MODEL_DEFAULT_SCALE = 1
export const MODEL_SCALE_RANGE = { min: 0.4, max: 4, step: 0.01 } as const
export const MODEL_ZOOM_WHEEL = { linePixels: 16, fallbackPagePixels: 800, exponentPerPixel: 0.0015 } as const

export interface ModelZoomOptions {
  /** Current committed scale; use syncScale for explicit external panel/reset intent. */
  getScale: () => number
  onScaleChange: (scale: number) => void
  isEnabled?: () => boolean
}

export type ModelZoomBinding = (() => void) & {
  /** Explicit panel/reset input. Do not call for echoes of onScaleChange. */
  syncScale: (scale: number) => void
}

function clampScale(value: number) {
  return Math.min(MODEL_SCALE_RANGE.max, Math.max(MODEL_SCALE_RANGE.min, value))
}

export function normalizeModelScale(value: number): number {
  return Math.round((clampScale(Number.isNaN(value) ? MODEL_DEFAULT_SCALE : value) + Number.EPSILON) * 100) / 100
}

/** Adapts only this element's wheel and two-touch gestures to a controlled model scale.
 * Call binding.syncScale(next) for every external panel/reset action, including a
 * reset to a value that React has not yet changed. Controlled callback echoes do
 * not need an acknowledgement and cannot disturb sub-step gesture accumulation.
 */
export function attachModelZoom(element: HTMLElement, options: ModelZoomOptions): ModelZoomBinding {
  let continuousScale = normalizeModelScale(options.getScale())
  let observedScale = continuousScale
  let notifiedScale = continuousScale
  let expectedControlValue: number | null = null
  let lastPinchDistance: number | null = null
  let disposed = false
  const pointers = new Map<number, { x: number; y: number }>()
  const capturedPointers = new Set<number>()

  function syncScale(scale: number) {
    if (disposed) return
    continuousScale = normalizeModelScale(scale)
    notifiedScale = continuousScale
    lastPinchDistance = pinchDistance()
    expectedControlValue = continuousScale
    observeControlledScale()
  }

  function observeControlledScale() {
    const current = normalizeModelScale(options.getScale())
    // A single explicit acknowledgement protects sub-step input from delayed
    // callback echoes. We never infer intent from a history of emitted values.
    if (expectedControlValue !== null) {
      if (current === expectedControlValue) {
        observedScale = current
        expectedControlValue = null
      }
      return
    }
    // With no callback or explicit sync awaiting acknowledgement, a changed
    // getter is unambiguously external and is a safe fallback for missed bridges.
    if (current !== observedScale) {
      observedScale = current
      continuousScale = current
      notifiedScale = current
      lastPinchDistance = pinchDistance()
    }
  }

  function publishScale(value: number) {
    continuousScale = clampScale(value)
    const next = normalizeModelScale(continuousScale)
    if (next === notifiedScale) return
    notifiedScale = next
    expectedControlValue = next
    options.onScaleChange(next)
    observeControlledScale()
  }

  function releasePointer(pointerId: number) {
    if (!capturedPointers.delete(pointerId)) return
    try { element.releasePointerCapture(pointerId) } catch { /* The browser may already have released it. */ }
  }

  function clearGesture() {
    pointers.clear()
    lastPinchDistance = null
    for (const pointerId of [...capturedPointers]) releasePointer(pointerId)
  }

  function enabled() {
    if (disposed) return false
    if (options.isEnabled?.() === false) {
      clearGesture()
      continuousScale = normalizeModelScale(options.getScale())
      observedScale = continuousScale
      notifiedScale = continuousScale
      expectedControlValue = null
      return false
    }
    return true
  }

  function pinchDistance() {
    if (pointers.size !== 2) return null
    const [first, second] = [...pointers.values()]
    const distance = Math.hypot(first.x - second.x, first.y - second.y)
    return Number.isFinite(distance) && distance > 0 ? distance : null
  }

  function onWheel(event: WheelEvent) {
    if (!enabled() || !Number.isFinite(event.deltaY) || event.deltaY === 0) return
    event.preventDefault()
    observeControlledScale()
    const pixelsPerUnit = event.deltaMode === 1
      ? MODEL_ZOOM_WHEEL.linePixels
      : event.deltaMode === 2
        ? Math.max(1, element.clientHeight || MODEL_ZOOM_WHEEL.fallbackPagePixels)
        : 1
    // Clamp before exp(): even an extreme finite event can never overflow.
    const exponent = Math.max(-50, Math.min(50, -event.deltaY * pixelsPerUnit * MODEL_ZOOM_WHEEL.exponentPerPixel))
    publishScale(continuousScale * Math.exp(exponent))
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !enabled()) return
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    observeControlledScale()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    try {
      element.setPointerCapture(event.pointerId)
      capturedPointers.add(event.pointerId)
    } catch { /* Synthetic events and released pointers may not be capturable. */ }
    lastPinchDistance = pinchDistance()
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !enabled() || !pointers.has(event.pointerId)) return
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return
    // Keep bubbling so OrbitControls maintains its pointer cache. The caller sets
    // controls.touches.TWO=null and enableZoom=false to reserve pinch for this adapter.
    if (pointers.size >= 2) event.preventDefault()
    observeControlledScale()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const distance = pinchDistance()
    if (distance !== null && lastPinchDistance !== null) {
      publishScale(continuousScale * (distance / lastPinchDistance))
    }
    lastPinchDistance = distance
  }

  function onPointerEnd(event: PointerEvent) {
    if (!pointers.delete(event.pointerId)) return
    lastPinchDistance = pinchDistance()
    releasePointer(event.pointerId)
  }

  function onLostPointerCapture(event: PointerEvent) {
    capturedPointers.delete(event.pointerId)
    if (pointers.delete(event.pointerId)) lastPinchDistance = pinchDistance()
  }

  element.addEventListener('wheel', onWheel, { passive: false })
  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove, { passive: false })
  element.addEventListener('pointerup', onPointerEnd)
  element.addEventListener('pointercancel', onPointerEnd)
  element.addEventListener('lostpointercapture', onLostPointerCapture)

  const detach = () => {
    if (disposed) return
    disposed = true
    element.removeEventListener('wheel', onWheel)
    element.removeEventListener('pointerdown', onPointerDown)
    element.removeEventListener('pointermove', onPointerMove)
    element.removeEventListener('pointerup', onPointerEnd)
    element.removeEventListener('pointercancel', onPointerEnd)
    element.removeEventListener('lostpointercapture', onLostPointerCapture)
    clearGesture()
  }
  return Object.assign(detach, { syncScale })
}
