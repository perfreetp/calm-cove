import type { Bone, Vec2 } from './types';

export interface Transform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export const IDENTITY: Transform = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

export function multiply(a: Transform, b: Transform): Transform {
  const cos = Math.cos(a.rotation);
  const sin = Math.sin(a.rotation);
  return {
    x: cos * b.x * a.scaleX - sin * b.y * a.scaleY + a.x,
    y: sin * b.x * a.scaleX + cos * b.y * a.scaleY + a.y,
    rotation: a.rotation + b.rotation,
    scaleX: a.scaleX * b.scaleX,
    scaleY: a.scaleY * b.scaleY,
  };
}

export function transformPoint(t: Transform, p: Vec2): Vec2 {
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return {
    x: cos * p.x * t.scaleX - sin * p.y * t.scaleY + t.x,
    y: sin * p.x * t.scaleX + cos * p.y * t.scaleY + t.y,
  };
}

export function invert(t: Transform): Transform {
  const sx = t.scaleX === 0 ? 1e-9 : 1 / t.scaleX;
  const sy = t.scaleY === 0 ? 1e-9 : 1 / t.scaleY;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const nx = -(cos * t.x + sin * t.y);
  const ny = -(-sin * t.x + cos * t.y);
  return {
    x: nx * sx,
    y: ny * sy,
    rotation: -t.rotation,
    scaleX: sx,
    scaleY: sy,
  };
}

export interface BonePose {
  rotation: number;
  x: number;
  y: number;
}

export const ZERO_POSE: BonePose = { rotation: 0, x: 0, y: 0 };

export type BoneMap = Map<string, Bone>;

export function boneMap(bones: Bone[]): BoneMap {
  return new Map(bones.map((b) => [b.id, b]));
}

/** Order bones parent-first so transforms can be resolved in one pass. */
export function topoSortBones(bones: Bone[]): Bone[] {
  const byId = boneMap(bones);
  const visited = new Set<string>();
  const out: Bone[] = [];
  const stack: string[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (stack.includes(id)) {
      // cycle guard — break by ignoring the parent link
      return;
    }
    const bone = byId.get(id);
    if (!bone) return;
    stack.push(id);
    if (bone.parentId) visit(bone.parentId);
    stack.pop();
    if (!visited.has(id)) {
      visited.add(id);
      out.push(bone);
    }
  };
  for (const b of bones) visit(b.id);
  return out;
}

export function worldTransforms(bones: Bone[], poses: Record<string, BonePose>): Map<string, Transform> {
  const ordered = topoSortBones(bones);
  const map = new Map<string, Transform>();
  for (const bone of ordered) {
    const pose = poses[bone.id] ?? ZERO_POSE;
    const local: Transform = {
      x: bone.pivot.x + pose.x,
      y: bone.pivot.y + pose.y,
      rotation: degToRad(pose.rotation),
      scaleX: 1,
      scaleY: 1,
    };
    if (bone.parentId) {
      const parent = map.get(bone.parentId) ?? IDENTITY;
      map.set(bone.id, multiply(parent, local));
    } else {
      map.set(bone.id, local);
    }
  }
  return map;
}

export function resetBonePose(): BonePose {
  return { rotation: 0, x: 0, y: 0 };
}

export function allZeroPoses(bones: Bone[]): Record<string, BonePose> {
  const out: Record<string, BonePose> = {};
  for (const b of bones) out[b.id] = resetBonePose();
  return out;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function rotateVec(v: Vec2, rad: number): Vec2 {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: cos * v.x - sin * v.y, y: sin * v.x + cos * v.y };
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function lenVec(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function normalize(v: Vec2): Vec2 {
  const l = lenVec(v);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

export function vectorAngle(v: Vec2): number {
  return Math.atan2(v.y, v.x);
}

/** Bone tip in the bone's own space, used to draw the skeleton helper. */
export function boneTipLocal(bone: Bone): Vec2 {
  return rotateVec({ x: bone.length, y: 0 }, degToRad(bone.visualAngle));
}

/** Parent chain of ids ending at the requested bone's direct parent. */
export function boneAncestors(bones: BoneMap, id: string): string[] {
  const out: string[] = [];
  let current = bones.get(id)?.parentId ?? null;
  let guard = 0;
  while (current && guard < 1000) {
    out.push(current);
    current = bones.get(current)?.parentId ?? null;
    guard += 1;
  }
  return out;
}

export function boneDescendants(bones: BoneMap, id: string): string[] {
  const out: string[] = [];
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const b of bones.values()) {
      if (b.parentId === cur && !out.includes(b.id)) {
        out.push(b.id);
        queue.push(b.id);
      }
    }
  }
  return out;
}

export function isDescendant(bones: BoneMap, candidate: string, ofId: string): boolean {
  return boneAncestors(bones, candidate).includes(ofId);
}
