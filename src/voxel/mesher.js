// 网格化：按材质分块输出 chunk；朴素剔除 + 贪婪合并两级，面数超阈值自动简化
import { MATERIALS, getVoxel, createModel } from './model.js'

export const FACE_LIMIT = 80000

const FACES = [
  { dir: [1, 0, 0],  corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { dir: [0, 1, 0],  corners: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir: [0, -1, 0], corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir: [0, 0, 1],  corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { dir: [0, 0, -1], corners: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] }
]

function newChunkStore() {
  const map = new Map()
  return {
    get(mat) {
      if (!map.has(mat)) map.set(mat, { mat, positions: [], normals: [], colors: [], indices: [] })
      return map.get(mat)
    },
    list() { return [...map.values()] }
  }
}

function pushQuad(chunk, verts, normal, mat) {
  const base = chunk.positions.length / 3
  const c = MATERIALS[mat] ? MATERIALS[mat].color : [1, 0, 1]
  for (const v of verts) {
    chunk.positions.push(v[0], v[1], v[2])
    chunk.normals.push(normal[0], normal[1], normal[2])
    chunk.colors.push(c[0], c[1], c[2])
  }
  chunk.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

// 朴素面剔除：逐体素检查 6 邻接，外露才生成面；按材质分块
export function buildNaive(model) {
  const store = newChunkStore()
  const [nx, ny, nz] = model.dims
  const ox = -nx / 2, oz = -nz / 2
  for (let y = 0; y < ny; y++)
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        const mat = getVoxel(model, x, y, z)
        if (!mat) continue
        const chunk = store.get(mat)
        for (const f of FACES) {
          const [dx, dy, dz] = f.dir
          if (getVoxel(model, x + dx, y + dy, z + dz)) continue
          pushQuad(chunk, f.corners.map(c => [c[0] + x + ox, c[1] + y, c[2] + z + oz]), f.dir, mat)
        }
      }
  return finalize(store)
}

// 贪婪合并：同材质共面矩形合并成大四边形，仍按材质分块
export function buildGreedy(model) {
  const store = newChunkStore()
  const dims = model.dims
  const [nx, ny, nz] = model.dims
  const ox = -nx / 2, oz = -nz / 2
  const off = [ox, 0, oz]

  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3
    const du = dims[u], dv = dims[v], dd = dims[d]
    const x = [0, 0, 0], q = [0, 0, 0]
    q[d] = 1
    const mask = new Int16Array(du * dv)

    for (x[d] = -1; x[d] < dd;) {
      // 构造当前切片的遮挡掩码：正数=正向面，负数=反向面，绝对值为材质号
      let n = 0
      for (x[v] = 0; x[v] < dv; x[v]++)
        for (x[u] = 0; x[u] < du; x[u]++) {
          const a = x[d] >= 0 ? getVoxel(model, x[0], x[1], x[2]) : 0
          const b = x[d] < dd - 1 ? getVoxel(model, x[0] + q[0], x[1] + q[1], x[2] + q[2]) : 0
          if (a && a === b) mask[n] = 0
          else if (a && (!b || a !== b)) mask[n] = a
          else if (!a && b) mask[n] = -b
          else mask[n] = 0
          n++
        }
      x[d]++
      // 在掩码上贪婪合并矩形
      n = 0
      for (let j = 0; j < dv; j++) {
        for (let i = 0; i < du;) {
          const c = mask[n]
          if (!c) { i++; n++; continue }
          let w = 1, h = 1
          while (i + w < du && mask[n + w] === c) w++
          outer: for (; j + h < dv; h++) {
            for (let k = 0; k < w; k++) if (mask[n + k + h * du] !== c) break outer
          }
          const mat = Math.abs(c)
          const sign = c > 0 ? 1 : -1
          const du3 = [0, 0, 0], dv3 = [0, 0, 0]
          du3[u] = w; dv3[v] = h
          x[u] = i; x[v] = j
          const p = [x[0] + off[0], x[1] + off[1], x[2] + off[2]]
          const normal = [0, 0, 0]; normal[d] = sign
          const verts = sign > 0
            ? [p, add(p, du3), add(add(p, du3), dv3), add(p, dv3)]
            : [p, add(p, dv3), add(add(p, du3), dv3), add(p, du3)]
          pushQuad(store.get(mat), verts, normal, mat)
          for (let jj = 0; jj < h; jj++)
            for (let ii = 0; ii < w; ii++) mask[n + ii + jj * du] = 0
          i += w; n += w
        }
      }
    }
  }
  return finalize(store)
}

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }

function finalize(store) {
  const chunks = store.list().map(c => ({
    mat: c.mat,
    matName: MATERIALS[c.mat] ? MATERIALS[c.mat].name : `#${c.mat}`,
    faceCount: c.indices.length / 6,
    positions: new Float32Array(c.positions),
    normals: new Float32Array(c.normals),
    colors: new Float32Array(c.colors),
    indices: new Uint32Array(c.indices)
  }))
  const faceCount = chunks.reduce((s, c) => s + c.faceCount, 0)
  return { chunks, faceCount }
}

// 2× 降采样：每个 2×2×2 块取出现次数最多的非空材质
export function downsample(model) {
  const [nx, ny, nz] = model.dims
  const dims = [Math.ceil(nx / 2), Math.ceil(ny / 2), Math.ceil(nz / 2)]
  const out = createModel(dims)
  for (let y = 0; y < dims[1]; y++)
    for (let z = 0; z < dims[2]; z++)
      for (let x = 0; x < dims[0]; x++) {
        const freq = new Map()
        for (let dy = 0; dy < 2; dy++)
          for (let dz = 0; dz < 2; dz++)
            for (let dx = 0; dx < 2; dx++) {
              const v = getVoxel(model, 2 * x + dx, 2 * y + dy, 2 * z + dz)
              if (v) freq.set(v, (freq.get(v) || 0) + 1)
            }
        let best = 0, bestN = 0
        for (const [v, n] of freq) if (n > bestN) { best = v; bestN = n }
        if (best) out.data[x + dims[0] * (z + dims[2] * y)] = best
      }
  return out
}

// 自动简化：先朴素统计，超过 8 万面则切换贪婪合并；仍超限则降采样后再合并
export function buildAuto(model) {
  const naive = buildNaive(model)
  if (naive.faceCount <= FACE_LIMIT) {
    return { chunks: naive.chunks, faceCount: naive.faceCount, simplified: false, before: naive.faceCount, after: naive.faceCount }
  }
  let greedy = buildGreedy(model)
  if (greedy.faceCount > FACE_LIMIT) {
    greedy = buildGreedy(downsample(model))
  }
  return { chunks: greedy.chunks, faceCount: greedy.faceCount, simplified: true, before: naive.faceCount, after: greedy.faceCount }
}
