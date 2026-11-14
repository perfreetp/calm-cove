<template>
  <div class="stage-wrap" ref="wrap">
    <canvas ref="cv" @mousedown="onDown" @mousemove="onMove" @mouseup="onUp" @mouseleave="onUp" @dblclick="onDbl"></canvas>
    <div class="stage-hud">
      <span>帧 {{ store.ui.currentFrame }} / {{ store.meta.duration }}</span>
      <span>{{ store.ui.mode === 'rig' ? '骨骼绑定：双击空白处在选中骨骼下新增子骨骼，拖动节点摆位置' : '动画：拖动骨骼末端旋转（自动打关键帧），Shift+拖动移动位置' }}</span>
      <label><input type="checkbox" v-model="store.ui.showBones" /> 显示骨骼</label>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watchEffect } from 'vue'
import { store, save, setKey, latestVersion } from '../store.js'
import { samplePose, solveWorld, clampAngle } from '../engine/rig.js'
import { drawFrame } from '../engine/render.js'
import { phonemeAt } from '../engine/lipsync.js'
import { partImageMap } from '../store.js'

const W = 960, H = 540
const wrap = ref(null)
const cv = ref(null)
let ctx = null
let scale = 1
let drag = null // {boneId, kind: 'move'|'rotate'}

const stageState = () => ({
  bones: store.bones,
  tracks: store.tracks,
  loopTracks: store.loopTracks,
  lipTrack: store.lipTrack,
  meta: store.meta
})

function render() {
  if (!ctx) return
  const frame = store.ui.currentFrame
  const pose = samplePose(store.bones, store.tracks, store.loopTracks, frame)
  const world = solveWorld(store.bones, pose)
  const v = latestVersion.value
  ctx.save()
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  drawFrame(ctx, {
    width: W, height: H,
    bones: store.bones,
    world,
    parts: partImageMap(),
    phoneme: phonemeAt(store.lipTrack, frame),
    showBones: store.ui.showBones,
    annotations: v ? v.annotations.filter((a) => a.frame === frame) : [],
    meta: { template: store.meta.template }
  })
  // 选中骨骼高亮
  const sel = store.bones.find((b) => b.id === store.ui.selectedBoneId)
  if (sel && world[sel.id]) {
    const m = world[sel.id]
    ctx.strokeStyle = '#ff9f43'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(m.e, m.f, 8, 0, Math.PI * 2)
    ctx.stroke()
    // 角度限制扇形
    if (sel.minAngle !== 0 || sel.maxAngle !== 0) {
      const base = ((sel.rotation + sel.minAngle) * Math.PI) / 180
      const top = ((sel.rotation + sel.maxAngle) * Math.PI) / 180
      ctx.fillStyle = 'rgba(255,159,67,0.12)'
      ctx.beginPath()
      ctx.moveTo(m.e, m.f)
      ctx.arc(m.e, m.f, 40, base, top)
      ctx.closePath()
      ctx.fill()
    }
  }
  ctx.restore()
}

function fit() {
  const r = wrap.value.getBoundingClientRect()
  const s = Math.min(r.width / W, r.height / H)
  scale = s
  cv.value.width = Math.round(W * s)
  cv.value.height = Math.round(H * s)
  render()
}

function toStage(e) {
  const r = cv.value.getBoundingClientRect()
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }
}

function worldAt() {
  const pose = samplePose(store.bones, store.tracks, store.loopTracks, store.ui.currentFrame)
  return solveWorld(store.bones, pose)
}

function hitBone(pt) {
  const world = worldAt()
  let best = null, bd = 12
  for (const b of store.bones) {
    const m = world[b.id]
    if (!m) continue
    const d = Math.hypot(m.e - pt.x, m.f - pt.y)
    if (d < bd) { bd = d; best = b }
  }
  return best
}

function onDown(e) {
  const pt = toStage(e)
  // 批注打点模式
  if (store.ui.annotateMode) {
    store.ui.annotateAt = { x: Math.round(pt.x), y: Math.round(pt.y) }
    store.ui.annotateMode = false
    return
  }
  const b = hitBone(pt)
  if (b) {
    store.ui.selectedBoneId = b.id
    const kind = store.ui.mode === 'rig' || e.shiftKey ? 'move' : 'rotate'
    drag = { boneId: b.id, kind, start: pt }
  }
}

function onMove(e) {
  if (!drag) return
  const pt = toStage(e)
  const b = store.bones.find((x) => x.id === drag.boneId)
  const world = worldAt()
  const m = world[b.id]
  if (drag.kind === 'move') {
    // 世界坐标 → 父空间局部坐标
    const pm = b.parentId && world[b.parentId] ? world[b.parentId] : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
    const det = pm.a * pm.d - pm.b * pm.c
    const dx = pt.x - pm.e, dy = pt.y - pm.f
    const lx = (pm.d * dx - pm.c * dy) / det
    const ly = (-pm.b * dx + pm.a * dy) / det
    if (store.ui.mode === 'rig') {
      b.x = Math.round(lx); b.y = Math.round(ly)
    } else {
      setKey(b.id, 'x', store.ui.currentFrame, Math.round(lx))
      setKey(b.id, 'y', store.ui.currentFrame, Math.round(ly))
    }
  } else {
    // 旋转：相对父骨骼世界角度
    const parentRot = b.parentId && world[b.parentId]
      ? (Math.atan2(world[b.parentId].b, world[b.parentId].a) * 180) / Math.PI
      : 0
    const ang = (Math.atan2(pt.y - m.f, pt.x - m.e) * 180) / Math.PI
    const deg = clampAngle(b, Math.round(ang - parentRot))
    if (store.ui.mode === 'rig') b.rotation = deg
    else setKey(b.id, 'rotation', store.ui.currentFrame, deg)
  }
  save()
  render()
}

function onUp() { drag = null }

function onDbl(e) {
  if (store.ui.mode !== 'rig') return
  const pt = toStage(e)
  if (hitBone(pt)) return
  const parent = store.bones.find((x) => x.id === store.ui.selectedBoneId) || null
  const world = worldAt()
  const pm = parent && world[parent.id] ? world[parent.id] : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const det = pm.a * pm.d - pm.b * pm.c
  const dx = pt.x - pm.e, dy = pt.y - pm.f
  const id = 'bone_' + Math.random().toString(36).slice(2, 7)
  store.bones.push({
    id, name: '骨骼' + (store.bones.length + 1),
    parentId: parent ? parent.id : null,
    x: Math.round((pm.d * dx - pm.c * dy) / det),
    y: Math.round((-pm.b * dx + pm.a * dy) / det),
    rotation: 0, length: 40, partId: null, minAngle: -45, maxAngle: 45
  })
  store.ui.selectedBoneId = id
  save()
}

onMounted(() => {
  ctx = cv.value.getContext('2d')
  fit()
  new ResizeObserver(fit).observe(wrap.value)
})

watchEffect(() => {
  // 依赖追踪：帧/骨骼/轨道/批注变化即重绘
  store.ui.currentFrame
  store.ui.showBones
  store.ui.selectedBoneId
  JSON.stringify(store.tracks)
  JSON.stringify(store.bones)
  store.lipTrack.length
  render()
})
</script>

<style scoped>
.stage-wrap { position: relative; display: flex; align-items: center; justify-content: center; background: #0b0e13; overflow: hidden; }
canvas { cursor: crosshair; }
.stage-hud {
  position: absolute; left: 8px; right: 8px; bottom: 6px;
  display: flex; justify-content: space-between; gap: 12px;
  color: var(--dim); font-size: 11px; pointer-events: none;
}
.stage-hud label { pointer-events: auto; }
</style>
