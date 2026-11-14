<template>
  <div v-if="project" class="editor-shell">
    <!-- 左:版本与批注列表 -->
    <aside class="side-left">
      <div class="section-title">审核版本</div>
      <select v-model="versionId" style="width:100%">
        <option v-for="v in project.versions" :key="v.id" :value="v.id">
          {{ v.version }} · {{ fmt(v.at) }} · {{ v.operator }}
        </option>
      </select>
      <p style="margin:8px 0;font-size:12px">
        批注 <strong>{{ version.annotations.length }}</strong> 条 ·
        未闭环 <strong :style="{ color: openCount ? '#ff5d6c' : '#38d6a0' }">{{ openCount }}</strong> 条
      </p>

      <div class="section-title">批注清单</div>
      <div v-if="!version.annotations.length" class="empty-hint" style="padding:18px 6px">
        暂无批注。药师长在画布上点击药斗打点,或用下方「规则校核生成批注」。
      </div>
      <div v-for="(a, i) in version.annotations" :key="a.id"
           class="annotation-card" :class="a.status"
           :style="activeAnno === a.id ? 'outline:1px solid var(--accent)' : ''"
           @click="activeAnno = a.id">
        <div class="head">
          <strong>#{{ i + 1 }} {{ kindLabel(a.kind) }}</strong>
          <span class="badge" :class="statusClass(a.status)">{{ statusLabel(a.status) }}</span>
        </div>
        <div style="font-size:12.5px;line-height:1.6">{{ a.text }}</div>
        <div class="muted" style="font-size:11px;margin-top:5px">
          {{ a.who }} · {{ fmt(a.at) }} · 打点 ({{ a.gx }},{{ a.gy }},第{{ (a.gz||0)+1 }}层)
        </div>
        <div class="thread" v-if="a.thread.length">
          <div v-for="(m, j) in a.thread" :key="j" class="msg">
            <span class="who">{{ m.who }}</span>
            <span class="badge sm" :class="m.action === 'fixed' ? 'closed' : 'kept'">
              {{ m.action === 'fixed' ? '已改' : '保留' }}
            </span>
            <span class="when">{{ fmt(m.at) }}</span>
            <div style="margin-top:3px">{{ m.text }}</div>
          </div>
        </div>
        <div v-if="role === 'builder' && a.status === 'open'" style="margin-top:8px">
          <textarea v-model="replyText[a.id]" rows="2" placeholder="回复处理说明…"
                    style="width:100%;margin-bottom:6px"></textarea>
          <div style="display:flex;gap:6px">
            <button class="btn sm success" @click="reply(a, 'fixed')">已改</button>
            <button class="btn sm warn" @click="reply(a, 'kept')">保留原因</button>
          </div>
        </div>
      </div>
    </aside>

    <!-- 中:画布 -->
    <main class="canvas-area">
      <div class="canvas-toolbar">
        <strong>{{ project.name }}</strong>
        <span class="badge" :class="project.status">{{ STATUS_LABELS[project.status] }}</span>
        <span class="spacer"></span>
        <button class="btn sm" :class="{ primary: role === 'chief' && tool === 'annotate' }"
                :disabled="role !== 'chief'" @click="tool = 'annotate'">
          📍 打点批注
        </button>
        <button class="btn sm" :disabled="role !== 'chief'" @click="generateFromRules">
          规则校核生成批注
        </button>
        <button class="btn sm" @click="tool = 'select'">浏览</button>
      </div>
      <div class="svg-host">
        <VoxelCanvas
          ref="canvasRef"
          :voxels="version.voxels"
          :grid-w="project.gridW" :grid-d="project.gridD"
          :tool="tool" :level="level" :mirror="false"
          :visible-layers="visibleLayers"
          :selected="new Set()"
          :annotations="version.annotations"
          :highlight="issueHighlight"
          :readonly="true"
          @annotate-point="onAnnoPoint"
          @annotation-click="onAnnoClick"
        />
      </div>
    </main>

    <!-- 右:流程操作 -->
    <aside class="side-right">
      <div class="section-title">当前身份</div>
      <select v-model="role" style="width:100%" @change="saveRole">
        <option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option>
      </select>
      <p class="muted" style="font-size:11.5px;margin-top:6px">
        药师长打点/审核;制作方逐条回复;药师可查看后回编辑器调整并提交新版本。
      </p>

      <div class="section-title">本版校核问题({{ issues.length }})</div>
      <div v-if="!issues.length" class="check-item pass">✓ 无规则问题</div>
      <div v-for="(it, i) in issues" :key="i" class="check-item fail"
           style="cursor:pointer" @click="level = it.voxel?.z || 0">
        <span>✕</span><span>{{ it.message }}</span>
      </div>

      <div class="section-title">闭环统计</div>
      <div class="card" style="padding:12px;font-size:12.5px;line-height:2">
        批注总数:{{ version.annotations.length }}<br />
        已改闭环:<strong style="color:#38d6a0">{{ closedCount }}</strong><br />
        保留说明:<strong style="color:#ffb020">{{ keptCount }}</strong><br />
        未闭环:<strong :style="{ color: openCount ? '#ff5d6c' : undefined }">{{ openCount }}</strong>
      </div>

      <div class="section-title">流程</div>
      <div style="display:grid;gap:8px">
        <RouterLink class="btn" :to="`/editor/${project.id}`">✎ 回编辑器调整并提交新版本</RouterLink>
        <RouterLink class="btn" :to="`/diff/${project.id}`">⇄ 版本左右对比</RouterLink>
        <RouterLink class="btn" :to="`/history/${project.id}`">🕑 版本历史</RouterLink>
        <button class="btn success" :disabled="!canApprove" @click="doApprove">
          审核通过{{ openCount ? `(仍有 ${openCount} 条未闭环)` : '' }}
        </button>
        <button v-if="project.status === 'approved'" class="btn primary" @click="doDeliver">
          进入施工交付
        </button>
      </div>
    </aside>

    <!-- 打点录入弹窗 -->
    <div v-if="pending" class="modal-mask" @click.self="pending = null">
      <div class="card modal-box">
        <h3>新建打点批注</h3>
        <p class="muted">位置 ({{ pending.gx }},{{ pending.gy }},第{{ pending.gz + 1 }}层)</p>
        <label class="field" style="margin-bottom:10px">问题类型
          <select v-model="pending.kind">
            <option value="distance">药斗离调剂台超过 2 米</option>
            <option value="gold">常用药位不在黄金区</option>
            <option value="other">其他问题</option>
          </select>
        </label>
        <label class="field">批注内容
          <textarea v-model="pending.text" rows="3" placeholder="描述问题与整改要求"></textarea>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button class="btn" @click="pending = null">取消</button>
          <button class="btn primary" @click="saveAnno">保存批注</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import VoxelCanvas from '../components/VoxelCanvas.vue'
import { STATUS_LABELS, ROLES, uid } from '../lib/constants.js'
import {
  getProject, annotate, replyAnno, approve, deliver,
  getRole, setRole
} from '../lib/store.js'
import { runRules } from '../lib/rules.js'
import { toast } from '../composables/useToast.js'

const props = defineProps({ id: String })
const router = useRouter()

const project = ref(null)
const versionId = ref(null)
const tool = ref('select')
const level = ref(0)
const role = ref(getRole())
const pending = ref(null)
const activeAnno = ref(null)
const replyText = ref({})
const visibleLayers = ref({ herb_cab: true, poison_cab: true, work: true, annotation: true })

onMounted(load)

function load() {
  const p = getProject(props.id)
  if (!p) { router.push('/'); return }
  project.value = p
  if (!versionId.value) versionId.value = p.currentVersionId || p.versions[0].id
}
const version = computed(() =>
  project.value.versions.find(v => v.id === versionId.value) || project.value.versions[0])

// 切换审核版本后回到浏览态并清除高亮
watch(versionId, () => { tool.value = 'select'; activeAnno.value = null })

const issues = computed(() => runRules(version.value.voxels))
const issueHighlight = computed(() => {
  const m = new Map()
  issues.value.forEach(i => { if (i.voxel) m.set(`${i.voxel.x},${i.voxel.y},${i.voxel.z}`, 'issue') })
  return m
})

const openCount = computed(() => version.value.annotations.filter(a => a.status === 'open').length)
const closedCount = computed(() => version.value.annotations.filter(a => a.status === 'closed').length)
const keptCount = computed(() => version.value.annotations.filter(a => a.status === 'kept').length)
const canApprove = computed(() =>
  role.value === 'chief' && openCount.value === 0 && version.value.annotations.length > 0)

function saveRole() { setRole(role.value) }

function onAnnoPoint(pt) {
  if (role.value !== 'chief') return toast('仅药师长可新增批注', 'error')
  pending.value = { ...pt, kind: 'distance', text: '' }
}
function saveAnno() {
  if (!pending.value.text.trim()) return toast('请填写批注内容', 'error')
  annotate(project.value, version.value.id, {
    id: uid('an'),
    gx: pending.value.gx, gy: pending.value.gy, gz: pending.value.gz,
    kind: pending.value.kind, text: pending.value.text,
    who: ROLES.find(r => r.key === 'chief').label,
    at: Date.now(), status: 'open', thread: []
  })
  pending.value = null
  load()
  toast('批注已保存,方案状态变为待返工', 'success')
}
function onAnnoClick(a) { activeAnno.value = a.id }

// 规则问题一键转批注(按 规则+坐标 去重)
function generateFromRules() {
  if (role.value !== 'chief') return toast('仅药师长可操作', 'error')
  const exist = new Set(version.value.annotations.map(a => `${a.rule || a.kind}@${a.gx},${a.gy}`))
  let n = 0
  for (const it of issues.value) {
    if (it.rule === 'missing' || !it.voxel) continue
    const k = `${it.rule}@${it.voxel.x},${it.voxel.y}`
    if (exist.has(k)) continue
    annotate(project.value, version.value.id, {
      id: uid('an'),
      gx: it.voxel.x, gy: it.voxel.y, gz: it.voxel.z,
      kind: it.rule === 'poison' ? 'other' : it.rule,
      rule: it.rule,
      text: '【规则校核】' + it.message,
      who: ROLES.find(r => r.key === 'chief').label,
      at: Date.now(), status: 'open', thread: []
    })
    n++
  }
  load()
  toast(n ? `已生成 ${n} 条规则批注` : '规则问题均已有对应批注', n ? 'success' : 'info')
}

function reply(a, action) {
  const text = (replyText.value[a.id] || '').trim()
  if (!text) return toast('请填写回复说明', 'error')
  replyAnno(project.value, version.value.id, a.id, {
    role: 'builder',
    who: ROLES.find(r => r.key === 'builder').label,
    at: Date.now(), action, text
  })
  replyText.value[a.id] = ''
  load()
  toast(action === 'fixed' ? '已标记「已改」,该条闭环' : '已登记保留原因', 'success')
}

function doApprove() {
  if (!canApprove.value) return
  approve(project.value)
  load()
  toast('审核通过,可进入施工交付', 'success')
}
function doDeliver() {
  deliver(project.value)
  load()
  toast('已进入施工交付阶段', 'success')
}

function kindLabel(k) {
  return { distance: '2米距离', gold: '黄金区', other: '其他' }[k] || '其他'
}
function statusLabel(s) {
  return { open: '未闭环', closed: '已改', kept: '保留' }[s]
}
function statusClass(s) {
  return { open: 'open', closed: 'closed', kept: 'kept' }[s]
}
function fmt(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
.modal-mask {
  position: fixed; inset: 0; background: rgba(5, 9, 18, .62);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal-box { width: 460px; max-width: 92vw; }
.modal-box textarea, .modal-box select { width: 100%; }
.badge.sm { padding: 1px 7px; }
</style>
