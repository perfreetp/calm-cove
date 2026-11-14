// 纯 JS glTF 2.0 GLB 导出器:按材质把体素合批为 Box 图元
import { VOXEL_TYPES, CELL_MM } from './constants.js'

const CELL = CELL_MM / 1000 // 0.5m
const VOX_H = 0.4 // 每层层高 0.4m

// 单位立方体 24 顶点(每面 4 个,带法线)
const FACES = [
  { n: [0, 0, 1], q: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], q: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { n: [1, 0, 0], q: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], q: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], q: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], q: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] }
]

function hexToRgb01(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

export function buildGLB(voxels) {
  // 按材质分组
  const groups = new Map()
  for (const v of voxels) {
    if (!groups.has(v.type)) groups.set(v.type, [])
    groups.get(v.type).push(v)
  }

  const bufferViews = []
  const accessors = []
  const materials = []
  const primitives = []
  const binParts = []
  let binLen = 0

  const align4 = () => { while (binLen % 4) { binParts.push(new Uint8Array([0])); binLen++ } }

  groups.forEach((list, type) => {
    const positions = []
    const normals = []
    const indices = []
    let vbase = 0
    const minP = [Infinity, Infinity, Infinity]
    const maxP = [-Infinity, -Infinity, -Infinity]
    for (const vx of list) {
      const ox = vx.x * CELL, oy = vx.z * VOX_H, oz = vx.y * CELL
      for (const f of FACES) {
        for (const q of f.q) {
          const p = [ox + q[0] * CELL, oy + q[1] * VOX_H, oz + q[2] * CELL]
          positions.push(...p)
          normals.push(...f.n)
          for (let i = 0; i < 3; i++) {
            minP[i] = Math.min(minP[i], p[i]); maxP[i] = Math.max(maxP[i], p[i])
          }
        }
      }
      for (let i = 0; i < 6; i++) {
        const b = i * 4
        indices.push(vbase + b, vbase + b + 1, vbase + b + 2, vbase + b, vbase + b + 2, vbase + b + 3)
      }
      vbase += 24
    }

    // ---- indices (uint16;体素量远小于 65535/24) ----
    align4()
    const idxBytes = new Uint16Array(indices)
    const ibv = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: idxBytes.byteLength, target: 34963 })
    binParts.push(new Uint8Array(idxBytes.buffer)); binLen += idxBytes.byteLength
    const iAcc = accessors.length
    accessors.push({ bufferView: ibv, componentType: 5123, count: indices.length, type: 'SCALAR' })

    // ---- positions ----
    align4()
    const posF = new Float32Array(positions)
    const pbv = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: posF.byteLength, target: 34962 })
    binParts.push(new Uint8Array(posF.buffer)); binLen += posF.byteLength
    const pAcc = accessors.length
    accessors.push({ bufferView: pbv, componentType: 5126, count: positions.length / 3, type: 'VEC3', min: minP, max: maxP })

    // ---- normals ----
    align4()
    const nrmF = new Float32Array(normals)
    const nbv = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: binLen, byteLength: nrmF.byteLength, target: 34962 })
    binParts.push(new Uint8Array(nrmF.buffer)); binLen += nrmF.byteLength
    const nAcc = accessors.length
    accessors.push({ bufferView: nbv, componentType: 5126, count: normals.length / 3, type: 'VEC3' })

    const matIdx = materials.length
    materials.push({
      name: VOXEL_TYPES[type].label + ' / ' + VOXEL_TYPES[type].material,
      pbrMetallicRoughness: {
        baseColorFactor: hexToRgb01(VOXEL_TYPES[type].color),
        metallicFactor: 0.15, roughnessFactor: 0.75
      }
    })
    primitives.push({ attributes: { POSITION: pAcc, NORMAL: nAcc }, indices: iAcc, material: matIdx })
  })

  align4()
  const bin = new Uint8Array(binLen)
  let off = 0
  for (const part of binParts) { bin.set(part, off); off += part.length }

  const gltf = {
    asset: { version: '2.0', generator: 'tcm-voxel-pharmacy' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'pharmacy-layout', mesh: 0 }],
    meshes: [{ name: 'voxels', primitives }],
    materials,
    bufferViews,
    accessors,
    buffers: [{ byteLength: binLen }]
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const jsonChunk = new Uint8Array(jsonBytes.length + jsonPad)
  jsonChunk.set(jsonBytes)
  jsonChunk.fill(0x20, jsonBytes.length)

  const binPad = (4 - (bin.length % 4)) % 4
  const binChunk = new Uint8Array(bin.length + binPad)
  binChunk.set(bin)

  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length
  const out = new ArrayBuffer(total)
  const dv = new DataView(out)
  const u8 = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonChunk.length, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  u8.set(jsonChunk, 20)
  dv.setUint32(20 + jsonChunk.length, binChunk.length, true)
  dv.setUint32(24 + jsonChunk.length, 0x004e4942, true) // 'BIN\0'
  u8.set(binChunk, 28 + jsonChunk.length)
  return new Blob([out], { type: 'model/gltf-binary' })
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

// 药位清单 CSV(含 BOM,Excel 直接打开)
export function buildSlotCSV(voxels) {
  const head = ['药位编号', '设施类型', '材质', '所在层', '网格X', '网格Y',
    '斗格数', '单斗容量(kg)', '常用药位', '药名', '独立图层']
  const rows = voxels.map((v, i) => {
    const t = VOXEL_TYPES[v.type]
    return [
      'YW-' + String(i + 1).padStart(3, '0'),
      t.label, t.material, '第' + (v.z + 1) + '层',
      v.x, v.y,
      v.cells ?? '', v.capacity ?? '',
      v.commonSlot ? '是' : '否', v.herbName || '',
      v.type === 'poison_cab' ? '毒麻药柜层' : v.type === 'herb_cab' ? '普通药斗层' : '调剂作业层'
    ]
  })
  const esc = s => `"${String(s).replace(/"/g, '""')}"`
  const csv = [head, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  return new Blob([String.fromCharCode(0xFEFF) + csv], { type: "text/csv;charset=utf-8" })
}
