export type CanalLevel = 'trunk' | 'branch' | 'lateral'
export type FeatureType = 'gate' | 'weir' | 'pump' | 'drop' | 'culvert'
export type DocStatus = 'draft' | 'submitted' | 'rejected' | 'approved' | 'archived'
export type Role = 'archivist' | 'processor' | 'reviewer'

export type PropBag = Record<string, string | number>

export interface Canal {
  id: string
  code: string
  name: string
  level: CanalLevel
  parentId: string | null
  startChainage: number
  endChainage: number
  designFlow: number
  builtYear: number
  status: DocStatus
  version: number
  length: number
  pts: [number, number][]
  d: string
  bbox: [number, number, number, number]
  labelX?: number
  labelY?: number
  labelAngle?: number
}

export interface FeatureRevision {
  version: number
  date: string
  author: string
  note: string
  x: number
  y: number
  chainage: number
  props: PropBag
}

export interface Feature {
  id: string
  code: string
  shortCode: string
  name: string
  type: FeatureType
  canalId: string
  level: CanalLevel
  x: number
  y: number
  chainage: number
  status: DocStatus
  processed: boolean
  version: number
  builtYear: number
  props: PropBag
  revisions: FeatureRevision[]
  updatedAt: string
}

export interface Rejection {
  id: string
  canalId: string
  startChainage: number
  endChainage: number
  reason: string
  reviewer: string
  date: string
  featureIds: string[]
}

export interface RasterSheet {
  id: string
  name: string
  url: string
  x: number
  y: number
  w: number
  h: number
  opacity: number
}

export interface World {
  canals: Canal[]
  features: Feature[]
  rejections: Rejection[]
}

export interface Layers {
  levels: Record<CanalLevel, boolean>
  types: Record<FeatureType, boolean>
  showLabels: boolean
  showChainage: boolean
  showTerrain: boolean
  showRaster: boolean
  showRejections: boolean
  versionOverlay: boolean
}

export interface SearchFilters {
  keyword: string
  level: CanalLevel | 'all'
  canalId: string | 'all'
  type: FeatureType | 'all'
  yearFrom: string
  yearTo: string
  status: DocStatus | 'all'
}

export interface DateRange {
  from: string
  to: string
}

export const LEVEL_LABEL: Record<CanalLevel, string> = {
  trunk: '干渠',
  branch: '支渠',
  lateral: '斗渠',
}

export const LEVEL_ORDER: CanalLevel[] = ['trunk', 'branch', 'lateral']

export const LEVEL_COLOR: Record<CanalLevel, string> = {
  trunk: '#185b7a',
  branch: '#2f7f9b',
  lateral: '#699fae',
}

export const TYPE_LABEL: Record<FeatureType, string> = {
  gate: '闸门',
  weir: '量水堰',
  pump: '泵站',
  drop: '跌水',
  culvert: '涵洞',
}

export const TYPE_ORDER: FeatureType[] = ['gate', 'weir', 'pump', 'drop', 'culvert']

export const TYPE_COLOR: Record<FeatureType, string> = {
  gate: '#b76a12',
  weir: '#6d4bb5',
  pump: '#b3392f',
  drop: '#23796f',
  culvert: '#5a6672',
}

export const TYPE_PREFIX: Record<FeatureType, string> = {
  gate: '闸',
  weir: '堰',
  pump: '泵',
  drop: '跌',
  culvert: '涵',
}

export const TYPE_CODE: Record<FeatureType, string> = {
  gate: 'ZHA',
  weir: 'YAN',
  pump: 'BEN',
  drop: 'DIE',
  culvert: 'HAN',
}

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: '待加工',
  submitted: '待审核',
  rejected: '已退回',
  approved: '已通过',
  archived: '已归档',
}

export const STATUS_ORDER: DocStatus[] = ['draft', 'submitted', 'rejected', 'approved', 'archived']

export const STATUS_COLOR: Record<DocStatus, string> = {
  draft: '#8a8f94',
  submitted: '#2f6fae',
  rejected: '#bd3b32',
  approved: '#2f7d52',
  archived: '#8a6d2f',
}

export const ROLE_LABEL: Record<Role, string> = {
  archivist: '档案员',
  processor: '加工员',
  reviewer: '审核员',
}

export interface CameraRequest {
  bbox: [number, number, number, number]
  token: number
  maxK?: number
  minK?: number
}

export interface ReviewState {
  canalId: string | null
  index: number
  rejectOpen: boolean
}

export interface Notice {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'error' | 'info'
}
