<template>
  <div class="page wide">
    <h2>主管审核</h2>
    <div style="display:flex; gap:16px; align-items:flex-start">
      <div class="panel" style="width:380px; flex:none">
        <h3 style="margin-top:0">待审核（{{ pending.length }}）</h3>
        <table>
          <thead><tr><th>任务</th><th>制作员</th><th>返工</th><th></th></tr></thead>
          <tbody>
            <tr v-for="t in pending" :key="t.id" :style="{ background: cur?.id === t.id ? '#fbf3e6' : '' }">
              <td>{{ t.title }}<br><span class="muted">{{ store.project(t.projectId)?.name }}</span></td>
              <td>{{ t.assignee }}</td>
              <td>{{ t.reworkCount }}</td>
              <td><button class="sm" @click="select(t)">审核</button></td>
            </tr>
            <tr v-if="!pending.length"><td colspan="4" class="muted">暂无待审核项</td></tr>
          </tbody>
        </table>

        <template v-if="cur">
          <h3>四项核对</h3>
          <div v-for="c in checkItems" :key="c.k" class="row" style="justify-content:space-between; padding:4px 0">
            <span>{{ c.n }}</span>
            <label><input type="checkbox" v-model="checks[c.k]" /> 合格</label>
          </div>
          <textarea v-model="comment" rows="2" style="width:100%; margin-top:8px" placeholder="审核意见（打回必填）"></textarea>
          <div class="row" style="margin-top:10px">
            <button class="primary" :disabled="!allPass" @click="pass">通过</button>
            <button class="danger" @click="reject">打回（记返工）</button>
          </div>
          <p class="muted" v-if="!allPass">四项全部合格才能通过。</p>
        </template>
      </div>

      <div class="panel" style="flex:1; height:calc(100vh - 140px); min-height:440px; display:flex; flex-direction:column">
        <template v-if="curVersion">
          <div class="row" style="margin-bottom:8px">
            <b>{{ cur.title }}</b>
            <span class="tag">{{ cur.kind === 'shot' ? '镜头' : '房间' }} v{{ curVersion.n }}</span>
            <span class="muted">{{ curVersion.note }}</span>
            <span class="muted" v-if="curVersion.faceCount">面数 {{ curVersion.faceCount }}</span>
          </div>
          <div style="flex:1">
            <VoxelCanvas :chunks="chunks" :dims="dims" :readOnly="true" :camera="curVersion.camera || undefined" />
          </div>
        </template>
        <div v-else class="muted" style="margin:auto">从左侧选择待审核任务</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { store, state } from '../store.js'
import { buildAuto } from '../voxel/mesher.js'

const pending = computed(() => store.pendingReviews())
const cur = ref(null)
const curVersion = ref(null)
const chunks = ref([])
const dims = ref([24, 12, 24])
const comment = ref('')
const checks = ref({ scale: false, door: false, corridor: false, budget: false })
const checkItems = [
  { k: 'scale', n: '比例' },
  { k: 'door', n: '门窗位置' },
  { k: 'corridor', n: '通道宽度' },
  { k: 'budget', n: '预算' }
]
const allPass = computed(() => Object.values(checks.value).every(Boolean))

function select(t) {
  cur.value = t
  curVersion.value = store.version(t.versionId)
  checks.value = { scale: false, door: false, corridor: false, budget: false }
  comment.value = ''
  const m = store.modelOfVersion(curVersion.value)
  if (m) {
    dims.value = m.dims
    chunks.value = buildAuto(m).chunks
  } else {
    // 镜头版本：渲染其基准房间的最新模型
    const base = store.latestApproved(t.roomId) || store.latestVersion(t.roomId)
    const bm = store.modelOfVersion(base)
    chunks.value = bm ? buildAuto(bm).chunks : []
    if (bm) dims.value = bm.dims
  }
}

function pass() {
  store.reviewTask(cur.value.id, checks.value, true, comment.value)
  cur.value = null; curVersion.value = null
}
function reject() {
  if (!comment.value.trim()) { alert('打回请填写审核意见'); return }
  store.reviewTask(cur.value.id, checks.value, false, comment.value)
  cur.value = null; curVersion.value = null
}
</script>
