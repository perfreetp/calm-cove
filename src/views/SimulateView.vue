<script setup>
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { CityRenderer } from '../three/CityRenderer.js'
import { facadeTexture } from '../three/textures.js'
import {
  activeProject, state, projectFingerprint, editBuilding, rebuildOneBuilding, resetBuilding,
  setSeed, setDensity, regenerateDistrict, resolveBuilding, placementBoxes,
  spacingStatus, approveProject, FACADE_STYLES, TINTS
} from '../store'
import { FACADE_BY_KEY } from '../core/city.js'

const toast = inject('toast')
const router = useRouter()

const host = ref(null)
const rendererReady = ref(false)
let renderer = null

const project = computed(() => activeProject.value)
const district = computed(() => project.value?.district || null)
const fp = computed(() => (project.value ? projectFingerprint(project.value) : '----'))

const selectedId = ref(null)
const hoverName = ref('')
const viewMode = ref('auto')
const showStations = ref(true)
const showLabels = ref(true)
const rebuilding = ref(false)

const cameraPreset = ref('fit')

const selected = computed(() => {
  if (!selectedId.value || !district.value) return null
  return district.value.buildings.find((b) => b.id === selectedId.value) || null
})
const selectedResolved = computed(() => (selected.value ? resolveBuilding(selected.value) : null))
const selectedSwatch = computed(() => (selectedResolved.value ? TINTS[selectedResolved.value.tint] : '#888'))
const overrideCount = computed(() => Object.keys(selected.value?.overrides || {}).length)

const draft = reactive({
  floors: 8, width: 18, depth: 14, styleKey: 'concrete', tint: 0, roofType: 'flat', note: ''
})
// 选中当下的“已生效值”快照：只有相对它发生变化的字段才会被记成手工改造
const snapshot = ref(null)

watch(selected, (b) => {
  if (!b) {
    snapshot.value = null
    return
  }
  const s = resolveBuilding(b)
  draft.floors = s.floors
  draft.width = s.width
  draft.depth = s.depth
  draft.styleKey = s.styleKey
  draft.tint = s.tint
  draft.roofType = s.roofType
  draft.note = b.overrides.note ?? ''
  snapshot.value = { floors: s.floors, width: s.width, depth: s.depth, styleKey: s.styleKey, tint: s.tint, roofType: s.roofType }
  renderer?.selectBuilding(b.id)
}, { immediate: true })

const stats = computed(() => district.value?.stats || { count: 0, floors: 0, tallest: 0, plotRatio: 0, styles: {} })

const stationsForMap = computed(() => {
  if (!project.value) return []
  const st = spacingStatus(project.value.stops)
  return placementBoxes(project.value.stops, district.value).map((box, i) => ({
    ...box,
    level: st.rows[i]?.level || 'ok',
    transfer: project.value.stops[i]?.transfer || false
  }))
})

const canRegenerate = computed(() => {
  const p = project.value
  if (!p) return { ok: true, msg: '' }
  return { ok: true, msg: '' }
})

const styleList = FACADE_STYLES

onMounted(async () => {
  await nextTick()
  renderer = new CityRenderer(host.value, {
    onPick: (id) => { selectedId.value = id },
    onHover: (id) => { hoverName.value = id || '' }
  })
  renderer.setDistrict(district.value)
  refreshStations()
  renderer.selectBuilding(selectedId.value)
  renderer.setLabelVisibility(showLabels.value)
  rendererReady.value = true
})

onBeforeUnmount(() => {
  renderer?.dispose()
  renderer = null
})

watch(district, (d) => {
  if (!renderer || !d) return
  renderer.setDistrict(d)
  refreshStations()
  if (selectedId.value) renderer.selectBuilding(selectedId.value)
})

watch([showStations, () => district.value], () => refreshStations())
watch(showLabels, (v) => renderer?.setLabelVisibility(v))

function refreshStations() {
  if (!renderer) return
  if (!showStations.value) {
    renderer.setStations([], district.value)
  } else {
    renderer.setStations(stationsForMap.value, district.value)
  }
  renderer.setHighlights(
    stationsForMap.value
      .filter((s) => s.level === 'bad')
      .map((s) => ({ x: s.x, z: s.z, radius: 30, color: 0xe2584f }))
  )
}

function focusStation(box) {
  renderer?.focusStation({ x: box.x, z: box.z })
}

function applyEdits() {
  if (!selected.value) return
  const snap = snapshot.value || {}
  const full = {
    floors: draft.floors,
    width: draft.width,
    depth: draft.depth,
    styleKey: draft.styleKey,
    tint: draft.tint,
    roofType: draft.roofType
  }
  // 只提交真正变化的字段，避免把未改动的数值也钉成手工覆盖
  const patch = {}
  for (const [k, v] of Object.entries(full)) {
    if (snap[k] !== v) patch[k] = v
  }
  const note = draft.note.trim()
  if (note) patch.note = note
  if (!Object.keys(patch).length) {
    toast('与种子原型一致，没有需要记录的改动', 'info')
    return
  }
  editBuilding(project.value.id, selected.value.id, patch)
  snapshot.value = { ...full }
  toast(`已应用手工改造：${Object.keys(patch).map((k) => FIELD_LABEL[k] || k).join('、')}`, 'good')
}

function rebuildSelected() {
  if (!selected.value) return
  const kept = Object.keys(selected.value.overrides || {})
  rebuildOneBuilding(project.value.id, selected.value.id)
  toast(
    kept.length
      ? `已重生成 ${selected.value.id}，保留手工字段：${kept.map((k) => FIELD_LABEL[k] || k).join('、')}`
      : `已按种子重生成 ${selected.value.id}`,
    'good'
  )
}

const FIELD_LABEL = {
  floors: '层数', width: '面宽', depth: '进深', styleKey: '立面风格', tint: '色调', roofType: '屋顶', note: '备注'
}

function resetSelected() {
  if (!selected.value) return
  resetBuilding(project.value.id, selected.value.id)
  toast('已恢复该栋的种子原型，手工改造已清除', 'warn')
}

function replaceSeed() {
  if (!canRegenerate.value.ok) {
    toast(canRegenerate.value.msg, 'bad', 4200)
    return
  }
  const np = prompt('输入新的种子（如 S-2026-0912），留空则随机', project.value.seed)
  if (np === null) return
  const seed = np.trim() || `S-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`
  setSeed(project.value.id, seed)
  toast(`种子已切换为 ${seed}，街区随之重建`, 'good')
}

function densify() {
  if (!canRegenerate.value.ok) {
    toast(canRegenerate.value.msg, 'bad', 4200)
    return
  }
  const next = district.value.density >= 1.6 ? 0.6 : Math.round((district.value.density + 0.2) * 10) / 10
  setDensity(project.value.id, next)
  toast(`街区密度调整为 ${next}`, 'good')
}

function viewPreset(p) {
  cameraPreset.value = p
  renderer?.setView(p)
}

function sideBySide() {}

function generateAgain() {
  regenerateDistrict(project.value.id)
  toast('已按当前种子与参数重新生成街区（手工改造保留在单栋内）', 'good')
}

const visibleBuildings = computed(() => {
  if (!selected.value) return []
  return [selected.value]
})

const styleTexture = computed(() => {
  if (!selectedResolved.value || !district.value) return ''
  const canvas = facadeTexture(selectedResolved.value.styleKey, selectedResolved.value.tint, district.value.seed)
  return canvas.image?.toDataURL?.() || ''
})

const verdictBanner = computed(() => {
  const s = spacingStatus(project.value?.stops || [])
  if (s.eval.bad.length) return { tone: 'bad', text: `${s.eval.bad.length} 段站距超过 ${800}m，需在“站点编排”页调整` }
  if (s.eval.under.length) return { tone: 'warn', text: `${s.eval.under.length} 段站距低于 300m` }
  return { tone: 'good', text: '全部站距落在 300–800m 区间内' }
})

function applyApproval() {
  approveProject(project.value.id)
  toast('立项已批准，站点工单已按片区生成，进入分派', 'good')
  router.push('/dispatch')
}
</script>

<template>
  <div class="page page-wide" v-if="project">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 02 · 程序化街区</div>
        <h1 class="page-title">三维街区推演<small>PROCEDURAL DISTRICT</small></h1>
        <p class="page-desc">
          以固定种子生成沿线两侧街区体量、立面材质与屋顶形态。单击任一建筑可进入单栋编辑；
          “单栋重生成”只替换该栋的种子原型，运营手工改过的字段会被原样保留。
        </p>
      </div>
      <div class="spacer"></div>
      <div class="row riff">
        <button class="btn btn-ghost btn-sm" @click="generateAgain">按当前参数重生成</button>
        <button class="btn btn-sm" @click="replaceSeed">切换种子</button>
        <button class="btn btn-primary btn-sm" @click="applyApproval" v-if="project.status !== 'approved'">批准立项 →</button>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: minmax(0, 1fr) 340px; align-items: start">
      <section class="panel" style="overflow:hidden">
        <div class="viewport" style="height: 620px">
          <div ref="host" style="position:absolute;inset:0"></div>
          <div class="vp-overlay">
            <div class="vp-stat glass" style="padding:8px 11px">
              <div class="row" style="gap:12px">
                <div>
                  <div class="metric-label">种子</div>
                  <div class="mono" style="font-size:12px;color:var(--cyan)">{{ project.seed }}</div>
                </div>
                <div class="divider" style="height:26px;width:1px;margin:0"></div>
                <div>
                  <div class="metric-label">街区指纹</div>
                  <div class="mono" style="font-size:12px;color:var(--amber)">{{ fp }}</div>
                </div>
                <div class="divider" style="height:26px;width:1px;margin:0"></div>
                <div>
                  <div class="metric-label">建筑</div>
                  <div class="mono" style="font-size:12px">{{ stats.count }}</div>
                </div>
              </div>
            </div>

            <div class="vp-tools">
              <div class="glass" style="padding:3px;display:flex;flex-direction:column;gap:2px">
                <button class="btn btn-ghost btn-xs" :style="{ background: cameraPreset === 'fit' ? 'rgba(232,168,60,0.2)' : 'transparent' }" @click="viewPreset('fit')">近景</button>
                <button class="btn btn-ghost btn-xs" :style="{ background: cameraPreset === 'full' ? 'rgba(232,168,60,0.2)' : 'transparent' }" @click="viewPreset('full')">全景</button>
                <button class="btn btn-ghost btn-xs" :style="{ background: cameraPreset === 'top' ? 'rgba(232,168,60,0.2)' : 'transparent' }" @click="viewPreset('top')">屋顶</button>
                <button class="btn btn-ghost btn-xs" :style="{ background: cameraPreset === 'street' ? 'rgba(232,168,60,0.2)' : 'transparent' }" @click="viewPreset('street')">街景</button>
              </div>
              <div class="glass" style="padding:3px;display:flex;flex-direction:column;gap:2px">
                <button class="btn btn-ghost btn-xs" :style="{ color: showStations ? 'var(--amber)' : 'var(--text-faint)' }" @click="showStations = !showStations">站点</button>
                <button class="btn btn-ghost btn-xs" :style="{ color: showLabels ? 'var(--amber)' : 'var(--text-faint)' }" @click="showLabels = !showLabels">标注</button>
                <button class="btn btn-ghost btn-xs" @click="rebuildSelected" :disabled="!selected">单栋重生成</button>
              </div>
            </div>

            <div class="vp-legend glass" style="padding:8px 10px;font-size:10px">
              <div class="row" style="gap:6px"><span class="swatch" style="background:#7fd0a9"></span>中途站</div>
              <div class="row" style="gap:6px"><span class="swatch" style="background:#62b0c8"></span>换乘站</div>
              <div class="row" style="gap:6px"><span class="swatch" style="background:#e0524a"></span>站距超标</div>
            </div>

            <div class="glass" style="position:absolute;right:12px;bottom:12px;padding:7px 10px;font-size:10.5px;color:var(--text-dim)">
              {{ hoverName ? `悬停：${hoverName}` : selected ? `选中：${selected.id}` : '拖动旋转 · 滚轮缩放 · 单击建筑' }}
            </div>
          </div>
        </div>
        <div class="panel-head" style="border-top:1px solid var(--line);border-bottom:0">
          <span class="tag" :class="verdictBanner.tone">{{ verdictBanner.text }}</span>
          <span class="spacer"></span>
          <span class="tag idle mono">DENSITY {{ district?.density }}</span>
          <span class="tag idle mono">SEED-LOCKED</span>
          <button class="btn btn-ghost btn-sm" @click="densify">密度 ×</button>
        </div>
      </section>

      <aside class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">单栋建筑编辑</span>
            <span class="spacer"></span>
            <span class="tag" :class="overrideCount ? 'warn' : 'idle'">手工字段 {{ overrideCount }}</span>
          </div>
          <div class="panel-body" v-if="selected">
            <div class="row" style="margin-bottom:10px">
              <div class="avatar-lg" :style="{ background: selectedSwatch }">{{ selectedResolved.floors }}</div>
              <div>
                <div class="mono" style="font-size:12px;font-weight:600">{{ selected.id }}</div>
                <div class="hint">种子原型 nonce {{ selected.nonce }} · {{ FACADE_BY_KEY[selectedResolved.styleKey]?.label }}</div>
              </div>
            </div>

            <div class="grid grid-2" style="gap:9px">
              <div class="field">
                <label>层数</label>
                <input v-model.number="draft.floors" type="number" min="1" max="60" class="input mono" />
              </div>
              <div class="field">
                <label>面宽（m）</label>
                <input v-model.number="draft.width" type="number" min="6" max="48" class="input mono" />
              </div>
              <div class="field">
                <label>进深（m）</label>
                <input v-model.number="draft.depth" type="number" min="6" max="38" class="input mono" />
              </div>
              <div class="field">
                <label>屋顶</label>
                <select v-model="draft.roofType" class="select">
                  <option value="flat">平屋顶</option>
                  <option value="setback">退台</option>
                  <option value="gable">坡屋顶</option>
                </select>
              </div>
            </div>

            <div class="divider"></div>

            <div class="field">
              <label>立面风格</label>
              <div class="row row-wrap" style="gap:5px">
                <button
                  v-for="s in styleList" :key="s.key"
                  class="btn btn-xs"
                  :style="{ borderColor: draft.styleKey === s.key ? 'rgba(232,168,60,0.7)' : 'var(--line)', background: draft.styleKey === s.key ? 'rgba(232,168,60,0.16)' : 'transparent', color: draft.styleKey === s.key ? 'var(--amber)' : 'var(--text-dim)' }"
                  @click="draft.styleKey = s.key"
                >{{ s.label }}</button>
              </div>
            </div>

            <div class="field" style="margin-top:10px">
              <label>色调</label>
              <div class="row row-wrap" style="gap:5px">
                <button
                  v-for="(c, i) in TINTS" :key="i"
                  class="swatch"
                  style="width:20px;height:20px;border:0;cursor:pointer;border-radius:4px"
                  :style="{ background: c, outline: draft.tint === i ? '2px solid var(--amber)' : '1px solid rgba(255,255,255,0.15)', outlineOffset: '1px' }"
                  @click="draft.tint = i"
                ></button>
              </div>
            </div>

            <div class="field" style="margin-top:10px">
              <label>改造备注</label>
              <input v-model="draft.note" class="input" placeholder="如：沿街立面退让 6m 形成骑楼" />
            </div>

            <div class="row" style="margin-top:12px">
              <button class="btn btn-primary btn-sm" style="flex:1" @click="applyEdits">应用改造</button>
              <button class="btn btn-sm" @click="rebuildSelected">单栋重生成</button>
            </div>
            <div class="row" style="margin-top:6px">
              <button class="btn btn-ghost btn-sm" style="flex:1" @click="resetSelected">恢复种子原型</button>
            </div>

            <div class="banner violet" style="margin-top:10px;font-size:11px">
              <span>◆</span>
              <span>重生成只更换该栋的 nonce（种子像素），叠加层中的手工字段仍优先于新原型。</span>
            </div>

            <div v-if="overrideCount" class="grid" style="gap:4px;margin-top:10px">
              <div class="hr-label">保留的手工字段</div>
              <div class="row row-wrap">
                <span v-for="k in Object.keys(selected.overrides)" :key="k" class="tag warn">
                  {{ FIELD_LABEL[k] || k }} · {{ selected.overrides[k] }}
                </span>
              </div>
            </div>
          </div>
          <div v-else class="empty">
            <b>未选中建筑</b>
            在视图中单击任意楼栋，右侧即为单栋编辑面板
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">街区统计</span></div>
          <div class="panel-body grid grid-2" style="gap:8px">
            <div class="metric" style="padding:9px 10px;border:1px solid var(--line);border-radius:8px">
              <div class="metric-label">建筑数量</div>
              <div class="metric-value" style="font-size:19px">{{ stats.count }}</div>
            </div>
            <div class="metric" style="padding:9px 10px;border:1px solid var(--line);border-radius:8px">
              <div class="metric-label">总层数</div>
              <div class="metric-value" style="font-size:19px">{{ stats.floors }}</div>
            </div>
            <div class="metric" style="padding:9px 10px;border:1px solid var(--line);border-radius:8px">
              <div class="metric-label">最高</div>
              <div class="metric-value" style="font-size:19px">{{ stats.tallest }}<span class="unit">m</span></div>
            </div>
            <div class="metric" style="padding:9px 10px;border:1px solid var(--line);border-radius:8px">
              <div class="metric-label">容积率</div>
              <div class="metric-value" style="font-size:19px">{{ stats.plotRatio }}</div>
            </div>
          </div>
          <div class="panel-body" style="padding-top:0">
            <div class="hr-label" style="margin-bottom:6px">立面构成</div>
            <div v-for="s in FACADE_STYLES" :key="s.key" class="row" style="gap:8px;margin-bottom:3px">
              <span class="swatch" :style="{ background: s.swatch }"></span>
              <span style="font-size:11px;color:var(--text-dim);width:74px">{{ s.label }}</span>
              <div class="bar-track" style="flex:1"><div class="bar-fill" :style="{ width: ((stats.styles[s.key] || 0) / Math.max(1, stats.count)) * 100 + '%', opacity: 0.8 }"></div></div>
              <span class="mono" style="font-size:10px;color:var(--text-faint);width:26px;text-align:right">{{ stats.styles[s.key] || 0 }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">候选站点落位</span>
            <span class="spacer"></span>
            <router-link to="/stations" class="btn btn-ghost btn-xs">去编排 →</router-link>
          </div>
          <div class="panel-body" style="max-height:190px;overflow:auto">
            <div
              v-for="(b, i) in stationsForMap" :key="b.stationId"
              class="row" style="gap:8px;padding:4px 0;cursor:pointer"
              @click="focusStation(b)"
            >
              <span class="pill-num">{{ b.order }}</span>
              <span style="font-size:11.5px">{{ b.name }}</span>
              <span class="tag" :class="b.level === 'bad' ? 'bad' : b.level === 'warn' ? 'warn' : b.transfer ? 'info' : 'idle'" style="font-size:9.5px">
                {{ b.platform }}
              </span>
              <span class="spacer mono" style="font-size:10px;color:var(--text-faint)">{{ i === 0 ? '' : (project.stops[i].dist - project.stops[i - 1].dist).toFixed(0) + 'm' }}</span>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
