export interface Vec2 {
  x: number;
  y: number;
}

export type RGBA = [number, number, number, number];

export type Role = 'animator' | 'supervisor' | 'learner';

export interface User {
  name: string;
  role: Role;
}

export interface Resolution {
  width: number;
  height: number;
  label: string;
}

export interface Project {
  id: string;
  courseName: string;
  client: string;
  dueDate: string; // yyyy-mm-dd
  resolution: Resolution;
  fps: number;
  templateId: string;
  notes: string;
  createdAt: string;
}

export type ShotStatus = 'draft' | 'in_review' | 'rework' | 'approved' | 'delivered';

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  /** Offset of this bone's rotation center in parent local space. */
  pivot: Vec2;
  /** Angle in degrees used only for drawing the skeleton helper. */
  visualAngle: number;
  length: number;
  /** Allowed animated rotation in degrees, relative to the neutral pose. */
  minAngle: number;
  maxAngle: number;
}

export interface PartGroup {
  id: string;
  name: string;
  color: RGBA;
  rootBoneId: string;
  collapsed: boolean;
  silhouette: Vec2[];
}

export interface Part {
  id: string;
  name: string;
  groupId: string;
  boneId: string;
  /** Polygon in rig space at neutral pose. */
  points: Vec2[];
  fill: RGBA;
  stroke: RGBA;
  strokeWidth: number;
  visible: boolean;
  z: number;
}

export interface Rig {
  id: string;
  name: string;
  templateId: string;
  rigWidth: number;
  rigHeight: number;
  bones: Bone[];
  groups: PartGroup[];
  parts: Part[];
}

export type Easing = { type: 'linear' } | { type: 'easeInOut' } | { type: 'bezier'; p1: Vec2; p2: Vec2 };

export interface Keyframe {
  id: string;
  /** Seconds from clip start. */
  time: number;
  rotation: number;
  x: number;
  y: number;
  /** Easing used on the segment that starts at this keyframe. */
  easing: Easing;
}

export type TrackMap = Record<string, Keyframe[]>;

export interface AppliedAction {
  actionId: string;
  actionName: string;
  startTime: number;
  duration: number;
  appliedAt: string;
}

export interface ReviewComment {
  id: string;
  frame: number;
  time: number;
  text: string;
  author: string;
  createdAt: string;
}

export type ReviewVerdict = 'pending' | 'approved' | 'rejected';

export interface ReviewRecord {
  id: string;
  round: number;
  submittedAt: string;
  submittedBy: string;
  reviewedAt?: string;
  reviewer?: string;
  verdict: ReviewVerdict;
  comments: ReviewComment[];
}

export interface VersionRecord {
  id: string;
  version: number;
  createdAt: string;
  createdBy: string;
  reviewId: string;
}

export interface Shot {
  id: string;
  projectId: string;
  code: string;
  title: string;
  order: number;
  duration: number;
  assignee: string;
  status: ShotStatus;
  reworkCount: number;
  createdAt: string;
  updatedAt: string;
  rig: Rig;
  tracks: TrackMap;
  appliedActions: AppliedAction[];
  reviews: ReviewRecord[];
  versions: VersionRecord[];
  deliveredVersion?: number;
}

export interface MotionAction {
  id: string;
  name: string;
  category: string;
  description: string;
  duration: number;
  templateId: string;
  tracks: TrackMap;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryManifest {
  format: 'MMS-SEQ-1';
  courseName: string;
  shotCode: string;
  shotTitle: string;
  version: number;
  createdAt: string;
  resolution: Resolution;
  fps: number;
  frameCount: number;
  duration: number;
  framePattern: string;
  bones: string[];
  actions: string[];
  checksum: string;
}

export interface DeliverySnapshot {
  courseName: string;
  code: string;
  title: string;
  rig: Rig;
  tracks: TrackMap;
  duration: number;
  fps: number;
  appliedActions: AppliedAction[];
}

export interface DeliveryPackage {
  id: string;
  projectId: string;
  shotId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  resolution: Resolution;
  fps: number;
  frameCount: number;
  duration: number;
  checksum: string;
  sizeBytes: number;
  fileCount: number;
  manifest: DeliveryManifest;
  snapshot: DeliverySnapshot;
}

export interface ActivityEvent {
  id: string;
  at: string;
  actor: string;
  kind: 'submit' | 'reject' | 'approve' | 'deliver' | 'create' | 'sync' | 'save';
  shotId?: string;
  projectId?: string;
  detail: string;
}

export interface AppState {
  version: 1;
  projects: Project[];
  shots: Shot[];
  actions: MotionAction[];
  deliveries: DeliveryPackage[];
  events: ActivityEvent[];
  currentUser: User;
  seededAt: string;
}

export interface ShotListEntry {
  code: string;
  title: string;
  duration: number;
}

export interface ProjectDraft {
  courseName: string;
  client: string;
  dueDate: string;
  resolution: Resolution;
  fps: number;
  templateId: string;
  notes: string;
  shots: ShotListEntry[];
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

export interface LabelItem {
  text: string;
  at: Vec2;
  color: RGBA;
  size: number;
  kind: 'part' | 'bone';
}

export interface SceneBone {
  bone: Bone;
  pivot: Vec2;
  tip: Vec2;
  /** Animated rotation relative to the neutral pose, in degrees. */
  angle: number;
  /** Accumulated parent rotation in world space, degrees (used for drag math). */
  parentAngle: number;
  /** Accumulated bone rotation in world space, degrees. */
  worldAngle: number;
  /** Accumulated bone rotation plus the static helper direction. */
  worldVisualAngle: number;
  violating: boolean;
}

export interface SceneItem {
  points: Vec2[];
  fill?: RGBA;
  stroke?: RGBA;
  strokeWidth?: number;
  closed: boolean;
  z: number;
  dashed?: boolean;
}

export interface Scene {
  items: SceneItem[];
  bones: SceneBone[];
  labels: LabelItem[];
}
