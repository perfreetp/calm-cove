import type { AnimationDoc, BoneDef, EasingType, Keyframe } from '../types';

/** 三次贝塞尔缓动,控制点格式同 CSS cubic-bezier [x1,y1,x2,y2] */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number) {
  const cx = 3 * p1x;
  const bx = 3 * (p2x - p1x) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * p1y;
  const by = 3 * (p2y - p1y) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleDerivX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  function solveTForX(x: number): number {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const x2 = sampleX(t) - x;
      if (Math.abs(x2) < 1e-5) return t;
      const d = sampleDerivX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= x2 / d;
    }
    // 二分兜底
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const x2 = sampleX(t);
      if (Math.abs(x2 - x) < 1e-5) return t;
      if (x2 < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveTForX(x));
  };
}

const DEFAULT_BEZIER: [number, number, number, number] = [0.42, 0, 0.58, 1];

/** 两个关键帧之间按缓动方式求进度 */
export function segmentProgress(
  t: number,
  t0: number,
  t1: number,
  easing: EasingType,
  bezier?: [number, number, number, number],
): number {
  if (t1 <= t0) return 1;
  const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  switch (easing) {
    case 'linear':
      return u;
    case 'easeInOut':
      return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    case 'bezier': {
      const [x1, y1, x2, y2] = bezier ?? DEFAULT_BEZIER;
      return cubicBezier(x1, y1, x2, y2)(u);
    }
  }
}

/** 单条轨道在指定时刻的取值;轨道无关键帧时返回 null */
export function sampleTrack(
  frames: Keyframe[],
  trackId: string,
  time: number,
): number | null {
  const seq = frames
    .filter((f) => f.track === trackId)
    .sort((a, b) => a.time - b.time);
  if (seq.length === 0) return null;
  if (time <= seq[0].time) return seq[0].value;
  const last = seq[seq.length - 1];
  if (time >= last.time) return last.value;
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    if (time >= a.time && time <= b.time) {
      const p = segmentProgress(time, a.time, b.time, b.easing, b.bezier);
      return a.value + (b.value - a.value) * p;
    }
  }
  return last.value;
}

export interface BonePose {
  id: string;
  /** 世界坐标下的关节原点 */
  wx: number;
  wy: number;
  /** 世界角度(度) */
  worldAngle: number;
  /** 本帧实际局部角度(已做限位) */
  localAngle: number;
  /** 是否触发了关节旋转范围限制 */
  clamped: boolean;
}

/**
 * 正运动学:按骨骼父子层级自根向叶计算世界位姿。
 * 骨骼关键帧直接存"局部绝对角度"(与 minAngle/maxAngle 同一坐标系);
 * 无关键帧时回退到静息角 restAngle。
 */
export function evaluatePose(doc: AnimationDoc, time: number): Map<string, BonePose> {
  const result = new Map<string, BonePose>();
  const byParent = new Map<string | null, BoneDef[]>();
  for (const b of doc.bones) {
    const list = byParent.get(b.parentId) ?? [];
    list.push(b);
    byParent.set(b.parentId, list);
  }

  const walk = (bone: BoneDef, parent: BonePose | null) => {
    const sampled = sampleTrack(doc.keyframes, bone.id, time);
    const requested = sampled ?? bone.restAngle;
    const clampedAngle = Math.min(bone.maxAngle, Math.max(bone.minAngle, requested));
    const localAngle = clampedAngle;
    // 静息角均为 0:世界角 = 父世界角 + 自身局部旋转,沿层级累加
    const worldAngle = parent ? parent.worldAngle + localAngle : localAngle;

    let wx: number;
    let wy: number;
    if (!parent) {
      wx = bone.x;
      wy = bone.y;
    } else {
      // 子骨骼原点相对父关节的偏移,随父骨骼世界旋转
      const rad = (parent.worldAngle * Math.PI) / 180;
      wx = parent.wx + bone.x * Math.cos(rad) - bone.y * Math.sin(rad);
      wy = parent.wy + bone.x * Math.sin(rad) + bone.y * Math.cos(rad);
    }
    const pose: BonePose = {
      id: bone.id,
      wx,
      wy,
      worldAngle,
      localAngle,
      clamped: Math.abs(requested - clampedAngle) > 1e-6,
    };
    result.set(bone.id, pose);
    for (const child of byParent.get(bone.id) ?? []) walk(child, pose);
  };

  for (const root of byParent.get(null) ?? []) walk(root, null);
  return result;
}

/** 静息位姿(时间 0 且无动画时的姿态),用于编辑器绑骨视图 */
export function restPose(doc: AnimationDoc): Map<string, BonePose> {
  return evaluatePose({ ...doc, keyframes: [] }, 0);
}

/** 某轨道全部关键帧(按时间排序) */
export function trackFrames(doc: AnimationDoc, trackId: string): Keyframe[] {
  return doc.keyframes
    .filter((f) => f.track === trackId)
    .sort((a, b) => a.time - b.time);
}

/** 时间轴采样点,用于逐点检测违规区间 */
export function sampleTimes(doc: AnimationDoc, step = 0.5): number[] {
  const out: number[] = [];
  for (let t = 0; t <= doc.duration + 1e-6; t += step) out.push(Number(t.toFixed(3)));
  return out;
}
