import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

export const PARTICLE_SAMPLE_SEED = 20260908

export const PARTICLE_SAMPLING_RECIPE = {
  seed: PARTICLE_SAMPLE_SEED,
  random: 'Mulberry32; unsigned 32-bit state; three draws per point: triangle, barycentric r1, barycentric r2',
  randomCode: 'state = (state + 0x6d2b79f5) >>> 0; let value = state; value = Math.imul(value ^ (value >>> 15), value | 1); value ^= value + Math.imul(value ^ (value >>> 7), value | 61); return ((value ^ (value >>> 14)) >>> 0) / 4294967296;',
  count: { min: 1, max: 1_000_000, policy: 'Use the requested integer count exactly; no density adaptation or silent reduction.' },
  precision: 'Compute triangles, cumulative areas and barycentric coordinates as JavaScript Number; write samples to Float32Array. Logo normalization reads those rounded samples and writes Float32Array again.',
  traversalOrder: 'SVG paths in document order, createShapes order, triangle indices; model root.traverseVisible order, then instance index, material group order, then triangle index. No sorting.',
  logo: {
    parser: 'THREE.SVGLoader.parse / SVGLoader.createShapes / THREE.ShapeGeometry',
    curveSegments: 32,
    normalizedMaxExtent: 4,
    fill: 'Sample filled triangles, respecting SVG fill rules and holes; skip no-fill, hidden and fully transparent paths.',
    normalization: 'Center the triangulated fill bounds; scale the largest XY extent to 4 scene units; negate SVG Y; Z = 0.',
  },
  model: {
    surfaces: 'Visible Mesh surfaces, including indexed/non-indexed geometry, visible material groups, draw ranges and InstancedMesh instances.',
    vertices: 'Mesh.getVertexPosition includes the current morph target and skeletal pose; no animation is advanced during sampling.',
    weights: 'Triangle area after mesh.matrixWorld and instance transforms; reject degenerate, non-finite and out-of-range triangles.',
    coordinates: 'inverse(root.parent.matrixWorld) * mesh.matrixWorld * instanceMatrix; retain the normalized root transform and exclude the parent pose transform.',
    normals: 'Geometric face normals computed from sampled triangle vertices in the same parent-local coordinates.',
  },
  distribution: 'Choose a triangle by cumulative area, then use sqrt(r1) barycentric coordinates for uniform surface density.',
  pairing: 'The same requested count and seed on both surfaces; pair equal point indices without spatial sorting.',
} as const

interface TriangleTable {
  vertices: number[]
  normals: number[]
  cumulative: number[]
  area: number
}

export interface ModelParticleSample {
  positions: Float32Array
  normals: Float32Array
}

function createTable(): TriangleTable {
  return { vertices: [], normals: [], cumulative: [], area: 0 }
}

function finiteVector(vector: THREE.Vector3) {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)
}

function addTriangle(table: TriangleTable, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, area: number) {
  if (!finiteVector(a) || !finiteVector(b) || !finiteVector(c) || !Number.isFinite(area) || area <= 0) return
  const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
  if (!finiteVector(normal) || normal.lengthSq() === 0) return
  normal.normalize()
  const total = table.area + area
  if (!Number.isFinite(total) || total === table.area) return
  table.vertices.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  table.normals.push(normal.x, normal.y, normal.z)
  table.area = total
  table.cumulative.push(total)
}

function validateCount(count: number) {
  if (!Number.isSafeInteger(count) || count < PARTICLE_SAMPLING_RECIPE.count.min || count > PARTICLE_SAMPLING_RECIPE.count.max) {
    throw new Error('粒子数量必须是 1–1,000,000 之间的整数。')
  }
}

function randomGenerator(seed: number) {
  if (!Number.isFinite(seed)) throw new Error('粒子采样种子必须是有限数字。')
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function sampleTable(table: TriangleTable, count: number, seed: number): ModelParticleSample {
  if (table.area <= 0) throw new Error('没有可采样的有效三角形；请检查可见性、顶点索引和几何面积。')
  const random = randomGenerator(seed)
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  for (let point = 0; point < count; point++) {
    const threshold = random() * table.area
    let low = 0
    let high = table.cumulative.length - 1
    while (low < high) {
      const middle = (low + high) >>> 1
      if (threshold < table.cumulative[middle]) high = middle
      else low = middle + 1
    }
    const triangle = low
    const root = Math.sqrt(random())
    const fraction = random()
    const wa = 1 - root
    const wb = root * (1 - fraction)
    const wc = root * fraction
    for (let axis = 0; axis < 3; axis++) {
      const start = triangle * 9 + axis
      positions[point * 3 + axis] = table.vertices[start] * wa + table.vertices[start + 3] * wb + table.vertices[start + 6] * wc
      normals[point * 3 + axis] = table.normals[triangle * 3 + axis]
    }
  }
  return { positions, normals }
}

/** Uniformly sample the currently visible model in the normalized root's parent coordinates. */
export function sampleModel(root: THREE.Object3D, count: number, seed = PARTICLE_SAMPLE_SEED): ModelParticleSample {
  validateCount(count)
  root.updateWorldMatrix(true, true)
  const parentInverse = new THREE.Matrix4()
  if (root.parent) {
    const determinant = root.parent.matrixWorld.determinant()
    if (!Number.isFinite(determinant) || determinant === 0) throw new Error('模型父级变换不可逆，无法建立粒子坐标。')
    parentInverse.copy(root.parent.matrixWorld).invert()
  }
  const table = createTable()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const wa = new THREE.Vector3(), wb = new THREE.Vector3(), wc = new THREE.Vector3()
  const edge = new THREE.Vector3(), otherEdge = new THREE.Vector3()
  const instanceMatrix = new THREE.Matrix4()
  const worldMatrix = new THREE.Matrix4()
  const localMatrix = new THREE.Matrix4()

  root.traverseVisible(object => {
    if (!(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    if (!position || position.itemSize < 3) return
    const index = geometry.getIndex()
    const vertexCount = index ? index.count : position.count
    const drawStart = Math.max(0, Math.floor(geometry.drawRange.start))
    const drawEnd = Math.min(vertexCount, drawStart + geometry.drawRange.count)
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const groups = Array.isArray(mesh.material) ? geometry.groups : [{ start: 0, count: vertexCount, materialIndex: 0 }]
    const instanceCount = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1

    for (let instance = 0; instance < instanceCount; instance++) {
      instanceMatrix.identity()
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).getMatrixAt(instance, instanceMatrix)
      worldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix)
      localMatrix.multiplyMatrices(parentInverse, worldMatrix)
      for (const group of groups) {
        if (!materials[group.materialIndex ?? 0]?.visible) continue
        const start = Math.max(drawStart, group.start)
        const end = Math.min(drawEnd, group.start + group.count)
        for (let offset = start; offset + 2 < end; offset += 3) {
          const ia = index ? index.getX(offset) : offset
          const ib = index ? index.getX(offset + 1) : offset + 1
          const ic = index ? index.getX(offset + 2) : offset + 2
          if (![ia, ib, ic].every(vertex => Number.isInteger(vertex) && vertex >= 0 && vertex < position.count)) continue
          try {
            mesh.getVertexPosition(ia, a)
            mesh.getVertexPosition(ib, b)
            mesh.getVertexPosition(ic, c)
          } catch {
            throw new Error('模型顶点读取失败，请检查骨骼、变形目标及几何数据。')
          }
          wa.copy(a).applyMatrix4(worldMatrix)
          wb.copy(b).applyMatrix4(worldMatrix)
          wc.copy(c).applyMatrix4(worldMatrix)
          const area = edge.subVectors(wb, wa).cross(otherEdge.subVectors(wc, wa)).length() * 0.5
          a.applyMatrix4(localMatrix)
          b.applyMatrix4(localMatrix)
          c.applyMatrix4(localMatrix)
          addTriangle(table, a, b, c, area)
        }
      }
    }
  })
  return sampleTable(table, count, seed)
}

/** Parse filled SVG shapes with Three.js; browser DOMParser is required. */
export function sampleLogo(svg: string, count: number, seed = PARTICLE_SAMPLE_SEED): Float32Array {
  validateCount(count)
  if (typeof DOMParser === 'undefined') throw new Error('SVG 粒子采样需要浏览器的 DOMParser。')
  const parsed = new SVGLoader().parse(svg)
  if (parsed.xml.nodeName === 'parsererror' || parsed.xml.querySelector('parsererror')) throw new Error('SVG 文件格式无效。')
  const table = createTable()
  const bounds = new THREE.Box3()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const edge = new THREE.Vector3(), otherEdge = new THREE.Vector3()
  for (const path of parsed.paths) {
    const style = path.userData?.style
    if (style?.fill === 'none' || style?.visibility === 'hidden' || Number(style?.fillOpacity) === 0 || Number(style?.opacity) === 0) continue
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new THREE.ShapeGeometry(shape, PARTICLE_SAMPLING_RECIPE.logo.curveSegments)
      try {
        const position = geometry.getAttribute('position')
        const index = geometry.getIndex()
        const length = index ? index.count : position.count
        for (let offset = 0; offset + 2 < length; offset += 3) {
          a.fromBufferAttribute(position, index ? index.getX(offset) : offset)
          b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1)
          c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2)
          const area = edge.subVectors(b, a).cross(otherEdge.subVectors(c, a)).length() * 0.5
          const previousCount = table.cumulative.length
          addTriangle(table, a, b, c, area)
          if (table.cumulative.length !== previousCount) bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c)
        }
      } finally {
        geometry.dispose()
      }
    }
  }
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const extent = Math.max(size.x, size.y)
  if (!Number.isFinite(extent) || extent <= 0) throw new Error('SVG 没有可采样的填充图形。')
  const scale = PARTICLE_SAMPLING_RECIPE.logo.normalizedMaxExtent / extent
  const { positions } = sampleTable(table, count, seed)
  for (let offset = 0; offset < positions.length; offset += 3) {
    positions[offset] = (positions[offset] - center.x) * scale
    positions[offset + 1] = -(positions[offset + 1] - center.y) * scale
    positions[offset + 2] = 0
  }
  return positions
}
