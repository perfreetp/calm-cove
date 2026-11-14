// 体素数据模型：三维网格 + 镜像编辑 + 框选复制粘贴 + 版本差异
export const DIMS = [40, 20, 40] // x, y, z

// 材质表（编号即调色板索引，0 为空）
export const MATERIALS = [
  { id: 0, name: '空', color: [0, 0, 0] },
  { id: 1, name: '原木', color: [0.71, 0.52, 0.30] },
  { id: 2, name: '白墙', color: [0.95, 0.93, 0.89] },
  { id: 3, name: '青瓦', color: [0.36, 0.42, 0.45] },
  { id: 4, name: '石材', color: [0.55, 0.55, 0.55] },
  { id: 5, name: '玻璃', color: [0.62, 0.83, 0.91] },
  { id: 6, name: '竹编', color: [0.79, 0.66, 0.42] },
  { id: 7, name: '暖光', color: [0.96, 0.79, 0.36] },
  { id: 8, name: '植物', color: [0.42, 0.60, 0.36] }
]

export function createModel(dims = DIMS) {
  return { dims: [...dims], data: new Uint8Array(dims[0] * dims[1] * dims[2]) }
}

export function vidx(dims, x, y, z) {
  return x + dims[0] * (z + dims[2] * y)
}

export function inBounds(dims, x, y, z) {
  return x >= 0 && y >= 0 && z >= 0 && x < dims[0] && y < dims[1] && z < dims[2]
}

export function getVoxel(m, x, y, z) {
  if (!inBounds(m.dims, x, y, z)) return 0
  return m.data[vidx(m.dims, x, y, z)]
}

// 写入体素，mirrorX / mirrorZ 分别控制 X 轴、Z 轴镜像对称
export function setVoxel(m, x, y, z, v, { mirrorX = false, mirrorZ = false } = {}) {
  const [nx, , nz] = m.dims
  const pts = [[x, y, z]]
  if (mirrorX) pts.push([nx - 1 - x, y, z])
  if (mirrorZ) pts.push([x, y, nz - 1 - z])
  if (mirrorX && mirrorZ) pts.push([nx - 1 - x, y, nz - 1 - z])
  for (const [px, py, pz] of pts) {
    if (inBounds(m.dims, px, py, pz)) m.data[vidx(m.dims, px, py, pz)] = v
  }
}

export function serialize(m) {
  return { dims: [...m.dims], data: Array.from(m.data) }
}

export function deserialize(s) {
  const m = createModel(s.dims)
  m.data.set(s.data)
  return m
}

// 框选区域 {x0,y0,z0,x1,y1,z1}（含端点，自动规整）
export function normBox(b) {
  return {
    x0: Math.min(b.x0, b.x1), y0: Math.min(b.y0, b.y1), z0: Math.min(b.z0, b.z1),
    x1: Math.max(b.x0, b.x1), y1: Math.max(b.y0, b.y1), z1: Math.max(b.z0, b.z1)
  }
}

// 复制选区：保留原始材质编号
export function copyRegion(m, box) {
  const b = normBox(box)
  const sx = b.x1 - b.x0 + 1, sy = b.y1 - b.y0 + 1, sz = b.z1 - b.z0 + 1
  const data = new Uint8Array(sx * sy * sz)
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++)
        data[x + sx * (z + sz * y)] = getVoxel(m, b.x0 + x, b.y0 + y, b.z0 + z)
  return { sx, sy, sz, data: Array.from(data) }
}

// 粘贴到 (ox,oy,oz) 为最小角的位置，材质编号原样写入；越界部分裁剪
export function pasteRegion(m, clip, ox, oy, oz) {
  let count = 0
  for (let y = 0; y < clip.sy; y++)
    for (let z = 0; z < clip.sz; z++)
      for (let x = 0; x < clip.sx; x++) {
        const v = clip.data[x + clip.sx * (z + clip.sz * y)]
        const tx = ox + x, ty = oy + y, tz = oz + z
        if (v && inBounds(m.dims, tx, ty, tz)) {
          m.data[vidx(m.dims, tx, ty, tz)] = v
          count++
        }
      }
  return count
}

export function countVoxels(m) {
  let n = 0
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) n++
  return n
}

// 两个版本差异：新增 / 删除 / 材质变更
export function diffModels(a, b) {
  let added = 0, removed = 0, changed = 0
  const n = Math.min(a.data.length, b.data.length)
  for (let i = 0; i < n; i++) {
    const va = a.data[i], vb = b.data[i]
    if (va === vb) continue
    if (!va && vb) added++
    else if (va && !vb) removed++
    else changed++
  }
  return { added, removed, changed, total: added + removed + changed }
}
