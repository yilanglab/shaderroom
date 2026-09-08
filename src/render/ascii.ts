/** Five-column, seven-row bitmap glyphs, ordered from sparse to dense. */
const BASE_GLYPHS = [
  { char: '.', rows: [0, 0, 0, 0, 0, 4, 0] },
  { char: ':', rows: [0, 4, 0, 0, 4, 0, 0] },
  { char: '-', rows: [0, 0, 0, 31, 0, 0, 0] },
  { char: '+', rows: [0, 4, 4, 31, 4, 4, 0] },
  { char: '=', rows: [0, 0, 31, 0, 31, 0, 0] },
  { char: '*', rows: [0, 21, 14, 31, 14, 21, 0] },
  { char: '#', rows: [10, 31, 10, 10, 31, 10, 0] },
  { char: '@', rows: [14, 17, 23, 21, 23, 16, 15] },
] as const

const VARIANTS = [
  [{ char: "'", rows: [4,4,0,0,0,0,0] }, { char: '`', rows: [8,4,0,0,0,0,0] }],
  [{ char: ';', rows: [0,4,0,0,4,4,8] }, { char: '!', rows: [4,4,4,4,0,4,0] }],
  [{ char: '_', rows: [0,0,0,0,0,0,31] }, { char: '/', rows: [1,2,2,4,8,8,16] }],
  [{ char: 't', rows: [4,4,14,4,4,4,2] }, { char: 'r', rows: [0,0,22,9,8,8,8] }],
  [{ char: 'x', rows: [0,0,17,10,4,10,17] }, { char: 'v', rows: [0,0,17,17,17,10,4] }],
  [{ char: 'k', rows: [16,16,18,20,24,20,18] }, { char: 'y', rows: [0,17,17,15,1,17,14] }],
  [{ char: 'H', rows: [17,17,17,31,17,17,17] }, { char: 'N', rows: [17,25,25,21,19,19,17] }],
  [{ char: 'M', rows: [17,27,21,21,17,17,17] }, { char: 'W', rows: [17,17,17,21,21,27,17] }],
] as const

export const ASCII_GLYPHS = BASE_GLYPHS.map((glyph, index) => ({ ...glyph, variants: [glyph, ...VARIANTS[index]] }))

/** Integer arithmetic mirrored in GLSL, stable across devices and export replay. */
export function asciiVariant(cellX: number, cellY: number, tick: number) {
  let seed = ((cellX % 251) * 73 + (cellY % 251) * 151 + (tick % 251) * 199) % 251
  seed = (seed * seed * 17 + seed * 23 + 13) % 251
  return Math.floor(seed * 3 / 251)
}

export const ASCII_RECIPE = {
  glyphs: ASCII_GLYPHS,
  cell: 'asciiSize is physical drawing-buffer cell height, minimum 9; cell width=height*7/9. Sample source RGBA at each cell center. Outside-model cells remain transparent.',
  glyph: 'Select min(7,floor(clamp((luma-.5)*contrast+.5,0,1)*8)). Each glyph is 5x7 within a 7x9 cell with a one-pixel border. Rows are top-to-bottom; each row is a five-bit integer, bit 4 is the leftmost column. Set bits draw the palette color; unset bits are transparent. No font or atlas download is needed.',
  variation: 'Each brightness tier has three variants. h=mod(mod(cellX,251)*73+mod(cellY,251)*151+mod(tick,251)*199,251); h=mod(h*h*17+h*23+13,251); variant=floor(h*3/251). glyphIndex=tier*3+variant. Cell coordinates are physical grid indices. Start elapsed=0; advance by clamp(deltaSeconds,0,.05) only while ASCII is active, asciiRandomize enabled and reduced motion is off. tick=floor(elapsed*asciiSpeed), where speed is changes per second. Disabled animation freezes the clock and current glyphs. Restore snapshot.ascii.elapsed/tick for exact replay.',
  palette: 'Use the existing shadowColor/highlightColor palette and saturation at adjusted brightness. Source alpha is multiplied by the glyph mask.',
}

export const ASCII_GLSL = `
float asciiMask(float brightness, vec2 local, vec2 cellIndex) {
  vec2 pixel = floor(local * vec2(7.0, 9.0)) - 1.0;
  if (pixel.x < 0.0 || pixel.x > 4.0 || pixel.y < 0.0 || pixel.y > 6.0) return 0.0;
  float row = 6.0 - pixel.y;
  float h = mod(mod(cellIndex.x,251.0)*73.0+mod(cellIndex.y,251.0)*151.0+mod(asciiTick,251.0)*199.0,251.0);
  h = mod(h*h*17.0+h*23.0+13.0,251.0);
  float glyph = min(7.0, floor(brightness * 8.0))*3.0 + floor(h*3.0/251.0);
  float bits = 0.0;
  ${ASCII_GLYPHS.flatMap(tier => tier.variants).map((glyph, index) => `${index ? 'else ' : ''}if (glyph < ${index + 0.5}) {\n${glyph.rows.map((bits, row) => `    ${row ? 'else ' : ''}if (row < ${row + 0.5}) bits = ${bits}.0;`).join('\n')}\n  }`).join('\n  ')}
  return mod(floor(bits / exp2(4.0 - pixel.x)), 2.0);
}
`
