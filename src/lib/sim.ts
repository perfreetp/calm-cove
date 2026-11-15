import type { Detection, TrackPoint } from './types';
import { analyseTrack, buildSnapshot } from './judge';
import { makeNoise, mulberry32 } from './geo';

const TAU = Math.PI * 2;

export interface SynthOpts {
  seed: number;
  laneCenterY: number;
  startX: number;
  startMark: number;
  endMark: number;
  startOffsetSec: number;
  secPer500: number;
  baseBias?: number;
  /** gaussian bump of lateral offset, metres */
  deviationAmp?: number;
  /** where the bump peaks, 0..1 of the distance */
  deviationAt?: number;
  deviationWidth?: number;
  missAtMark?: number;
  missAmp?: number;
  wobbly?: boolean;
}

export function splitsFromTrack(
  track: TrackPoint[],
  startX: number,
  startMark: number,
  endMark: number,
  markStep: number
): { mark: number; distance: number; t: number }[] {
  const out: { mark: number; distance: number; t: number }[] = [];
  let cursor = 1;
  for (let m = startMark; m <= endMark; m++) {
    const mx = startX + (m - startMark) * markStep;
    for (let i = cursor; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      if ((a.x - mx) * (b.x - mx) <= 0) {
        const f = b.x === a.x ? 0 : (mx - a.x) / (b.x - a.x);
        out.push({
          mark: m,
          distance: (m - startMark) * markStep,
          t: a.t + (b.t - a.t) * f
        });
        cursor = i;
        break;
      }
    }
  }
  return out;
}

export function synthTrack(o: SynthOpts, markStep: number): TrackPoint[] {
  const rnd = mulberry32(o.seed);
  const noise = makeNoise(o.seed + 11);
  const total = (o.endMark - o.startMark) * markStep;
  const avgV = 500 / o.secPer500;
  const swayPhase = rnd() * TAU;
  const p2 = rnd() * TAU;
  const p3 = rnd() * TAU;
  const p4 = rnd() * TAU;
  // slow drift period 400–900 m (a crew steering back and forth over a long stretch)
  const driftPeriod = 400 + rnd() * 500;
  const pts: TrackPoint[] = [];
  let dist = 0;
  let t = -o.startOffsetSec;
  let i = 0;
  const dt = 0.55;
  while (dist <= total + 0.6) {
    const f = Math.min(1, dist / total);
    const accel = 0.6 + 0.4 * (1 - Math.exp(-Math.max(0, dist) / 34));
    const fade = 0.962 + 0.038 * Math.cos(f * Math.PI * 1.12);
    const surge = Math.sin(f * Math.PI * 4.6 + swayPhase);
    const v = Math.max(
      1.2,
      avgV * (accel * fade + surge * 0.045 + noise(i * 0.11) * 0.022)
    );
    // lateral wander: long drift + two noise octaves + per-stroke ripple.
    // Amplitudes stay below the 3 m rule unless a deviation is injected.
    const ripple = Math.sin((dist / 22) * TAU + p3) * 0.16;
    let off =
      (o.baseBias ?? 0) +
      Math.sin((dist / driftPeriod) * TAU + swayPhase) * 0.7 +
      Math.sin((dist / 170) * TAU + p2) * 0.42 +
      noise(dist * 0.018 + 3.4) * 0.5 +
      ripple;
    if (o.wobbly) off += Math.sin((dist / 58) * TAU + p4) * 0.75 + noise(dist * 0.05) * 0.3;
    if (o.deviationAmp && o.deviationAt != null) {
      const peak = total * o.deviationAt;
      const w = o.deviationWidth ?? 62;
      const d = dist - peak;
      off += o.deviationAmp * Math.exp(-(d * d) / (2 * w * w));
    }
    if (o.missAmp && o.missAtMark != null) {
      // hold the excursion across the whole mark, not just one sample
      const mx = (o.missAtMark - o.startMark) * markStep;
      const d = dist - mx;
      off += o.missAmp * Math.exp(-(d * d) / (2 * 55 * 55));
    }
    pts.push({ x: o.startX + dist, y: o.laneCenterY + off, t });
    dist += v * dt;
    t += dt;
    i++;
  }
  return pts;
}

export interface SynthRunResult {
  track: TrackPoint[];
  splits: { mark: number; distance: number; t: number }[];
  detections: Detection[];
  maxDeviation: number;
  meanDeviation: number;
  durationSec: number;
  distanceM: number;
  startOffsetSec: number;
  snapshot: string;
}

export function synthRun(
  o: SynthOpts & {
    markStep: number;
    laneWidth: number;
    lane: number;
    boatId: string;
  }
): SynthRunResult {
  const track = synthTrack(o, o.markStep);
  const splits = splitsFromTrack(track, o.startX, o.startMark, o.endMark, o.markStep);
  const judged = analyseTrack({
    track,
    laneCenterY: o.laneCenterY,
    laneWidth: o.laneWidth,
    startX: o.startX,
    markStep: o.markStep,
    startMark: o.startMark,
    endMark: o.endMark,
    startOffsetSec: o.startOffsetSec,
    splits
  });
  const last = track[track.length - 1];
  const durationSec = last ? last.t : 0;
  const distanceM = (o.endMark - o.startMark) * o.markStep;
  const snapshot = buildSnapshot({
    id: '',
    boatId: o.boatId,
    lane: o.lane,
    laneCenterY: o.laneCenterY,
    laneWidth: o.laneWidth,
    startX: o.startX,
    track,
    detections: judged.detections,
    startMark: o.startMark,
    endMark: o.endMark,
    markStep: o.markStep,
    durationSec
  });
  return {
    track,
    splits,
    detections: judged.detections,
    maxDeviation: judged.maxDeviation,
    meanDeviation: judged.meanDeviation,
    durationSec,
    distanceM,
    startOffsetSec: o.startOffsetSec,
    snapshot
  };
}
