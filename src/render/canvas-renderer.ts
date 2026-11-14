// ============ Canvas2D 回退渲染器（接口与 WebGPURenderer 对齐） ============
import type { Camera } from './camera'
import { defaultCamera, ndcToScreen, project } from './camera'
import type { RenderLine, RenderPoint } from './webgpu-renderer'

export class Canvas2DRenderer {
  ctx: CanvasRenderingContext2D
  width: number
  height: number

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.width = canvas.width
    this.height = canvas.height
  }

  resize(w: number, h: number): void {
    this.width = w
    this.height = h
  }

  render(cam: Camera, points: RenderPoint[], lines: RenderLine[]): void {
    const ctx = this.ctx
    ctx.fillStyle = '#080d18'
    ctx.fillRect(0, 0, this.width, this.height)
    this.drawGrid(cam)

    const projected = points.map((p) => {
      const ndc = project({ x: p.x, y: p.y, z: p.z }, cam)
      const s = ndcToScreen(ndc, this.width, this.height)
      return { p, s, depth: ndc.depth, visible: ndc.visible }
    })
    // 远的先画
    projected.sort((a, b) => b.depth - a.depth)

    for (const l of lines) {
      const a = ndcToScreen(project({ x: l.ax, y: l.ay, z: l.az }, cam), this.width, this.height)
      const b = ndcToScreen(project({ x: l.bx, y: l.by, z: l.bz }, cam), this.width, this.height)
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue
      ctx.strokeStyle = `rgba(${l.color[0] * 255},${l.color[1] * 255},${l.color[2] * 255},0.7)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }

    for (const item of projected) {
      if (!item.visible) continue
      const { p, s } = item
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue
      // 极端投影（贴近近平面）直接跳过，避免渐变半径非有限
      if (Math.abs(s.x) > this.width * 4 || Math.abs(s.y) > this.height * 4) continue
      const r = Math.max(0.5, p.size)
      const col = `rgb(${p.r},${p.g},${p.b})`
      // 辉光
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 2.4)
      grad.addColorStop(0, col)
      grad.addColorStop(0.35, `rgba(${p.r},${p.g},${p.b},0.55)`)
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(s.x, s.y, r * 2.4, 0, Math.PI * 2)
      ctx.fill()
      // 灯芯
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.arc(s.x, s.y, Math.max(1, r * 0.45), 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  private drawGrid(cam: Camera): void {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(90,140,220,0.18)'
    ctx.lineWidth = 1
    const span = 120
    const step = 20
    for (let v = -span; v <= span; v += step) {
      const a = ndcToScreen(project({ x: v, y: -span, z: 0 }, cam), this.width, this.height)
      const b = ndcToScreen(project({ x: v, y: span, z: 0 }, cam), this.width, this.height)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      const c = ndcToScreen(project({ x: -span, y: v, z: 0 }, cam), this.width, this.height)
      const d = ndcToScreen(project({ x: span, y: v, z: 0 }, cam), this.width, this.height)
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(d.x, d.y)
      ctx.stroke()
    }
  }

  destroy(): void {
    /* noop */
  }
}

export type AnyRenderer = Canvas2DRenderer | import('./webgpu-renderer').WebGPURenderer

export function makeCamera(aspect: number): Camera {
  return defaultCamera(aspect)
}
