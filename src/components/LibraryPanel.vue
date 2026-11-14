<template>
  <div class="panel lib">
    <h3>部件库（拆件）
      <label class="import-btn">
        导入
        <input type="file" accept="image/png,image/webp" multiple hidden @change="onImport" />
      </label>
    </h3>
    <div class="scroll parts">
      <div v-for="p in store.parts" :key="p.id" class="part-item"
           :class="{ active: selectedBone && selectedBone.partId === p.id }"
           @click="attachPart(p)">
        <img :src="p.src" :alt="p.name" />
        <span>{{ p.name }}</span>
      </div>
    </div>

    <h3>骨骼层级（父子绑定）</h3>
    <div class="scroll bones">
      <div v-for="b in boneTree" :key="b.id" class="bone-item"
           :class="{ active: store.ui.selectedBoneId === b.id }"
           :style="{ paddingLeft: 8 + b.depth * 14 + 'px' }"
           @click="store.ui.selectedBoneId = b.id">
        🦴 {{ b.name }}
        <span class="dim" v-if="b.partId">· {{ partName(b.partId) }}</span>
      </div>
    </div>

    <template v-if="selectedBone">
      <h3>关节设置 · {{ selectedBone.name }}</h3>
      <div class="bone-cfg">
        <div class="row"><label>父骨骼</label>
          <select v-model="selectedBone.parentId" @change="save">
            <option :value="null">（无·根）</option>
            <option v-for="b in store.bones.filter(x => x.id !== selectedBone.id)" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
        <div class="row"><label>挂载部件</label>
          <select v-model="selectedBone.partId" @change="save">
            <option :value="null">（无）</option>
            <option v-for="p in store.parts" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="row">
          <label>角度限制</label>
          <input type="number" v-model.number="selectedBone.minAngle" @change="save" />° ~
          <input type="number" v-model.number="selectedBone.maxAngle" @change="save" />°
        </div>
        <div class="row">
          <label>静止旋转</label>
          <input type="number" v-model.number="selectedBone.rotation" @change="save" />°
          <label>骨长</label>
          <input type="number" v-model.number="selectedBone.length" style="width:52px" @change="save" />
        </div>
        <button class="danger" @click="removeBone">删除该骨骼</button>
      </div>
    </template>

    <h3>循环轨道（眨眼/呼吸自动补）</h3>
    <div class="loops">
      <div v-for="lt in store.loopTracks" :key="lt.id" class="loop-item">
        <div class="row">
          <input type="checkbox" v-model="lt.enabled" @change="save" />
          <b>{{ lt.name }}</b>
          <span class="dim">{{ boneName(lt.boneId) }} · {{ lt.prop }}</span>
        </div>
        <div class="row">
          <label>周期</label><input type="number" v-model.number="lt.period" style="width:52px" @change="save" />
          <label>范围</label><input type="number" v-model.number="lt.min" step="0.01" style="width:52px" @change="save" />
          ~<input type="number" v-model.number="lt.max" step="0.01" style="width:52px" @change="save" />
        </div>
      </div>
      <button @click="addLoop">+ 添加循环轨道</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, save } from '../store.js'

const selectedBone = computed(() => store.bones.find((b) => b.id === store.ui.selectedBoneId))

const boneTree = computed(() => {
  const out = []
  const walk = (pid, depth) => {
    for (const b of store.bones.filter((x) => x.parentId === pid)) {
      out.push({ ...b, depth })
      walk(b.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
})

function partName(id) {
  const p = store.parts.find((x) => x.id === id)
  return p ? p.name : id
}
function boneName(id) {
  const b = store.bones.find((x) => x.id === id)
  return b ? b.name : id
}
function attachPart(p) {
  if (selectedBone.value) {
    selectedBone.value.partId = p.id
    save()
  }
}
function removeBone() {
  const id = store.ui.selectedBoneId
  // 子骨骼提升到祖父
  const b = store.bones.find((x) => x.id === id)
  for (const c of store.bones.filter((x) => x.parentId === id)) c.parentId = b.parentId
  store.bones.splice(store.bones.indexOf(b), 1)
  delete store.tracks[id]
  store.ui.selectedBoneId = store.bones[0]?.id
  save()
}
function addLoop() {
  store.loopTracks.push({
    id: 'loop' + Math.random().toString(36).slice(2, 7),
    name: '新循环', boneId: store.ui.selectedBoneId || 'torso',
    prop: 'scaleY', period: 60, min: 1, max: 1.05, phase: 0,
    enabled: true, mode: 'override', duty: 1
  })
  save()
}
function onImport(e) {
  for (const file of e.target.files) {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        store.parts.push({
          id: 'part_' + Math.random().toString(36).slice(2, 8),
          name: file.name.replace(/\.\w+$/, ''),
          w: img.width, h: img.height,
          ax: Math.round(img.width / 2), ay: Math.round(img.height / 2),
          src: reader.result
        })
        save()
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  }
  e.target.value = ''
}
</script>

<style scoped>
.lib { height: 100%; display: flex; flex-direction: column; border-radius: 0; border-top: none; }
.parts { max-height: 150px; display: flex; flex-wrap: wrap; gap: 6px; padding: 8px; }
.part-item {
  width: 64px; text-align: center; cursor: pointer; border: 1px solid var(--line);
  border-radius: 4px; padding: 4px; font-size: 11px;
}
.part-item.active { border-color: var(--accent); }
.part-item img { width: 100%; height: 40px; object-fit: contain; background: #0d1017; }
.bones { max-height: 180px; padding: 4px 0; }
.bone-item { padding: 3px 8px; cursor: pointer; white-space: nowrap; }
.bone-item:hover { background: var(--panel2); }
.bone-item.active { background: #23405e; }
.dim { color: var(--dim); font-size: 11px; }
.bone-cfg { padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.loops { padding: 8px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.loop-item { border: 1px solid var(--line); border-radius: 4px; padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.import-btn { cursor: pointer; color: var(--accent); font-weight: normal; }
h3 { flex-shrink: 0; }
</style>
