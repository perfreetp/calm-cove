// 全局业务常量

export const OBJ_TYPES = {
  post: { key: 'post', name: '水泥桩', color: '#b8b3a7', desc: '截面 0.18m,桩高 1.1m' },
  mesh: { key: 'mesh', name: '网片', color: '#3f7d4e', desc: '围栏高度 1.1m,长度 3m/5m' },
  gate: { key: 'gate', name: '大门', color: '#2f6fb0', desc: '净宽 4m' },
  water: { key: 'water', name: '饮水点', color: '#1f9ed4', desc: '半径 0.6m 圆形点位' }
}

export const FENCE_TYPES = ['网围栏', '刺丝围栏', '生态围栏']

export const FENCE_HEIGHT = 1.1
export const GATE_WIDTH = 4
export const SPACING_MODES = [3, 5]
export const SPACING_TOLERANCE = 0.8

// 档案状态
export const STATUS = {
  draft: { key: 'draft', name: '待提交', cls: 'st-draft' },
  submitted: { key: 'submitted', name: '待审核', cls: 'st-submitted' },
  rejected: { key: 'rejected', name: '已退回', cls: 'st-rejected' },
  approved: { key: 'approved', name: '已通过', cls: 'st-approved' },
  archived: { key: 'archived', name: '已归档', cls: 'st-archived' }
}

export const ROLES = ['设计员', '施工组长', '监理']

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36))

export const fmtDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const dayKey = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}
