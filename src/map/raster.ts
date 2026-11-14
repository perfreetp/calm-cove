import { elevationAt } from '../data/worldgen'
import { mulberry32 } from '../lib/geo'

/** Renders a hypsometric hillshade as a compact PNG data URL. */
export function buildTerrainImage(w: number, h: number, worldW: number, worldH: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  const data = img.data
  const sx = worldW / w
  const sy = worldH / h
  const step = 2
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px * sx
      const y = py * sy
      const e = elevationAt(x, y)
      const ex = elevationAt(x + step, y)
      const ey = elevationAt(x, y + step)
      const nx = -(ex - e) / step
      const ny = -(ey - e) / step
      const len = Math.hypot(nx, ny, 1)
      const lx = -0.55
      const ly = -0.65
      const lz = 0.52
      let shade = (nx / len) * lx + (ny / len) * ly + (1 / len) * lz
      shade = Math.max(0.25, Math.min(1.15, 0.45 + shade * 0.85))
      const tElev = Math.max(0, Math.min(1, (e - 500) / 1250))
      // dry mountain green → ochre
      const r = (168 + tElev * 82) * shade
      const g = (182 - tElev * 34) * shade
      const b = (150 - tElev * 46) * shade
      const i = (py * w + px) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // faint contour lines
  ctx.strokeStyle = 'rgba(90,70,45,0.16)'
  ctx.lineWidth = 0.7
  for (let band = 550; band < 1750; band += 50) {
    ctx.beginPath()
    let started = false
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w - 1; px++) {
        const a = elevationAt(px * sx, py * sy) - band
        const b2 = elevationAt((px + 1) * sx, py * sy) - band
        if ((a < 0 && b2 >= 0) || (a >= 0 && b2 < 0)) {
          if (!started) {
            ctx.moveTo(px, py)
            started = false
          }
        }
      }
    }
    ctx.stroke()
  }
  return canvas.toDataURL('image/png')
}

/**
 * Synthesises an aged scanned sheet: paper tone, fold lines, ink strokes and
 * a hand-drawn title block. Used only as a raster backdrop for vectorising.
 */
export function buildScanSheet(seed: number, w = 900, h = 620, kind: 'blueprint' | 'pencil' | 'photo' | 'blue' = 'blueprint'): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(seed)

  if (kind === 'blue') {
    ctx.fillStyle = '#2e4f74'
    ctx.fillRect(0, 0, w, h)
  } else if (kind === 'photo') {
    ctx.fillStyle = '#cfc7b4'
    ctx.fillRect(0, 0, w, h)
  } else {
    ctx.fillStyle = kind === 'pencil' ? '#e6e0cd' : '#efe7d3'
    ctx.fillRect(0, 0, w, h)
  }

  // mottling
  for (let i = 0; i < 1400; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 6 + rand() * 60
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    const dark = rand() < 0.5
    g.addColorStop(0, dark ? 'rgba(120,95,55,0.045)' : 'rgba(255,252,240,0.05)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const ink = kind === 'blue' ? 'rgba(232,238,247,0.72)' : kind === 'pencil' ? 'rgba(58,58,62,0.62)' : 'rgba(52,42,30,0.66)'
  const thin = kind === 'blue' ? 'rgba(232,238,247,0.34)' : 'rgba(52,42,30,0.28)'

  // grid
  ctx.strokeStyle = thin
  ctx.lineWidth = 0.6
  const grid = 42
  for (let x = 20; x < w; x += grid) {
    ctx.beginPath()
    ctx.moveTo(x, 18)
    ctx.lineTo(x + (rand() - 0.5) * 4, h - 18)
    ctx.stroke()
  }
  for (let y = 20; y < h; y += grid) {
    ctx.beginPath()
    ctx.moveTo(18, y)
    ctx.lineTo(w - 18, y + (rand() - 0.5) * 4)
    ctx.stroke()
  }

  // surveyed canal lines (a couple of wandering polylines)
  const lineCount = 3 + Math.floor(rand() * 3)
  for (let li = 0; li < lineCount; li++) {
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.3 + rand() * 1.6
    ctx.beginPath()
    let x = 40 + rand() * (w - 80)
    let y = 40 + rand() * (h - 80)
    ctx.moveTo(x, y)
    const segs = 8 + Math.floor(rand() * 8)
    const dir = rand() * Math.PI * 2
    for (let s = 0; s < segs; s++) {
      const ang = dir + (rand() - 0.5) * 0.9
      const len = 30 + rand() * 85
      x += Math.cos(ang) * len
      y += Math.sin(ang) * len
      ctx.lineTo(x, y)
    }
    ctx.stroke()
    // chainage ticks
    ctx.strokeStyle = thin
    ctx.lineWidth = 0.8
    for (let s = 0; s < 22; s++) {
      const px = 50 + rand() * (w - 100)
      const py = 50 + rand() * (h - 100)
      ctx.beginPath()
      ctx.moveTo(px - 4, py - 4)
      ctx.lineTo(px + 4, py + 4)
      ctx.stroke()
    }
  }

  // hatch for buildings / structures
  ctx.strokeStyle = ink
  for (let i = 0; i < 26; i++) {
    const x = 40 + rand() * (w - 80)
    const y = 40 + rand() * (h - 80)
    const bw = 8 + rand() * 22
    const bh = 8 + rand() * 18
    ctx.lineWidth = 1
    ctx.strokeRect(x, y, bw, bh)
    ctx.beginPath()
    for (let k = -bh; k < bw; k += 5) {
      ctx.moveTo(x + Math.max(0, k), y + Math.max(0, -k))
      ctx.lineTo(x + Math.min(bw, k + bh), y + Math.min(bh, bh - k))
    }
    ctx.stroke()
  }

  // contour-ish squiggles
  ctx.strokeStyle = thin
  ctx.lineWidth = 0.9
  for (let i = 0; i < 12; i++) {
    ctx.beginPath()
    let y = 30 + rand() * (h - 60)
    ctx.moveTo(20, y)
    for (let x = 20; x < w - 20; x += 16) {
      y += (rand() - 0.5) * 9
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  // fold creases
  ctx.strokeStyle = 'rgba(90,75,50,0.14)'
  ctx.lineWidth = 2
  for (let i = 0; i < 2; i++) {
    const x = w * (0.3 + rand() * 0.45)
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + (rand() - 0.5) * 30, h)
    ctx.stroke()
  }

  // title block
  ctx.strokeStyle = ink
  ctx.lineWidth = 1.6
  ctx.strokeRect(w - 268, h - 92, 250, 74)
  ctx.beginPath()
  ctx.moveTo(w - 268, h - 60)
  ctx.lineTo(w - 18, h - 60)
  ctx.moveTo(w - 268, h - 34)
  ctx.lineTo(w - 18, h - 34)
  ctx.moveTo(w - 150, h - 92)
  ctx.lineTo(w - 150, h - 18)
  ctx.stroke()

  ctx.fillStyle = ink
  const titles = ['渠系平面图 1:2000', '竣工图 · 扫描件', '灌区管理所 · 制图', `图号 ${String(seed % 97).padStart(3, '0')}`]
  ctx.font = '13px "Noto Serif SC", "Songti SC", SimSun, serif'
  titles.forEach((t, i) => {
    ctx.fillText(t, w - 258 + (i % 2) * 126, h - 70 + Math.floor(i / 2) * 26)
  })

  // vignette
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(60,45,25,0.16)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  return canvas.toDataURL('image/png')
}
