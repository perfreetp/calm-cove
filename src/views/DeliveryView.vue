<template>
  <div class="page wide">
    <h2>交付中心</h2>
    <p class="muted" v-if="state.role === 'client'">客户视图：可查看项目进度与已交付版本，内容只读。</p>

    <div class="panel" v-for="p in state.projects" :key="p.id">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <b>{{ p.name }}</b>
          <span v-if="store.isOverdue(p)" class="tag bad">已逾期 {{ -store.daysLeft(p.deadline) }} 天</span>
          <span v-else class="tag">剩 {{ store.daysLeft(p.deadline) }} 天</span>
        </div>
        <div class="row" style="gap:6px">
          <div class="progress" style="width:140px"><i :style="{ width: store.projectProgress(p.id).pct + '%' }"></i></div>
          <span class="muted">{{ store.projectProgress(p.id).pct }}%</span>
        </div>
      </div>

      <template v-if="store.deliveriesOf(p.id).length">
        <table style="margin-top:10px">
          <thead><tr><th>交付批次</th><th>日期</th><th>项</th><th>版本</th><th>面数</th><th></th></tr></thead>
          <tbody>
            <template v-for="d in store.deliveriesOf(p.id)" :key="d.id">
              <tr v-for="it in d.items" :key="d.id + it.taskId">
                <td>{{ d.id }}</td>
                <td>{{ d.at }}</td>
                <td>{{ store.room(it.roomId)?.name }}（{{ it.kind === 'shot' ? '镜头' : '房间' }}）</td>
                <td>v{{ it.n }}</td>
                <td>{{ it.faceCount || '—' }}</td>
                <td class="row">
                  <template v-if="it.kind !== 'shot'">
                    <button class="sm" @click="preview(it)">预览</button>
                    <button class="sm" @click="download(it, 'glb')">下载 glb</button>
                    <button class="sm" @click="download(it, 'json')">下载 JSON</button>
                  </template>
                  <span v-else class="muted">镜头参数已归档</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
      <p class="muted" v-else style="margin-bottom:0">尚未交付。项目所有任务审核通过后方可打包交付。</p>
    </div>

    <div class="panel" v-if="previewChunks" style="height:60vh; min-height:380px; display:flex; flex-direction:column">
      <div class="row" style="margin-bottom:8px; justify-content:space-between">
        <b>只读预览：{{ previewName }}</b>
        <button class="sm" @click="previewChunks = null">关闭</button>
      </div>
      <div style="flex:1"><VoxelCanvas :chunks="previewChunks" :dims="previewDims" :readOnly="true" /></div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { store, state } from '../store.js'
import { serialize } from '../voxel/model.js'
import { buildAuto } from '../voxel/mesher.js'
import { chunksToGLB, downloadBlob } from '../voxel/glb.js'

const previewChunks = ref(null)
const previewDims = ref([24, 12, 24])
const previewName = ref('')

function versionOf(item) { return store.version(item.versionId) }

function preview(it) {
  const v = versionOf(it)
  const m = store.modelOfVersion(v)
  if (!m) return
  previewDims.value = m.dims
  previewChunks.value = buildAuto(m).chunks
  previewName.value = `${store.room(it.roomId)?.name} v${it.n}`
}

function download(it, kind) {
  const v = versionOf(it)
  const m = store.modelOfVersion(v)
  if (!m) return
  const name = `${store.room(it.roomId)?.name}-v${it.n}`
  if (kind === 'glb') {
    downloadBlob(`${name}.glb`, new Blob([chunksToGLB(buildAuto(m).chunks)], { type: 'model/gltf-binary' }))
  } else {
    downloadBlob(`${name}.json`, new Blob([JSON.stringify(serialize(m))], { type: 'application/json' }))
  }
}
</script>
