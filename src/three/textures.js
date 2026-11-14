// 程序化立面纹理：由风格 + 色调 + seed 决定，输出可复用的 CanvasTexture。
import * as THREE from 'three'
import { rngFor } from '../core/rng.js'
import { FACADE_BY_KEY, TINTS, resolveBuilding } from '../core/city.js'

const cache = new Map()

export function facadeTexture(styleKey, tintIdx, seed) {
  const key = `${styleKey}|${tintIdx}|${seed}`
  if (cache.has(key)) return cache.get(key)

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const rng = rngFor(seed, `facade:${styleKey}:${tintIdx}`)
  const base = TINTS[tintIdx] || TINTS[0]
  const style = FACADE_BY_KEY[styleKey] || FACADE_BY_KEY.concrete

  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)

  // 基层颗粒
  for (let i = 0; i < 1400; i++) {
    const g = rng.int(0, 255)
    ctx.fillStyle = `rgba(${g},${g},${g},${rng.range(0.015, 0.05)})`
    ctx.fillRect(rng.int(0, size), rng.int(0, size), rng.int(1, 3), rng.int(1, 3))
  }

  const cols = styleKey === 'glass' ? 6 : styleKey === 'industrial' ? 3 : rng.int(3, 5)
  const rows = styleKey === 'glass' ? 10 : rng.int(5, 8)
  const cw = size / cols
  const ch = size / rows

  if (styleKey === 'glass') {
    const grad = ctx.createLinearGradient(0, 0, size, size)
    grad.addColorStop(0, '#5d7f92')
    grad.addColorStop(0.5, '#8fb2c4')
    grad.addColorStop(1, '#4d6d80')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = 'rgba(210,225,232,0.55)'
    ctx.lineWidth = 3
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cw, 0)
      ctx.lineTo(c * cw, size)
      ctx.stroke()
    }
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath()
      ctx.moveTo(0, r * ch)
      ctx.lineTo(size, r * ch)
      ctx.stroke()
    }
    for (let r = 0; r < rows; r++) {
      ctx.fillStyle = `rgba(255,255,255,${rng.range(0.02, 0.09)})`
      ctx.fillRect(0, r * ch, size, ch * 0.18)
    }
  } else if (styleKey === 'brick') {
    ctx.strokeStyle = 'rgba(90,60,45,0.22)'
    ctx.lineWidth = 1
    for (let y = 0; y < size; y += 8) {
      for (let x = (y / 8) % 2 ? 0 : -10; x < size; x += 20) {
        ctx.strokeRect(x, y, 20, 8)
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = rng.chance(0.75) ? '#3c4b52' : '#8d9aa0'
        ctx.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.22, cw * 0.56, ch * 0.5)
        ctx.fillStyle = 'rgba(255,255,255,0.16)'
        ctx.fillRect(c * cw + cw * 0.22, r * ch + ch * 0.22, cw * 0.56, ch * 0.07)
      }
    }
  } else if (styleKey === 'commercial') {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'
    ctx.fillRect(0, ch * 0.9, size, ch * 0.55)
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = rng.chance(0.5) ? '#324049' : '#5a4a38'
      ctx.fillRect(c * cw + cw * 0.1, ch * 1.05, cw * 0.8, ch * 0.32)
      ctx.fillStyle = ['#c8543f', '#4f7f9d', '#c9a44c'][rng.int(0, 2)]
      ctx.fillRect(c * cw + cw * 0.06, ch * 0.92, cw * 0.88, ch * 0.1)
    }
    for (let r = 2; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = 'rgba(50,64,73,0.85)'
        ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.18, cw * 0.64, ch * 0.5)
      }
    }
  } else if (styleKey === 'industrial') {
    ctx.fillStyle = 'rgba(60,70,72,0.35)'
    for (let y = 0; y < size; y += 22) ctx.fillRect(0, y, size, 3)
    ctx.fillStyle = 'rgba(200,205,200,0.35)'
    for (let c = 0; c < cols; c++) {
      ctx.fillRect(c * cw + 10, size * 0.12, cw - 20, size * 0.22)
    }
  } else {
    // office / concrete：规则窗格 + 竖向壁柱
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = rng.chance(0.12)
        ctx.fillStyle = lit ? '#e7d9a6' : styleKey === 'office' ? '#3d4d58' : '#556069'
        ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.48)
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(c * cw + cw * 0.18, r * ch + ch * 0.2, cw * 0.64, ch * 0.06)
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'
    ctx.lineWidth = 4
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath()
      ctx.moveTo(c * cw, 0)
      ctx.lineTo(c * cw, size)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(0, 0, size, 6)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.anisotropy = 4
  tex.colorSpace = THREE.SRGBColorSpace
  tex.userData.style = style.label
  cache.set(key, tex)
  return tex
}

/** 立面 UV 重复次数：宽度 / 层高对齐，避免拉伸 */
export function facadeRepeat(building, seed) {
  const s = resolveBuilding(building)
  return {
    sx: Math.max(1, Math.round(s.width / 16)),
    sy: Math.max(1, Math.round(s.floors / 4))
  }
}
