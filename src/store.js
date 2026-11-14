// 全局数据仓库：项目、房间、任务、版本、审核、交付；localStorage 持久化
import { reactive, watch } from 'vue'
import { createModel, serialize, deserialize, setVoxel } from './voxel/model.js'

const KEY = 'voxel-homestay-studio-v1'

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function offset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return fmt(d)
}
export function today() { return fmt(new Date()) }
export function daysLeft(deadline) {
  return Math.ceil((new Date(deadline + 'T23:59:59') - new Date()) / 86400000)
}

// ---- 演示体素：夯土墙 + 门窗 + 坡屋顶；variant 用于制造版本差异 ----
function demoHouse(variant = 1) {
  const m = createModel()
  const [nx, , nz] = m.dims
  // 地面石板
  for (let x = 2; x < nx - 2; x++) for (let z = 2; z < nz - 2; z++) setVoxel(m, x, 0, z, 4)
  // 四面夯土墙（原木骨架 + 白墙）
  for (let y = 1; y <= 5; y++) {
    for (let x = 4; x < nx - 4; x++) {
      setVoxel(m, x, y, 4, y === 1 || y === 5 ? 1 : 2)
      setVoxel(m, x, y, nz - 5, y === 1 || y === 5 ? 1 : 2)
    }
    for (let z = 4; z < nz - 4; z++) {
      setVoxel(m, 4, y, z, y === 1 || y === 5 ? 1 : 2)
      setVoxel(m, nx - 5, y, z, y === 1 || y === 5 ? 1 : 2)
    }
  }
  // 门（南墙中央开洞）
  for (let y = 1; y <= 3; y++) for (let x = 11; x <= 12; x++) setVoxel(m, x, y, nz - 5, 0)
  // 窗（东西墙玻璃，variant 2 改位置并加宽）
  const wy = variant === 1 ? [3] : [2, 3]
  const wz = variant === 1 ? [9, 10] : [8, 9, 10, 11]
  for (const y of wy) for (const z of wz) {
    setVoxel(m, 4, y, z, 5)
    setVoxel(m, nx - 5, y, z, 5)
  }
  // 坡屋顶（青瓦）
  for (let y = 6; y <= 9; y++) {
    const inset = y - 6
    for (let x = 3 + inset; x < nx - 3 - inset; x++)
      for (let z = 3; z < nz - 3; z++) setVoxel(m, x, y, z, 3)
  }
  // variant 2：室内加一道竹编隔断
  if (variant === 2) for (let y = 1; y <= 4; y++) for (let z = 8; z <= 15; z++) setVoxel(m, 14, y, z, 6)
  return m
}

function seed() {
  const s = {
    role: 'worker', user: '阿木', users: ['阿木', '小黎', '老周'],
    seq: 100, projects: [], rooms: [], tasks: [], versions: [], deliveries: [], clipboard: null
  }
  const p1 = { id: 'p1', name: '云溪山居民宿改造', client: '陈先生', houseType: '夯土院落', area: 320, budget: 860000, deadline: offset(25), purpose: '精品民宿客房与公区', createdAt: offset(-12) }
  const p2 = { id: 'p2', name: '雾岭观景木屋', client: '林女士', houseType: '山地木屋', area: 180, budget: 520000, deadline: offset(-3), purpose: '观景度假屋', createdAt: offset(-30) }
  s.projects.push(p1, p2)
  s.rooms.push(
    { id: 'r1', projectId: 'p1', name: '大堂' },
    { id: 'r2', projectId: 'p1', name: '客房A·山景' },
    { id: 'r3', projectId: 'p1', name: '露台茶室' },
    { id: 'r4', projectId: 'p2', name: '主卧' }
  )
  const v1 = { id: 'v1', roomId: 'r1', taskId: 't1', kind: 'room', n: 1, author: '阿木', createdAt: offset(-8), note: '初稿：夯土墙+坡屋顶', status: 'approved', faceCount: 0, data: serialize(demoHouse(1)), review: { scale: true, door: true, corridor: true, budget: true, pass: true, comment: '比例协调，通过', by: '主管', at: offset(-7) } }
  const v2 = { id: 'v2', roomId: 'r1', taskId: 't1', kind: 'room', n: 2, author: '阿木', createdAt: offset(-2), note: '改窗位，加竹编隔断', status: 'pending', faceCount: 0, data: serialize(demoHouse(2)), review: null }
  s.versions.push(v1, v2)
  s.tasks.push(
    { id: 't1', projectId: 'p1', roomId: 'r1', kind: 'room', title: '大堂·空间建模', assignee: '阿木', status: 'review', reworkCount: 1, createdAt: offset(-10), submittedAt: offset(-2), approvedAt: null, versionId: 'v2' },
    { id: 't2', projectId: 'p1', roomId: 'r2', kind: 'room', title: '客房A·空间建模', assignee: null, status: 'open', reworkCount: 0, createdAt: offset(-10), submittedAt: null, approvedAt: null, versionId: null },
    { id: 't3', projectId: 'p1', roomId: 'r1', kind: 'shot', title: '大堂·入口视角镜头', assignee: null, status: 'open', reworkCount: 0, createdAt: offset(-9), submittedAt: null, approvedAt: null, versionId: null },
    { id: 't4', projectId: 'p1', roomId: 'r3', kind: 'room', title: '露台茶室·空间建模', assignee: '小黎', status: 'doing', reworkCount: 0, createdAt: offset(-8), submittedAt: null, approvedAt: null, versionId: null },
    { id: 't5', projectId: 'p2', roomId: 'r4', kind: 'room', title: '主卧·空间建模', assignee: '老周', status: 'doing', reworkCount: 2, createdAt: offset(-25), submittedAt: null, approvedAt: null, versionId: null }
  )
  return s
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export const state = reactive(load() || seed())
watch(state, s => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 超容量时静默 */ } }, { deep: true })

function nid(prefix) { return prefix + (state.seq++) }

export const store = {
  state,
  daysLeft,
  today,

  setRole(role) { state.role = role },
  setUser(u) { state.user = u },

  // ---- 项目 ----
  createProject({ name, client, houseType, area, budget, deadline, purpose, roomNames }) {
    const p = { id: nid('p'), name, client, houseType, area: +area, budget: +budget, deadline, purpose, createdAt: today() }
    state.projects.push(p)
    for (const rn of roomNames.split(/[,，、]/).map(s => s.trim()).filter(Boolean)) {
      const room = { id: nid('r'), projectId: p.id, name: rn }
      state.rooms.push(room)
      state.tasks.push({ id: nid('t'), projectId: p.id, roomId: room.id, kind: 'room', title: `${rn}·空间建模`, assignee: null, status: 'open', reworkCount: 0, createdAt: today(), submittedAt: null, approvedAt: null, versionId: null })
    }
    return p
  },
  addRoom(projectId, name) {
    const room = { id: nid('r'), projectId, name }
    state.rooms.push(room)
    state.tasks.push({ id: nid('t'), projectId, roomId: room.id, kind: 'room', title: `${name}·空间建模`, assignee: null, status: 'open', reworkCount: 0, createdAt: today(), submittedAt: null, approvedAt: null, versionId: null })
    return room
  },
  addShotTask(projectId, roomId, title) {
    state.tasks.push({ id: nid('t'), projectId, roomId, kind: 'shot', title, assignee: null, status: 'open', reworkCount: 0, createdAt: today(), submittedAt: null, approvedAt: null, versionId: null })
  },
  project(id) { return state.projects.find(p => p.id === id) },
  roomsOf(projectId) { return state.rooms.filter(r => r.projectId === projectId) },
  room(id) { return state.rooms.find(r => r.id === id) },
  tasksOf(projectId) { return state.tasks.filter(t => t.projectId === projectId) },
  task(id) { return state.tasks.find(t => t.id === id) },

  projectProgress(projectId) {
    const ts = this.tasksOf(projectId)
    const done = ts.filter(t => t.status === 'approved').length
    return { done, total: ts.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 }
  },
  isOverdue(p) { return daysLeft(p.deadline) < 0 && this.projectProgress(p.id).pct < 100 },
  canDeliver(projectId) {
    const ts = this.tasksOf(projectId)
    return ts.length > 0 && ts.every(t => t.status === 'approved')
  },

  // ---- 任务 ----
  claimTask(taskId) {
    const t = this.task(taskId)
    if (!t || t.status !== 'open') return
    t.assignee = state.user
    t.status = 'doing'
  },
  openTasks() { return state.tasks.filter(t => t.status === 'open') },
  myTasks() { return state.tasks.filter(t => t.assignee === state.user && t.status !== 'approved') },

  // ---- 版本 ----
  versionsOf(roomId, kind = 'room') {
    return state.versions.filter(v => v.roomId === roomId && v.kind === kind).sort((a, b) => b.n - a.n)
  },
  version(id) { return state.versions.find(v => v.id === id) },
  latestVersion(roomId) { return this.versionsOf(roomId)[0] || null },
  latestApproved(roomId) {
    return state.versions.filter(v => v.roomId === roomId && v.kind === 'room' && v.status === 'approved').sort((a, b) => b.n - a.n)[0] || null
  },
  modelOfVersion(v) { return v && v.data ? deserialize(v.data) : null },

  // 编辑任务的初始模型：房间任务取该房间最新版本续作；镜头任务取最新通过版做底
  modelForTask(task) {
    if (task.kind === 'shot') {
      const base = this.latestApproved(task.roomId) || this.latestVersion(task.roomId)
      return base ? this.modelOfVersion(base) : createModel()
    }
    const latest = this.latestVersion(task.roomId)
    return latest ? this.modelOfVersion(latest) : createModel()
  },

  // 提交审核：保存版本快照，任务进入待审核
  submitVersion(taskId, { data, note, faceCount, camera }) {
    const t = this.task(taskId)
    if (!t) return null
    const kind = t.kind === 'shot' ? 'shot' : 'room'
    const n = state.versions.filter(v => v.roomId === t.roomId && v.kind === kind).length + 1
    const v = {
      id: nid('v'), roomId: t.roomId, taskId, kind, n, author: state.user,
      createdAt: today(), note: note || '', status: 'pending', faceCount: faceCount || 0,
      data: data || null, camera: camera || null, review: null
    }
    state.versions.push(v)
    t.versionId = v.id
    t.status = 'review'
    t.submittedAt = today()
    return v
  },

  // 主管审核：四项核对全过才算通过；打回记返工
  reviewTask(taskId, checks, pass, comment) {
    const t = this.task(taskId)
    if (!t || t.status !== 'review') return
    const v = this.version(t.versionId)
    const review = { ...checks, pass, comment: comment || '', by: '主管', at: today() }
    if (v) { v.review = review; v.status = pass ? 'approved' : 'rejected' }
    if (pass) {
      t.status = 'approved'
      t.approvedAt = today()
    } else {
      t.status = 'doing'
      t.reworkCount++
    }
  },
  pendingReviews() { return state.tasks.filter(t => t.status === 'review') },

  // ---- 交付 ----
  deliver(projectId) {
    if (!this.canDeliver(projectId)) return null
    const items = this.tasksOf(projectId).map(t => {
      const v = this.version(t.versionId)
      return { taskId: t.id, roomId: t.roomId, kind: t.kind, versionId: t.versionId, n: v ? v.n : 0, faceCount: v ? v.faceCount : 0 }
    })
    const d = { id: nid('d'), projectId, at: today(), items }
    state.deliveries.push(d)
    return d
  },
  deliveriesOf(projectId) { return state.deliveries.filter(d => d.projectId === projectId) },

  // ---- 剪贴板（跨房间粘贴）----
  setClipboard(clip) { state.clipboard = clip },

  // ---- 工作台统计 ----
  workerStats() {
    return state.users.map(u => {
      const mine = state.tasks.filter(t => t.assignee === u)
      const inHand = mine.filter(t => t.status === 'doing' || t.status === 'review').length
      const worked = mine.filter(t => t.reworkCount > 0 || t.status !== 'open')
      const avgRework = worked.length ? (mine.reduce((s, t) => s + t.reworkCount, 0) / Math.max(1, worked.length)).toFixed(2) : '0.00'
      const approved = mine.filter(t => t.status === 'approved')
      const onTime = approved.filter(t => {
        const p = this.project(t.projectId)
        return p && t.approvedAt && t.approvedAt <= p.deadline
      }).length
      const onTimeRate = approved.length ? Math.round((onTime / approved.length) * 100) + '%' : '—'
      return { user: u, inHand, avgRework, onTimeRate, approved: approved.length }
    })
  }
}
