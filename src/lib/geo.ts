import type { Vec } from './types';

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** smooth deterministic noise in [-1,1] using seeded samples */
export function makeNoise(seed: number) {
  const rnd = mulberry32(seed);
  const kel = Array.from({ length: 32 }, () => rnd() * 2 - 1);
  return (t: number) => {
    const p = ((t % 32) + 32) % 32;
    const i = Math.floor(p);
    const f = p - i;
    const a = kel[i];
    const b = kel[(i + 1) % 32];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function catmullRomPath(pts: Vec[], closed = true, tension = 0.5): string {
  if (pts.length < 2) return '';
  const n = pts.length;
  const out: string[] = [];
  const get = (i: number): Vec => {
    if (closed) return pts[(i + n) % n];
    return pts[clamp(i, 0, n - 1)];
  };
  const fmt = (v: number) => Math.round(v * 10) / 10;
  if (!closed) out.push(`M${fmt(pts[0].x)},${fmt(pts[0].y)}`);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    const k = tension / 3;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    out.push(
      `C${fmt(c1x)},${fmt(c1y)} ${fmt(c2x)},${fmt(c2y)} ${fmt(p2.x)},${fmt(p2.y)}`
    );
  }
  if (closed) out.unshift(`M${fmt(pts[0].x)},${fmt(pts[0].y)}`);
  return out.join(' ');
}

export function polylinePath(pts: Vec[]): string {
  if (!pts.length) return '';
  return `M${pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' L')}`;
}

export function polygonFromLoop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  noise: (t: number) => number,
  count = 54,
  jitter = 0.1,
  phase = 0
): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 1 + noise(i * 0.26 + phase) * jitter + noise(i * 0.61 + phase * 2) * jitter * 0.4;
    pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return pts;
}

export function insetLoop(pts: Vec[], cx: number, cy: number, factor: number): Vec[] {
  return pts.map((p) => ({ x: cx + (p.x - cx) * factor, y: cy + (p.y - cy) * factor }));
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function bboxOfPath(pts: Vec[]) {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export function pointInPolygon(p: Vec, poly: Vec[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** decimate a polyline keeping important extremes (perpendicular offset) */
export function decimate(pts: Vec[], maxPoints: number): Vec[] {
  if (pts.length <= maxPoints) return pts;
  const stride = Math.ceil(pts.length / maxPoints);
  const out: Vec[] = [pts[0]];
  for (let i = stride; i < pts.length - 1; i += stride) {
    // keep the most extreme point in each bucket so deviations survive
    const next = Math.min(pts.length - 1, i + stride);
    let best = i;
    let bestD = -1;
    for (let j = i; j < next; j++) {
      const d = Math.abs(pts[j].x - pts[i - stride].x) + Math.abs(pts[j].y - pts[i - stride].y);
      if (d > bestD) {
        bestD = d;
        best = j;
      }
    }
    out.push(pts[best]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function formatDurationShort(sec: number): string {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec - m * 60);
  return `${m}′${String(s).padStart(2, '0')}″`;
}

export function formatClock(epoch: number): string {
  const d = new Date(epoch);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDateKey(epoch: number): string {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function formatStamp(epoch: number): string {
  const d = new Date(epoch);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortDay(key: string): string {
  const d = new Date(key + 'T00:00:00');
  const w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getMonth() + 1}.${d.getDate()} 周${w}`;
}
