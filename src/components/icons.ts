import type { FeatureType } from '../types'
import { symbolForType } from '../map/symbols'

export function symSvgFor(type: FeatureType): string {
  return `<svg width="18" height="18" viewBox="-9 -9 18 18">${symbolForType(type, 15)
    .map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(0.9, p.sw)}" />`)
    .join('')}</svg>`
}
