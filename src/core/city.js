import { rngFor, round } from './rng.js'
import { catmullRom, pointAtDistance, offsetPoint, polylineLength } from './route.js'

export const FACADE_STYLES = [
  { key: 'glass', label: '玻璃幕墙', swatch: '#7ea8bd', min: 9 },
  { key: 'office', label: '石材办公', swatch: '#a9a89f', min: 6 },
  { key: 'brick', label: '红砖住宅', swatch: '#b1846a', min: 2 },
  { key: 'concrete', label: '混凝土板楼', swatch: '#9a9a93', min: 3 },
  { key: 'commercial', label: '商业街铺', swatch: '#c4a068', min: 2 },
  { key: 'industrial', label: '厂房仓配', swatch: '#8b938f', min: 1 }
]

export const FACADE_BY_KEY = Object.fromEntries(FACADE_STYLES.map((s) => [s.key, s]))

export const TINTS = [
  '#c9c2b4', '#b7bcc0', '#c9b0a1', '#a9b7b3', '#d3c9b8',
  '#9fa9b6', '#bba9a9', '#b8bda6', '#cbb8a0', '#a7b1a5'
]

export const BUILDING_OVERRIDE_KEYS = [
  'floors', 'width', 'depth', 'styleKey', 'tint', 'roofType', 'note'
]

/** 单栋建筑的“原生”参数：只取决于 seed + id + nonce，互不影响 */
export function makeBuildingBase(seed, id, band, nonce = 0) {
  const rng = rngFor(seed, `b:${id}:${nonce}`)
  let floors
  if (band === 0) {
    floors = rng.int(2, 7)
    if (rng.chance(0.12)) floors = rng.int(8, 12)
  } else {
    floors = rng.int(4, 20)
    if (rng.chance(0.16)) floors = rng.int(21, 32)
    if (rng.chance(0.05)) floors = rng.int(33, 41)
  }
  let styleKey
  if (floors <= 2 && rng.chance(0.55)) styleKey = 'commercial'
  else if (band === 1 && floors >= 16) styleKey = 'glass'
  else if (floors >= 9) styleKey = rng.chance(0.6) ? 'office' : 'glass'
  else if (floors >= 5) styleKey = rng.pick(['office', 'concrete', 'brick'])
  else styleKey = rng.pick(['brick', 'concrete', 'commercial', 'industrial'])
  const roofType = floors >= 12 ? 'flat' : rng.pick(['flat', 'flat', 'setback', 'gable'])
  return {
    floors,
    width: rng.int(10, band === 0 ? 26 : 34),
    depth: rng.int(9, band === 0 ? 20 : 26),
    styleKey,
    tint: rng.int(0, TINTS.length - 1),
    roofType,
    bay: rng.int(2, 3),
    setback: band === 1 ? rng.int(0, 6) : 0
  }
}

export function resolveBuilding(b) {
  const s = { ...b.base, ...b.overrides }
  s.floors = Math.max(1, Math.min(60, Math.round(s.floors)))
  s.width = Math.max(6, Math.min(48, Math.round(s.width)))
  s.depth = Math.max(6, Math.min(38, Math.round(s.depth)))
  if (!FACADE_BY_KEY[s.styleKey]) s.styleKey = 'concrete'
  if (!TINTS[s.tint]) s.tint = 0
  s.height = round(s.floors * 3.4 + (s.roofType === 'gable' ? 2.4 : 0.6), 2)
  return s
}

export function buildingFingerprint(b) {
  const s = resolveBuilding(b)
  return [b.id, s.floors, s.width, s.depth, s.styleKey, s.tint, b.position.x, b.position.z, b.rotationY]
    .join('-')
}

/**
 * 生成沿线的两侧街区。布局与单栋参数使用彼此独立的随机流，
 * 因此单栋重生成不会改变其位置，也不会影响其他建筑。
 */
export function buildDistrict({ seed, lineId, controls, density = 1, catmullSamples = 18 }) {
  const line = catmullRom(controls, catmullSamples)
  const total = polylineLength(line)
  const layout = rngFor(seed, `layout:${density}`)
  const buildings = []
  const clusters = []

  for (const side of [1, -1]) {
    for (let band = 0; band < 2; band++) {
      let d = band === 0 ? layout.range(24, 46) : layout.range(60, 90)
      let idx = 0
      while (d < total - 26) {
        const id = `${lineId}-B${side > 0 ? 'L' : 'R'}${band}${String(idx).padStart(3, '0')}`
        const base = makeBuildingBase(seed, id, band, 0)
        const width = base.width
        const gap = band === 0 ? layout.range(5, 12) : layout.range(10, 24)
        if (band === 1 && !layout.chance(0.82)) {
          d += layout.range(18, 30)
          idx++
          continue
        }
        const pt = pointAtDistance(line, d)
        const lateral =
          (band === 0 ? layout.range(28, 54) : layout.range(64, 112)) +
          base.depth / 2 +
          base.setback
        const pos = offsetPoint(pt, side * lateral)
        const rotJitter = layout.range(-0.05, 0.05)
        buildings.push({
          id,
          lineId,
          side, band,
          distance: round(d, 2),
          position: { x: pos.x, z: pos.z },
          rotationY: round(-pt.angle + rotJitter, 4),
          base,
          overrides: {},
          nonce: 0,
          history: []
        })
        clusters.push({ x: pos.x, z: pos.z, d, floors: base.floors })
        d += width / 2 + gap + layout.range(0, 6)
        idx++
      }
    }
  }

  const demandBins = Math.ceil(total / 50)
  const demand = new Array(demandBins).fill(0)
  for (const c of clusters) {
    const bin = Math.min(demandBins - 1, Math.floor(c.d / 50))
    demand[bin] += c.floors
  }

  const stats = districtStats(buildings, total)
  return {
    seed,
    lineId,
    density,
    generatedAt: null, // 不写入时间，保证数据指纹只由种子与参数决定
    line,
    total,
    demand,
    demandBins,
    buildings,
    stats
  }
}

export function districtStats(buildings, total) {
  const styles = {}
  let floors = 0
  let tallest = 0
  let footprint = 0
  for (const b of buildings) {
    const s = resolveBuilding(b)
    floors += s.floors
    tallest = Math.max(tallest, s.height)
    footprint += s.width * s.depth
    styles[s.styleKey] = (styles[s.styleKey] || 0) + 1
  }
  return {
    count: buildings.length,
    floors,
    tallest: round(tallest, 1),
    footprint: Math.round(footprint),
    plotRatio: round(footprint / Math.max(1, total * 130), 2),
    styles
  }
}

export function districtFingerprint(district) {
  const parts = district.buildings.map((b) => {
    const s = resolveBuilding(b)
    return [b.id, s.floors, s.width, s.depth, s.styleKey, s.tint, b.position.x, b.position.z, b.rotationY].join(':')
  })
  let h = 2166136261 >>> 0
  const txt = parts.join('|')
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

/** 单栋重生成：换一个 nonce 得到新原型，但保留手工改造与位置 */
export function rerollBuilding(building, seed) {
  const nonce = (building.nonce || 0) + 1
  const base = makeBuildingBase(seed, building.id, building.band, nonce)
  return {
    ...building,
    nonce,
    base,
    overrides: { ...building.overrides },
    history: [
      ...(building.history || []).slice(-8),
      { nonce, at: null, keptOverrides: Object.keys(building.overrides || {}) }
    ]
  }
}

export function setOverride(building, key, value) {
  if (!BUILDING_OVERRIDE_KEYS.includes(key)) throw new Error(`不允许的字段 ${key}`)
  const next = { ...building, overrides: { ...building.overrides } }
  const baseVal = building.base[key]
  if (value === null || value === undefined || value === baseVal) delete next.overrides[key]
  else next.overrides[key] = value
  return next
}

export function regenerateAll({ seed, lineId, controls, density }) {
  return buildDistrict({ seed, lineId, controls, density })
}
