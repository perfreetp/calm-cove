import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import {
  buildManifest,
  buildSnapshot,
  checksumOf,
  frameCountOf,
  frameFileName,
  packDelivery,
  FRAME_PATTERN,
} from './delivery';
import { buildRig } from './templates';
import { EASE_IN_OUT, LINEAR, bezierEasing } from './easing';
import { decodePng } from '../test/png-decode';
import { encodePng } from '../render/png';
import type { Keyframe, Shot, TrackMap } from './types';

function key(time: number, rotation: number, easing: Keyframe['easing'] = LINEAR): Keyframe {
  return { id: `k${time}`, time, rotation, x: 0, y: 0, easing };
}

function shot(): Shot {
  return {
    id: 'shot-1',
    projectId: 'p1',
    code: 'S01',
    title: '俯屈起始',
    order: 0,
    duration: 2,
    assignee: '林岚',
    status: 'approved',
    reworkCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rig: buildRig('fetus'),
    tracks: {
      fetal_head: [key(0, 0, EASE_IN_OUT), key(1, 25, bezierEasing(0.3, 0.1, 0.7, 0.95)), key(2, 10, LINEAR)],
    } satisfies TrackMap,
    appliedActions: [],
    reviews: [
      {
        id: 'r1',
        round: 1,
        submittedAt: '',
        submittedBy: '林岚',
        verdict: 'approved',
        reviewer: '郑蔚',
        comments: [],
      },
    ],
    versions: [{ id: 'v1', version: 1, createdAt: '', createdBy: '郑蔚', reviewId: 'r1' }],
  };
}

describe('delivery snapshot', () => {
  it('deep clones so later edits cannot leak into a locked version', () => {
    const s = shot();
    const snapshot = buildSnapshot(s, '课程');
    s.tracks.fetal_head[0].rotation = 999;
    expect(snapshot.tracks.fetal_head[0].rotation).toBe(0);
  });

  it('keeps bezier handles in the snapshot', () => {
    const snapshot = buildSnapshot(shot(), '课程');
    const middle = snapshot.tracks.fetal_head[1].easing;
    expect(middle.type).toBe('bezier');
    if (middle.type === 'bezier') {
      expect(middle.p1.x).toBeCloseTo(0.3, 6);
      expect(middle.p2.y).toBeCloseTo(0.95, 6);
    }
  });

  it('keeps the full rig hierarchy', () => {
    const snapshot = buildSnapshot(shot(), '课程');
    expect(snapshot.rig.bones.length).toBeGreaterThan(5);
    expect(snapshot.rig.parts.length).toBeGreaterThan(5);
  });
});

describe('frame counting', () => {
  it('rounds duration*fps to whole frames', () => {
    expect(frameCountOf(2, 24)).toBe(48);
    expect(frameCountOf(2.5, 24)).toBe(60);
    expect(frameCountOf(0.01, 24)).toBe(1);
  });

  it('names frames with a 4-digit index', () => {
    expect(frameFileName('S01', 7)).toBe('S01_0007.png');
    expect(frameFileName('S01', 1234)).toBe('S01_1234.png');
  });

  it('publishes the frame pattern in the manifest', () => {
    expect(FRAME_PATTERN('S01')).toBe('S01_####.png');
  });
});

describe('package packing', () => {
  const png = encodePng(4, 4, new Uint8Array(4 * 4 * 4).fill(120));

  it('writes frames, action data, manifest and readme into the zip', () => {
    const result = packDelivery({
      shot: shot(),
      courseName: '课程',
      version: 1,
      resolution: { width: 4, height: 4, label: '4x4' },
      fps: 24,
      frames: [
        { index: 0, data: png },
        { index: 1, data: png },
      ],
      actor: '林岚',
      now: '2026-05-01T00:00:00.000Z',
    });
    const entries = unzipSync(result.zip);
    const names = Object.keys(entries);
    expect(names).toContain('frames/S01_0000.png');
    expect(names).toContain('frames/S01_0001.png');
    expect(names).toContain('data/S01.action.json');
    expect(names).toContain('manifest.json');
    expect(names).toContain('README.txt');

    const manifest = JSON.parse(strFromU8(entries['manifest.json'])) as ReturnType<typeof buildManifest>;
    expect(manifest.format).toBe('MMS-SEQ-1');
    expect(manifest.version).toBe(1);
    expect(manifest.resolution.label).toBe('4x4');
    expect(manifest.bones.length).toBeGreaterThan(0);
    expect(manifest.frameCount).toBe(2);

    const action = JSON.parse(strFromU8(entries['data/S01.action.json'])) as {
      format: string;
      tracks: Record<string, Array<{ time: number; rotation: number; easing: unknown }>>;
    };
    expect(action.format).toBe('MMS-ACTION-1');
    expect(action.tracks.fetal_head[1].easing).toMatchObject({ type: 'bezier' });
  });

  it('encodes frame data as valid PNGs', () => {
    const result = packDelivery({
      shot: shot(),
      courseName: '课程',
      version: 1,
      resolution: { width: 4, height: 4, label: '4x4' },
      fps: 24,
      frames: [{ index: 0, data: png }],
      actor: '林岚',
    });
    const entries = unzipSync(result.zip);
    const decoded = decodePng(entries['frames/S01_0000.png']);
    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(4);
    expect(decoded.rgba[0]).toBe(120);
  });

  it('reports package metadata consistently', () => {
    const result = packDelivery({
      shot: shot(),
      courseName: '课程',
      version: 2,
      resolution: { width: 8, height: 8, label: '8x8' },
      fps: 12,
      frames: [
        { index: 0, data: png },
        { index: 1, data: png },
        { index: 2, data: png },
      ],
      actor: '林岚',
    });
    expect(result.package.version).toBe(2);
    expect(result.package.frameCount).toBe(3);
    expect(result.package.fileCount).toBe(6);
    expect(result.package.checksum).toBe(result.package.manifest.checksum);
    expect(result.files).toHaveLength(6);
  });

  it('is deterministic for the same content', () => {
    const a = buildSnapshot(shot(), '课程');
    const b = buildSnapshot(shot(), '课程');
    expect(checksumOf(JSON.stringify(a.tracks))).toBe(checksumOf(JSON.stringify(b.tracks)));
  });

  it('changes the checksum when the animation changes', () => {
    const a = buildManifest(buildSnapshot(shot(), '课程'), 1, { width: 8, height: 8, label: '8x8' }, 12, 'now');
    const modified = shot();
    modified.tracks.fetal_head[1].rotation = 40;
    const b = buildManifest(buildSnapshot(modified, '课程'), 1, { width: 8, height: 8, label: '8x8' }, 12, 'now');
    expect(a.checksum).not.toBe(b.checksum);
  });
});
