import * as THREE from 'three'
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'

/** Static FBX: embedded images are local; companion texture files are optional and omitted. */
export function parseStaticFbx(buffer: ArrayBuffer) {
  const manager = new THREE.LoadingManager()
  class LocalTextureLoader extends THREE.TextureLoader {
    override load(url: string, onLoad?: (texture: THREE.Texture<HTMLImageElement>) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): THREE.Texture<HTMLImageElement> {
      if (!/^(blob:|data:)/i.test(url)) {
        const texture = new THREE.Texture<HTMLImageElement>()
        texture.userData.omittedExternalTexture = true
        return texture
      }
      const release = () => { if (url.startsWith('blob:')) URL.revokeObjectURL(url) }
      return super.load(url, texture => { release(); onLoad?.(texture) }, onProgress, error => { release(); onError?.(error) })
    }
  }
  manager.addHandler(/.*/, new LocalTextureLoader(manager))
  const root = new FBXLoader(manager).parse(buffer, '')
  root.traverse(object => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const properties = material as unknown as Record<string, unknown>
      for (const [key, value] of Object.entries(properties)) {
        if (value instanceof THREE.Texture && value.userData.omittedExternalTexture) {
          value.dispose()
          properties[key] = null
        }
      }
    }
  })
  // No AnimationMixer is created: retain the file's initial pose.
  return root
}
