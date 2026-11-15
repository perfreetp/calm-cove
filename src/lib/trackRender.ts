import type { Run, TrackPoint } from './types';

/**
 * Pre-computed polyline strings at three detail levels so that pan/zoom never
 * rebuilds geometry. Each run renders as ONE <path>, not one node per point.
 */
export interface TrackGeometry {
  full: number;
  l0: string;
  l1: string;
  l2: string;
  l3: string;
  marks: { x: number; y: number; t: number; mark: number }[];
}

const cache = new Map<string, TrackGeometry>();

function path(pts: TrackPoint[]): string {
  if (!pts.length) return '';
  let s = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) s += `L${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  return s;
}

function decimate(pts: TrackPoint[], step: number): TrackPoint[] {
  if (step <= 1) return pts;
  const out: TrackPoint[] = [];
  for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

export function trackGeometry(run: Run): TrackGeometry {
  const hit = cache.get(run.id);
  if (hit) return hit;
  const n = run.track.length;
  const geo: TrackGeometry = {
    full: n,
    l0: path(decimate(run.track, Math.max(1, Math.round(n / 22)))),
    l1: path(decimate(run.track, Math.max(1, Math.round(n / 60)))),
    l2: path(decimate(run.track, Math.max(1, Math.round(n / 170)))),
    l3: path(run.track),
    marks: run.splits
      .map((s) => {
        const idx = Math.min(
          run.track.length - 1,
          Math.max(0, Math.round(((s.t + 1) / (run.durationSec + 1)) * (run.track.length - 1)))
        );
        return { x: run.track[idx].x, y: run.track[idx].y, t: s.t, mark: s.mark };
      })
      .slice(1, -1)
  };
  cache.set(run.id, geo);
  return geo;
}

/** position of a run at a time t (seconds since gun), lerped */
export function positionAt(run: Run, t: number): { x: number; y: number; idx: number } {
  const tr = run.track;
  if (!tr.length) return { x: 0, y: 0, idx: 0 };
  if (t <= tr[0].t) return { x: tr[0].x, y: tr[0].y, idx: 0 };
  if (t >= tr[tr.length - 1].t) {
    const last = tr[tr.length - 1];
    return { x: last.x, y: last.y, idx: tr.length - 1 };
  }
  // binary search
  let lo = 0;
  let hi = tr.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (tr[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = tr[lo];
  const b = tr[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, idx: lo };
}
