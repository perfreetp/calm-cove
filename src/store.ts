import { create } from 'zustand'
import type {
  CameraRequest,
  Canal,
  CanalLevel,
  DocStatus,
  Feature,
  FeatureRevision,
  FeatureType,
  Layers,
  Notice,
  RasterSheet,
  Rejection,
  Role,
  SearchFilters,
} from './types'
import { LEVEL_ORDER, TYPE_ORDER } from './types'
import { buildMeta, buildWorld, SHEETS, WorldMeta } from './data/worldgen'
import { bboxOf, nearestOnPolyline, pathOf, uid } from './lib/geo'

const LS_KEY = 'qgl-irrigation-archive-v1'

export interface PersistedState {
  layers: Layers
  camera: { x: number; y: number; k: number } | null
  role: Role
  tab: 'map' | 'review' | 'search' | 'batch'
  selectionId: string | null
}

export const DEFAULT_LAYERS: Layers = {
  levels: { trunk: true, branch: true, lateral: true },
  types: { gate: true, weir: true, pump: true, drop: true, culvert: true },
  showLabels: true,
  showChainage: true,
  showTerrain: false,
  showRaster: true,
  showRejections: true,
  versionOverlay: false,
}

function loadPersisted(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.__v !== 1) return {}
    return parsed.data || {}
  } catch {
    return {}
  }
}

const initialPersist = loadPersisted()

export type Tool = 'select' | 'pan' | 'measure' | 'draw' | FeatureType

export interface EditSession {
  dirty: Set<string>
  drawPts: [number, number][]
  measurePts: [number, number][]
  cursor: [number, number] | null
  hoverFeatureId: string | null
  hoverCanalId: string | null
}

export interface AppState {
  world: ReturnType<typeof buildWorld>
  meta: WorldMeta
  layers: Layers
  camera: { x: number; y: number; k: number } | null
  role: Role
  tab: 'map' | 'review' | 'search' | 'batch'
  selectionId: string | null
  selectedCanalId: string | null
  hoverFeatureId: string | null
  hoverCanalId: string | null
  cameraRequest: CameraRequest | null
  filters: SearchFilters
  rejections: Rejection[]
  notices: Notice[]
  tool: Tool
  drawPts: [number, number][]
  measurePts: [number, number][]
  editMode: boolean
  rasterOn: boolean
  sheets: RasterSheet[]
  addSheet: (sheet: RasterSheet) => void
  updateSheet: (id: string, patch: Partial<RasterSheet>) => void
  removeSheet: (id: string) => void
  bringSheetToFront: (id: string) => void
  review: { canalId: string | null; index: number; open: boolean; rejectOpen: boolean }
  compareVersions: [number | null, number | null]
  panelCollapsed: { left: boolean; right: boolean }
  showShortcuts: boolean
  reviewMarks: Record<string, string[]>
  toggleReviewMark: (canalId: string, featureId: string, ok: boolean) => void
  clearReviewMarks: (canalId: string) => void

  setCamera: (x: number, y: number, k: number) => void
  flyTo: (bbox: [number, number, number, number], maxK?: number) => void
  setRole: (r: Role) => void
  setTab: (t: AppState['tab']) => void
  toggleLevel: (l: CanalLevel) => void
  toggleType: (t: FeatureType) => void
  setLayer: (k: keyof Omit<Layers, 'levels' | 'types'>, v: boolean) => void
  allLevels: (v: boolean) => void
  allTypes: (v: boolean) => void
  selectFeature: (id: string | null) => void
  selectCanal: (id: string | null) => void
  setHover: (featureId: string | null, canalId?: string | null) => void
  setTool: (t: Tool) => void
  pushDrawPoint: (p: [number, number]) => void
  clearDraw: () => void
  setMeasure: (pts: [number, number][]) => void
  setEditMode: (v: boolean) => void
  setFilters: (f: Partial<SearchFilters>) => void
  resetFilters: () => void
  notify: (text: string, tone?: Notice['tone']) => void
  dismissNotice: (id: number) => void
  moveFeature: (id: string, x: number, y: number) => void
  updateFeatureProps: (id: string, props: Record<string, string | number>, note: string) => void
  createCanal: (input: {
    code: string
    name: string
    level: CanalLevel
    parentId: string | null
    startChainage: number
    endChainage: number
    designFlow: number
    builtYear: number
    pts: [number, number][]
  }) => void
  updateCanalMeta: (id: string, patch: Partial<Pick<Canal, 'code' | 'name' | 'designFlow' | 'builtYear' | 'endChainage'>>) => void
  addFeature: (type: FeatureType, x: number, y: number, canalId?: string) => void
  submitCanal: (id: string) => void
  approveCanal: (id: string) => void
  rejectCanal: (id: string, start: number, end: number, reason: string, featureIds: string[]) => void
  archiveCanal: (id: string) => void
  openReview: (canalId: string) => void
  setReviewIndex: (i: number) => void
  closeReview: () => void
  setRejectOpen: (v: boolean) => void
  setCompareVersions: (v: [number | null, number | null]) => void
  togglePanel: (side: 'left' | 'right') => void
  setShowShortcuts: (v: boolean) => void
  setRasterOn: (v: boolean) => void
  bumpCamera: () => void
}

let noticeSeq = 1

function persist(data: PersistedState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ __v: 1, data }))
  } catch {
    /* ignore */
  }
}

export const LEVELS: CanalLevel[] = LEVEL_ORDER
export const TYPES: FeatureType[] = TYPE_ORDER

export const DEFAULT_FILTERS: SearchFilters = {
  keyword: '',
  level: 'all',
  canalId: 'all',
  type: 'all',
  yearFrom: '',
  yearTo: '',
  status: 'all',
}

function isEditable(status: DocStatus): boolean {
  return status !== 'archived'
}

const world0 = buildWorld()
const meta0 = buildMeta(world0)

export const useStore = create<AppState>((set, get) => ({
  world: world0,
  meta: meta0,
  layers: { ...DEFAULT_LAYERS, ...(initialPersist.layers || {}) },
  camera: initialPersist.camera || null,
  role: initialPersist.role || 'processor',
  tab: initialPersist.tab || 'map',
  selectionId: initialPersist.selectionId || null,
  selectedCanalId: null,
  hoverFeatureId: null,
  hoverCanalId: null,
  cameraRequest: null,
  filters: { ...DEFAULT_FILTERS },
  rejections: world0.rejections,
  notices: [],
  tool: 'select',
  drawPts: [],
  measurePts: [],
  editMode: true,
  rasterOn: true,
  sheets: SHEETS.map((s) => ({ ...s })),
  review: { canalId: null, index: 0, open: false, rejectOpen: false },
  compareVersions: [null, null],
  panelCollapsed: { left: false, right: false },
  showShortcuts: false,
  reviewMarks: {},

  setCamera: (x, y, k) => {
    set({ camera: { x, y, k } })
    persist({
      layers: get().layers,
      camera: { x, y, k },
      role: get().role,
      tab: get().tab,
      selectionId: get().selectionId,
    })
  },

  flyTo: (bbox, maxK) => {
    set({ cameraRequest: { bbox, token: Date.now() + Math.random(), maxK } })
  },

  bumpCamera: () => {
    // force a re-fit of the same camera request (after sheets toggle etc.)
    const cur = get().cameraRequest
    if (cur) set({ cameraRequest: { ...cur, token: Date.now() + Math.random() } })
  },

  setRole: (role) => {
    set({ role })
    persist({ ...getPersisted(get()), role })
  },

  setTab: (tab) => {
    set({ tab })
    persist({ ...getPersisted(get()), tab })
  },

  toggleLevel: (l) => {
    const layers = { ...get().layers, levels: { ...get().layers.levels, [l]: !get().layers.levels[l] } }
    set({ layers })
    persist({ ...getPersisted(get()), layers })
  },

  toggleType: (t) => {
    const layers = { ...get().layers, types: { ...get().layers.types, [t]: !get().layers.types[t] } }
    set({ layers })
    persist({ ...getPersisted(get()), layers })
  },

  setLayer: (k, v) => {
    const layers = { ...get().layers, [k]: v }
    set({ layers })
    persist({ ...getPersisted(get()), layers })
  },

  allLevels: (v) => {
    const layers = { ...get().layers, levels: { trunk: v, branch: v, lateral: v } }
    set({ layers })
    persist({ ...getPersisted(get()), layers })
  },

  allTypes: (v) => {
    const layers = {
      ...get().layers,
      types: { gate: v, weir: v, pump: v, drop: v, culvert: v },
    }
    set({ layers })
    persist({ ...getPersisted(get()), layers })
  },

  selectFeature: (id) => {
    set({ selectionId: id, compareVersions: [null, null] })
    persist({ ...getPersisted(get()), selectionId: id })
  },

  selectCanal: (id) => {
    set({ selectedCanalId: id })
    if (id) {
      const meta = get().meta
      const fs = meta.byCanal.get(id) || []
      if (fs.length) {
        const xs = fs.map((f) => f.x)
        const ys = fs.map((f) => f.y)
        get().flyTo(
          [Math.min(...xs) - 40, Math.min(...ys) - 40, Math.max(...xs) + 40, Math.max(...ys) + 40],
          3.2,
        )
      }
    }
  },

  setHover: (featureId, canalId) => {
    set({ hoverFeatureId: featureId, hoverCanalId: canalId ?? get().hoverCanalId })
  },

  addSheet: (sheet) => {
    set({ sheets: [...get().sheets, sheet], rasterOn: true })
    get().notify(`已导入扫描图：${sheet.name}`, 'ok')
  },

  updateSheet: (id, patch) => {
    set({ sheets: get().sheets.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  },

  removeSheet: (id) => {
    const target = get().sheets.find((s) => s.id === id)
    set({ sheets: get().sheets.filter((s) => s.id !== id) })
    if (target) get().notify(`已移除扫描图：${target.name}`, 'warn')
  },

  bringSheetToFront: (id) => {
    const list = get().sheets
    const target = list.find((s) => s.id === id)
    if (!target) return
    set({ sheets: [...list.filter((s) => s.id !== id), target] })
  },

  setTool: (tool) => {
    set({ tool, drawPts: [], measurePts: [] })
  },

  pushDrawPoint: (p) => set({ drawPts: [...get().drawPts, p] }),
  clearDraw: () => set({ drawPts: [], measurePts: [] }),
  setMeasure: (pts) => set({ measurePts: pts }),
  setEditMode: (v) => set({ editMode: v }),

  setFilters: (f) => set({ filters: { ...get().filters, ...f } }),
  resetFilters: () => set({ filters: { ...DEFAULT_FILTERS } }),

  notify: (text, tone = 'info') => {
    const id = noticeSeq++
    set({ notices: [...get().notices.slice(-3), { id, text, tone }] })
    setTimeout(() => {
      set({ notices: get().notices.filter((n) => n.id !== id) })
    }, tone === 'error' ? 5200 : 3400)
  },

  dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),

  moveFeature: (id, x, y) => {
    const { world, meta, role } = get()
    const f = meta.featureById.get(id)
    if (!f) return
    if (!isEditable(f.status)) {
      get().notify('已归档档案不可修改，请先申请解冻', 'error')
      return
    }
    if (role === 'reviewer') {
      get().notify('审核员只能核对，不能修改要素位置', 'error')
      return
    }
    const canal = meta.canalById.get(f.canalId)
    let chainage = f.chainage
    if (canal) {
      const hit = nearestOnPolyline(canal.pts, x, y)
      if (hit) chainage = Math.round(hit.chainage)
    }
    const moved = Math.hypot((x - f.x) * 4, (y - f.y) * 4)
    if (moved < 0.5) return
    // 位置调整同样留痕：生成新版本，旧位置可在版本叠加中比对
    const rev: FeatureRevision = {
      version: f.version + 1,
      date: new Date().toISOString().slice(0, 10),
      author: role === 'archivist' ? '档案员' : '加工员',
      note: `按底图校核移动 ${moved.toFixed(1)} m（桩号 ${f.chainage} → ${chainage} m）`,
      x,
      y,
      chainage,
      props: { ...f.props },
    }
    const updated: Feature = {
      ...f,
      x,
      y,
      chainage,
      version: f.version + 1,
      revisions: [...f.revisions, rev],
      status: f.status === 'approved' ? 'draft' : f.status,
      processed: true,
      updatedAt: rev.date,
    }
    const features = world.features.map((it) => (it.id === id ? updated : it))
    set({
      world: { ...world, features },
      meta: { ...meta, featureById: new Map(features.map((it) => [it.id, it])) },
    })
  },

  updateFeatureProps: (id, props, note) => {
    const { world, meta, role } = get()
    const f = meta.featureById.get(id)
    if (!f) return
    if (!isEditable(f.status)) {
      get().notify('已归档档案不可修改', 'error')
      return
    }
    if (role === 'reviewer') {
      get().notify('审核员无加工权限', 'error')
      return
    }
    const merged = { ...f.props, ...props }
    const rev: FeatureRevision = {
      version: f.version + 1,
      date: new Date().toISOString().slice(0, 10),
      author: role === 'archivist' ? '档案员' : '加工员',
      note: note || '修正属性',
      x: f.x,
      y: f.y,
      chainage: f.chainage,
      props: merged,
    }
    const updated: Feature = {
      ...f,
      props: merged,
      version: f.version + 1,
      revisions: [...f.revisions, rev],
      status: f.status === 'approved' ? 'draft' : f.status,
      processed: true,
      updatedAt: rev.date,
    }
    const features = world.features.map((it) => (it.id === id ? updated : it))
    set({
      world: { ...world, features },
      meta: { ...meta, featureById: new Map(features.map((it) => [it.id, it])) },
    })
    get().notify('属性已更新，生成新版本 v' + updated.version, 'ok')
  },

  createCanal: (input) => {
    const { world, meta, role } = get()
    if (role === 'reviewer') {
      get().notify('审核员无建档权限', 'error')
      return
    }
    const pts = input.pts
    const len = polylinePts(pts)
    if (len < 8) {
      get().notify('渠道至少需要两个相距 30 m 以上的节点', 'error')
      return
    }
    const canal: Canal = {
      id: uid('c'),
      code: input.code,
      name: input.name,
      level: input.level,
      parentId: input.parentId,
      startChainage: input.startChainage,
      endChainage: input.endChainage,
      designFlow: input.designFlow,
      builtYear: input.builtYear,
      status: 'draft',
      version: 1,
      length: input.endChainage - input.startChainage,
      pts,
      d: pathOf(pts),
      bbox: bboxOf(pts),
    }
    const canals = [...world.canals, canal]
    const byParent = new Map(meta.byParent)
    const pk = canal.parentId || '__root'
    byParent.set(pk, [...(byParent.get(pk) || []), canal])
    const canalById = new Map(meta.canalById)
    canalById.set(canal.id, canal)
    set({
      world: { ...world, canals },
      meta: { ...meta, byParent, canalById },
      selectedCanalId: canal.id,
      tool: 'select',
      drawPts: [],
    })
    get().notify(`已建档：${canal.code} ${canal.name}，桩号 ${input.startChainage}～${input.endChainage}`, 'ok')
  },

  updateCanalMeta: (id, patch) => {
    const { world, meta } = get()
    const c = meta.canalById.get(id)
    if (!c) return
    if (!isEditable(c.status)) {
      get().notify('已归档渠道不可修改', 'error')
      return
    }
    const updated = { ...c, ...patch }
    if (patch.endChainage !== undefined) {
      updated.length = Math.max(0, patch.endChainage - c.startChainage)
    }
    const canals = world.canals.map((it) => (it.id === id ? updated : it))
    const canalById = new Map(meta.canalById)
    canalById.set(id, updated)
    set({ world: { ...world, canals }, meta: { ...meta, canalById } })
  },

  addFeature: (type, x, y, canalId) => {
    const { world, meta, role } = get()
    if (role === 'reviewer') {
      get().notify('审核员无加工权限', 'error')
      return
    }
    // find nearest canal of the matching selection if omitted
    let canal = canalId ? meta.canalById.get(canalId) : undefined
    if (!canal) {
      let best: { c: Canal; d: number } | null = null
      for (const c of world.canals) {
        const hit = nearestOnPolyline(c.pts, x, y)
        if (hit && (!best || hit.dist < best.d)) best = { c, d: hit.dist }
      }
      canal = best?.c
    }
    if (!canal) {
      get().notify('未找到可挂接的渠段，请先建档', 'error')
      return
    }
    if (!isEditable(canal.status)) {
      get().notify('已归档渠道不可新增要素', 'error')
      return
    }
    const hit = nearestOnPolyline(canal.pts, x, y)
    const chainage = hit ? Math.round(hit.chainage) : 0
    const seq = world.features.filter((f) => f.canalId === canal!.id && f.type === type).length + 1
    const props: Record<string, string | number> = {}
    const feature: Feature = {
      id: uid('f'),
      code: `${canal.code}-${type}-${String(seq).padStart(3, '0')}`,
      shortCode: `NEW-${String(seq).padStart(3, '0')}`,
      name: `${canal.name} 新增要素`,
      type,
      canalId: canal.id,
      level: canal.level,
      x,
      y,
      chainage,
      status: 'draft',
      processed: true,
      version: 1,
      builtYear: canal.builtYear,
      props,
      revisions: [
        {
          version: 1,
          date: new Date().toISOString().slice(0, 10),
          author: '加工员',
          note: '按扫描图矢量化新增',
          x,
          y,
          chainage,
          props,
        },
      ],
      updatedAt: new Date().toISOString().slice(0, 10),
    }
    const features = [...world.features, feature]
    const byCanal = new Map(meta.byCanal)
    byCanal.set(canal.id, [...(byCanal.get(canal.id) || []), feature].sort((a, b) => a.chainage - b.chainage))
    const featureById = new Map(meta.featureById)
    featureById.set(feature.id, feature)
    set({
      world: { ...world, features },
      meta: { ...meta, index: buildMeta({ ...world, features }).index, byCanal, featureById },
      selectionId: feature.id,
      tool: 'select',
    })
    get().notify(`已在 ${canal.code} ${canal.name} 桩号 ${chainage} m 处新增要素`, 'ok')
  },

  submitCanal: (id) => {
    const { world, meta } = get()
    const c = meta.canalById.get(id)
    if (!c) return
    if (c.status === 'archived') {
      get().notify('已归档渠道不能重复提交', 'error')
      return
    }
    const canals = world.canals.map((it) => (it.id === id ? { ...it, status: 'submitted' as DocStatus } : it))
    const features = world.features.map((f) =>
      f.canalId === id && f.status === 'draft' ? { ...f, status: 'submitted' as DocStatus } : f,
    )
    set({
      world: { ...world, canals, features },
      meta: rebuildMeta(meta, { canals, features }),
    })
    get().notify(`${c.code} 已提交审核（${meta.byCanal.get(id)?.length || 0} 个要素）`, 'ok')
  },

  approveCanal: (id) => {
    const { world, meta, role } = get()
    const c = meta.canalById.get(id)
    if (!c) return
    if (role !== 'reviewer') {
      get().notify('只有审核员可以执行审核通过', 'error')
      return
    }
    if (c.status !== 'submitted' && c.status !== 'rejected') {
      get().notify('该渠道当前状态不可审核通过', 'error')
      return
    }
    const fs = meta.byCanal.get(id) || []
    const marked = new Set(get().reviewMarks[id] || [])
    const unverified = fs.filter((f) => !marked.has(f.id))
    if (unverified.length > 0) {
      get().notify(`尚有 ${unverified.length} 条要素未核对，请逐条核对后再通过`, 'error')
      return
    }
    const canals = world.canals.map((it) => (it.id === id ? { ...it, status: 'approved' as DocStatus } : it))
    const features = world.features.map((f) =>
      f.canalId === id ? { ...f, status: 'approved' as DocStatus, processed: true } : f,
    )
    set({
      world: { ...world, canals, features },
      meta: rebuildMeta(meta, { canals, features }),
      rejections: get().rejections.filter((r) => r.canalId !== id),
      reviewMarks: { ...get().reviewMarks, [id]: [] },
    })
    get().notify(`${c.code} 审核通过，可导出`, 'ok')
  },

  rejectCanal: (id, start, end, reason, featureIds) => {
    const { world, meta, role } = get()
    const c = meta.canalById.get(id)
    if (!c) return
    if (role !== 'reviewer') {
      get().notify('只有审核员可以退回', 'error')
      return
    }
    if (!reason.trim()) {
      get().notify('退回必须写明原因与桩号段', 'error')
      return
    }
    const canals = world.canals.map((it) => (it.id === id ? { ...it, status: 'rejected' as DocStatus } : it))
    const features = world.features.map((f) =>
      f.canalId === id && f.chainage >= start && f.chainage <= end
        ? { ...f, status: 'rejected' as DocStatus }
        : f,
    )
    const rej: Rejection = {
      id: uid('rej'),
      canalId: id,
      startChainage: start,
      endChainage: end,
      reason,
      reviewer: '审核员',
      date: new Date().toISOString().slice(0, 10),
      featureIds,
    }
    set({
      world: { ...world, canals, features },
      meta: rebuildMeta(meta, { canals, features }),
      rejections: [...get().rejections.filter((r) => r.canalId !== id), rej],
      reviewMarks: { ...get().reviewMarks, [id]: [] },
    })
    get().notify(`已退回 ${c.code}，桩号 ${start}～${end} m 段`, 'warn')
  },

  archiveCanal: (id) => {
    const { world, meta, role } = get()
    const c = meta.canalById.get(id)
    if (!c) return
    if (role !== 'reviewer' && role !== 'archivist') {
      get().notify('无归档权限', 'error')
      return
    }
    if (c.status !== 'approved') {
      get().notify('仅审核通过的档案可以归档', 'error')
      return
    }
    const canals = world.canals.map((it) => (it.id === id ? { ...it, status: 'archived' as DocStatus, version: it.version + 1 } : it))
    const features = world.features.map((f) => (f.canalId === id ? { ...f, status: 'archived' as DocStatus } : f))
    set({
      world: { ...world, canals, features },
      meta: rebuildMeta(meta, { canals, features }),
    })
    get().notify(`${c.code} 已归档冻结，不可再修改`, 'ok')
  },

  openReview: (canalId) => {
    let target: string | null = canalId
    if (!target) {
      const submitted = get().world.canals.filter((c) => c.status === 'submitted' || c.status === 'rejected')
      target = submitted[0]?.id || null
    }
    set({ review: { canalId: target, index: 0, open: true, rejectOpen: false }, tab: 'review' })
    persist({ ...getPersisted(get()), tab: 'review' })
  },

  setReviewIndex: (i) => set({ review: { ...get().review, index: Math.max(0, i) } }),
  closeReview: () => set({ review: { ...get().review, open: false } }),
  setRejectOpen: (v) => set({ review: { ...get().review, rejectOpen: v } }),

  toggleReviewMark: (canalId, featureId, ok) => {
    const cur = get().reviewMarks[canalId] || []
    const next = ok
      ? Array.from(new Set([...cur, featureId]))
      : cur.filter((id) => id !== featureId)
    set({ reviewMarks: { ...get().reviewMarks, [canalId]: next } })
  },

  clearReviewMarks: (canalId) => {
    const marks = { ...get().reviewMarks }
    delete marks[canalId]
    set({ reviewMarks: marks })
  },

  setCompareVersions: (v) => set({ compareVersions: v }),

  togglePanel: (side) => {
    const panelCollapsed = { ...get().panelCollapsed, [side]: !get().panelCollapsed[side] }
    set({ panelCollapsed })
  },

  setShowShortcuts: (v) => set({ showShortcuts: v }),
  setRasterOn: (v) => set({ rasterOn: v }),
}))

function polylinePts(pts: [number, number][]): number {
  let t = 0
  for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return t * 4
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}

function getPersisted(s: AppState): PersistedState {
  return {
    layers: s.layers,
    camera: s.camera,
    role: s.role,
    tab: s.tab,
    selectionId: s.selectionId,
  }
}

function rebuildMeta(
  meta: WorldMeta,
  next: { canals: Canal[]; features: Feature[] },
): WorldMeta {
  const byCanal = new Map<string, Feature[]>()
  for (const f of next.features) {
    let arr = byCanal.get(f.canalId)
    if (!arr) {
      arr = []
      byCanal.set(f.canalId, arr)
    }
    arr.push(f)
  }
  for (const arr of byCanal.values()) arr.sort((a, b) => a.chainage - b.chainage)
  const canalById = new Map(next.canals.map((c) => [c.id, c]))
  return {
    ...meta,
    byCanal,
    canalById,
    featureById: new Map(next.features.map((f) => [f.id, f])),
  }
}
