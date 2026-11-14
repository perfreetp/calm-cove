// ============ 缓动曲线（三次贝塞尔，与 CSS cubic-bezier 同构） ============
import type { EasingType, MotionSegment, Vec2 } from '@/types'

const PRESETS: Record<Exclude<EasingType, 'custom'>, [Vec2, Vec2]> = {
  linear: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  easeIn: [{ x: 0.42, y: 0 }, { x: 1, y: 1 }],
  easeOut: [{ x: 0, y: 0 }, { x: 0.58, y: 1 }],
  easeInOut: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }]
}

export function controlPointsOf(seg: MotionSegment): [Vec2, Vec2] {
  return seg.easing === 'custom' ? seg.cubicBezier : PRESETS[seg.easing]
}

function bezierAxis(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const u = 1 - s
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3 + u * u * u * p0
}

/** 给定时间比例 t(0..1)，求贝塞尔参数 s 使 x(s)=t，返回 y(s) */
export function easeValue(seg: MotionSegment, t: number): number {
  const [p1, p2] = controlPointsOf(seg)
  if (t <= 0) return 0
  if (t >= 1) return 1
  // 二分求解 x(s)=t
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const x = bezierAxis(0, p1.x, p2.x, 1, mid)
    if (x < t) lo = mid
    else hi = mid
  }
  const s = (lo + hi) / 2
  return bezierAxis(0, p1.y, p2.y, 1, s)
}

/** 缓动一阶导 dy/dt（用于速度） */
export function easeDerivative(seg: MotionSegment, t: number): number {
  const e = 1e-4
  const t0 = Math.max(0, t - e)
  const t1 = Math.min(1, t + e)
  return (easeValue(seg, t1) - easeValue(seg, t0)) / (t1 - t0)
}

/** 缓动二阶导 d²y/dt²（用于加速度） */
export function easeSecondDerivative(seg: MotionSegment, t: number): number {
  const e = 1e-3
  const t0 = Math.max(0, t - e)
  const t1 = Math.min(1, t + e)
  return (easeDerivative(seg, t1) - easeDerivative(seg, t0)) / (t1 - t0)
}

/** 生成编辑器用的曲线采样点 */
export function sampleCurve(seg: MotionSegment, n = 60): { t: number; y: number }[] {
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push({ t, y: easeValue(seg, t) })
  }
  return out
}
