import { rngFor, round } from './rng.js'

/**
 * 线路走向由一组控制点定义，经 Catmull-Rom 加密为可量距的折线。
 * 坐标单位：米，平面坐标 x / z。
 */

export function generateRoutePoints(seed, length = 4600, bends = 6) {
  const rng = rngFor(seed, 'route-controls')
  const pts = [{ x: 0, z: 0 }]
  let x = 0
  let z = 0
  const seg = length / bends
  for (let i = 1; i <= bends; i++) {
    x += round(seg * rng.range(0.82, 1.18), 1)
    z += round(rng.range(-1, 1) * Math.min(220, seg * 0.42), 1)
    pts.push({ x: round(x, 1), z: round(z, 1) })
  }
  // 收线到一条接近正东的末端
  pts[pts.length - 1].z = round(pts[pts.length - 1].z * 0.35, 1)
  return pts
}

export function catmullRom(points, samplesPerSeg = 18) {
  if (points.length < 2) return points.map((p) => ({ ...p }))
  const out = []
  const p = points
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[Math.min(p.length - 1, i + 2)]
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg
      const t2 = t * t
      const t3 = t2 * t
      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
      const z =
        0.5 *
        (2 * p1.z +
          (-p0.z + p2.z) * t +
          (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
          (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      out.push({ x: round(x, 3), z: round(z, 3) })
    }
  }
  out.push({ x: p[p.length - 1].x, z: p[p.length - 1].z })
  return out
}

export function polylineLength(line) {
  let total = 0
  for (let i = 1; i < line.length; i++) {
    total += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)
  }
  return total
}

/** 按里程取点，返回位置与切线角 */
export function pointAtDistance(line, dist) {
  const d = Math.max(0, Math.min(polylineLength(line), dist))
  let acc = 0
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]
    const b = line[i]
    const seg = Math.hypot(b.x - a.x, b.z - a.z)
    if (acc + seg >= d || i === line.length - 1) {
      const t = seg === 0 ? 0 : Math.min(1, (d - acc) / seg)
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        angle: Math.atan2(b.z - a.z, b.x - a.x),
        index: i
      }
    }
    acc += seg
  }
  const last = line[line.length - 1]
  return { x: last.x, z: last.z, angle: 0, index: line.length - 1 }
}

/** 沿法向偏移，offset 为正表示路线左侧 */
export function offsetPoint(pt, offset) {
  const nx = -Math.sin(pt.angle)
  const nz = Math.cos(pt.angle)
  return { x: round(pt.x + nx * offset, 3), z: round(pt.z + nz * offset, 3) }
}

export function routeBounds(line) {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of line) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  return { minX, maxX, minZ, maxZ }
}
