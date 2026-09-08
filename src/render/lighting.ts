import * as THREE from 'three'
import type { DirectionalLightSettings, LightingSettings } from '../types'

export const DIRECTIONAL_LIGHT_RADIUS = Math.sqrt(75)

export const LIGHTING_CONVENTIONS = {
  coordinateSystem: 'Three.js right-handed world coordinates; +Y is up. Light positions in this recipe use the camera-facing studio frame. On every camera update rotate these offsets by Matrix4.lookAt(camera.position,camera.target,[0,1,0]), then add camera.target; the light target is camera.target. This keeps screen-space lighting fixed while orbiting.',
  angles: 'azimuth and elevation are degrees. azimuth 0 points from +Z toward the origin; +90 places the light at +X. elevation +90 places it at +Y.',
  directionalRadius: DIRECTIONAL_LIGHT_RADIUS,
  positionFormula: 'r = sqrt(75); az = azimuth * pi/180; el = elevation * pi/180; position = [r*sin(az)*cos(el), r*sin(el), r*cos(az)*cos(el)].',
  enabled: 'Create and keep all three lights. A disabled light has actual Three.js intensity 0; retain its configured intensity in lighting.settings so re-enabling restores it. Enabled intensity 0 remains exactly 0.',
  color: 'Light color is a CSS sRGB #RRGGBB string. Assign with light.color.set(hex), allowing normal Three.js sRGB-to-linear conversion. This differs from postprocess color uniforms, which store unconverted display-sRGB channels.',
  updates: 'Update world light position and target from the camera-facing offsets every frame, including camera drag; update color/intensity in place; changing lighting does not recreate the scene, reload the model, or reset the camera or model pose.',
} as const

export interface AmbientLightRecipe {
  id: 'ambient'
  type: 'AmbientLight'
  color: string
  intensity: number
}

export interface DirectionalLightRecipe {
  id: 'key' | 'fill'
  type: 'DirectionalLight'
  color: string
  intensity: number
  position: [number, number, number]
  target: [number, number, number]
}

export function directionalLightPosition(azimuth: number, elevation: number): [number, number, number] {
  const azimuthRadians = azimuth * Math.PI / 180
  const elevationRadians = elevation * Math.PI / 180
  const horizontalRadius = DIRECTIONAL_LIGHT_RADIUS * Math.cos(elevationRadians)
  return [
    horizontalRadius * Math.sin(azimuthRadians),
    DIRECTIONAL_LIGHT_RADIUS * Math.sin(elevationRadians),
    horizontalRadius * Math.cos(azimuthRadians),
  ]
}

function directionalRecipe(id: 'key' | 'fill', settings: DirectionalLightSettings): DirectionalLightRecipe {
  return {
    id, type: 'DirectionalLight', color: settings.color,
    intensity: settings.enabled ? settings.intensity : 0,
    position: directionalLightPosition(settings.azimuth, settings.elevation),
    target: [0, 0, 0],
  }
}

export function buildLightRecipe(settings: LightingSettings): [AmbientLightRecipe, DirectionalLightRecipe, DirectionalLightRecipe] {
  return [
    { id: 'ambient', type: 'AmbientLight', color: settings.ambient.color, intensity: settings.ambient.enabled ? settings.ambient.intensity : 0 },
    directionalRecipe('key', settings.key),
    directionalRecipe('fill', settings.fill),
  ]
}

/** The postprocess already writes display-sRGB, so these channels must not be linearized. */
export function displaySrgbVector(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace(/^#/, ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}


export function buildViewLightRecipe(settings: LightingSettings, camera?: { position: number[]; target: number[] }) {
  const lights = buildLightRecipe(settings)
  if (!camera) return lights
  const target = new THREE.Vector3().fromArray(camera.target)
  const rotation = new THREE.Matrix4().lookAt(new THREE.Vector3().fromArray(camera.position), target, new THREE.Vector3(0, 1, 0))
  for (const light of [lights[1], lights[2]]) {
    light.position = new THREE.Vector3(...light.position).applyMatrix4(rotation).add(target).toArray()
    light.target = target.toArray()
  }
  return lights
}
