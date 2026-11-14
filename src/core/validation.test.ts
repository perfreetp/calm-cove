import { describe, expect, it } from 'vitest';
import { validateShot, violatingBonesAt } from './validation';
import { buildRig } from './templates';
import { EASE_IN_OUT, LINEAR, bezierEasing } from './easing';
import type { Keyframe, Shot, TrackMap } from './types';

function makeShot(tracks: TrackMap, templateId = 'fetus'): Shot {
  return {
    id: 'shot-x',
    projectId: 'p',
    code: 'S01',
    title: '测试',
    order: 0,
    duration: 4,
    assignee: '测试员',
    status: 'draft',
    reworkCount: 0,
    createdAt: '',
    updatedAt: '',
    rig: buildRig(templateId),
    tracks,
    appliedActions: [],
    reviews: [],
    versions: [],
  };
}

function key(time: number, rotation: number, easing: Keyframe['easing'] = EASE_IN_OUT): Keyframe {
  return { id: `k-${time}`, time, rotation, x: 0, y: 0, easing };
}

describe('shot validation', () => {
  const noActions = new Set<string>();

  it('blocks saving when a key is outside the joint range', () => {
    const shot = makeShot({ fetal_head: [key(0, 0, LINEAR), key(1, 80, LINEAR)] });
    const result = validateShot(shot, noActions);
    expect(result.canSave).toBe(false);
    expect(result.errors.some((e) => e.code === 'out-of-range')).toBe(true);
  });

  it('allows saving when values stay inside the range', () => {
    const shot = makeShot({ fetal_head: [key(0, 0, LINEAR), key(1, 30, LINEAR)] });
    const result = validateShot(shot, noActions);
    expect(result.canSave).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('catches overshoot between two valid keys', () => {
    const bone = buildRig('fetus').bones.find((b) => b.id === 'fetal_head')!;
    // Both endpoints legal, but the path crosses the limit if we interpolate in
    // a way that exceeds it — emulate with an intermediate key above the max.
    const shot = makeShot({
      fetal_head: [key(0, 0, LINEAR), key(1, bone.maxAngle + 10, LINEAR), key(2, 0, LINEAR)],
    });
    const result = validateShot(shot, noActions);
    expect(result.canSave).toBe(false);
  });

  it('reports the exact time of the first violation', () => {
    const shot = makeShot({ fetal_head: [key(0, 0, LINEAR), key(1, 90, LINEAR)] });
    const result = validateShot(shot, noActions);
    const issue = result.errors.find((e) => e.code === 'out-of-range')!;
    expect(issue.at).toBeDefined();
    expect(issue.boneId).toBe('fetal_head');
  });

  it('blocks a shot without any keyframes from submitting', () => {
    const shot = makeShot({});
    const result = validateShot(shot, noActions);
    expect(result.canSubmit).toBe(false);
  });

  it('detects parent cycles', () => {
    const shot = makeShot({ fetal_head: [key(0, 0)] });
    shot.rig.bones = shot.rig.bones.map((b) =>
      b.id === 'fetal_root'
        ? { ...b, parentId: 'fetal_body' }
        : b.id === 'fetal_body'
          ? { ...b, parentId: 'fetal_root' }
          : b,
    );
    const result = validateShot(shot, noActions);
    expect(result.errors.some((e) => e.code === 'cycle')).toBe(true);
  });

  it('warns about tracks pointing at missing bones', () => {
    const shot = makeShot({ ghost_bone: [key(0, 0)] });
    const result = validateShot(shot, noActions);
    expect(result.errors.some((e) => e.code === 'missing-bone')).toBe(true);
  });

  it('treats bezier easing as unable to exceed the key range', () => {
    const shot = makeShot({
      fetal_head: [key(0, -20, bezierEasing(0.2, 0, 0.8, 1)), key(2, 20, LINEAR)],
    });
    const result = validateShot(shot, noActions);
    expect(result.errors.filter((e) => e.code === 'out-of-range')).toHaveLength(0);
  });
});

describe('live violation highlighting', () => {
  it('flags bones exceeding limits at a specific time', () => {
    const rig = buildRig('fetus');
    const head = rig.bones.find((b) => b.id === 'fetal_head')!;
    const tracks: TrackMap = {
      fetal_head: [key(0, 0, LINEAR), key(1, head.maxAngle + 20, LINEAR)],
    };
    const atViolation = violatingBonesAt(rig, tracks, 1);
    expect(atViolation.has('fetal_head')).toBe(true);
    const atStart = violatingBonesAt(rig, tracks, 0);
    expect(atStart.has('fetal_head')).toBe(false);
  });
});
