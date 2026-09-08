import test from 'node:test'
import assert from 'node:assert/strict'
import { captureColorScene, pixelHex, registerColorCapture, sampleCoordinates } from '../src/render/colorSampling'

test('sampling maps viewport coordinates to device pixels including offsets and bounds', () => {
  const rect = { left: 20, top: 30, width: 100, height: 80 }
  assert.deepEqual(sampleCoordinates(70, 70, rect, 200, 160), [100, 80])
  assert.deepEqual(sampleCoordinates(120, 110, rect, 200, 160), [199, 159])
  assert.deepEqual(sampleCoordinates(-20, -30, rect, 200, 160), [0, 0])
  assert.equal(pixelHex([78, 112, 239, 255]), '#4e70ef')
})

test('capture composites CSS background and both grid layers before transparent model pixels', () => {
  const operations: unknown[][] = []
  const ctx = {
    fillStyle: '',
    scale(x: number, y: number) { operations.push(['scale', x, y]) },
    fillRect(...args: number[]) { operations.push(['fill', this.fillStyle, ...args]) },
    drawImage(...args: unknown[]) { operations.push(['draw', ...args]) },
  }
  const canvas = { width: 0, height: 0, getContext: () => ctx }
  const source = {} as HTMLCanvasElement
  const rect = { left: 10, top: 20, width: 48, height: 48 } as DOMRect
  const keys = ['document', 'window', 'getComputedStyle'] as const
  const originals = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  const mock = {
    document: { createElement: () => canvas, querySelector: () => ({ getBoundingClientRect: () => rect }) },
    window: { devicePixelRatio: 2 },
    getComputedStyle: () => ({ backgroundColor: 'rgb(78, 112, 239)', backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px)', backgroundSize: '24px 24px' }),
  }
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: mock[key] })
  const unregister = registerColorCapture(() => ({ canvas: source, rect }))
  try {
    const result = captureColorScene()
    assert.equal(result.canvas.width, 96)
    assert.equal(result.canvas.height, 96)
    assert.deepEqual(operations, [
      ['scale', 2, 2],
      ['fill', 'rgb(78, 112, 239)', 0, 0, 48, 48],
      ['fill', 'rgba(255, 255, 255, 0.1)', 0, 0, 48, 1],
      ['fill', 'rgba(255, 255, 255, 0.1)', 0, 24, 48, 1],
      ['fill', 'rgba(255, 255, 255, 0.1)', 0, 0, 1, 48],
      ['fill', 'rgba(255, 255, 255, 0.1)', 24, 0, 1, 48],
      ['draw', source, 0, 0, 48, 48],
    ])
    unregister()
    assert.throws(captureColorScene, /尚未准备好/)
  } finally {
    unregister()
    keys.forEach((key, index) => { const descriptor = originals[index]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key) })
  }
})
