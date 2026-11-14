import { reactive, computed, watch } from 'vue'
import { rngFor, hash32, round } from '../core/rng.js'
import { generateRoutePoints, catmullRom, polylineLength, pointAtDistance } from '../core/route.js'
import { buildDistrict, resolveBuilding, rerollBuilding, setOverride, districtFingerprint } from '../core/city.js'
import { proposeStops, spacingStatus, stationGaps, spacingLevel, SPACING_MIN, SPACING_MAX, placementBoxes } from '../core/stations.js'
import { makeLineCode, districtName, makeStationName } from '../core/naming.js'

const STORAGE_KEY = 'bus-stop-studio.v1'
const SCHEMA = 1

export const BUDGET_TIERS = [
  { key: 'A', label: 'A · 基础型', amount: 78, shelter: '简易站牌 + 单侧雨棚', capacity: '2 条线路' },
  { key: 'B', label: 'B · 标准型', amount: 128, shelter: '标准站亭 + 盲道 + 电子站牌', capacity: '4 条线路' },
  { key: 'C', label: 'C · 枢纽型', amount: 196, shelter: '双岛站亭 + 换乘导视 + 候车室', capacity: '8 条线路' }
]

export const DISTRICTS = ['城西片区', '城东片区', '城东拓展区', '城北片区', '城南片区']

export const QC_STANDARDS = {
  blindPathMin: 0.4,
  dimToleranceMm: 50,
  minPhotos: 2,
  orientationList: ['东', '东南', '南', '西南', '西', '西北', '北', '东北']
}

export const ORDER_STATUS = {
  pending: { label: '待分派', tone: 'idle' },
  assigned: { label: '待施工', tone: 'info' },
  submitted: { label: '待质检', tone: 'warn' },
  rejected: { label: '返工中', tone: 'bad' },
  passed: { label: '验收通过', tone: 'good' },
  locked: { label: '锁单待主管', tone: 'locked' }
}

const WORKER_SEED = [
  ['w01', '陈建国', '城西片区', '施'],
  ['w02', '李海峰', '城西片区', '施'],
  ['w03', '王玉兰', '城东片区', '施'],
  ['w04', '赵志强', '城东片区', '施'],
  ['w05', '孙明远', '城东拓展区', '施'],
  ['w06', '周小满', '城北片区', '施'],
  ['w07', '吴德胜', '城南片区', '施']
]

function nowIso() {
  return new Date().toISOString()
}

function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
}

/* ---------------- 演示数据 ---------------- */

function demoPhoto(label, hue, kind = 'scene') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="hsl(${hue},24%,32%)"/><stop offset="1" stop-color="hsl(${hue},18%,12%)"/></linearGradient></defs>
  <rect width="320" height="220" fill="url(#g)"/>
  <rect x="24" y="96" width="272" height="96" fill="hsl(${hue},10%,22%)"/>
  <rect x="58" y="70" width="204" height="10" fill="hsl(${hue},40%,55%)"/>
  <rect x="70" y="80" width="8" height="72" fill="hsl(${hue},12%,45%)"/>
  <rect x="242" y="80" width="8" height="72" fill="hsl(${hue},12%,45%)"/>
  ${Array.from({ length: 12 }, (_, i) => `<rect x="${30 + i * 22}" y="196" width="12" height="4" fill="hsl(${hue},60%,60%)" opacity=".65"/>`).join('')}
  <circle cx="286" cy="26" r="12" fill="hsl(${hue},45%,58%)" opacity=".5"/>
  <text x="12" y="210" font-family="monospace" font-size="10" fill="#e8eef2" opacity=".75">${kind}/${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function createDemo() {
  const seed = 'S-2026-0417'
  const lineId = 'L58'
  const controls = generateRoutePoints(seed, 4700, 7)
  const district = buildDistrict({ seed, lineId, controls, density: 1 })
  const stops = proposeStops({ district, seed, lineId, count: 14 })
  // 演示用的“超标段”：撤并线路中段连续两站，使合并后的站距突破 800m。
  // 撤站不改变剩余站点的先后顺序，因此站序始终合法。
  if (stops.length >= 12) {
    for (let i = 3; i < stops.length - 4; i++) {
      const merged = stops[i + 2].dist - stops[i - 1].dist
      if (merged > 830 && merged < 1400) {
        stops.splice(i, 2)
        break
      }
    }
    stops.forEach((s, i) => {
      s.order = i + 1
      s.id = `${lineId}-S${String(i + 1).padStart(2, '0')}`
    })
  }
  const lineCode = makeLineCode(seed)

  const project = {
    id: 'P-DEMO-58',
    lineCode,
    name: `${lineCode} 延伸段站台建设`,
    applicant: '运营二部 · 何嘉',
    status: 'approved',
    createdAt: '2026-10-28T02:10:00.000Z',
    seed,
    lineId,
    density: 1,
    controls,
    stopsCount: stops.length,
    spacingMin: 300,
    spacingMax: 800,
    firstBus: '05:40',
    lastBus: '22:30',
    budget: 'B',
    note: '覆盖城东拓展区新建居住组团，与 17 路、环 6 路接驳。',
    district,
    stops,
    approval: { by: '主管 · 郑岚', at: '2026-10-30T06:20:00.000Z' }
  }

  const workers = WORKER_SEED.map(([id, name, area]) => ({
    id, name, area, title: '施工员', phone: `13${hash32(id) % 900000000 + 100000000}`
  }))

  const statuses = [
    'passed', 'passed', 'passed', 'rejected', 'passed',
    'submitted', 'assigned', 'locked', 'pending', 'pending',
    'passed', 'rejected', 'assigned', 'passed'
  ]
  const reworks = [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 1, 0, 0]

  const orders = stops.map((s, i) => {
    const box = placementBoxes([s], district)[0]
    const area = s.district
    const pool = workers.filter((w) => w.area === area)
    const worker = pool[i % Math.max(1, pool.length)] || workers[i % workers.length]
    const st = statuses[i] || 'pending'
    const rng = rngFor(seed, `demo-order:${s.id}`)
    const o = {
      id: `WO-${lineId}-${String(i + 1).padStart(3, '0')}`,
      projectId: project.id,
      stationId: s.id,
      stationName: s.name,
      stationOrder: s.order,
      area,
      workerId: st === 'pending' ? null : worker.id,
      district: area,
      transfer: s.transfer,
      transferCode: s.transferCode,
      status: st,
      reworkCount: reworks[i] || 0,
      createdAt: '2026-10-30T07:00:00.000Z',
      assignedAt: st === 'pending' ? null : '2026-10-30T08:00:00.000Z',
      submissions: [],
      qc: null,
      locked: st === 'locked' ? { at: '2026-11-06T09:12:00.000Z', reason: '累计返工 3 次，转主管确认' } : null,
      plan: {
        lengthMm: 5600,
        widthMm: 2200,
        heightMm: 2600,
        orientation: QC_STANDARDS.orientationList[rng.int(0, 7)],
        shelter: BUDGET_TIERS.find((b) => b.key === project.budget).shelter
      },
      placement: box
    }
    if (['submitted', 'passed', 'rejected', 'locked'].includes(st)) {
      const withFlaw = st === 'rejected' || st === 'locked'
      o.submissions.push({
        id: `SUB-${o.id}-1`,
        at: '2026-11-04T03:20:00.000Z',
        dims: {
          lengthMm: 5600 + (withFlaw ? 120 : 10),
          widthMm: 2200,
          heightMm: 2600 - (withFlaw ? 60 : 0)
        },
        orientation: o.plan.orientation,
        photos: [demoPhoto(s.name, (hash32(s.id) % 200) + 20, '站台'), demoPhoto('盲道', 34, '盲道')],
        note: '现场已完成站亭吊装，盲道待验收。'
      })
      o.qc = withFlaw
        ? {
          at: '2026-11-06T09:10:00.000Z',
          verdict: 'reject',
          blindPathRatio: 0.32,
          sightBlocked: i === 7,
          dimensionOk: false,
          orientationOk: true,
          photoOk: true,
          reasons: [
            i === 7 ? '站亭立柱遮挡人行道视线' : '盲道连续率 32%，低于 40% 标准',
            '站台高度偏差超出 ±50mm 公差'
          ],
          inspector: '质检 · 罗敏'
        }
        : {
          at: '2026-11-05T10:00:00.000Z',
          verdict: 'pass',
          blindPathRatio: 0.82,
          sightBlocked: false,
          dimensionOk: true,
          orientationOk: true,
          photoOk: true,
          reasons: [],
          inspector: '质检 · 罗敏'
        }
    }
    return o
  })

  // 让已验收工单也有返工历史，便于展示返工率
  for (const o of orders) {
    if (o.status === 'passed' && hash32(o.id) % 5 === 0) {
      o.reworkCount = 1
      o.rejectedBefore = 1
    }
  }

  return {
    schema: SCHEMA,
    activeProjectId: project.id,
    projects: [project],
    workers,
    orders,
    log: [
      { at: '2026-10-30T06:20:00.000Z', text: '主管郑岚批准立项，生成 14 张站点工单', by: '郑岚' },
      { at: '2026-11-06T09:10:00.000Z', text: 'WO-L58-008 第 3 次返工，已锁单待主管确认', by: '罗敏' }
    ]
  }
}

/* ---------------- store ---------------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDemo()
    const data = JSON.parse(raw)
    if (!data || data.schema !== SCHEMA) return createDemo()
    return data
  } catch (e) {
    console.warn('读取本地数据失败，使用初始数据', e)
    return createDemo()
  }
}

export const state = reactive(load())

let saveTimer = null
watch(
  state,
  () => {
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persist, 240)
  },
  { deep: true }
)

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (e) {
    console.warn('本地存储写入失败（可能超出配额）', e)
    return false
  }
}

// 首次进入即落盘，避免“什么都没点”时刷新仍走内存默认值
if (typeof localStorage !== 'undefined' && !localStorage.getItem(STORAGE_KEY)) {
  persist()
}

export function resetDemo() {
  const fresh = createDemo()
  Object.keys(state).forEach((k) => delete state[k])
  Object.assign(state, fresh)
  persist()
}

/* ---------------- 项目 ---------------- */

export const activeProject = computed(
  () => state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0] || null
)

export function setActiveProject(id) {
  state.activeProjectId = id
}

export function budgetOf(project) {
  return BUDGET_TIERS.find((t) => t.key === project.budget) || BUDGET_TIERS[1]
}

export function previewRoute({ seed, bends, length, density }) {
  const controls = generateRoutePoints(seed, length, bends)
  const line = catmullRom(controls, 14)
  const lineId = `L${String(hash32(seed) % 900 + 100)}`
  const district = buildDistrict({ seed, lineId, controls, density })
  return { controls, line, district, total: polylineLength(line) }
}

export function createProject(payload) {
  const seed = payload.seed || `S-${Date.now().toString(36).toUpperCase()}`
  const lineId = `L${100 + (state.projects.length * 7) % 800}`
  const controls = payload.controls && payload.controls.length >= 2
    ? payload.controls
    : generateRoutePoints(seed, payload.routeLength || 4600, payload.bends || 6)
  const density = payload.density ?? 1
  const district = buildDistrict({ seed, lineId, controls, density })
  const stops = proposeStops({
    district,
    seed,
    lineId,
    count: payload.stopsCount || 14,
    spacing: `${payload.spacingMin}-${payload.spacingMax}`
  })
  const project = {
    id: uid('P-'),
    lineCode: payload.lineCode?.trim() || makeLineCode(seed),
    name: payload.name?.trim() || '未命名线路站台建设',
    applicant: payload.applicant?.trim() || '运营部',
    status: 'draft',
    createdAt: nowIso(),
    seed,
    lineId,
    density,
    controls,
    stopsCount: stops.length,
    spacingMin: payload.spacingMin ?? SPACING_MIN,
    spacingMax: payload.spacingMax ?? SPACING_MAX,
    firstBus: payload.firstBus || '06:00',
    lastBus: payload.lastBus || '22:00',
    budget: payload.budget || 'B',
    note: payload.note || '',
    district,
    stops,
    approval: null
  }
  state.projects.push(project)
  state.activeProjectId = project.id
  log(`新建申请 ${project.lineCode} · ${project.name}，种子 ${seed}`)
  return project
}

export function approveProject(projectId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  p.status = 'approved'
  p.approval = { by: '主管 · 郑岚', at: nowIso() }
  const existing = new Set(state.orders.filter((o) => o.projectId === p.id).map((o) => o.stationId))
  p.stops.forEach((s, i) => {
    if (existing.has(s.id)) return
    const box = placementBoxes([s], p.district)[0]
    state.orders.push({
      id: `WO-${p.lineId}-${String(s.order).padStart(3, '0')}`,
      projectId: p.id,
      stationId: s.id,
      stationName: s.name,
      stationOrder: s.order,
      area: s.district,
      district: s.district,
      workerId: null,
      transfer: s.transfer,
      transferCode: s.transferCode,
      status: 'pending',
      reworkCount: 0,
      createdAt: nowIso(),
      assignedAt: null,
      submissions: [],
      qc: null,
      locked: null,
      plan: {
        lengthMm: 5600,
        widthMm: 2200,
        heightMm: 2600,
        orientation: QC_STANDARDS.orientationList[i % 8],
        shelter: budgetOf(p).shelter
      },
      placement: box
    })
  })
  log(`立项批准：${p.lineCode}，生成 ${p.stops.length} 张工单`)
}

/* ---------------- 三维街区 ---------------- */

/** 整线重生成时按建筑 ID 回填手工改造，避免手工成果被整体冲掉 */
function carryOverOverrides(oldDistrict, newDistrict) {
  if (!oldDistrict || !newDistrict) return 0
  const old = new Map(oldDistrict.buildings.map((b) => [b.id, b]))
  let carried = 0
  newDistrict.buildings = newDistrict.buildings.map((b) => {
    const prev = old.get(b.id)
    if (!prev) return b
    const hasOv = prev.overrides && Object.keys(prev.overrides).length
    const nonce = prev.nonce || 0
    if (!hasOv && !nonce) return b
    carried += hasOv ? 1 : 0
    return {
      ...b,
      nonce,
      overrides: { ...(prev.overrides || {}) },
      history: [...(prev.history || [])]
    }
  })
  return carried
}

export function regenerateDistrict(projectId, { newSeed = false, seed: seedOverride } = {}) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return null
  if (newSeed) p.seed = seedOverride || `S-${Math.floor(Math.random() * 1e6).toString(36).toUpperCase()}`
  const prev = p.district
  p.district = buildDistrict({ seed: p.seed, lineId: p.lineId, controls: p.controls, density: p.density })
  const carried = carryOverOverrides(prev, p.district)
  // 只重建建筑体量，站序与工单保持不动（站位由 controls 决定，与种子无关）
  log(`街区已按种子 ${p.seed} 重生成${carried ? `，保留 ${carried} 栋手工改造` : ''}`)
  return p.district
}

export function setSeed(projectId, seed) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const prev = p.district
  p.seed = seed
  p.district = buildDistrict({ seed, lineId: p.lineId, controls: p.controls, density: p.density })
  const carried = carryOverOverrides(prev, p.district)
  log(`种子切换为 ${seed}${carried ? `，${carried} 栋手工改造已跨种子保留` : ''}`)
}

export function setDensity(projectId, density) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const prev = p.district
  p.density = density
  p.district = buildDistrict({ seed: p.seed, lineId: p.lineId, controls: p.controls, density })
  const carried = carryOverOverrides(prev, p.district)
  log(`街区密度调整为 ${density}${carried ? `，保留 ${carried} 栋手工改造` : ''}`)
}

export function editBuilding(projectId, buildingId, patch) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return null
  const idx = p.district.buildings.findIndex((b) => b.id === buildingId)
  if (idx < 0) return null
  let b = p.district.buildings[idx]
  for (const [k, v] of Object.entries(patch)) b = setOverride(b, k, v)
  b.history = [...(b.history || []).slice(-8), { at: nowIso(), action: 'manual-edit', keys: Object.keys(patch) }]
  p.district.buildings.splice(idx, 1, b)
  refreshStats(p)
  log(`手动修改 ${buildingId}：${Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(', ')}`)
  return b
}

export function rebuildOneBuilding(projectId, buildingId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return null
  const idx = p.district.buildings.findIndex((b) => b.id === buildingId)
  if (idx < 0) return null
  const before = Object.keys(p.district.buildings[idx].overrides || {})
  const nb = rerollBuilding(p.district.buildings[idx], p.seed)
  nb.history = [...(nb.history || []), { at: nowIso(), action: 'reroll', kept: before }]
  p.district.buildings.splice(idx, 1, nb)
  refreshStats(p)
  log(`单栋重生成 ${buildingId}，保留手工字段 ${before.length ? before.join('/') : '无'}`)
  return nb
}

export function resetBuilding(projectId, buildingId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const idx = p.district.buildings.findIndex((b) => b.id === buildingId)
  if (idx < 0) return
  const b = p.district.buildings[idx]
  p.district.buildings.splice(idx, 1, {
    ...b,
    overrides: {},
    history: [...(b.history || []), { at: nowIso(), action: 'reset' }]
  })
  refreshStats(p)
  log(`恢复 ${buildingId} 的种子原型`)
}

function refreshStats(p) {
  const arr = p.district.buildings
  let floors = 0
  let tallest = 0
  let footprint = 0
  const styles = {}
  for (const b of arr) {
    const s = resolveBuilding(b)
    floors += s.floors
    tallest = Math.max(tallest, s.height)
    footprint += s.width * s.depth
    styles[s.styleKey] = (styles[s.styleKey] || 0) + 1
  }
  p.district.stats = {
    count: arr.length,
    floors,
    tallest: round(tallest, 1),
    footprint: Math.round(footprint),
    plotRatio: round(footprint / Math.max(1, p.district.total * 130), 2),
    styles
  }
}

export function projectFingerprint(p) {
  return districtFingerprint(p.district)
}

/* ---------------- 站点编排 ---------------- */

export function projectSpacing(p) {
  return spacingStatus(p.stops)
}

export function chooseCandidate(projectId, stationId, idx) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const s = p.stops.find((x) => x.id === stationId)
  if (!s) return
  s.chosen = Math.max(0, Math.min(s.candidates.length - 1, idx))
  const order = state.orders.find((o) => o.stationId === stationId && o.projectId === p.id)
  if (order) order.placement = placementBoxes([s], p.district)[0]
}

export function shiftStop(projectId, stationId, deltaM) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const i = p.stops.findIndex((x) => x.id === stationId)
  if (i < 0) return
  const s = p.stops[i]
  const lo = i === 0 ? 20 : p.stops[i - 1].dist + SPACING_MIN + 10
  const hi = i === p.stops.length - 1 ? p.district.total - 20 : p.stops[i + 1].dist - SPACING_MIN - 10
  s.dist = round(Math.max(lo, Math.min(hi, s.dist + deltaM)), 1)
  refreshStopCandidates(p, i)
  log(`调整 ${s.name} 里程至 ${s.dist}m`)
}

export function nudgeStop(projectId, stationId, deltaM) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const i = p.stops.findIndex((x) => x.id === stationId)
  if (i < 0) return
  const s = p.stops[i]
  const prev = i === 0 ? 0 : p.stops[i - 1].dist
  const next = i === p.stops.length - 1 ? p.district.total : p.stops[i + 1].dist
  s.dist = round(Math.max(prev + 120, Math.min(next - 120, s.dist + deltaM)), 1)
  refreshStopCandidates(p, i)
}

function refreshStopCandidates(p, i) {
  const s = p.stops[i]
  const pt = pointAtDistance(p.district.line, s.dist)
  const radii = [1.0, 0.85, 0.7, 0.55]
  const r = radii[Math.min(3, s.bandIndex)] * (0.82 + 0.3 * s.demandScore)
  const list = []
  for (let L = 1; L <= 2; L++) {
    const lateral = 22 + L * 12 + r * 5
    for (const side of [1, -1]) {
      const nx = -Math.sin(pt.angle)
      const nz = Math.cos(pt.angle)
      list.push({
        x: round(pt.x + nx * side * lateral, 2),
        z: round(pt.z + nz * side * lateral, 2),
        lateral: side * lateral,
        side
      })
    }
  }
  s.candidates = list
  const order = state.orders.find((o) => o.stationId === s.id && o.projectId === p.id)
  if (order) order.placement = placementBoxes([s], p.district)[0]
}

export function reproposeStops(projectId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  p.stops = proposeStops({
    district: p.district,
    seed: `${p.seed}-${p.stops.length}-${p.stopsCount}`,
    lineId: p.lineId,
    count: p.stopsCount,
    spacing: `${p.spacingMin}-${p.spacingMax}`
  })
  log(`重新编排候选站点：${p.stops.length} 站`)
}

/** 在超标段中间增补一站（比硬挪站位更符合现场做法），随后重新编号 */
export function insertStopInGap(projectId, gapIndex) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return { ok: false, msg: '项目不存在' }
  const a = p.stops[gapIndex]
  const b = p.stops[gapIndex + 1]
  if (!a || !b) return { ok: false, msg: '区段不存在' }
  const gap = b.dist - a.dist
  if (gap <= SPACING_MAX) return { ok: false, msg: '该段站距已合规' }
  if (gap < SPACING_MIN * 2) return { ok: false, msg: '增补后相邻站距会低于 300m，请改为整体重排' }
  const mid = round((a.dist + b.dist) / 2, 1)
  const rng = rngFor(p.seed, `insert:${a.id}:${b.id}`)
  const used = new Set(p.stops.map((s) => s.name))
  const fresh = {
    id: 'tmp',
    order: 0,
    name: makeStationName(p.seed, 90 + gapIndex + rng.int(0, 9), used),
    dist: mid,
    district: districtName(0, 0),
    bandIndex: 1,
    demandScore: round(0.4 + rng.next() * 0.4, 3),
    transfer: false,
    transferCode: '',
    candidates: [],
    chosen: 0
  }
  const pt = pointAtDistance(p.district.line, mid)
  fresh.district = districtName(pt.x, pt.z)
  refreshStopCandidatesFor(p, fresh)
  p.stops.splice(gapIndex + 1, 0, fresh)
  renumberStops(p)
  p.stopsCount = p.stops.length
  log(`${a.name}–${b.name} 区段增补候车站「${fresh.name}」，站距 ${gap.toFixed(0)}m 拆分为两段`)
  return { ok: true, name: fresh.name }
}

function renumberStops(p) {
  // 仅更新站序；ID 保持稳定（工单按 ID 关联），新增站用带序号后缀的 ID
  const used = new Set(p.stops.map((s) => s.id))
  p.stops.forEach((s, i) => {
    s.order = i + 1
    if (!s.id || s.id === 'tmp' || used.has('__dup__')) {
      let n = i + 1
      let id = `${p.lineId}-SN${String(n).padStart(2, '0')}`
      while (used.has(id)) id = `${p.lineId}-SN${String(++n).padStart(2, '0')}x`
      s.id = id
      used.add(id)
    }
    const order = state.orders.find((o) => o.stationId === s.id && o.projectId === p.id)
    if (order) {
      order.stationOrder = i + 1
      order.stationName = s.name
    }
  })
}

function refreshStopCandidatesFor(p, s) {
  const pt = pointAtDistance(p.district.line, s.dist)
  const r = 0.85 * (0.82 + 0.3 * s.demandScore)
  const list = []
  for (let L = 1; L <= 2; L++) {
    const lateral = 22 + L * 12 + r * 5
    for (const side of [1, -1]) {
      const nx = -Math.sin(pt.angle)
      const nz = Math.cos(pt.angle)
      list.push({
        x: round(pt.x + nx * side * lateral, 2),
        z: round(pt.z + nz * side * lateral, 2),
        lateral: side * lateral,
        side
      })
    }
  }
  s.candidates = list
}

export function setStopCount(projectId, count) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  p.stopsCount = Math.max(6, Math.min(20, count))
  reproposeStops(projectId)
}

export function setSpacingLimits(projectId, min, max) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  p.spacingMin = min
  p.spacingMax = max
}

/* ---------------- 工单 / 派工 ---------------- */

export function workersOfArea(area) {
  return state.workers.filter((w) => w.area === area)
}

export function workerById(id) {
  return state.workers.find((w) => w.id === id) || null
}

export function ordersOfProject(projectId) {
  return state.orders.filter((o) => o.projectId === projectId)
}

export function assignOrder(orderId, workerId) {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o) return { ok: false, msg: '工单不存在' }
  const w = workerById(workerId)
  if (!w) return { ok: false, msg: '施工员不存在' }
  if (o.status === 'passed' || o.status === 'locked') return { ok: false, msg: '该工单已验收或锁单，不能改派' }
  o.workerId = workerId
  o.area = w.area
  o.district = w.area
  if (o.status === 'pending') o.status = 'assigned'
  o.assignedAt = o.assignedAt || nowIso()
  log(`工单 ${o.id} 分派给 ${w.name}（${w.area}）`)
  return { ok: true }
}

export function autoDispatch(projectId, { strategy = 'balance' } = {}) {
  const orders = state.orders.filter(
    (o) => o.projectId === projectId && (o.status === 'pending' || o.status === 'assigned')
  )
  let n = 0
  for (const o of orders) {
    const pool = state.workers.filter((w) => w.area === o.area)
    if (!pool.length) continue
    const load = (wid) =>
      state.orders.filter((x) => x.workerId === wid && !['passed', 'locked'].includes(x.status)).length
    const sorted = [...pool].sort((a, b) => load(a.id) - load(b.id))
    const w = strategy === 'balance' ? sorted[0] : pool[0]
    if (o.workerId === w.id) continue
    o.workerId = w.id
    if (o.status === 'pending') o.status = 'assigned'
    o.assignedAt = o.assignedAt || nowIso()
    n++
  }
  log(`按片区自动派工，调整 ${n} 张工单`)
  return n
}

export function submitField(orderId, payload) {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o) return { ok: false, msg: '工单不存在' }
  if (o.status !== 'assigned' && o.status !== 'rejected') return { ok: false, msg: '当前状态不可提交' }
  const sub = {
    id: `SUB-${o.id}-${o.submissions.length + 1}`,
    at: nowIso(),
    ...payload
  }
  o.submissions.push(sub)
  o.status = 'submitted'
  log(`${o.id} 已提交施工成果，等待质检`)
  return { ok: true, submission: sub }
}

export function qcReview(orderId, checklist) {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o) return { ok: false, msg: '工单不存在' }
  if (o.status !== 'submitted') return { ok: false, msg: '仅待质检工单可验收' }
  const reasons = []
  if (checklist.blindPathRatio < QC_STANDARDS.blindPathMin) {
    reasons.push(`盲道连续率 ${Math.round(checklist.blindPathRatio * 100)}%，低于 ${QC_STANDARDS.blindPathMin * 100}% 标准`)
  }
  if (checklist.sightBlocked) reasons.push('站亭或立柱遮挡行人及来车视线')
  if (!checklist.dimensionOk) reasons.push(`站台尺寸偏差超出 ±${QC_STANDARDS.dimToleranceMm}mm 公差`)
  if (!checklist.orientationOk) reasons.push('站亭朝向与规划不符（未朝向车行道）')
  if (!checklist.photoOk) reasons.push(`现场照片不足（需 ≥${QC_STANDARDS.minPhotos} 张有效照片）`)
  if (checklist.extraReason) reasons.push(checklist.extraReason)
  const verdict = reasons.length ? 'reject' : 'pass'
  o.qc = {
    at: nowIso(),
    verdict,
    blindPathRatio: checklist.blindPathRatio,
    sightBlocked: checklist.sightBlocked,
    dimensionOk: checklist.dimensionOk,
    orientationOk: checklist.orientationOk,
    photoOk: checklist.photoOk,
    extraReason: checklist.extraReason || '',
    reasons,
    inspector: '质检 · 罗敏'
  }
  if (verdict === 'pass') {
    o.status = 'passed'
    log(`${o.id} 验收通过`)
    return { ok: true, verdict, reasons }
  }
  o.reworkCount += 1
  o.status = 'rejected'
  if (o.reworkCount >= 3) {
    o.status = 'locked'
    o.locked = { at: nowIso(), reason: `累计返工 ${o.reworkCount} 次，锁单待主管确认` }
    log(`${o.id} 第 ${o.reworkCount} 次返工，自动锁单`)
  } else {
    log(`${o.id} 验收不通过（第 ${o.reworkCount} 次返工）：${reasons[0]}`)
  }
  return { ok: true, verdict, reasons, locked: o.status === 'locked' }
}

export function supervisorUnlock(orderId, note) {
  const o = state.orders.find((x) => x.id === orderId)
  if (!o || o.status !== 'locked') return { ok: false, msg: '仅锁单可解锁' }
  o.status = 'rejected'
  o.locked = { ...(o.locked || {}), unlockedAt: nowIso(), unlockedBy: '主管 · 郑岚', unlockNote: note || '' }
  o.reworkCount = 0
  log(`${o.id} 经主管确认解锁返工（返工计数清零）`)
  return { ok: true }
}

export function log(text, by = '系统') {
  state.log.unshift({ at: nowIso(), text, by })
  if (state.log.length > 120) state.log.length = 120
}

/* ---------------- 统计 ---------------- */

export const metrics = computed(() => {
  const orders = state.orders
  const perWorker = state.workers.map((w) => {
    const mine = orders.filter((o) => o.workerId === w.id)
    const done = mine.filter((o) => o.status === 'passed')
    const subs = mine.reduce((n, o) => n + o.submissions.length, 0)
    const reworks = mine.reduce((n, o) => n + o.reworkCount, 0)
    const active = mine.filter((o) => ['assigned', 'rejected', 'submitted'].includes(o.status))
    const rate = done.length + active.length ? reworks / Math.max(1, done.length + reworks) : 0
    return {
      ...w,
      total: mine.length,
      done: done.length,
      active: active.length,
      locked: mine.filter((o) => o.status === 'locked').length,
      reworks,
      submissions: subs,
      reworkRate: Math.min(1, reworks / Math.max(1, done.length + reworks)),
      passedRate: mine.length ? done.length / mine.length : 0
    }
  })
  const done = orders.filter((o) => o.status === 'passed').length
  const rejected = orders.filter((o) => o.status === 'rejected').length
  const locked = orders.filter((o) => o.status === 'locked').length
  const pending = orders.filter((o) => o.status === 'pending').length
  const submitted = orders.filter((o) => o.status === 'submitted').length
  const assigned = orders.filter((o) => o.status === 'assigned').length
  const reworks = orders.reduce((n, o) => n + o.reworkCount, 0)
  return {
    orders,
    perWorker,
    done,
    rejected,
    locked,
    pending,
    submitted,
    assigned,
    reworks,
    total: orders.length,
    reworkRate: orders.length ? reworks / Math.max(1, done + reworks + rejected + locked) : 0,
    completion: orders.length ? done / orders.length : 0
  }
})

/* ---------------- 导出 ---------------- */

function csvEscape(v) {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function download(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function exportLineList(projectId = state.activeProjectId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const rows = [['序号', '线路', '站序', '站名', '里程(m)', '所属片区', '换乘', '换乘线路', '站台形式', '站距(m)', '校验']]
  const gaps = stationGaps(p.stops)
  const entry = budgetOf(p)
  p.stops.forEach((s, i) => {
    rows.push([
      i + 1,
      p.lineCode,
      s.order,
      s.name,
      s.dist,
      s.district,
      s.transfer ? '是' : '否',
      s.transferCode,
      i === 0 || i === p.stops.length - 1 ? '首末站' : s.transfer ? '换乘站' : '中途站',
      i === 0 ? '' : gaps[i - 1],
      i === 0 ? spacingLevel(gaps[0]) : spacingLevel(Math.min(gaps[i - 1] ?? Infinity, gaps[i] ?? Infinity))
    ])
  })
  rows.push([])
  rows.push(['预算档位', entry.label, `¥${entry.amount} 万`, entry.shelter])
  rows.push(['首末班', p.firstBus, p.lastBus, ''])
  rows.push(['站距区间', `${p.spacingMin}-${p.spacingMax} m`, `标准 ${SPACING_MIN}-${SPACING_MAX} m`, ''])
  download(`线路清单_${p.lineCode}_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'))
  log(`导出线路清单 ${p.lineCode}`)
}

export function exportOrderLedger(projectId = state.activeProjectId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const rows = [
    ['工单号', '线路', '站序', '站名', '片区', '施工员', '状态', '返工次数', '提交次数', '盲道连续率', '质检结论', '质检原因', '最近提交时间', '锁单原因']
  ]
  state.orders
    .filter((o) => o.projectId === p.id)
    .sort((a, b) => a.stationOrder - b.stationOrder)
    .forEach((o) => {
      const sub = o.submissions[o.submissions.length - 1]
      rows.push([
        o.id,
        p.lineCode,
        o.stationOrder,
        o.stationName,
        o.area,
        o.workerId ? workerById(o.workerId)?.name || '' : '未分派',
        ORDER_STATUS[o.status]?.label || o.status,
        o.reworkCount,
        o.submissions.length,
        o.qc ? `${Math.round(o.qc.blindPathRatio * 100)}%` : '',
        o.qc ? (o.qc.verdict === 'pass' ? '通过' : '不通过') : '',
        o.qc ? o.qc.reasons.join('；') : '',
        sub ? sub.at : '',
        o.locked ? o.locked.reason : ''
      ])
    })
  download(`工单台账_${p.lineCode}_${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map(csvEscape).join(',')).join('\n'))
  log(`导出工单台账 ${p.lineCode}`)
}

export function exportDistrictJson(projectId = state.activeProjectId) {
  const p = state.projects.find((x) => x.id === projectId)
  if (!p) return
  const payload = {
    lineCode: p.lineCode,
    seed: p.seed,
    fingerprint: projectFingerprint(p),
    density: p.density,
    buildings: p.district.buildings.map((b) => {
      const s = resolveBuilding(b)
      return { id: b.id, x: b.position.x, z: b.position.z, rot: b.rotationY, floors: s.floors, style: s.styleKey, overrides: b.overrides }
    })
  }
  download(`街区体量_${p.lineCode}.json`, JSON.stringify(payload, null, 2), 'application/json')
  log(`导出街区 JSON ${p.lineCode}`)
}

export { SPACING_MIN, SPACING_MAX, spacingLevel, spacingStatus, stationGaps, placementBoxes, districtName, resolveBuilding, catmullRom }
export { FACADE_STYLES, TINTS, FACADE_BY_KEY } from '../core/city.js'
export const orderStatus = (s) => ORDER_STATUS[s] || { label: s, tone: 'idle' }
