// ============ 枚举展示映射 ============
import type { DraftStatus, KeyframeType, Role } from '@/types'

export const ROLE_LABEL: Record<Role, string> = {
  planner: '表演策划',
  pilot: '现场飞手',
  admin: '运营后台'
}

export const STATUS_LABEL: Record<DraftStatus, string> = {
  in_progress: '在制中',
  submitted: '待审核',
  returned: '已退回',
  approved: '已通过',
  completed: '已完成'
}

export const STATUS_TYPE: Record<DraftStatus, 'info' | 'warning' | 'danger' | 'success' | 'primary'> = {
  in_progress: 'info',
  submitted: 'warning',
  returned: 'danger',
  approved: 'success',
  completed: 'primary'
}

export const KEYFRAME_LABEL: Record<KeyframeType, string> = {
  takeoff: '起飞',
  transform: '队形变换',
  land: '散开降落'
}

export const KEYFRAME_COLOR: Record<KeyframeType, string> = {
  takeoff: '#2fce7d',
  transform: '#4c8dff',
  land: '#ffb020'
}

export const AIRSPACE_STAGE_LABEL: Record<string, string> = {
  not_started: '未申报',
  drafted: '材料准备中',
  submitted: '已提交',
  reviewing: '审批中',
  approved: '已批复',
  rejected: '被驳回'
}

export const AIRSPACE_STAGE_TYPE: Record<string, 'info' | 'warning' | 'danger' | 'success' | 'primary'> = {
  not_started: 'info',
  drafted: 'warning',
  submitted: 'primary',
  reviewing: 'warning',
  approved: 'success',
  rejected: 'danger'
}

export const ANOMALY_TYPE_LABEL: Record<string, string> = {
  comm_lost: '通信中断',
  low_battery: '低电量',
  gps_drift: 'GPS/RTK 漂移',
  light_fault: '灯光故障',
  position_deviation: '位置偏差',
  other: '其他'
}

export const VERSION_ACTION_LABEL: Record<string, string> = {
  submit: '策划提交',
  return: '审核退回',
  approve: '审核通过',
  execute: '确认执行',
  complete: '执行回执'
}

export function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
