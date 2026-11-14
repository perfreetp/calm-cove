// 极简 GLB 导出：每个材质分块一个 primitive
import { MATERIALS } from './model.js'

export function chunksToGLB(chunks) {
  const json = {
    asset: { version: '2.0', generator: 'voxel-homestay-studio' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    bufferViews: [],
    accessors: []
  }
  const binParts = []
  let binLen = 0
  const matMap = new Map()

  function addBufferView(data, target) {
    const pad = (4 - (binLen % 4)) % 4
    if (pad) { binParts.push(new Uint8Array(pad)); binLen += pad }
    json.bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: data.byteLength, target })
    binParts.push(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    binLen += data.byteLength
    return json.bufferViews.length - 1
  }

  function materialIndex(mat) {
    if (matMap.has(mat)) return matMap.get(mat)
    const c = MATERIALS[mat] ? MATERIALS[mat].color : [1, 0, 1]
    json.materials.push({
      name: MATERIALS[mat] ? MATERIALS[mat].name : `mat${mat}`,
      pbrMetallicRoughness: { baseColorFactor: [...c, 1], metallicFactor: 0, roughnessFactor: 0.9 }
    })
    matMap.set(mat, json.materials.length - 1)
    return matMap.get(mat)
  }

  for (const chunk of chunks) {
    const posView = addBufferView(chunk.positions, 34962)
    const norView = addBufferView(chunk.normals, 34962)
    const colView = addBufferView(chunk.colors, 34962)
    const idxView = addBufferView(chunk.indices, 34963)

    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < chunk.positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], chunk.positions[i + k])
        max[k] = Math.max(max[k], chunk.positions[i + k])
      }

    const posAcc = json.accessors.push({ bufferView: posView, componentType: 5126, count: chunk.positions.length / 3, type: 'VEC3', min, max }) - 1
    const norAcc = json.accessors.push({ bufferView: norView, componentType: 5126, count: chunk.normals.length / 3, type: 'VEC3' }) - 1
    const colAcc = json.accessors.push({ bufferView: colView, componentType: 5126, count: chunk.colors.length / 3, type: 'VEC3' }) - 1
    const idxAcc = json.accessors.push({ bufferView: idxView, componentType: 5125, count: chunk.indices.length, type: 'SCALAR' }) - 1

    json.meshes.push({
      name: chunk.matName,
      primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc, COLOR_0: colAcc }, indices: idxAcc, material: materialIndex(chunk.mat) }]
    })
    json.nodes.push({ mesh: json.meshes.length - 1, name: chunk.matName })
    json.scenes[0].nodes.push(json.nodes.length - 1)
  }

  const jsonStr = JSON.stringify(json)
  const jsonPad = (4 - (jsonStr.length % 4)) % 4
  const jsonBytes = new TextEncoder().encode(jsonStr + ' '.repeat(jsonPad))
  const binPad = (4 - (binLen % 4)) % 4
  if (binPad) { binParts.push(new Uint8Array(binPad)); binLen += binPad }

  const total = 12 + 8 + jsonBytes.length + 8 + binLen
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  let o = 0
  dv.setUint32(o, 0x46546c67, true); o += 4 // 'glTF'
  dv.setUint32(o, 2, true); o += 4
  dv.setUint32(o, total, true); o += 4
  dv.setUint32(o, jsonBytes.length, true); o += 4
  dv.setUint32(o, 0x4e4f534a, true); o += 4 // 'JSON'
  new Uint8Array(out, o, jsonBytes.length).set(jsonBytes); o += jsonBytes.length
  dv.setUint32(o, binLen, true); o += 4
  dv.setUint32(o, 0x004e4942, true); o += 4 // 'BIN'
  const binOut = new Uint8Array(out, o)
  let off = 0
  for (const p of binParts) { binOut.set(p, off); off += p.byteLength }
  return out
}

export function downloadBlob(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
