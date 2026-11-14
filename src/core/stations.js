import { rngFor, round, hash32 } from './rng.js'
import { pointAtDistance, offsetPoint, polylineLength } from './route.js'
import { makeStationName, districtName } from './naming.js'
import { resolveBuilding } from './city.js'

export const SPACING_MIN = 300
export const SPACING_MAX = 800

/** 超出 300–800m 区间一律标红 */
export function spacingLevel(m) {
  if (!Number.isFinite(m)) return 'ok'
  if (m > SPACING_MAX || m < SPACING_MIN) return 'bad'
  return 'ok'
}

export function evaluateSpacing(gaps) {
  const bad = gaps.filter((g) => g > SPACING_MAX)
  const under = gaps.filter((g) => g < SPACING_MIN)
  return {
    bad,
    under,
    ok: bad.length === 0 && under.length === 0,
    worst: gaps.length ? Math.max(...gaps) : 0
  }
}

/** 生成候选站序：站距始终落在 300–800m 区间，偏好高体量街区，带若干换乘节点 */
export function proposeStops({ district, seed, lineId, count = 14, spacing }) {
  const { line, demand, demandBins, total } = district
  const rng = rngFor(seed, `stops:${lineId}:${spacing}:${count}`)
  const stops = []

  const anchorFirst = rng.range(80, 160)
  const anchorLast = total - rng.range(80, 160)
  const span = anchorLast - anchorFirst
  const lo = SPACING_MIN + 15
  const hi = SPACING_MAX - 15

  // 站数必须与线路长度相容：至少能容纳 lo，至多能填满 hi
  let N = Math.max(4, Math.min(20, count))
  const maxStops = Math.max(2, Math.floor(span / lo) + 1)
  const minStops = Math.max(2, Math.ceil(span / hi) + 1)
  N = Math.max(Math.min(N, maxStops), Math.min(20, minStops))
  const segs = N - 1

  // 每段先给下限，再把剩余长度按随机权重“配水”到上限以内——总长严格等于 span
  const slack = span - segs * lo
  const cap = hi - lo
  const weights = Array.from({ length: segs }, () => 0.35 + rng.next())
  const gaps = new Array(segs).fill(0)
  const capped = new Array(segs).fill(false)
  let remaining = slack
  let guard = 0
  while (remaining > 1e-6 && guard++ < 60) {
    const act = weights.map((_, i) => i).filter((i) => !capped[i])
    if (!act.length) break
    const wSum = act.reduce((a, i) => a + weights[i], 0)
    let anyCapped = false
    for (const i of act) {
      const share = (remaining * weights[i]) / wSum
      const need = cap - gaps[i]
      if (share >= need - 1e-9) {
        gaps[i] = cap
        remaining -= need
        capped[i] = true
        anyCapped = true
      }
    }
    if (!anyCapped) {
      for (const i of act) gaps[i] += (remaining * weights[i]) / wSum
      remaining = 0
    }
  }

  const used = new Set()
  const positions = [anchorFirst]
  for (let i = 1; i < segs; i++) positions.push(round(positions[i - 1] + lo + gaps[i - 1], 1))
  positions.push(round(anchorLast, 1))

  // 客流寻优：只做“相邻两段互相让位”的平移，总和与上下限都不受影响
  for (let i = 1; i < N - 1; i++) {
    const left = positions[i] - positions[i - 1]
    const right = positions[i + 1] - positions[i]
    const maxShift = Math.min(left - lo, right - lo, hi - left, hi - right, 24)
    if (maxShift <= 0.5) continue
    const bin = Math.min(demandBins - 1, Math.floor(positions[i] / 50))
    const localDemand = (demand[bin] || 0) + (demand[bin - 1] || 0) * 0.6 + (demand[bin + 1] || 0) * 0.6
    const dir = localDemand > 0 ? (i % 2 === 0 ? 1 : -1) : 0
    if (!dir) continue
    const shift = round(dir * maxShift * (0.35 + rng.next() * 0.65), 1)
    positions[i] = round(positions[i] + shift, 1)
  }

  stops.push(makeStop(0, positions[0], 0))
  for (let i = 1; i < N - 1; i++) stops.push(makeStop(i, positions[i], i))
  stops.push(makeStop(N - 1, positions[N - 1], N - 1))

  const radii = [1.0, 0.85, 0.7, 0.55]
  const transferRng = rngFor(seed, `transfer:${lineId}`)
  const transferIdx = new Set(
    Array.from({ length: Math.min(4, N - 2) }, (_, i) => 1 + Math.round((i * (N - 2)) / 4))
  )
  stops.forEach((s, i) => {
    const p = pointAtDistance(line, s.dist)
    const r = radii[Math.min(3, s.bandIndex)] * (0.82 + 0.3 * s.demandScore)
    const stops_d = []
    for (let L = 1; L <= 2; L++) {
      const lateral = 22 + L * 12 + r * 5
      for (const side of [1, -1]) {
        stops_d.push({ ...offsetPoint(p, side * lateral), lateral: side * lateral, side })
      }
    }
    s.candidates = stops_d
    s.transfer = transferIdx.has(i) || i % 5 === 0
    s.transferCode = s.transfer
      ? `${['环', '城', '快', '支'][transferRng.int(0, 3)]}${transferRng.int(1, 9)}路`
      : ''
  })

  return stops

  function makeStop(i, dist, bandIndex) {
    const name = makeStationName(seed, i, used)
    used.add(name)
    const bin = Math.min(demandBins - 1, Math.max(0, Math.floor(dist / 50)))
    const demandScore = Math.min(1, (demand[bin] || 0) / 260)
    const pt = pointAtDistance(line, dist)
    return {
      id: `${lineId}-S${String(i + 1).padStart(2, '0')}`,
      order: i + 1,
      name,
      dist: round(dist, 1),
      district: districtName(pt.x, pt.z),
      bandIndex,
      demandScore: round(demandScore, 3),
      transfer: false,
      transferCode: '',
      candidates: [],
      chosen: 0
    }
  }
}

/** 前后站距 */
export function stationGaps(stops) {
  const gaps = []
  for (let i = 1; i < stops.length; i++) gaps.push(round(stops[i].dist - stops[i - 1].dist, 1))
  return gaps
}

export function spacingStatus(stops) {
  const gaps = stationGaps(stops)
  const rank = { ok: 0, warn: 1, bad: 2 }
  const rows = stops.map((s, i) => {
    const related = []
    if (i > 0) related.push(gaps[i - 1])
    if (i < gaps.length) related.push(gaps[i])
    const level = related
      .map(spacingLevel)
      .reduce((a, b) => (rank[b] > rank[a] ? b : a), 'ok')
    return {
      ...s,
      prevGap: i === 0 ? null : gaps[i - 1],
      nextGap: i === stops.length - 1 ? null : gaps[i],
      level
    }
  })
  return { gaps: gaps.map((m) => ({ m, level: spacingLevel(m) })), rows, eval: evaluateSpacing(gaps) }
}

/**
 * 根据候选站与街区体量，挑选站台落位（避让建筑包络），
 * 并在两侧街墙上给出可视化的“站台占位”。
 */
export function placementBoxes(stops, district) {
  return stops.map((s, i) => {
    const cand = s.candidates[s.chosen] || s.candidates[0]
    const pt = pointAtDistance(district.line, s.dist)
    const footprint = { w: 5.6, d: 2.2 }
    return {
      stationId: s.id,
      order: s.order,
      name: s.name,
      x: cand.x,
      z: cand.z,
      side: cand.side,
      lateral: cand.lateral,
      angle: -pt.angle,
      length: footprint.w,
      depth: footprint.d,
      platform: i === 0 || i === stops.length - 1 ? '首末站' : s.transfer ? '换乘站' : '中途站'
    }
  })
}

/** 冲突检测：站台占位与建筑包络重叠时给出提示 */
export function conflictsWithBuildings(stops, district) {
  const out = []
  const boxes = placementBoxes(stops, district)
  for (const box of boxes) {
    for (const b of district.buildings) {
      const st = resolveBuilding(b)
      const reach = Math.max(st.width, st.depth) / 2 + 4
      if (Math.hypot(b.position.x - box.x, b.position.z - box.z) < reach) {
        out.push({ stationId: box.stationId, buildingId: b.id })
      }
    }
  }
  return out
}
