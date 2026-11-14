// 骨骼装配与正运动学（FK）求解
// bone: { id, name, parentId, x, y, rotation, length, partId, minAngle, maxAngle }
// x/y/rotation 为相对父骨骼的静止（rest）局部变换；partId 挂载的角色部件
// minAngle/maxAngle 为相对 rest rotation 的允许偏移（度）

import { sampleTrack } from './curves.js'

export const PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity']
export const PROP_LABELS = { x: '位置X', y: '位置Y', rotation: '旋转', scaleX: '缩放X', scaleY: '缩放Y', opacity: '不透明度' }

export function clampAngle(bone, deg) {
  const rel = deg - bone.rotation
  const clamped = Math.min(bone.maxAngle, Math.max(bone.minAngle, rel))
  return bone.rotation + clamped
}

// tracks: { [boneId]: { [prop]: [keys] } }，loopTracks: [{boneId, prop, period, min, max, phase, enabled}]
// 返回 { [boneId]: {x,y,rotation,scaleX,scaleY,opacity} } 局部姿态
export function samplePose(bones, tracks, loopTracks, frame) {
  const pose = {}
  for (const b of bones) {
    const p = { x: b.x, y: b.y, rotation: b.rotation, scaleX: 1, scaleY: 1, opacity: 1 }
    const bt = tracks[b.id]
    if (bt) {
      for (const prop of PROPS) {
        const v = sampleTrack(bt[prop], frame)
        if (v != null) p[prop] = v
      }
    }
    pose[b.id] = p
  }
  // 循环轨道自动补间（眨眼/呼吸）：正弦循环，叠加在关键帧结果之上
  for (const lt of loopTracks || []) {
    if (!lt.enabled || !pose[lt.boneId]) continue
    const cyc = (((frame + (lt.phase || 0)) % lt.period) + lt.period) % lt.period / lt.period
    // duty：脉冲占整周期比例（眨眼=短促闭合，呼吸=1 全程正弦）
    const duty = lt.duty != null ? lt.duty : 1
    let s
    if (duty >= 1) s = (1 - Math.cos(cyc * Math.PI * 2)) / 2
    else if (cyc < 1 - duty) s = 0
    else { const k = (cyc - (1 - duty)) / duty; s = (1 - Math.cos(k * Math.PI * 2)) / 2 }
    const v = lt.min + (lt.max - lt.min) * s
    if (lt.mode === 'override') pose[lt.boneId][lt.prop] = v
    else pose[lt.boneId][lt.prop] += v - (lt.prop === 'opacity' ? 1 : 0) // 相对叠加
  }
  // 关节角度限制
  for (const b of bones) {
    pose[b.id].rotation = clampAngle(b, pose[b.id].rotation)
  }
  return pose
}

// 由局部姿态求世界矩阵（2D 仿射: a,b,c,d,e,f）
export function solveWorld(bones, pose) {
  const byId = Object.fromEntries(bones.map((b) => [b.id, b]))
  const world = {}
  const calc = (id) => {
    if (world[id]) return world[id]
    const b = byId[id]
    const p = pose[id]
    const rad = (p.rotation * Math.PI) / 180
    // 局部矩阵
    const la = Math.cos(rad) * p.scaleX
    const lb = Math.sin(rad) * p.scaleX
    const lc = -Math.sin(rad) * p.scaleY
    const ld = Math.cos(rad) * p.scaleY
    let m
    if (b.parentId && byId[b.parentId]) {
      const pm = calc(b.parentId)
      m = {
        a: pm.a * la + pm.c * lb,
        b: pm.b * la + pm.d * lb,
        c: pm.a * lc + pm.c * ld,
        d: pm.b * lc + pm.d * ld,
        e: pm.a * p.x + pm.c * p.y + pm.e,
        f: pm.b * p.x + pm.d * p.y + pm.f
      }
    } else {
      m = { a: la, b: lb, c: lc, d: ld, e: p.x, f: p.y }
    }
    m.opacity = (b.parentId && world[b.parentId] ? world[b.parentId].opacity : 1) * p.opacity
    world[id] = m
    return m
  }
  for (const b of bones) calc(b.id)
  return world
}

// 骨骼末端点（用于画骨骼连线）
export function boneTip(bone, m) {
  return { x: m.e + m.a * bone.length, y: m.f + m.b * bone.length }
}
