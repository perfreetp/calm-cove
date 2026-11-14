// ============ 领域模型类型定义 ============

export type Role = 'planner' | 'pilot' | 'admin'
export type DraftStatus =
  | 'in_progress' // 在制（策划工位）
  | 'submitted' // 已提交，待审
  | 'returned' // 被退回，策划继续改
  | 'approved' // 已通过，可执行
  | 'completed' // 演出已完成
export type KeyframeType = 'takeoff' | 'transform' | 'land'
export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'custom'

export interface User {
  id: string
  username: string
  password: string
  name: string
  role: Role
}

export interface Customer {
  id: string
  name: string
  contact: string
  phone: string
  createdAt: string
}

export interface Order {
  id: string
  orderNo: string
  customerId: string
  title: string
  droneCount: number
  showDate: string // 计划演出日期
  venue: string
  budget: number
  status: 'negotiating' | 'confirmed' | 'closed' | 'cancelled'
  remark: string
  createdAt: string
}

export interface Project {
  id: string
  projectNo: string
  orderId: string
  title: string
  plannerId: string // 责任策划
  droneCount: number
  showDate: string
  deadline: string // 交稿截止日期（用于统计延期稿）
  status: DraftStatus
  venue: string
  createdAt: string
}

export interface AirspaceFiling {
  id: string
  projectId: string
  stage:
    | 'not_started' // 未申报
    | 'drafted' // 材料准备中
    | 'submitted' // 已提交
    | 'reviewing' // 审批中
    | 'approved' // 已批复
    | 'rejected' // 被驳回
  applyNo: string
  airspace: string
  ceilingM: number // 限高（米）
  submittedAt: string
  updatedAt: string
  note: string
}

// ---- 编队几何 ----
export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface SkeletonNode {
  id: string
  position: Vec3
  /** 绑定到该骨节点的无人机编号（一架无人机在一个编队里最多绑一个节点） */
  droneId: string | null
  /** 是否为骨架边连接点（非点云点，如手画路径/图形锚点） */
  anchor?: boolean
}

export interface Formation {
  id: string
  name: string
  nodes: SkeletonNode[]
  /** 骨架边（手画图形用），节点 id 对 */
  edges: [string, string][]
}

export interface Keyframe {
  id: string
  timeSec: number
  type: KeyframeType
  formationId: string
  note: string
}

export interface MotionSegment {
  id: string
  /** 起始关键帧 id */
  fromKeyframeId: string
  toKeyframeId: string
  easing: EasingType
  /** 自定义贝塞尔曲线三次控制点（0..1 归一化），easing=custom 时生效 */
  cubicBezier: [Vec2, Vec2]
  durationSec: number
}

export interface Vec2 {
  x: number
  y: number
}

export interface SafetyLimits {
  maxSpeed: number // m/s
  maxAccel: number // m/s²
}

export interface ShowScript {
  id: string
  projectId: string
  name: string
  droneCount: number
  limits: SafetyLimits
  formations: Formation[]
  keyframes: Keyframe[]
  segments: MotionSegment[]
  /** 无人机灯光颜色（编号 -> hex） */
  droneColors: Record<string, string>
}

export interface VersionRecord {
  id: string
  projectId: string
  version: number
  action:
    | 'submit' // 策划提交
    | 'return' // 客户/主管退回
    | 'approve' // 审核通过
    | 'execute' // 现场确认执行
    | 'complete' // 演出结束回执
  operatorId: string
  operatorName: string
  at: string
  comment: string
  /** 退回原因（action=return 时必填，来自下拉） */
  returnReason?: string
  /** 退回方身份 */
  returnBy?: 'customer' | 'supervisor'
  snapshot: ShowScript | null
}

export interface Schedule {
  id: string
  projectId: string
  showDate: string // YYYY-MM-DD
  startAt: string // HH:mm
  endAt: string
  venue: string
  pilotId: string
  status: 'scheduled' | 'confirmed' | 'executing' | 'done' | 'aborted'
}

export interface Rehearsal {
  id: string
  projectId: string
  at: string
  location: string
  pilotId: string
  droneCount: number
  durationMin: number
  issues: string
  result: 'pass' | 'issues' | 'fail'
}

export interface ExecutionReceipt {
  id: string
  projectId: string
  scheduleId: string
  startedAt: string
  endedAt: string
  sorties: number // 编队架次（实际起飞无人机数）
  flightMinutes: number // 用机时长
  anomalyCount: number
  operatorId: string
  summary: string
}

export interface AnomalyReport {
  id: string
  projectId: string
  scheduleId: string
  pilotId: string
  droneId: string
  at: string
  type: 'comm_lost' | 'low_battery' | 'gps_drift' | 'light_fault' | 'position_deviation' | 'other'
  detail: string
  level: 'warn' | 'serious'
  handled: boolean
}
