// ============ PNG 序列帧导出（供飞控预演） ============
import JSZip from 'jszip'
import type { ShowScript } from '@/types'
import { totalDuration } from '@/lib/script'
import { buildScene } from './scene'
import { defaultCamera, ndcToScreen, project } from './camera'
import type { Camera } from './camera'
import { saveAs } from './save-as'

const FRAME_W = 1280
const FRAME_H = 720

function drawFrame(script: ShowScript, timeSec: number, redDrones: Set<string>, index: number, total: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_W
  canvas.height = FRAME_H
  const ctx = canvas.getContext('2d')!
  const cam: Camera = { ...defaultCamera(FRAME_W / FRAME_H), distance: 300 }

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, FRAME_H)
  bg.addColorStop(0, '#0a1024')
  bg.addColorStop(1, '#05080f')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, FRAME_W, FRAME_H)

  // 地面网格
  ctx.strokeStyle = 'rgba(90,140,220,0.16)'
  ctx.lineWidth = 1
  const span = 120
  const step = 20
  for (let v = -span; v <= span; v += step) {
    for (const [x1, y1, x2, y2] of [
      [v, -span, v, span],
      [-span, v, span, v]
    ]) {
      const a = ndcToScreen(project({ x: x1, y: y1, z: 0 }, cam), FRAME_W, FRAME_H)
      const b = ndcToScreen(project({ x: x2, y: y2, z: 0 }, cam), FRAME_W, FRAME_H)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  const { points, lines } = buildScene(script, { timeSec, highlightDrones: redDrones })

  // 骨架边
  for (const l of lines) {
    const a = ndcToScreen(project({ x: l.ax, y: l.ay, z: l.az }, cam), FRAME_W, FRAME_H)
    const b = ndcToScreen(project({ x: l.bx, y: l.by, z: l.bz }, cam), FRAME_W, FRAME_H)
    ctx.strokeStyle = `rgba(${l.color[0] * 255},${l.color[1] * 255},${l.color[2] * 255},0.6)`
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // 无人机（含辉光）
  const drawn = points
    .map((p) => ({ p, ndc: project({ x: p.x, y: p.y, z: p.z }, cam) }))
    .filter((d) => d.ndc.visible)
    .sort((a, b) => b.ndc.depth - a.ndc.depth)
  for (const d of drawn) {
    const s = ndcToScreen(d.ndc, FRAME_W, FRAME_H)
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) continue
    const r = Math.max(0.5, d.p.size)
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 3)
    grad.addColorStop(0, `rgb(${d.p.r},${d.p.g},${d.p.b})`)
    grad.addColorStop(0.3, `rgba(${d.p.r},${d.p.g},${d.p.b},0.5)`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(s.x, s.y, r * 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // 抬头信息
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText(script.name, 28, 40)
  ctx.font = '15px sans-serif'
  ctx.fillStyle = 'rgba(200,215,240,0.85)'
  ctx.fillText(`T+${timeSec.toFixed(1)}s  机数:${script.droneCount}  限速:${script.limits.maxSpeed}m/s  限加速:${script.limits.maxAccel}m/s²`, 28, 66)
  ctx.fillText(`帧 ${index + 1}/${total}`, FRAME_W - 110, 40)
  if (redDrones.size) {
    ctx.fillStyle = '#ff3040'
    ctx.fillText(`⚠ 超限无人机:${redDrones.size} 架（红色标记）`, 28, FRAME_H - 24)
  }
  return canvas
}

export interface ExportProgress {
  done: number
  total: number
}

export async function exportPngSequence(
  script: ShowScript,
  fps: number,
  redDrones: Set<string>,
  onProgress?: (p: ExportProgress) => void
): Promise<void> {
  const duration = totalDuration(script)
  const total = Math.floor(duration * fps) + 1
  const zip = new JSZip()
  const folder = zip.folder(`frames_${script.projectId}`)!

  for (let i = 0; i < total; i++) {
    const t = i / fps
    const canvas = drawFrame(script, Math.min(t, duration), redDrones, i, total)
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
    const buf = new Uint8Array(await blob.arrayBuffer())
    folder.file(`frame_${String(i + 1).padStart(5, '0')}.png`, buf)
    onProgress?.({ done: i + 1, total })
    // 让出主线程，保持界面响应
    if (i % 6 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  // 附一份帧清单
  folder.file(
    'manifest.txt',
    [
      `project: ${script.projectId}`,
      `script: ${script.name}`,
      `droneCount: ${script.droneCount}`,
      `durationSec: ${duration}`,
      `fps: ${fps}`,
      `frames: ${total}`,
      `generatedAt: ${new Date().toISOString()}`
    ].join('\n')
  )

  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  saveAs(content, `frames_${script.projectId}_${fps}fps.zip`)
}
