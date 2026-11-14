<template>
  <div class="compare">
    <div class="row">
      <label>版本A</label>
      <select v-model.number="store.ui.compareA">
        <option v-for="v in store.versions" :key="v.n" :value="v.n">V{{ v.n }}</option>
      </select>
      <label>版本B</label>
      <select v-model.number="store.ui.compareB">
        <option v-for="v in store.versions" :key="v.n" :value="v.n">V{{ v.n }}</option>
      </select>
    </div>
    <div class="row">
      <label>帧</label>
      <input type="range" min="0" :max="store.meta.duration" v-model.number="store.ui.compareFrame" style="flex:1" />
      <b>{{ store.ui.compareFrame }}</b>
    </div>
    <div class="pair">
      <div class="side">
        <div class="cap">V{{ store.ui.compareA }}</div>
        <canvas ref="cvA"></canvas>
      </div>
      <div class="side">
        <div class="cap">V{{ store.ui.compareB }}</div>
        <canvas ref="cvB"></canvas>
      </div>
    </div>
    <p class="dim">并排渲染两个版本同一帧；差异帧可由批注点跳转定位（审核页点「帧N · 关节」）。</p>
  </div>
</template>

<script setup>
import { ref, watchEffect, onMounted } from 'vue'
import { store, partImageMap } from '../store.js'
import { samplePose, solveWorld } from '../engine/rig.js'
import { drawFrame } from '../engine/render.js'
import { phonemeAt } from '../engine/lipsync.js'

const W = 480, H = 270
const cvA = ref(null)
const cvB = ref(null)

function drawOne(canvas, versionN, frame) {
  const v = store.versions.find((x) => x.n === versionN)
  if (!v || !canvas) return
  const ctx = canvas.getContext('2d')
  const snap = v.snapshot
  const pose = samplePose(snap.bones, snap.tracks, snap.loopTracks, frame)
  const world = solveWorld(snap.bones, pose)
  ctx.save()
  ctx.scale(0.5, 0.5)
  drawFrame(ctx, {
    width: 960, height: 540,
    bones: snap.bones, world,
    parts: partImageMap(),
    phoneme: phonemeAt(snap.lipTrack, frame),
    showBones: true,
    annotations: v.annotations.filter((a) => a.frame === frame),
    meta: { template: snap.meta.template }
  })
  ctx.restore()
}

onMounted(() => {
  cvA.value.width = W; cvA.value.height = H
  cvB.value.width = W; cvB.value.height = H
})

watchEffect(() => {
  const f = store.ui.compareFrame
  store.versions.length // 依赖
  drawOne(cvA.value, store.ui.compareA, f)
  drawOne(cvB.value, store.ui.compareB, f)
})
</script>

<style scoped>
.compare { display: flex; flex-direction: column; gap: 8px; }
.pair { display: flex; gap: 8px; }
.side { flex: 1; }
.cap { text-align: center; color: var(--dim); font-size: 12px; }
canvas { width: 100%; background: #000; border: 1px solid var(--line); border-radius: 4px; }
.dim { color: var(--dim); margin: 0; }
</style>
