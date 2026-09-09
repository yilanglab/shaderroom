export type PanelTheme = 'light' | 'dark'

/** Linear-light luminance; the two thresholds prevent chatter while dragging colours. */
export function panelThemeForColor(color: string, previous?: PanelTheme): PanelTheme {
  if (!/^#[\da-f]{6}$/i.test(color)) return previous ?? 'light'
  const channels = [1, 3, 5].map(index => {
    const value = parseInt(color.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  const threshold = previous === 'dark' ? 0.16 : previous === 'light' ? 0.10 : 0.13
  return luminance < threshold ? 'dark' : 'light'
}
