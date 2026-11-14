// 全局常量与字典

export const GRID_W = 20
export const GRID_D = 14
export const LAYERS = 4
export const CELL_MM = 500 // 每格 0.5m,用于距离校核

// 体素类型 → 材质/着色。毒麻药柜与普通药斗分开着色
export const VOXEL_TYPES = {
  herb_cab: {
    label: '普通药斗柜',
    color: '#c98a4b',
    material: '实木橡木',
    category: 'cabinet',
    narcotic: false,
    hasCells: true
  },
  poison_cab: {
    label: '毒麻药柜',
    color: '#b3404a',
    material: '钢制喷塑(红)',
    category: 'cabinet',
    narcotic: true,
    hasCells: true
  },
  bench: {
    label: '调剂台',
    color: '#5b8def',
    material: '不锈钢台面',
    category: 'work',
    narcotic: false
  },
  scale: {
    label: '称量区',
    color: '#38d6a0',
    material: '防振台面',
    category: 'work',
    narcotic: false
  },
  review: {
    label: '复核台',
    color: '#9d7bff',
    material: '人造石台面',
    category: 'work',
    narcotic: false
  }
}

// 独立图层:柜体(普通/毒麻)、作业台、标注
export const LAYER_DEFS = [
  { key: 'herb_cab', label: '普通药斗层' },
  { key: 'poison_cab', label: '毒麻药柜层' },
  { key: 'work', label: '调剂作业层' },
  { key: 'annotation', label: '审片标注层' }
]

export function layerOf(type) {
  const t = VOXEL_TYPES[type]
  if (!t) return 'work'
  if (type === 'poison_cab') return 'poison_cab'
  if (type === 'herb_cab') return 'herb_cab'
  return 'work'
}

export const STATUS_LABELS = {
  draft: '草稿',
  reviewing: '审核中',
  rework: '待返工',
  approved: '审核通过',
  delivered: '施工交付'
}

export const ROLES = [
  { key: 'pharmacist', label: '药师(设计方)' },
  { key: 'chief', label: '药师长(审核方)' },
  { key: 'builder', label: '制作方' }
]

// 黄金区:平面中央 6×4 格区域(取药动线最优区)
export const GOLD_ZONE = { x0: 7, x1: 12, y0: 5, y1: 8 }

export function inGoldZone(x, y) {
  return x >= GOLD_ZONE.x0 && x <= GOLD_ZONE.x1 && y >= GOLD_ZONE.y0 && y <= GOLD_ZONE.y1
}

// 距离阈值 2m = 4 格
export const DIST_LIMIT_M = 2
export const DIST_LIMIT_CELLS = DIST_LIMIT_M / (CELL_MM / 1000)

export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}
