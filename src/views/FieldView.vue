<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import {
  state, activeProject, submitField, workerById, orderStatus, autoDispatch,
  QC_STANDARDS, orderStatus as statusOf, assignOrder
} from '../store'

const toast = inject('toast')

// 施工员身份：只显示本人待办。默认选中当前有待办的人，便于演示。
function defaultWorkerId() {
  const withTodo = state.workers.find((w) =>
    state.orders.some((o) => o.workerId === w.id && ['assigned', 'rejected'].includes(o.status))
  )
  return withTodo?.id || state.workers[0]?.id || 'w01'
}
const meId = ref(defaultWorkerId())
const me = computed(() => workerById(meId.value))

const myOrders = computed(() =>
  state.orders
    .filter((o) => o.workerId === meId.value)
    .sort((a, b) => {
      const order = { rejected: 0, assigned: 1, submitted: 2, passed: 3, locked: 4 }
      return (order[a.status] ?? 9) - (order[b.status] ?? 9) || a.stationOrder - b.stationOrder
    })
)

const todo = computed(() => myOrders.value.filter((o) => o.status === 'assigned' || o.status === 'rejected'))
const waiting = computed(() => myOrders.value.filter((o) => o.status === 'submitted'))
const doneList = computed(() => myOrders.value.filter((o) => o.status === 'passed' || o.status === 'locked'))

const activeId = ref(null)
watch(meId, () => {
  activeId.value = todo.value[0]?.id || myOrders.value[0]?.id || null
  resetForm()
})
watch(todo, (t) => {
  if (!activeId.value && t.length) activeId.value = t[0].id
}, { immediate: true })

const active = computed(() => myOrders.value.find((o) => o.id === activeId.value) || null)

const form = reactive({
  lengthMm: 5600,
  widthMm: 2200,
  heightMm: 2600,
  orientation: '南',
  blindRatio: 72,
  note: '',
  photos: [],
  photoNote: ''
})

function resetForm() {
  const o = active.value
  form.lengthMm = o?.plan?.lengthMm ?? 5600
  form.widthMm = o?.plan?.widthMm ?? 2200
  form.heightMm = o?.plan?.heightMm ?? 2600
  form.orientation = o?.plan?.orientation ?? '南'
  form.blindRatio = 72
  form.note = ''
  form.photos = []
  form.photoNote = ''
}
watch(active, resetForm)

const dimDeviation = computed(() => {
  const o = active.value
  if (!o) return { l: 0, w: 0, h: 0, max: 0 }
  const l = form.lengthMm - o.plan.lengthMm
  const w = form.widthMm - o.plan.widthMm
  const h = form.heightMm - o.plan.heightMm
  return { l, w, h, max: Math.max(Math.abs(l), Math.abs(w), Math.abs(h)) }
})
const dimOk = computed(() => dimDeviation.value.max <= QC_STANDARDS.dimToleranceMm)
const photoOk = computed(() => form.photos.length >= QC_STANDARDS.minPhotos)

const photoInput = ref(null)
function onFiles(e) {
  const files = [...(e.target.files || [])].filter((f) => /^image\//.test(f.type)).slice(0, Math.max(0, 8 - form.photos.length))
  e.target.value = ''
  for (const f of files) {
    const reader = new FileReader()
    reader.onload = () => {
      form.photos.push({ name: f.name, data: reader.result, size: f.size })
    }
    reader.readAsDataURL(f)
  }
}

function addPlaceholder() {
  const hues = [198, 34, 152, 262, 20]
  const hue = hues[form.photos.length % hues.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="hsl(${hue},18%,22%)"/><rect x="40" y="90" width="240" height="12" fill="hsl(${hue},45%,58%)"/><rect x="60" y="102" width="6" height="70" fill="hsl(${hue},12%,55%)"/><rect x="254" y="102" width="6" height="70" fill="hsl(${hue},12%,55%)"/><text x="10" y="212" fill="#dfe9ee" font-size="10" font-family="monospace">SITE / ${active.value?.stationName || ''}</text></svg>`
  form.photos.push({ name: `site-${form.photos.length + 1}.svg`, data: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`, size: 0 })
}

function removePhoto(i) {
  form.photos.splice(i, 1)
}

const canSubmit = computed(() => {
  if (!active.value) return false
  return (
    form.lengthMm > 0 && form.widthMm > 0 && form.heightMm > 0 &&
    photoOk.value &&
    form.photos.every((p) => p.data)
  )
})

const checks = computed(() => [
  { label: '站台三维尺寸已录入', ok: form.lengthMm > 0 && form.widthMm > 0 && form.heightMm > 0 },
  { label: `尺寸偏差 ≤ ±${QC_STANDARDS.dimToleranceMm}mm`, ok: dimOk.value, detail: `当前最大偏差 ${dimDeviation.value.max}mm` },
  { label: '站亭朝向已确认', ok: !!form.orientation },
  { label: `现场照片 ≥ ${QC_STANDARDS.minPhotos} 张`, ok: photoOk.value, detail: `${form.photos.length} 张` }
])

function submit() {
  if (!active.value) return
  if (!canSubmit.value) {
    toast('请补齐尺寸与现场照片后再提交', 'bad')
    return
  }
  const r = submitField(active.value.id, {
    dims: { lengthMm: +form.lengthMm, widthMm: +form.widthMm, heightMm: +form.heightMm },
    orientation: form.orientation,
    photos: form.photos.map((p) => p.data),
    photoNames: form.photos.map((p) => p.name),
    note: form.note,
    blindRatioHint: form.blindRatio / 100
  })
  if (r.ok) {
    toast(`${active.value.id} 已提交，等待质检抽查`, 'good')
    resetForm()
  } else toast(r.msg, 'bad')
}

const orientationList = QC_STANDARDS.orientationList

const footing = computed(() => {
  if (!active.value?.placement) return null
  const p = active.value.placement
  return { side: p.side > 0 ? '路线左侧' : '路线右侧', lateral: Math.abs(p.lateral).toFixed(0) }
})

function selfAssign() {
  // 演示：主管已派工，施工员仅在无归属于自己的工单时可领取本片区待派工单
  const area = me.value?.area
  if (!area) return
  const next = state.orders.find((o) => o.projectId === activeProject.value?.id && o.area === area && !o.workerId)
  if (!next) return toast('本片区暂无可领取工单', 'info')
  assignOrder(next.id, meId.value)
  toast(`已领取 ${next.id}（${next.stationName}）`, 'good')
  activeId.value = next.id
}
</script>

<template>
  <div class="page page-wide">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 05 · 现场施工</div>
        <h1 class="page-title">施工员作业台<small>FIELD WORKBENCH</small></h1>
        <p class="page-desc">
          施工员仅看到分派给本人的工单。录入站台尺寸、站亭朝向并上传现场照片后提交质检。
        </p>
      </div>
      <div class="spacer"></div>
      <div class="row" style="gap:8px">
        <span class="hint">当前身份</span>
        <select v-model="meId" class="select" style="width:190px">
          <option v-for="w in state.workers" :key="w.id" :value="w.id">{{ w.name }} · {{ w.area }}</option>
        </select>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <section class="panel metric">
        <div class="metric-label">我的待办</div>
        <div class="metric-value">{{ todo.length }}<span class="unit">张</span></div>
        <div class="metric-delta">{{ me?.area }} · {{ me?.name }}</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">待质检</div>
        <div class="metric-value" style="color:var(--amber)">{{ waiting.length }}<span class="unit">张</span></div>
        <div class="metric-delta">已提交待抽检</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">已验收</div>
        <div class="metric-value" style="color:var(--mint)">{{ doneList.length }}<span class="unit">张</span></div>
        <div class="metric-delta">含锁单 {{ myOrders.filter(o => o.status === 'locked').length }}</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">返工次数</div>
        <div class="metric-value" :style="{ color: myOrders.reduce((n, o) => n + o.reworkCount, 0) ? 'var(--red)' : 'var(--text-dim)' }">
          {{ myOrders.reduce((n, o) => n + o.reworkCount, 0) }}<span class="unit">次</span>
        </div>
        <div class="metric-delta">三次即锁单</div>
      </section>
    </div>

    <div class="grid" style="grid-template-columns: 300px minmax(0, 1fr); align-items: start">
      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">我的工单</span>
            <span class="spacer"></span>
            <button class="btn btn-ghost btn-xs" @click="selfAssign">领取片区工单</button>
          </div>
          <div style="max-height:460px;overflow:auto">
            <div
              v-for="o in myOrders" :key="o.id"
              style="padding:9px 13px;border-bottom:1px solid rgba(126,176,196,0.08);cursor:pointer"
              :style="{ background: activeId === o.id ? 'rgba(232,168,60,0.09)' : 'transparent', borderLeft: activeId === o.id ? '2px solid var(--amber)' : '2px solid transparent' }"
              @click="activeId = o.id"
            >
              <div class="row">
                <span class="pill-num">{{ o.stationOrder }}</span>
                <span style="font-weight:600;font-size:12px">{{ o.stationName }}</span>
                <span class="spacer tag" :class="orderStatus(o.status).tone" style="font-size:9px">{{ orderStatus(o.status).label }}</span>
              </div>
              <div class="row" style="gap:8px;margin-top:3px">
                <span class="hint mono" style="font-size:9.5px">{{ o.id }}</span>
                <span class="spacer hint" v-if="o.reworkCount">返工 {{ o.reworkCount }}×</span>
              </div>
            </div>
            <div v-if="!myOrders.length" class="empty">
              <b>暂无待办</b>
              主管尚未给你分派工单
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">施工要点</span></div>
          <div class="panel-body" style="font-size:11px;color:var(--text-dim);line-height:1.7">
            <div>· 站台尺寸以毫米录入，与设计值偏差不得超过 ±{{ QC_STANDARDS.dimToleranceMm }}mm</div>
            <div>· 站亭开口须朝向车行道，避免遮挡来车视线</div>
            <div>· 盲道连续率不低于 {{ QC_STANDARDS.blindPathMin * 100 }}%，否则直接打回</div>
            <div>· 上传 ≥ {{ QC_STANDARDS.minPhotos }} 张现场照片：全景 + 站亭细节</div>
          </div>
        </section>
      </aside>

      <section class="panel" v-if="active">
        <div class="panel-head">
          <span class="panel-title"><span class="idx">B</span>{{ active.stationName }} · 现场录入</span>
          <span class="spacer"></span>
          <span class="tag" :class="orderStatus(active.status).tone">{{ orderStatus(active.status).label }}</span>
          <span class="tag idle mono">{{ active.id }}</span>
        </div>

        <div class="panel-body">
          <div v-if="active.status === 'submitted'" class="banner warn" style="margin-bottom:12px">
            <span>◷</span><span>该工单已提交质检，等待抽检结果。如需修改请等待质检打回后重新提交。</span>
          </div>
          <div v-if="active.status === 'passed'" class="banner good" style="margin-bottom:12px">
            <span>✓</span><span>验收通过，本工单流程结束。</span>
          </div>
          <div v-if="active.status === 'locked'" class="banner violet" style="margin-bottom:12px">
            <span>🔒</span><span>返工累计 3 次已锁单，需主管确认后才可继续。</span>
          </div>
          <div v-if="active.qc && active.qc.verdict === 'reject'" class="banner bad" style="margin-bottom:12px">
            <span>▲</span><span>质检打回：{{ active.qc.reasons.join('；') }}</span>
          </div>

          <div class="grid grid-3" style="gap:10px">
            <div class="field">
              <label>站台长度（mm）</label>
              <input v-model.number="form.lengthMm" type="number" class="input mono" :disabled="active.status !== 'assigned' && active.status !== 'rejected'" />
              <span class="hint">设计 {{ active.plan.lengthMm }}mm · 偏差 {{ form.lengthMm - active.plan.lengthMm > 0 ? '+' : '' }}{{ form.lengthMm - active.plan.lengthMm }}mm</span>
            </div>
            <div class="field">
              <label>站台宽度（mm）</label>
              <input v-model.number="form.widthMm" type="number" class="input mono" :disabled="active.status !== 'assigned' && active.status !== 'rejected'" />
              <span class="hint">设计 {{ active.plan.widthMm }}mm · 偏差 {{ form.widthMm - active.plan.widthMm > 0 ? '+' : '' }}{{ form.widthMm - active.plan.widthMm }}mm</span>
            </div>
            <div class="field">
              <label>站台高度（mm）</label>
              <input v-model.number="form.heightMm" type="number" class="input mono" :disabled="active.status !== 'assigned' && active.status !== 'rejected'" />
              <span class="hint">设计 {{ active.plan.heightMm }}mm · 偏差 {{ form.heightMm - active.plan.heightMm > 0 ? '+' : '' }}{{ form.heightMm - active.plan.heightMm }}mm</span>
            </div>
          </div>

          <div class="banner" :class="dimOk ? 'good' : 'bad'" style="margin-top:10px;font-size:11.5px" v-if="active.status === 'assigned' || active.status === 'rejected'">
            <span>{{ dimOk ? '✓' : '▲' }}</span>
            <span>{{ dimOk ? '尺寸偏差在允许公差内' : `最大偏差 ${dimDeviation.max}mm，超出 ±${QC_STANDARDS.dimToleranceMm}mm 公差，提交后将被质检打回` }}</span>
          </div>

          <div class="divider"></div>

          <div class="grid grid-2" style="gap:12px">
            <div class="field">
              <label>站亭朝向（开口方位）</label>
              <div class="row row-wrap" style="gap:4px">
                <button
                  v-for="o in orientationList" :key="o"
                  class="btn btn-xs"
                  :style="{ borderColor: form.orientation === o ? 'rgba(232,168,60,0.7)' : 'var(--line)', background: form.orientation === o ? 'rgba(232,168,60,0.16)' : 'transparent', color: form.orientation === o ? 'var(--amber)' : 'var(--text-dim)' }"
                  @click="form.orientation = o"
                >{{ o }}</button>
              </div>
              <span class="hint">规划建议朝向：{{ active.plan.orientation }}（面向车行道）</span>
            </div>
            <div class="field">
              <label>盲道连续率（自检）{{ form.blindRatio }}%</label>
              <input v-model.number="form.blindRatio" type="range" min="0" max="100" class="range" />
              <span class="hint" :style="{ color: form.blindRatio < 40 ? 'var(--red)' : 'var(--text-faint)' }">
                {{ form.blindRatio < 40 ? '低于 40% 标准，提交必被打回' : '达到验收下限 40%' }}
              </span>
            </div>
          </div>

          <div class="field" style="margin-top:12px">
            <label>现场照片（≥ {{ QC_STANDARDS.minPhotos }} 张）</label>
            <div class="row row-wrap">
              <button class="btn btn-sm" @click="photoInput?.click()">选择本地图片</button>
              <button class="btn btn-ghost btn-sm" @click="addPlaceholder">生成占位照片</button>
              <span class="hint">支持 jpg/png，单次最多 8 张</span>
              <input ref="photoInput" type="file" accept="image/*" multiple hidden @change="onFiles" />
            </div>
            <div class="row row-wrap" style="gap:8px;margin-top:9px" v-if="form.photos.length">
              <div
                v-for="(p, i) in form.photos" :key="i"
                style="position:relative;width:116px;height:80px;border-radius:7px;overflow:hidden;border:1px solid var(--line-strong)"
              >
                <img :src="p.data" style="width:100%;height:100%;object-fit:cover;display:block" />
                <button class="btn btn-xs" style="position:absolute;top:3px;right:3px;padding:1px 5px;background:rgba(0,0,0,0.6)" @click="removePhoto(i)">✕</button>
              </div>
            </div>
            <div v-else class="hint" style="margin-top:8px;padding:14px;border:1px dashed var(--line-strong);border-radius:8px;text-align:center">
              尚未上传照片（可先生成占位样片用于演示）
            </div>
          </div>

          <div class="field" style="margin-top:12px">
            <label>施工说明</label>
            <textarea v-model="form.note" class="textarea" rows="2" placeholder="如：站亭基座采用 C30 混凝土，盲道砖更换 18 块…"></textarea>
          </div>

          <div class="divider"></div>

          <div class="grid grid-2" style="gap:14px">
            <div class="checklist">
              <div v-for="c in checks" :key="c.label" class="check-item" :class="{ fail: !c.ok }">
                <span class="tag" :class="c.ok ? 'good' : 'bad'" style="width:22px;justify-content:center">{{ c.ok ? '✓' : '✕' }}</span>
                <span>{{ c.label }}</span>
                <span v-if="c.detail" class="spacer hint mono" style="font-size:10px">{{ c.detail }}</span>
              </div>
            </div>
            <div>
              <div class="kv" style="grid-template-columns:78px 1fr">
                <dt>站点落位</dt><dd>{{ footing ? `${footing.side} · 退距 ${footing.lateral}m` : '—' }}</dd>
                <dt>换乘</dt><dd>{{ active.transfer ? active.transferCode : '非换乘站' }}</dd>
                <dt>返工累计</dt><dd>{{ active.reworkCount }} 次（上限 3）</dd>
              </div>
              <button
                class="btn btn-primary"
                style="width:100%;margin-top:12px"
                :disabled="!canSubmit || !['assigned', 'rejected'].includes(active.status)"
                @click="submit"
              >
                提交质检 →
              </button>
              <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:6px" @click="resetForm">重置表单</button>
            </div>
          </div>
        </div>
      </section>
      <section class="panel" v-else>
        <div class="empty">
          <b>没有可编辑的工单</b>
          从左侧“我的工单”选择一张待施工工单，或到主管端分派后再试
        </div>
      </section>
    </div>
  </div>
</template>
