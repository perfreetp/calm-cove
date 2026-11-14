<script setup>
import { computed, inject, ref } from 'vue'
import {
  activeProject, spacingStatus, SPACING_MIN, SPACING_MAX, spacingLevel,
  chooseCandidate, reproposeStops, setStopCount, setSpacingLimits, insertStopInGap,
  stationGaps, placementBoxes, exportLineList, budgetOf, resolveBuilding, nudgeStop
} from '../store'
import { round } from '../core/rng.js'
import { fingerprint } from '../core/rng.js'

const toast = inject('toast')
const project = computed(() => activeProject.value)
const status = computed(() => spacingStatus(project.value?.stops || []))
const gaps = computed(() => stationGaps(project.value?.stops || []))
const boxes = computed(() => placementBoxes(project.value?.stops || [], project.value?.district))

const selectedId = ref(project.value?.stops[0]?.id || null)
const selected = computed(() => project.value?.stops.find((s) => s.id === selectedId.value) || null)
const selectedIdx = computed(() => project.value?.stops.findIndex((s) => s.id === selectedId.value))

const candidateConflict = computed(() => {
  if (!selected.value || !project.value) return []
  const box = boxes.value[selectedIdx.value]
  const conflicts = []
  for (const b of project.value.district.buildings) {
    const s = resolveBuilding(b)
    const reach = Math.max(s.width, s.depth) / 2 + 5
    const d = Math.hypot(b.position.x - box.x, b.position.z - box.z)
    if (d < reach) conflicts.push({ ...b, dist: d.toFixed(1), reach: reach.toFixed(1) })
  }
  return conflicts.slice(0, 3)
})

const badSegments = computed(() =>
  status.value.gaps.reduce((acc, g, i) => (g.level !== 'ok' ? [...acc, { ...g, index: i }] : acc), [])
)

const overLimit = computed(() => gaps.value.filter((g) => g > SPACING_MAX).length)
const underLimit = computed(() => gaps.value.filter((g) => g > 0 && g < SPACING_MIN).length)
const worstGap = computed(() => (gaps.value.length ? Math.max(...gaps.value) : 0))

const lineLength = computed(() => project.value?.district.total || 0)
const avgGap = computed(() => (gaps.value.length ? gaps.value.reduce((a, b) => a + b, 0) / gaps.value.length : 0))

const corridor = computed(() => {
  if (!project.value) return { stops: [], path: '', W: 860, H: 220 }
  const W = 860
  const H = 220
  const total = Math.max(1, project.value.stops[project.value.stops.length - 1].dist - project.value.stops[0].dist)
  const offsets = project.value.stops.map((s) => ((s.dist - project.value.stops[0].dist) / total) * (W - 70))
  return { stops: offsets, W, H }
})

function segColor(level) {
  return level === 'bad' ? '#e2584f' : level === 'warn' ? '#e8a83c' : '#4d7f8c'
}

function segLabel(i) {
  const g = gaps.value[i]
  return `${g.toFixed(0)}m`
}

function nudge(delta) {
  if (!selected.value) return
  nudgeStop(project.value.id, selected.value.id, delta)
}

function focusGap(index) {
  selectedId.value = project.value.stops[index].id
}

function applyFix() {
  const p = project.value
  const targets = status.value.gaps
    .map((g, i) => ({ ...g, i }))
    .filter((g) => g.m > SPACING_MAX)
    .sort((a, b) => b.m - a.m)
  if (!targets.length) {
    toast('当前没有超标段落', 'info')
    return
  }
  let added = 0
  let shifted = 0
  for (const t of targets) {
    const r = insertStopInGap(p.id, t.i + added)
    if (r.ok) {
      added++
      continue
    }
    // 无法增补时退回到“末站前移”的收敛策略
    const a = p.stops[t.i + added]
    const b = p.stops[t.i + added + 1]
    if (a && b) {
      const target = Math.min(b.dist - SPACING_MIN - 20, a.dist + 700)
      if (target - a.dist > SPACING_MIN + 20) {
        b.dist = round(target, 1)
        shifted++
      }
    }
  }
  toast(
    added || shifted
      ? `已增补 ${added} 个候车站${shifted ? `、前移 ${shifted} 个站` : ''}，请复核站距`
      : '该段无法在不破坏相邻站距的前提下修正，请整体重排',
    added || shifted ? 'good' : 'warn',
    3600
  )
}

function toggleSpacingLimits() {
  const p = project.value
  const v = p.spacingMax === SPACING_MAX ? 1000 : SPACING_MAX
  setSpacingLimits(p.id, p.spacingMin, v)
  toast(v === 1000 ? '已放宽校验上限至 1000m（临时评审模式）' : '校验上限已恢复 800m', 'info')
}

function shiftCount(d) {
  const p = project.value
  setStopCount(p.id, p.stops.length + d)
  toast(`站数调整为 ${p.stops.length}，候选站已重新生成`, 'good')
}

function pick(i) {
  if (!selected.value) return
  chooseCandidate(project.value.id, selected.value.id, i)
  toast(`已选定 ${selected.value.name} 的 C${i + 1} 落位`, 'info')
}

const exportList = () => {
  exportLineList(project.value.id)
  toast('线路清单已导出为 CSV', 'good')
}
</script>

<template>
  <div class="page page-wide" v-if="project">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 03 · 站距编排</div>
        <h1 class="page-title">候选站点编排<small>STATION SPACING</small></h1>
        <p class="page-desc">
          系统按街区体量与客流沿线路自动排出候选站。站距超出 300–800m 区间即刻标红，
          增补候选站或微调站位并通过校验后才允许进入派工。
        </p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" @click="toggleSpacingLimits">
        {{ project.spacingMax === SPACING_MAX ? '临时放宽上限' : '恢复 800m 上限' }}
      </button>
      <button class="btn btn-sm" @click="reproposeStops(project.id)">重新编排</button>
      <button class="btn btn-primary btn-sm" @click="exportList">导出线路清单</button>
    </div>

    <div class="grid grid-4" style="margin-bottom:14px">
      <section class="panel metric">
        <div class="metric-label">候选站数</div>
        <div class="metric-value">{{ project.stops.length }}<span class="unit">站</span></div>
        <div class="metric-delta">线长 {{ lineLength.toFixed(0) }}m</div>
        <div class="bar-track" style="margin-top:8px"><div class="bar-fill" :style="{ width: Math.min(100, project.stops.length / 20 * 100) + '%' }"></div></div>
      </section>
      <section class="panel metric">
        <div class="metric-label">平均站距</div>
        <div class="metric-value">{{ avgGap.toFixed(0) }}<span class="unit">m</span></div>
        <div class="metric-delta">标准 300 – 800m</div>
      </section>
      <section class="panel metric">
        <div class="metric-label">超标段</div>
        <div class="metric-value" :style="{ color: overLimit ? 'var(--red)' : 'var(--mint)' }">{{ overLimit }}<span class="unit">段</span></div>
        <div class="metric-delta" :class="overLimit ? 'down' : 'up'">
          {{ overLimit ? `最长 ${worstGap.toFixed(0)}m` : '全部落位合规' }}
        </div>
      </section>
      <section class="panel metric">
        <div class="metric-label">预算档位</div>
        <div class="metric-value" style="font-size:20px">{{ budgetOf(project).label }}</div>
        <div class="metric-delta">¥{{ budgetOf(project).amount }} 万 · {{ budgetOf(project).capacity }}</div>
      </section>
    </div>

    <section class="panel" style="margin-bottom:14px">
      <div class="panel-head">
        <span class="panel-title"><span class="idx">A</span>里程剖面 · 站距校验</span>
        <span class="spacer"></span>
        <span class="tag" :class="status.eval.ok ? 'good' : 'bad'">
          {{ status.eval.ok ? '校验通过' : `${overLimit + underLimit} 段待调整` }}
        </span>
        <span class="tag idle mono">RULER 1:{{ Math.round(lineLength / 860) }} m/px</span>
      </div>
      <div class="panel-body" style="padding: 8px 10px 4px">
        <svg viewBox="0 0 860 236" preserveAspectRatio="xMidYMid meet" style="width:100%;display:block">
          <line x1="35" y1="112" x2="830" y2="112" stroke="rgba(126,176,196,0.22)" stroke-width="1" />
          <line
            v-for="(g, i) in status.gaps" :key="'s' + i"
            :x1="35 + corridor.stops[i]"
            :y1="112"
            :x2="35 + corridor.stops[i + 1]"
            :y2="112"
            :stroke="segColor(g.level)"
            :stroke-width="g.level === 'bad' ? 6 : g.level === 'warn' ? 5 : 3"
            stroke-linecap="round"
          />
          <g v-for="(g, i) in status.gaps" :key="'l' + i">
            <text
              :x="35 + (corridor.stops[i] + corridor.stops[i + 1]) / 2"
              y="100" text-anchor="middle" font-size="9"
              :fill="g.level === 'bad' ? '#f2a49e' : g.level === 'warn' ? '#f0c473' : '#5d7583'"
              font-family="monospace"
            >{{ g.m.toFixed(0) }}</text>
          </g>
          <g v-for="(s, i) in status.rows" :key="s.id" @click="selectedId = s.id" style="cursor:pointer">
            <line :x1="35 + corridor.stops[i]" y1="100" :x2="35 + corridor.stops[i]" y2="126" stroke="rgba(126,176,196,0.32)" />
            <circle
              :cx="35 + corridor.stops[i]" :cy="112" r="6.5"
              :fill="s.level === 'bad' ? '#e2584f' : s.transfer ? '#62b0c8' : '#8fd0b6'"
              :stroke="selectedId === s.id ? '#e8a83c' : 'rgba(0,0,0,0.4)'"
              :stroke-width="selectedId === s.id ? 2.4 : 1"
            />
            <text
              :x="35 + corridor.stops[i]" y="84" text-anchor="middle" font-size="8.5"
              fill="#8ea6b2" font-family="monospace"
            >{{ s.order }}</text>
            <text
              v-if="s.transfer"
              :x="35 + corridor.stops[i]" y="138" text-anchor="middle" font-size="8"
              fill="#9ad7e5" font-family="monospace"
            >⇄{{ s.transferCode }}</text>
          </g>
          <text x="35" y="158" font-size="9" fill="#5d7583" font-family="monospace">首站 {{ project.stops[0].dist.toFixed(0) }}m</text>
          <text x="830" y="158" text-anchor="end" font-size="9" fill="#5d7583" font-family="monospace">末站 {{ project.stops[project.stops.length - 1].dist.toFixed(0) }}m</text>
          <text x="35" y="176" font-size="9" fill="#5d7583" font-family="monospace">
            控制点指纹 {{ fingerprint(project.controls) }} · 站序指纹 {{ fingerprint(project.stops.map(s => s.dist)) }}
          </text>
          <rect x="35" y="192" width="795" height="30" fill="rgba(126,176,196,0.05)" rx="4" />
          <text x="43" y="211" font-size="9.5" fill="#8ea6b2" font-family="monospace">
            站距合格区间 300–800m ｜ 超标段：{{ badSegments.map(b => `#${b.index + 1}(${b.m.toFixed(0)}m)`).join('  ') || '无' }}
          </text>
        </svg>
      </div>
      <div style="padding: 0 15px 13px" v-if="overLimit || underLimit">
        <div class="banner bad" style="font-size:11.5px">
          <span>▲</span>
          <span>
            有 {{ overLimit }} 段超过 800m、{{ underLimit }} 段低于 300m。
            可在下方逐站微调里程，或点击“增补候车站”在超标段中间插入一站，把长站距拆成两段。
          </span>
          <button class="btn btn-danger btn-xs" style="margin-left:auto" @click="applyFix">增补候车站</button>
        </div>
      </div>
    </section>

    <div class="grid" style="grid-template-columns: minmax(0, 1fr) 340px; align-items: start">
      <section class="panel">
        <div class="panel-head">
          <span class="panel-title"><span class="idx">B</span>站序与站距明细</span>
          <span class="spacer"></span>
          <div class="row" style="gap:5px">
            <button class="btn btn-ghost btn-xs" @click="shiftCount(-1)">－1 站</button>
            <button class="btn btn-ghost btn-xs" @click="shiftCount(1)">＋1 站</button>
          </div>
        </div>
        <div class="table-wrap" style="max-height:520px">
          <table class="data">
            <thead>
              <tr>
                <th style="width:44px">站序</th>
                <th>站名</th>
                <th>里程 m</th>
                <th>前站距</th>
                <th>类型</th>
                <th>片区</th>
                <th>客流分</th>
                <th style="width:120px">调整</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(s, i) in status.rows" :key="s.id"
                :class="{ sel: selectedId === s.id, bad: s.level === 'bad' }"
                @click="selectedId = s.id"
                style="cursor:pointer"
              >
                <td class="mono" style="color:var(--text-faint)">{{ String(s.order).padStart(2, '0') }}</td>
                <td>
                  <div style="font-weight:600">{{ s.name }}</div>
                  <div class="hint mono" style="font-size:9.5px">{{ s.id }}</div>
                </td>
                <td class="num">{{ s.dist.toFixed(0) }}</td>
                <td>
                  <span
                    v-if="s.prevGap !== null"
                    class="tag"
                    :class="spacingLevel(s.prevGap) === 'bad' ? 'bad' : spacingLevel(s.prevGap) === 'warn' ? 'warn' : 'idle'"
                  >{{ s.prevGap.toFixed(0) }}m</span>
                  <span v-else class="hint">始发</span>
                </td>
                <td>
                  <span class="tag" :class="s.transfer ? 'info' : i === 0 || i === status.rows.length - 1 ? 'violet' : 'idle'">
                    {{ i === 0 ? '首站' : i === status.rows.length - 1 ? '末站' : s.transfer ? '换乘' : '中途' }}
                  </span>
                </td>
                <td style="font-size:11px;color:var(--text-dim)">{{ s.district }}</td>
                <td>
                  <div class="row" style="gap:5px">
                    <div class="bar-track" style="width:38px"><div class="bar-fill amber" :style="{ width: (s.demandScore * 100) + '%' }"></div></div>
                    <span class="mono" style="font-size:9.5px;color:var(--text-faint)">{{ (s.demandScore * 100).toFixed(0) }}</span>
                  </div>
                </td>
                <td>
                  <div class="row" style="gap:3px">
                    <button class="btn btn-ghost btn-xs" @click.stop="nudgeStop(project.id, s.id, -60)">−60</button>
                    <button class="btn btn-ghost btn-xs" @click.stop="nudgeStop(project.id, s.id, 60)">+60</button>
                    <button class="btn btn-ghost btn-xs" title="下落位" @click.stop="selectedId = s.id">◎</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0;justify-content:space-between">
          <span class="hint mono">站距序列 {{ gaps.map((g) => g.toFixed(0)).join(' / ') }}</span>
          <span class="tag" :class="status.eval.ok ? 'good' : 'bad'">
            {{ status.eval.ok ? '可进入派工' : '未通过站距校验' }}
          </span>
        </div>
      </section>

      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">落位候选</span>
            <span class="spacer"></span>
            <span class="tag idle mono">{{ selected?.candidates?.length || 0 }} 组</span>
          </div>
          <div class="panel-body" v-if="selected">
            <div class="row" style="margin-bottom:8px">
              <span class="tag" :class="status.rows[selectedIdx]?.level === 'bad' ? 'bad' : 'info'">{{ selected.order }} 号站</span>
              <span style="font-weight:600">{{ selected.name }}</span>
            </div>
            <div class="grid grid-2" style="gap:7px">
              <button
                v-for="(c, i) in selected.candidates" :key="i"
                class="btn btn-sm"
                style="flex-direction:column;align-items:flex-start;padding:8px 10px;gap:2px"
                :style="{ borderColor: selected.chosen === i ? 'rgba(232,168,60,0.7)' : 'var(--line)', background: selected.chosen === i ? 'rgba(232,168,60,0.13)' : 'transparent' }"
                @click="pick(i)"
              >
                <span class="mono" style="font-size:10px;color:var(--amber)">C{{ i + 1 }}</span>
                <span style="font-size:10px;color:var(--text-dim)">
                  {{ c.side > 0 ? '路线左侧' : '路线右侧' }} · 退距 {{ Math.abs(c.lateral).toFixed(0) }}m
                </span>
              </button>
            </div>

            <div class="divider"></div>
            <div class="kv" style="grid-template-columns: 82px 1fr">
              <dt>里程</dt><dd class="num">{{ selected.dist.toFixed(0) }} m</dd>
              <dt>客流分</dt><dd class="num">{{ (selected.demandScore * 100).toFixed(0) }} / 100</dd>
              <dt>片区</dt><dd>{{ selected.district }}</dd>
              <dt>换乘</dt><dd>{{ selected.transfer ? selected.transferCode : '非换乘节点' }}</dd>
            </div>

            <div v-if="candidateConflict.length" class="banner warn" style="margin-top:10px;font-size:11px">
              <span>▲</span>
              <span>落位与 {{ candidateConflict.length }} 栋建筑包络重叠（最近 {{ candidateConflict[0].dist }}m），需在三维页退让。</span>
            </div>
            <div v-else class="banner good" style="margin-top:10px;font-size:11px">
              <span>✓</span><span>当前落位与沿线建筑包络无冲突</span>
            </div>
          </div>
          <div v-else class="empty">选择左侧任一站查看落位</div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">校验口径</span></div>
          <div class="panel-body">
            <div class="kv" style="grid-template-columns: 84px 1fr">
              <dt>项目区间</dt><dd class="num">{{ project.spacingMin }}–{{ project.spacingMax }} m</dd>
              <dt>行业标准</dt><dd class="num">{{ SPACING_MIN }}–{{ SPACING_MAX }} m</dd>
              <dt>超标规则</dt><dd style="font-size:11px">任一段 &gt; {{ SPACING_MAX }}m 标红</dd>
              <dt>过密规则</dt><dd style="font-size:11px">任一段 &lt; {{ SPACING_MIN }}m 提示</dd>
            </div>
            <div class="divider"></div>
            <div class="hint" style="margin-bottom:6px">超限段落</div>
            <div v-if="!badSegments.length" class="banner good" style="font-size:11px"><span>✓</span><span>全部站距合规</span></div>
            <div v-for="b in badSegments" :key="b.index" class="row" style="padding:3px 0;font-size:11px;cursor:pointer" @click="focusGap(b.index)">
              <span class="tag bad">#{{ b.index + 1 }}–#{{ b.index + 2 }}</span>
              <span class="mono" :style="{ color: b.level === 'bad' ? 'var(--red)' : 'var(--amber)' }">{{ b.m.toFixed(0) }} m</span>
              <span class="spacer hint">点击定位 →</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
