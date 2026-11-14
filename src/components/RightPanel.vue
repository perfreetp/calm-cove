<template>
  <div class="panel right-panel">
    <div class="tabs">
      <button v-for="t in TABS" :key="t.key" :class="{ primary: store.ui.rightTab === t.key }" @click="store.ui.rightTab = t.key">
        {{ t.label }}
      </button>
    </div>
    <div class="tab-body scroll">
      <PreviewPanel v-if="store.ui.rightTab === 'preview'" />
      <LipSyncPanel v-else-if="store.ui.rightTab === 'lip'" />
      <ExportPanel v-else-if="store.ui.rightTab === 'export'" />
      <ReviewPanel v-else-if="store.ui.rightTab === 'review'" />
      <ComparePanel v-else-if="store.ui.rightTab === 'compare'" />
      <StatsPanel v-else-if="store.ui.rightTab === 'stats'" />
    </div>
  </div>
</template>

<script setup>
import { store } from '../store.js'
import PreviewPanel from './PreviewPanel.vue'
import LipSyncPanel from './LipSyncPanel.vue'
import ExportPanel from './ExportPanel.vue'
import ReviewPanel from './ReviewPanel.vue'
import ComparePanel from './ComparePanel.vue'
import StatsPanel from './StatsPanel.vue'

const TABS = [
  { key: 'preview', label: '预览' },
  { key: 'lip', label: '口型' },
  { key: 'export', label: '导出' },
  { key: 'review', label: '审核' },
  { key: 'compare', label: '对比' },
  { key: 'stats', label: '统计' }
]
</script>

<style scoped>
.right-panel { height: 100%; display: flex; flex-direction: column; border-radius: 0; border-top: none; border-right: none; }
.tabs { display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tab-body { flex: 1; padding: 10px; }
</style>
