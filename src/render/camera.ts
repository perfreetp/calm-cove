// ============ 3D 相机与投影 ============
import type { Vec3 } from '@/types'

export interface Camera {
  yaw: number // 绕 Z 轴旋转（弧度）
  pitch: number // 俯仰角
  distance: number
  fov: number
  aspect: number
}

export function defaultCamera(aspect: number): Camera {
  return { yaw: Math.PI / 4, pitch: 0.72, distance: 260, fov: Math.PI / 4, aspect }
}

/** 世界坐标 -> 相机空间 -> 透视投影 -> 屏幕 NDC */
export function project(p: Vec3, cam: Camera): { x: number; y: number; depth: number; visible: boolean } {
  // 绕 Z 轴 yaw
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const x1 = p.x * cy - p.y * sy
  const y1 = p.x * sy + p.y * cy
  const z1 = p.z
  // 俯仰（绕 X 轴），相机俯视
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  const y2 = y1 * cp - z1 * sp
  const z2 = y1 * sp + z1 * cp
  // 相机位于 +Z 方向，看向原点；相机空间纵深
  const camZ = cam.distance - z2
  // 近平面保护：防止贴近相机时投影值爆炸为非有限/极端值
  const visible = camZ > 1
  const f = 1 / Math.tan(cam.fov / 2)
  const safeZ = Math.max(1, camZ)
  const ndcX = (x1 * f) / (cam.aspect * safeZ)
  const ndcY = (y2 * f) / safeZ
  return { x: ndcX, y: ndcY, depth: camZ, visible }
}

export function ndcToScreen(ndc: { x: number; y: number }, w: number, h: number): { x: number; y: number } {
  return { x: (ndc.x * 0.5 + 0.5) * w, y: (1 - (ndc.y * 0.5 + 0.5)) * h }
}
