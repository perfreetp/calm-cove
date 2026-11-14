// localStorage 持久化仓库:院区、方案、版本、批注
import { uid, VOXEL_TYPES } from './constants.js'

const KEY = 'tcm_voxel_pharmacy_v1'
const ROLE_KEY = 'tcm_current_role'

function seed() {
  const campuses = [
    { id: 'cp_aa', name: '杏林总院' },
    { id: 'cp_bb', name: '东院区' },
    { id: 'cp_cc', name: '南院区' }
  ]
  const now = Date.now()
  const projects = [
    makeProject(campuses[0].id, '总院一层中药房', 'draft', now - 86400000 * 3, [
      // 一个带版本的样例方案
    ]),
    makeProject(campuses[0].id, '总院二层颗粒剂药房', 'reviewing', now - 86400000 * 2),
    makeProject(campuses[1].id, '东院中药房改造', 'rework', now - 86400000 * 5),
    makeProject(campuses[2].id, '南院新建中药房', 'approved', now - 86400000 * 8),
    makeProject(campuses[2].id, '南院急诊药房', 'delivered', now - 86400000 * 12)
  ]
  // 给东院返工方案造两个版本与批注,便于演示历史/对比
  const p = projects[2]
  const v1 = makeVersion(p, 'V1.0', now - 86400000 * 4, '张药师', seedVoxels(0))
  v1.annotations = [
    makeAnno(v1, { gx: 3, gy: 4, gz: 0 }, 'distance',
      '该处药斗离调剂台实测 2.6m,超过 2 米限值,请调整。', '李药师长', now - 86400000 * 3.6),
    makeAnno(v1, { gx: 14, gy: 9, gz: 0 }, 'gold',
      '黄芪为常用药,当前药位不在黄金区,建议前移。', '李药师长', now - 86400000 * 3.5)
  ]
  v1.annotations[0].thread.push({
    role: 'builder', who: '王工长', at: now - 86400000 * 3.2,
    action: 'kept', text: '该处受立柱限制无法移位,保留,拟在中间增设调剂台缩短动线。'
  })
  v1.annotations[0].status = 'kept'
  const v2 = makeVersion(p, 'V1.1', now - 86400000 * 2, '张药师', seedVoxels(1))
  v2.basedOn = v1.id
  p.currentVersionId = v2.id
  p.versions = [v2, v1]
  p.updatedAt = now - 86400000 * 2
  return { campuses, projects, currentRole: 'pharmacist' }
}

function makeProject(campusId, name, status, createdAt, versions) {
  const id = uid('pj')
  const proj = {
    id, campusId, name, status,
    gridW: 20, gridD: 14,
    currentVersionId: null,
    versions: versions || [],
    createdAt, updatedAt: createdAt,
    creator: '张药师'
  }
  if (!versions || !versions.length) {
    const v = makeVersion(proj, 'V1.0', createdAt, '张药师', [])
    proj.versions = [v]
    proj.currentVersionId = v.id
  }
  return proj
}

function seedVoxels(variant) {
  // 生成一圈药斗柜 + 中间调剂台/称量/复核的演示布局
  const list = []
  let n = 0
  const push = (x, y, z, type, extra = {}) => {
    const t = VOXEL_TYPES[type]
    list.push({
      id: 'vx_seed' + (n++), x, y, z, type,
      cells: t.hasCells ? (type === 'poison_cab' ? 16 : 60) : null,
      capacity: t.hasCells ? (type === 'poison_cab' ? 0.5 : 2) : null,
      commonSlot: false, herbName: null,
      ...extra
    })
  }
  // 后墙药斗柜(两层高)
  for (let x = 2; x <= 16; x++) {
    push(x, 1, 0, 'herb_cab', { commonSlot: [4, 5, 8, 11].includes(x), herbName: [4, 5, 8, 11].includes(x) ? ['黄芪', '当归', '党参', '白术'][ [4,5,8,11].indexOf(x) ] : null })
    push(x, 1, 1, 'herb_cab')
  }
  // 左侧柜
  for (let y = 2; y <= 10; y++) {
    push(2, y, 0, 'herb_cab')
    push(2, y, 1, 'herb_cab')
  }
  // 右侧毒麻药柜(独立着色)
  for (let y = 2; y <= 5; y++) push(16, y, 0, 'poison_cab')
  // 调剂台、称量区、复核台
  for (let x = 7; x <= 10; x++) push(x, 6, 0, 'bench')
  push(11, 6, 0, 'scale')
  push(12, 6, 0, 'scale')
  for (let x = 13; x <= 14; x++) push(x, 6, 0, 'review')
  if (variant === 1) {
    // V1.1:在中间补一个调剂台(响应距离批注),并把黄芪移到黄金区
    push(8, 4, 0, 'bench')
    const hq = list.find(v => v.herbName === '黄芪')
    if (hq) { hq.x = 9; hq.y = 5; hq.commonSlot = true }
  }
  return list
}

export function makeVersion(project, ver, at, operator, voxels) {
  return {
    id: uid('ver'),
    version: ver,
    basedOn: null,
    projectId: project.id,
    at,
    operator,
    note: '',
    voxels: voxels || [],
    annotations: [],
    mergeStats: null
  }
}

export function makeAnno(version, point, kind, text, who, at) {
  return {
    id: uid('an'),
    gx: point.gx, gy: point.gy, gz: point.gz || 0,
    kind, // distance | gold | other
    text,
    who,
    at,
    status: 'open', // open | closed | kept
    thread: []
  }
}

let db = null

function load() {
  if (db) return db
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) { db = JSON.parse(raw); return db }
  } catch (e) { /* fallthrough */ }
  db = seed()
  save()
  return db
}

export function save() {
  localStorage.setItem(KEY, JSON.stringify(db))
}

export function resetAll() {
  db = seed()
  save()
}

export function getState() { return load() }

export function getCampuses() { return load().campuses }

export function listProjects() {
  return [...load().projects].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function getProject(id) {
  return load().projects.find(p => p.id === id)
}

export function currentVersion(project) {
  if (!project || !project.versions || !project.versions.length) return { voxels: [], annotations: [] }
  return project.versions.find(v => v.id === project.currentVersionId) || project.versions[0]
}

export function addProject(campusId, name) {
  const p = makeProject(campusId, name, 'draft', Date.now())
  load().projects.unshift(p)
  save()
  return p
}

export function updateProject(project) {
  const idx = load().projects.findIndex(p => p.id === project.id)
  if (idx >= 0) {
    load().projects[idx] = project
    project.updatedAt = Date.now()
    save()
  }
}

export function deleteProject(id) {
  const s = load()
  s.projects = s.projects.filter(p => p.id !== id)
  save()
}

// 提交新版本:深拷贝当前工作版本的体素,生成递增版本号
export function submitVersion(project, voxels, note, operator, mergeStats) {
  const cur = currentVersion(project)
  const nums = project.versions.map(v => {
    const m = /V(\d+)\.(\d+)/.exec(v.version)
    return m ? [+m[1], +m[2]] : [1, 0]
  })
  let major = 1, minor = 0
  if (nums.length) {
    major = Math.max(...nums.map(n => n[0]))
    const sameMajor = nums.filter(n => n[0] === major).map(n => n[1])
    minor = Math.max(...sameMajor) + 1
  }
  const nv = makeVersion(project, `V${major}.${minor}`, Date.now(), operator,
    JSON.parse(JSON.stringify(voxels)))
  nv.basedOn = cur ? cur.id : null
  nv.note = note || ''
  nv.mergeStats = mergeStats || null
  project.versions.unshift(nv)
  project.currentVersionId = nv.id
  project.status = 'reviewing'
  updateProject(project)
  return nv
}

export function setRole(role) {
  load().currentRole = role
  localStorage.setItem(ROLE_KEY, role)
  save()
}

export function getRole() {
  return localStorage.getItem(ROLE_KEY) || load().currentRole || 'pharmacist'
}

export function annotate(project, versionId, anno) {
  const v = getProject(project.id).versions.find(x => x.id === versionId)
  v.annotations.push(anno)
  project.status = 'rework'
  updateProject(project)
}

export function replyAnno(project, versionId, annoId, reply) {
  const v = getProject(project.id).versions.find(x => x.id === versionId)
  const a = v.annotations.find(x => x.id === annoId)
  a.thread.push(reply)
  if (reply.action === 'fixed') a.status = 'closed'
  if (reply.action === 'kept') a.status = 'kept'
  updateProject(project)
}

export function openCount(version) {
  return version.annotations.filter(a => a.status === 'open').length
}

export function approve(project) {
  project.status = 'approved'
  updateProject(project)
}

export function deliver(project) {
  project.status = 'delivered'
  updateProject(project)
}

// ---------- 看板统计 ----------
export function dashboardStats() {
  const s = load()
  const rows = s.campuses.map(c => {
    const ps = s.projects.filter(p => p.campusId === c.id)
    const pending = ps.filter(p => ['reviewing', 'rework'].includes(p.status)).length
    // 平均返工次数 = 每个方案(版本数-1)的均值
    const reworks = ps.length
      ? ps.reduce((sum, p) => sum + Math.max(0, p.versions.length - 1), 0) / ps.length
      : 0
    // 常用药位覆盖率:已设置常用药名的药斗 / 标记为常用药位的药斗
    let marked = 0, named = 0
    ps.forEach(p => {
      const v = currentVersion(p)
      v.voxels.forEach(vx => {
        if (vx.commonSlot) { marked++; if (vx.herbName) named++ }
      })
    })
    return {
      campus: c.name,
      total: ps.length,
      pending,
      avgRework: reworks.toFixed(1),
      coverage: marked ? Math.round(named / marked * 100) : 0
    }
  })
  const totalPending = rows.reduce((a, r) => a + r.pending, 0)
  const allP = s.projects
  const globalRework = allP.length
    ? (allP.reduce((sum, p) => sum + Math.max(0, p.versions.length - 1), 0) / allP.length).toFixed(1)
    : '0.0'
  let tm = 0, tn = 0
  allP.forEach(p => currentVersion(p).voxels.forEach(vx => {
    if (vx.commonSlot) { tm++; if (vx.herbName) tn++ }
  }))
  return {
    rows,
    totalPending,
    globalRework,
    globalCoverage: tm ? Math.round(tn / tm * 100) : 0
  }
}
