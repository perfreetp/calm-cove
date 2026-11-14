import type { RGBA, Vec2 } from '../core/types';

export function signedArea(points: Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function ensureWinding(points: Vec2[]): Vec2[] {
  return signedArea(points) < 0 ? [...points].reverse() : points;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function isEar(points: Vec2[], prev: number, cur: number, next: number, indices: number[]): boolean {
  const a = points[indices[prev]];
  const b = points[indices[cur]];
  const c = points[indices[next]];
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (cross <= 1e-9) return false;
  for (const idx of indices) {
    if (idx === indices[prev] || idx === indices[cur] || idx === indices[next]) continue;
    if (pointInTriangle(points[idx], a, b, c)) return false;
  }
  return true;
}

/**
 * Ear-clipping triangulation for simple polygons. Returns triangle indices into
 * the (possibly reversed) point list. Degenerate polygons return an empty list.
 */
export function triangulate(input: Vec2[]): number[] {
  const points = ensureWinding(input);
  if (points.length < 3) return [];
  const indices: number[] = points.map((_, i) => i);
  const result: number[] = [];
  let guard = 0;
  while (indices.length > 3 && guard < 10000) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const prev = (i - 1 + indices.length) % indices.length;
      const next = (i + 1) % indices.length;
      if (isEar(points, prev, i, next, indices)) {
        result.push(indices[prev], indices[i], indices[next]);
        indices.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) {
      // Polygon is self-intersecting or degenerate; fan triangulate the rest.
      break;
    }
  }
  if (indices.length >= 3) {
    for (let i = 1; i < indices.length - 1; i++) {
      result.push(indices[0], indices[i], indices[i + 1]);
    }
  }
  return result;
}

export function strokeQuads(points: Vec2[], width: number, closed: boolean): Array<[Vec2, Vec2, Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2, Vec2, Vec2]> = [];
  const pts = points;
  const segs = closed ? pts.length : pts.length - 1;
  const half = Math.max(width, 0.5) / 2;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * half;
    const ny = (dx / len) * half;
    out.push([
      { x: a.x + nx, y: a.y + ny },
      { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ]);
  }
  return out;
}

export function circlePoints(cx: number, cy: number, r: number, segments = 16): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

export function rgba(c: RGBA): [number, number, number, number] {
  return [c[0], c[1], c[2], c[3]];
}

/** Interpolate a polygon toward a camera-space representation, helper for hit tests. */
export function boundsOf(points: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}
