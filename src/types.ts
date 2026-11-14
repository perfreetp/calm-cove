// ============ 灯光与平面 ============
export type FixtureKind = 'ceiling' | 'task' | 'wallwash';

export interface Fixture {
  id: string;
  name: string;
  kind: FixtureKind;
  x: number;          // 平面坐标，单位 m
  y: number;
  height: number;     // 安装/发光高度 m（离地）
  flux: number;       // 光通量 lm
  cct: number;        // 色温 K
  beam: number;       // 光束角 度（全角）
  on: boolean;
  aim?: { x: number; y: number }; // 洗墙灯指向点
}

export interface Obstacle {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowStrip {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type ZoneKind = 'qc' | 'aisle' | 'work';

export interface Zone {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: ZoneKind;
  threshold: number;  // 达标照度 lux
}

export interface LightingPlan {
  id: string;
  name: string;
  fixtures: Fixture[];
  qcStationId?: string; // 关联质检台
  updatedAt: string;
}

// ============ Worker 通信 ============
export interface ComputeRequest {
  type: 'compute';
  reqId: number;
  width: number;
  height: number;
  scale: number;         // px per meter
  fixtures: Fixture[];
  obstacles: Obstacle[];
  windows: WindowStrip[];
  hour: number;          // 8..20
}

export interface ZoneStat {
  zoneId: string;
  name: string;
  kind: ZoneKind;
  avgLux: number;
  maxLux: number;
  minLux: number;
  compliance: number;    // 0..1 达标像素比例
  threshold: number;
  dark: boolean;         // 整体是否按规则判暗
}

export interface DarkArea {
  zoneId: string;
  name: string;
  kind: ZoneKind;
  avgLux: number;
  threshold: number;
}

export interface ComputeResult {
  type: 'result';
  reqId: number;
  bitmap: ImageBitmap;
  lux: Float32Array;     // 逐像素 lux（可 transfer）
  width: number;
  height: number;
  zones: ZoneStat[];
  darkAreas: DarkArea[];
  daylightLux: number;
}

// ============ 工单 ============
export type LinenCategory = '床单' | '被套' | '枕套' | '毛巾' | '浴巾' | '台布' | '工服';
export type StainType = '血渍' | '油渍' | '茶渍' | '食物' | '霉斑' | '一般';
export type OrderStatus =
  | 'pending'        // 待分派
  | 'assigned'       // 已分派待洗
  | 'washing'        // 洗涤中
  | 'submitted'      // 已提交待质检
  | 'qc_passed'      // 质检合格
  | 'rejected'       // 打回返洗
  | 'done';          // 返洗后完成

export interface LinenItem {
  category: LinenCategory;
  count: number;
  stain: StainType;
}

export interface WashRecord {
  waterTemp: number;     // 水温 ℃
  duration: number;      // 时长 min
  detergentMl: number;   // 洗涤剂用量 ml
  photoDataUrl: string; // 拍照（压缩后 dataURL）
  submittedAt: string;
}

export interface RewashRecord {
  reason: string;
  at: string;
}

export interface WorkOrder {
  id: string;
  hotelName: string;
  items: LinenItem[];
  pickupTime: string;
  status: OrderStatus;
  zoneId?: string;
  shift?: ShiftId;
  workerId?: string;
  wash?: WashRecord;
  qcSampled: boolean;
  qcPlanId?: string;      // 质检时关联的布光方案（质检台）
  rewashes: RewashRecord[];
  createdAt: string;
  updatedAt: string;
}

export type ShiftId = 'day' | 'evening';

export interface Worker {
  id: string;
  name: string;
  zoneId: string;
  shift: ShiftId;
}

// ============ 看板 ============
export interface WorkerKpi {
  workerId: string;
  name: string;
  completed: number;
  rewashed: number;
  rewashRate: number;
}
