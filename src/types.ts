export interface Vec { x: number; y: number }
export type EaseMode = 'linear' | 'ease';

export interface Keyframe {
  id: string;
  t: number;                 // 秒
  pose: Record<string, Vec>; // 关节绝对坐标
  outMode: EaseMode;         // 本关键帧到下一关键帧这一段的插值方式
}
export interface SkeletonDef { joints: Record<string, Vec> }

export interface Part {
  id: string; name: string;
  bone: [string, string];
  offset: Vec;      // 相对骨骼中点的绑定偏移（绑定姿态下）
  rot: number;      // 附加旋转（度）
  w: number; h: number;
  color: string;
  kind: 'rect' | 'ellipse' | 'image';
  src?: string;     // 导入拆件图的 dataURL
}
export interface Skin { id: string; name: string; athlete: string; parts: Part[] }

export interface MetricPoint { t: number; cadence: number; contact: number } // 触地时长 ms

export interface Anim {
  id: string; name: string; duration: number;
  skeleton: SkeletonDef;
  keyframes: Keyframe[];
  skins: Skin[]; activeSkinId: string;
  metrics: MetricPoint[];
  released: boolean; createdAt: string;
}

export type IssueType = 'missing-part' | 'bind-out' | 'insufficient-frames';
export type Severity = 'severe' | 'normal';
export type IssueStatus = 'open' | 'confirmed' | 'rejected';
export interface Issue {
  id: string; itemName: string; type: IssueType; severity: Severity;
  detail: string; status: IssueStatus; reviewedAt?: string;
}
export interface BatchItem { name: string; parts: number; frames: number; bindPoints: Vec[] }
export type BatchStatus = 'review' | 'released' | 'returned';
export interface Batch {
  id: string; name: string; supplier: string; submittedAt: string;
  items: BatchItem[]; issues: Issue[]; status: BatchStatus;
  checkLog: string[]; animNames: string[];
}

export type Role = 'animator' | 'reviewer' | 'coach';
export interface State {
  anims: Anim[]; batches: Batch[];
  ui: { role: Role; selAnim: string | null; selBatch: string | null };
}
