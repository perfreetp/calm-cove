// ============ 种子数据 ============
import type {
  AnomalyReport,
  AirspaceFiling,
  Customer,
  ExecutionReceipt,
  Formation,
  Keyframe,
  MotionSegment,
  Order,
  Project,
  Rehearsal,
  Schedule,
  ShowScript,
  User,
  VersionRecord
} from '@/types'

/** 系统当天日期（动态，保证飞手「当天排期」始终有数据） */
export const TODAY = new Date().toISOString().slice(0, 10)

export const seedUsers: User[] = [
  { id: 'u_admin', username: 'admin', password: '123456', name: '运营主管·周岚', role: 'admin' },
  { id: 'u_p1', username: 'planner1', password: '123456', name: '策划·林策', role: 'planner' },
  { id: 'u_p2', username: 'planner2', password: '123456', name: '策划·陈编', role: 'planner' },
  { id: 'u_pilot1', username: 'pilot1', password: '123456', name: '飞手·高飞', role: 'pilot' },
  { id: 'u_pilot2', username: 'pilot2', password: '123456', name: '飞手·宋航', role: 'pilot' },
  { id: 'u_pilot3', username: 'pilot3', password: '123456', name: '飞手·韩翼', role: 'pilot' }
]

export const seedCustomers: Customer[] = [
  { id: 'c1', name: '星河文旅集团', contact: '王经理', phone: '13800001111', createdAt: '2026-10-02T09:00:00' },
  { id: 'c2', name: '海昌城市广场', contact: '李总', phone: '13800002222', createdAt: '2026-10-10T09:00:00' },
  { id: 'c3', name: '云栖科技年会组委会', contact: '赵主任', phone: '13800003333', createdAt: '2026-10-20T09:00:00' }
]

export const seedOrders: Order[] = [
  {
    id: 'o1', orderNo: 'ORD-20261008-01', customerId: 'c1', title: '星河跨年无人机灯光秀',
    droneCount: 100, showDate: '2026-12-31', venue: '滨江公园上空', budget: 480000,
    status: 'confirmed', remark: '客户要求呈现「星河」与企业 LOGO', createdAt: '2026-10-08T10:00:00'
  },
  {
    id: 'o2', orderNo: 'ORD-20261015-02', customerId: 'c2', title: '海昌广场开业庆典编队',
    droneCount: 60, showDate: TODAY, venue: '海昌城市广场南广场', budget: 220000,
    status: 'confirmed', remark: '开业当天 20:00 表演', createdAt: '2026-10-15T14:00:00'
  },
  {
    id: 'o3', orderNo: 'ORD-20261101-03', customerId: 'c3', title: '云栖科技年会品牌秀',
    droneCount: 80, showDate: '2026-11-20', venue: '云栖国际会展中心', budget: 350000,
    status: 'confirmed', remark: '需呈现「AI」字样与翅膀图形', createdAt: '2026-11-01T11:00:00'
  },
  {
    id: 'o4', orderNo: 'ORD-20261105-04', customerId: 'c1', title: '星河文旅元宵预热秀',
    droneCount: 50, showDate: '2027-02-20', venue: '滨江公园上空', budget: 180000,
    status: 'negotiating', remark: '意向单，尚未签约', createdAt: '2026-11-05T16:00:00'
  }
]

export const seedProjects: Project[] = [
  {
    id: 'p1', projectNo: 'PRJ-001', orderId: 'o1', title: '星河跨年无人机灯光秀',
    plannerId: 'u_p1', droneCount: 100, showDate: '2026-12-31', deadline: '2026-12-20',
    status: 'in_progress', venue: '滨江公园上空', createdAt: '2026-10-09T09:00:00'
  },
  {
    id: 'p2', projectNo: 'PRJ-002', orderId: 'o2', title: '海昌广场开业庆典编队',
    plannerId: 'u_p1', droneCount: 60, showDate: TODAY, deadline: '2026-11-10',
    status: 'approved', venue: '海昌城市广场南广场', createdAt: '2026-10-16T09:00:00'
  },
  {
    id: 'p3', projectNo: 'PRJ-003', orderId: 'o3', title: '云栖科技年会品牌秀',
    plannerId: 'u_p2', droneCount: 80, showDate: '2026-11-20', deadline: '2026-11-12',
    status: 'returned', venue: '云栖国际会展中心', createdAt: '2026-11-02T09:00:00'
  },
  {
    id: 'p4', projectNo: 'PRJ-004', orderId: 'o4', title: '星河文旅元宵预热秀',
    plannerId: 'u_p2', droneCount: 50, showDate: '2027-02-20', deadline: '2027-02-01',
    status: 'in_progress', venue: '滨江公园上空', createdAt: '2026-11-06T09:00:00'
  }
]

export const seedAirspace: AirspaceFiling[] = [
  {
    id: 'a1', projectId: 'p1', stage: 'reviewing', applyNo: 'AS-2026-1102',
    airspace: '滨江公园半径 500m 空域', ceilingM: 120, submittedAt: '2026-11-02T10:00:00',
    updatedAt: '2026-11-12T15:00:00', note: '民航空管处审核中'
  },
  {
    id: 'a2', projectId: 'p2', stage: 'approved', applyNo: 'AS-2026-1088',
    airspace: '海昌广场半径 300m 空域', ceilingM: 100, submittedAt: '2026-10-25T10:00:00',
    updatedAt: '2026-11-05T11:00:00', note: '已批复，允许 19:30-21:00 作业'
  },
  {
    id: 'a3', projectId: 'p3', stage: 'drafted', applyNo: '',
    airspace: '会展中心半径 400m 空域', ceilingM: 120, submittedAt: '',
    updatedAt: '2026-11-10T09:00:00', note: '材料待补充展会安保方案'
  },
  {
    id: 'a4', projectId: 'p4', stage: 'not_started', applyNo: '',
    airspace: '滨江公园半径 300m 空域', ceilingM: 100, submittedAt: '',
    updatedAt: '', note: ''
  }
]

// ---- 编队几何生成（单位：米） ----
function droneIdOf(index: number): string {
  return 'D' + String(index + 1).padStart(3, '0')
}

/** 地面矩形起飞阵列 */
export function gridFormation(id: string, name: string, cols: number, rows: number, gap: number, z = 0): Formation {
  const nodes = []
  const ox = -((cols - 1) * gap) / 2
  const oy = -((rows - 1) * gap) / 2
  let n = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      nodes.push({
        id: `${id}_n${n}`,
        position: { x: ox + c * gap, y: oy + r * gap, z },
        droneId: droneIdOf(n)
      })
      n++
    }
  }
  return { id, name, nodes, edges: [] }
}

/** 圆形环（顶部俯视图形） */
export function circleFormation(id: string, name: string, count: number, radius: number, z: number): Formation {
  const nodes = []
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2
    nodes.push({
      id: `${id}_n${i}`,
      position: { x: Math.cos(ang) * radius, y: Math.sin(ang) * radius, z },
      droneId: droneIdOf(i)
    })
  }
  return { id, name, nodes, edges: [] }
}

/** 心形（参数方程采样） */
export function heartFormation(id: string, name: string, count: number, scale: number, z: number): Formation {
  const nodes = []
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const hx = 16 * Math.pow(Math.sin(t), 3)
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    nodes.push({
      id: `${id}_n${i}`,
      position: { x: hx * scale, y: hy * scale, z },
      droneId: droneIdOf(i)
    })
  }
  return { id, name, nodes, edges: [] }
}

/** 点阵字母 A（简化位图，采样填充） */
export function letterAFormation(id: string, name: string, count: number, size: number, z: number): Formation {
  // 7x7 位图，1 为占用
  const bitmap = [
    '0001000',
    '0011100',
    '0110110',
    '0100010',
    '1100011',
    '1000001',
    '1000001'
  ]
  const pts: [number, number][] = []
  bitmap.forEach((row, r) => {
    row.split('').forEach((ch, c) => {
      if (ch === '1') pts.push([c, r])
    })
  })
  const step = size / 7
  const nodes = []
  for (let i = 0; i < count; i++) {
    const p = pts[i % pts.length]
    const layer = Math.floor(i / pts.length) // 多余点在原位上方分层
    nodes.push({
      id: `${id}_n${i}`,
      position: {
        x: (p[0] - 3) * step,
        y: (3 - p[1]) * step,
        z: z + layer * 4
      },
      droneId: droneIdOf(i)
    })
  }
  return { id, name, nodes, edges: [] }
}

function buildScript(projectId: string, count: number, pattern: 'heart' | 'circle' | 'letterA'): ShowScript {
  const ground = gridFormation('f_ground', '地面起飞阵列', Math.ceil(Math.sqrt(count)), Math.ceil(count / Math.ceil(Math.sqrt(count))), 3, 0)
  // 截断/补齐到指定架数
  ground.nodes = ground.nodes.slice(0, count)
  ground.nodes.forEach((nd, i) => (nd.droneId = droneIdOf(i)))

  const alt = pattern === 'heart'
    ? heartFormation('f_shape', '客户图形·心形', count, 3.2, 80)
    : pattern === 'letterA'
      ? letterAFormation('f_shape', '客户图形·字母A', count, 90, 80)
      : circleFormation('f_shape', '客户图形·圆环', count, 45, 80)

  const land = gridFormation('f_land', '降落阵列', Math.ceil(Math.sqrt(count)), Math.ceil(count / Math.ceil(Math.sqrt(count))), 3, 0)
  land.nodes = land.nodes.slice(0, count)
  land.nodes.forEach((nd, i) => (nd.droneId = droneIdOf(i)))

  const keyframes: Keyframe[] = [
    { id: 'k1', timeSec: 0, type: 'takeoff', formationId: ground.id, note: '起飞' },
    { id: 'k2', timeSec: 30, type: 'transform', formationId: alt.id, note: '编队成形' },
    { id: 'k3', timeSec: 70, type: 'transform', formationId: alt.id, note: '图形保持（灯光秀）' },
    { id: 'k4', timeSec: 110, type: 'land', formationId: land.id, note: '散开降落' }
  ]
  const segments: MotionSegment[] = [
    {
      id: 's1', fromKeyframeId: 'k1', toKeyframeId: 'k2', easing: 'easeInOut',
      cubicBezier: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }], durationSec: 30
    },
    {
      id: 's2', fromKeyframeId: 'k2', toKeyframeId: 'k3', easing: 'linear',
      cubicBezier: [{ x: 0, y: 0 }, { x: 1, y: 1 }], durationSec: 40
    },
    {
      id: 's3', fromKeyframeId: 'k3', toKeyframeId: 'k4', easing: 'easeOut',
      cubicBezier: [{ x: 0, y: 0 }, { x: 0.58, y: 1 }], durationSec: 40
    }
  ]
  const droneColors: Record<string, string> = {}
  for (let i = 0; i < count; i++) droneColors[droneIdOf(i)] = i % 3 === 0 ? '#ff4d6d' : i % 3 === 1 ? '#ffd60a' : '#4cc9f0'

  return {
    id: 'script_' + projectId,
    projectId,
    name: '编队表演脚本',
    droneCount: count,
    limits: { maxSpeed: 8, maxAccel: 4 },
    formations: [ground, alt, land],
    keyframes,
    segments,
    droneColors
  }
}

export const seedScripts: ShowScript[] = [
  buildScript('p1', 100, 'heart'),
  buildScript('p2', 60, 'circle'),
  buildScript('p3', 80, 'letterA')
]

export const seedSchedules: Schedule[] = [
  {
    id: 'sc1', projectId: 'p2', showDate: TODAY, startAt: '20:00', endAt: '20:30',
    venue: '海昌城市广场南广场', pilotId: 'u_pilot1', status: 'scheduled'
  },
  {
    id: 'sc2', projectId: 'p2', showDate: TODAY, startAt: '17:00', endAt: '17:40',
    venue: '海昌城市广场南广场', pilotId: 'u_pilot1', status: 'scheduled'
  }
]

export const seedRehearsals: Rehearsal[] = [
  {
    id: 'r1', projectId: 'p2', at: '2026-11-12T20:00:00', location: '海昌城市广场南广场',
    pilotId: 'u_pilot1', droneCount: 60, durationMin: 35,
    issues: 'D017 定位漂移 0.8m，已更换 RTK 模块', result: 'pass'
  },
  {
    id: 'r2', projectId: 'p1', at: '2026-11-10T21:00:00', location: '滨江公园',
    pilotId: 'u_pilot2', droneCount: 100, durationMin: 45,
    issues: '心形顶点 3 机间距偏小，建议缩放 +5%', result: 'issues'
  }
]

export const seedReceipts: ExecutionReceipt[] = [
  {
    id: 'rc1', projectId: 'p2', scheduleId: 'sc2', startedAt: TODAY + 'T17:00:00',
    endedAt: TODAY + 'T17:32:00', sorties: 60, flightMinutes: 32, anomalyCount: 1,
    operatorId: 'u_pilot1', summary: '彩排场全员起飞，1 机灯光偏色已记录'
  }
]

export const seedAnomalies: AnomalyReport[] = [
  {
    id: 'an1', projectId: 'p2', scheduleId: 'sc2', pilotId: 'u_pilot1', droneId: 'D042',
    at: TODAY + 'T17:21:00', type: 'light_fault', detail: '红灯通道偏色，亮度低于标定值 30%',
    level: 'warn', handled: true
  }
]

export const seedVersions: VersionRecord[] = [
  {
    id: 'v1', projectId: 'p2', version: 1, action: 'submit', operatorId: 'u_p1',
    operatorName: '策划·林策', at: '2026-11-06T18:00:00',
    comment: '首版提交：起飞-圆环-降落，共 110 秒', snapshot: null
  },
  {
    id: 'v2', projectId: 'p2', version: 2, action: 'return', operatorId: 'u_admin',
    operatorName: '运营主管·周岚', at: '2026-11-07T10:00:00',
    comment: '圆环保持时间不足', returnReason: '图形保持时间不满足客户要求',
    returnBy: 'supervisor', snapshot: null
  },
  {
    id: 'v3', projectId: 'p2', version: 3, action: 'submit', operatorId: 'u_p1',
    operatorName: '策划·林策', at: '2026-11-08T15:00:00',
    comment: '保持段延长至 40 秒', snapshot: null
  },
  {
    id: 'v4', projectId: 'p2', version: 4, action: 'approve', operatorId: 'u_admin',
    operatorName: '运营主管·周岚', at: '2026-11-09T09:30:00',
    comment: '审核通过，准予执行', snapshot: null
  },
  {
    id: 'v5', projectId: 'p3', version: 1, action: 'submit', operatorId: 'u_p2',
    operatorName: '策划·陈编', at: '2026-11-11T17:00:00',
    comment: '字母 A 编队首版', snapshot: null
  },
  {
    id: 'v6', projectId: 'p3', version: 2, action: 'return', operatorId: 'u_admin',
    operatorName: '运营主管·周岚', at: '2026-11-13T11:00:00',
    comment: '客户现场评审反馈', returnReason: '图形与客户品牌规范不符',
    returnBy: 'customer', snapshot: null
  }
]

export const RETURN_REASONS = [
  '图形与客户品牌规范不符',
  '图形保持时间不满足客户要求',
  '速度/加速度超限存在安全隐患',
  '无人机间距不满足安全间距',
  '空域限高与脚本高度冲突',
  '灯光配色方案未获客户确认',
  '时间轴总时长与演出档期冲突',
  '其他（需在备注说明）'
]
