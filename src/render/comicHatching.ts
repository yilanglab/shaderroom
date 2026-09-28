import { Color, Vector3 } from 'three'
import { buildLightRecipe } from './lighting'
import type { LightingSettings } from '../types'

export function comicHatchLights(settings: LightingSettings) {
  const lights = buildLightRecipe(settings)
  return {
    comicAmbient: new Color(lights[0].color).multiplyScalar(lights[0].intensity).toArray(),
    comicKey: new Color(lights[1].color).multiplyScalar(lights[1].intensity).toArray(),
    comicFill: new Color(lights[2].color).multiplyScalar(lights[2].intensity).toArray(),
    comicKeyDirection: new Vector3(...lights[1].position).normalize().toArray(),
    comicFillDirection: new Vector3(...lights[2].position).normalize().toArray(),
  }
}
