import type { Canal, CanalLevel, Layers } from '../types'
import { LEVEL_COLOR } from '../types'
import { intersects } from '../lib/geo'
import { lodFor } from './pick'

export function canalWidth(level: CanalLevel, k: number): number {
  // widths in screen px at each LOD, converted to world units by /k
  const base = level === 'trunk' ? 3.1 : level === 'branch' ? 2.2 : 1.5
  const lod = lodFor(k)
  const factor = lod === 1 ? 1.15 : lod === 2 ? 1 : 0.85
  return (base * factor) / k
}

export interface CanalGeom {
  id: string
  d: string
  level: CanalLevel
  status: Canal['status']
  bbox: [number, number, number, number]
  code: string
  name: string
  startChainage: number
  endChainage: number
  designFlow: number
  builtYear: number
  len: number
  selected: boolean
  hovered: boolean
  ptCount: number
}

export function collectCanals(
  canals: Canal[],
  viewR: [number, number, number, number],
  layers: Layers,
  lod: 1 | 2 | 3,
  selectedCanalId: string | null,
  hoverCanalId: string | null,
  pad: number,
): CanalGeom[] {
  const out: CanalGeom[] = []
  for (const c of canals) {
    if (!layers.levels[c.level]) continue
    if (lod === 1 && c.level === 'lateral') continue
    if (!intersects(c.bbox, viewR, pad)) continue
    out.push({
      id: c.id,
      d: c.d,
      level: c.level,
      status: c.status,
      bbox: c.bbox,
      code: c.code,
      name: c.name,
      startChainage: c.startChainage,
      endChainage: c.endChainage,
      designFlow: c.designFlow,
      builtYear: c.builtYear,
      len: c.length,
      selected: c.id === selectedCanalId,
      hovered: c.id === hoverCanalId,
      ptCount: c.pts.length,
    })
  }
  return out
}

export function canalStroke(level: CanalLevel): string {
  return LEVEL_COLOR[level]
}

/** Chainage ticks along a canal. Returns array of {x,y,angle,label}. */
export function chainageTicks(
  pts: [number, number][],
  start: number,
  end: number,
  k: number,
): { x: number; y: number; angle: number; label: string }[] {
  if (k < 2.2) return []
  const interval = k > 6 ? 100 : 250
  const ticks: { x: number; y: number; angle: number; label: string }[] = []
  // walk the polyline in world units
  const metresPerUnit = 4
  let travelled = 0
  let nextTick = Math.ceil(start / interval) * interval
  if (nextTick <= start) nextTick += interval
  for (let i = 1; i < pts.length && nextTick < end; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const segLenUnits = Math.hypot(bx - ax, by - ay)
    const segStartM = travelled * metresPerUnit
    const segEndM = (travelled + segLenUnits) * metresPerUnit
    while (nextTick <= segEndM && nextTick < end) {
      const t = (nextTick - segStartM) / Math.max(1e-6, segEndM - segStartM)
      const x = ax + (bx - ax) * t
      const y = ay + (by - ay) * t
      const angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
      ticks.push({ x, y, angle, label: `${Math.floor(nextTick / 1000)}+${String(nextTick % 1000).padStart(3, '0')}` })
      nextTick += interval
    }
    travelled += segLenUnits
  }
  return ticks
}
