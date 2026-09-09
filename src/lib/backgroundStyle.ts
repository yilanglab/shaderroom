import type { BackgroundSettings } from '../types'

export function backgroundStyle(settings: BackgroundSettings) {
  const brightness = [1, 3, 5].reduce((sum, index, channel) => sum + parseInt(settings.color.slice(index, index + 2), 16) * [0.299, 0.587, 0.114][channel], 0)
  const rgb = brightness > 165 ? '31, 39, 56' : '255, 255, 255'
  const line = `rgba(${rgb}, ${settings.gridOpacity}) 1px, transparent 1px`
  return {
    backgroundColor: settings.color,
    backgroundImage: settings.grid ? `linear-gradient(${line}), linear-gradient(90deg, ${line})` : 'none',
    backgroundSize: `${settings.gridSize}px ${settings.gridSize}px`,
    backgroundPosition: '0 0',
  }
}
