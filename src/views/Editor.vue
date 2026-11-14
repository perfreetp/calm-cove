<template>
  <div v-if="project" class="editor-shell">
    <!-- 左:工具与图层 -->
    <aside class="side-left">
      <div class="section-title">布置工具</div>
      <button class="tool-btn" :class="{ active: tool === 'select' }" @click="tool = 'select'">
        <span>➤</span> 选择 / 平移(Shift 多选)
      </button>
      <button class="tool-btn" :class="{ active: tool === 'marquee' }" @click="tool = 'marquee'">
        <span>▭</span> 框选选区
      </button>
      <button v-for="(t, key) in VOXEL_TYPES" :key="key"
              class="tool-btn" :class="{ active: tool === key }" @click="tool = key">
        <span class="swatch" :style="{ background: t.color }"></span>
        {{ t.label }}
      </button>

      <div class="section-title">独立图层</div>
      <div v-for="l in LAYER_DEFS" :key="l.key" class="layer-row">
        <input type="checkbox" :checked="visibleLayers[l.key] !== false"
               @change="toggleLayer(l.key, $event.target.checked)" />
        <span class="name">{{ l.label }}</span>
        <span class="muted">{{ layerCount(l.key) }}</span>
      </div>

      <div class="section-title">操作</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <button class="btn sm" @click="undo" :disabled="!undoStack.length">↶ 撤销</button>
        <button class="btn sm" @click="redo" :disabled="!redoStack.length">↷ 重做</button>
        <button class="btn sm" @click="copySel" :disabled="!selected.size">⧉ 复制</button>
        <button class="btn sm" @click="pasteSel" :disabled="!clipboard.length">粘贴</button>
        <button class="btn sm danger" @click="deleteSel" :disabled="!selected.size">删除</button>
        <button class="btn sm" @click="canvasRef && canvasRef.resetView()">复位视角</button>
      </div>

      <div class="section-title">图例</div>
      <div class="legend">
        <span class="item"><span class="swatch" style="background:#ffd54a"></span>黄金区</span>
        <span class="item"><span style="color:#ffd54a">★</span>常用药位</span>
        <span class="item"><span class="swatch" style="background:#b3404a"></span>毒麻专柜</span>
      </div>
    </aside>

    <!-- 中:画布 -->
    <main class="canvas-area">
      <div class="canvas-toolbar">
        <strong>{{ project.name }}</strong>
        <span class="badge" :class="project.status">{{ STATUS_LABELS[project.status] }}</span>
        <span class="muted mono">{{ currentVer.version }} · {{ workVoxels.length }} 体素</span>
        <span class="spacer"></span>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px">
          <input type="checkbox" :checked="mirror" @change="mirror = $event.target.checked" />
          镜像对称
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px">
          <input type="checkbox" v-model="showGold" />黄金区
        </label>
        <label class="field" style="flex-direction:row;align-items:center;gap:6px">
          <input type="checkbox" v-model="showUpperGhost" />上层半透
        </label>
      </div>
      <div class="canvas-toolbar" style="gap:6px">
        <span class="muted">编辑层:</span>
        <button v-for="l in 4" :key="l" class="btn sm"
                :class="{ primary: level === l - 1 }" @click="level = l - 1">
          第{{ l }}层<span class="muted" v-if="levelCounts[l-1]"> ·{{ levelCounts[l-1] }}</span>
        </button>
        <span class="spacer"></span>
        <span class="muted">镜像轴 X={{ (gridW - 1) / 2 }} · 每格 {{ CELL_MM }}mm</span>
      </div>
      <div class="svg-host">
        <VoxelCanvas
          ref="canvasRef"
          :voxels="workVoxels"
          :grid-w="gridW" :grid-d="gridD"
          :tool="tool" :level="level" :mirror="mirror"
          :visible-layers="visibleLayers"
          :selected="selected"
          :annotations="[]"
          :highlight="issueHighlight"
          :show-gold="showGold"
          :show-upper-ghost="showUpperGhost"
          @place="onPlace"
          @voxel-click="onVoxelClick"
          @selection-change="onSelectionChange"
          @translate="onTranslate"
        />
      </div>
    </main>

    <!-- 右:属性 / 校核 / 合并 -->
    <aside class="side-right">
      <div class="section-title">选中体素属性</div>
      <div v-if="selectedVoxel" class="card" style="padding:12px">
        <p style="margin:0 0 8px">
          <span class="swatch" :style="{ background: VOXEL_TYPES[selectedVoxel.type].color }"></span>
          <strong>{{ VOXEL_TYPES[selectedVoxel.type].label }}</strong>
          <span class="muted mono"> ({{ selectedVoxel.x }},{{ selectedVoxel.y }},第{{ selectedVoxel.z + 1 }}层)</span>
        </p>
        <template v-if="VOXEL_TYPES[selectedVoxel.type].hasCells">
          <label class="field" style="margin-bottom:8px">药斗格数
            <input type="number" min="1" v-model.number="selectedVoxel.cells" />
          </label>
          <label class="field" style="margin-bottom:8px">单斗容量(kg)
            <input type="number" min="0" step="0.1" v-model.number="selectedVoxel.capacity" />
          </label>
          <label class="field" style="margin-bottom:8px;flex-direction:row;align-items:center;gap:8px">
            <input type="checkbox" v-model="selectedVoxel.commonSlot" /> 设为常用药位
          </label>
          <label class="field" style="margin-bottom:8px">常用药名
            <input v-model="selectedVoxel.herbName" placeholder="如:黄芪" :disabled="!selectedVoxel.commonSlot" />
          </label>
        </template>
        <p v-else class="muted" style="margin:4px 0 0">作业设施无药斗参数</p>
        <p class="muted" style="margin:8px 0 0;font-size:11.5px">
          材质:{{ VOXEL_TYPES[selectedVoxel.type].material }} ·
          图层:{{ layerLabel(selectedVoxel.type) }}
        </p>
      </div>
      <p v-else class="muted" style="font-size:12px">点击画布中的体素查看/编辑参数;多选时显示首个选中项。</p>

      <div class="section-title">规则校核({{ issues.length }})</div>
      <div v-if="!issues.length" class="check-item pass">✓ 全部校核通过</div>
      <div v-for="(it, i) in issues" :key="i" class="check-item fail"
           style="cursor:pointer" @click="locateIssue(it)">
        <span>{{ it.level === 'error' ? '✕' : '⚠' }}</span>
        <span>
          <strong>{{ RULE_META[it.rule]?.label }}</strong>:{{ it.message }}
          <em v-if="it.voxel" class="muted mono"> ({{ it.voxel.x }},{{ it.voxel.y }})</em>
        </span>
      </div>

      <div class="section-title">合并减面(同材质)</div>
      <div class="card" style="padding:12px;font-size:12px;line-height:1.9">
        合并条块:<strong>{{ mergeStats.groups.length }}</strong> / 原体素 {{ workVoxels.length }}<br />
        外露面:{{ mergeStats.beforeFaces }} → <strong>{{ mergeStats.afterFaces }}</strong><br />
        减面率:<strong :style="{ color: mergeStats.reduction > 30 ? '#38d6a0' : '#ffb020' }">
          {{ mergeStats.reduction }}%</strong>
      </div>

      <div class="section-title">导出与提交</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <button class="btn sm" @click="exportGLB">导出 GLB</button>
        <button class="btn sm" @click="exportCSV">药位清单</button>
      </div>
      <button class="btn success" style="width:100%" @click="showSubmit = true">提交方案 / 生成版本号</button>
      <RouterLink :to="`/review/${project.id}`" style="display:block;margin-top:8px;text-align:center">
        进入审片 →
      </RouterLink>
    </aside>

    <!-- 提交弹窗 -->
    <div v-if="showSubmit" class="modal-mask" @click.self="showSubmit = false">
      <div class="card modal-box">
        <h3>提交新版本</h3>
        <p class="muted">当前版本 {{ currentVer.version }} · 操作人 {{ roleLabel }} · 提交后状态变为「审核中」</p>
        <label class="field">版本说明
          <textarea v-model="submitNote" rows="3" placeholder="本轮调整说明,如:响应距离批注,中部增设调剂台"></textarea>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button class="btn" @click="showSubmit = false">取消</button>
          <button class="btn primary" @click="doSubmit">确认提交</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import {
  VOXEL_TYPES, LAYER_DEFS, layerOf, GRID_W, GRID_D, CELL_MM,
  STATUS_LABELS, ROLES, uid
} from '../lib/constants.js'
import {
  getProject, currentVersion, updateProject, submitVersion, getRole
} from '../lib/store.js'
import { mergeVoxels } from '../lib/geometry.js'
import { runRules, RULE_META } from '../lib/rules.js'
import { buildGLB, buildSlotCSV, download } from '../lib/exporter.js'
import { toast } from '../composables/useToast.js'

const props = defineProps({ id: String })
const router = useRouter()

const project = ref(null)
const workVoxels = ref([])
const tool = ref('select')
const level = ref(0)
const mirror = ref(false)
const showGold = ref(true)
const showUpperGhost = ref(true)
const visibleLayers = ref({ herb_cab: true, poison_cab: true, work: true, annotation: true })
const selected = ref(new Set())
const clipboard = ref([])
const undoStack = ref([])
const redoStack = ref([])
const canvasRef = ref(null)
const showSubmit = ref(false)
const submitNote = ref('')

const gridW = GRID_W, gridD = GRID_D
const currentVer = computed(() => project.value && currentVersion(project.value))
const roleLabel = ROLES.find(r => r.key === getRole())?.label || '药师'

onMounted(loadProject)

function loadProject() {
  const p = getProject(props.id)
  if (!p) { router.push('/'); return }
  project.value = p
  workVoxels.value = JSON.parse(JSON.stringify(currentVersion(p).voxels))
  undoStack.value = []; redoStack.value = []
  selected.value = new Set()
}

// ---------- 历史 ----------
function snapshot() {
  undoStack.value.push(JSON.stringify(workVoxels.value))
  if (undoStack.value.length > 50) undoStack.value.shift()
  redoStack.value = []
}
function undo() {
  if (!undoStack.value.length) return
  redoStack.value.push(JSON.stringify(workVoxels.value))
  workVoxels.value = JSON.parse(undoStack.value.pop())
  selected.value = new Set()
}
function redo() {
  if (!redoStack.value.length) return
  undoStack.value.push(JSON.stringify(workVoxels.value))
  workVoxels.value = JSON.parse(redoStack.value.pop())
  selected.value = new Set()
}

// ---------- 落位(含镜像) ----------
function onPlace({ x, y, z, type }) {
  snapshot()
  const targets = [{ x, y, z, type }]
  if (mirror.value) {
    const mx = gridW - 1 - x
    if (mx !== x) targets.push({ x: mx, y, z, type })
  }
  let added = 0, skipped = 0
  for (const t of targets) {
    if (workVoxels.value.some(v => v.x === t.x && v.y === t.y && v.z === t.z)) { skipped++; continue }
    const def = VOXEL_TYPES[t.type]
    workVoxels.value.push({
      id: uid('vx'), x: t.x, y: t.y, z: t.z, type: t.type,
      cells: def.hasCells ? (t.type === 'poison_cab' ? 16 : 60) : null,
      capacity: def.hasCells ? (t.type === 'poison_cab' ? 0.5 : 2) : null,
      commonSlot: false, herbName: null
    })
    added++
  }
  if (skipped) toast(`镜像位被占用,跳过 ${skipped} 处`, 'error')
  if (added) toast(mirror.value ? `已生成对称体素 ×${added}` : '已落位')
}

// ---------- 选择 ----------
function onSelectionChange(ids) {
  selected.value = new Set(ids)
}
function onVoxelClick(v) {
  if (tool.value === 'select' && !selected.value.has(v.id)) {
    selected.value = new Set([v.id])
  }
}
const selectedVoxel = computed(() =>
  workVoxels.value.find(v => selected.value.has(v.id)) || null)

// ---------- 选区平移 ----------
function onTranslate({ dx, dy, ids }) {
  snapshot()
  const moving = workVoxels.value.filter(v => ids.includes(v.id))
  const conflicts = moving.some(v =>
    workVoxels.value.some(o => !ids.includes(o.id) &&
      o.x === v.x + dx && o.y === v.y + dy && o.z === v.z)
  )
  const outOfBounds = moving.some(v =>
    v.x + dx < 0 || v.x + dx >= gridW || v.y + dy < 0 || v.y + dy >= gridD)
  if (conflicts || outOfBounds) {
    undoStack.value.pop()
    toast(outOfBounds ? '平移超出网格边界' : '目标位置与其他体素冲突', 'error')
    return
  }
  moving.forEach(v => { v.x += dx; v.y += dy })
  toast(`选区整体平移 (${dx},${dy})`)
}

// ---------- 复制 / 粘贴 ----------
function copySel() {
  const items = workVoxels.value.filter(v => selected.value.has(v.id))
  if (!items.length) return
  const minX = Math.min(...items.map(v => v.x))
  const minY = Math.min(...items.map(v => v.y))
  clipboard.value = items.map(v => ({
    ...v, id: null, dx: v.x - minX, dy: v.y - minY
  }))
  toast(`已复制 ${items.length} 个体素,可重复粘贴`)
}
function pasteSel() {
  if (!clipboard.value.length) return
  snapshot()
  // 粘贴到当前层、选区右下方偏移 2 格
  const ox = 2, oy = 2, targetZ = level.value
  let added = 0, skipped = 0
  for (const c of clipboard.value) {
    const nx = c.dx + ox, ny = c.dy + oy
    if (nx >= gridW || ny >= gridD ||
        workVoxels.value.some(v => v.x === nx && v.y === ny && v.z === targetZ)) { skipped++; continue }
    workVoxels.value.push({
      ...c, id: uid('vx'), x: nx, y: ny, z: targetZ, dx: undefined, dy: undefined
    })
    added++
  }
  toast(skipped ? `粘贴 ${added} 个,冲突跳过 ${skipped} 个` : `已粘贴 ${added} 个体素`)
}

function deleteSel() {
  if (!selected.value.size) return
  snapshot()
  workVoxels.value = workVoxels.value.filter(v => !selected.value.has(v.id))
  selected.value = new Set()
  toast('已删除')
}

// ---------- 图层 ----------
function toggleLayer(key, on) {
  visibleLayers.value = { ...visibleLayers.value, [key]: on }
}
function layerCount(layerKey) {
  if (layerKey === 'annotation') return currentVer.value?.annotations.length || 0
  return workVoxels.value.filter(v => layerOf(v.type) === layerKey).length
}
function layerLabel(type) {
  return LAYER_DEFS.find(l => l.key === layerOf(type))?.label
}

const levelCounts = computed(() => {
  const c = [0, 0, 0, 0]
  workVoxels.value.forEach(v => { if (v.z < 4) c[v.z]++ })
  return c
})

// ---------- 校核 / 合并 ----------
const issues = computed(() => runRules(workVoxels.value))
const issueHighlight = computed(() => {
  const m = new Map()
  issues.value.forEach(i => {
    if (i.voxel) m.set(`${i.voxel.x},${i.voxel.y},${i.voxel.z}`, 'issue')
  })
  return m
})
const mergeStats = computed(() => mergeVoxels(workVoxels.value))

function locateIssue(it) {
  if (!it.voxel) return
  level.value = it.voxel.z
  selected.value = new Set([it.voxel.id])
  tool.value = 'select'
}

// ---------- 导出 ----------
function exportGLB() {
  if (!workVoxels.value.length) return toast('画布为空', 'error')
  download(buildGLB(workVoxels.value), `${project.value.name}_${currentVer.value.version}.glb`)
  toast('GLB 模型已导出(按材质合批)')
}
function exportCSV() {
  if (!workVoxels.value.length) return toast('画布为空', 'error')
  download(buildSlotCSV(workVoxels.value), `${project.value.name}_药位清单_${currentVer.value.version}.csv`)
  toast('药位清单 CSV 已导出')
}

// ---------- 提交版本 ----------
function doSubmit() {
  const stats = mergeVoxels(workVoxels.value)
  const nv = submitVersion(project.value, workVoxels.value, submitNote.value,
    ROLES.find(r => r.key === getRole())?.label || '药师',
    { groups: stats.groups.length, beforeFaces: stats.beforeFaces,
      afterFaces: stats.afterFaces, reduction: stats.reduction })
  showSubmit.value = false
  submitNote.value = ''
  toast(`已提交 ${nv.version},进入审核流程`, 'success')
  loadProject()
  router.push(`/review/${project.value.id}`)
}
</script>

<style scoped>
.modal-mask {
  position: fixed; inset: 0; background: rgba(5, 9, 18, .62);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal-box { width: 460px; max-width: 92vw; }
.modal-box textarea { width: 100%; resize: vertical; }
</style>
