import { sampleTrack } from './animation';
import { boneMap } from './skeleton';
import type { Rig, Shot, TrackMap } from './types';

export type IssueLevel = 'error' | 'warning';

export interface ValidationIssue {
  id: string;
  level: IssueLevel;
  code:
    | 'out-of-range'
    | 'cycle'
    | 'no-keys'
    | 'missing-bone'
    | 'orphan-part'
    | 'empty-track'
    | 'unknown-action'
    | 'short-shot'
    | 'unbound-part';
  message: string;
  boneId?: string;
  partId?: string;
  at?: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  canSave: boolean;
  canSubmit: boolean;
}

const SAMPLES_PER_SEGMENT = 16;

/**
 * Custom easing only remaps progress in time; it can never push a value outside
 * the range spanned by its two keyframes. Sampling each segment is therefore a
 * cheap safety net that also catches keys inserted outside the shot duration.
 */
function firstSegmentExceed(keys: Array<{ time: number; rotation: number }>, min: number, max: number): number | null {
  for (let i = 0; i < keys.length - 1; i++) {
    const from = keys[i];
    const to = keys[i + 1];
    const span = to.time - from.time;
    for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
      const t = span <= 1e-9 ? 0 : s / SAMPLES_PER_SEGMENT;
      const value = from.rotation + (to.rotation - from.rotation) * t;
      if (value < min - 1e-6 || value > max + 1e-6) return from.time + span * t;
    }
  }
  return null;
}

export function validateShot(shot: Shot, actionIds: Set<string>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const rig: Rig = shot.rig;
  const bones = boneMap(rig.bones);

  // Parent cycle detection.
  for (const bone of rig.bones) {
    let cur = bone.parentId;
    let guard = 0;
    while (cur) {
      if (cur === bone.id) {
        issues.push({
          id: `cycle-${bone.id}`,
          level: 'error',
          code: 'cycle',
          boneId: bone.id,
          message: `骨骼「${bone.name}」的父子关系存在循环引用。`,
        });
        break;
      }
      cur = bones.get(cur)?.parentId ?? null;
      guard += 1;
      if (guard > rig.bones.length + 2) break;
    }
  }

  // Bone rotation limits, at keys and between keys.
  for (const bone of rig.bones) {
    const keys = shot.tracks[bone.id];
    if (!keys || keys.length === 0) {
      // A bone without keys simply holds its neutral pose — that is valid
      // animation. Only report it when the clip has no motion at all.
      continue;
    }
    const sorted = [...keys].sort((a, b) => a.time - b.time);
    for (const k of sorted) {
      if (k.rotation < bone.minAngle - 1e-6 || k.rotation > bone.maxAngle + 1e-6) {
        issues.push({
          id: `range-${bone.id}-${k.id}`,
          level: 'error',
          code: 'out-of-range',
          boneId: bone.id,
          at: k.time,
          message: `骨骼「${bone.name}」在 ${k.time.toFixed(2)}s 旋转 ${k.rotation.toFixed(1)}°，超出关节活动范围 ${bone.minAngle}°~${bone.maxAngle}°。`,
        });
        break;
      }
    }
    if (sorted.length >= 2) {
      const overshoot = firstSegmentExceed(sorted, bone.minAngle, bone.maxAngle);
      if (overshoot !== null) {
        issues.push({
          id: `overshoot-${bone.id}`,
          level: 'error',
          code: 'out-of-range',
          boneId: bone.id,
          at: overshoot,
          message: `骨骼「${bone.name}」的插值曲线在 ${overshoot.toFixed(2)}s 处超出关节活动范围。`,
        });
      }
    }
  }

  // Empty tracks and unknown actions.
  for (const [boneId, keys] of Object.entries(shot.tracks)) {
    if (!bones.has(boneId)) {
      issues.push({
        id: `missingbone-${boneId}`,
        level: 'error',
        code: 'missing-bone',
        boneId,
        message: `轨道引用了不存在的骨骼（${boneId}）。`,
      });
    }
    if (keys.length === 0) {
      issues.push({
        id: `emptytrack-${boneId}`,
        level: 'warning',
        code: 'empty-track',
        boneId,
        message: `骨骼「${bones.get(boneId)?.name ?? boneId}」的轨道为空。`,
      });
    }
    for (const k of keys) {
      if (k.time < -1e-6 || k.time > shot.duration + 1e-6) {
        issues.push({
          id: `keyoutside-${k.id}`,
          level: 'warning',
          code: 'empty-track',
          boneId,
          at: k.time,
          message: `关键帧 ${k.time.toFixed(2)}s 位于镜头时长之外。`,
        });
      }
    }
  }

  for (const applied of shot.appliedActions) {
    if (!actionIds.has(applied.actionId)) {
      issues.push({
        id: `actionmissing-${applied.actionId}`,
        level: 'warning',
        code: 'unknown-action',
        message: `引用的动作「${applied.actionName}」已从动作库移除。`,
      });
    }
  }

  for (const part of rig.parts) {
    if (!bones.has(part.boneId)) {
      issues.push({
        id: `partbone-${part.id}`,
        level: 'error',
        code: 'unbound-part',
        partId: part.id,
        message: `部件「${part.name}」绑定的骨骼不存在。`,
      });
    }
  }

  const boneWithParts = new Set(rig.parts.map((p) => p.boneId));
  for (const bone of rig.bones) {
    if (!boneWithParts.has(bone.id) && !rig.bones.some((b) => b.parentId === bone.id)) {
      issues.push({
        id: `orphan-${bone.id}`,
        level: 'warning',
        code: 'orphan-part',
        boneId: bone.id,
        message: `骨骼「${bone.name}」未绑定任何部件，也不会带动子骨骼。`,
      });
    }
  }

  if (shot.duration < 0.5) {
    issues.push({
      id: 'short',
      level: 'warning',
      code: 'short-shot',
      message: '镜头时长小于 0.5 秒，请确认是否符合分镜要求。',
    });
  }

  if (Object.values(shot.tracks).every((k) => k.length === 0)) {
    issues.push({
      id: 'nokeys-all',
      level: 'error',
      code: 'no-keys',
      message: '该镜头没有任何关键帧，无法提交审核。',
    });
  }

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  return {
    issues,
    errors,
    warnings,
    canSave: errors.length === 0,
    canSubmit: errors.length === 0 && shot.duration > 0,
  };
}

/** Bones that violate limits at one given time, for live red highlighting. */
export function violatingBonesAt(rig: Rig, tracks: TrackMap, time: number): Set<string> {
  const out = new Set<string>();
  const bones = boneMap(rig.bones);
  for (const [boneId, keys] of Object.entries(tracks)) {
    const bone = bones.get(boneId);
    if (!bone || keys.length === 0) continue;
    const value = sampleTrack(keys, time).rotation;
    if (value < bone.minAngle - 1e-6 || value > bone.maxAngle + 1e-6) out.add(boneId);
  }
  return out;
}
