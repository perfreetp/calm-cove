// 曲线插值引擎：线性 / 缓入缓出 / 贝塞尔手柄
// 每个关键帧: { frame, value, interp: 'linear'|'ease'|'bezier', hx1, hy1, hx2, hy2 }
// 贝塞尔手柄为相对该帧的偏移（帧, 值），hx1/hy1 为出方向手柄，hx2/hy2 为下一段入方向手柄（存于下一帧语义上，这里统一存于段起点）

export function cubicBezier(t, p0, p1, p2, p3) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}

// 已知 x（0..1 归一化时间），求贝塞尔曲线上对应的 y
export function bezierYforX(x, x1, y1, x2, y2) {
  // 牛顿迭代求 t 使 bezierX(t) = x
  let t = x
  for (let i = 0; i < 8; i++) {
    const cx = cubicBezier(t, 0, x1, x2, 1) - x
    if (Math.abs(cx) < 1e-5) break
    const dx = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2)
    if (Math.abs(dx) < 1e-6) break
    t -= cx / dx
    t = Math.min(1, Math.max(0, t))
  }
  return cubicBezier(t, 0, y1, y2, 1)
}

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

// 在一条关键帧轨道上采样某一帧的值
export function sampleTrack(keys, frame) {
  if (!keys || keys.length === 0) return null
  const sorted = keys // 调用方保证按 frame 升序
  if (frame <= sorted[0].frame) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (frame >= last.frame) return last.value
  let i = 0
  while (i < sorted.length - 1 && sorted[i + 1].frame <= frame) i++
  const a = sorted[i]
  const b = sorted[i + 1]
  const span = b.frame - a.frame
  const t = span === 0 ? 0 : (frame - a.frame) / span
  const mode = a.interp || 'linear'
  if (mode === 'linear') return a.value + (b.value - a.value) * t
  if (mode === 'ease') return a.value + (b.value - a.value) * easeInOut(t)
  if (mode === 'bezier') {
    // 手柄为绝对帧/值坐标，归一化到段内
    const hx1 = a.hx1 != null ? a.hx1 : a.frame + span / 3
    const hy1 = a.hy1 != null ? a.hy1 : a.value
    const hx2 = a.hx2 != null ? a.hx2 : a.frame + (span * 2) / 3
    const hy2 = a.hy2 != null ? a.hy2 : b.value
    const x1 = Math.min(1, Math.max(0, (hx1 - a.frame) / span))
    const x2 = Math.min(1, Math.max(0, (hx2 - a.frame) / span))
    const y1 = span === 0 ? 0 : (hy1 - a.value) / (b.value - a.value || 1)
    const y2 = span === 0 ? 1 : (hy2 - a.value) / (b.value - a.value || 1)
    const k = bezierYforX(t, x1, y1, x2, y2)
    return a.value + (b.value - a.value) * k
  }
  return a.value + (b.value - a.value) * t
}

export function sortKeys(keys) {
  return keys.slice().sort((a, b) => a.frame - b.frame)
}
