<template>
  <div class="editor" v-if="script">
    <!-- 顶部工具栏 -->
    <div class="editor-head panel">
      <div>
        <b style="font-size: 16px">{{ project?.title }} · {{ script.name }}</b>
        <el-tag size="small" style="margin-left: 10px" :type="STATUS_TYPE[project!.status]">
          {{ STATUS_LABEL[project!.status] }}
        </el-tag>
        <el-tag v-if="readonly" size="small" type="info" style="margin-left: 6px">只读（不可改稿）</el-tag>
      </div>
      <div class="flex-row">
        <el-button :icon="VideoPlay" @click="runCheck" :loading="checking">安全校验</el-button>
        <el-button :icon="Download" @click="exportVisible = true">导出 PNG 序列帧</el-button>
        <el-button type="primary" :icon="Promotion" :disabled="readonly || project!.status === 'submitted'"
          @click="submitVisible = true">提交审核</el-button>
        <el-button @click="$router.back()">返回</el-button>
      </div>
    </div>

    <el-row :gutter="14" class="editor-body">
      <!-- 左侧：编队 / 无人机巡检 -->
      <el-col :span="6">
        <el-tabs v-model="leftTab">
          <el-tab-pane label="编队骨架" name="formation">
            <FormationPanel :script="script" :selected-formation-id="selectedFormationId"
              :selected-node-id="selectedNodeId" :red-drone-ids="redDroneIds" :readonly="readonly"
              @select-formation="onSelectFormation" @select-node="selectedNodeId = $event"
              @add-formation="onAddFormation" @rebind-all="onRebindAll" @binding-changed="persist" />
          </el-tab-pane>
          <el-tab-pane :label="`无人机巡检${safety ? '(' + safety.violations.length + ')' : ''}`" name="drones">
            <div class="panel drone-inspect">
              <el-input v-model="droneKw" size="small" placeholder="搜索编号 D001" clearable style="margin-bottom: 8px" />
              <div class="drone-list scroll-y">
                <div v-for="st in liveStatesFiltered" :key="st.droneId" class="drone-card"
                  :class="{ selected: st.droneId === selectedDrone, danger: redDroneIds.has(st.droneId) }"
                  @click="selectedDrone = st.droneId">
                  <div class="flex-row" style="justify-content: space-between">
                    <b class="mono">{{ st.droneId }}</b>
                    <el-tag v-if="redDroneIds.has(st.droneId)" type="danger" size="small">超限</el-tag>
                  </div>
                  <div class="dim mono" style="font-size: 12px; margin-top: 4px">
                    v {{ st.speed.toFixed(2) }} m/s · a {{ st.accel.toFixed(2) }} m/s²
                  </div>
                  <div class="dim mono" style="font-size: 12px">
                    ({{ st.position.x.toFixed(1) }}, {{ st.position.y.toFixed(1) }}, {{ st.position.z.toFixed(1) }})
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </el-col>

      <!-- 中间：画布 + 时间轴 -->
      <el-col :span="12">
        <div class="canvas-host panel">
          <SceneCanvas ref="sceneRef" :points="scenePoints" :lines="sceneLines" :pick-ids="pickIds"
            :selected-drone="selectedDrone" @pick="onPick" />
        </div>
        <TimelineTrack :keyframes="script.keyframes" :segments="script.segments" :duration="duration"
          :current-time="currentTime" :selected-segment-id="selectedSegmentId" :playing="playing"
          @update:current-time="onScrub" @select-segment="selectedSegmentId = $event"
          @select-keyframe="onSelectKeyframe" @toggle-play="togglePlay" @stop="stopPlay" />
      </el-col>

      <!-- 右侧：安全 / 关键帧段属性 -->
      <el-col :span="6">
        <!-- 安全校验结果 -->
        <div class="panel">
          <div class="panel-title">安全校验（速度 / 加速度超限当场标红）</div>
          <div v-if="!safety" class="dim">尚未校验。点击顶部「安全校验」对全时段每架无人机做包络分析。</div>
          <template v-else>
            <el-result v-if="safety.ok" icon="success" title="全部通过" :sub-title="`峰值速度 ${safety.maxSpeed.value.toFixed(2)}m/s（${safety.maxSpeed.droneId}） · 峰值加速度 ${safety.maxAccel.value.toFixed(2)}m/s²（${safety.maxAccel.droneId}）`" />
            <template v-else>
              <el-alert type="error" :closable="false" show-icon style="margin-bottom: 10px"
                :title="`第一架超限：${safety.firstViolator?.droneId}（${safety.firstViolator?.kind === 'speed' ? '速度' : '加速度'}）`"
                :description="safety.firstViolator?.message" />
              <div class="violation-list scroll-y">
                <div v-for="(v, i) in safety.violations.slice(0, 60)" :key="i" class="violation-item"
                  @click="jumpToViolation(v)">
                  <el-tag :type="v.kind === 'speed' ? 'danger' : 'warning'" size="small">
                    {{ v.kind === 'speed' ? '速度' : '加速度' }}
                  </el-tag>
                  <span class="mono">{{ v.droneId }}</span>
                  <span class="dim">T+{{ v.timeSec.toFixed(1) }}s</span>
                  <b>{{ v.value.toFixed(2) }}</b>
                </div>
                <div v-if="safety.violations.length > 60" class="dim">…仅展示前 60 条，共 {{ safety.violations.length }} 条</div>
              </div>
            </template>
          </template>
          <el-divider style="margin: 10px 0" />
          <div class="flex-row" style="justify-content: space-between">
            <span class="dim">限值设置</span>
          </div>
          <div class="flex-row" style="margin-top: 6px">
            <span>最大速度 m/s</span>
            <el-input-number v-model="script.limits.maxSpeed" :min="1" :max="30" size="small" :disabled="readonly"
              @change="persist" />
            <span>最大加速度 m/s²</span>
            <el-input-number v-model="script.limits.maxAccel" :min="0.5" :max="20" :step="0.5" size="small"
              :disabled="readonly" @change="persist" />
          </div>
        </div>

        <!-- 段缓动编辑 -->
        <div class="panel" v-if="activeSegment">
          <div class="panel-title">段缓动曲线</div>
          <p class="dim" style="margin: 0 0 8px; font-size: 12px">
            {{ kfLabelOf(activeSegment.fromKeyframeId) }} → {{ kfLabelOf(activeSegment.toKeyframeId) }}
          </p>
          <EasingCurveEditor v-model="activeSegment" @update:model-value="onSegmentUpdate" />
          <div class="flex-row" style="margin-top: 10px">
            <span>段时长 s</span>
            <el-input-number v-model="segmentDurationDraft" :min="1" :max="600" size="small" :disabled="readonly"
              @change="applySegmentDuration" />
          </div>
        </div>

        <!-- 关键帧属性 -->
        <div class="panel" v-if="activeKeyframe">
          <div class="panel-title">关键帧属性</div>
          <el-form label-width="82px" size="small">
            <el-form-item label="类型">
              <el-tag :color="KEYFRAME_COLOR[activeKeyframe.type]" style="color: #06101f">
                {{ KEYFRAME_LABEL[activeKeyframe.type] }}
              </el-tag>
            </el-form-item>
            <el-form-item label="时刻(s)">
              <el-input-number v-model="kfTimeDraft" :min="0" :max="duration" @change="applyKfTime"
                :disabled="readonly" />
            </el-form-item>
            <el-form-item label="编队">
              <el-select v-model="activeKeyframe.formationId" :disabled="readonly" @change="onKfFormationChange"
                style="width: 100%">
                <el-option v-for="f in script.formations" :key="f.id" :value="f.id" :label="f.name" />
              </el-select>
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="activeKeyframe.note" :disabled="readonly" @change="persist" />
            </el-form-item>
          </el-form>
          <el-button v-if="!readonly && activeKeyframe.type === 'transform'" size="small" type="danger" plain
            @click="removeKeyframe">删除该关键帧</el-button>
        </div>

        <div class="panel">
          <div class="panel-title">单机轨迹</div>
          <div class="flex-row">
            <el-select v-model="trailDrone" size="small" clearable filterable placeholder="选择无人机"
              style="width: 150px">
              <el-option v-for="id in allDroneIds(script.droneCount)" :key="id" :value="id" :label="id" />
            </el-select>
            <el-switch v-model="showTrails" active-text="显示轨迹" />
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 提交对话框 -->
    <el-dialog v-model="submitVisible" title="提交审核（生成新版本）" width="460px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px"
        title="每次提交都会生成版本快照，并记录操作人与时间；安全校验不通过时禁止提交。" />
      <el-input v-model="submitComment" type="textarea" :rows="3" placeholder="本版修改说明，例如：心形编队放大 5%，延长保持段 10s" />
      <template #footer>
        <el-button @click="submitVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doSubmit">提交</el-button>
      </template>
    </el-dialog>

    <!-- 导出对话框 -->
    <el-dialog v-model="exportVisible" title="导出 PNG 序列帧（飞控预演）" width="440px">
      <el-form label-width="110px">
        <el-form-item label="帧率 FPS">
          <el-radio-group v-model="exportFps">
            <el-radio-button :value="2">2</el-radio-button>
            <el-radio-button :value="5">5</el-radio-button>
            <el-radio-button :value="10">10</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="预计帧数">
          <span class="mono">{{ Math.floor(duration * exportFps) + 1 }} 帧（1280×720，ZIP 打包）</span>
        </el-form-item>
      </el-form>
      <el-progress v-if="exporting" :percentage="exportPct" :status="exportPct === 100 ? 'success' : ''" />
      <template #footer>
        <el-button @click="exportVisible = false">关闭</el-button>
        <el-button type="primary" :loading="exporting" @click="doExport">开始导出</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Promotion, VideoPlay } from '@element-plus/icons-vue'
import { useStore } from '@/store'
import type { Formation, Keyframe, MotionSegment, SkeletonNode } from '@/types'
import { KEYFRAME_COLOR, KEYFRAME_LABEL, STATUS_LABEL, STATUS_TYPE } from '@/lib/labels'
import { allDroneIds, rebindSequential } from '@/lib/geometry'
import { runSafetyCheck, sampleAt, sortedKeyframes, totalDuration } from '@/lib/script'
import type { SafetyReport, Violation } from '@/lib/script'
import { buildFormationScene, buildScene } from '@/render/scene'
import { exportPngSequence } from '@/render/export-png'
import SceneCanvas from '@/components/SceneCanvas.vue'
import TimelineTrack from '@/components/TimelineTrack.vue'
import EasingCurveEditor from '@/components/EasingCurveEditor.vue'
import FormationPanel from '@/components/editor/FormationPanel.vue'
import { uid } from '@/db/storage'

const route = useRoute()
const router = useRouter()
const store = useStore()
const projectId = route.params.projectId as string
const readonly = route.query.readonly === '1' || store.currentUser?.role !== 'planner'

const project = computed(() => store.projectOf(projectId))
const script = JSON.parse(
  JSON.stringify(store.scriptOf(projectId) as object)
) as NonNullable<ReturnType<typeof store.scriptOf>>

// ---- 视图状态 ----
const leftTab = ref('formation')
const selectedFormationId = ref(script.formations[0]?.id ?? '')
const selectedNodeId = ref<string | null>(null)
const selectedDrone = ref<string | null>(null)
const selectedKeyframeId = ref<string | null>(script.keyframes[1]?.id ?? null)
const selectedSegmentId = ref<string | null>(script.segments[0]?.id ?? null)
const currentTime = ref(0)
const playing = ref(false)
let playTimer: number | null = null
const safety = ref<SafetyReport | null>(null)
const checking = ref(false)
const droneKw = ref('')
const trailDrone = ref<string | null>(null)
const showTrails = ref(false)
const sceneRef = ref<InstanceType<typeof SceneCanvas>>()

const duration = computed(() => totalDuration(script))
const redDroneIds = computed(() => new Set((safety.value?.violations ?? []).map((v) => v.droneId)))

// ---- 场景数据 ----
const isEditMode = computed(() => leftTab.value === 'formation')
const scenePayload = computed(() => {
  if (isEditMode.value) {
    return buildFormationScene(script, selectedFormationId.value, selectedNodeId.value, redDroneIds.value)
  }
  return buildScene(script, {
    timeSec: currentTime.value,
    highlightDrones: redDroneIds.value,
    selectedDrone: selectedDrone.value,
    showTrails: showTrails.value,
    trailDrone: trailDrone.value
  })
})
const scenePoints = computed(() => scenePayload.value.points)
const sceneLines = computed(() => scenePayload.value.lines)
const pickIds = computed(() => {
  if (isEditMode.value) {
    return script.formations.find((f) => f.id === selectedFormationId.value)?.nodes.map((n) => n.droneId ?? '') ?? []
  }
  return allDroneIds(script.droneCount)
})

const liveStates = computed(() => sampleAt(script, currentTime.value))
const liveStatesFiltered = computed(() =>
  liveStates.value.filter((s) => !droneKw.value || s.droneId.includes(droneKw.value.toUpperCase()))
)

// ---- 持久化 ----
function persist() {
  if (readonly) return
  store.saveScript(script)
}
watch(
  () => script.formations,
  () => persist(),
  { deep: true }
)

function onPick(id: string) {
  selectedDrone.value = id
  if (isEditMode.value) {
    const f = script.formations.find((x) => x.id === selectedFormationId.value)
    const node = f?.nodes.find((n) => n.droneId === id)
    if (node) selectedNodeId.value = node.id
    leftTab.value = 'formation'
  } else {
    leftTab.value = 'drones'
  }
}

function onSelectFormation(id: string) {
  selectedFormationId.value = id
  selectedNodeId.value = null
}
function onAddFormation(f: Formation) {
  script.formations.push(f)
  selectedFormationId.value = f.id
  persist()
}
function onRebindAll(formationId: string) {
  const f = script.formations.find((x) => x.id === formationId)
  if (!f) return
  rebindSequential(f)
  persist()
  ElMessage.success('已按节点顺序重新绑定 D001 起编号')
}

// ---- 关键帧 / 段 ----
const keyframesSorted = computed(() => sortedKeyframes(script))
const activeKeyframe = computed(() => script.keyframes.find((k) => k.id === selectedKeyframeId.value) ?? null)
const activeSegment = computed(() => script.segments.find((s) => s.id === selectedSegmentId.value) ?? null)
const kfTimeDraft = ref(0)
const segmentDurationDraft = ref(10)

watch(activeKeyframe, (kf) => {
  if (kf) kfTimeDraft.value = kf.timeSec
})
watch(activeSegment, (seg) => {
  if (seg) segmentDurationDraft.value = seg.durationSec
})

function kfLabelOf(id: string) {
  const kf = script.keyframes.find((k) => k.id === id)
  return kf ? `${KEYFRAME_LABEL[kf.type]}@${kf.timeSec}s` : '—'
}
function onSelectKeyframe(id: string) {
  selectedKeyframeId.value = id
  const kf = script.keyframes.find((k) => k.id === id)!
  // 同步选中进入该帧的段
  const seg = script.segments.find((s) => s.toKeyframeId === id)
  if (seg) selectedSegmentId.value = seg.id
  const f = script.formations.find((x) => x.id === kf.formationId)
  if (f) selectedFormationId.value = f.id
}
function onKfFormationChange() {
  const kf = activeKeyframe.value
  if (kf) selectedFormationId.value = kf.formationId
  persist()
}
function applyKfTime() {
  const kf = activeKeyframe.value
  if (!kf || readonly) return
  const old = kf.timeSec
  kf.timeSec = Math.min(duration.value, Math.max(0, kfTimeDraft.value))
  // 同步相邻段时长
  const segIn = script.segments.find((s) => s.toKeyframeId === kf.id)
  if (segIn) segIn.durationSec = Math.max(1, kf.timeSec - kfStart(segIn))
  const segOut = script.segments.find((s) => s.fromKeyframeId === kf.id)
  if (segOut) segOut.durationSec = Math.max(1, kfEnd(segOut) - kf.timeSec)
  void old
  persist()
}
function kfStart(seg: MotionSegment) {
  return script.keyframes.find((k) => k.id === seg.fromKeyframeId)?.timeSec ?? 0
}
function kfEnd(seg: MotionSegment) {
  return script.keyframes.find((k) => k.id === seg.toKeyframeId)?.timeSec ?? 0
}
function applySegmentDuration() {
  const seg = activeSegment.value
  if (!seg || readonly) return
  seg.durationSec = Math.max(1, segmentDurationDraft.value)
  const toKf = script.keyframes.find((k) => k.id === seg.toKeyframeId)!
  const fromKf = script.keyframes.find((k) => k.id === seg.fromKeyframeId)!
  toKf.timeSec = fromKf.timeSec + seg.durationSec
  kfTimeDraft.value = toKf.timeSec
  persist()
}
function onSegmentUpdate(seg: MotionSegment) {
  const i = script.segments.findIndex((s) => s.id === seg.id)
  if (i >= 0) script.segments[i] = seg
  persist()
}
function removeKeyframe() {
  const kf = activeKeyframe.value
  if (!kf) return
  ElMessageBox.confirm(`删除关键帧「${KEYFRAME_LABEL[kf.type]}」及其相邻段？`, '确认', { type: 'warning' })
    .then(() => {
      script.segments = script.segments.filter((s) => s.fromKeyframeId !== kf.id && s.toKeyframeId !== kf.id)
      script.keyframes = script.keyframes.filter((k) => k.id !== kf.id)
      selectedKeyframeId.value = null
      persist()
    })
    .catch(() => undefined)
}

// ---- 播放 ----
function togglePlay() {
  if (playing.value) {
    stopPlay(false)
    return
  }
  if (currentTime.value >= duration.value) currentTime.value = 0
  playing.value = true
  let last = performance.now()
  playTimer = window.setInterval(() => {
    const now = performance.now()
    const dt = (now - last) / 1000
    last = now
    currentTime.value += dt
    if (currentTime.value >= duration.value) {
      currentTime.value = duration.value
      stopPlay(false)
    }
  }, 50)
}
function stopPlay(reset = true) {
  playing.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
  if (reset) currentTime.value = 0
}
function onScrub(t: number) {
  currentTime.value = t
}
onBeforeUnmount(() => stopPlay(false))

// ---- 安全校验 ----
function runCheck() {
  checking.value = true
  setTimeout(() => {
    safety.value = runSafetyCheck(script)
    store.safetyCache[projectId] = safety.value
    checking.value = false
    if (safety.value.ok) {
      ElMessage.success('安全校验通过：速度与加速度均在限值内')
    } else {
      ElMessage.warning(`发现 ${safety.value.violations.length} 项超限，第一架：${safety.value.firstViolator?.droneId}`)
      leftTab.value = 'drones'
    }
  }, 60)
}
function jumpToViolation(v: Violation) {
  currentTime.value = Math.min(duration.value, v.timeSec)
  selectedDrone.value = v.droneId
  leftTab.value = 'drones'
}

// ---- 提交 ----
const submitVisible = ref(false)
const submitComment = ref('')
const submitting = ref(false)
function doSubmit() {
  submitting.value = true
  setTimeout(() => {
    const r = store.submitScript(projectId, submitComment.value || '（无备注）')
    submitting.value = false
    if (r.ok) {
      ElMessage.success('已提交，版本号已生成并记录操作人/时间')
      submitVisible.value = false
      submitComment.value = ''
      router.push({ name: 'planner-projects' })
    } else {
      ElMessage.error(r.error!)
    }
  }, 100)
}

// ---- PNG 导出 ----
const exportVisible = ref(false)
const exportFps = ref(5)
const exporting = ref(false)
const exportPct = ref(0)
async function doExport() {
  exporting.value = true
  exportPct.value = 0
  try {
    await exportPngSequence(script, exportFps.value, redDroneIds.value, (p) => {
      exportPct.value = Math.round((p.done / p.total) * 100)
    })
    ElMessage.success('PNG 序列帧 ZIP 已开始下载')
  } catch (e) {
    ElMessage.error('导出失败：' + (e as Error).message)
  } finally {
    exporting.value = false
  }
}
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.editor-body {
  margin: 0 !important;
  flex-wrap: nowrap !important;
}

.editor-body :deep(.el-col) {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* 三栏固定比例，窄屏不再纵向堆叠压扁画布 */
.editor-body :deep(.el-col-6) {
  flex: 0 0 24%;
  max-width: 24%;
}

.editor-body :deep(.el-col-12) {
  flex: 1 1 52%;
  max-width: none;
}

.canvas-host {
  height: 480px;
  padding: 8px;
  margin-bottom: 12px;
}

.canvas-host :deep(.scene-wrap) {
  height: 100%;
}

.drone-inspect {
  padding: 12px;
}

.drone-list {
  max-height: 560px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drone-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  background: var(--bg-panel-2);
}

.drone-card.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent) inset;
}

.drone-card.danger {
  border-color: var(--danger);
  background: rgba(255, 48, 64, 0.08);
}

.violation-list {
  max-height: 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.violation-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.violation-item:hover {
  border-color: var(--danger);
}

:deep(.el-result) {
  padding: 12px 0;
}

:deep(.el-result__title p),
:deep(.el-result__subtitle p) {
  font-size: 13px;
  color: var(--text-dim);
}
</style>
