<template>
  <div class="app">
    <header class="topbar">
      <span class="logo">🚦 路况播报数字人 · 动画制作与审片系统</span>
      <div class="row">
        <label>播报模板</label>
        <select v-model="store.meta.template" @change="save">
          <option v-for="t in TEMPLATES" :key="t" :value="t">{{ t }}</option>
        </select>
        <label>主播角色</label>
        <select v-model="store.meta.character" @change="save">
          <option v-for="c in CHARACTERS" :key="c" :value="c">{{ c }}</option>
        </select>
        <label>帧率</label>
        <input type="number" v-model.number="store.meta.fps" style="width:52px" @change="save" />
        <label>时长(帧)</label>
        <input type="number" v-model.number="store.meta.duration" style="width:64px" @change="save" />
      </div>
      <div class="row">
        <button :class="{ primary: store.ui.mode === 'rig' }" @click="store.ui.mode = 'rig'">① 骨骼绑定</button>
        <button :class="{ primary: store.ui.mode === 'animate' }" @click="store.ui.mode = 'animate'">② 动画制作</button>
        <button class="primary" :disabled="!canSubmit" @click="onSubmit" :title="canSubmit ? '生成新版本提交审核' : '仍有未处理批注，处理完才能提交下一版'">
          提交审核 (V{{ store.versions.length + 1 }})
        </button>
        <button class="danger" @click="resetAll">重置演示数据</button>
      </div>
    </header>
    <div class="main">
      <LibraryPanel class="left" />
      <div class="center">
        <StageCanvas class="stage" />
        <TimelinePanel class="timeline" />
      </div>
      <RightPanel class="right" />
    </div>
  </div>
</template>

<script setup>
import { store, save, canSubmit, submitVersion, resetAll } from './store.js'
import LibraryPanel from './components/LibraryPanel.vue'
import StageCanvas from './components/StageCanvas.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import RightPanel from './components/RightPanel.vue'

const TEMPLATES = ['早高峰路况', '晚高峰路况', '午间快讯', '高速实况', '恶劣天气提示']
const CHARACTERS = ['主播·小畅', '主播·大路', '主播·安安']

function onSubmit() {
  if (submitVersion()) {
    store.ui.rightTab = 'review'
  }
}
</script>

<style scoped>
.app { height: 100%; display: flex; flex-direction: column; }
.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 12px; background: var(--panel); border-bottom: 1px solid var(--line);
  gap: 12px; flex-wrap: wrap;
}
.logo { font-weight: bold; color: var(--accent); }
.main { flex: 1; display: flex; min-height: 0; }
.left { width: 250px; flex-shrink: 0; }
.center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.stage { flex: 1; min-height: 0; }
.timeline { height: 280px; flex-shrink: 0; }
.right { width: 380px; flex-shrink: 0; }
</style>
