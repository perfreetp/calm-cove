// 地形、禁放区、布点校验、统计与版本对比的纯计算模块
import { GATE_WIDTH, SPACING_TOLERANCE } from '../constants'

// ---------- 地形 ----------
// 缓坡丘陵地形,振幅约 ±1.2m
export function groundHeight(x, z) {
  return (
    0.6 * Math.sin(x / 18) +
    0.4 * Math.cos(z / 15) +
    0.25 * Math.sin((x + z) / 12)
  )
}

// ---------- 基础几何 ----------
export function dist2D(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz)
}

export function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  if (len2 === 0) return dist2D(px, pz, ax, az)
  let t = ((px - ax) * dx + (pz - az) * dz) / len2
  t = Math.max(0, Math.min(1, t))
  return dist2D(px, pz, ax + t * dx, az + t * dz)
}

function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.z - p3.z) - (p2.z - p1.z) * (p4.x - p3.x)
  if (Math.abs(d) < 1e-9) return false
  const t = ((p3.x - p1.x) * (p4.z - p3.z) - (p3.z - p1.z) * (p4.x - p3.x)) / d
  const u = ((p3.x - p1.x) * (p2.z - p1.z) - (p3.z - p1.z) * (p2.x - p1.x)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// ---------- 禁放区 ----------
// zones: [{id, kind, name, width, path:[[x,z]...]}]
// existingFences: [{id, path:[[x,z]...]}]  邻接地块已有围栏
export function pointZoneConflict(x, z, zones, radius = 0) {
  for (const zone of zones) {
    const half = zone.width / 2 + radius
    for (let i = 0; i < zone.path.length - 1; i++) {
      const [ax, az] = zone.path[i]
      const [bx, bz] = zone.path[i + 1]
      if (distToSegment(x, z, ax, az, bx, bz) < half) {
        return { type: zone.kind, name: zone.name, zoneId: zone.id }
      }
    }
  }
  return null
}

export function pointFenceConflict(x, z, existingFences, radius = 0.2) {
  for (const f of existingFences) {
    for (let i = 0; i < f.path.length - 1; i++) {
      const [ax, az] = f.path[i]
      const [bx, bz] = f.path[i + 1]
      if (distToSegment(x, z, ax, az, bx, bz) < 0.5 + radius) {
        return { type: 'fence', name: f.name || '已有围栏', fenceId: f.id }
      }
    }
  }
  return null
}

// 线段是否穿越禁放区(用于网片/围栏线形)
export function segmentZoneConflict(ax, az, bx, bz, zones) {
  const s1 = { x: ax, z: az }
  const s2 = { x: bx, z: bz }
  for (const zone of zones) {
    const half = zone.width / 2
    for (let i = 0; i < zone.path.length - 1; i++) {
      const [cx, cz] = zone.path[i]
      const [dx, dz] = zone.path[i + 1]
      // 端点贴近
      if (
        distToSegment(ax, az, cx, cz, dx, dz) < half ||
        distToSegment(bx, bz, cx, cz, dx, dz) < half
      ) {
        return { type: zone.kind, name: zone.name, zoneId: zone.id }
      }
      // 中线相交(粗略:将禁放线按宽度外扩判断)
      const nx = -(dz - cz)
      const nz = dx - cx
      const nl = Math.hypot(nx, nz) || 1
      const ox = (nx / nl) * half
      const oz = (nz / nl) * half
      const corners = [
        { x: cx + ox, z: cz + oz },
        { x: dx + ox, z: dz + oz },
        { x: dx - ox, z: dz - oz },
        { x: cx - ox, z: cz - oz }
      ]
      for (let k = 0; k < 4; k++) {
        const c1 = corners[k]
        const c2 = corners[(k + 1) % 4]
        if (segIntersect(s1, s2, c1, c2)) {
          return { type: zone.kind, name: zone.name, zoneId: zone.id }
        }
      }
    }
  }
  return null
}

// 综合点位校验:返回 { ok, conflicts:[{type,name}], nearest:{x,z,distance}|null }
export function validatePoint(x, z, zones, existingFences, bounds, radius = 0.2) {
  const conflicts = []
  const zc = pointZoneConflict(x, z, zones, radius)
  if (zc) conflicts.push(zc)
  const fc = pointFenceConflict(x, z, existingFences, radius)
  if (fc) conflicts.push(fc)
  if (bounds) {
    const [w, d] = bounds
    if (Math.abs(x) > w / 2 || Math.abs(z) > d / 2) {
      conflicts.push({ type: 'boundary', name: '地块边界' })
    }
  }
  const nearest = conflicts.length ? findNearestValid(x, z, zones, existingFences, bounds) : null
  return { ok: conflicts.length === 0, conflicts, nearest }
}

// 螺旋网格搜索最近可放位置(0.5m 步长,最远 16m)
export function findNearestValid(x, z, zones, existingFences, bounds) {
  const step = 0.5
  for (let ring = 1; ring <= 32; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (let j = -ring; j <= ring; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue
        const cx = x + i * step
        const cz = z + j * step
        if (bounds) {
          const [w, d] = bounds
          if (Math.abs(cx) > w / 2 || Math.abs(cz) > d / 2) continue
        }
        if (!pointZoneConflict(cx, cz, zones) && !pointFenceConflict(cx, cz, existingFences)) {
          return { x: round1(cx), z: round1(cz), distance: round1(dist2D(x, z, cx, cz)) }
        }
      }
    }
  }
  return null
}

const round1 = (n) => Math.round(n * 10) / 10

// ---------- 桩距校验 ----------
// 返回不合格桩对 [{aId,bId,distance,mode}]
export function validateSpacing(objects, mode) {
  const posts = objects.filter((o) => o.type === 'post')
  const bad = []
  const seen = new Set()
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const d = dist2D(posts[i].x, posts[i].z, posts[j].x, posts[j].z)
      if (d > mode + SPACING_TOLERANCE) continue
      const key = posts[i].id + '|' + posts[j].id
      if (seen.has(key)) continue
      seen.add(key)
      if (Math.abs(d - mode) > SPACING_TOLERANCE) {
        bad.push({ aId: posts[i].id, bId: posts[j].id, distance: round2(d), mode })
      }
    }
  }
  return bad
}

const round2 = (n) => Math.round(n * 100) / 100

// ---------- 线形与统计 ----------
// 用桩间近邻边构造围栏线,贪心走查得到有序桩链
export function buildFenceChain(objects, mode) {
  const posts = objects.filter((o) => o.type === 'post')
  if (posts.length === 0) return { chain: [], edges: [] }
  const limit = mode + SPACING_TOLERANCE
  const adj = new Map(posts.map((p) => [p.id, []]))
  const edges = []
  for (let i = 0; i < posts.length; i++) {
    for (let j = i + 1; j < posts.length; j++) {
      const d = dist2D(posts[i].x, posts[i].z, posts[j].x, posts[j].z)
      if (d <= limit) {
        adj.get(posts[i].id).push({ id: posts[j].id, d })
        adj.get(posts[j].id).push({ id: posts[i].id, d })
        edges.push([posts[i].id, posts[j].id, d])
      }
    }
  }
  const byId = new Map(posts.map((p) => [p.id, p]))
  // 端点(度数最小且为1),没有则任取
  let start = posts[0]
  const endpoints = posts.filter((p) => adj.get(p.id).length === 1)
  if (endpoints.length) start = endpoints[0]
  const chain = [start]
  const visited = new Set([start.id])
  let cur = start
  while (true) {
    const nexts = adj.get(cur.id).filter((n) => !visited.has(n.id)).sort((a, b) => a.d - b.d)
    if (!nexts.length) break
    const next = byId.get(nexts[0].id)
    chain.push(next)
    visited.add(next.id)
    cur = next
  }
  return { chain, edges }
}

// 拐点:链上方向变化 > 30° 的桩
export function findTurningPoints(chain) {
  const turns = []
  for (let i = 1; i < chain.length - 1; i++) {
    const a = chain[i - 1]
    const b = chain[i]
    const c = chain[i + 1]
    const v1x = b.x - a.x
    const v1z = b.z - a.z
    const v2x = c.x - b.x
    const v2z = c.z - b.z
    const cross = v1x * v2z - v1z * v2x
    const dot = v1x * v2x + v1z * v2z
    const ang = Math.abs(Math.atan2(cross, dot))
    if (ang > Math.PI / 6) {
      turns.push({ id: b.id, x: round1(b.x), z: round1(b.z), angle: round2((ang * 180) / Math.PI) })
    }
  }
  return turns
}

export function computeStats(objects, mode) {
  const posts = objects.filter((o) => o.type === 'post')
  const gates = objects.filter((o) => o.type === 'gate')
  const waters = objects.filter((o) => o.type === 'water')
  const { chain, edges } = buildFenceChain(objects, mode)
  const rawLength = edges.reduce((s, e) => s + e[2], 0)
  const gateLength = gates.length * GATE_WIDTH
  const meshLength = Math.max(0, round2(rawLength - gateLength))

  let panels3 = 0
  let panels5 = 0
  for (const e of edges) {
    if (e[2] <= 3 + SPACING_TOLERANCE) panels3 += 1
    else panels5 += 1
  }
  const turns = findTurningPoints(chain)
  const spacingBad = validateSpacing(objects, mode)

  return {
    postCount: posts.length,
    gateCount: gates.length,
    waterCount: waters.length,
    meshLength,
    panels3,
    panels5,
    edgeCount: edges.length,
    turningPoints: turns,
    spacingBad,
    gatePositions: gates.map((g) => ({ id: g.id, x: round1(g.x), z: round1(g.z) }))
  }
}

// ---------- 版本对比 ----------
export function diffVersions(statsA, objectsA, statsB, objectsB) {
  const postsA = objectsA.filter((o) => o.type === 'post')
  const postsB = objectsB.filter((o) => o.type === 'post')
  const matched = new Set()
  const added = []
  // B 中在 A 找不到 1m 内对应桩 => 新增
  for (const b of postsB) {
    const hit = postsA.find((a) => !matched.has(a.id) && dist2D(a.x, a.z, b.x, b.z) <= 1)
    if (hit) matched.add(hit.id)
    else added.push({ id: b.id, x: round1(b.x), z: round1(b.z) })
  }
  const removed = postsA.filter((a) => !matched.has(a.id)).map((a) => ({ id: a.id, x: round1(a.x), z: round1(a.z) }))

  const mat = (k, label, unit = '') => ({
    label,
    unit,
    from: statsA[k] ?? 0,
    to: statsB[k] ?? 0,
    delta: (statsB[k] ?? 0) - (statsA[k] ?? 0)
  })

  return {
    added,
    removed,
    materials: [
      mat('postCount', '水泥桩', '根'),
      mat('meshLength', '网片', '米'),
      mat('panels3', '3m网片', '片'),
      mat('panels5', '5m网片', '片'),
      mat('gateCount', '大门', '樘'),
      mat('waterCount', '饮水点', '处')
    ]
  }
}
