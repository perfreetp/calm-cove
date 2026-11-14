import type { Canal } from '../types'

/** metres of real-world canal represented by one world unit */
export const M_PER_UNIT = 4

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Pt = [number, number]

export function chaikin(pts: Pt[], iterations = 2): Pt[] {
  let cur = pts
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) return cur
    const next: Pt[] = [cur[0]]
    for (let i = 0; i < cur.length - 1; i++) {
      const [x0, y0] = cur[i]
      const [x1, y1] = cur[i + 1]
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25])
      next.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75])
    }
    next.push(cur[cur.length - 1])
    cur = next
  }
  return cur
}

export function polylineLength(pts: Pt[]): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  }
  return total
}

export function pointAtDistance(pts: Pt[], distUnits: number): Pt {
  if (pts.length === 0) return [0, 0]
  if (distUnits <= 0) return pts[0]
  let travelled = 0
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    if (travelled + seg >= distUnits) {
      const t = seg === 0 ? 0 : (distUnits - travelled) / seg
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]
    }
    travelled += seg
  }
  return pts[pts.length - 1]
}

export interface NearestHit {
  x: number
  y: number
  dist: number
  chainage: number
  side: number
}

export function nearestOnPolyline(pts: Pt[], x: number, y: number): NearestHit | null {
  if (pts.length < 2) return null
  let best: NearestHit | null = null
  let travelled = 0
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const segLen = Math.sqrt(len2)
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = ax + dx * t
    const py = ay + dy * t
    const dist = Math.hypot(x - px, y - py)
    if (!best || dist < best.dist) {
      const cross = dx * (y - ay) - dy * (x - ax)
      best = {
        x: px,
        y: py,
        dist,
        chainage: (travelled + segLen * t) * M_PER_UNIT,
        side: cross >= 0 ? 1 : -1,
      }
    }
    travelled += segLen
  }
  return best
}

export function bboxOf(pts: Pt[]): [number, number, number, number] {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

export function pathOf(pts: Pt[]): string {
  if (pts.length === 0) return ''
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 1; i < pts.length; i++) d += `L${pts[i][0].toFixed(1)},${pts[i][1].toFixed(1)}`
  return d
}

/** stake notation, e.g. 12+340 */
export function stake(m: number): string {
  const v = Math.max(0, Math.round(m))
  const km = Math.floor(v / 1000)
  const rest = v % 1000
  return `${km}+${String(rest).padStart(3, '0')}`
}

export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return n.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export function fmtQ(n: number): string {
  return `${fmt(n, 2)} m³/s`
}

export function niceScale(metersPerPixel: number): { px: number; label: string } {
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000]
  const targetPx = 95
  let best = candidates[0]
  for (const c of candidates) {
    if (c / metersPerPixel <= targetPx * 1.6) best = c
    if (c / metersPerPixel >= targetPx) {
      best = c
      break
    }
  }
  return { px: best / metersPerPixel, label: best >= 1000 ? `${best / 1000} km` : `${best} m` }
}

export function segmentPoints(canal: Canal, fromM: number, toM: number): Pt[] {
  const a = Math.max(0, fromM / M_PER_UNIT)
  const b = Math.min(canal.length / M_PER_UNIT, toM / M_PER_UNIT)
  if (b <= a) return []
  const out: Pt[] = [pointAtDistance(canal.pts, a)]
  let travelled = 0
  for (let i = 1; i < canal.pts.length; i++) {
    const [ax, ay] = canal.pts[i - 1]
    const [bx, by] = canal.pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    const next = travelled + seg
    if (next > a && next < b) out.push(canal.pts[i])
    travelled = next
  }
  out.push(pointAtDistance(canal.pts, b))
  return out
}

export function intersects(
  bbox: [number, number, number, number],
  rect: [number, number, number, number],
  pad = 0,
): boolean {
  return !(bbox[2] < rect[0] - pad || bbox[0] > rect[2] + pad || bbox[3] < rect[1] - pad || bbox[1] > rect[3] + pad)
}

export function hash01(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

export function uid(prefix: string, seed = Math.random()): string {
  return `${prefix}-${Math.floor(seed * 1e9).toString(36)}-${Math.floor(performance.now() % 1e6).toString(36)}`
}
