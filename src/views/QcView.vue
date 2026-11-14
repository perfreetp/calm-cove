<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import {
  state, activeProject, qcReview, supervisorUnlock, QC_STANDARDS,
  workerById, orderStatus, exportOrderLedger, resolveBuilding
} from '../store'

const toast = inject('toast')

const queue = computed(() =>
  state.orders
    .filter((o) => o.projectId === activeProject.value?.id)
    .filter((o) => o.status === 'submitted' || o.status === 'locked')
    .sort((a, b) => a.stationOrder - b.stationOrder)
)

const selectedId = ref(queue.value[0]?.id || null)
watch(queue, (q) => {
  if (!selectedId.value || !q.find((o) => o.id === selectedId.value)) selectedId.value = q[0]?.id || null
}, { immediate: true })

const active = computed(() => queue.value.find((o) => o.id === selectedId.value) || null)
const sub = computed(() => active.value?.submissions?.[active.value.submissions.length - 1] || null)
const worker = computed(() => (active.value?.workerId ? workerById(active.value.workerId) : null))

const sampleRate = ref(0.6)
const historySample = computed(() => state.orders.filter((o) => o.qc && o.qc.verdict === 'pass').length)

const form = reactive({
  blindRatio: 62,
  sightBlocked: false,
  dimensionOk: true,
  orientationOk: true,
  photoOk: true,
  extraReason: ''
})

watch(active, (o) => {
  if (!o) return
  form.sightBlocked = false
  form.extraReason = ''
  form.dimensionOk = true
  form.orientationOk = true
  form.photoOk = true
  if (o.qc && o.qc.verdict === 'reject') {
    form.blindRatio = Math.round((o.qc.blindPathRatio || 0.32) * 100)
    form.sightBlocked = !!o.qc.sightBlocked
    form.dimensionOk = !!o.qc.dimensionOk
    form.orientationOk = !!o.qc.orientationOk
    form.photoOk = !!o.qc.photoOk
    form.extraReason = o.qc.extraReason || ''
  } else {
    form.blindRatio = sub.value?.blindRatioHint
      ? Math.round(sub.value.blindRatioHint * 100)
      : 72
  }
}, { immediate: true })

const liveReasons = computed(() => {
  const r = []
  if (form.blindRatio < QC_STANDARDS.blindPathMin * 100) {
    r.push(`盲道连续率 ${form.blindRatio}%，低于 ${QC_STANDARDS.blindPathMin * 100}% 验收标准`)
  }
  if (form.sightBlocked) r.push('站亭或立柱遮挡行人/来车视线')
  if (!form.dimensionOk) r.push(`站台尺寸偏差超过 ±${QC_STANDARDS.dimToleranceMm}mm`)
  if (!form.orientationOk) r.push('站亭朝向与规划不符')
  if (!form.photoOk) r.push(`现场照片不足 ${QC_STANDARDS.minPhotos} 张`)
  if (form.extraReason.trim()) r.push(form.extraReason.trim())
  return r
})

const verdict = computed(() => (liveReasons.value.length ? 'reject' : 'pass'))
const willLock = computed(() => verdict.value === 'reject' && (active.value?.reworkCount || 0) + 1 >= 3)

const dims = computed(() => {
  if (!sub.value || !active.value) return null
  const d = sub.value.dims
  const p = active.value.plan
  return {
    l: { actual: d.lengthMm, plan: p.lengthMm, dev: d.lengthMm - p.lengthMm },
    w: { actual: d.widthMm, plan: p.widthMm, dev: d.widthMm - p.widthMm },
    h: { actual: d.heightMm, plan: p.heightMm, dev: d.heightMm - p.heightMm }
  }
})

const dimViolation = computed(() => {
  if (!dims.value) return false
  const m = Math.max(Math.abs(dims.value.l.dev), Math.abs(dims.value.w.dev), Math.abs(dims.value.h.dev))
  return m > QC_STANDARDS.dimToleranceMm
})

watch(dimViolation, (v) => {
  if (v && active.value?.status === 'submitted') form.dimensionOk = false
}, { immediate: true })

const photoCountOk = computed(() => (sub.value?.photos?.length || 0) >= QC_STANDARDS.minPhotos)

watch(active, () => {}, { immediate: true })

function applyAutoFromSubmission() {
  if (!sub.value) return
  if (sub.value.blindRatioHint != null) form.blindRatio = Math.round(sub.value.blindRatioHint * 100)
  form.dimensionOk = !dimViolation.value
  form.photoOk = photoCountOk.value
  form.orientationOk = sub.value.orientation === active.value?.plan.orientation
  if (!form.orientationOk) toast('实收朝向与规划不符，已同步到验收项', 'warn')
}

function submit() {
  const order = active.value
  if (!order) return
  const r = qcReview(order.id, {
    blindPathRatio: form.blindRatio / 100,
    sightBlocked: form.sightBlocked,
    dimensionOk: form.dimensionOk,
    orientationOk: form.orientationOk,
    photoOk: form.photoOk,
    extraReason: form.extraReason.trim()
  })
  if (!r.ok) {
    toast(r.msg, 'bad')
    return
  }
  if (r.verdict === 'pass') {
    toast(`${order.id} 验收通过`, 'good')
  } else if (r.locked) {
    toast(`${order.id} 第 ${order.reworkCount} 次返工，已锁单待主管确认`, 'bad', 4200)
  } else {
    toast(`${order.id} 已打回：${r.reasons[0]}`, 'bad', 3600)
  }
}

function unlock() {
  if (!active.value) return
  if (!window.confirm(`确认解锁 ${active.value.id}？解锁后返工计数清零，施工员可继续返工。`)) return
  const r = supervisorUnlock(active.value.id, '主管现场复核，同意继续整改')
  if (r.ok) toast(`${active.value.id} 已解锁，返工计数清零`, 'good')
}

function randomPick() {
  // 按抽检比例从待检队列取样
  if (queue.value.length <= 1) return
  const idx = Math.floor(Math.random() * queue.value.length)
  selectedId.value = queue.value[idx].id
}

const stats = computed(() => {
  const list = state.orders.filter((o) => o.projectId === activeProject.value?.id)
  const qc = list.filter((o) => o.qc)
  const rejected = qc.filter((o) => o.qc.verdict === 'reject').length
  return {
    sampled: qc.length,
    pass: qc.filter((o) => o.qc.verdict === 'pass').length,
    rejected,
    lock: list.filter((o) => o.status === 'locked').length,
    passRate: qc.length ? (qc.length - rejected) / qc.length : 0
  }
})

const rationale = computed(() => {
  if (verdict.value === 'pass') return '各项均达到验收标准，可直接通过。'
  if (willLock.value) return '本次打回后累计返工达到 3 次，系统将自动锁单并升级至主管。'
  return `本次打回为第 ${(active.value?.reworkCount || 0) + 1} 次返工，累计 3 次将锁单。`
})

const lockList = computed(() => state.orders.filter((o) => o.status === 'locked'))

const standardItems = [
  { key: 'blind', label: '盲道连续率 ≥ 40%', note: '低于四成直接打回' },
  { key: 'sight', label: '不遮挡行人/来车视线', note: '遮挡视线直接打回' },
  { key: 'dim', label: '尺寸偏差 ≤ ±50mm', note: '站台长宽高实测' },
  { key: 'orient', label: '站亭朝向合规', note: '开口朝车行道' },
  { key: 'photo', label: '现场照片 ≥ 2 张', note: '全景 + 细节' }
]
</script>

<template>
  <div class="page page-wide" v-if="activeProject">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 06 · 验收抽检</div>
        <h1 class="page-title">质检验收抽检<small>QC SAMPLING</small></h1>
        <p class="page-desc">
          按验收标准抽查施工成果。盲道连续率不足四成、或站亭遮挡视线的工单直接打回并写明原因；
          返工累计三次自动锁单，等待主管确认。
        </p>
      </div>
      <div class="spacer"></div>
      <span class="tag warn mono">抽检比例 {{ Math.round(sampleRate * 100) }}%</span>
      <button class="btn btn-ghost btn-sm" @click="randomPick">随机抽一单</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <section class="panel metric">
        <div class="metric-label">待检队列</div>
        <div class="metric-value">{{ queue.length }}<span class="unit">张</span></div>
        <div class="metric-delta">{{ lockList.length }} 张锁单待确认</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">已抽检</div>
        <div class="metric-value">{{ stats.sampled }}<span class="unit">张</span></div>
        <div class="metric-delta">覆盖 {{ ((stats.sampled / Math.max(1, state.orders.filter(o => o.projectId === activeProject.id).length)) * 100).toFixed(0) }}% 工单</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">验收通过率</div>
        <div class="metric-value" :style="{ color: stats.passRate > 0.7 ? 'var(--mint)' : 'var(--amber)' }">
          {{ (stats.passRate * 100).toFixed(0) }}<span class="unit">%</span>
        </div>
        <div class="bar-track" style="margin-top:8px"><div class="bar-fill" :style="{ width: (stats.passRate * 100) + '%' }"></div></div>
      </section>
      <section class="panel metric">
        <div class="metric-label">打回 / 锁单</div>
        <div class="metric-value" style="color:var(--red)">{{ stats.rejected }}<span class="unit">/ {{ stats.lock }}</span></div>
        <div class="metric-delta">三次返工自动锁单</div>
      </section>
    </div>

    <div class="grid" style="grid-template-columns: 300px minmax(0, 1fr); align-items: start">
      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">抽检队列</span>
            <span class="spacer"></span>
            <span class="tag idle mono">FIFO</span>
          </div>
          <div style="max-height:380px;overflow:auto">
            <div
              v-for="o in queue" :key="o.id"
              style="padding:9px 13px;border-bottom:1px solid rgba(126,176,196,0.08);cursor:pointer"
              :style="{ background: selectedId === o.id ? 'rgba(232,168,60,0.09)' : 'transparent', borderLeft: selectedId === o.id ? '2px solid var(--amber)' : '2px solid transparent' }"
              @click="selectedId = o.id"
            >
              <div class="row">
                <span class="pill-num">{{ o.stationOrder }}</span>
                <span style="font-weight:600;font-size:12px">{{ o.stationName }}</span>
                <span class="spacer tag" :class="orderStatus(o.status).tone" style="font-size:9px">{{ orderStatus(o.status).label }}</span>
              </div>
              <div class="row" style="margin-top:3px">
                <span class="hint" style="font-size:10px">{{ workerById(o.workerId)?.name }}</span>
                <span class="spacer hint mono" style="font-size:9.5px">返工 {{ o.reworkCount }}×</span>
              </div>
            </div>
            <div v-if="!queue.length" class="empty"><b>队列为空</b>所有提交均已处理</div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">验收标准</span></div>
          <div class="panel-body" style="font-size:11px;line-height:1.65">
            <div v-for="s in standardItems" :key="s.key" style="padding:5px 0;border-bottom:1px solid rgba(126,176,196,0.07)">
              <div class="row"><span style="color:var(--text)">{{ s.label }}</span></div>
              <div class="hint">{{ s.note }}</div>
            </div>
          </div>
        </section>

        <section class="panel" v-if="lockList.length">
          <div class="panel-head">
            <span class="panel-title">锁单待确认</span>
            <span class="spacer"></span>
            <span class="tag locked">{{ lockList.length }}</span>
          </div>
          <div class="panel-body" style="font-size:11px">
            <div v-for="o in lockList" :key="o.id" style="padding:6px 0;border-bottom:1px solid rgba(126,176,196,0.07)">
              <div class="row">
                <span class="pill-num">{{ o.stationOrder }}</span>
                <span>{{ o.stationName }}</span>
                <span class="spacer tag locked" style="font-size:9px">{{ workerById(o.workerId)?.name }}</span>
              </div>
              <div class="hint" style="font-size:10px;margin-top:2px">{{ o.locked?.reason }}</div>
            </div>
          </div>
        </section>
      </aside>

      <section class="panel" v-if="active">
        <div class="panel-head">
          <span class="panel-title"><span class="idx">B</span>验收工作台 · {{ active.stationName }}</span>
          <span class="spacer"></span>
          <span class="tag" :class="orderStatus(active.status).tone">{{ orderStatus(active.status).label }}</span>
          <span class="tag idle mono">{{ active.id }}</span>
        </div>

        <div class="panel-body">
          <div v-if="active.status === 'locked'" class="banner violet" style="margin-bottom:12px">
            <span>🔒</span>
            <span>{{ active.locked?.reason }}。主管确认后可解锁继续返工。</span>
            <button class="btn btn-sm" style="margin-left:auto" @click="unlock">主管确认解锁</button>
          </div>

          <div class="grid grid-2" style="gap:14px">
            <div>
              <div class="hr-label" style="margin-bottom:8px">现场提交物</div>
              <div class="kv" style="grid-template-columns:84px 1fr;font-size:11.5px">
                <dt>施工员</dt><dd>{{ worker?.name }} · {{ worker?.phone }}</dd>
                <dt>所属片区</dt><dd>{{ active.area }}</dd>
                <dt>提交时间</dt><dd class="mono" style="font-size:10px">{{ sub ? new Date(sub.at).toLocaleString('zh-CN') : '—' }}</dd>
                <dt>列次返工</dt><dd :style="{ color: active.reworkCount >= 3 ? 'var(--red)' : 'var(--amber)' }">第 {{ active.reworkCount + 1 }} 次</dd>
              </div>

              <div class="divider"></div>
              <div class="hr-label" style="margin-bottom:8px">尺寸复核</div>
              <table class="data" v-if="dims">
                <thead><tr><th>项</th><th>设计</th><th>实收</th><th>偏差</th></tr></thead>
                <tbody>
                  <tr v-for="(d, k) in dims" :key="k">
                    <td style="color:var(--text-dim)">{{ { l: '长', w: '宽', h: '高' }[k] }}</td>
                    <td class="num">{{ d.plan }}</td>
                    <td class="num">{{ d.actual }}</td>
                    <td class="num" :style="{ color: Math.abs(d.dev) > QC_STANDARDS.dimToleranceMm ? 'var(--red)' : 'var(--mint)' }">
                      {{ d.dev > 0 ? '+' : '' }}{{ d.dev }} mm
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="row row-wrap" style="gap:8px;margin-top:10px" v-if="sub?.photos?.length">
                <div
                  v-for="(p, i) in sub.photos.slice(0, 4)" :key="i"
                  style="width:104px;height:72px;border-radius:6px;overflow:hidden;border:1px solid var(--line-strong)"
                >
                  <img :src="p" style="width:100%;height:100%;object-fit:cover;display:block" />
                </div>
              </div>
              <div class="hint" v-else>无现场照片</div>
            </div>

            <div>
              <div class="hr-label" style="margin-bottom:8px">抽检判定</div>
              <div class="field">
                <label>盲道连续率 {{ form.blindRatio }}%（标准 ≥ {{ QC_STANDARDS.blindPathMin * 100 }}%）</label>
                <input v-model.number="form.blindRatio" type="range" min="0" max="100" class="range" />
                <div class="bar-track" style="margin-top:6px;position:relative">
                  <div
                    class="bar-fill"
                    :class="form.blindRatio < 40 ? 'red' : ''"
                    :style="{ width: form.blindRatio + '%' }"
                  ></div>
                  <div style="position:absolute;left:40%;top:-3px;width:1px;height:11px;background:var(--amber)"></div>
                </div>
                <span class="hint" :style="{ color: form.blindRatio < 40 ? 'var(--red)' : 'var(--text-faint)' }">
                  {{ form.blindRatio < 40 ? '低于四成，直接打回' : '达到下限' }}
                </span>
              </div>

              <div class="divider"></div>
              <div class="checklist">
                <label class="check-item" :class="{ fail: form.sightBlocked }">
                  <input type="checkbox" v-model="form.sightBlocked" />
                  <span>站亭 / 立柱遮挡行人及来车视线</span>
                  <span class="spacer tag" :class="form.sightBlocked ? 'bad' : 'good'" style="font-size:9px">{{ form.sightBlocked ? '不合格' : '合格' }}</span>
                </label>
                <label class="check-item" :class="{ fail: !form.dimensionOk }">
                  <input type="checkbox" v-model="form.dimensionOk" />
                  <span>站台尺寸偏差 ≤ ±{{ QC_STANDARDS.dimToleranceMm }}mm</span>
                  <span class="spacer tag" :class="form.dimensionOk ? 'good' : 'bad'" style="font-size:9px">{{ form.dimensionOk ? '合格' : '不合格' }}</span>
                </label>
                <label class="check-item" :class="{ fail: !form.orientationOk }">
                  <input type="checkbox" v-model="form.orientationOk" />
                  <span>站亭朝向合规（开口朝车行道）</span>
                  <span class="spacer tag" :class="form.orientationOk ? 'good' : 'bad'" style="font-size:9px">{{ form.orientationOk ? '合格' : '不合格' }}</span>
                </label>
                <label class="check-item" :class="{ fail: !form.photoOk }">
                  <input type="checkbox" v-model="form.photoOk" />
                  <span>现场照片 ≥ {{ QC_STANDARDS.minPhotos }} 张</span>
                  <span class="spacer tag" :class="form.photoOk ? 'good' : 'bad'" style="font-size:9px">{{ form.photoOk ? '合格' : '不合格' }}</span>
                </label>
              </div>

              <div class="row" style="margin-top:9px">
                <button class="btn btn-ghost btn-xs" @click="applyAutoFromSubmission">按实收数据自动判定</button>
              </div>

              <div class="field" style="margin-top:10px">
                <label>补充打回原因</label>
                <input v-model="form.extraReason" class="input" placeholder="如：候车区与盲道存在 15cm 高差" />
              </div>

              <div class="banner" :class="verdict === 'pass' ? 'good' : willLock ? 'violet' : 'bad'" style="margin-top:12px;font-size:11.5px">
                <span>{{ verdict === 'pass' ? '✓' : '▲' }}</span>
                <span>
                  <b>{{ verdict === 'pass' ? '拟通过验收' : willLock ? '拟打回并锁单' : '拟打回并计入返工' }}</b><br />
                  {{ rationale }}
                </span>
              </div>

              <div v-if="liveReasons.length" style="margin-top:8px">
                <div class="hint" style="margin-bottom:4px">打回原因（写入工单台账）</div>
                <ul style="margin:0;padding-left:16px;font-size:11px;color:#f2a49e;line-height:1.6">
                  <li v-for="r in liveReasons" :key="r">{{ r }}</li>
                </ul>
              </div>

              <div class="row" style="margin-top:12px">
                <button
                  class="btn btn-primary"
                  style="flex:1"
                  :disabled="active.status !== 'submitted'"
                  @click="submit"
                >
                  {{ verdict === 'pass' ? '确认验收通过' : willLock ? '打回并锁单' : '打回整改' }}
                </button>
              </div>
              <div class="hint" style="margin-top:6px">结论将写入工单台账，可在主管看板导出。</div>
            </div>
          </div>
        </div>
      </section>
      <section class="panel" v-else>
        <div class="empty"><b>暂无待检工单</b>施工员提交后即进入此队列</div>
      </section>
    </div>
  </div>
</template>
