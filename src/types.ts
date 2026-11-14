// ---------- 领域类型定义 ----------

export type Role = "teacher" | "student";

export interface User {
  id: string;
  name: string;
  role: Role;
  className: string; // 班级，教师可跨班
}

/** 题库题目：老师设定设计条件 */
export interface Question {
  id: string;
  title: string;
  /** 考点标签，用于错题汇总 */
  examPoints: string[];
  stakeStart: number; // 起点桩号(米)
  stakeEnd: number; // 终点桩号(米)
  maxHeight: number; // 屏体总高限值(米)
  colSpacingStd: number; // 标准立柱间距(米)
  colSpacingMin: number;
  colSpacingMax: number;
  transparentRatioMin: number; // 透明屏占比下限 0~1
  noiseReqDb: number; // 降噪要求 dB
  seed: number; // 题目基准种子
  createdBy: string;
  createdAt: string;
}

export type TaskStatus = "pending" | "claimed" | "submitted" | "reviewed";

export interface Task {
  id: string;
  questionId: string;
  studentId: string; // 指派学员
  status: TaskStatus;
  deadline: string;
  createdAt: string;
}

/** 学员填写的生成参数 */
export interface GenParams {
  colSpacing: number; // 立柱间距
  baseHeight: number; // 基准屏高
  transparentRatio: number; // 目标透明屏比例
  panelHeight: number; // 单块金属吸声板高度
  arcRise: number; // 顶部弧形板矢高
  seed: number; // 随机种子
}

export type PanelMaterial = "metal-absorb" | "metal-perf" | "aluminum" | "pc-board";

/** 一跨的立面排布结果 */
export interface Span {
  index: number;
  startStake: number; // 跨起点里程
  width: number; // 跨宽 = 立柱间距
  height: number; // 本跨屏体总高
  transparentHeight: number; // 透明屏高度
  transparentY: number; // 透明屏底缘高度
  material: PanelMaterial;
  panelCount: number; // 金属吸声板块数
  arcRise: number; // 顶部弧形板矢高
  seams: number[]; // 装饰缝位置(距跨底高度)
  columnOffset: number; // 立柱位置微调(米, 相对跨起点)
  locked: boolean; // 手动改动后锁定
  edited: boolean; // 是否被手动改过
}

export type ViolationCode =
  | "HEIGHT_EXCEED" // 高度超限
  | "SPACING_RANGE" // 立柱间距越界
  | "TRANSPARENT_LOW" // 透明屏占比不达标
  | "STAKE_MISMATCH" // 跨数与桩号对不上
  | "NOISE_LOW"; // 降噪量不达标

export interface Violation {
  code: ViolationCode;
  spanIndex: number | null; // null 表示整体性问题
  message: string;
  examPoint: string; // 对应考点
}

/** 修改历史条目 */
export interface HistoryEntry {
  time: string;
  action: string; // 操作描述
  detail: string;
}

export interface Submission {
  id: string;
  taskId: string;
  questionId: string;
  studentId: string;
  params: GenParams;
  spans: Span[];
  violations: Violation[];
  history: HistoryEntry[];
  complianceScore: number; // 合规分 0~100
  paramScore: number; // 参数分 0~100
  teacherScore: number | null; // 主观分 0~100
  teacherComment: string;
  spanNotes: Record<number, string>; // 逐跨复核批注
  totalScore: number | null; // 合成总成绩
  submittedAt: string;
  reviewedAt: string | null;
}

export const MATERIAL_NAMES: Record<PanelMaterial, string> = {
  "metal-absorb": "金属吸声板(离心玻璃棉)",
  "metal-perf": "穿孔金属吸声板",
  aluminum: "铝合金复合板",
  "pc-board": "PC耐力板(透明)",
};

export const EXAM_POINTS = [
  "高度控制",
  "立柱间距",
  "透明屏配比",
  "桩号核算",
  "降噪设计",
  "构造处理",
] as const;
