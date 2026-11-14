<template>
  <div class="preview">
    <p class="dim">预览画面在 Worker 内用 OffscreenCanvas 渲染，播放不阻塞主线程（可边播边改时间轴）。</p>
    <canvas ref="cv" class="pv-canvas"></canvas>
    <div class="row controls">
      <button class="primary" @click="toggle">{{ playing ? '⏸ 暂停' : '▶ 播放' }}</button>
      <button @click="renderStill">渲染当前帧</button>
      <span>预览帧：{{ previewFrame }}</span>
      <label><input type="checkbox" v-model="showBones" @change="renderStill" /> 骨骼</label>
    </div>
    <p v-if="!supported" class="warn">当前浏览器不支持 OffscreenCanvas，已回退主线程渲染。</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { store } from '../store.js'
import { samplePose, solveWorld } from '../engine/rig.js'
import { drawFrame } from '../engine/render.js'
import { phonemeAt } from '../engine/lipsync.js'
import { partImageMap } from '../store.js'

const W = 960, H = 540
const cv = ref(null)
const playing = ref(false)
const previewFrame = ref(0)
const showBones = ref(false)
const supported = ref(true)
let worker = null
let fallbackCtx = null

const stateForWorker = () => JSON.parse(JSON.stringify({
  bones: store.bones,
  tracks: store.tracks,
  loopTracks: store.loopTracks,
  lipTrack: store.lipTrack,
  meta: { template: store.meta.template },
  duration: store.meta.duration,
  showBones: showBones.value
}))

async function buildPartBitmaps() {
  const out = {}
  for (const p of store.parts) {
    const img = new Image()
    await new Promise((res) => { img.onload = res; img.src = p.src })
    const bmp = await createImageBitmap(img)
    out[p.id] = { img: bmp, ax: p.ax, ay: p.ay }
  }
  return out
}

async function initWorker() {
  const off = cv.value.transferControlToOffscreen()
  worker = new Worker(new URL('../workers/renderWorker.js', import.meta.url), { type: 'module' })
  const parts = await buildPartBitmaps()
  const transfer = Object.values(parts).map((p) => p.img)
  worker.postMessage({ type: 'init', canvas: off, width: W, height: H, parts }, [off, ...transfer])
  worker.onmessage = (e) => {
    if (e.data.type === 'tick') previewFrame.value = e.data.frame
    if (e.data.type === 'ready') renderStill()
  }
}

function renderStill() {
  const st = stateForWorker()
  if (worker) worker.postMessage({ type: 'render', state: st, frame: store.ui.currentFrame })
  else fallbackDraw(store.ui.currentFrame)
}

function fallbackDraw(frame) {
  if (!fallbackCtx) fallbackCtx = cv.value.getContext('2d')
  const pose = samplePose(store.bones, store.tracks, store.loopTracks, frame)
  const world = solveWorld(store.bones, pose)
  drawFrame(fallbackCtx, {
    width: W, height: H, bones: store.bones, world,
    parts: partImageMap(), phoneme: phonemeAt(store.lipTrack, frame),
    showBones: showBones.value, meta: { template: store.meta.template }
  })
}

function toggle() {
  if (playing.value) {
    playing.value = false
    worker && worker.postMessage({ type: 'stop' })
  } else {
    playing.value = true
    if (worker) worker.postMessage({ type: 'play', state: stateForWorker(), fps: store.meta.fps, from: store.ui.currentFrame })
    else {
      // 回退：主线程播放
      let f = store.ui.currentFrame
      const t = setInterval(() => {
        if (!playing.value) { clearInterval(t); return }
        fallbackDraw(f); previewFrame.value = f
        f = f > store.meta.duration ? 0 : f + 1
      }, 1000 / store.meta.fps)
    }
  }
}

onMounted(() => {
  if (cv.value.transferControlToOffscreen) {
    initWorker().catch(() => { supported.value = false; cv.value.width = W; cv.value.height = H })
  } else {
    supported.value = false
    cv.value.width = W
    cv.value.height = H
  }
})

onBeforeUnmount(() => {
  playing.value = false
  worker && worker.terminate()
})
</script>

<style scoped>
.preview { display: flex; flex-direction: column; gap: 8px; }
.pv-canvas { width: 100%; aspect-ratio: 16/9; background: #000; border: 1px solid var(--line); border-radius: 4px; }
.dim { color: var(--dim); margin: 0; }
.warn { color: #ff9d8f; }
.controls { flex-wrap: wrap; }
</style>
