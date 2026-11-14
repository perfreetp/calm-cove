<template>
  <svg :width="W" :height="H" class="curve-svg" @mousedown="onDown">
    <line :x1="x(k.frame)" :y1="0" :x2="x(k.frame)" :y2="H" stroke="#2e3948" />
    <line v-if="next" :x1="x(next.frame)" :y1="0" :x2="x(next.frame)" :y2="H" stroke="#2e3948" />
    <!-- 曲线 -->
    <path :d="curvePath" fill="none" stroke="#c79bff" stroke-width="2" />
    <!-- 手柄线 -->
    <line :x1="x(k.frame)" :y1="y(k.value)" :x2="x(h1.x)" :y2="y(h1.y)" stroke="#8a6d9e" />
    <line v-if="next" :x1="x(next.frame)" :y1="y(next.value)" :x2="x(h2.x)" :y2="y(h2.y)" stroke="#8a6d9e" />
    <!-- 端点 -->
    <rect :x="x(k.frame) - 4" :y="y(k.value) - 4" width="8" height="8" fill="#c79bff" transform="rotate(45)" :transform-origin="`${x(k.frame)} ${y(k.value)}`" />
    <rect v-if="next" :x="x(next.frame) - 4" :y="y(next.value) - 4" width="8" height="8" fill="#7fb6ff" transform="rotate(45)" :transform-origin="`${x(next.frame)} ${y(next.value)}`" />
    <!-- 手柄点 -->
    <circle :cx="x(h1.x)" :cy="y(h1.y)" r="5" fill="#ffd97a" style="cursor:grab" @mousedown.stop="start($event, 'h1')" />
    <circle v-if="next" :cx="x(h2.x)" :cy="y(h2.y)" r="5" fill="#7fe0a5" style="cursor:grab" @mousedown.stop="start($event, 'h2')" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { cubicBezier } from '../engine/curves.js'

const props = defineProps({ k: Object, next: Object })
const emit = defineEmits(['change'])

const W = 340, H = 110, PAD = 8

const span = computed(() => (props.next ? props.next.frame - props.k.frame : 20))
const vRange = computed(() => {
  const vs = [props.k.value, props.next ? props.next.value : props.k.value, props.k.hy1 ?? props.k.value, props.k.hy2 ?? (props.next ? props.next.value : props.k.value)]
  let lo = Math.min(...vs), hi = Math.max(...vs)
  if (hi - lo < 1) { lo -= 1; hi += 1 }
  const pad = (hi - lo) * 0.15
  return [lo - pad, hi + pad]
})

const h1 = computed(() => ({
  x: props.k.hx1 != null ? props.k.hx1 : props.k.frame + span.value / 3,
  y: props.k.hy1 != null ? props.k.hy1 : props.k.value
}))
const h2 = computed(() => ({
  x: props.k.hx2 != null ? props.k.hx2 : props.k.frame + (span.value * 2) / 3,
  y: props.k.hy2 != null ? props.k.hy2 : props.next ? props.next.value : props.k.value
}))

function x(frame) { return PAD + ((frame - props.k.frame) / span.value) * (W - 2 * PAD) }
function y(v) {
  const [lo, hi] = vRange.value
  return H - PAD - ((v - lo) / (hi - lo)) * (H - 2 * PAD)
}
function invX(px) { return props.k.frame + ((px - PAD) / (W - 2 * PAD)) * span.value }
function invY(py) {
  const [lo, hi] = vRange.value
  return lo + ((H - PAD - py) / (H - 2 * PAD)) * (hi - lo)
}

const curvePath = computed(() => {
  const pts = []
  const end = props.next ? props.next.value : props.k.value
  for (let i = 0; i <= 32; i++) {
    const t = i / 32
    const fx = cubicBezier(t, props.k.frame, h1.value.x, h2.value.x, props.k.frame + span.value)
    const fy = cubicBezier(t, props.k.value, h1.value.y, h2.value.y, end)
    pts.push(`${i === 0 ? 'M' : 'L'}${x(fx).toFixed(1)},${y(fy).toFixed(1)}`)
  }
  return pts.join(' ')
})

let dragging = null
function start(e, which) { dragging = which; e.preventDefault() }
function onDown() {}
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const svg = document.querySelector('.curve-svg')
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const f = Math.round(invX(e.clientX - r.left) * 10) / 10
    const v = Math.round(invY(e.clientY - r.top) * 100) / 100
    if (dragging === 'h1') { props.k.hx1 = f; props.k.hy1 = v }
    else { props.k.hx2 = f; props.k.hy2 = v }
    emit('change')
  })
  window.addEventListener('mouseup', () => { dragging = null })
}
</script>

<style scoped>
.curve-svg { background: #12161d; border: 1px solid var(--line); border-radius: 4px; }
</style>
