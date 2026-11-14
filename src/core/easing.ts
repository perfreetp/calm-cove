import type { Easing } from './types';

export const LINEAR: Easing = { type: 'linear' };
export const EASE_IN_OUT: Easing = { type: 'easeInOut' };

export function bezierEasing(x1: number, y1: number, x2: number, y2: number): Easing {
  return {
    type: 'bezier',
    p1: { x: clamp01(x1), y: y1 },
    p2: { x: clamp01(x2), y: y2 },
  };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Standard CSS cubic-bezier control points for ease-in-out. */
const EASE_IN_OUT_POINTS = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };

function bezierCoord(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

function bezierSlope(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * p1 + 6 * mt * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * Solve for the parameter t that produces x = target, using Newton-Raphson with
 * bisection fallback. Keeps the curve well behaved for flat segments.
 */
export function solveBezierT(target: number, x1: number, x2: number): number {
  if (target <= 0) return 0;
  if (target >= 1) return 1;
  let t = target;
  for (let i = 0; i < 8; i++) {
    const x = bezierCoord(t, x1, x2) - target;
    if (Math.abs(x) < 1e-6) return t;
    const d = bezierSlope(t, x1, x2);
    if (Math.abs(d) < 1e-6) break;
    t -= x / d;
    if (t < 0 || t > 1) break;
  }
  let lo = 0;
  let hi = 1;
  t = target;
  for (let i = 0; i < 40; i++) {
    const x = bezierCoord(t, x1, x2);
    if (Math.abs(x - target) < 1e-6) return t;
    if (x < target) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return t;
}

/** Maps normalised progress (0..1) through the easing curve. */
export function applyEasing(easing: Easing, progress: number): number {
  const p = clamp01(progress);
  switch (easing.type) {
    case 'linear':
      return p;
    case 'easeInOut': {
      const t = solveBezierT(p, EASE_IN_OUT_POINTS.x1, EASE_IN_OUT_POINTS.x2);
      return bezierCoord(t, EASE_IN_OUT_POINTS.y1, EASE_IN_OUT_POINTS.y2);
    }
    case 'bezier': {
      const t = solveBezierT(p, easing.p1.x, easing.p2.x);
      return bezierCoord(t, easing.p1.y, easing.p2.y);
    }
    default:
      return p;
  }
}

/** Sample points for drawing a bezier easing graph in the UI. */
export function bezierSamples(p1: { x: number; y: number }, p2: { x: number; y: number }, steps = 32) {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push({ x: bezierCoord(t, p1.x, p2.x), y: bezierCoord(t, p1.y, p2.y) });
  }
  return out;
}

export function easingLabel(easing: Easing): string {
  switch (easing.type) {
    case 'linear':
      return '线性';
    case 'easeInOut':
      return '缓入缓出';
    case 'bezier':
      return `贝塞尔 ${easing.p1.x.toFixed(2)},${easing.p1.y.toFixed(2)} / ${easing.p2.x.toFixed(2)},${easing.p2.y.toFixed(2)}`;
  }
}

export const EASING_PRESETS = {
  linear: { type: 'linear' } as Easing,
  easeInOut: { type: 'easeInOut' } as Easing,
  /** A gentle ease with slight overshoot at the tail, good for clinical accents. */
  bezier: { type: 'bezier', p1: { x: 0.25, y: 0.1 }, p2: { x: 0.55, y: 1.22 } } as Easing,
};
