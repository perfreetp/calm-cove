<template>
  <div class="export">
    <p class="dim">在 Worker 中逐帧渲染 PNG 序列帧，打包为 ZIP，内含带帧号与时间码的 manifest.json 清单。</p>
    <div class="row">
      <label>文件前缀</label>
      <input v-model="prefix" />
      <label>范围</label>
      <input type="number" v-model.number="from" style="width:60px" /> ~
      <input type="number" v-model.number="to" style="width:60px" />
    </div>
    <button class="primary" :disabled="running" @click="run">
      {{ running ? `导出中 ${progress}/${total}` : '导出 PNG 序列帧 (ZIP)' }}
    </button>
    <div v-if="running" class="bar"><div class="bar-inner" :style="{ width: (progress / total * 100) + '%' }"></div></div>
    <p v-if="done" class="ok">✅ 已导出 {{ done }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { store } from '../store.js'
import { exportSequence, downloadBlob } from '../engine/exporter.js'

const prefix = ref('traffic_anchor')
const from = ref(0)
const to = ref(store.meta.duration)
const running = ref(false)
const progress = ref(0)
const total = ref(1)
const done = ref('')

async function buildPartBitmaps() {
  const out = {}
  for (const p of store.parts) {
    const img = new Image()
    await new Promise((res) => { img.onload = res; img.src = p.src })
    out[p.id] = { img: await createImageBitmap(img), ax: p.ax, ay: p.ay }
  }
  return out
}

async function run() {
  running.value = true
  done.value = ''
  progress.value = 0
  const W = 960, H = 540
  const worker = new Worker(new URL('../workers/renderWorker.js', import.meta.url), { type: 'module' })
  try {
    const off = new OffscreenCanvas(W, H)
    const parts = await buildPartBitmaps()
    worker.postMessage({ type: 'init', canvas: off, width: W, height: H, parts }, [off, ...Object.values(parts).map((p) => p.img)])
    await new Promise((res) => { worker.onmessage = (e) => e.data.type === 'ready' && res() })
    const state = JSON.parse(JSON.stringify({
      bones: store.bones, tracks: store.tracks, loopTracks: store.loopTracks,
      lipTrack: store.lipTrack, meta: { template: store.meta.template },
      duration: Math.min(to.value, store.meta.duration) - from.value,
      showBones: false
    }))
    // 帧号平移：导出 [from, to] 区间
    const shift = (obj) => {
      for (const bt of Object.values(obj.tracks)) {
        for (const keys of Object.values(bt)) keys.forEach((k) => (k.frame -= from.value))
      }
      obj.lipTrack.forEach((k) => (k.frame -= from.value))
    }
    shift(state)
    total.value = state.duration + 1
    const zip = await exportSequence(worker, state, {
      fps: store.meta.fps, width: W, height: H, prefix: prefix.value,
      onProgress: (f, t) => { progress.value = f + 1 }
    })
    const name = `${prefix.value}_${store.meta.template}_V${store.versions.length}_f${from.value}-${to.value}.zip`
    downloadBlob(zip, name)
    done.value = name
  } finally {
    worker.terminate()
    running.value = false
  }
}
</script>

<style scoped>
.export { display: flex; flex-direction: column; gap: 10px; }
.dim { color: var(--dim); margin: 0; }
.ok { color: var(--ok); }
.bar { height: 8px; background: #12161d; border-radius: 4px; overflow: hidden; }
.bar-inner { height: 100%; background: var(--accent); transition: width 0.1s; }
</style>
