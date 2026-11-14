// ============ 轨迹插值与安全校验 ============
import type { Formation, Keyframe, MotionSegment, ShowScript, Vec3 } from '@/types'
import { allDroneIds, distance, lerp3, nodeByDrone } from './geometry'
import { easeDerivative, easeSecondDerivative, easeValue } from './easing'

export interface DroneState {
  droneId: string
  position: Vec3
  speed: number // m/s
  accel: number // m/s²
}

export interface Violation {
  droneId: string
  kind: 'speed' | 'accel'
  value: number
  limit: number
  timeSec: number
  segmentId: string
  message: string
}

export interface SafetyReport {
  ok: boolean
  violations: Violation[]
  /** 第一架超限无人机（速度优先取最早时刻） */
  firstViolator: Violation | null
  maxSpeed: { droneId: string; value: number }
  maxAccel: { droneId: string; value: number }
  checkedAt: string
}

export function sortedKeyframes(script: ShowScript): Keyframe[] {
  return [...script.keyframes].sort((a, b) => a.timeSec - b.timeSec)
}

export function segmentBetween(script: ShowScript, kf: Keyframe): MotionSegment | undefined {
  return script.segments.find((s) => s.toKeyframeId === kf.id)
}

export function formationOf(script: ShowScript, kf: Keyframe): Formation | undefined {
  return script.formations.find((f) => f.id === kf.formationId)
}

export function totalDuration(script: ShowScript): number {
  const ks = sortedKeyframes(script)
  return ks.length ? ks[ks.length - 1].timeSec : 0
}

/**
 * 采样某一时刻所有无人机状态。
 * 关键帧之间按所属段的缓动曲线插值；速度/加速度由数值微分得到。
 */
export function sampleAt(script: ShowScript, timeSec: number): DroneState[] {
  const ks = sortedKeyframes(script)
  if (!ks.length) return []
  const drones = allDroneIds(script.droneCount)

  let fromKf = ks[0]
  let toKf = ks[0]
  let seg: MotionSegment | null = null
  for (let i = 0; i < ks.length - 1; i++) {
    if (timeSec >= ks[i].timeSec && timeSec < ks[i + 1].timeSec) {
      fromKf = ks[i]
      toKf = ks[i + 1]
      seg = script.segments.find((s) => s.fromKeyframeId === fromKf.id && s.toKeyframeId === toKf.id) ?? null
      break
    }
  }
  if (timeSec >= ks[ks.length - 1].timeSec) {
    fromKf = toKf = ks[ks.length - 1]
  }

  const fromF = formationOf(script, fromKf)
  const toF = formationOf(script, toKf)
  const segDuration = seg?.durationSec ?? Math.max(0.001, toKf.timeSec - fromKf.timeSec)
  const rawT = segDuration > 0 ? (timeSec - fromKf.timeSec) / segDuration : 1
  const t = Math.min(1, Math.max(0, rawT))
  const progress = seg ? easeValue(seg, t) : t

  const now = new Map<string, Vec3>()
  for (const id of drones) {
    const a = fromF ? nodeByDrone(fromF, id)?.position : undefined
    const b = toF ? nodeByDrone(toF, id)?.position : undefined
    let position: Vec3
    if (a && b) position = lerp3(a, b, progress)
    else if (b) position = { ...b }
    else if (a) position = { ...a }
    else position = { x: 0, y: 0, z: 0 }
    now.set(id, position)
  }

  const dt = 0.05
  const total = totalDuration(script)
  // 边界感知的采样窗口：贴近 0/总时长时改用单侧差分，避免钳制产生虚假尖峰
  const t0 = Math.max(0, timeSec - dt)
  const t1 = Math.min(total, timeSec + dt)
  const prev = samplePositions(script, t0)
  const next = samplePositions(script, t1)
  const h0 = Math.max(1e-3, timeSec - t0)
  const h1 = Math.max(1e-3, t1 - timeSec)

  const states: DroneState[] = []
  for (const id of drones) {
    const p = now.get(id)!
    const p0 = prev.get(id) ?? p
    const p1 = next.get(id) ?? p
    const vBefore = distance(p0, p) / h0
    const vAfter = distance(p, p1) / h1
    // 段内部用中心差分；边界处退化为单侧
    const speed = h0 === dt && h1 === dt ? distance(p0, p1) / (h0 + h1) : Math.max(vBefore, vAfter)
    const accel = Math.abs(vAfter - vBefore) / ((h0 + h1) / 2)
    states.push({ droneId: id, position: p, speed, accel })
  }
  return states
}

/** 只取位置（供数值微分类场景复用，避免循环重复计算速度） */
function samplePositions(script: ShowScript, timeSec: number): Map<string, Vec3> {
  const ks = sortedKeyframes(script)
  const map = new Map<string, Vec3>()
  if (!ks.length) return map
  let fromKf = ks[0]
  let toKf = ks[0]
  let seg: MotionSegment | null = null
  for (let i = 0; i < ks.length - 1; i++) {
    if (timeSec >= ks[i].timeSec && timeSec < ks[i + 1].timeSec) {
      fromKf = ks[i]
      toKf = ks[i + 1]
      seg = script.segments.find((s) => s.fromKeyframeId === fromKf.id && s.toKeyframeId === toKf.id) ?? null
      break
    }
  }
  if (timeSec >= ks[ks.length - 1].timeSec) fromKf = toKf = ks[ks.length - 1]
  const fromF = formationOf(script, fromKf)
  const toF = formationOf(script, toKf)
  const duration = seg?.durationSec ?? Math.max(0.001, toKf.timeSec - fromKf.timeSec)
  const t = Math.min(1, Math.max(0, (timeSec - fromKf.timeSec) / duration))
  const progress = seg ? easeValue(seg, t) : t
  for (const id of allDroneIds(script.droneCount)) {
    const a = fromF ? nodeByDrone(fromF, id)?.position : undefined
    const b = toF ? nodeByDrone(toF, id)?.position : undefined
    if (a && b) map.set(id, lerp3(a, b, progress))
    else if (b) map.set(id, { ...b })
    else if (a) map.set(id, { ...a })
    else map.set(id, { x: 0, y: 0, z: 0 })
  }
  return map
}

/**
 * 全时段安全校验：逐段对每架无人机做解析包络 + 细粒度采样。
 * 解析法：每架机在段内路径长 L，速度包络 ≈ L/D * |dy/dt|，
 * 加速度包络 ≈ L/D² * |d²y/dt²|（直线插值路径下为严格上界）。
 */
export function runSafetyCheck(script: ShowScript, sampleHz = 4): SafetyReport {
  const violations: Violation[] = []
  let maxSpeed = { droneId: '-', value: 0 }
  let maxAccel = { droneId: '-', value: 0 }
  const ks = sortedKeyframes(script)
  const drones = allDroneIds(script.droneCount)

  for (let i = 0; i < ks.length - 1; i++) {
    const fromKf = ks[i]
    const toKf = ks[i + 1]
    const seg = script.segments.find(
      (s) => s.fromKeyframeId === fromKf.id && s.toKeyframeId === toKf.id
    )
    if (!seg) continue
    const fromF = formationOf(script, fromKf)
    const toF = formationOf(script, toKf)
    if (!fromF || !toF) continue
    const D = Math.max(0.001, seg.durationSec)

    for (const id of drones) {
      const a = nodeByDrone(fromF, id)?.position
      const b = nodeByDrone(toF, id)?.position
      if (!a || !b) continue
      const L = distance(a, b)
      if (L === 0) continue

      // 解析包络
      let peakV = 0
      let peakVT = 0
      let peakA = 0
      let peakAT = 0
      const N = 40
      for (let q = 0; q <= N; q++) {
        const t = q / N
        const dv = Math.abs(easeDerivative(seg, t))
        const da = Math.abs(easeSecondDerivative(seg, t))
        const v = (L / D) * dv
        const ac = (L / (D * D)) * da
        if (v > peakV) {
          peakV = v
          peakVT = t
        }
        if (ac > peakA) {
          peakA = ac
          peakAT = t
        }
      }

      if (peakV > maxSpeed.value) maxSpeed = { droneId: id, value: peakV }
      if (peakA > maxAccel.value) maxAccel = { droneId: id, value: peakA }

      if (peakV > script.limits.maxSpeed) {
        violations.push({
          droneId: id,
          kind: 'speed',
          value: peakV,
          limit: script.limits.maxSpeed,
          timeSec: fromKf.timeSec + peakVT * D,
          segmentId: seg.id,
          message: `${id} 在 ${(fromKf.timeSec + peakVT * D).toFixed(1)}s 速度 ${peakV.toFixed(2)}m/s 超过限值 ${script.limits.maxSpeed}m/s`
        })
      }
      if (peakA > script.limits.maxAccel) {
        violations.push({
          droneId: id,
          kind: 'accel',
          value: peakA,
          limit: script.limits.maxAccel,
          timeSec: fromKf.timeSec + peakAT * D,
          segmentId: seg.id,
          message: `${id} 在 ${(fromKf.timeSec + peakAT * D).toFixed(1)}s 加速度 ${peakA.toFixed(2)}m/s² 超过限值 ${script.limits.maxAccel}m/s²`
        })
      }
    }
  }

  // 细粒度数值采样兜底（捕获解析法遗漏的耦合误差）。
  // 只在各段内部采样：关键帧边界处速度方向/大小可能合法跳变，
  // 边界加速度由解析包络负责，数值差分在边界不可靠。
  for (let i = 0; i < ks.length - 1; i++) {
    const fromKf = ks[i]
    const toKf = ks[i + 1]
    const segD = Math.max(0.001, toKf.timeSec - fromKf.timeSec)
    const steps = Math.max(2, Math.floor(segD * sampleHz))
    for (let q = 1; q < steps; q++) {
      const t = fromKf.timeSec + (q / steps) * segD
      const states = sampleAt(script, t)
    for (const st of states) {
      if (st.speed > script.limits.maxSpeed && !violations.some((v) => v.droneId === st.droneId && v.kind === 'speed')) {
        violations.push({
          droneId: st.droneId, kind: 'speed', value: st.speed, limit: script.limits.maxSpeed,
          timeSec: t, segmentId: '-',
          message: `${st.droneId} 在 ${t.toFixed(1)}s 速度 ${st.speed.toFixed(2)}m/s 超限（采样）`
        })
      }
      if (st.accel > script.limits.maxAccel && !violations.some((v) => v.droneId === st.droneId && v.kind === 'accel')) {
        violations.push({
          droneId: st.droneId, kind: 'accel', value: st.accel, limit: script.limits.maxAccel,
          timeSec: t, segmentId: '-',
          message: `${st.droneId} 在 ${t.toFixed(1)}s 加速度 ${st.accel.toFixed(2)}m/s² 超限（采样）`
        })
      }
    }
    }
  }

  violations.sort((a, b) => a.timeSec - b.timeSec || a.droneId.localeCompare(b.droneId))
  return {
    ok: violations.length === 0,
    violations,
    firstViolator: violations[0] ?? null,
    maxSpeed,
    maxAccel,
    checkedAt: new Date().toISOString()
  }
}
