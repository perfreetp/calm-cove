import { poseAt } from './animation';
import { clamp } from './easing';
import { boneTipLocal, degToRad, radToDeg, rotateVec, transformPoint, worldTransforms } from './skeleton';
import type { Rig, Scene, SceneBone, SceneItem, TrackMap, Vec2 } from './types';

export interface SceneOptions {
  time: number;
  showBones: boolean;
  showLabels: boolean;
  selectedBoneId?: string | null;
  hoverBoneId?: string | null;
  /** Transient poses that override the sampled track values (drag preview). */
  poseOverrides?: Record<string, { rotation?: number; x?: number; y?: number }>;
  /** When set, only these bones get a text label (keeps the canvas readable). */
  labelBones?: string[];
}

export interface CameraState {
  zoom: number;
  panX: number;
  panY: number;
}

export function buildScene(rig: Rig, tracks: TrackMap, options: SceneOptions): Scene {
  const poses = poseAt(tracks, options.time);
  if (options.poseOverrides) {
    for (const [boneId, override] of Object.entries(options.poseOverrides)) {
      const base = poses[boneId] ?? { rotation: 0, x: 0, y: 0 };
      poses[boneId] = {
        rotation: override.rotation ?? base.rotation,
        x: override.x ?? base.x,
        y: override.y ?? base.y,
      };
    }
  }
  const worlds = worldTransforms(rig.bones, poses);
  const items: SceneItem[] = [];
  const bones: SceneBone[] = [];
  const labels: Scene['labels'] = [];

  for (const part of rig.parts) {
    if (!part.visible) continue;
    const world = worlds.get(part.boneId);
    if (!world) continue;
    const pts = part.points.map((p) => transformPoint(world, p));
    items.push({
      points: pts,
      closed: true,
      z: part.z,
      fill: part.fill,
      stroke: part.stroke,
      strokeWidth: part.strokeWidth,
    });
  }

  // Joint guide rings, drawn above parts but below helper bones.
  for (const bone of rig.bones) {
    const world = worlds.get(bone.id);
    if (!world) continue;
    const parentAngle = bone.parentId ? radToDeg(worlds.get(bone.parentId)?.rotation ?? 0) : 0;
    const pose = poses[bone.id];
    const angle = pose ? pose.rotation : 0;
    const worldAngleDeg = radToDeg(world.rotation);
    const worldVisualDeg = worldAngleDeg + bone.visualAngle;
    const tipLocal = boneTipLocal(bone);
    const tip = transformPoint(world, tipLocal);
    const violating = angle < bone.minAngle - 1e-6 || angle > bone.maxAngle + 1e-6;

    bones.push({
      bone,
      pivot: { x: world.x, y: world.y },
      tip,
      angle,
      parentAngle,
      worldAngle: worldAngleDeg,
      worldVisualAngle: worldVisualDeg,
      violating,
    });
    const showLabel =
      !options.labelBones ||
      options.labelBones.includes(bone.id) ||
      options.selectedBoneId === bone.id ||
      options.hoverBoneId === bone.id ||
      violating;
    if (showLabel) {
      labels.push({
        text: violating ? `${bone.name} ⚠` : bone.name,
        at: tip,
        color: violating ? [1, 0.32, 0.32, 1] : [0.55, 0.8, 1, 0.85],
        size: 11,
        kind: 'bone',
      });
    }
  }

  return { items, bones, labels };
}

/** Pose angle (degrees) that aims a dragged bone's helper at the pointer. */
export function poseAngleFromPointer(sceneBone: SceneBone, pointer: Vec2, grabOffset = 0): number {
  const pointerAngle = radToDeg(Math.atan2(pointer.y - sceneBone.pivot.y, pointer.x - sceneBone.pivot.x));
  const target = pointerAngle - sceneBone.parentAngle - sceneBone.bone.visualAngle;
  let wrapped = target + grabOffset;
  while (wrapped > 180) wrapped -= 360;
  while (wrapped < -180) wrapped += 360;
  return wrapped;
}

export function fitScale(viewport: Vec2, rig: Rig, zoom: number): number {
  if (viewport.x <= 0 || viewport.y <= 0) return 1;
  return Math.min(viewport.x / rig.rigWidth, viewport.y / rig.rigHeight) * zoom;
}

export function worldPointerToRig(pointer: Vec2, camera: CameraState, viewport: Vec2, rig: Rig): Vec2 {
  const scale = fitScale(viewport, rig, camera.zoom);
  const cx = viewport.x / 2 + camera.panX;
  const cy = viewport.y / 2 + camera.panY;
  return {
    x: (pointer.x - cx) / scale + rig.rigWidth / 2,
    y: (pointer.y - cy) / scale + rig.rigHeight / 2,
  };
}

export function rigToScreen(p: Vec2, camera: CameraState, viewport: Vec2, rig: Rig): Vec2 {
  const scale = fitScale(viewport, rig, camera.zoom);
  const cx = viewport.x / 2 + camera.panX;
  const cy = viewport.y / 2 + camera.panY;
  return {
    x: (p.x - rig.rigWidth / 2) * scale + cx,
    y: (p.y - rig.rigHeight / 2) * scale + cy,
  };
}

export function snapPivot(p: Vec2): Vec2 {
  return { x: Math.round(p.x * 2) / 2, y: Math.round(p.y * 2) / 2 };
}

export function rotateAround(p: Vec2, pivot: Vec2, degrees: number): Vec2 {
  const v = rotateVec({ x: p.x - pivot.x, y: p.y - pivot.y }, degToRad(degrees));
  return { x: v.x + pivot.x, y: v.y + pivot.y };
}

export function outOfRangeBones(rig: Rig, tracks: TrackMap): string[] {
  const flagged = new Set<string>();
  for (const bone of rig.bones) {
    const keys = tracks[bone.id];
    if (!keys) continue;
    for (const k of keys) {
      if (k.rotation < bone.minAngle - 1e-6 || k.rotation > bone.maxAngle + 1e-6) {
        flagged.add(bone.id);
        break;
      }
    }
  }
  return [...flagged];
}

export function clampSceneZoom(zoom: number): number {
  return clamp(zoom, 0.35, 4);
}
