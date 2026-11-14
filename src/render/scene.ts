// ============ 场景组装：无人机状态 -> 渲染图元 ============
import type { ShowScript, Vec3 } from '@/types'
import { formationOf, sampleAt, sortedKeyframes } from '@/lib/script'
import type { DroneState } from '@/lib/script'
import { nodeByDrone } from '@/lib/geometry'
import type { RenderLine, RenderPoint } from './webgpu-renderer'

export interface SceneOptions {
  timeSec: number
  highlightDrones?: Set<string> // 超限标红
  selectedDrone?: string | null
  showTrails?: boolean
  trailDrone?: string | null
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
}

const RED: [number, number, number] = [255, 48, 64]

export function buildScene(script: ShowScript, opts: SceneOptions): { points: RenderPoint[]; lines: RenderLine[]; states: DroneState[] } {
  const states = sampleAt(script, opts.timeSec)
  const points: RenderPoint[] = []
  const lines: RenderLine[] = []

  // 骨架边（取当前时刻所在编队）
  const ks = sortedKeyframes(script)
  let activeKf = ks[0]
  for (const kf of ks) if (opts.timeSec >= kf.timeSec) activeKf = kf
  const formation = formationOf(script, activeKf)
  if (formation) {
    for (const [aId, bId] of formation.edges) {
      const a = formation.nodes.find((n) => n.id === aId)
      const b = formation.nodes.find((n) => n.id === bId)
      if (a && b) {
        lines.push({
          ax: a.position.x, ay: a.position.y, az: a.position.z,
          bx: b.position.x, by: b.position.y, bz: b.position.z,
          color: [0.35, 0.55, 0.9]
        })
      }
    }
  }

  // 单机轨迹
  if (opts.showTrails && opts.trailDrone) {
    const trail: Vec3[] = []
    const duration = ks.length ? ks[ks.length - 1].timeSec : 0
    for (let t = 0; t <= duration; t += 1) {
      const st = sampleAt(script, t).find((s) => s.droneId === opts.trailDrone)
      if (st) trail.push(st.position)
    }
    for (let i = 0; i < trail.length - 1; i++) {
      lines.push({
        ax: trail[i].x, ay: trail[i].y, az: trail[i].z,
        bx: trail[i + 1].x, by: trail[i + 1].y, bz: trail[i + 1].z,
        color: [1, 0.84, 0.2]
      })
    }
  }

  for (const st of states) {
    const violated = opts.highlightDrones?.has(st.droneId)
    const selected = opts.selectedDrone === st.droneId
    const col = violated ? RED : hexToRgb(script.droneColors[st.droneId] ?? '#ffffff')
    points.push({
      x: st.position.x,
      y: st.position.y,
      z: st.position.z,
      r: col[0],
      g: col[1],
      b: col[2],
      size: selected ? 11 : violated ? 8 : 6
    })
  }
  return { points, lines, states }
}

/** 编辑模式：直接渲染某个静态编队（不做时间插值） */
export function buildFormationScene(
  script: ShowScript,
  formationId: string,
  selectedNodeId: string | null,
  redDroneIds: Set<string>
): { points: RenderPoint[]; lines: RenderLine[] } {
  const f = script.formations.find((x) => x.id === formationId)
  const points: RenderPoint[] = []
  const lines: RenderLine[] = []
  if (!f) return { points, lines }
  for (const [aId, bId] of f.edges) {
    const a = f.nodes.find((n) => n.id === aId)
    const b = f.nodes.find((n) => n.id === bId)
    if (a && b) {
      lines.push({
        ax: a.position.x, ay: a.position.y, az: a.position.z,
        bx: b.position.x, by: b.position.y, bz: b.position.z,
        color: [0.35, 0.55, 0.9]
      })
    }
  }
  for (const n of f.nodes) {
    if (!n.droneId) continue
    const red = redDroneIds.has(n.droneId)
    const col = red ? RED : hexToRgb(script.droneColors[n.droneId] ?? '#ffffff')
    points.push({
      x: n.position.x, y: n.position.y, z: n.position.z,
      r: col[0], g: col[1], b: col[2],
      size: n.id === selectedNodeId ? 11 : 6
    })
  }
  return { points, lines }
}

export function droneLabel(script: ShowScript, formationId: string, droneId: string): string {
  const f = script.formations.find((x) => x.id === formationId)
  if (!f) return droneId
  return nodeByDrone(f, droneId) ? droneId : droneId
}
