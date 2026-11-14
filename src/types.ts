export type Role = 'fitter' | 'reviewer' | 'admin';

export type OrderStatus =
  | 'pending_model'
  | 'pending_review'
  | 'returned'
  | 'ordered'
  | 'delivered';

export interface Store {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  phone: string;
  manager: string;
  openedAt: string;
  active: boolean;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  storeId: string;
  email: string;
  phone: string;
  active: boolean;
  joinedAt: string;
  title: string;
}

export interface Material {
  id: string;
  name: string;
  code: string;
  spec: string;
  hardness: string;
  color: string;
  leadDays: number;
  stock: number;
  minStock: number;
  unitPrice: number;
  active: boolean;
}

import type { ControlPoint } from './lib/geom';
export type { ControlPoint };

export interface VersionMetrics {
  curvatureMax: number;
  curvatureP95: number;
  curvatureMean: number;
  overRatio: number;
  wallMin: number;
  wallMax: number;
}

export interface PlanVersion {
  id: string;
  orderId: string;
  seq: number;
  createdAt: string;
  authorId: string;
  controlPoints: ControlPoint[];
  wallThickness: number;
  adaptive: boolean;
  threshold: number;
  metrics: VersionMetrics;
  note: string;
}

export interface OrderEvent {
  id: string;
  at: string;
  actorId: string;
  type:
    | 'created'
    | 'submitted'
    | 'approved'
    | 'returned'
    | 'ordered'
    | 'delivered';
  label: string;
  note?: string;
}

export interface ReturnRecord {
  id: string;
  at: string;
  reviewerId: string;
  reason: string;
  versionSeq: number;
}

export interface Order {
  id: string;
  code: string;
  patient: string;
  ear: 'left' | 'right';
  storeId: string;
  fitterId: string;
  materialId: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  dueAt: string;
  currentVersionId: string;
  versions: PlanVersion[];
  events: OrderEvent[];
  returns: ReturnRecord[];
  notes: string;
}

export interface DB {
  stores: Store[];
  users: User[];
  materials: Material[];
  orders: Order[];
  settings: {
    threshold: number;
    currentUserId: string;
    seededAt: string;
  };
  meta: {
    orderSerial: number;
  };
}

export const STATUS_META: Record<
  OrderStatus,
  { label: string; short: string; tone: string }
> = {
  pending_model: { label: '待建模', short: '待建模', tone: 'slate' },
  pending_review: { label: '待审核', short: '待审核', tone: 'amber' },
  returned: { label: '已退回', short: '已退回', tone: 'red' },
  ordered: { label: '已下单', short: '已下单', tone: 'teal' },
  delivered: { label: '已交付', short: '已交付', tone: 'green' },
};

export const ROLE_LABEL: Record<Role, string> = {
  fitter: '验配师',
  reviewer: '审核员',
  admin: '管理员',
};

export const THICKNESS_LEVELS = [0.8, 1.2, 1.6, 2.0] as const;

export const THICKNESS_META: Record<
  number,
  { name: string; desc: string }
> = {
  0.8: { name: '超薄', desc: '深耳道 · 低应力' },
  1.2: { name: '标准', desc: '通用适配 · 推荐' },
  1.6: { name: '加强', desc: '宽耳道 · 抗变形' },
  2.0: { name: '高应力', desc: '咬合紧 · 长佩戴' },
};

export const RETURN_REASONS_INTERNAL = [
  '耳甲腔第二转折处曲率峰值超限（K ＞ 阈值 15% 以上），应力集中风险高，请降低隆起并复核壁厚档位。',
  '下料图泄压孔偏离耳道轴线超过 2mm，请重新定位泄压孔后再提交。',
  '耳屏处控制点外扩过度，贴合边无法保证 2.0mm 密封止口，请回缩至 0.6mm 以内。',
  '患者耳道狭小，0.8mm 壁厚不满足强度要求，请改用 1.2mm 及以上档位。',
  '耳道末端走向与扫描点云偏差过大，请使用原始点云重新拟合后再提交。',
  '下料图展开宽度与耳甲腔周长不符，请核对本版本控制点是否已完整保存。',
];
