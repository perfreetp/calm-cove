import { strToU8, zipSync } from 'fflate';
import { sortKeys } from './animation';
import { uid } from './ids';
import type { DeliveryManifest, DeliveryPackage, DeliverySnapshot, Resolution, Rig, Shot, TrackMap } from './types';
import { nowIso } from './workflow';

export const FRAME_PATTERN = (code: string) => `${code}_####.png`;

export function checksumOf(data: string): string {
  // FNV-1a 32-bit, stable across runs and platforms.
  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function frameCountOf(duration: number, fps: number): number {
  return Math.max(1, Math.round(duration * fps));
}

export function frameFileName(code: string, frame: number): string {
  return `${code}_${String(frame).padStart(4, '0')}.png`;
}

export function buildSnapshot(shot: Shot, courseName: string): DeliverySnapshot {
  return {
    courseName,
    code: shot.code,
    title: shot.title,
    rig: deepClone(shot.rig),
    tracks: cloneTracksForExport(shot.tracks),
    duration: shot.duration,
    fps: 24,
    appliedActions: shot.appliedActions.map((a) => ({ ...a })),
  };
}

function cloneTracksForExport(tracks: TrackMap): TrackMap {
  const out: TrackMap = {};
  for (const [id, keys] of Object.entries(tracks)) {
    out[id] = sortKeys(keys).map((k) => ({ ...k, easing: cloneEasingForExport(k.easing) }));
  }
  return out;
}

function cloneEasingForExport(easing: TrackMap[string][number]['easing']): TrackMap[string][number]['easing'] {
  if (easing.type !== 'bezier') return { type: easing.type };
  return { type: 'bezier', p1: { ...easing.p1 }, p2: { ...easing.p2 } };
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface ActionDataFile {
  format: 'MMS-ACTION-1';
  courseName: string;
  shotCode: string;
  shotTitle: string;
  version: number;
  duration: number;
  fps: number;
  resolution: Resolution;
  rig: Rig;
  bones: Array<{ id: string; name: string; parentId: string | null; minAngle: number; maxAngle: number }>;
  tracks: Record<string, Array<{ time: number; rotation: number; x: number; y: number; easing: unknown }>>;
  actions: Array<{ actionId: string; actionName: string; startTime: number; duration: number }>;
}

export function buildActionDataFile(
  snapshot: DeliverySnapshot,
  version: number,
  resolution: Resolution,
): ActionDataFile {
  return {
    format: 'MMS-ACTION-1',
    courseName: snapshot.courseName,
    shotCode: snapshot.code,
    shotTitle: snapshot.title,
    version,
    duration: snapshot.duration,
    fps: snapshot.fps,
    resolution,
    rig: snapshot.rig,
    bones: snapshot.rig.bones.map((b) => ({
      id: b.id,
      name: b.name,
      parentId: b.parentId,
      minAngle: b.minAngle,
      maxAngle: b.maxAngle,
    })),
    tracks: Object.fromEntries(
      Object.entries(snapshot.tracks).map(([boneId, keys]) => [
        boneId,
        sortKeys(keys).map((k) => ({
          time: k.time,
          rotation: k.rotation,
          x: k.x,
          y: k.y,
          easing: k.easing,
        })),
      ]),
    ),
    actions: snapshot.appliedActions.map((a) => ({
      actionId: a.actionId,
      actionName: a.actionName,
      startTime: a.startTime,
      duration: a.duration,
    })),
  };
}

export function buildManifest(
  snapshot: DeliverySnapshot,
  version: number,
  resolution: Resolution,
  fps: number,
  createdAt: string,
  /** Number of frames actually written; defaults to the planned count. */
  actualFrameCount?: number,
): DeliveryManifest {
  const frameCount = actualFrameCount ?? frameCountOf(snapshot.duration, fps);
  const checksum = checksumOf(JSON.stringify(buildActionDataFile(snapshot, version, resolution)));
  return {
    format: 'MMS-SEQ-1',
    courseName: snapshot.courseName,
    shotCode: snapshot.code,
    shotTitle: snapshot.title,
    version,
    createdAt,
    resolution,
    fps,
    frameCount,
    duration: snapshot.duration,
    framePattern: FRAME_PATTERN(snapshot.code),
    bones: snapshot.rig.bones.map((b) => b.name),
    actions: snapshot.appliedActions.map((a) => a.actionName),
    checksum,
  };
}

export interface PackInput {
  shot: Shot;
  courseName: string;
  version: number;
  resolution: Resolution;
  fps: number;
  frames: Array<{ index: number; data: Uint8Array }>;
  actor: string;
  now?: string;
}

export interface PackResult {
  package: DeliveryPackage;
  zip: Uint8Array;
  files: string[];
}

export function packDelivery(input: PackInput): PackResult {
  const createdAt = input.now ?? nowIso();
  const snapshot = buildSnapshot(input.shot, input.courseName);
  snapshot.fps = input.fps;
  const actionData = buildActionDataFile(snapshot, input.version, input.resolution);
  const manifest = buildManifest(snapshot, input.version, input.resolution, input.fps, createdAt, input.frames.length);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const actionJson = JSON.stringify(actionData, null, 2);

  const files: Record<string, Uint8Array> = {};
  const names: string[] = [];
  for (const frame of input.frames) {
    const name = `frames/${frameFileName(snapshot.code, frame.index)}`;
    files[name] = frame.data;
    names.push(name);
  }
  files[`data/${snapshot.code}.action.json`] = strToU8(actionJson);
  files['manifest.json'] = strToU8(manifestJson);
  files['README.txt'] = strToU8(readmeText(manifest));
  names.push(`data/${snapshot.code}.action.json`, 'manifest.json', 'README.txt');

  const zip = zipSync(files, { level: 6 });
  let size = 0;
  for (const f of input.frames) size += f.data.byteLength;

  const pkg: DeliveryPackage = {
    id: uid('pkg'),
    projectId: input.shot.projectId,
    shotId: input.shot.id,
    version: input.version,
    createdAt,
    createdBy: input.actor,
    resolution: input.resolution,
    fps: input.fps,
    frameCount: input.frames.length,
    duration: snapshot.duration,
    checksum: manifest.checksum,
    sizeBytes: zip.byteLength,
    fileCount: names.length,
    manifest,
    snapshot,
  };

  return { package: pkg, zip, files: names };
}

function readmeText(manifest: DeliveryManifest): string {
  return [
    `课程：${manifest.courseName}`,
    `镜头：${manifest.shotCode}《${manifest.shotTitle}》 版本 v${manifest.version}`,
    `分辨率：${manifest.resolution.width}×${manifest.resolution.height} @ ${manifest.fps}fps`,
    `帧数：${manifest.frameCount}（${manifest.duration}s）`,
    `序列帧命名：frames/${manifest.shotCode}_0000.png 起`,
    `动作数据：data/${manifest.shotCode}.action.json（格式 MMS-ACTION-1）`,
    `校验码：${manifest.checksum}`,
    '',
    '目录结构',
    '  frames/   序列帧（PNG，按帧序号命名）',
    '  data/     动作数据，包含骨骼层级、关节角度范围与逐骨骼关键帧',
    '  manifest.json  交付清单',
    '',
    '动作数据中的 rotation 为相对中立姿势的角度（度），time 单位为秒，',
    'easing 描述该关键帧到下一关键帧之间的插值方式。',
  ].join('\n');
}

export function fileNameForZip(code: string, version: number): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `${code}_v${version}_${stamp}.zip`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
