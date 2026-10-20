import assert from 'node:assert/strict'
import test from 'node:test'
import { attachModelZoom, MODEL_SCALE_RANGE, normalizeModelScale } from '../src/render/modelZoom'

class ZoomElement extends EventTarget {
  clientHeight = 600
  captures = new Set<number>()
  setPointerCapture(id: number) { this.captures.add(id) }
  releasePointerCapture(id: number) { this.captures.delete(id) }
}

function wheel(element: EventTarget, deltaY: number, deltaMode = 0) {
  const event = Object.assign(new Event('wheel', { cancelable: true, bubbles: true }), { deltaY, deltaMode })
  element.dispatchEvent(event)
  return event
}

function pointer(element: EventTarget, type: string, pointerId: number, clientX: number, clientY = 0, pointerType = 'touch') {
  const event = Object.assign(new Event(type, { cancelable: true, bubbles: true }), { pointerId, clientX, clientY, pointerType })
  element.dispatchEvent(event)
  return event
}

function setup(initialScale = 1) {
  const element = new ZoomElement()
  let scale = initialScale
  let enabled = true
  const changes: number[] = []
  const detach = attachModelZoom(element as unknown as HTMLElement, {
    getScale: () => scale,
    onScaleChange: (next) => { scale = next; changes.push(next) },
    isEnabled: () => enabled,
  })
  return { element, changes, detach, get scale() { return scale }, set scale(value: number) { scale = value; detach.syncScale(value) }, set enabled(value: boolean) { enabled = value } }
}

test('model scale uses shared bounds and two decimal precision, including non-finite boundaries', () => {
  assert.deepEqual(MODEL_SCALE_RANGE, { min: 0.4, max: 4, step: 0.01 })
  assert.equal(normalizeModelScale(1.235), 1.24)
  assert.equal(normalizeModelScale(0.3), 0.4)
  assert.equal(normalizeModelScale(4.01), 4)
  assert.equal(normalizeModelScale(Number.POSITIVE_INFINITY), 4)
  assert.equal(normalizeModelScale(Number.NEGATIVE_INFINITY), 0.4)
  assert.equal(normalizeModelScale(Number.NaN), 1)
})

test('wheel zoom and panel changes share the current controlled scale', () => {
  const state = setup()
  assert.equal(wheel(state.element, -100).defaultPrevented, true)
  assert.equal(state.scale, 1.16)
  state.scale = 0.7
  wheel(state.element, -100)
  assert.equal(state.scale, 0.81)
  state.scale = 1.8
  wheel(state.element, 100)
  assert.equal(state.scale, 1.55)
  assert.deepEqual(state.changes, [1.16, 0.81, 1.55])
  state.detach()
})

test('resetting to the previous observed value starts the next wheel gesture from that exact scale', () => {
  const state = setup(1)
  wheel(state.element, -100)
  assert.equal(state.scale, 1.16)
  state.scale = 1
  wheel(state.element, -100)
  assert.equal(state.scale, 1.16)
  assert.deepEqual(state.changes, [1.16, 1.16])
  state.detach()
})

test('an unbridged external getter change is detected after the previous gesture was acknowledged', () => {
  const element = new ZoomElement()
  let scale = 1
  const detach = attachModelZoom(element as unknown as HTMLElement, {
    getScale: () => scale,
    onScaleChange: value => { scale = value },
  })
  wheel(element, -100)
  assert.equal(scale, 1.16)
  scale = 1
  wheel(element, -100)
  assert.equal(scale, 1.16)
  scale = 0.7
  wheel(element, -100)
  assert.equal(scale, 0.81)
  detach()
})

test('pixel, line and page wheel modes are equivalent for the same distance', () => {
  const scales: number[] = []
  for (const [delta, mode] of [[-48, 0], [-3, 1], [-0.08, 2]]) {
    const state = setup()
    wheel(state.element, delta, mode)
    scales.push(state.scale)
    state.detach()
  }
  assert.deepEqual(scales, [1.07, 1.07, 1.07])
})

test('small wheel deltas accumulate across rounding and leave both clamped boundaries', () => {
  const state = setup()
  for (let index = 0; index < 5; index += 1) wheel(state.element, -1)
  assert.equal(state.scale, 1.01)
  wheel(state.element, -Number.MAX_VALUE)
  assert.equal(state.scale, 4)
  wheel(state.element, -1)
  for (let index = 0; index < 4; index += 1) wheel(state.element, 1)
  assert.equal(state.scale, 3.98)
  wheel(state.element, Number.MAX_VALUE)
  assert.equal(state.scale, 0.4)
  wheel(state.element, 1)
  for (let index = 0; index < 10; index += 1) wheel(state.element, -1)
  assert.equal(state.scale, 0.41)
  assert.ok(state.changes.every(value => Number.isFinite(value) && value >= 0.4 && value <= 4))
  state.detach()
})

test('deferred controlled echoes preserve accumulation and explicit same-value resets take priority', () => {
  const element = new ZoomElement()
  let observed = 1
  const pending: number[] = []
  const detach = attachModelZoom(element as unknown as HTMLElement, {
    getScale: () => observed,
    onScaleChange: value => pending.push(value),
  })
  for (let index = 0; index < 10; index += 1) wheel(element, -1)
  assert.deepEqual(pending, [1.01, 1.02])
  observed = 1.01
  for (let index = 0; index < 5; index += 1) wheel(element, -1)
  assert.equal(pending.at(-1), 1.02)
  observed = 1.02
  for (let index = 0; index < 5; index += 1) wheel(element, -1)
  assert.equal(pending.at(-1), 1.03)
  observed = 0.6
  detach.syncScale(0.6)
  wheel(element, -100)
  assert.equal(pending.at(-1), 0.7)
  // Reset can happen before the caller has committed the most recent callback.
  // The previous observed value is still 0.6, but this is a new explicit intent.
  detach.syncScale(0.6)
  wheel(element, -100)
  assert.equal(pending.at(-1), 0.7)
  detach()
})

test('two-touch pinch follows distance ratios while single touch remains available to orbit', () => {
  const state = setup()
  pointer(state.element, 'pointerdown', 1, 0)
  assert.equal(pointer(state.element, 'pointermove', 1, 10).defaultPrevented, false)
  assert.deepEqual(state.changes, [])
  pointer(state.element, 'pointerdown', 2, 110)
  assert.equal(pointer(state.element, 'pointermove', 2, 160).defaultPrevented, true)
  assert.equal(state.scale, 1.5)
  pointer(state.element, 'pointermove', 2, 85)
  assert.equal(state.scale, 0.75)
  state.scale = 1.2
  pointer(state.element, 'pointermove', 2, 110)
  assert.equal(state.scale, 1.6)
  pointer(state.element, 'pointerup', 2, 110)
  pointer(state.element, 'pointermove', 1, 30)
  assert.equal(state.scale, 1.6)
  assert.deepEqual([...state.element.captures], [1])
  state.detach()
  assert.equal(state.element.captures.size, 0)
})

test('cancelled, lost and extra touch pointers cannot leave stale pinch distances', () => {
  const state = setup()
  pointer(state.element, 'pointerdown', 1, 0)
  pointer(state.element, 'pointerdown', 2, 100)
  pointer(state.element, 'pointercancel', 2, 100)
  pointer(state.element, 'pointermove', 2, 200)
  assert.equal(state.scale, 1)
  pointer(state.element, 'pointerdown', 3, 200)
  pointer(state.element, 'pointermove', 3, 300)
  assert.equal(state.scale, 1.5)
  pointer(state.element, 'lostpointercapture', 3, 300)
  pointer(state.element, 'pointermove', 3, 600)
  assert.equal(state.scale, 1.5)
  pointer(state.element, 'pointerdown', 4, 100)
  pointer(state.element, 'pointerdown', 5, 200)
  pointer(state.element, 'pointermove', 4, 200)
  assert.equal(state.scale, 1.5)
  pointer(state.element, 'pointerup', 5, 200)
  pointer(state.element, 'pointermove', 4, 100)
  assert.equal(state.scale, 0.75)
  state.detach()
})

test('disabled state and detach ignore input and clear in-progress gestures', () => {
  const state = setup()
  const otherElement = new ZoomElement()
  wheel(otherElement, -100)
  assert.equal(state.scale, 1)
  pointer(state.element, 'pointerdown', 1, 0, 0, 'mouse')
  pointer(state.element, 'pointerdown', 2, 100, 0, 'mouse')
  pointer(state.element, 'pointermove', 2, 200, 0, 'mouse')
  assert.equal(state.scale, 1)
  pointer(state.element, 'pointerdown', 3, 0)
  pointer(state.element, 'pointerdown', 4, 100)
  state.enabled = false
  assert.equal(wheel(state.element, -100).defaultPrevented, false)
  assert.equal(state.element.captures.size, 0)
  state.enabled = true
  pointer(state.element, 'pointermove', 4, 200)
  assert.equal(state.scale, 1)
  pointer(state.element, 'pointerdown', 5, 0)
  pointer(state.element, 'pointerdown', 6, 100)
  state.detach()
  state.detach()
  pointer(state.element, 'pointermove', 6, 200)
  wheel(state.element, -100)
  assert.equal(state.scale, 1)
  assert.equal(state.element.captures.size, 0)
})
