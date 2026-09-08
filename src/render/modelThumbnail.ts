import * as THREE from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { ModelEntry } from '../types'

export function createBuiltinGeometry(kind: ModelEntry['kind']) {
  if (kind === 'sphere') return new THREE.SphereGeometry(1.5, 64, 48)
  if (kind === 'torus-knot') return new THREE.TorusKnotGeometry(1, .34, 180, 24, 2, 3)
  return new RoundedBoxGeometry(2.4, 2.4, 2.4, 6, .32)
}

/** Independent studio preview, using the actual mesh with a neutral material. */
export function createThumbnailRenderer() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(256, 256)
  renderer.setPixelRatio(1)
  renderer.setClearColor(0, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  const scene = new THREE.Scene()
  scene.add(new THREE.AmbientLight(0xffffff, 1.7))
  const key = new THREE.DirectionalLight(0xffffff, 3)
  key.position.set(-3, 5, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xaabbff, 1)
  fill.position.set(4, 1, -2)
  scene.add(fill)
  return {
    render(source: THREE.Object3D) {
      const root = clone(source)
      const materials: THREE.Material[] = []
      root.traverse(object => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        const neutral = (original: THREE.Material) => {
          const material = new THREE.MeshStandardMaterial({ color: '#9dadd0', roughness: .65, metalness: 0, side: original.side, visible: original.visible })
          materials.push(material)
          return material
        }
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(neutral) : neutral(mesh.material)
      })
      scene.add(root)
      try {
        root.updateMatrixWorld(true)
        const box = new THREE.Box3().setFromObject(root)
        const center = box.getCenter(new THREE.Vector3())
        const radius = box.getSize(new THREE.Vector3()).length() / 2
        const camera = new THREE.PerspectiveCamera(35, 1, Math.max(radius / 100, .001), Math.max(radius * 30, 100))
        camera.position.copy(center).add(new THREE.Vector3(.7, .45, 2.8).normalize().multiplyScalar(radius / Math.sin(THREE.MathUtils.degToRad(17.5)) * 1.08))
        camera.lookAt(center)
        renderer.render(scene, camera)
        return renderer.domElement.toDataURL('image/png')
      } finally {
        scene.remove(root)
        materials.forEach(material => material.dispose())
        root.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) (object as THREE.SkinnedMesh).skeleton.dispose() })
      }
    },
    dispose() { renderer.dispose() },
  }
}
