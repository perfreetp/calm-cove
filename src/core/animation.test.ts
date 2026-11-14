import { describe, expect, it } from 'vitest';
import { applyEasing, bezierEasing, EASE_IN_OUT, LINEAR, solveBezierT } from './easing';
import { sampleTrack, sliceTracks, upsertKeyframe, sortKeys, offsetTracks } from './animation';
import type { Keyframe, TrackMap } from './types';

function key(time: number, rotation: number, easing: Keyframe['easing'] = EASE_IN_OUT): Keyframe {
  return { id: `k${time}`, time, rotation, x: 0, y: 0, easing };
}

describe('easing', () => {
  it('linear maps progress directly', () => {
    expect(applyEasing(LINEAR, 0.25)).toBeCloseTo(0.25, 6);
    expect(applyEasing(LINEAR, 1)).toBe(1);
  });

  it('clamps progress outside 0..1', () => {
    expect(applyEasing(LINEAR, -3)).toBe(0);
    expect(applyEasing(EASE_IN_OUT, 4)).toBe(1);
  });

  it('ease-in-out is symmetric and monotonic', () => {
    const samples = Array.from({ length: 21 }, (_, i) => applyEasing(EASE_IN_OUT, i / 20));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] - 1e-9);
    }
    expect(samples[0]).toBeCloseTo(0, 5);
    expect(samples[samples.length - 1]).toBeCloseTo(1, 5);
    expect(samples[10]).toBeCloseTo(0.5, 3);
    expect(samples[5] + samples[15]).toBeCloseTo(1, 3);
  });

  it('custom bezier honours the requested curve', () => {
    const ease = bezierEasing(0.1, 0.9, 0.9, 0.1);
    // A steep early rise: at 20% progress the value should already be high-ish.
    expect(applyEasing(ease, 0.2)).toBeGreaterThan(0.3);
    expect(applyEasing(ease, 0)).toBe(0);
    expect(applyEasing(ease, 1)).toBe(1);
  });

  it('solves x for flat control point segments', () => {
    const t = solveBezierT(0.5, 0, 0);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
    expect(applyEasing({ type: 'bezier', p1: { x: 0, y: 0 }, p2: { x: 0, y: 1 } }, 0.5)).toBeGreaterThan(0.4);
  });
});

describe('track sampling', () => {
  const keys = [key(0, 0, LINEAR), key(1, 90, LINEAR), key(2, 45)];

  it('holds the first value before the first key', () => {
    expect(sampleTrack(keys, -1).rotation).toBe(0);
  });

  it('holds the last value after the last key', () => {
    expect(sampleTrack(keys, 9).rotation).toBe(45);
  });

  it('interpolates linearly on linear segments', () => {
    expect(sampleTrack(keys, 0.5).rotation).toBeCloseTo(45, 5);
  });

  it('uses the easing stored on the *start* key', () => {
    const withEase = [key(0, 0, EASE_IN_OUT), key(1, 100, LINEAR)];
    const mid = sampleTrack(withEase, 0.5).rotation;
    expect(mid).toBeCloseTo(50, 1);
    const quarter = sampleTrack(withEase, 0.25).rotation;
    // ease-in-out is slower than linear at the start
    expect(quarter).toBeLessThan(25);
  });

  it('returns zeros for an empty track', () => {
    expect(sampleTrack([], 3)).toEqual({ rotation: 0, x: 0, y: 0 });
  });

  it('handles a single key as a constant', () => {
    expect(sampleTrack([key(2, 33)], 0).rotation).toBe(33);
    expect(sampleTrack([key(2, 33)], 8).rotation).toBe(33);
  });

  it('sorts unordered input', () => {
    const unordered = [key(2, 45), key(0, 0), key(1, 90)];
    expect(sampleTrack(unordered, 0.5).rotation).toBeCloseTo(45, 5);
  });
});

describe('keyframe editing', () => {
  it('upserts at an existing time instead of duplicating', () => {
    let keys = upsertKeyframe([], 1, { rotation: 10, x: 0, y: 0 });
    keys = upsertKeyframe(keys, 1, { rotation: 40, x: 0, y: 0 });
    expect(keys).toHaveLength(1);
    expect(keys[0].rotation).toBe(40);
  });

  it('keeps the lane sorted by time', () => {
    let keys: Keyframe[] = [];
    keys = upsertKeyframe(keys, 2, { rotation: 0, x: 0, y: 0 });
    keys = upsertKeyframe(keys, 0.5, { rotation: 0, x: 0, y: 0 });
    keys = upsertKeyframe(keys, 1, { rotation: 0, x: 0, y: 0 });
    expect(keys.map((k) => k.time)).toEqual([0.5, 1, 2]);
  });

  it('inherits the easing of the preceding key for new keys', () => {
    const custom = bezierEasing(0.2, 0.3, 0.8, 0.9);
    let keys = upsertKeyframe([], 0, { rotation: 0, x: 0, y: 0 }, custom);
    keys = upsertKeyframe(keys, 1, { rotation: 10, x: 0, y: 0 });
    expect(keys[1].easing).toEqual(custom);
  });
});

describe('copying motion between shots', () => {
  const tracks: TrackMap = {
    head: [key(0, 0, LINEAR), key(1, 20, LINEAR), key(2, 40, LINEAR)],
  };

  it('slices a window and rebases it to the requested start', () => {
    const sliced = sliceTracks(tracks, { start: 1, end: 2 }, 0.5);
    expect(sliced.head.map((k) => k.time)).toEqual([0.5, 1.5]);
    expect(sliced.head.map((k) => k.rotation)).toEqual([20, 40]);
  });

  it('produces fresh key ids so the two shots stay independent', () => {
    const sliced = sliceTracks(tracks, { start: 0, end: 2 }, 0);
    expect(sliced.head[0].id).not.toBe(tracks.head[0].id);
  });

  it('drops keys outside the shot when offset', () => {
    const shifted = offsetTracks(tracks, 1.5, 3);
    expect(shifted.head.map((k) => k.time)).toEqual([1.5, 2.5]);
  });
});

describe('sortKeys', () => {
  it('does not mutate the input array', () => {
    const input = [key(2, 0), key(1, 0)];
    const out = sortKeys(input);
    expect(input[0].time).toBe(2);
    expect(out[0].time).toBe(1);
  });
});
