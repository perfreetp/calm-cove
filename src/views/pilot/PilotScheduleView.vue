<template>
  <div>
    <h2 class="page-title">当天排期执行 · {{ today }}</h2>

    <el-alert type="info" :closable="false" show-icon style="margin-bottom: 14px"
      title="飞手仅可见分配给自己的当天场次；可确认执行、回报异常与提交执行回执，不能修改编排稿件。" />

    <div class="panel" v-if="schedules.length">
      <el-table :data="schedules" size="small" :row-class-name="rowClass">
        <el-table-column label="时间" width="140">
          <template #default="{ row }">{{ row.startAt }} - {{ row.endAt }}</template>
        </el-table-column>
        <el-table-column label="演出项目" min-width="200">
          <template #default="{ row }">
            <b>{{ projectOf(row.projectId)?.title }}</b>
            <div class="dim">{{ projectOf(row.projectId)?.projectNo }} · {{ row.venue }}</div>
          </template>
        </el-table-column>
        <el-table-column label="架数" width="80">
          <template #default="{ row }">{{ projectOf(row.projectId)?.droneCount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="tag(row.status)" size="small">{{ label(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="360">
          <template #default="{ row }">
            <el-button size="small" @click="preview(row)">脚本预览（只读）</el-button>
            <el-button size="small" type="primary" :disabled="row.status !== 'scheduled'"
              @click="confirm(row)">确认执行</el-button>
            <el-button size="small" type="warning" :disabled="!canOperate(row)" @click="openAnomaly(row)">
              回报异常
            </el-button>
            <el-button size="small" type="success" :disabled="row.status !== 'executing'" @click="openReceipt(row)">
              执行回执
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <el-empty v-else description="今天没有分配给你的场次" />

    <div class="panel" v-if="anomalies.length">
      <div class="panel-title">本场异常记录</div>
      <el-table :data="anomalies" size="small">
        <el-table-column prop="droneId" label="无人机" width="100" />
        <el-table-column label="类型" width="150">
          <template #default="{ row }">{{ ANOMALY_TYPE_LABEL[row.type] }}</template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag :type="row.level === 'serious' ? 'danger' : 'warning'" size="small">
              {{ row.level === 'serious' ? '严重' : '警告' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="detail" label="描述" min-width="220" />
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.at) }}</template>
        </el-table-column>
        <el-table-column label="处置" width="90">
          <template #default="{ row }">
            <el-tag :type="row.handled ? 'success' : 'info'" size="small">{{ row.handled ? '已处置' : '待处置' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 异常回报 -->
    <el-dialog v-model="anomalyVisible" title="回报现场异常" width="480px">
      <el-form label-width="92px">
        <el-form-item label="无人机编号">
          <el-select v-model="anomalyForm.droneId" filterable placeholder="选择或输入编号" style="width: 100%"
            allow-create default-first-option>
            <el-option v-for="id in droneIds" :key="id" :value="id" :label="id" />
          </el-select>
        </el-form-item>
        <el-form-item label="异常类型">
          <el-select v-model="anomalyForm.type" style="width: 100%">
            <el-option v-for="(label, key) in ANOMALY_TYPE_LABEL" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-radio-group v-model="anomalyForm.level">
            <el-radio value="warn">警告（可继续观察）</el-radio>
            <el-radio value="serious">严重（需立即处置）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="详细描述">
          <el-input v-model="anomalyForm.detail" type="textarea" :rows="3" placeholder="现象、发生时刻、已采取措施" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="anomalyVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAnomaly">提交回报</el-button>
      </template>
    </el-dialog>

    <!-- 执行回执 -->
    <el-dialog v-model="receiptVisible" title="执行回执（按场次统计）" width="500px">
      <el-form label-width="110px">
        <el-form-item label="开始时间">
          <el-time-picker v-model="receiptForm.startedAt" format="HH:mm" value-format="HH:mm" placeholder="开始" />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-time-picker v-model="receiptForm.endedAt" format="HH:mm" value-format="HH:mm" placeholder="结束" />
        </el-form-item>
        <el-form-item label="实际起飞架次">
          <el-input-number v-model="receiptForm.sorties" :min="0" :max="projectOf(currentSchedule?.projectId ?? '')?.droneCount ?? 999" />
        </el-form-item>
        <el-form-item label="用机时长(分钟)">
          <el-input-number v-model="receiptForm.flightMinutes" :min="0" :max="600" />
        </el-form-item>
        <el-form-item label="异常次数">
          <el-input-number v-model="receiptForm.anomalyCount" :min="0" />
          <span class="dim" style="margin-left: 8px">本场已回报 {{ currentAnomalyCount }} 次</span>
        </el-form-item>
        <el-form-item label="执行总结">
          <el-input v-model="receiptForm.summary" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="receiptVisible = false">取消</el-button>
        <el-button type="success" @click="submitReceipt">提交回执并结场</el-button>
      </template>
    </el-dialog>

    <ScriptPreviewDialog v-model="previewVisible" :script="previewScript" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStore } from '@/store'
import { TODAY } from '@/db/seed'
import { allDroneIds } from '@/lib/geometry'
import { ANOMALY_TYPE_LABEL, fmtDateTime } from '@/lib/labels'
import type { Schedule, ShowScript } from '@/types'
import ScriptPreviewDialog from '@/components/pilot/ScriptPreviewDialog.vue'

const store = useStore()
const user = store.currentUser!
const today = TODAY

const schedules = computed(() =>
  store.schedules
    .filter((s) => s.pilotId === user.id && s.showDate === today)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
)
const projectOf = (id: string) => store.projectOf(id)

function label(s: string) {
  return { scheduled: '待确认', confirmed: '已确认', executing: '执行中', done: '已完成', aborted: '已中止' }[s] ?? s
}
function tag(s: string): 'info' | 'warning' | 'primary' | 'success' | 'danger' {
  return ({ scheduled: 'info', confirmed: 'warning', executing: 'primary', done: 'success', aborted: 'danger' } as const)[s as 'scheduled']
}
function rowClass({ row }: { row: Schedule }) {
  return row.status === 'executing' ? 'row-executing' : ''
}
function canOperate(row: Schedule) {
  return row.status === 'confirmed' || row.status === 'executing'
}

function confirm(row: Schedule) {
  ElMessageBox.confirm(`确认执行「${projectOf(row.projectId)?.title}」${row.startAt} 场次？确认后将进入待起飞状态。`, '确认执行', {
    type: 'warning'
  })
    .then(() => {
      const r = store.confirmSchedule(row.id)
      if (r.ok) ElMessage.success('已确认执行')
      else ElMessage.error(r.error!)
    })
    .catch(() => undefined)
}

// 开始执行（确认后提供入口）
function ensureExecuting(row: Schedule) {
  if (row.status === 'confirmed') store.startSchedule(row.id)
}

// ---- 预览 ----
const previewVisible = ref(false)
const previewScript = ref<ShowScript | null>(null)
function preview(row: Schedule) {
  previewScript.value = store.scriptOf(row.projectId) ?? null
  previewVisible.value = true
}

// ---- 异常 ----
const anomalyVisible = ref(false)
const currentSchedule = ref<Schedule | null>(null)
const droneIds = computed(() => {
  const p = projectOf(currentSchedule.value?.projectId ?? '')
  return p ? allDroneIds(p.droneCount) : []
})
const anomalyForm = reactive({ droneId: '', type: 'comm_lost', level: 'warn', detail: '' })
function openAnomaly(row: Schedule) {
  ensureExecuting(row)
  currentSchedule.value = row
  Object.assign(anomalyForm, { droneId: droneIds.value[0] ?? '', type: 'comm_lost', level: 'warn', detail: '' })
  anomalyVisible.value = true
}
function submitAnomaly() {
  if (!currentSchedule.value || !anomalyForm.droneId || !anomalyForm.detail) {
    ElMessage.warning('请填写无人机编号与异常描述')
    return
  }
  store.reportAnomaly({
    projectId: currentSchedule.value.projectId,
    scheduleId: currentSchedule.value.id,
    droneId: anomalyForm.droneId,
    type: anomalyForm.type as never,
    level: anomalyForm.level as 'warn' | 'serious',
    detail: anomalyForm.detail
  })
  anomalyVisible.value = false
  ElMessage.success('异常已回报，后台同步可见')
}
const anomalies = computed(() =>
  store.anomalies.filter((a) => schedules.value.some((s) => s.id === a.scheduleId))
)

// ---- 回执 ----
const receiptVisible = ref(false)
const receiptForm = reactive({ startedAt: '', endedAt: '', sorties: 0, flightMinutes: 0, anomalyCount: 0, summary: '' })
const currentAnomalyCount = computed(() =>
  currentSchedule.value ? store.anomalies.filter((a) => a.scheduleId === currentSchedule.value!.id).length : 0
)
function openReceipt(row: Schedule) {
  currentSchedule.value = row
  const p = projectOf(row.projectId)
  Object.assign(receiptForm, {
    startedAt: row.startAt,
    endedAt: row.endAt,
    sorties: p?.droneCount ?? 0,
    flightMinutes: 30,
    anomalyCount: currentAnomalyCount.value,
    summary: ''
  })
  receiptVisible.value = true
}
function submitReceipt() {
  if (!currentSchedule.value) return
  const row = currentSchedule.value
  const r = store.finishSchedule(row.id, {
    projectId: row.projectId,
    scheduleId: row.id,
    startedAt: `${today}T${receiptForm.startedAt}:00`,
    endedAt: `${today}T${receiptForm.endedAt}:00`,
    sorties: receiptForm.sorties,
    flightMinutes: receiptForm.flightMinutes,
    anomalyCount: receiptForm.anomalyCount,
    summary: receiptForm.summary || '现场执行完成'
  })
  if (r.ok) {
    ElMessage.success('回执已提交，场次统计已生成')
    receiptVisible.value = false
  } else {
    ElMessage.error(r.error!)
  }
}
</script>

<style scoped>
:deep(.row-executing) {
  background: rgba(76, 141, 255, 0.1) !important;
}
</style>
