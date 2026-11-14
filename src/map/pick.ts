import { useStore } from '../store'
import type { Feature, Layers } from '../types'

export const viewport = { w: 1200, h: 800 }

/** Returns LOD bucket: 1 = overview, 2 = medium, 3 = detail */
export function lodFor(k: number): 1 | 2 | 3 {
  if (k < 1.15) return 1
  if (k < 3.6) return 2
  return 3
}

/**
 * Progressive detail is also used to filter features:
 *  LOD 1 — 概览：只画干渠与主要泵站（管网骨架）
 *  LOD 2 — 中景：干渠/支渠全部要素 + 斗渠上的闸门与量水堰
 *  LOD 3 — 详图：全要素，显示闸门编号与量水堰刻度
 */
export function featureVisible(f: Feature, lod: 1 | 2 | 3): boolean {
  if (lod === 1) return f.type === 'pump' && f.level !== 'lateral'
  if (lod === 2) {
    if (f.level === 'trunk' || f.level === 'branch') return true
    return f.type === 'gate' || f.type === 'weir'
  }
  return true
}

export function screenToWorld(cam: { x: number; y: number; k: number }, sx: number, sy: number): [number, number] {
  return [cam.x + (sx - viewport.w / 2) / cam.k, cam.y + (sy - viewport.h / 2) / cam.k]
}

/** click picking: nearest visible symbol within 14 screen px */
export function pickFeature(cam: { x: number; y: number; k: number }, sx: number, sy: number): string | null {
  const s = useStore.getState()
  const [wx, wy] = screenToWorld(cam, sx, sy)
  const lod = lodFor(cam.k)
  let best: { id: string; d: number } | null = null
  for (const f of s.world.features) {
    if (!featureVisible(f, lod)) continue
    if (!s.layers.types[f.type]) continue
    if (!s.layers.levels[f.level]) continue
    const d = Math.hypot((f.x - wx) * cam.k, (f.y - wy) * cam.k)
    if (d < 15 && (!best || d < best.d)) best = { id: f.id, d }
  }
  return best?.id ?? null
}

export interface DrawCtx {
  k: number
  viewR: [number, number, number, number]
  layers: Layers
  selectionId: string | null
  hoverFeatureId: string | null
  compareVersions: [number | null, number | null]
}
