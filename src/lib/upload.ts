import type { ModelEntry } from '../types'

export const MAX_GLB_BYTES = 50 * 1024 * 1024
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function entries(json: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = json[key]
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => !object(item))) {
    throw new Error(`GLB 的 ${key} 结构无效，请从建模软件重新导出 GLB。`)
  }
  return value as Record<string, unknown>[]
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateFileIdentity(fileName: string, fileSize: number): void {
  if (!/\.glb$/i.test(fileName)) throw new Error('请选择 .glb 或 .fbx 文件。')
  if (!Number.isSafeInteger(fileSize) || fileSize < 20) throw new Error('GLB 文件为空或不完整，请重新导出后选择。')
  if (fileSize > MAX_GLB_BYTES) throw new Error('GLB 文件超过 50 MiB，请压缩模型或纹理后重新选择。')
}

/** Validate the single-file GLB container before GLTFLoader sees any of its content. */
export function validateGlb(buffer: ArrayBuffer, fileName: string, fileSize = buffer.byteLength): void {
  validateFileIdentity(fileName, fileSize)
  if (buffer.byteLength !== fileSize) throw new Error('读取的 GLB 长度与文件大小不符，请重新选择文件。')
  const data = new DataView(buffer)
  if (data.getUint32(0, true) !== 0x46546c67) throw new Error('文件内容不是 GLB；修改扩展名无法转换格式，请重新导出 GLB。')
  if (data.getUint32(4, true) !== 2) throw new Error('仅支持 GLB 2.0，请使用 glTF 2.0 / GLB 格式重新导出。')
  if (data.getUint32(8, true) !== buffer.byteLength) throw new Error('GLB 声明长度与实际文件不符，文件可能已损坏。')

  let offset = 12
  let json: Record<string, unknown> | undefined
  let binLength: number | undefined
  let chunks = 0
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) throw new Error('GLB 数据块头不完整，请重新导出文件。')
    const length = data.getUint32(offset, true)
    const type = data.getUint32(offset + 4, true)
    const start = offset + 8
    const end = start + length
    if (length % 4 !== 0 || end > buffer.byteLength) throw new Error('GLB 数据块越界或未按 4 字节对齐，文件可能已损坏。')
    if (chunks === 0 && type !== JSON_CHUNK) throw new Error('GLB 首个数据块必须是 JSON，请重新导出文件。')
    if (type === JSON_CHUNK) {
      if (json || chunks !== 0 || length === 0) throw new Error('GLB 的 JSON 数据块数量或顺序无效。')
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, start, length)))
      } catch {
        throw new Error('GLB 的 JSON 内容无法解析，请重新导出文件。')
      }
      if (!object(parsed) || !object(parsed.asset) || parsed.asset.version !== '2.0') {
        throw new Error('GLB 缺少有效的 glTF 2.0 asset 信息，请重新导出文件。')
      }
      json = parsed
    } else if (type === BIN_CHUNK) {
      if (binLength !== undefined) throw new Error('GLB 包含重复的 BIN 数据块，请重新导出文件。')
      binLength = length
    }
    // Unknown GLB chunk types are deliberately skipped, as required by glTF 2.0.
    offset = end
    chunks += 1
  }
  if (!json) throw new Error('GLB 缺少 JSON 数据块，请重新导出文件。')

  const buffers = entries(json, 'buffers')
  const images = entries(json, 'images')
  for (const item of [...buffers, ...images]) {
    if (item.uri !== undefined && (typeof item.uri !== 'string' || !/^data:[^,]*,/i.test(item.uri))) {
      throw new Error('此 GLB 引用了外部文件。请将纹理和缓冲区嵌入 GLB 后重新导出；这里只接收单个自包含文件。')
    }
  }
  for (const [index, item] of buffers.entries()) {
    if (!nonNegativeInteger(item.byteLength)) throw new Error('GLB 缓冲区 byteLength 无效，请重新导出文件。')
    if (item.uri === undefined) {
      if (index !== 0 || binLength === undefined || item.byteLength > binLength || binLength - item.byteLength > 3) {
        throw new Error('GLB 缓冲区与 BIN 数据块长度或索引不匹配，请重新导出文件。')
      }
    }
  }
  if (binLength !== undefined && (!buffers[0] || buffers[0].uri !== undefined)) {
    throw new Error('GLB 的 BIN 数据块没有对应的内嵌缓冲区，请重新导出文件。')
  }
  const views = entries(json, 'bufferViews')
  for (const view of views) {
    const start = view.byteOffset ?? 0
    if (!nonNegativeInteger(view.buffer) || !buffers[view.buffer]
      || !nonNegativeInteger(start) || !nonNegativeInteger(view.byteLength)
      || start + view.byteLength > (buffers[view.buffer].byteLength as number)) {
      throw new Error('GLB 的 bufferView 超出缓冲区范围，请重新导出文件。')
    }
  }
  for (const item of images) {
    if (item.bufferView !== undefined && (!nonNegativeInteger(item.bufferView) || !views[item.bufferView] || item.uri !== undefined)) {
      throw new Error('GLB 纹理的 bufferView 引用无效，请重新导出文件。')
    }
    if (item.uri === undefined && item.bufferView === undefined) throw new Error('GLB 纹理缺少内嵌数据，请重新导出文件。')
  }
}

export async function prepareModelFile(file: File): Promise<ModelEntry> {
  const isFbx = /\.fbx$/i.test(file.name)
  if (isFbx) validateFbxIdentity(file.name, file.size)
  else validateFileIdentity(file.name, file.size)
  let buffer: ArrayBuffer
  try { buffer = await file.arrayBuffer() } catch { throw new Error('无法读取文件，请确认文件可访问并重新选择。') }
  if (isFbx) validateFbx(buffer, file.name, file.size)
  else validateGlb(buffer, file.name, file.size)
  if (!globalThis.crypto?.subtle) throw new Error('当前环境无法计算模型指纹，请使用 localhost 或 HTTPS 打开工具。')
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const fileName = file.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_')
  const id = `upload-${crypto.randomUUID()}`
  // The UI owns this URL and revokes it when the entry is removed or unmounted.
  const url = URL.createObjectURL(file)
  return { id, name: fileName.replace(/\.(glb|fbx)$/i, ''), kind: isFbx ? 'fbx' : 'glb', url, source: 'upload', fileName, fileSize: file.size, sha256 }
}


function validateFbxIdentity(name: string, size: number) {
  if (!/\.fbx$/i.test(name) || !Number.isSafeInteger(size) || size < 27) throw new Error('FBX 文件为空或不完整，请重新导出。')
  if (size > MAX_GLB_BYTES) throw new Error('FBX 文件超过 50 MiB，请简化模型后重新选择。')
}
export function validateFbx(buffer: ArrayBuffer, name: string, size = buffer.byteLength) {
  validateFbxIdentity(name, size)
  if (buffer.byteLength !== size) throw new Error('读取的 FBX 长度与文件大小不符。')
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 65536)))
  const binary = header.startsWith('Kaydara FBX Binary  \0\x1a\0')
  const version = binary ? new DataView(buffer).getUint32(23, true) : Number(header.match(/FBXVersion:\s*(\d+)/)?.[1])
  if (!version || (!binary && !/FBXHeaderExtension\s*:/.test(header))) throw new Error('文件内容不是有效的 FBX，请重新导出。')
  if (version < 7000) throw new Error('请导出 FBX 7.0 或更新版本。')
}

// Compatibility for existing callers; the public upload path supports both formats.
export const prepareGlbFile = prepareModelFile
