import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { MAX_GLB_BYTES, prepareGlbFile, validateGlb } from '../src/lib/upload'

function glb(json: unknown = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [] }] }, bin?: Uint8Array): ArrayBuffer {
  const encoded = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = Math.ceil(encoded.length / 4) * 4
  const binLength = bin === undefined ? 0 : Math.ceil(bin.length / 4) * 4
  const buffer = new ArrayBuffer(20 + jsonLength + (bin === undefined ? 0 : 8 + binLength))
  const data = new DataView(buffer)
  data.setUint32(0, 0x46546c67, true)
  data.setUint32(4, 2, true)
  data.setUint32(8, buffer.byteLength, true)
  data.setUint32(12, jsonLength, true)
  data.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buffer, 20, jsonLength).fill(0x20)
  new Uint8Array(buffer, 20, encoded.length).set(encoded)
  if (bin !== undefined) {
    data.setUint32(20 + jsonLength, binLength, true)
    data.setUint32(24 + jsonLength, 0x004e4942, true)
    new Uint8Array(buffer, 28 + jsonLength, bin.length).set(bin)
  }
  return buffer
}

test('accepts a self-contained GLB, including a BIN buffer with legal padding and embedded data URIs', () => {
  assert.doesNotThrow(() => validateGlb(glb(), '模型.GLB'))
  const withBin = glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 5 }], bufferViews: [{ buffer: 0, byteOffset: 1, byteLength: 4 }] }, new Uint8Array(5))
  assert.doesNotThrow(() => validateGlb(withBin, 'mesh.glb'))
  assert.doesNotThrow(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri: 'data:application/octet-stream;base64,AAAAAA==' }], images: [{ uri: 'data:image/png;base64,aGVsbG8=' }] }), 'embedded.glb'))
})

test('rejects wrong extension, oversized input and incomplete reads before parsing', () => {
  const valid = glb()
  assert.throws(() => validateGlb(valid, 'mesh.gltf'), /\.glb/)
  assert.throws(() => validateGlb(valid, 'mesh.glb', MAX_GLB_BYTES + 1), /50 MiB/)
  assert.throws(() => validateGlb(valid, 'mesh.glb', valid.byteLength + 1), /大小不符/)
  assert.throws(() => validateGlb(new ArrayBuffer(4), 'mesh.glb'), /不完整/)
})

test('rejects corrupt GLB headers, lengths, JSON and chunks', () => {
  for (const [offset, value, expected] of [
    [0, 0, /不是 GLB/], [4, 1, /GLB 2\.0/], [8, 20, /声明长度/],
    [12, 0xfffffff0, /越界/], [12, 5, /对齐/], [16, 0x004e4942, /首个数据块/],
  ] as const) {
    const buffer = glb()
    new DataView(buffer).setUint32(offset, value, true)
    assert.throws(() => validateGlb(buffer, 'broken.glb'), expected)
  }
  const invalidJson = glb()
  new Uint8Array(invalidJson)[20] = 0xff
  assert.throws(() => validateGlb(invalidJson, 'broken.glb'), /JSON 内容/)
  assert.throws(() => validateGlb(glb({ asset: { version: '1.0' } }), 'old.glb'), /asset 信息/)
  assert.throws(() => validateGlb(glb([]), 'array.glb'), /asset 信息/)
  const duplicateJson = glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }, new Uint8Array(4))
  const jsonLength = new DataView(duplicateJson).getUint32(12, true)
  new DataView(duplicateJson).setUint32(24 + jsonLength, 0x4e4f534a, true)
  assert.throws(() => validateGlb(duplicateJson, 'duplicate.glb'), /JSON 数据块/)
})

test('rejects missing/oversized BIN data and out-of-bounds buffer views', () => {
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }), 'missing.glb'), /BIN/)
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 9 }] }, new Uint8Array(4)), 'short.glb'), /BIN/)
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' } }, new Uint8Array(4)), 'orphan.glb'), /没有对应/)
  assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }], bufferViews: [{ buffer: 0, byteOffset: 1, byteLength: 4 }] }, new Uint8Array(4)), 'view.glb'), /bufferView/)
})

test('rejects external resources so a selected GLB cannot trigger companion-file requests', () => {
  for (const uri of ['texture.png', '../mesh.bin', 'https://example.com/model.bin', '//example.com/a.png', 'file:///tmp/a.png', 'blob:external']) {
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, buffers: [{ byteLength: 4, uri }] }), 'linked.glb'), /外部文件/)
    assert.throws(() => validateGlb(glb({ asset: { version: '2.0' }, images: [{ uri }] }), 'linked.glb'), /外部文件/)
  }
})

test('preparation ignores MIME, preserves filename and fingerprint, and gives each entry its own identity', async (context) => {
  const buffer = glb()
  const file = new File([buffer], '我的 模型.GLB', { type: 'text/plain' })
  let urls = 0
  context.mock.method(URL, 'createObjectURL', () => `blob:test-${++urls}`)
  const first = await prepareGlbFile(file)
  const second = await prepareGlbFile(file)
  assert.equal(first.fileName, file.name)
  assert.equal(first.fileSize, buffer.byteLength)
  assert.equal(first.sha256, createHash('sha256').update(new Uint8Array(buffer)).digest('hex'))
  assert.notEqual(first.id, second.id)
  assert.notEqual(first.url, second.url)
  assert.equal(urls, 2)
})

test('failed preparation never allocates an object URL', async (context) => {
  let urls = 0
  context.mock.method(URL, 'createObjectURL', () => { urls += 1; return 'blob:unexpected' })
  await assert.rejects(prepareGlbFile(new File([glb({ asset: { version: '2.0' }, images: [{ uri: 'https://example.com/a.png' }] })], 'linked.glb')), /外部文件/)
  await assert.rejects(prepareGlbFile(new File([new Uint8Array(24)], 'broken.glb')), /不是 GLB/)
  assert.equal(urls, 0)
})

test('FBX upload accepts binary and ASCII identities and preserves the file fingerprint', async () => {
  const { validateFbx, prepareModelFile } = await import('../src/lib/upload')
  const binary = new Uint8Array(32)
  binary.set(new TextEncoder().encode('Kaydara FBX Binary  \0\x1a\0'))
  new DataView(binary.buffer).setUint32(23, 7400, true)
  validateFbx(binary.buffer, 'model.FBX')
  const ascii = new TextEncoder().encode('; FBX 7.4.0 project file\nFBXHeaderExtension: {\n FBXVersion: 7400\n}').buffer
  validateFbx(ascii, 'model.fbx')
  assert.throws(() => validateFbx(ascii, 'model.fbx', ascii.byteLength + 1), /长度/)
  new DataView(binary.buffer).setUint32(23, 6100, true)
  assert.throws(() => validateFbx(binary.buffer, 'model.fbx'), /7.0/)
  assert.throws(() => validateFbx(new ArrayBuffer(40), 'model.fbx'), /有效/)
  const entry = await prepareModelFile(new File([ascii], 'model.FBX'))
  assert.equal(entry.kind, 'fbx')
  assert.equal(entry.name, 'model')
  assert.equal(entry.fileSize, ascii.byteLength)
  assert.equal(entry.sha256?.length, 64)
  URL.revokeObjectURL(entry.url!)
})
