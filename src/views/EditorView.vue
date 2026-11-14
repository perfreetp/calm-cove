<template>
  <div class="page wide" v-if="task" style="display:flex; gap:16px; align-items:flex-start">
    <div style="flex:1; height:calc(100vh - 92px); min-height:480px">
      <VoxelCanvas
        ref="canvasRef"
        :chunks="chunks"
        :dims="model.dims"
        :layer="layer"
        :selection="selection"
        :readOnly="isShot"
        :getVoxel="getVoxelFn"
        @cellDown="onDown" @cellMove="onMove" @cellUp="onUp"
      />
      <div class="muted" style="margin-top:6px">
        左键：{{ toolHint }}　Shift/右键拖拽：旋转视角　滚轮：缩放　当前层：第 {{ layer + 1 }} 层
        <span v-if="mirrorX || mirrorZ" style="color:var(--accent-d)">
          （镜像：{{ [mirrorX && 'X轴', mirrorZ && 'Z轴'].filter(Boolean).join(' + ') }}）
        </span>
      </div>
    </div>

    <div style="width:330px; overflow-y:auto; max-height:calc(100vh - 92px)">
      <div class="panel">
        <h3 style="margin-top:0">{{ task.title }}</h3>
        <div class="muted">
          项目：{{ store.project(task.projectId)?.name }} ｜ 房间：{{ store.room(task.roomId)?.name }}<br>
          状态：<span class="tag" :class="task.status">{{ statusText(task.status) }}</span>
          　返工次数：<b :class="{ 'overdue-text': task.reworkCount > 0 }">{{ task.reworkCount }}</b>
        </div>
      </div>

      <template v-if="!isShot">
        <div class="panel">
          <h3 style="margin-top:0">材质</h3>
          <div class="row" style="gap:6px">
            <button
              v-for="m in palette" :key="m.id" class="sm"
              :style="{ borderColor: mat === m.id ? 'var(--accent)' : 'var(--line)', background: mat === m.id ? '#fbf3e6' : '#fff' }"
              @click="mat = m.id"
            >
              <span :style="{ display:'inline-block', width:10, height:10, borderRadius:2, background: cssColor(m), marginRight:4 }"></span>
              {{ m.name }}
            </button>
          </div>
        </div>

        <div class="panel">
          <h3 style="margin-top:0">工具</h3>
          <div class="row" style="gap:6px">
            <button v-for="t in tools" :key="t.k" class="sm" :class="{ primary: tool === t.k }" @click="tool = t.k">{{ t.n }}</button>
          </div>
          <div class="row" style="margin-top:10px">
            <label><input type="checkbox" v-model="mirrorX" /> X轴对称</label>
            <label><input type="checkbox" v-model="mirrorZ" /> Z轴对称</label>
          </div>
          <div class="row" style="margin-top:10px">
            <span class="muted">编辑层</span>
            <input type="range" min="0" :max="model.dims[1] - 1" v-model.number="layer" style="flex:1" />
            <b>第 {{ layer + 1 }} 层</b>
          </div>
        </div>

        <div class="panel">
          <h3 style="margin-top:0">框选 / 复制 / 粘贴</h3>
          <div class="row">
            <span class="muted">选区层范围</span>
            <input type="number" v-model.number="selY0" min="1" :max="model.dims[1]" style="width:56px" />
            <span class="muted">至</span>
            <input type="number" v-model.number="selY1" min="1" :max="model.dims[1]" style="width:56px" />
            <span class="muted">层</span>
          </div>
          <div class="row" style="margin-top:8px">
            <button class="sm" :disabled="!selection" @click="copySel">复制选区</button>
            <button class="sm" :disabled="!selection" @click="selection = null">取消选区</button>
          </div>
          <div class="muted" style="margin-top:8px" v-if="state.clipboard">
            剪贴板：{{ state.clipboard.sx }}×{{ state.clipboard.sy }}×{{ state.clipboard.sz }}（材质编号保留，可跨房间粘贴）<br>
            切到「粘贴」工具后点击目标位置放置。
          </div>
          <div class="muted" style="margin-top:8px" v-else>剪贴板为空。用「框选」工具拖拽出选区后复制。</div>
        </div>
      </template>

      <div class="panel" v-else>
        <h3 style="margin-top:0">镜头任务</h3>
        <p class="muted">拖动旋转、滚轮缩放，调整到目标视角后提交。模型为该房间最新通过版本，不可编辑。</p>
      </div>

      <div class="panel">
        <h3 style="margin-top:0">网格与面数</h3>
        <div>当前面数：<b>{{ faceCount }}</b> / 上限 80000</div>
        <div v-if="simplifyMsg" class="overdue-text" style="margin-top:6px">{{ simplifyMsg }}</div>
        <div class="row" style="margin-top:8px">
          <button class="sm" @click="mergeMesh">合并网格（按材质分块）</button>
        </div>
        <table v-if="chunkList.length" style="margin-top:8px">
          <thead><tr><th>材质块</th><th>面数</th></tr></thead>
          <tbody>
            <tr v-for="c in chunkList" :key="c.mat"><td>{{ c.matName }}</td><td>{{ c.faceCount }}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h3 style="margin-top:0">导出</h3>
        <div class="row">
          <button class="sm" @click="exportGLB">导出 glb</button>
          <button class="sm" @click="exportJSON">导出体素 JSON</button>
        </div>
      </div>

      <div class="panel">
        <h3 style="margin-top:0">提交审核</h3>
        <textarea v-model="note" rows="2" style="width:100%" placeholder="本次改动说明"></textarea>
        <button class="primary" style="margin-top:8px; width:100%" @click="submit">
          {{ isShot ? '提交镜头审核' : '保存版本并提交审核' }}
        </button>
      </div>

      <div class="panel" v-if="versions.length">
        <h3 style="margin-top:0">本房间历史版本</h3>
        <table>
          <thead><tr><th>版本</th><th>作者</th><th>状态</th><th>说明</th></tr></thead>
          <tbody>
            <tr v-for="v in versions" :key="v.id">
              <td>v{{ v.n }}</td><td>{{ v.author }}</td>
              <td><span class="tag" :class="v.status === 'approved' ? 'approved' : v.status === 'rejected' ? 'bad' : 'review'">{{ { approved:'已通过', rejected:'已打回', pending:'待审核' }[v.status] }}</span></td>
              <td class="muted">{{ v.note }}</td>
            </tr>
          </tbody>
        </table>
        <RouterLink :to="`/compare?room=${task.roomId}`"><button class="sm" style="margin-top:8px">并排比对版本</button></RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { store, state } from '../store.js'
import { MATERIALS, serialize, setVoxel, getVoxel, copyRegion, pasteRegion, normBox } from '../voxel/model.js'
import { buildAuto, buildGreedy } from '../voxel/mesher.js'
import { chunksToGLB, downloadBlob } from '../voxel/glb.js'

const route = useRoute()
const router = useRouter()
const task = computed(() => store.task(route.params.taskId))
const isShot = computed(() => task.value?.kind === 'shot')

if (!task.value) router.replace('/tasks')
const model = ref(store.modelForTask(task.value || { kind: 'room', roomId: null }))
const palette = MATERIALS.slice(1)
const tools = [
  { k: 'place', n: '放置' },
  { k: 'erase', n: '擦除' },
  { k: 'select', n: '框选' },
  { k: 'paste', n: '粘贴' }
]
const tool = ref('place')
const mat = ref(1)
const mirrorX = ref(false)
const mirrorZ = ref(false)
const layer = ref(0)
const selY0 = ref(1)
const selY1 = ref(1)
const selection = ref(null)
const note = ref('')
const chunks = ref([])
const chunkList = ref([])
const faceCount = ref(0)
const simplifyMsg = ref('')
const canvasRef = ref(null)
let selAnchor = null

const getVoxelFn = (x, y, z) => getVoxel(model.value, x, y, z)
const versions = computed(() => store.versionsOf(task.value.roomId, isShot.value ? 'shot' : 'room'))

const toolHint = computed(() => ({
  place: `放置「${MATERIALS[mat.value].name}」`, erase: '擦除体素',
  select: '拖拽框选区域', paste: '点击粘贴剪贴板内容'
}[tool.value]))

function cssColor(m) {
  return `rgb(${m.color.map(c => Math.round(c * 255)).join(',')})`
}
function statusText(s) {
  return { open: '待领取', doing: '进行中', review: '待审核', approved: '已通过' }[s] || s
}

function rebuild() {
  const r = buildAuto(model.value)
  chunks.value = r.chunks
  faceCount.value = r.faceCount
  simplifyMsg.value = r.simplified
    ? `面数超过 8 万，已自动简化：简化前 ${r.before} 面 → 简化后 ${r.after} 面`
    : ''
}

function mergeMesh() {
  const r = buildGreedy(model.value)
  chunks.value = r.chunks
  chunkList.value = r.chunks
  faceCount.value = r.faceCount
  simplifyMsg.value = `已按材质分块合并：共 ${r.chunks.length} 个材质块，${r.faceCount} 面`
}

// ---- 编辑交互 ----
function applyPlace(cell) {
  if (!cell) return
  setVoxel(model.value, cell[0], cell[1], cell[2], mat.value, { mirrorX: mirrorX.value, mirrorZ: mirrorZ.value })
  rebuild()
}
function applyErase(cell) {
  if (!cell) return
  setVoxel(model.value, cell[0], cell[1], cell[2], 0, { mirrorX: mirrorX.value, mirrorZ: mirrorZ.value })
  rebuild()
}
function updateSelBox(cell) {
  if (!selAnchor || !cell) return
  selection.value = normBox({
    x0: selAnchor[0], y0: selY0.value - 1, z0: selAnchor[2],
    x1: cell[0], y1: selY1.value - 1, z1: cell[2]
  })
}

function onDown(i) {
  if (tool.value === 'place') applyPlace(i.plane)
  else if (tool.value === 'erase') applyErase(i.hit)
  else if (tool.value === 'select') {
    selAnchor = i.plane
    if (selAnchor) updateSelBox(selAnchor)
  } else if (tool.value === 'paste') {
    if (!state.clipboard) { alert('剪贴板为空，请先框选并复制'); return }
    if (!i.plane) return
    const n = pasteRegion(model.value, state.clipboard, i.plane[0], i.plane[1], i.plane[2])
    rebuild()
    simplifyMsg.value = `已粘贴 ${n} 个体素（材质编号保留）`
  }
}
function onMove(i) {
  if (tool.value === 'place') applyPlace(i.plane)
  else if (tool.value === 'erase') applyErase(i.hit)
  else if (tool.value === 'select') updateSelBox(i.plane)
}
function onUp() { selAnchor = null }

function copySel() {
  if (!selection.value) return
  store.setClipboard(copyRegion(model.value, selection.value))
}

// ---- 导出 ----
function exportGLB() {
  const r = buildAuto(model.value)
  const buf = chunksToGLB(r.chunks)
  downloadBlob(`${task.value.title}-v${versions.value.length + 1}.glb`, new Blob([buf], { type: 'model/gltf-binary' }))
}
function exportJSON() {
  const data = JSON.stringify(serialize(model.value))
  downloadBlob(`${task.value.title}-v${versions.value.length + 1}.json`, new Blob([data], { type: 'application/json' }))
}

// ---- 提交 ----
function submit() {
  if (isShot.value) {
    const cam = canvasRef.value?.getCamera()
    store.submitVersion(task.value.id, { note: note.value, camera: cam })
  } else {
    const r = buildAuto(model.value)
    if (r.simplified) simplifyMsg.value = `面数超过 8 万，已自动简化：简化前 ${r.before} 面 → 简化后 ${r.after} 面`
    store.submitVersion(task.value.id, {
      data: serialize(model.value), note: note.value, faceCount: r.faceCount
    })
  }
  note.value = ''
  alert('已提交主管审核')
  router.push('/tasks')
}

onMounted(rebuild)
</script>
