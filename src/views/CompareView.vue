<template>
  <div class="page wide">
    <h2>历史版本比对</h2>
    <div class="panel row">
      <span>房间</span>
      <select v-model="roomId">
        <option v-for="r in state.rooms" :key="r.id" :value="r.id">
          {{ store.project(r.projectId)?.name }} / {{ r.name }}
        </option>
      </select>
      <span>版本 A</span>
      <select v-model="aId">
        <option v-for="v in versions" :key="v.id" :value="v.id">v{{ v.n }}（{{ v.author }} · {{ v.createdAt }}）</option>
      </select>
      <span>版本 B</span>
      <select v-model="bId">
        <option v-for="v in versions" :key="v.id" :value="v.id">v{{ v.n }}（{{ v.author }} · {{ v.createdAt }}）</option>
      </select>
    </div>

    <template v-if="diff">
      <div class="panel row" style="gap:24px">
        <span>新增体素：<b class="ok-text">{{ diff.added }}</b></span>
        <span>删除体素：<b class="overdue-text">{{ diff.removed }}</b></span>
        <span>材质变更：<b style="color:#a06a1c">{{ diff.changed }}</b></span>
        <span>总改动：<b>{{ diff.total }}</b></span>
      </div>
      <div style="display:flex; gap:16px">
        <div class="panel" style="flex:1; height:56vh; min-height:360px; display:flex; flex-direction:column">
          <div class="muted" style="margin-bottom:6px">版本 A · v{{ va?.n }}</div>
          <div style="flex:1"><VoxelCanvas :chunks="chunksA" :dims="dims" :readOnly="true" /></div>
        </div>
        <div class="panel" style="flex:1; height:56vh; min-height:360px; display:flex; flex-direction:column">
          <div class="muted" style="margin-bottom:6px">版本 B · v{{ vb?.n }}</div>
          <div style="flex:1"><VoxelCanvas :chunks="chunksB" :dims="dims" :readOnly="true" /></div>
        </div>
      </div>
    </template>
    <div class="panel muted" v-else>该房间版本不足两个，无法比对。</div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { store, state } from '../store.js'
import { diffModels } from '../voxel/model.js'
import { buildAuto } from '../voxel/mesher.js'

const route = useRoute()
const roomId = ref(route.query.room || state.rooms[0]?.id)
const versions = computed(() => store.versionsOf(roomId.value))
const aId = ref(null)
const bId = ref(null)

watch(versions, vs => {
  aId.value = vs[1]?.id || vs[0]?.id || null
  bId.value = vs[0]?.id || null
}, { immediate: true })

const va = computed(() => store.version(aId.value))
const vb = computed(() => store.version(bId.value))
const dims = computed(() => {
  const m = store.modelOfVersion(vb.value) || store.modelOfVersion(va.value)
  return m ? m.dims : [24, 12, 24]
})
const chunksA = computed(() => {
  const m = store.modelOfVersion(va.value)
  return m ? buildAuto(m).chunks : []
})
const chunksB = computed(() => {
  const m = store.modelOfVersion(vb.value)
  return m ? buildAuto(m).chunks : []
})
const diff = computed(() => {
  const ma = store.modelOfVersion(va.value), mb = store.modelOfVersion(vb.value)
  return ma && mb ? diffModels(ma, mb) : null
})
</script>
