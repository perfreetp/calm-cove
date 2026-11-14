import { applyEasing, clamp01 } from './easing';
import { uid } from './ids';
import type { BonePose } from './skeleton';
import { IDENTITY, multiply, degToRad } from './skeleton';
import type { Bone, Keyframe, TrackMap, Vec2 } from './types';

export interface SampleValue {
  rotation: number;
  x: number;
  y: number;
}

export const ZERO_VALUE: SampleValue = { rotation: 0, x: 0, y: 0 };

export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.time - b.time);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Sample a track. The easing stored on a key controls the segment that starts
 * at that key. Before the first key and after the last one the value is held.
 */
export function sampleTrack(keys: Keyframe[], time: number): SampleValue {
  if (keys.length === 0) return { ...ZERO_VALUE };
  const sorted = keys[0].time <= keys[keys.length - 1].time ? keys : sortKeys(keys);
  if (time <= sorted[0].time) return pick(sorted[0]);
  const last = sorted[sorted.length - 1];
  if (time >= last.time) return pick(last);
  let i = 0;
  while (i < sorted.length - 1 && sorted[i + 1].time <= time) i += 1;
  const from = sorted[i];
  const to = sorted[i + 1];
  const span = to.time - from.time;
  const progress = span <= 1e-9 ? 1 : clamp01((time - from.time) / span);
  const eased = applyEasing(from.easing, progress);
  return {
    rotation: lerp(from.rotation, to.rotation, eased),
    x: lerp(from.x, to.x, eased),
    y: lerp(from.y, to.y, eased),
  };
}

function pick(k: Keyframe): SampleValue {
  return { rotation: k.rotation, x: k.x, y: k.y };
}

export function samplePose(tracks: TrackMap, time: number): Record<string, BonePose> {
  const out: Record<string, BonePose> = {};
  for (const [boneId, keys] of Object.entries(tracks)) {
    if (!keys.length) continue;
    out[boneId] = sampleTrack(keys, time);
  }
  return out;
}

export function keyIndexAtTime(keys: Keyframe[], time: number, eps = 0.0005): number {
  for (let i = 0; i < keys.length; i++) {
    if (Math.abs(keys[i].time - time) <= eps) return i;
  }
  return -1;
}

export function upsertKeyframe(
  keys: Keyframe[],
  time: number,
  value: SampleValue,
  easing?: Keyframe['easing'],
): Keyframe[] {
  const next = sortKeys(keys);
  const idx = keyIndexAtTime(next, time);
  if (idx >= 0) {
    next[idx] = { ...next[idx], ...value };
    return next;
  }
  const template = next[Math.max(0, findBefore(next, time))]?.easing;
  next.push({
    id: uid('key'),
    time,
    rotation: value.rotation,
    x: value.x,
    y: value.y,
    easing: easing ?? template ?? { type: 'easeInOut' },
  });
  return sortKeys(next);
}

function findBefore(keys: Keyframe[], time: number): number {
  let idx = -1;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].time <= time) idx = i;
    else break;
  }
  return idx;
}

export function removeKeyframe(keys: Keyframe[], time: number): Keyframe[] {
  const idx = keyIndexAtTime(keys, time);
  if (idx < 0) return keys;
  const next = keys.filter((_, i) => i !== idx);
  return next;
}

export function moveKeyframe(keys: Keyframe[], id: string, time: number, duration: number): Keyframe[] {
  const next = keys.map((k) => (k.id === id ? { ...k, time: Math.min(duration, Math.max(0, time)) } : k));
  return sortKeys(next);
}

export function setEasing(keys: Keyframe[], id: string, easing: Keyframe['easing']): Keyframe[] {
  return keys.map((k) => (k.id === id ? { ...k, easing } : k));
}

export function cloneTracks(tracks: TrackMap): TrackMap {
  const out: TrackMap = {};
  for (const [boneId, keys] of Object.entries(tracks)) {
    out[boneId] = keys.map((k) => ({
      ...k,
      id: uid('key'),
      easing: cloneEasing(k.easing),
    }));
  }
  return out;
}

export function cloneEasing(easing: Keyframe['easing']): Keyframe['easing'] {
  if (easing.type !== 'bezier') return { type: easing.type };
  return { type: 'bezier', p1: { ...easing.p1 }, p2: { ...easing.p2 } };
}

/**
 * Copy a time window of one shot's tracks into another shot. The window is
 * rebased so the first key lands at `startTime`. Returns fresh tracks for the
 * destination shot, leaving the source untouched.
 */
export function sliceTracks(tracks: TrackMap, range: { start: number; end: number }, startTime = 0): TrackMap {
  const out: TrackMap = {};
  for (const [boneId, keys] of Object.entries(tracks)) {
    const kept = sortKeys(keys).filter((k) => k.time >= range.start - 1e-6 && k.time <= range.end + 1e-6);
    if (!kept.length) continue;
    out[boneId] = kept.map((k) => ({
      ...k,
      id: uid('key'),
      time: round2(k.time - range.start + startTime),
      easing: cloneEasing(k.easing),
    }));
  }
  return out;
}

export function offsetTracks(tracks: TrackMap, offset: number, duration: number): TrackMap {
  const out: TrackMap = {};
  for (const [boneId, keys] of Object.entries(tracks)) {
    out[boneId] = keys
      .map((k) => ({ ...k, time: k.time + offset }))
      .filter((k) => k.time >= 0 && k.time <= duration + 1e-6);
  }
  return out;
}

export function shiftTrackValues(tracks: TrackMap, boneId: string, delta: Partial<SampleValue>): TrackMap {
  const keys = tracks[boneId];
  if (!keys) return tracks;
  return {
    ...tracks,
    [boneId]: keys.map((k) => ({
      ...k,
      rotation: k.rotation + (delta.rotation ?? 0),
      x: k.x + (delta.x ?? 0),
      y: k.y + (delta.y ?? 0),
    })),
  };
}

export function trackDuration(tracks: TrackMap): number {
  let max = 0;
  for (const keys of Object.values(tracks)) {
    for (const k of keys) max = Math.max(max, k.time);
  }
  return max;
}

export function countKeys(tracks: TrackMap): number {
  return Object.values(tracks).reduce((n, keys) => n + keys.length, 0);
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function snapTime(time: number, fps: number): number {
  if (fps <= 0) return time;
  return Math.round(time * fps) / fps;
}

export function frameToTime(frame: number, fps: number): number {
  return frame / fps;
}

export function timeToFrame(time: number, fps: number): number {
  return Math.round(time * fps);
}

/**
 * Rig-space pose per bone at a given time, used by the renderer.
 * The renderer composes `pivot + offset` and rotation.
 */
export function poseAt(tracks: TrackMap, time: number): Record<string, { rotation: number; x: number; y: number }> {
  return samplePose(tracks, time);
}

/** Compose world transforms for drawing (thin wrapper for renderer ease of use). */
export function composeBone(
  parentWorld: typeof IDENTITY,
  pivot: Vec2,
  pose: { rotation: number; x: number; y: number },
) {
  return multiply(parentWorld, {
    x: pivot.x + pose.x,
    y: pivot.y + pose.y,
    rotation: degToRad(pose.rotation),
    scaleX: 1,
    scaleY: 1,
  });
}

export interface LimitViolation {
  boneId: string;
  boneName: string;
  time: number;
  value: number;
  min: number;
  max: number;
}

/** Clamp helper used by the inspector when scrubbing values. */
export function clampRotation(bone: Bone, degrees: number): number {
  return Math.min(bone.maxAngle, Math.max(bone.minAngle, degrees));
}

export function rotationWithinLimits(bone: Bone, degrees: number): boolean {
  return degrees >= bone.minAngle - 1e-6 && degrees <= bone.maxAngle + 1e-6;
}
