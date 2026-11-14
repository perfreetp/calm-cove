<template>
  <div class="ease-editor">
    <canvas ref="canvasRef" class="ease-canvas" :width="W" :height="H" @pointerdown="onDown"
      @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp"></canvas>
    <div class="presets">
      <el-radio-group v-model="presetName" size="small" @change="applyPreset">
        <el-radio-button value="linear">线性</el-radio-button>
        <el-radio-button value="easeIn">缓入</el-radio-button>
        <el-radio-button value="easeOut">缓出</el-radio-button>
        <el-radio-button value="easeInOut">缓入缓出</el-radio-button>
        <el-radio-button value="custom">自定义</el-radio-button>
      </el-radio-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { EasingType, MotionSegment, Vec2 } from '@/types'
import { controlPointsOf, sampleCurve } from '@/lib/easing'

const W = 300
const H = 220
const PAD = 26

const props = defineProps<{ modelValue: MotionSegment }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: MotionSegment): void }>()

const canvasRef = ref<HTMLCanvasElement>()
const presetName = ref<EasingType>(props.modelValue.easing)
let drag: 0 | 1 | null = null

function toCanvas(p: Vec2): { x: number; y: number } {
  return { x: PAD + p.x * (W - PAD * 2), y: H - PAD - p.y * (H - PAD * 2) }
}
function toNorm(cx: number, cy: number): Vec2 {
  return {
    x: Math.min(1, Math.max(0, (cx - PAD) / (W - PAD * 2))),
    y: Math.min(1.6, Math.max(-0.6, (H - PAD - cy) / (H - PAD * 2)))
  }
}

function draw() {
  const cv = canvasRef.value
  if (!cv) return
  const ctx = cv.getContext('2d')!
  ctx.clearRect(0, 0, W, H)
  // 背景与边框
  ctx.fillStyle = '#0c1426'
  ctx.fillRect(PAD, PAD, W - PAD * 2, H - PAD * 2)
  ctx.strokeStyle = '#243758'
  ctx.strokeRect(PAD, PAD, W - PAD * 2, H - PAD * 2)
  // 对角参考线
  ctx.strokeStyle = 'rgba(138,160,195,0.18)'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(PAD, H - PAD)
  ctx.lineTo(W - PAD, PAD)
  ctx.stroke()
  ctx.setLineDash([])

  const [p1, p2] = controlPointsOf(props.modelValue)
  const c0 = toCanvas({ x: 0, y: 0 })
  const c3 = toCanvas({ x: 1, y: 1 })
  const c1 = toCanvas(p1)
  const c2 = toCanvas(p2)

  // 控制柄
  ctx.strokeStyle = '#5f7bab'
  ctx.beginPath()
  ctx.moveTo(c0.x, c0.y)
  ctx.lineTo(c1.x, c1.y)
  ctx.moveTo(c3.x, c3.y)
  ctx.lineTo(c2.x, c2.y)
  ctx.stroke()

  // 曲线
  const samples = sampleCurve(props.modelValue, 80)
  ctx.strokeStyle = '#4c8dff'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  samples.forEach((s, i) => {
    const c = toCanvas({ x: s.t, y: s.y })
    if (i === 0) ctx.moveTo(c.x, c.y)
    else ctx.lineTo(c.x, c.y)
  })
  ctx.stroke()
  ctx.lineWidth = 1

  // 端点与控制点
  const dot = (c: { x: number; y: number }, color: string, r = 6) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  dot(c0, '#8aa0c3', 5)
  dot(c3, '#8aa0c3', 5)
  dot(c1, '#ffb020')
  dot(c2, '#ff7a45')

  // 坐标文字
  ctx.fillStyle = '#8aa0c3'
  ctx.font = '11px sans-serif'
  ctx.fillText('t →', W - 34, H - 8)
  ctx.fillText('进度', 4, 14)
  ctx.fillText(`P1(${p1.x.toFixed(2)}, ${p1.y.toFixed(2)})`, c1.x + 8, c1.y - 8)
  ctx.fillText(`P2(${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`, c2.x - 96, c2.y + 18)
}

function eventPos(e: PointerEvent) {
  const rect = canvasRef.value!.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top) * (H / rect.height)
  }
}

function onDown(e: PointerEvent) {
  const [p1, p2] = controlPointsOf(props.modelValue)
  const c1 = toCanvas(p1)
  const c2 = toCanvas(p2)
  const m = eventPos(e)
  if (Math.hypot(m.x - c1.x, m.y - c1.y) < 12) drag = 0
  else if (Math.hypot(m.x - c2.x, m.y - c2.y) < 12) drag = 1
}

function onMove(e: PointerEvent) {
  if (drag === null) return
  const m = eventPos(e)
  const p = toNorm(m.x, m.y)
  const next: MotionSegment = JSON.parse(JSON.stringify(props.modelValue))
  next.easing = 'custom'
  presetName.value = 'custom'
  const pts = [...next.cubicBezier]
  pts[drag] = p
  next.cubicBezier = pts as [Vec2, Vec2]
  emit('update:modelValue', next)
}

function onUp() {
  drag = null
}

function applyPreset(name: EasingType) {
  const next: MotionSegment = JSON.parse(JSON.stringify(props.modelValue))
  next.easing = name
  emit('update:modelValue', next)
}

watch(() => props.modelValue, draw, { deep: true })
onMounted(draw)
</script>

<style scoped>
.ease-canvas {
  background: #070d1a;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: crosshair;
  width: 100%;
  max-width: 340px;
}

.presets {
  margin-top: 10px;
}
</style>
