import type { FeatureType } from '../types'
import { TYPE_COLOR } from '../types'

export interface Prim {
  d: string
  fill: string
  stroke: string
  sw: number
  dashed?: boolean
  opacity?: number
}

/**
 * Plan-view survey symbols. `u` is the half-size in world units so that
 * on screen the glyph keeps a constant pixel size (u = px / k).
 */
export function symbolPrims(type: FeatureType, u: number): Prim[] {
  const c = TYPE_COLOR[type]
  const lw = Math.max(u * 0.22, 0.08)
  switch (type) {
    case 'gate':
      return [
        {
          d: `M${-u},${-u * 0.78} H${u} V${u * 0.78} H${-u} Z`,
          fill: '#fdf8ee',
          stroke: c,
          sw: lw,
        },
        {
          d: `M${-u},${-u * 0.78} L${u},${u * 0.78} M${u},${-u * 0.78} L${-u},${u * 0.78}`,
          fill: 'none',
          stroke: c,
          sw: lw,
        },
      ]
    case 'weir':
      return [
        {
          d: `M${-u},${-u * 0.6} L${-u * 0.5},${u * 0.38} L0,${-u * 0.6} L${u * 0.5},${u * 0.38} L${u},${-u * 0.6}`,
          fill: 'none',
          stroke: c,
          sw: lw * 1.15,
        },
        {
          d: `M${-u},${u * 0.62} H${u}`,
          fill: 'none',
          stroke: c,
          sw: lw * 0.9,
          opacity: 0.85,
        },
      ]
    case 'pump':
      return [
        {
          d: `M${u},0 A${u},${u} 0 1 1 ${-u},0 A${u},${u} 0 1 1 ${u},0 Z`,
          fill: c,
          stroke: '#fdf8ee',
          sw: lw * 0.7,
        },
        {
          d: `M${-u * 0.42},${u * 0.05} L0,${-u * 0.45} L${u * 0.42},${u * 0.05} Z`,
          fill: '#fdf8ee',
          stroke: 'none',
          sw: 0,
        },
      ]
    case 'drop':
      return [
        {
          d: `M${-u},${-u * 0.55} H${-u * 0.2} V${u * 0.1} H${u * 0.45} V${u * 0.62} H${-u} Z`,
          fill: c,
          stroke: '#fdf8ee',
          sw: lw * 0.7,
        },
      ]
    case 'culvert':
      return [
        {
          d: `M${-u},${-u * 0.42} H${u} V${u * 0.42} H${-u} Z`,
          fill: '#fdf8ee',
          stroke: c,
          sw: lw,
        },
        {
          d: `M${-u * 0.62},${-u * 0.42} V${u * 0.42} M${u * 0.62},${-u * 0.42} V${u * 0.42}`,
          fill: 'none',
          stroke: c,
          sw: lw * 0.8,
        },
      ]
  }
}

/** legend symbol in absolute px (used by HTML legend, exported SVG uses paths) */
export function symbolForType(type: FeatureType, px: number): Prim[] {
  return symbolPrims(type, px / 2)
}

/** little water-level ruler drawn beside a weir at close zoom */
export function weirRuler(u: number, reading: number): { ticks: string; labels: string[] } {
  const ticks: string[] = []
  const labels: string[] = []
  for (let i = 0; i <= 6; i++) {
    const y = -u * 1.15 + (i * u * 2.3) / 6
    const major = i === 0 || i === 3 || i === 6
    ticks.push(`M${u * 1.2},${y} H${u * (major ? 1.95 : 1.6)}`)
    if (major) labels.push(`${(reading * (i / 6)).toFixed(2)}`)
  }
  return { ticks: ticks.join(' '), labels }
}
