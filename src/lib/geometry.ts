import type { Vec2 } from './types';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const rot = (a: Vec2, ang: number): Vec2 => ({
  x: a.x * Math.cos(ang) - a.y * Math.sin(ang),
  y: a.x * Math.sin(ang) + a.y * Math.cos(ang),
});
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/** 角度归一化到 [-PI, PI] */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** 点到线段距离 */
export function pointSegDist(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const t = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y || 1), 0, 1);
  return dist(p, add(a, scale(ab, t)));
}

/** 两线段是否相交(不含共线端点接触) */
export function segIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = d(b1, b2, a1);
  const d2 = d(b1, b2, a2);
  const d3 = d(a1, a2, b1);
  const d4 = d(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * 用相切圆弧连接两段行进方向,返回控制点折线(用于渲染)与弧长。
 * 从 p1(方向 d1)行进,转弯后朝 d2 方向到达 p2。
 */
export function arcPath(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2, samples = 14) {
  const n1 = perp(d1);
  const n2 = perp(d2);
  // 求两偏移线交点作为圆心
  const denom = d1.x * n2.x - n1.x * d2.x;
  let points: Vec2[] = [p1];
  let arcLen = dist(p1, p2);
  let circle: { cx: number; cy: number; r: number; a0: number; a1: number } | null = null;

  if (Math.abs(denom) > 1e-6) {
    const t = ((p2.x - p1.x) * n2.x - (p2.y - p1.y) * n2.y) / denom;
    const c = add(p1, scale(n1, t));
    const r = Math.abs(t);
    if (r > 2 && r < 60) {
      const a0 = Math.atan2(p1.y - c.y, p1.x - c.x);
      const a1 = Math.atan2(p2.y - c.y, p2.x - c.x);
      let delta = wrapAngle(a1 - a0);
      // 沿角度增大方向的切向,校验是否与行进方向 d1 同向;反向则翻转扫掠方向
      const tanPos = { x: -Math.sin(a0), y: Math.cos(a0) };
      if (tanPos.x * d1.x + tanPos.y * d1.y < 0) {
        delta = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
      }
      circle = { cx: c.x, cy: c.y, r, a0, a1: a0 + delta };
      arcLen = Math.abs(delta) * r;
      points = [p1];
      for (let i = 1; i <= samples; i++) {
        const a = a0 + (delta * i) / samples;
        points.push({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
      }
    }
  }
  if (!circle) points = [p1, p2];
  return { points, arcLen, circle };
}

/** 障碍朝向的横移向量与前进向量 */
export function facingVectors(angle: number): { forward: Vec2; side: Vec2 } {
  const forward = { x: Math.cos(angle), y: Math.sin(angle) };
  return { forward, side: perp(forward) };
}
