import assert from 'node:assert/strict'
import test from 'node:test'
import { ASCII_GLYPHS, asciiVariant } from '../src/render/ascii'

test('each ASCII tier contains three distinct valid 5x7 glyphs', () => {
  assert.equal(ASCII_GLYPHS.length, 8)
  for (const tier of ASCII_GLYPHS) {
    assert.equal(tier.variants.length, 3)
    assert.equal(new Set(tier.variants.map(glyph => glyph.char)).size, 3)
    for (const glyph of tier.variants) {
      assert.equal(glyph.rows.length, 7)
      assert.ok(glyph.rows.every(row => Number.isInteger(row) && row >= 0 && row <= 31))
    }
  }
})

test('ASCII randomization is repeatable and spatially varied within the same tier', () => {
  const counts = [0, 0, 0]
  let changed = 0
  for (let x=0; x<40; x++) for (let y=0; y<30; y++) {
    const current = asciiVariant(x,y,12)
    counts[current]++
    assert.equal(current, asciiVariant(x,y,12))
    if (current !== asciiVariant(x,y,13)) changed++
  }
  assert.ok(counts.every(count => count > 200))
  assert.ok(changed > 500)
})
