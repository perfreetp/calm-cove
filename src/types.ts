// 核心数据模型定义

export type Role = 'teacher' | 'student';

/** 提交评分状态 */
export type SubmissionStatus = 'pending' | 'reviewing' | 'returned' | 'completed';

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: '待提交',
  reviewing: '待复核',
  returned: '已退回',
  completed: '已完成',
};

/** 关键帧缓动方式 */
export type EasingType = 'linear' | 'easeInOut' | 'bezier';

/** 控制点类型:骨骼旋转 / 规范指标(进针角度、按压力度等) */
export type TrackKind = 'bone' | 'metric';

export interface Keyframe {
  id: string;
  time: number; // 秒
  track: string; // boneId 或 metricId
  kind: TrackKind;
  value: number; // 骨骼:局部旋转角度;指标:指标数值
  easing: EasingType;
  /** 自定义贝塞尔控制点 [x1,y1,x2,y2],仅 easing === 'bezier' 时使用 */
  bezier?: [number, number, number, number];
}

export interface BoneDef {
  id: string;
  name: string;
  parentId: string | null;
  /** 骨骼局部原点(相对父关节),根骨骼为相对画布坐标 */
  x: number;
  y: number;
  /** 静息局部角度(度,0=向右,顺时针为正) */
  restAngle: number;
  minAngle: number;
  maxAngle: number;
  length: number;
}

/** 拆件(分层图片) */
export interface PartDef {
  id: string;
  name: string;
  /** 内置程序生成贴图的 key;自定义导入时为 null */
  builtin: string | null;
  /** 导入图片的 dataURL(自定义拆件) */
  src: string | null;
  width: number;
  height: number;
  /** 图片内"关节锚点"的像素位置,绑骨后该点对齐骨骼原点 */
  pivotX: number;
  pivotY: number;
  /** 绑定的骨骼 id,未绑骨为 null */
  boneId: string | null;
  zOrder: number;
}

/** 规范指标定义 */
export interface MetricDef {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  description: string;
}

/** 动作节点(质控科老师布置的流程节点) */
export interface ActionNodeDef {
  id: string;
  name: string;
  order: number;
  minDuration: number; // 秒
  maxDuration: number | null;
  /** 该节点必须出现的指标(区间判定) */
  metrics: string[];
  /** 规范说明,用于课件展示与评语 */
  specText: string;
}

/** 动画工程文档(学员编辑器产出物) */
export interface AnimationDoc {
  bones: BoneDef[];
  parts: PartDef[];
  keyframes: Keyframe[];
  duration: number; // 时间轴总时长(秒)
  /** 各动作节点在时间轴上的起止时间 */
  nodeRanges: Record<string, { start: number; end: number }>;
  updatedAt: number;
}

/** 违规区间 */
export interface Violation {
  id: string;
  nodeId: string;
  type: 'duration' | 'metric' | 'joint' | 'order' | 'coverage';
  message: string;
  start: number;
  end: number;
}

/** 单动作节点的自动评分明细 */
export interface NodeScoreDetail {
  nodeId: string;
  score: number;
  durationScore: number;
  metricScore: number;
  jointScore: number;
  violations: Violation[];
}

export interface AutoScoreResult {
  total: number;
  nodeScores: NodeScoreDetail[];
  violations: Violation[];
}

/** 老师逐段复核结果 */
export interface ReviewNodeResult {
  nodeId: string;
  teacherScore: number | null; // null 表示沿用自动分
  comment: string;
  qualified: boolean;
}

export interface SubmissionRecord {
  id: string;
  studentId: string;
  assignmentId: string;
  status: SubmissionStatus;
  doc: AnimationDoc;
  autoScore: AutoScoreResult | null;
  finalScore: number | null;
  review: ReviewNodeResult[];
  generalComment: string;
  submittedAt: number | null;
  reviewedAt: number | null;
  /** 退回次数 */
  revision: number;
}

export interface Assignment {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
  /** 关联的标准课件 id */
  coursewareId: string;
  createdAt: number;
  deadline: number | null;
}

export interface Courseware {
  id: string;
  name: string;
  description: string;
  doc: AnimationDoc;
  builtin: boolean;
  createdAt: number;
}

export interface Student {
  id: string;
  name: string;
  no: string;
  group: string;
}

/** 导出 PNG 序列帧的配置 */
export interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  start: number;
  end: number;
  includeNeedle: boolean;
}
