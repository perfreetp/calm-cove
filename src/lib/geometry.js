// 等轴测投影 + 面可见性 + 合并减面
import { VOXEL_TYPES, layerOf } from './constants.js'

// 体素边长(屏幕像素)与层高
export const TILE = 34
export const H = 26

// 网格坐标 → 等轴测屏幕坐标(格子中心点的地面投影)
export function iso(x, y, z = 0) {
  return {
    x: (x - y) * TILE / 2,
    y: (x + y) * TILE / 4 - z * H
  }
}

// 单个体素三个可见面的多边形点串(顶面、左面、右面)
export function voxelFaces(x, y, z) {
  const p = iso(x, y, z)
  const t = TILE / 2, q = TILE / 4, h = H
  const top = [
    [p.x, p.y - h], [p.x + t, p.y + q - h],
    [p.x, p.y + t / 2 - h], [p.x - t, p.y + q - h]
  ]
  const left = [
    [p.x - t, p.y + q - h], [p.x, p.y + t / 2 - h],
    [p.x, p.y + t / 2], [p.x - t, p.y + q]
  ]
  const right = [
    [p.x + t, p.y + q - h], [p.x, p.y + t / 2 - h],
    [p.x, p.y + t / 2], [p.x + t, p.y + q]
  ]
  return { top, left, right }
}

export function pts(poly) {
  return poly.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')
}

// 颜色明暗
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  r = Math.max(0, Math.min(255, Math.round(r * f)))
  g = Math.max(0, Math.min(255, Math.round(g * f)))
  b = Math.max(0, Math.min(255, Math.round(b * f)))
  return `rgb(${r},${g},${b})`
}

const key = (x, y, z) => `${x},${y},${z}`

// 渲染排序:画家算法,后→前、下→上
export function painterSort(voxels) {
  return [...voxels].sort((a, b) =>
    (a.x + a.y) - (b.x + b.y) || a.z - b.z || a.x - b.x)
}

// 面剔除:被同类型邻居占据的面不绘制
export function visibleFaces(voxels) {
  const occ = new Map()
  voxels.forEach(v => occ.set(key(v.x, v.y, v.z), v))
  const out = []
  for (const v of voxels) {
    const f = voxelFaces(v.x, v.y, v.z)
    const faces = []
    // 顶面:上方同格有体素则遮挡
    if (!occ.has(key(v.x, v.y, v.z + 1))) faces.push({ kind: 'top', poly: f.top })
    // 左面(朝 -x):x-1 邻居遮挡
    if (!occ.has(key(v.x - 1, v.y, v.z))) faces.push({ kind: 'left', poly: f.left })
    // 右面(朝 +y):y+1 邻居遮挡
    if (!occ.has(key(v.x, v.y + 1, v.z))) faces.push({ kind: 'right', poly: f.right })
    out.push({ voxel: v, faces })
  }
  return out
}

/**
 * 合并相邻同材质体素并减面
 * 1) 按 type 分组,在每个 (y,z) 行内把 x 连续的体素合并为长条(合并体素)
 * 2) 统计减面:原始外露面数 vs 合并后外露面数
 * 返回 { groups, beforeFaces, afterFaces, reduction }
 */
export function mergeVoxels(voxels) {
  const before = visibleFaces(voxels).reduce((n, r) => n + r.faces.length, 0)
  const byType = new Map()
  voxels.forEach(v => {
    if (!byType.has(v.type)) byType.set(v.type, [])
    byType.get(v.type).push(v)
  })
  const groups = []
  for (const [type, list] of byType) {
    const rows = new Map()
    list.forEach(v => {
      const rk = `${v.y},${v.z}`
      if (!rows.has(rk)) rows.set(rk, [])
      rows.get(rk).push(v)
    })
    for (const [, cells] of rows) {
      cells.sort((a, b) => a.x - b.x)
      let run = [cells[0]]
      for (let i = 1; i < cells.length; i++) {
        if (cells[i].x === run[run.length - 1].x + 1) run.push(cells[i])
        else { groups.push(makeGroup(type, run)); run = [cells[i]] }
      }
      groups.push(makeGroup(type, run))
    }
  }
  // 合并后的外露面:每个合并条 = 1 顶 + 1 左 + 1 右 + 两端面(简化按 4 面估),
  // 再扣除被其他体素遮挡的面
  const occ = new Set(voxels.map(v => key(v.x, v.y, v.z)))
  let after = 0
  for (const g of groups) {
    const xs = g.voxels.map(v => v.x)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const { y, z } = g.voxels[0]
    if (!occ.has(key(g.voxels[0].x, y, z + 1))) after++ // 顶
    if (!occ.has(key(minX - 1, y, z))) after++ // 左端面
    if (!occ.has(key(maxX, y + 1, z))) after++ // 右端面
    // 长条侧面沿 x 方向逐格检查外侧遮挡
    for (const vx of g.voxels) {
      if (!occ.has(key(vx.x, vx.y - 1, vx.z))) after++
      if (!occ.has(key(vx.x + 1, vx.y, vx.z))) after++
    }
  }
  return {
    groups,
    beforeFaces: before,
    afterFaces: after,
    reduction: before ? Math.round((1 - after / before) * 100) : 0
  }
}

function makeGroup(type, voxels) {
  return {
    type,
    material: VOXEL_TYPES[type].material,
    color: VOXEL_TYPES[type].color,
    layer: layerOf(type),
    voxels,
    count: voxels.length
  }
}

// 屏幕点 → 网格地面坐标(用于点击落位)
export function screenToGrid(sx, sy) {
  // iso: sx=(x-y)t/2 ; sy=(x+y)t/4 (z=0)
  const a = sx / (TILE / 2)
  const b = sy / (TILE / 4)
  const x = (a + b) / 2
  const y = (b - a) / 2
  return { x: Math.round(x), y: Math.round(y) }
}
