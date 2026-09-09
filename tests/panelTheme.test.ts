import assert from 'node:assert/strict'
import test from 'node:test'
import { panelThemeForColor } from '../src/lib/panelTheme'

test('panel theme follows background luminance, including saturated colours', () => {
  for (const color of ['#ffffff', '#d6bea0', '#a6cbbc', '#4e70ef', '#00ff00']) {
    assert.equal(panelThemeForColor(color, 'dark'), 'light', color)
  }
  for (const color of ['#000000', '#101820', '#211b32', '#0000ff']) {
    assert.equal(panelThemeForColor(color, 'light'), 'dark', color)
  }
})
test('theme holds within the buffer and reverses after crossing its limits', () => {
  assert.equal(panelThemeForColor('#666666', 'light'), 'light')
  assert.equal(panelThemeForColor('#666666', 'dark'), 'dark')
  assert.equal(panelThemeForColor('#444444', 'light'), 'dark')
  assert.equal(panelThemeForColor('#888888', 'dark'), 'light')
  assert.equal(panelThemeForColor('invalid', 'dark'), 'dark')
})
