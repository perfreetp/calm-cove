// 全局状态：工程数据 + 版本/审片流转 + 统计，localStorage 持久化
import { reactive, computed } from 'vue'
import { buildDemoParts, buildDemoRig, buildDemoLoops } from './engine/demoCharacter.js'
import { sortKeys } from './engine/curves.js'

const LS_KEY = 'traffic-anchor-studio-v1'

function deepClone(o) {
  return JSON.parse(JSON.stringify(o))
}

function seedState() {
  const parts = buildDemoParts()
  const bones = buildDemoRig()
  const loopTracks = buildDemoLoops()
  // 演示关键帧：右手挥手 + 头部微动
  const tracks = {
    handR: {
      rotation: [
        { frame: 0, value: -20, interp: 'ease' },
        { frame: 20, value: 35, interp: 'bezier', hx1: 8, hy1: -20, hx2: 12, hy2: 35 },
        { frame: 40, value: -20, interp: 'ease' },
        { frame: 60, value: 35, interp: 'linear' },
        { frame: 80, value: -20, interp: 'ease' }
      ]
    },
    foreArmR: {
      rotation: [
        { frame: 0, value: -30, interp: 'ease' },
        { frame: 40, value: -70, interp: 'ease' },
        { frame: 80, value: -30, interp: 'ease' }
      ]
    },
    head: {
      rotation: [
        { frame: 0, value: 0, interp: 'ease' },
        { frame: 50, value: 8, interp: 'ease' },
        { frame: 100, value: -5, interp: 'ease' },
        { frame: 150, value: 0, interp: 'ease' }
      ]
    },
    root: {
      y: [
        { frame: 0, value: 520, interp: 'linear' },
        { frame: 150, value: 520, interp: 'linear' }
      ]
    }
  }
  const lipTrack = [
    { frame: 10, phoneme: 'A' }, { frame: 16, phoneme: 'O' }, { frame: 22, phoneme: 'I' },
    { frame: 28, phoneme: 'A' }, { frame: 36, phoneme: 'U' }, { frame: 44, phoneme: 'E' },
    { frame: 52, phoneme: 'sil' }, { frame: 60, phoneme: 'A' }, { frame: 68, phoneme: 'I' },
    { frame: 76, phoneme: 'sil' }
  ]
  const meta = { template: '早高峰路况', character: '主播·小畅', fps: 25, duration: 150 }
  const versions = [
    {
      n: 1,
      submittedAt: '2026-11-10T09:30:00.000Z',
      status: 'resolved',
      snapshot: deepClone({ bones, tracks, loopTracks, lipTrack, meta }),
      annotations: [
        { id: 'a1', frame: 22, boneId: 'handR', x: 700, y: 300, text: '第22帧右手腕旋转角度穿模，超出关节限制', status: 'fixed', reply: '已改：收敛手腕旋转至限制范围内', reviewer: '王审', at: '2026-11-10T14:00:00.000Z' },
        { id: 'a2', frame: 55, boneId: 'mouth', x: 620, y: 330, text: '第55帧口型应为闭口 sil，当前张着嘴', status: 'fixed', reply: '已改：口型关键帧前移4帧对齐', reviewer: '王审', at: '2026-11-10T14:05:00.000Z' }
      ]
    },
    {
      n: 2,
      submittedAt: '2026-11-12T10:00:00.000Z',
      status: 'reviewing',
      snapshot: deepClone({ bones, tracks, loopTracks, lipTrack, meta }),
      annotations: [
        { id: 'a3', frame: 40, boneId: 'foreArmR', x: 730, y: 380, text: '第40帧右前臂抬起太快，缓入缓出不自然', status: 'open', reply: '', reviewer: '王审', at: '2026-11-12T16:20:00.000Z' }
      ]
    }
  ]
  return { meta, parts, bones, tracks, loopTracks, lipTrack, versions }
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) { /* 损坏则重建 */ }
  return seedState()
}

const saved = loadState()

export const store = reactive({
  meta: saved.meta,
  parts: saved.parts, // {id,name,w,h,ax,ay,src}，canvas 运行时挂载
  bones: saved.bones,
  tracks: saved.tracks,
  loopTracks: saved.loopTracks,
  lipTrack: saved.lipTrack,
  versions: saved.versions,
  // UI 状态
  ui: {
    mode: 'animate', // rig=摆骨骼/绑父子 | animate=摆姿势打关键帧
    selectedBoneId: 'handR',
    currentFrame: 0,
    selectedKey: null, // {boneId, prop, frame}
    showBones: true,
    playing: false,
    rightTab: 'review',
    compareA: 1,
    compareB: 2,
    compareFrame: 40,
    filter: { template: '', character: '', from: '', to: '' },
    exportProgress: null
  }
})

// ---- 部件图像（主线程渲染用） ----
const partCanvases = {}
export function partImageMap() {
  for (const p of store.parts) {
    if (!partCanvases[p.id]) {
      const img = new Image()
      img.src = p.src
      partCanvases[p.id] = { img, ax: p.ax, ay: p.ay, w: p.w, h: p.h }
    }
  }
  return partCanvases
}

export function getBone(id) {
  return store.bones.find((b) => b.id === id)
}

// ---- 关键帧操作 ----
export function getTrack(boneId, prop, create = false) {
  if (!store.tracks[boneId] && create) store.tracks[boneId] = {}
  const bt = store.tracks[boneId]
  if (!bt) return null
  if (!bt[prop] && create) bt[prop] = []
  return bt[prop] || null
}

export function setKey(boneId, prop, frame, value, interp = 'ease') {
  const keys = getTrack(boneId, prop, true)
  const exist = keys.find((k) => k.frame === frame)
  if (exist) exist.value = value
  else keys.push({ frame, value, interp })
  store.tracks[boneId][prop] = sortKeys(keys)
}

export function removeKey(boneId, prop, frame) {
  const keys = getTrack(boneId, prop)
  if (!keys) return
  const i = keys.findIndex((k) => k.frame === frame)
  if (i >= 0) keys.splice(i, 1)
}

// ---- 版本与审片 ----
export const latestVersion = computed(() =>
  store.versions.length ? store.versions[store.versions.length - 1] : null
)

export const canSubmit = computed(() => {
  const v = latestVersion.value
  if (!v) return true
  return v.annotations.every((a) => a.status !== 'open')
})

export function submitVersion() {
  if (!canSubmit.value) return false
  const n = store.versions.length + 1
  store.versions.push({
    n,
    submittedAt: new Date().toISOString(),
    status: 'reviewing',
    snapshot: deepClone({
      bones: store.bones,
      tracks: store.tracks,
      loopTracks: store.loopTracks,
      lipTrack: store.lipTrack,
      meta: store.meta
    }),
    annotations: []
  })
  save()
  return true
}

export function addAnnotation({ frame, boneId, x, y, text }) {
  const v = latestVersion.value
  if (!v) return null
  const a = {
    id: 'a' + Math.random().toString(36).slice(2, 8),
    frame, boneId, x, y, text,
    status: 'open', reply: '',
    reviewer: '审核人',
    at: new Date().toISOString()
  }
  v.annotations.push(a)
  save()
  return a
}

export function replyAnnotation(versionN, annoId, status, reply) {
  const v = store.versions.find((x) => x.n === versionN)
  const a = v && v.annotations.find((x) => x.id === annoId)
  if (!a) return
  a.status = status // fixed | rejected
  a.reply = reply
  if (v.annotations.every((x) => x.status !== 'open')) v.status = 'resolved'
  save()
}

export function approveVersion(versionN) {
  const v = store.versions.find((x) => x.n === versionN)
  if (v) { v.status = 'approved'; save() }
}

// ---- 统计 ----
export const filteredVersions = computed(() => {
  const f = store.ui.filter
  return store.versions.filter((v) => {
    if (f.template && v.snapshot.meta.template !== f.template) return false
    if (f.character && v.snapshot.meta.character !== f.character) return false
    const t = new Date(v.submittedAt).getTime()
    if (f.from && t < new Date(f.from).getTime()) return false
    if (f.to && t > new Date(f.to).getTime() + 86400000) return false
    return true
  })
})

export const stats = computed(() => {
  const vs = filteredVersions.value
  const total = vs.length
  const firstPass = vs.filter((v) => v.annotations.length === 0).length
  // 返工轮次：每个审核周期（到 approved 或当前最新为止）内的版本数 - 1
  let cycles = 0
  let reworkTotal = 0
  let cycleLen = 0
  for (const v of vs) {
    cycleLen++
    if (v.status === 'approved') {
      cycles++
      reworkTotal += cycleLen - 1
      cycleLen = 0
    }
  }
  if (cycleLen > 0) { cycles++; reworkTotal += cycleLen - 1 } // 进行中的周期也计入
  return {
    total,
    firstPass,
    firstPassRate: total ? ((firstPass / total) * 100).toFixed(1) : '—',
    avgRework: cycles ? (reworkTotal / cycles).toFixed(2) : '—',
    openAnnotations: vs.reduce((s, v) => s + v.annotations.filter((a) => a.status === 'open').length, 0)
  }
})

// ---- 持久化 ----
let timer = null
export function save() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    const data = {
      meta: store.meta,
      parts: store.parts,
      bones: store.bones,
      tracks: store.tracks,
      loopTracks: store.loopTracks,
      lipTrack: store.lipTrack,
      versions: store.versions
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch (e) { /* 超限时静默 */ }
  }, 300)
}

export function resetAll() {
  localStorage.removeItem(LS_KEY)
  location.reload()
}
