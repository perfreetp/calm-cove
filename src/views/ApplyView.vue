<script setup>
import { computed, inject, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { BUDGET_TIERS, SPACING_MIN, SPACING_MAX, createProject, budgetOf, previewRoute, setSpacingLimits } from '../store'
import { fingerprint } from '../core/rng.js'

const router = useRouter()
const toast = inject('toast')

const form = reactive({
  lineCode: '72路',
  name: '城东科创走廊站台新建工程',
  applicant: '运营二部 · 何嘉',
  seed: 'S-2026-0721',
  bends: 7,
  routeLength: 4800,
  density: 1,
  stopsCount: 15,
  spacingMin: SPACING_MIN,
  spacingMax: SPACING_MAX,
  firstBus: '05:50',
  lastBus: '22:40',
  budget: 'B',
  note: '接驳科创园区与轨道 4 号线，串联三个新建居住组团。'
})

const seedLocked = ref(true)
const preview = computed(() => {
  try {
    return previewRoute({ seed: form.seed, bends: form.bends, length: form.routeLength, density: form.density })
  } catch (e) {
    return null
  }
})

const routePreviewFp = computed(() => (preview.value ? fingerprint(preview.value.controls) : '----'))

const spark = computed(() => {
  if (!preview.value) return { linePoints: '', rects: [] }
  const W = 700
  const H = 150
  const pts = preview.value.line
  const bounds = pts.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
      minZ: Math.min(b.minZ, p.z), maxZ: Math.max(b.maxZ, p.z)
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  )
  const sx = W / Math.max(1, bounds.maxX - bounds.minX)
  const sz = H / Math.max(1, bounds.maxZ - bounds.minZ)
  const s = Math.min(sx, sz)
  const ox = (W - (bounds.maxX - bounds.minX) * s) / 2
  const oz = (H - (bounds.maxZ - bounds.minZ) * s) / 2
  const map = (p) => [20 + ox + (p.x - bounds.minX) * s, 16 + oz + (p.z - bounds.minZ) * s]
  const linePoints = pts.map((p) => map(p).map((v) => v.toFixed(1)).join(',')).join(' ')
  const rects = preview.value.district.buildings.slice(0, 220).map((b) => {
    const [x, y] = map(b.position)
    return { x: x.toFixed(1), y: y.toFixed(1), side: b.side > 0 }
  })
  return { linePoints, rects, s }
})

function randomizeSeed() {
  if (seedLocked.value) return
  form.seed = `S-2026-${String(Math.floor(Math.random() * 9000) + 1000)}`
}

const validation = computed(() => {
  const errs = {}
  if (!form.lineCode.trim()) errs.lineCode = '请填写线路编号'
  if (!form.name.trim()) errs.name = '请填写项目名称'
  if (!/^S-[0-9A-Za-z-]{3,}$/.test(form.seed)) errs.seed = '种子需以 S- 开头，至少 4 位'
  if (form.spacingMin < 120) errs.spacingMin = '下限不得小于 120m'
  if (form.spacingMax > 1500) errs.spacingMax = '上限不得大于 1500m'
  if (form.spacingMin >= form.spacingMax) errs.spacingMax = '上限必须大于下限'
  if (form.spacingMax < 600) errs.spacingMax = '与国标 300–800m 不符，需说明'
  const spanMin = parseTime(form.firstBus)
  const spanMax = parseTime(form.lastBus)
  if (spanMin === null) errs.firstBus = '首班格式应为 HH:MM'
  if (spanMax === null) errs.lastBus = '末班格式应为 HH:MM'
  if (spanMin !== null && spanMax !== null && spanMax - spanMin < 15 * 60) errs.lastBus = '运营时长不得少于 15 小时'
  return errs
})

function parseTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '')
  if (!m) return null
  const h = Number(m[1])
  const mi = Number(m[2])
  if (h > 23 || mi > 59) return null
  return h * 60 + mi
}

const serviceHours = computed(() => {
  const a = parseTime(form.firstBus)
  const b = parseTime(form.lastBus)
  if (a === null || b === null || b <= a) return '—'
  return `${((b - a) / 60).toFixed(1)} 小时`
})

const budget = computed(() => budgetOf({ budget: form.budget }))
const canSubmit = computed(() => Object.keys(validation.value).length === 0)
const submitting = ref(false)

function submit() {
  if (!canSubmit.value) {
    toast('请先修正表单中的 ' + Object.keys(validation.value).length + ' 处问题', 'bad')
    return
  }
  submitting.value = true
  const p = createProject({ ...form })
  setSpacingLimits(p.id, form.spacingMin, form.spacingMax)
  toast(`立项草稿 ${p.lineCode} 已创建，种子 ${p.seed} 已锁定`, 'good')
  setTimeout(() => {
    submitting.value = false
    router.push('/simulate')
  }, 420)
}

watch(
  () => form.seed,
  () => {}
)

const stage = computed(() => {
  const e = Object.keys(validation.value).length
  return e === 0 ? { label: '可以提交', tone: 'good' } : { label: `${e} 项待修正`, tone: 'bad' }
})
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <div class="eyebrow">STEP 01 · 立项参数</div>
        <h1 class="page-title">新建站台申请<small>APPLICATION INTAKE</small></h1>
        <p class="page-desc">
          前台录入线路走向、站距区间、首末班时间与预算档位。提交后以固定种子驱动沿线街区生成，
          种子一旦锁定，同一输入永远产出同一街区。
        </p>
      </div>
      <div class="spacer"></div>
      <span class="tag" :class="stage.tone">{{ stage.label }}</span>
    </div>

    <div class="grid" style="grid-template-columns: minmax(0, 1fr) 360px">
      <div class="grid" style="gap:14px">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title"><span class="idx">A</span>线路基本信息</span>
            <span class="spacer"></span>
            <span class="tag idle mono">INTAKE-FORM</span>
          </div>
          <div class="panel-body grid grid-2">
            <div class="field">
              <label>线路编号 <span class="req">*</span></label>
              <input v-model="form.lineCode" class="input mono" placeholder="如 72路" />
              <span v-if="validation.lineCode" class="hint" style="color:var(--red)">{{ validation.lineCode }}</span>
            </div>
            <div class="field">
              <label>项目名称 <span class="req">*</span></label>
              <input v-model="form.name" class="input" placeholder="站台建设/改造工程名称" />
              <span v-if="validation.name" class="hint" style="color:var(--red)">{{ validation.name }}</span>
            </div>
            <div class="field">
              <label>申请人</label>
              <input v-model="form.applicant" class="input" />
            </div>
            <div class="field">
              <label>首末班时间</label>
              <div class="row">
                <input v-model="form.firstBus" class="input mono" placeholder="HH:MM" />
                <span style="color:var(--text-faint)">→</span>
                <input v-model="form.lastBus" class="input mono" placeholder="HH:MM" />
              </div>
              <span class="hint">运营时长 {{ serviceHours }}</span>
              <span v-if="validation.firstBus || validation.lastBus" class="hint" style="color:var(--red)">
                {{ validation.firstBus || validation.lastBus }}
              </span>
            </div>
            <div class="field">
              <label>站距区间 <span class="req">*</span>（米）</label>
              <div class="row">
                <input v-model.number="form.spacingMin" type="number" class="input mono" />
                <span style="color:var(--text-faint)">—</span>
                <input v-model.number="form.spacingMax" type="number" class="input mono" />
              </div>
              <span class="hint">
                行业标准 {{ SPACING_MIN }}–{{ SPACING_MAX }}m；超出区间将进入“标红待调整”流程
              </span>
              <span v-if="validation.spacingMin || validation.spacingMax" class="hint" style="color:var(--red)">
                {{ validation.spacingMin || validation.spacingMax }}
              </span>
            </div>
            <div class="field">
              <label>计划站数</label>
              <input v-model.number="form.stopsCount" type="number" min="6" max="20" class="input mono" />
              <span class="hint">6–20 站，末班后按客流自动增补候选站</span>
            </div>
            <div class="field" style="grid-column: span 2">
              <label>立项说明</label>
              <textarea v-model="form.note" class="textarea" rows="2"></textarea>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title"><span class="idx">B</span>沿线走向与种子</span>
            <span class="spacer"></span>
            <span class="tag" :class="routePreviewFp ? 'info' : 'bad'">指纹 {{ routePreviewFp }}</span>
          </div>
          <div class="panel-body">
            <div class="grid grid-2">
              <div class="field">
                <label>生成种子 <span class="req">*</span></label>
                <div class="row">
                  <input v-model="form.seed" class="input mono" :disabled="seedLocked" />
                  <button class="btn btn-ghost btn-sm" @click="seedLocked = !seedLocked">
                    {{ seedLocked ? '解锁' : '锁定' }}
                  </button>
                  <button class="btn btn-ghost btn-sm" :disabled="seedLocked" @click="randomizeSeed">随机</button>
                </div>
                <span class="hint">种子锁定后街区推演与站点编排均引用此值，不可漂移</span>
                <span v-if="validation.seed" class="hint" style="color:var(--red)">{{ validation.seed }}</span>
              </div>
              <div class="field">
                <label>街区密度系数</label>
                <div class="row">
                  <input v-model.number="form.density" type="range" min="0.6" max="1.6" step="0.1" class="range" />
                  <span class="tag mono" style="min-width:44px;justify-content:center">{{ form.density.toFixed(1) }}</span>
                </div>
                <span class="hint">影响建筑排布间距，不影响已锁定建筑的单体参数</span>
              </div>
              <div class="field">
                <label>线路长度（米）</label>
                <div class="row">
                  <input v-model.number="form.routeLength" type="range" min="2400" max="7200" step="100" class="range" />
                  <span class="tag mono" style="min-width:58px;justify-content:center">{{ form.routeLength }}</span>
                </div>
              </div>
              <div class="field">
                <label>走向折点数</label>
                <div class="row">
                  <input v-model.number="form.bends" type="range" min="4" max="10" step="1" class="range" />
                  <span class="tag mono" style="min-width:30px;justify-content:center">{{ form.bends }}</span>
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <svg class="transit" viewBox="0 0 740 200" preserveAspectRatio="xMidYMid meet" v-if="preview">
              <defs>
                <linearGradient id="pp" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#6fc6d8" />
                  <stop offset="1" stop-color="#e8a83c" />
                </linearGradient>
              </defs>
              <g>
                <circle
                  v-for="(r, i) in spark.rects" :key="i"
                  :cx="r.x" :cy="r.y" r="1.7"
                  :fill="r.side ? '#5a8ea2' : '#8a7554'"
                  opacity="0.85"
                />
                <polyline :points="spark.linePoints" fill="none" stroke="url(#pp)" stroke-width="2.6" stroke-linecap="round" />
              </g>
              <text x="24" y="190" fill="#5d7583" font-size="10">
                控制点 {{ form.bends + 1 }} · 总长 {{ preview.district.total.toFixed(0) }}m · 建筑 {{ preview.district.stats.count }} 栋（图示 {{ spark.rects.length }}）
              </text>
            </svg>

            <div class="row row-wrap" style="margin-top:12px">
              <span class="tag info">控制点 {{ form.bends + 1 }}</span>
              <span class="tag">总长 {{ preview ? preview.district.total.toFixed(0) : '—' }} m</span>
              <span class="tag">建筑 {{ preview ? preview.district.stats.count : 0 }} 栋</span>
              <span class="tag">最高 {{ preview ? preview.district.stats.tallest : 0 }} m</span>
              <span class="tag">容积率 {{ preview ? preview.district.stats.plotRatio : 0 }}</span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title"><span class="idx">C</span>预算档位</span>
            <span class="spacer"></span>
            <span class="tag amber">¥{{ budget.amount }} 万</span>
          </div>
          <div class="panel-body">
            <div class="grid grid-3">
              <button
                v-for="t in BUDGET_TIERS" :key="t.key"
                class="panel"
                style="text-align:left;cursor:pointer;padding:12px 13px;background:rgba(5,14,20,0.4)"
                :style="{ borderColor: form.budget === t.key ? 'rgba(232,168,60,0.62)' : 'var(--line)', background: form.budget === t.key ? 'rgba(232,168,60,0.1)' : 'rgba(5,14,20,0.4)' }"
                @click="form.budget = t.key"
              >
                <div class="row">
                  <span class="tag" :class="form.budget === t.key ? 'warn' : 'idle'">{{ t.key }}</span>
                  <span style="font-weight:700;font-size:13px">{{ t.label.split('·')[1] }}</span>
                  <span class="spacer tag mono">¥{{ t.amount }} 万</span>
                </div>
                <div class="hint" style="margin-top:6px">{{ t.shelter }}</div>
                <div class="hint">承载 {{ t.capacity }}</div>
              </button>
            </div>
          </div>
        </section>
      </div>

      <aside class="grid" style="align-content:start;gap:14px">
        <section class="panel">
          <div class="panel-head"><span class="panel-title">提交校验</span></div>
          <div class="panel-body">
            <div class="checklist">
              <div class="check-item" :class="{ fail: validation.lineCode }">
                <span class="tag" :class="validation.lineCode ? 'bad' : 'good'">{{ validation.lineCode ? '✕' : '✓' }}</span>
                线路编号与名称
              </div>
              <div class="check-item" :class="{ fail: validation.firstBus || validation.lastBus }">
                <span class="tag" :class="validation.firstBus || validation.lastBus ? 'bad' : 'good'">
                  {{ validation.firstBus || validation.lastBus ? '✕' : '✓' }}
                </span>
                首末班时间合法性
              </div>
              <div class="check-item" :class="{ fail: validation.spacingMin || validation.spacingMax }">
                <span class="tag" :class="validation.spacingMin || validation.spacingMax ? 'bad' : 'good'">
                  {{ validation.spacingMin || validation.spacingMax ? '✕' : '✓' }}
                </span>
                站距区间与国标一致
              </div>
              <div class="check-item" :class="{ fail: validation.seed }">
                <span class="tag" :class="validation.seed ? 'bad' : 'good'">{{ validation.seed ? '✕' : '✓' }}</span>
                种子格式与锁定状态
              </div>
            </div>

            <div class="divider"></div>
            <div class="kv">
              <dt>预算档位</dt><dd>{{ budget.label }} · ¥{{ budget.amount }} 万</dd>
              <dt>站亭配置</dt><dd style="font-size:11px">{{ budget.shelter }}</dd>
              <dt>运营时长</dt><dd class="num">{{ serviceHours }}</dd>
              <dt>预计站数</dt><dd class="num">{{ form.stopsCount }} 站</dd>
            </div>
            <div class="divider"></div>
            <button class="btn btn-primary" style="width:100%" :disabled="!canSubmit || submitting" @click="submit">
              {{ submitting ? '正在生成街区…' : '提交立项并生成街区 →' }}
            </button>
            <span class="hint" style="display:block;margin-top:8px">提交后进入三维推演，可继续调整密度与单栋立面</span>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">数据落盘</span></div>
          <div class="panel-body">
            <div class="banner good" style="font-size:11px">
              <span>◆</span>
              <span>所有申请参数保存在浏览器 localStorage，刷新与重开页面均不丢失；同一 seed 的街区指纹恒定。</span>
            </div>
            <div class="kv" style="margin-top:10px;grid-template-columns: 74px 1fr">
              <dt>存储键</dt><dd class="mono" style="font-size:10.5px">bus-stop-studio.v1</dd>
              <dt>走向指纹</dt><dd class="mono" style="font-size:10.5px">{{ routePreviewFp }}</dd>
            </div>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>
