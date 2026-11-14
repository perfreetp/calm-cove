import { describe, expect, it } from 'vitest';
import { buildScene, poseAngleFromPointer, rotateAround, snapPivot, worldPointerToRig } from './scene';
import { buildRig } from './templates';
import { EASE_IN_OUT, LINEAR } from './easing';
import type { CameraState } from './scene';
import type { Keyframe, TrackMap } from './types';

function key(time: number, rotation: number): Keyframe {
  return { id: `k${time}`, time, rotation, x: 0, y: 0, easing: time === 0 ? LINEAR : EASE_IN_OUT };
}

const camera: CameraState = { zoom: 1, panX: 0, panY: 0 };

describe('scene building', () => {
  const rig = buildRig('fetus');

  it('emits one item per visible part', () => {
    const scene = buildScene(rig, {}, { time: 0, showBones: false, showLabels: false });
    expect(scene.items).toHaveLength(rig.parts.filter((p) => p.visible).length);
  });

  it('skips hidden parts', () => {
    const hidden = buildRig('fetus');
    hidden.parts[0].visible = false;
    const scene = buildScene(hidden, {}, { time: 0, showBones: false, showLabels: false });
    expect(scene.items).toHaveLength(hidden.parts.length - 1);
  });

  it('samples bone angles from the tracks', () => {
    const tracks: TrackMap = { fetal_head: [key(0, 0), key(1, 20)] };
    const scene = buildScene(rig, tracks, { time: 0.5, showBones: true, showLabels: false });
    const head = scene.bones.find((b) => b.bone.id === 'fetal_head')!;
    expect(head.angle).toBeGreaterThan(0);
    expect(head.angle).toBeLessThan(20);
  });

  it('marks a bone as violating outside its joint range', () => {
    const tracks: TrackMap = { fetal_head: [key(0, 90), key(1, 90)] };
    const scene = buildScene(rig, tracks, { time: 0.5, showBones: true, showLabels: false });
    const head = scene.bones.find((b) => b.bone.id === 'fetal_head')!;
    expect(head.violating).toBe(true);
  });

  it('honours transient pose overrides (drag preview)', () => {
    const tracks: TrackMap = { fetal_head: [key(0, 0), key(1, 0)] };
    const scene = buildScene(rig, tracks, {
      time: 0.5,
      showBones: true,
      showLabels: false,
      poseOverrides: { fetal_head: { rotation: 35 } },
    });
    const head = scene.bones.find((b) => b.bone.id === 'fetal_head')!;
    expect(head.angle).toBeCloseTo(35, 5);
  });

  it('moves child joints when the parent rotates', () => {
    const neutral = buildScene(rig, {}, { time: 0, showBones: true, showLabels: false });
    const rotated = buildScene(
      rig,
      { fetal_root: [key(0, 60), key(1, 60)] },
      { time: 0, showBones: true, showLabels: false },
    );
    const a = neutral.bones.find((b) => b.bone.id === 'fetal_leg_l')!;
    const b = rotated.bones.find((x) => x.bone.id === 'fetal_leg_l')!;
    expect(Math.hypot(a.pivot.x - b.pivot.x, a.pivot.y - b.pivot.y)).toBeGreaterThan(5);
  });

  it('labels violating bones with a warning marker', () => {
    const tracks: TrackMap = { fetal_head: [key(0, 90), key(1, 90)] };
    const scene = buildScene(rig, tracks, { time: 0.5, showBones: true, showLabels: true });
    const label = scene.labels.find((l) => l.text.includes('胎头'))!;
    expect(label.text).toContain('⚠');
  });
});

describe('pointer interaction math', () => {
  const rig = buildRig('fetus');

  it('converts the rig centre to the viewport centre', () => {
    const viewport = { x: 800, y: 600 };
    const p = worldPointerToRig({ x: 400, y: 300 }, camera, viewport, rig);
    expect(p.x).toBeCloseTo(rig.rigWidth / 2, 5);
    expect(p.y).toBeCloseTo(rig.rigHeight / 2, 5);
  });

  it('inverse maps back to the same rig point after pan and zoom', () => {
    const viewport = { x: 900, y: 500 };
    const cam: CameraState = { zoom: 1.7, panX: 40, panY: -25 };
    const screen = { x: 512, y: 288 };
    const rigPoint = worldPointerToRig(screen, cam, viewport, rig);
    // Convert forward by composing the same transform the renderer uses.
    const scale = Math.min(viewport.x / rig.rigWidth, viewport.y / rig.rigHeight) * cam.zoom;
    const backX = (rigPoint.x - rig.rigWidth / 2) * scale + viewport.x / 2 + cam.panX;
    const backY = (rigPoint.y - rig.rigHeight / 2) * scale + viewport.y / 2 + cam.panY;
    expect(backX).toBeCloseTo(screen.x, 4);
    expect(backY).toBeCloseTo(screen.y, 4);
  });

  it('dragging a bone directly right produces the expected relative pose angle', () => {
    const scene = buildScene(rig, {}, { time: 0, showBones: true, showLabels: false });
    const head = scene.bones.find((b) => b.bone.id === 'fetal_head')!;
    const angle = poseAngleFromPointer(head, { x: head.pivot.x + 100, y: head.pivot.y });
    // The helper points down (visualAngle 90), so aiming right needs -90°.
    expect(angle).toBeCloseTo(-head.bone.visualAngle - head.parentAngle, 5);
  });

  it('rotation helper wraps angles into -180..180', () => {
    const scene = buildScene(rig, {}, { time: 0, showBones: true, showLabels: false });
    const head = scene.bones.find((b) => b.bone.id === 'fetal_head')!;
    const below = poseAngleFromPointer(head, { x: head.pivot.x, y: head.pivot.y + 100 });
    expect(below).toBeGreaterThanOrEqual(-180);
    expect(below).toBeLessThanOrEqual(180);
  });

  it('snaps pivots to half-pixel precision', () => {
    expect(snapPivot({ x: 10.26, y: -3.9 })).toEqual({ x: 10.5, y: -4 });
  });

  it('rotates a point around a pivot consistently', () => {
    const out = rotateAround({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
    expect(out.x).toBeCloseTo(0, 6);
    expect(out.y).toBeCloseTo(10, 6);
  });
});
