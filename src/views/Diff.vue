<template>
  <div v-if="project" class="page" style="display:flex;flex-direction:column;gap:12px;overflow:hidden">
    <div class="card" style="padding:10px 14px">
      <div class="toolbar">
        <strong>版本对比</strong>
        <span class="muted">{{ project.name }}</span>
        <span class="spacer"></span>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px">层
          <select v-model.number="level">
            <option v-for="l in 4" :key="l" :value="l - 1">第{{ l }}层</option>
          </select>
        </label>
        <button class="btn sm" @click="syncZoom">⇄ 同步视角</button>
        <RouterLink class="btn sm" :to="`/review/${project.id}`">返回审片</RouterLink>
      </div>
    </div>

    <div class="card" style="padding:10px 14px">
      <div class="toolbar" style="gap:18px">
        <label class="field" style="flex-direction:row;align-items:center;gap:8px">左版(旧)
          <select v-model="leftId" style="min-width:220px">
            <option v-for="v in project.versions" :key="v.id" :value="v.id">{{ v.version }} · {{ fmt(v.at) }}</option>
          </select>
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:8px">右版(新)
          <select v-model="rightId" style="min-width:220px">
            <option v-for="v in project.versions" :key="v.id" :value="v.id">{{ v.version }} · {{ fmt(v.at) }}</option>
          </select>
        </label>
        <span class="spacer"></span>
        <span class="legend">
          <span class="item"><span class="swatch" style="background:#38d6a0"></span>新增 {{ diff.added.length }}</span>
          <span class="item"><span class="swatch" style="background:#ff5d6c"></span>删除 {{ diff.removed.length }}</span>
          <span class="item"><span class="swatch" style="background:#ffb020"></span>修改 {{ diff.changed.length }}</span>
        </span>
      </div>
    </div>

    <div class="diff-grid" style="flex:1;min-height:0">
      <div class="diff-pane">
        <div class="pane-head"><strong>{{ left.version }}</strong>
          <span class="muted"> · {{ left.operator }} · {{ left.voxels.length }} 体素</span></div>
        <div class="svg-host">
          <VoxelCanvas ref="leftCanvas"
            :voxels="left.voxels" :grid-w="project.gridW" :grid-d="project.gridD"
            :tool="'select'" :level="level" :visible-layers="layers"
            :selected="new Set()" :annotations="[]"
            :highlight="leftHighlight" :readonly="true"
            :zoom-token="zoomToken" :external-transform="extTransform" />
        </div>
      </div>
      <div class="diff-pane">
        <div class="pane-head"><strong>{{ right.version }}</strong>
          <span class="muted"> · {{ right.operator }} · {{ right.voxels.length }} 体素</span></div>
        <div class="svg-host">
          <VoxelCanvas ref="rightCanvas"
            :voxels="right.voxels" :grid-w="project.gridW" :grid-d="project.gridD"
            :tool="'select'" :level="level" :visible-layers="layers"
            :selected="new Set()" :annotations="[]"
            :highlight="rightHighlight" :readonly="true"
            :zoom-token="zoomToken" :external-transform="extTransform" />
        </div>
      </div>
    </div>

    <div class="card" style="max-height:210px;overflow:auto">
      <h3>变更明细</h3>
      <table>
        <thead>
          <tr><th>类型</th><th>位置</th><th>设施</th><th>变更内容</th></tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in diffRows" :key="i">
            <td><span class="badge" :class="r.cls">{{ r.label }}</span></td>
            <td class="mono">({{ r.x }},{{ r.y }},第{{ r.z + 1 }}层)</td>
            <td>{{ r.facility }}</td>
            <td>{{ r.detail }}</td>
          </tr>
          <tr v-if="!diffRows.length"><td colspan="4" class="empty-hint">两个版本内容完全一致</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { getProject } from '../lib/store.js'
import { VOXEL_TYPES } from '../lib/constants.js'

const props = defineProps({ id: String })
const router = useRouter()
const project = ref(null)
const leftId = ref(null), rightId = ref(null)
const level = ref(0)
const leftCanvas = ref(null), rightCanvas = ref(null)
const zoomToken = ref(0), extTransform = ref(null)
const layers = { herb_cab: true, poison_cab: true, work: true, annotation: true }

onMounted(() => {
  const p = getProject(props.id)
  if (!p) { router.push('/'); return }
  project.value = p
  const vs = p.versions
  rightId.value = vs[0].id
  leftId.value = (vs[1] || vs[0]).id
})

const left = computed(() => project.value.versions.find(v => v.id === leftId.value))
const right = computed(() => project.value.versions.find(v => v.id === rightId.value))

const posKey = v => `${v.x},${v.y},${v.z}`
const sig = v => JSON.stringify({
  t: v.type, c: v.cells, cap: v.capacity, cs: v.commonSlot, h: v.herbName
})

const diff = computed(() => {
  const a = new Map(left.value.voxels.map(v => [posKey(v), v]))
  const b = new Map(right.value.voxels.map(v => [posKey(v), v]))
  const added = [], removed = [], changed = []
  for (const [k, vb] of b) {
    const va = a.get(k)
    if (!va) added.push(vb)
    else if (sig(va) !== sig(vb)) changed.push({ va, vb })
  }
  for (const [k, va] of a) if (!b.has(k)) removed.push(va)
  return { added, removed, changed }
})

const leftHighlight = computed(() => {
  const m = new Map()
  diff.value.removed.forEach(v => m.set(posKey(v), 'removed'))
  diff.value.changed.forEach(c => m.set(posKey(c.va), 'changed'))
  return m
})
const rightHighlight = computed(() => {
  const m = new Map()
  diff.value.added.forEach(v => m.set(posKey(v), 'added'))
  diff.value.changed.forEach(c => m.set(posKey(c.vb), 'changed'))
  return m
})

const diffRows = computed(() => {
  const rows = []
  diff.value.added.forEach(v => rows.push({
    cls: 'approved', label: '新增', x: v.x, y: v.y, z: v.z,
    facility: VOXEL_TYPES[v.type].label, detail: `新增 ${VOXEL_TYPES[v.type].label}`
  }))
  diff.value.removed.forEach(v => rows.push({
    cls: 'rework', label: '删除', x: v.x, y: v.y, z: v.z,
    facility: VOXEL_TYPES[v.type].label, detail: `移除 ${VOXEL_TYPES[v.type].label}`
  }))
  diff.value.changed.forEach(({ va, vb }) => {
    const changes = []
    if (va.type !== vb.type) changes.push(`设施 ${VOXEL_TYPES[va.type].label}→${VOXEL_TYPES[vb.type].label}`)
    if (va.cells !== vb.cells) changes.push(`斗格数 ${va.cells ?? '-'}→${vb.cells ?? '-'}`)
    if (va.capacity !== vb.capacity) changes.push(`容量 ${va.capacity ?? '-'}→${vb.capacity ?? '-'}`)
    if (va.commonSlot !== vb.commonSlot) changes.push(`常用药位 ${va.commonSlot ? '是' : '否'}→${vb.commonSlot ? '是' : '否'}`)
    if (va.herbName !== vb.herbName) changes.push(`药名 ${va.herbName || '-'}→${vb.herbName || '-'}`)
    rows.push({
      cls: 'reviewing', label: '修改', x: vb.x, y: vb.y, z: vb.z,
      facility: VOXEL_TYPES[vb.type].label, detail: changes.join(';')
    })
  })
  return rows
})

function syncZoom() {
  extTransform.value = leftCanvas.value.getTransform()
  zoomToken.value++
}

function fmt(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>
