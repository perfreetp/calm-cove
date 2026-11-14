<template>
  <div class="scene-wrap" ref="wrapRef">
    <canvas ref="canvasRef" class="scene-canvas" @pointerdown="onDown" @pointermove="onMove"
      @pointerup="onUp" @pointerleave="onUp" @wheel.prevent="onWheel"></canvas>
    <div class="gpu-badge" :class="{ fallback: !webgpuOk }">
      {{ gpuText }}
    </div>
    <div class="cam-hint dim">左键拖动旋转 · 滚轮缩放 · 单击点选无人机</div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { detectWebGPU } from '@/render/webgpu-detect'
import { WebGPURenderer } from '@/render/webgpu-renderer'
import { Canvas2DRenderer } from '@/render/canvas-renderer'
import type { AnyRenderer } from '@/render/canvas-renderer'
import { defaultCamera, ndcToScreen, project } from '@/render/camera'
import type { Camera } from '@/render/camera'
import type { RenderLine, RenderPoint } from '@/render/webgpu-renderer'

const props = defineProps<{
  points: RenderPoint[]
  lines: RenderLine[]
  /** 可选：用于点选命中的无人机编号，与 points 顺序对应 */
  pickIds?: string[]
  selectedDrone?: string | null
}>()

const emit = defineEmits<{
  (e: 'pick', droneId: string): void
}>()

const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const renderer = ref<AnyRenderer | null>(null)
const cam = ref<Camera>(defaultCamera(16 / 9))
const webgpuOk = ref(false)
const gpuText = ref('检测 WebGPU 中…')
let raf = 0
let dragMoved = false
let lastX = 0
let lastY = 0
let downX = 0
let downY = 0
let initToken = 0
let initializing = false
let resizeRaf = 0

function draw() {
  if (!renderer.value) return
  renderer.value.render(cam.value, props.points, props.lines)
}

function scheduleDraw() {
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(draw)
}

function applySize(): boolean {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return false
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = Math.round(wrap.clientWidth * dpr)
  const h = Math.round(wrap.clientHeight * dpr)
  if (w <= 0 || h <= 0) return false
  if (w === canvas.width && h === canvas.height) return true
  canvas.width = w
  canvas.height = h
  canvas.style.width = wrap.clientWidth + 'px'
  canvas.style.height = wrap.clientHeight + 'px'
  cam.value = defaultCamera(w / h)
  renderer.value?.resize(w, h)
  return true
}

async function initRenderer() {
  // 并发/重入保护：只允许最后一次初始化生效
  const token = ++initToken
  if (initializing) return
  initializing = true
  try {
    // 等容器拿到稳定尺寸（弹窗/折叠面板初始可能为 0）
    for (let i = 0; i < 20 && (!wrapRef.value || wrapRef.value.clientWidth === 0); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    if (token !== initToken) return
    if (!applySize()) return

    const det = await detectWebGPU()
    if (token !== initToken) return
    const canvas = canvasRef.value!
    if (det.supported) {
      try {
        renderer.value = await WebGPURenderer.create(canvas)
        webgpuOk.value = true
        gpuText.value = 'WebGPU 硬件加速（WGSL 点精灵）'
      } catch {
        renderer.value = new Canvas2DRenderer(canvas)
        webgpuOk.value = false
        gpuText.value = 'WebGPU 创建失败，已回退 Canvas2D'
      }
    } else {
      renderer.value = new Canvas2DRenderer(canvas)
      webgpuOk.value = false
      gpuText.value = det.reason ?? '已回退 Canvas2D 渲染'
    }
    if (token !== initToken) {
      renderer.value?.destroy()
      renderer.value = null
      return
    }
    draw()
  } finally {
    if (token === initToken) initializing = false
  }
}

function onDown(e: PointerEvent) {
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  lastX = e.clientX
  lastY = e.clientY
  downX = e.clientX
  downY = e.clientY
  dragMoved = false
}

function onMove(e: PointerEvent) {
  if (e.buttons !== 1) return
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > 4) dragMoved = true
  lastX = e.clientX
  lastY = e.clientY
  cam.value.yaw += dx * 0.008
  cam.value.pitch = Math.min(1.45, Math.max(0.12, cam.value.pitch + dy * 0.006))
  scheduleDraw()
}

function onUp(e: PointerEvent) {
  if (!dragMoved) pick(e)
}

function onWheel(e: WheelEvent) {
  const factor = e.deltaY > 0 ? 1.08 : 0.92
  cam.value.distance = Math.min(600, Math.max(60, cam.value.distance * factor))
  scheduleDraw()
}

function pick(e: PointerEvent) {
  if (!props.pickIds?.length || !canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const mx = (e.clientX - rect.left) * (canvasRef.value.width / rect.width)
  const my = (e.clientY - rect.top) * (canvasRef.value.height / rect.height)
  let bestId: string | null = null
  let bestD = 18 // 像素容差（设备像素）
  props.points.forEach((p, i) => {
    const ndc = project({ x: p.x, y: p.y, z: p.z }, cam.value)
    if (!ndc.visible) return
    const s = ndcToScreen(ndc, canvasRef.value!.width, canvasRef.value!.height)
    const d = Math.hypot(s.x - mx, s.y - my)
    if (d < bestD) {
      bestD = d
      bestId = props.pickIds![i]
    }
  })
  if (bestId) emit('pick', bestId)
}

const onResize = () => {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(() => {
    if (applySize()) scheduleDraw()
  })
}
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  initRenderer()
  window.addEventListener('resize', onResize)
  // 弹窗/折叠面板会让容器从 0 尺寸变为正常尺寸；尺寸变化只重建缓冲，不重新检测 GPU
  resizeObserver = new ResizeObserver(onResize)
  if (wrapRef.value) resizeObserver.observe(wrapRef.value)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  cancelAnimationFrame(raf)
  renderer.value?.destroy()
})

watch(() => [props.points, props.lines], scheduleDraw, { deep: true })
watch(() => props.selectedDrone, scheduleDraw)

defineExpose({ redraw: scheduleDraw })
</script>

<style scoped>
.scene-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
}

.scene-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 10px;
  cursor: grab;
  touch-action: none;
}

.scene-canvas:active {
  cursor: grabbing;
}

.gpu-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(47, 206, 125, 0.15);
  border: 1px solid rgba(47, 206, 125, 0.5);
  color: #86f0bd;
}

.gpu-badge.fallback {
  background: rgba(255, 176, 32, 0.12);
  border-color: rgba(255, 176, 32, 0.5);
  color: #ffd27a;
}

.cam-hint {
  position: absolute;
  left: 12px;
  bottom: 8px;
  font-size: 12px;
}
</style>
