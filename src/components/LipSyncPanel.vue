<template>
  <div class="lip">
    <h4>音素表（点击在当前帧打口型关键帧）</h4>
    <div class="ph-grid">
      <button v-for="p in PHONEMES" :key="p.key" @click="setPhoneme(p.key)">{{ p.label }}</button>
    </div>
    <h4>文本转音素（按播报稿自动对齐到帧）</h4>
    <div class="row">
      <input v-model="text" placeholder="输入播报词，如：早高峰环城高架车行缓慢" style="flex:1" />
      <input type="number" v-model.number="perChar" style="width:52px" title="每字帧数" />
      <button class="primary" @click="applyText">生成</button>
    </div>
    <h4>口型关键帧</h4>
    <table>
      <thead><tr><th>帧</th><th>音素</th><th></th></tr></thead>
      <tbody>
        <tr v-for="(k, i) in store.lipTrack" :key="i" @click="store.ui.currentFrame = k.frame" class="lip-row">
          <td>{{ k.frame }}</td>
          <td>{{ k.phoneme }}</td>
          <td><button class="danger" @click.stop="store.lipTrack.splice(i, 1); save()">删</button></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { store, save } from '../store.js'
import { PHONEMES } from '../engine/demoCharacter.js'
import { textToPhonemes } from '../engine/lipsync.js'

const text = ref('早高峰环城高架车行缓慢，请提前规划出行')
const perChar = ref(5)

function setPhoneme(key) {
  const f = store.ui.currentFrame
  const exist = store.lipTrack.find((k) => k.frame === f)
  if (exist) exist.phoneme = key
  else store.lipTrack.push({ frame: f, phoneme: key })
  store.lipTrack.sort((a, b) => a.frame - b.frame)
  save()
}

function applyText() {
  const keys = textToPhonemes(text.value, store.ui.currentFrame, perChar.value)
  // 覆盖当前帧之后的段落
  store.lipTrack = store.lipTrack.filter((k) => k.frame < store.ui.currentFrame).concat(keys)
  store.lipTrack.sort((a, b) => a.frame - b.frame)
  save()
}
</script>

<style scoped>
.lip { display: flex; flex-direction: column; gap: 8px; }
h4 { margin: 4px 0; color: var(--dim); font-size: 12px; }
.ph-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { border-bottom: 1px solid var(--line); padding: 3px 6px; text-align: left; }
.lip-row { cursor: pointer; }
.lip-row:hover { background: var(--panel2); }
</style>
