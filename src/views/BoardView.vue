<script setup>
import { computed, inject, ref } from 'vue'
import {
  state, activeProject, metrics, workerById, orderStatus, exportLineList, exportOrderLedger,
  spacingStatus
} from '../store'
import { SPACING_MAX } from '../core/stations.js'

const toast = inject('toast')
const project = computed(() => activeProject.value)
const tab = ref('metrics')

const m = computed(() => metrics.value)

const orders = computed(() =>
  state.orders.filter((o) => o.projectId === project.value?.id).sort((a, b) => a.stationOrder - b.stationOrder)
)

const spacing = computed(() => spacingStatus(project.value?.stops || []))

const perWorker = computed(() =>
  m.value.perWorker
    .filter((w) => orders.value.some((o) => o.workerId === w.id))
    .map((w) => ({ ...w }))
    .sort((a, b) => b.done - a.done)
)

const maxDone = computed(() => Math.max(1, ...perWorker.value.map((w) => w.done)))

const statusDist = computed(() => {
  const buckets = { pending: 0, assigned: 0, submitted: 0, rejected: 0, passed: 0, locked: 0 }
  for (const o of orders.value) buckets[o.status] = (buckets[o.status] || 0) + 1
  return Object.entries(buckets).map(([k, v]) => ({
    key: k,
    value: v,
    label: orderStatus(k).label,
    tone: orderStatus(k).tone,
    color: { pending: '#5d7583', assigned: '#6fc6d8', submitted: '#e8a83c', rejected: '#e2584f', passed: '#7fd0a9', locked: '#a892d8' }[k]
  }))
})

const worstWorkers = computed(() =>
  [...perWorker.value].sort((a, b) => b.reworkRate - a.reworkRate).slice(0, 3)
)

/* ---- 线路总览图：按里程展开的线性地铁图 + 真实走向投影 ---- */
const mapW = 1180
const mapH = 520

const mapGeometry = computed(() => {
  if (!project.value) return null
  const stops = project.value.stops
  const district = project.value.district
  const total = Math.max(1, district.total)

  // ---- A. 展平剖面（主图）：x = 里程比例，y 固定，站名交替上下避免重叠 ----
  const padL = 78
  const padR = 48
  const lineY = 210
  const usableW = mapW - padL - padR
  const flatPts = stops.map((s) => ({ ...s, x: padL + (s.dist / total) * usableW, y: lineY }))

  // 站名/里程标签的落位：上下交替；若相邻同侧标签的水平间距不够就强制换边，避免重叠。
  const nameHalfWidth = (name) => Math.min(46, Math.max(26, name.length * 6.2))
  const labels = flatPts.map((s, i) => {
    const above = i % 2 === 0
    return {
      above,
      nameY: lineY + (above ? -32 : 42),
      metaY: lineY + (above ? -20 : 54),
      stemFrom: lineY + (above ? -10 : 10),
      stemTo: lineY + (above ? -17 : 17)
    }
  })
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].above !== labels[i - 1].above) continue
    const need = nameHalfWidth(flatPts[i].name) + nameHalfWidth(flatPts[i - 1].name) + 8
    if (flatPts[i].x - flatPts[i - 1].x < need) {
      const above = !labels[i].above
      labels[i] = {
        above,
        nameY: lineY + (above ? -32 : 42),
        metaY: lineY + (above ? -20 : 54),
        stemFrom: lineY + (above ? -10 : 10),
        stemTo: lineY + (above ? -17 : 17)
      }
    }
  }

  // 换乘支线：始终向“站名标签的另一侧”引出，避免穿过站名与里程文字；
  // 端点再按序号左右错开，减少相邻支线互压。
  const branches = flatPts
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.transfer)
    .map(({ s, i }, k) => {
      const up = !labels[i].above
      const ex = s.x + (k % 2 === 0 ? 46 : 30)
      const ey = up ? s.y - 112 : s.y + 100
      return { from: s, ex, ey, code: s.transferCode, up }
    })

  // ---- B. 真实走向缩略图（右上小窗） ----
  const linePts = district.line.filter((_, i) => i % 5 === 0)
  const bb = linePts.reduce((acc, p) => ({
    minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
    minZ: Math.min(acc.minZ, p.z), maxZ: Math.max(acc.maxZ, p.z)
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
  const inset = { x: 78, y: 348, w: 330, h: 118 }
  const insX = (x) => inset.x + 18 + ((x - bb.minX) / Math.max(1, bb.maxX - bb.minX)) * (inset.w - 36)
  const insY = (z) => inset.y + 30 + ((z - bb.minZ) / Math.max(1, bb.maxZ - bb.minZ)) * (inset.h - 60)
  const insetPath = linePts.map((p) => `${insX(p.x).toFixed(1)},${insY(p.z).toFixed(1)}`).join(' ')
  const insetBuildings = district.buildings.filter((_, i) => i % 6 === 0)
  const insetStops = flatPts.map((s) => {
    const i = Math.min(district.line.length - 1, Math.round((s.dist / total) * (district.line.length - 1)))
    const p = district.line[i]
    return { ...s, ix: insX(p.x), iy: insY(p.z) }
  })

  return { flatPts, labels, branches, total, lineY, usableW, padL, bbox: bb, inset, insetPath, insetBuildings, insetStops, insX, insY }
})

const orderOf = (stationId) => orders.value.find((o) => o.stationId === stationId)

const STATUS_COLOR = {
  pending: '#5d7583',
  assigned: '#6fc6d8',
  submitted: '#e8a83c',
  rejected: '#e2584f',
  passed: '#7fd0a9',
  locked: '#a892d8'
}
function statusColor(order) {
  return order ? STATUS_COLOR[order.status] || '#5d7583' : '#5d7583'
}

const legend = [
  { label: '待分派', color: '#5d7583' },
  { label: '待施工', color: '#6fc6d8' },
  { label: '待质检', color: '#e8a83c' },
  { label: '返工中', color: '#e2584f' },
  { label: '验收通过', color: '#7fd0a9' },
  { label: '锁单待主管', color: '#a892d8' }
]

const bandLevel = computed(() => {
  const gaps = spacing.value.gaps
  return gaps.map((g) => g.level)
})

const areaCompletion = computed(() => {
  const map = {}
  for (const o of orders.value) {
    if (!map[o.area]) map[o.area] = { total: 0, done: 0, rework: 0 }
    map[o.area].total++
    if (o.status === 'passed') map[o.area].done++
    map[o.area].rework += o.reworkCount
  }
  return Object.entries(map).map(([name, v]) => ({ name, ...v, rate: v.done / Math.max(1, v.total) }))
})

function downloadCsv(kind) {
  if (kind === 'line') {
    exportLineList(project.value.id)
    toast('线路清单已导出（CSV，含站距校验）', 'good')
  } else {
    exportOrderLedger(project.value.id)
    toast('工单台账已导出（CSV，含质检原因）', 'good')
  }
}

const logLines = computed(() => state.log.slice(0, 8))
</script>

<template>
  <div class="page page-wide" v-if="project">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 07 · 复盘监管</div>
        <h1 class="page-title">主管看板与线路总览<small>SUPERVISOR BOARD</small></h1>
        <p class="page-desc">
          按人统计完成量与返工率，并以一张总览图展示站序、换乘关系与每张工单的状态。
        </p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" @click="downloadCsv('line')">导出线路清单</button>
      <button class="btn btn-primary btn-sm" @click="downloadCsv('orders')">导出工单台账</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <section class="panel metric">
        <div class="metric-label">工单总量</div>
        <div class="metric-value">{{ m.total }}<span class="unit">张</span></div>
        <div class="metric-delta">{{ project.lineCode }} · {{ project.stops.length }} 站</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">完成量</div>
        <div class="metric-value" style="color:var(--mint)">{{ m.done }}<span class="unit">张</span></div>
        <div class="metric-delta up">{{ (m.completion * 100).toFixed(0) }}% 完成率</div>
        <div class="bar-track" style="margin-top:8px"><div class="bar-fill" :style="{ width: m.completion * 100 + '%' }"></div></div>
      </section>
      <section class="panel metric">
        <div class="metric-label">返工率</div>
        <div class="metric-value" :style="{ color: m.reworkRate > 0.25 ? 'var(--red)' : 'var(--amber)' }">
          {{ (m.reworkRate * 100).toFixed(0) }}<span class="unit">%</span>
        </div>
        <div class="metric-delta">累计 {{ m.reworks }} 次返工</div>
        <div class="bar-track" style="margin-top:8px"><div class="bar-fill red" :style="{ width: Math.min(100, m.reworkRate * 100) + '%' }"></div></div>
      </section>
      <section class="panel metric">
        <div class="metric-label">锁单待确认</div>
        <div class="metric-value" style="color:var(--violet)">{{ m.locked }}<span class="unit">张</span></div>
        <div class="metric-delta">{{ m.submitted }} 张待质检</div>
      </section>
    </div>

    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head">
        <span class="panel-title"><span class="idx">A</span>线路总览图 · 站序 / 换乘 / 工单状态</span>
        <span class="spacer"></span>
        <span class="tag idle mono">{{ project.lineCode }} · {{ project.stops.length }} STOPS · {{ project.district.total.toFixed(0) }}m</span>
        <span class="tag mono" :class="spacing.eval.ok ? 'good' : 'bad'">
          站距 {{ spacing.eval.ok ? '合规' : spacing.eval.bad.length + ' 段超标' }}
        </span>
      </div>
      <div class="panel-body" style="padding:10px 6px 6px">
        <svg
          :viewBox="`0 0 ${mapW} ${mapH}`"
          style="width:100%;display:block"
          preserveAspectRatio="xMidYMid meet"
          v-if="mapGeometry"
        >
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#5d94a3" stop-opacity="0.85" />
              <stop offset="1" stop-color="#8cb8a8" stop-opacity="0.85" />
            </linearGradient>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="3.4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <!-- 顶部信息 -->
          <text x="66" y="30" font-size="10" fill="#5d7583" font-family="monospace" letter-spacing="1.6">STATION SEQUENCE</text>
          <text x="66" y="46" font-size="9" fill="#445d6b" font-family="monospace">x 轴 = 沿线里程（m）</text>

          <!-- 顶部里程标尺（不贯穿图面，避免与站名打架） -->
          <g>
            <line
              :x1="mapGeometry.padL" :y1="64"
              :x2="mapGeometry.padL + mapGeometry.usableW" :y2="64"
              stroke="rgba(126,176,196,0.28)" stroke-width="1"
            />
            <g v-for="t in 6" :key="'tk' + t">
              <line
                :x1="mapGeometry.padL + ((t - 1) / 5) * mapGeometry.usableW" :y1="59"
                :x2="mapGeometry.padL + ((t - 1) / 5) * mapGeometry.usableW" :y2="69"
                stroke="rgba(126,176,196,0.34)"
              />
              <text
                :x="mapGeometry.padL + ((t - 1) / 5) * mapGeometry.usableW"
                :y="56"
                text-anchor="middle" font-size="8.5" fill="#4b6573" font-family="monospace"
              >{{ Math.round(((t - 1) / 5) * mapGeometry.total) }}</text>
            </g>
          </g>

          <!-- 主线 -->
          <line
            :x1="mapGeometry.padL - 16" :y1="mapGeometry.lineY"
            :x2="mapGeometry.padL + mapGeometry.usableW + 16" :y2="mapGeometry.lineY"
            stroke="url(#lineGrad)" stroke-width="7" stroke-linecap="round"
          />
          <line
            :x1="mapGeometry.padL - 16" :y1="mapGeometry.lineY"
            :x2="mapGeometry.padL + mapGeometry.usableW + 16" :y2="mapGeometry.lineY"
            stroke="rgba(200,230,235,0.16)" stroke-width="1" stroke-dasharray="1 7"
          />

          <!-- 超标段高亮（覆盖在主线之上） -->
          <line
            v-for="(g, i) in spacing.gaps" :key="'seg' + i"
            v-show="g.level === 'bad'"
            :x1="mapGeometry.flatPts[i].x" :y1="mapGeometry.lineY"
            :x2="mapGeometry.flatPts[i + 1].x" :y2="mapGeometry.lineY"
            stroke="#e2584f" stroke-width="7" stroke-linecap="round" opacity="0.55"
          />

          <!-- 换乘支线 -->
          <g v-for="(br, i) in mapGeometry.branches" :key="'br' + i">
            <path
              :d="`M ${br.from.x} ${mapGeometry.lineY} C ${br.from.x} ${mapGeometry.lineY + (br.up ? -34 : 34)}, ${br.ex - 10} ${br.ey + (br.up ? 26 : -26)}, ${br.ex} ${br.ey}`"
              fill="none" stroke="rgba(168,146,216,0.62)" stroke-width="2.2" stroke-dasharray="5 3"
            />
            <circle :cx="br.ex" :cy="br.ey" r="4.6" fill="#a892d8" fill-opacity="0.3" stroke="#c9b6f2" stroke-width="1.3" />
            <text
              :x="br.ex + (br.up ? 9 : 9)" :y="br.ey + 3.5"
              font-size="9.5" fill="#c9b6f2" font-family="monospace"
            >{{ br.code }}</text>
            <text
              :x="br.ex + 9" :y="br.ey + 14.5"
              font-size="8" fill="rgba(201,182,242,0.55)" font-family="monospace"
            >接驳</text>
          </g>

          <!-- 站点：站名上下交替，按相邻间距自动换边避免重叠 -->
          <g v-for="(s, i) in mapGeometry.flatPts" :key="s.id">
            <circle
              :cx="s.x" :cy="mapGeometry.lineY"
              :r="s.transfer ? 7.2 : 5.4"
              :fill="statusColor(orderOf(s.id))"
              :stroke="s.transfer ? '#c9b6f2' : 'rgba(8,20,28,0.9)'"
              :stroke-width="s.transfer ? 2.2 : 1.6"
              filter="url(#glow)"
            />
            <line
              :x1="s.x" :y1="mapGeometry.labels[i].stemFrom"
              :x2="s.x" :y2="mapGeometry.labels[i].stemTo"
              stroke="rgba(126,176,196,0.26)" stroke-width="1"
            />
            <text
              :x="s.x" :y="mapGeometry.labels[i].nameY"
              text-anchor="middle" font-size="10.5" fill="#dce9ef"
            >
              <tspan font-family="monospace" font-size="9" :fill="s.transfer ? '#c9b6f2' : '#5d7583'">{{ String(s.order).padStart(2, '0') }}</tspan>
              <tspan dx="4">{{ s.name }}</tspan>
            </text>
            <text
              :x="s.x" :y="mapGeometry.labels[i].metaY"
              text-anchor="middle" font-size="8.5" fill="#5d7583" font-family="monospace"
            >{{ s.dist.toFixed(0) }}m · {{ orderOf(s.id)?.reworkCount ? '返工' + orderOf(s.id).reworkCount + '次' : (orderOf(s.id) ? orderOf(s.id).id.replace('WO-' + project.lineId + '-', '#') : '无工单') }}</text>
          </g>

          <!-- 站距标注 -->
          <g v-for="(g, i) in spacing.gaps" :key="'gl' + i">
            <text
              :x="(mapGeometry.flatPts[i].x + mapGeometry.flatPts[i + 1].x) / 2"
              :y="mapGeometry.lineY + 20"
              text-anchor="middle" font-size="8.5" font-family="monospace"
              :fill="g.level === 'bad' ? '#f2a49e' : 'rgba(120,155,170,0.7)'"
            >{{ g.m.toFixed(0) }}{{ g.level === 'bad' ? ' ⚠' : '' }}</text>
          </g>

          <!-- 真实走向缩略图 -->
          <g>
            <rect
              :x="mapGeometry.inset.x" :y="mapGeometry.inset.y"
              :width="mapGeometry.inset.w" :height="mapGeometry.inset.h"
              rx="7" fill="rgba(6,16,22,0.72)" stroke="rgba(126,176,196,0.22)"
            />
            <text :x="mapGeometry.inset.x + 12" :y="mapGeometry.inset.y + 15" font-size="8.5" fill="#5d7583" font-family="monospace" letter-spacing="1.2">沿线走向 · 缩略</text>
            <circle
              v-for="(b, i) in mapGeometry.insetBuildings" :key="'ib' + i"
              :cx="mapGeometry.insX(b.position.x)" :cy="mapGeometry.insY(b.position.z)"
              r="1.5" :fill="b.side > 0 ? '#456b7a' : '#6b5c44'" opacity="0.8"
            />
            <polyline :points="mapGeometry.insetPath" fill="none" stroke="rgba(140,184,168,0.85)" stroke-width="2" stroke-linecap="round" />
            <circle
              v-for="s in mapGeometry.insetStops" :key="'is' + s.id"
              :cx="s.ix" :cy="s.iy" r="2.2" :fill="statusColor(orderOf(s.id))"
            />
          </g>

          <!-- 底部图例 -->
          <g :transform="`translate(78, ${mapH - 26})`">
            <text font-size="9" fill="#4f6b79" font-family="monospace" letter-spacing="1.4">工单状态</text>
            <g v-for="(l, i) in legend" :key="l.label" :transform="`translate(${72 + i * 86}, 0)`">
              <circle cx="0" cy="-3.5" r="4.2" :fill="l.color" />
              <text x="10" y="0" font-size="9" fill="#7b93a0">{{ l.label }}</text>
            </g>
            <g :transform="`translate(${72 + legend.length * 86 + 18}, 0)`">
              <line x1="0" y1="-3.5" x2="16" y2="-3.5" stroke="rgba(168,146,216,0.7)" stroke-width="2" stroke-dasharray="4 3" />
              <text x="22" y="0" font-size="9" fill="#a995cc">换乘接驳</text>
            </g>
            <g :transform="`translate(${72 + legend.length * 86 + 110}, 0)`">
              <line x1="0" y1="-3.5" x2="16" y2="-3.5" stroke="#e2584f" stroke-width="4" stroke-linecap="round" />
              <text x="22" y="0" font-size="9" fill="#f2a49e">站距超标段</text>
            </g>
          </g>
        </svg>
      </div>
      <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0">
        <span class="hint">图例颜色 = 工单当前状态；红色站距标注为超出 300–800m 区间</span>
        <span class="spacer"></span>
        <span class="tag good">{{ m.done }} 通过</span>
        <span class="tag bad">{{ m.rejected }} 返工中</span>
        <span class="tag locked">{{ m.locked }} 锁单</span>
      </div>
    </section>

    <div class="grid" style="grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); align-items: start">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title"><span class="idx">B</span>按人统计 · 完成量与返工率</span>
          <span class="spacer"></span>
          <span class="tag idle mono">{{ perWorker.length }} 人</span>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>施工员</th>
                <th>片区</th>
                <th>工单</th>
                <th style="width:150px">完成量</th>
                <th>在办</th>
                <th>返工次数</th>
                <th style="width:120px">返工率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in perWorker" :key="w.id">
                <td>
                  <div class="row" style="gap:7px">
                    <span class="avatar" style="width:22px;height:22px;font-size:10px">{{ w.name.slice(0, 1) }}</span>
                    <span style="font-weight:600">{{ w.name }}</span>
                  </div>
                </td>
                <td style="font-size:11px;color:var(--text-dim)">{{ w.area }}</td>
                <td class="num">{{ w.total }}</td>
                <td>
                  <div class="row" style="gap:6px">
                    <div class="bar-track" style="flex:1"><div class="bar-fill" :style="{ width: (w.done / maxDone) * 100 + '%' }"></div></div>
                    <span class="mono" style="font-size:10.5px;width:16px">{{ w.done }}</span>
                  </div>
                </td>
                <td class="num" style="color:var(--amber)">{{ w.active }}</td>
                <td class="num">{{ w.reworks }}</td>
                <td>
                  <span class="tag mono" :class="w.reworkRate > 0.3 ? 'bad' : w.reworkRate > 0.15 ? 'warn' : 'good'">
                    {{ (w.reworkRate * 100).toFixed(0) }}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel-body" style="border-top:1px solid var(--line);display:flex;gap:16px;font-size:11px;color:var(--text-dim)">
          <span>完成率 {{ (m.completion * 100).toFixed(1) }}%</span>
          <span>整体返工率 {{ (m.reworkRate * 100).toFixed(1) }}%</span>
          <span>待分派 {{ m.pending }}</span>
          <span class="spacer"></span>
          <span class="hint">返工率 = 返工次数 / (已通过 + 返工次数)</span>
        </div>
      </section>

      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head"><span class="panel-title">工单状态构成</span></div>
          <div class="panel-body">
            <div v-for="s in statusDist" :key="s.key" class="row" style="gap:8px;margin-bottom:5px">
              <span class="swatch" :style="{ background: s.color }"></span>
              <span style="font-size:11px;width:64px;color:var(--text-dim)">{{ s.label }}</span>
              <div class="bar-track" style="flex:1"><div class="bar-fill" :style="{ width: (s.value / Math.max(1, orders.length)) * 100 + '%', background: s.color }"></div></div>
              <span class="mono" style="font-size:10.5px;width:22px;text-align:right">{{ s.value }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">返工率最高的施工员</span></div>
          <div class="panel-body">
            <div v-for="(w, i) in worstWorkers" :key="w.id" class="row" style="gap:8px;padding:5px 0;border-bottom:1px solid rgba(126,176,196,0.07)">
              <span class="pill-num">{{ i + 1 }}</span>
              <span style="font-size:11.5px">{{ w.name }}</span>
              <span class="tag idle" style="font-size:9px">{{ w.area }}</span>
              <span class="spacer mono" style="font-size:10px;color:var(--text-faint)">{{ w.reworks }} 次</span>
              <span class="tag" :class="w.reworkRate > 0.3 ? 'bad' : 'warn'">{{ (w.reworkRate * 100).toFixed(0) }}%</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">片区完成度</span></div>
          <div class="panel-body">
            <div v-for="a in areaCompletion" :key="a.name" style="margin-bottom:8px">
              <div class="row" style="font-size:11px;margin-bottom:3px">
                <span>{{ a.name }}</span>
                <span class="spacer mono" style="color:var(--text-faint);font-size:10px">{{ a.done }}/{{ a.total }}</span>
              </div>
              <div class="bar-track"><div class="bar-fill amber" :style="{ width: a.rate * 100 + '%' }"></div></div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">操作日志</span></div>
          <div class="panel-body" style="max-height:200px;overflow:auto">
            <div v-for="(l, i) in logLines" :key="i" style="border-bottom:1px solid rgba(126,176,196,0.07);padding:5px 0">
              <div style="font-size:10.5px;color:var(--text-dim)">{{ l.text }}</div>
              <div class="hint mono" style="font-size:9px">{{ l.by }} · {{ new Date(l.at).toLocaleString('zh-CN') }}</div>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
