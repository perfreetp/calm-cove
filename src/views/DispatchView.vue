<script setup>
import { computed, inject, ref } from 'vue'
import {
  state, activeProject, metrics, workerById, assignOrder, autoDispatch,
  DISTRICTS, ordersOfProject, ORDER_STATUS, spacingStatus, exportOrderLedger,
  placementBoxes, budgetOf, orderStatus
} from '../store'

const toast = inject('toast')
const project = computed(() => activeProject.value)
const selectedStation = ref(null)
const filter = ref('all')
const areaFilter = ref('all')
const workerFilter = ref('all')

const orders = computed(() =>
  state.orders
    .filter((o) => o.projectId === project.value?.id)
    .sort((a, b) => a.stationOrder - b.stationOrder)
)

const areas = computed(() => {
  const map = new Map()
  for (const d of DISTRICTS) map.set(d, { name: d, orders: [], workers: [], done: 0, pending: 0, locked: 0 })
  for (const o of orders.value) {
    const row = map.get(o.area) || map.set(o.area, { name: o.area, orders: [], workers: [], done: 0, pending: 0, locked: 0 }).get(o.area)
    row.orders.push(o)
    if (o.status === 'passed') row.done++
    if (o.status === 'pending') row.pending++
    if (o.status === 'locked') row.locked++
  }
  for (const w of state.workers) {
    const row = map.get(w.area)
    if (row) row.workers.push(w)
  }
  return [...map.values()].filter((a) => a.orders.length || a.workers.length)
})

const pendingOrders = computed(() => orders.value.filter((o) => o.status === 'pending'))
const unassignedInArea = computed(() => (area) => orders.value.filter((o) => o.area === area && !o.workerId).length)

const filtered = computed(() => {
  let list = orders.value
  if (filter.value !== 'all') {
    if (filter.value === 'pending') list = list.filter((o) => !o.workerId)
    else if (filter.value === 'active') list = list.filter((o) => ['assigned', 'rejected', 'submitted'].includes(o.status))
    else if (filter.value === 'locked') list = list.filter((o) => o.status === 'locked')
    else if (filter.value === 'done') list = list.filter((o) => o.status === 'passed')
  }
  if (areaFilter.value !== 'all') list = list.filter((o) => o.area === areaFilter.value)
  if (workerFilter.value !== 'all') list = list.filter((o) => o.workerId === workerFilter.value)
  return list
})

const workersWithLoad = computed(() =>
  state.workers.map((w) => {
    const mine = orders.value.filter((o) => o.workerId === w.id)
    const load = mine.filter((o) => ['assigned', 'rejected', 'submitted'].includes(o.status)).length
    return { ...w, mine, load, done: mine.filter((o) => o.status === 'passed').length, locked: mine.filter((o) => o.status === 'locked').length }
  })
)

const spacing = computed(() => spacingStatus(project.value?.stops || []))

function assign(o, workerId) {
  const r = assignOrder(o.id, workerId)
  if (!r.ok) toast(r.msg, 'bad')
  else toast(`${o.id} 已分派给 ${workerById(workerId)?.name}`, 'good')
}

function auto() {
  const n = autoDispatch(project.value.id)
  toast(n ? `按片区均衡分派，更新 ${n} 张工单` : '所有工单均已分派', n ? 'good' : 'info')
}

function dispatchAllIn(area) {
  const list = orders.value.filter((o) => o.area === area && !o.workerId)
  if (!list.length) return toast('该片区无待分派工单', 'info')
  const pool = state.workers.filter((w) => w.area === area)
  if (!pool.length) return toast(`${area} 暂无在册施工员，请先在人员台账补充`, 'bad')
  list.forEach((o, i) => {
    const load = (wid) => orders.value.filter((x) => x.workerId === wid && ['assigned', 'rejected', 'submitted'].includes(x.status)).length
    const w = [...pool].sort((a, b) => load(a.id) - load(b.id))[0]
    assignOrder(o.id, w.id)
  })
  toast(`${area}：${list.length} 张工单已按负载均衡分派`, 'good')
}

const selected = computed(() => orders.value.find((o) => o.id === selectedStation.value) || null)
const selectedWorker = computed(() => (selected.value?.workerId ? workerById(selected.value.workerId) : null))
const selectedSub = computed(() => selected.value?.submissions?.[selected.value.submissions.length - 1] || null)

const ledger = () => {
  exportOrderLedger(project.value.id)
  toast('工单台账已导出为 CSV', 'good')
}

const areaStat = computed(() => {
  const out = {}
  for (const a of areas.value) {
    const total = a.orders.length
    const assigned = a.orders.filter((o) => o.workerId).length
    out[a.name] = { total, assigned, unassigned: total - assigned, ...a }
  }
  return out
})
</script>

<template>
  <div class="page page-wide" v-if="project">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 04 · 片区派工</div>
        <h1 class="page-title">工单片区派工<small>DISPATCH BOARD</small></h1>
        <p class="page-desc">
          按沿线所属片区把站点工单分给对应施工员。每张工单只有一个责任人，
          施工员端只会看到分派给自己的待办。
        </p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" @click="ledger">导出工单台账</button>
      <button class="btn btn-primary btn-sm" @click="auto">按片区自动派工</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <section class="panel metric">
        <div class="metric-label">工单总数</div>
        <div class="metric-value">{{ orders.length }}<span class="unit">张</span></div>
        <div class="metric-delta">{{ pendingOrders.length }} 张待分派</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">已分派</div>
        <div class="metric-value">{{ orders.filter(o => o.workerId).length }}<span class="unit">张</span></div>
        <div class="metric-delta up">{{ ((orders.filter(o => o.workerId).length / Math.max(1, orders.length)) * 100).toFixed(0) }}% 覆盖</div>
        <div class="bar-track" style="margin-top:8px">
          <div class="bar-fill" :style="{ width: (orders.filter(o => o.workerId).length / Math.max(1, orders.length)) * 100 + '%' }"></div>
        </div>
      </section>
      <section class="panel metric">
        <div class="metric-label">在册施工员</div>
        <div class="metric-value">{{ state.workers.length }}<span class="unit">人</span></div>
        <div class="metric-delta">{{ areas.length }} 个片区</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">站距待调整</div>
        <div class="metric-value" :style="{ color: spacing.eval.bad.length ? 'var(--red)' : 'var(--mint)' }">
          {{ spacing.eval.bad.length }}<span class="unit">段</span>
        </div>
        <div class="metric-delta" :class="spacing.eval.bad.length ? 'down' : 'up'">
          {{ spacing.eval.bad.length ? '派工前建议先完成站位修正' : '站距已合规' }}
        </div>
      </section>
    </div>

    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head">
        <span class="panel-title"><span class="idx">A</span>片区负载</span>
        <span class="spacer"></span>
        <span class="tag idle mono">按片区过滤 · 每片区责任到人</span>
      </div>
      <div class="panel-body grid" style="grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:10px">
        <div
          v-for="a in areas" :key="a.name"
          class="panel"
          style="padding:11px 12px;background:rgba(5,14,20,0.4);cursor:pointer"
          :style="{ borderColor: areaFilter === a.name ? 'rgba(232,168,60,0.6)' : 'var(--line)' }"
          @click="areaFilter = areaFilter === a.name ? 'all' : a.name"
        >
          <div class="row">
            <span style="font-weight:700;font-size:12.5px">{{ a.name }}</span>
            <span class="spacer tag" :class="areaStat[a.name]?.unassigned ? 'warn' : 'good'">
              {{ areaStat[a.name]?.unassigned || 0 }} 待分
            </span>
          </div>
          <div class="row" style="gap:14px;margin-top:7px;font-size:10.5px;color:var(--text-faint)">
            <span>工单 <b class="mono" style="color:var(--text)">{{ a.orders.length }}</b></span>
            <span>完成 <b class="mono" style="color:var(--mint)">{{ a.done }}</b></span>
            <span>锁单 <b class="mono" style="color:var(--violet)">{{ a.locked }}</b></span>
          </div>
          <div class="bar-track" style="margin-top:8px">
            <div class="bar-fill" :style="{ width: (a.done / Math.max(1, a.orders.length)) * 100 + '%' }"></div>
          </div>
          <div class="row row-wrap" style="margin-top:9px;gap:4px">
            <span v-for="w in a.workers" :key="w.id" class="tag idle" style="font-size:9.5px">
              {{ w.name }} · {{ workersWithLoad.find(x => x.id === w.id)?.load || 0 }} 在办
            </span>
            <span v-if="!a.workers.length" class="hint">未配置施工员</span>
          </div>
          <button class="btn btn-ghost btn-xs" style="margin-top:9px" @click.stop="dispatchAllIn(a.name)">
            整片区均衡派工
          </button>
        </div>
      </div>
    </section>

    <div class="grid" style="grid-template-columns: minmax(0, 1fr) 330px; align-items: start">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title"><span class="idx">B</span>工单池</span>
          <span class="spacer"></span>
          <div class="seg">
            <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部 {{ orders.length }}</button>
            <button :class="{ on: filter === 'pending' }" @click="filter = 'pending'">待分派 {{ pendingOrders.length }}</button>
            <button :class="{ on: filter === 'active' }" @click="filter = 'active'">在办</button>
            <button :class="{ on: filter === 'locked' }" @click="filter = 'locked'">锁单</button>
          </div>
        </div>
        <div class="row row-wrap" style="padding:9px 15px;border-bottom:1px solid var(--line);gap:8px">
          <select v-model="areaFilter" class="select" style="width:150px">
            <option value="all">全部片区</option>
            <option v-for="d in DISTRICTS" :key="d" :value="d">{{ d }}</option>
          </select>
          <select v-model="workerFilter" class="select" style="width:160px">
            <option value="all">全部施工员</option>
            <option v-for="w in state.workers" :key="w.id" :value="w.id">{{ w.name }}</option>
          </select>
          <span class="spacer hint mono">筛出 {{ filtered.length }} 张</span>
        </div>
        <div class="table-wrap" style="max-height:560px">
          <table class="data">
            <thead>
              <tr>
                <th style="width:64px">站序</th>
                <th>站点 / 工单</th>
                <th>片区</th>
                <th>施工员</th>
                <th>状态</th>
                <th>返工</th>
                <th style="width:130px">分派</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in filtered" :key="o.id"
                :class="{ sel: selectedStation === o.id, bad: o.status === 'locked' }"
                @click="selectedStation = o.id"
                style="cursor:pointer"
              >
                <td class="mono" style="color:var(--text-faint)">{{ String(o.stationOrder).padStart(2, '0') }}</td>
                <td>
                  <div style="font-weight:600">{{ o.stationName }}</div>
                  <div class="hint mono" style="font-size:9.5px">{{ o.id }}<span v-if="o.transfer"> · 换乘 {{ o.transferCode }}</span></div>
                </td>
                <td style="font-size:11px">{{ o.area }}</td>
                <td>
                  <span v-if="o.workerId" class="tag idle">{{ workerById(o.workerId)?.name }}</span>
                  <span v-else class="tag warn">未分派</span>
                </td>
                <td><span class="tag" :class="orderStatus(o.status).tone">{{ orderStatus(o.status).label }}</span></td>
                <td>
                  <span class="mono" :style="{ color: o.reworkCount >= 3 ? 'var(--red)' : o.reworkCount ? 'var(--amber)' : 'var(--text-faint)' }">
                    {{ o.reworkCount }}×
                  </span>
                </td>
                <td>
                  <select
                    class="select"
                    style="padding:4px 8px;font-size:10.5px"
                    :value="o.workerId || ''"
                    :disabled="o.status === 'passed' || o.status === 'locked'"
                    @click.stop
                    @change="assign(o, $event.target.value)"
                  >
                    <option value="" disabled>选择施工员…</option>
                    <option v-for="w in state.workers.filter(x => x.area === o.area)" :key="w.id" :value="w.id">{{ w.name }}</option>
                    <option v-for="w in state.workers.filter(x => x.area !== o.area)" :key="w.id" :value="w.id">{{ w.name }}（跨片）</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="!filtered.length" class="empty">当前筛选条件下没有工单</div>
        </div>
      </section>

      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">工单详情</span>
            <span class="spacer"></span>
            <span v-if="selected" class="tag" :class="orderStatus(selected.status).tone">{{ orderStatus(selected.status).label }}</span>
          </div>
          <div class="panel-body" v-if="selected">
            <div class="row">
              <span class="pill-num">{{ selected.stationOrder }}</span>
              <span style="font-weight:700">{{ selected.stationName }}</span>
              <span class="spacer tag idle mono">{{ selected.id }}</span>
            </div>
            <div class="divider"></div>
            <div class="kv" style="grid-template-columns:78px 1fr">
              <dt>所属片区</dt><dd>{{ selected.area }}</dd>
              <dt>施工员</dt><dd>{{ selectedWorker ? `${selectedWorker.name} · ${selectedWorker.phone}` : '未分派' }}</dd>
              <dt>换乘</dt><dd>{{ selected.transfer ? selected.transferCode : '非换乘站' }}</dd>
              <dt>站亭配置</dt><dd style="font-size:11px">{{ selected.plan.shelter }}</dd>
              <dt>设计尺寸</dt><dd class="num">{{ selected.plan.lengthMm }}×{{ selected.plan.widthMm }}×{{ selected.plan.heightMm }} mm</dd>
              <dt>朝向</dt><dd>{{ selected.plan.orientation }}向车行道</dd>
              <dt>返工累计</dt><dd :style="{ color: selected.reworkCount >= 3 ? 'var(--red)' : 'inherit' }">{{ selected.reworkCount }} 次</dd>
            </div>

            <div v-if="selected.locked" class="banner violet" style="margin-top:10px;font-size:11px">
              <span>🔒</span>
              <span>{{ selected.locked.reason }}<br />请主管在“质量抽检”页确认解锁。</span>
            </div>
            <div v-if="selected.qc && selected.qc.verdict === 'reject'" class="banner bad" style="margin-top:10px;font-size:11px">
              <span>▲</span>
              <span>{{ selected.qc.reasons.join('；') }}</span>
            </div>

            <div v-if="selectedSub" class="divider"></div>
            <div v-if="selectedSub" class="kv" style="grid-template-columns:78px 1fr">
              <dt>实收尺寸</dt>
              <dd class="num" :style="{ color: selected.qc && !selected.qc.dimensionOk ? 'var(--red)' : 'inherit' }">
                {{ selectedSub.dims.lengthMm }}×{{ selectedSub.dims.widthMm }}×{{ selectedSub.dims.heightMm }}
              </dd>
              <dt>照片</dt><dd>{{ selectedSub.photos.length }} 张</dd>
              <dt>提交时间</dt><dd class="mono" style="font-size:10px">{{ new Date(selectedSub.at).toLocaleString('zh-CN') }}</dd>
            </div>
            <div class="divider"></div>
            <div class="hint">站台落位：{{ selected.placement ? (selected.placement.side > 0 ? '路线左侧' : '路线右侧') + ' · 退距 ' + Math.abs(selected.placement.lateral).toFixed(0) + 'm' : '—' }}</div>
          </div>
          <div v-else class="empty">点击表格中的工单查看详情</div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">施工员负载</span></div>
          <div class="panel-body" style="max-height:300px;overflow:auto">
            <div v-for="w in workersWithLoad" :key="w.id" style="padding:6px 0;border-bottom:1px solid rgba(126,176,196,0.07)">
              <div class="row" style="gap:7px">
                <span class="avatar" style="width:20px;height:20px;font-size:10px">{{ w.name.slice(0, 1) }}</span>
                <span style="font-size:11.5px">{{ w.name }}</span>
                <span class="tag idle" style="font-size:9px">{{ w.area }}</span>
                <span class="spacer mono" style="font-size:10px;color:var(--text-faint)">
                  在办 {{ w.load }} · 完成 {{ w.done }}
                </span>
              </div>
              <div class="bar-track" style="margin-top:4px">
                <div class="bar-fill amber" :style="{ width: Math.min(100, w.load * 14) + '%' }"></div>
              </div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
