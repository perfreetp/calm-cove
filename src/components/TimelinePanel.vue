<template>
  <div class="panel tl">
    <h3>
      <span class="row">
        时间轴
        <button @click="store.ui.currentFrame = 0">⏮</button>
        <button @click="step(-1)">◀</button>
        <button @click="step(1)">▶</button>
        <input type="number" v-model.number="store.ui.currentFrame" style="width:64px" />
        <label>缩放</label>
        <input type="range" min="2" max="16" v-model.number="px" style="width:80px" />
      </span>
      <span class="row">
        <select v-model="newProp">
          <option v-for="(l, p) in PROP_LABELS" :key="p" :value="p">{{ l }}</option>
        </select>
        <button @click="addTrackRow">+ 属性轨道</button>
        <button class="primary" @click="keyAll">在当前帧打全套关键帧</button>
      </span>
    </h3>
    <div class="tl-body">
      <div class="tl-labels">
        <div class="ruler-label">轨道 \ 帧</div>
        <div v-for="row in rows" :key="row.key" class="row-label" :class="{ lip: row.type === 'lip', loop: row.type === 'loop' }">
          <template v-if="row.type === 'prop'">{{ boneName(row.boneId) }} · {{ PROP_LABELS[row.prop] }}</template>
          <template v-else-if="row.type === 'lip'">👄 口型（音素）</template>
          <template v-else>🔁 {{ row.loop.name }}</template>
        </div>
      </div>
      <div class="tl-scroll" ref="scrollRef">
        <div class="tl-inner" :style="{ width: (store.meta.duration + 20) * px + 'px' }">
          <!-- 帧标尺 -->
          <div class="ruler" @mousedown="scrub">
            <div v-for="f in rulerTicks" :key="f" class="tick" :style="{ left: f * px + 'px' }">
              <span v-if="f % 10 === 0">{{ f }}</span>
            </div>
            <div class="playhead" :style="{ left: store.ui.currentFrame * px + 'px' }"></div>
          </div>
          <!-- 属性轨道 -->
          <div v-for="row in rows" :key="row.key" class="track-row" :class="{ lip: row.type === 'lip', loop: row.type === 'loop' }">
            <template v-if="row.type === 'prop'">
              <div v-for="k in keysOf(row)" :key="k.frame" class="key"
                   :class="{ sel: isSel(row, k), [k.interp || 'linear']: true }"
                   :style="{ left: k.frame * px - 5 + 'px' }"
                   :title="`帧${k.frame} = ${fmt(k.value)} (${k.interp || 'linear'})`"
                   @mousedown.stop="onKeyDown($event, row, k)"
                   @contextmenu.prevent="removeKey(row.boneId, row.prop, k.frame)"></div>
            </template>
            <template v-else-if="row.type === 'lip'">
              <div v-for="(seg, i) in lipSegments" :key="i" class="lip-seg"
                   :style="{ left: seg.from * px + 'px', width: (seg.to - seg.from) * px + 'px' }"
                   :title="`帧${seg.from}起：${seg.phoneme}`"
                   @click="store.ui.currentFrame = seg.from">
                {{ seg.phoneme }}
              </div>
            </template>
            <template v-else>
              <div class="loop-bar" :class="{ off: !row.loop.enabled }"
                   :style="{ left: 0, width: store.meta.duration * px + 'px' }">
                <div v-for="c in loopCycles(row.loop)" :key="c" class="loop-cycle" :style="{ left: c * px + 'px', width: row.loop.period * px + 'px' }"></div>
              </div>
            </template>
            <div class="row-playhead" :style="{ left: store.ui.currentFrame * px + 'px' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 选中关键帧的曲线编辑 -->
    <div v-if="selKey" class="curve-editor">
      <div class="row">
        <b>{{ boneName(selKey.row.boneId) }} · {{ PROP_LABELS[selKey.row.prop] }} · 帧{{ selKey.key.frame }}</b>
        <label>值</label>
        <input type="number" v-model.number="selKey.key.value" step="0.1" @change="save" />
        <label>插值</label>
        <select v-model="selKey.key.interp" @change="save">
          <option value="linear">线性</option>
          <option value="ease">缓入缓出</option>
          <option value="bezier">贝塞尔手柄</option>
        </select>
        <button class="danger" @click="removeKey(selKey.row.boneId, selKey.row.prop, selKey.key.frame); store.ui.selectedKey = null">删除关键帧</button>
      </div>
      <CurveEditor v-if="selKey.key.interp === 'bezier'" :k="selKey.key" :next="nextKeyOf(selKey)" @change="save" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { store, save, setKey, removeKey, getTrack } from '../store.js'
import { PROPS, PROP_LABELS } from '../engine/rig.js'
import CurveEditor from './CurveEditor.vue'

const px = ref(6)
const newProp = ref('rotation')
const scrollRef = ref(null)

const rows = computed(() => {
  const out = []
  for (const b of store.bones) {
    const bt = store.tracks[b.id]
    if (!bt) continue
    for (const p of PROPS) {
      if (bt[p] && bt[p].length) out.push({ key: b.id + '.' + p, type: 'prop', boneId: b.id, prop: p })
    }
  }
  out.push({ key: 'lip', type: 'lip' })
  for (const lt of store.loopTracks) out.push({ key: 'loop.' + lt.id, type: 'loop', loop: lt })
  return out
})

const rulerTicks = computed(() => {
  const t = []
  for (let f = 0; f <= store.meta.duration + 10; f += 5) t.push(f)
  return t
})

const lipSegments = computed(() => {
  const segs = []
  const keys = store.lipTrack
  for (let i = 0; i < keys.length; i++) {
    segs.push({ from: keys[i].frame, to: keys[i + 1] ? keys[i + 1].frame : store.meta.duration, phoneme: keys[i].phoneme })
  }
  return segs
})

const selKey = computed(() => {
  const sk = store.ui.selectedKey
  if (!sk) return null
  const keys = getTrack(sk.boneId, sk.prop)
  const key = keys && keys.find((k) => k.frame === sk.frame)
  return key ? { row: sk, key } : null
})

function boneName(id) {
  const b = store.bones.find((x) => x.id === id)
  return b ? b.name : id
}
function keysOf(row) {
  return getTrack(row.boneId, row.prop) || []
}
function fmt(v) { return Math.round(v * 100) / 100 }
function isSel(row, k) {
  const sk = store.ui.selectedKey
  return sk && sk.boneId === row.boneId && sk.prop === row.prop && sk.frame === k.frame
}
function step(d) {
  store.ui.currentFrame = Math.max(0, Math.min(store.meta.duration, store.ui.currentFrame + d))
}
function scrub(e) {
  const move = (ev) => {
    const r = e.currentTarget.getBoundingClientRect()
    store.ui.currentFrame = Math.max(0, Math.min(store.meta.duration, Math.round((ev.clientX - r.left) / px.value)))
  }
  move(e)
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
let dragKey = null
function onKeyDown(e, row, k) {
  store.ui.selectedKey = { boneId: row.boneId, prop: row.prop, frame: k.frame }
  const origFrame = k.frame
  const startX = e.clientX
  const move = (ev) => {
    const df = Math.round((ev.clientX - startX) / px.value)
    const nf = Math.max(0, Math.min(store.meta.duration, origFrame + df))
    if (nf !== k.frame) {
      const keys = getTrack(row.boneId, row.prop)
      if (!keys.some((x) => x !== k && x.frame === nf)) {
        k.frame = nf
        keys.sort((a, b) => a.frame - b.frame)
        store.ui.selectedKey = { boneId: row.boneId, prop: row.prop, frame: nf }
      }
    }
  }
  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); save() }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
function nextKeyOf(sel) {
  const keys = getTrack(sel.row.boneId, sel.row.prop) || []
  const i = keys.findIndex((k) => k.frame === sel.key.frame)
  return keys[i + 1] || null
}
function addTrackRow() {
  const b = store.ui.selectedBoneId
  if (!b) return
  const bone = store.bones.find((x) => x.id === b)
  const defaults = { x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: 1, scaleY: 1, opacity: 1 }
  setKey(b, newProp.value, store.ui.currentFrame, defaults[newProp.value])
  save()
}
function keyAll() {
  const b = store.bones.find((x) => x.id === store.ui.selectedBoneId)
  if (!b) return
  const pose = { x: b.x, y: b.y, rotation: b.rotation, scaleX: 1, scaleY: 1, opacity: 1 }
  for (const p of PROPS) setKey(b.id, p, store.ui.currentFrame, pose[p])
  save()
}
function loopCycles(loop) {
  const c = []
  for (let f = 0; f < store.meta.duration; f += loop.period) c.push(f)
  return c
}
</script>

<style scoped>
.tl { display: flex; flex-direction: column; border-radius: 0; border-left: none; border-right: none; }
.tl-body { flex: 1; display: flex; min-height: 0; }
.tl-labels { width: 170px; flex-shrink: 0; border-right: 1px solid var(--line); overflow: hidden; }
.ruler-label { height: 24px; line-height: 24px; padding: 0 8px; color: var(--dim); font-size: 11px; border-bottom: 1px solid var(--line); }
.row-label { height: 26px; line-height: 26px; padding: 0 8px; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-bottom: 1px solid #232a35; }
.row-label.lip { color: #ffb3c0; }
.row-label.loop { color: #9be7c4; }
.tl-scroll { flex: 1; overflow-x: auto; overflow-y: auto; position: relative; }
.tl-inner { position: relative; }
.ruler { height: 24px; position: relative; border-bottom: 1px solid var(--line); cursor: ew-resize; background: #191f29; }
.tick { position: absolute; top: 0; bottom: 0; border-left: 1px solid #2a3342; font-size: 10px; color: var(--dim); padding-left: 2px; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #ff5252; }
.track-row { height: 26px; position: relative; border-bottom: 1px solid #232a35; }
.track-row.lip { background: rgba(255, 120, 150, 0.04); }
.track-row.loop { background: rgba(120, 230, 180, 0.04); }
.row-playhead { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255, 82, 82, 0.5); pointer-events: none; }
.key {
  position: absolute; top: 8px; width: 10px; height: 10px; transform: rotate(45deg);
  background: #7fb6ff; border: 1px solid #2a5c9e; cursor: grab;
}
.key.ease { background: #ffd97a; border-color: #8a6d1d; }
.key.bezier { background: #c79bff; border-color: #6a3d9e; }
.key.sel { outline: 2px solid #fff; z-index: 2; }
.lip-seg {
  position: absolute; top: 3px; height: 20px; background: #5a2f3d; border: 1px solid #8a4a5e;
  border-radius: 3px; font-size: 10px; color: #ffc9d4; text-align: center; line-height: 19px;
  overflow: hidden; cursor: pointer; white-space: nowrap;
}
.loop-bar { position: absolute; top: 8px; height: 10px; }
.loop-bar.off { opacity: 0.25; }
.loop-cycle { position: absolute; top: 0; height: 10px; background: rgba(80, 220, 160, 0.25); border: 1px solid rgba(80, 220, 160, 0.5); border-radius: 5px; }
.curve-editor { border-top: 1px solid var(--line); padding: 6px 10px; display: flex; flex-direction: column; gap: 6px; }
</style>
