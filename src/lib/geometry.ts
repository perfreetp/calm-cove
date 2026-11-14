// ============ 编队几何工具 ============
import type { Formation, SkeletonNode, Vec3 } from '@/types'
import { uid } from '@/db/storage'

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z }
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  }
}

export function nodeByDrone(f: Formation, droneId: string): SkeletonNode | undefined {
  return f.nodes.find((n) => n.droneId === droneId)
}

export function allDroneIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => 'D' + String(i + 1).padStart(3, '0'))
}

/** 重新顺序绑定无人机编号到各节点 */
export function rebindSequential(f: Formation): void {
  f.nodes.forEach((n, i) => {
    n.droneId = 'D' + String(i + 1).padStart(3, '0')
  })
}

export function makeNode(position: Vec3, droneId: string | null = null, anchor = false): SkeletonNode {
  return { id: uid('n'), position, droneId, anchor }
}

/** 最近节点（用于画布点选） */
export function nearestNode(f: Formation, p: Vec3, maxDist = Infinity): SkeletonNode | null {
  let best: SkeletonNode | null = null
  let bestD = maxDist
  for (const n of f.nodes) {
    const d = distance(n.position, p)
    if (d < bestD) {
      bestD = d
      best = n
    }
  }
  return best
}

/** 编队包围盒 */
export function bounds(f: Formation): { min: Vec3; max: Vec3; center: Vec3 } {
  if (!f.nodes.length) {
    return { min: v3(), max: v3(), center: v3() }
  }
  const min = v3(Infinity, Infinity, Infinity)
  const max = v3(-Infinity, -Infinity, -Infinity)
  for (const n of f.nodes) {
    min.x = Math.min(min.x, n.position.x)
    min.y = Math.min(min.y, n.position.y)
    min.z = Math.min(min.z, n.position.z)
    max.x = Math.max(max.x, n.position.x)
    max.y = Math.max(max.y, n.position.y)
    max.z = Math.max(max.z, n.position.z)
  }
  return { min, max, center: lerp3(min, max, 0.5) }
}

/** 编队内最小机间距（安全间距检查用） */
export function minPairDistance(f: Formation): { dist: number; a: string; b: string } | null {
  let best = Infinity
  let pair: [string, string] = ['', '']
  const bound = f.nodes.filter((n) => n.droneId)
  for (let i = 0; i < bound.length; i++) {
    for (let j = i + 1; j < bound.length; j++) {
      const d = distance(bound[i].position, bound[j].position)
      if (d < best) {
        best = d
        pair = [bound[i].droneId!, bound[j].droneId!]
      }
    }
  }
  return best === Infinity ? null : { dist: best, a: pair[0], b: pair[1] }
}

// ---- 预设图形生成（编辑器新增编队用） ----
export function presetGrid(cols: number, rows: number, gap: number, z: number): Vec3[] {
  const pts: Vec3[] = []
  const ox = -((cols - 1) * gap) / 2
  const oy = -((rows - 1) * gap) / 2
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) pts.push(v3(ox + c * gap, oy + r * gap, z))
  return pts
}

export function presetCircle(count: number, radius: number, z: number): Vec3[] {
  const pts: Vec3[] = []
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2
    pts.push(v3(Math.cos(ang) * radius, Math.sin(ang) * radius, z))
  }
  return pts
}

export function presetHeart(count: number, scale: number, z: number): Vec3[] {
  const pts: Vec3[] = []
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const hx = 16 * Math.pow(Math.sin(t), 3)
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    pts.push(v3(hx * scale, hy * scale, z))
  }
  return pts
}

export function presetStar(count: number, outer: number, inner: number, z: number): Vec3[] {
  const pts: Vec3[] = []
  const spikes = 5
  for (let i = 0; i < count; i++) {
    const ring = i % (spikes * 2)
    const r = ring % 2 === 0 ? outer : inner
    const ang = (ring / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    // 同一环位上的多余点分层
    const layer = Math.floor(i / (spikes * 2))
    pts.push(v3(Math.cos(ang) * r, Math.sin(ang) * r, z + layer * 5))
  }
  return pts
}

export function buildFormation(id: string, name: string, points: Vec3[]): Formation {
  return {
    id,
    name,
    nodes: points.map((p, i) => ({
      id: `${id}_n${i}`,
      position: p,
      droneId: 'D' + String(i + 1).padStart(3, '0')
    })),
    edges: []
  }
}
