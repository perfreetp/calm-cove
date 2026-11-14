// 全局领域模型类型定义

export type Role = 'designer' | 'judge';

export type DistanceClass = 'short' | 'medium' | 'long';
export type Difficulty = 1 | 2 | 3 | 4;
export type ElementType = 'vertical' | 'oxer' | 'wall' | 'tripleBar';
export type VersionStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export type ConflictType = 'stride' | 'crossing' | 'landing';

export interface Vec2 {
  x: number; // 米,场地长轴
  y: number; // 米,场地短轴
}

export interface FieldDims {
  length: number; // 长 (m)
  width: number; // 宽 (m)
}

export interface GenParams {
  seed: string;
  field: FieldDims;
  obstacleCount: number;
  distanceClass: DistanceClass; // 关联距离档位
  difficulty: Difficulty; // 难度等级 1-4
}

/** 障碍元素:单障碍或组合障碍中的一道 */
export interface ObstacleElement {
  id: string; // e1, e2 ...
  kind: ElementType;
  height: number; // 高度 m
  spread: number; // 宽度(纵深) m
}

export interface Obstacle {
  id: string; // o1, o2 ...
  /** 显示编号(单障碍为 "3",组合为 "4A/4B") */
  number: string;
  groupId: string; // 组合障碍共享同一 groupId
  position: Vec2; // 中心点
  angle: number; // 朝向角(弧度),马匹接近方向 = angle
  width: number; // 障碍横向宽度 m
  elements: ObstacleElement[];
  manual: boolean; // 设计师是否手动挪动过
}

/** 起步/终点线 */
export interface GateLine {
  kind: 'start' | 'finish';
  a: Vec2;
  b: Vec2;
}

/** 回转弧线(两道障碍之间的路径片段) */
export interface ArcSegment {
  from: Vec2;
  to: Vec2;
  /** 圆弧控制点:null 表示直线,否则为圆心+半径+起止角 */
  circle: { cx: number; cy: number; r: number; a0: number; a1: number } | null;
  length: number; // 弧长/直线长 m
}

/** 步距标注 */
export interface StrideMark {
  fromObstacle: string;
  toObstacle: string;
  distance: number; // 障碍之间的实际距离 m(落地后到起跳)
  strides: number; // 步数(关联障碍才有)
  related: boolean; // 是否关联(可计步)
}

export interface Conflict {
  id: string;
  type: ConflictType;
  obstacleIds: string[];
  message: string;
  at: Vec2; // 标注位置
}

export interface RouteCourse {
  params: GenParams;
  obstacles: Obstacle[];
  path: Vec2[]; // 完整行进线(用于渲染与长度计算)
  arcs: ArcSegment[];
  gates: GateLine[];
  strides: StrideMark[];
  conflicts: Conflict[];
  /** 预计行进总长 m、允许时间 s、速度 m/min */
  totalLength: number;
  speed: number;
  allowedTime: number;
  createdAt: number;
}

export interface RouteVersion {
  id: string;
  eventId: string;
  versionNo: number;
  label: string;
  status: VersionStatus;
  course: RouteCourse;
  submittedAt: number | null;
  reviewedAt: number | null;
  reviewReason: string;
  createdAt: number;
}

export interface EventRecord {
  id: string;
  code: string; // 建档编号
  level: string; // 级别
  date: string; // YYYY-MM-DD
  judges: string; // 裁判
  designer: string; // 路线设计师
  field: FieldDims;
  createdAt: number;
}

export interface SessionState {
  role: Role;
  currentEventId: string | null;
}
