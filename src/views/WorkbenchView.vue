<template>
  <div>
    <h2 class="page-title">工作台 · {{ user?.name }}</h2>

    <!-- 策划视角 -->
    <template v-if="role === 'planner'">
      <el-row :gutter="14">
        <el-col :span="6"><div class="stat panel"><div class="num">{{ myProjects.length }}</div><div class="dim">我的稿件</div></div></el-col>
        <el-col :span="6"><div class="stat panel"><div class="num">{{ countStatus('in_progress') }}</div><div class="dim">在制中</div></div></el-col>
        <el-col :span="6"><div class="stat panel warn-text"><div class="num">{{ countStatus('returned') }}</div><div class="dim">被退回待改</div></div></el-col>
        <el-col :span="6"><div class="stat panel danger-text"><div class="num">{{ overdueMine }}</div><div class="dim">已延期</div></div></el-col>
      </el-row>
      <div class="panel">
        <div class="panel-title">我的稿件列表</div>
        <el-table :data="myProjects" size="small" @row-click="(r: Project) => open(r)">
          <el-table-column prop="projectNo" label="编号" width="100" />
          <el-table-column prop="title" label="演出名称" min-width="220" />
          <el-table-column prop="droneCount" label="架数" width="80" />
          <el-table-column prop="showDate" label="演出日期" width="120" />
          <el-table-column prop="deadline" label="交稿截止" width="120">
            <template #default="{ row }">
              <span :class="{ 'danger-text': isOverdue(row) }">{{ row.deadline }}</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="STATUS_TYPE[row.status as DraftStatus]" size="small">{{ STATUS_LABEL[row.status as DraftStatus] }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button link type="primary" @click.stop="open(row)">
                {{ row.status === 'returned' ? '继续修改' : row.status === 'approved' ? '查看（只读）' : '进入编排' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- 飞手视角 -->
    <template v-else-if="role === 'pilot'">
      <el-row :gutter="14">
        <el-col :span="6"><div class="stat panel"><div class="num">{{ todaySchedules.length }}</div><div class="dim">今日场次</div></div></el-col>
        <el-col :span="6"><div class="stat panel"><div class="num">{{ pendingCount }}</div><div class="dim">待确认</div></div></el-col>
        <el-col :span="6"><div class="stat panel warn-text"><div class="num">{{ myAnomalies.length }}</div><div class="dim">我上报的异常</div></div></el-col>
        <el-col :span="6"><div class="stat panel"><div class="num">{{ doneCount }}</div><div class="dim">已完成场次</div></div></el-col>
      </el-row>
      <div class="panel">
        <div class="panel-title">今日（{{ today }}）排期</div>
        <el-empty v-if="!todaySchedules.length" description="今天没有排期" />
        <el-table v-else :data="todaySchedules" size="small" @row-click="(r: Schedule) => $router.push('/pilot/schedule')">
          <el-table-column label="时间" width="130">
            <template #default="{ row }">{{ row.startAt }} - {{ row.endAt }}</template>
          </el-table-column>
          <el-table-column label="演出">
            <template #default="{ row }">{{ projectTitle(row.projectId) }}</template>
          </el-table-column>
          <el-table-column prop="venue" label="场地" min-width="160" />
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="scheduleTag(row.status)" size="small">{{ scheduleLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <!-- 后台视角 -->
    <template v-else>
      <el-row :gutter="14">
        <el-col :span="6"><div class="stat panel"><div class="num">{{ store.orders.length }}</div><div class="dim">订单总数</div></div></el-col>
        <el-col :span="6"><div class="stat panel warn-text"><div class="num">{{ pendingReview }}</div><div class="dim">待审稿件</div></div></el-col>
        <el-col :span="6"><div class="stat panel danger-text"><div class="num">{{ airspacePending }}</div><div class="dim">空域未批复</div></div></el-col>
        <el-col :span="6"><div class="stat panel"><div class="num">{{ totalSorties }}</div><div class="dim">累计编队架次</div></div></el-col>
      </el-row>

      <div class="panel">
        <div class="panel-title">策划工作负荷</div>
        <el-table :data="store.plannerWorkload" size="small">
          <el-table-column prop="plannerName" label="策划" />
          <el-table-column prop="inProgress" label="在制稿数量" width="140" />
          <el-table-column label="延期稿数" width="140">
            <template #default="{ row }">
              <span :class="{ 'danger-text': row.overdue > 0 }">{{ row.overdue }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="panel">
        <div class="panel-title">待办动态（最近版本记录）</div>
        <el-timeline>
          <el-timeline-item v-for="v in recentVersions" :key="v.id" :timestamp="fmtDateTime(v.at)"
            :type="v.action === 'return' ? 'danger' : v.action === 'approve' ? 'success' : 'primary'">
            <el-tag size="small" style="margin-right: 8px">{{ VERSION_ACTION_LABEL[v.action] }}</el-tag>
            <b>{{ projectTitle(v.projectId) }}</b> · v{{ v.version }} · {{ v.operatorName }}
            <div class="dim">{{ v.comment }}<span v-if="v.returnReason">（退回原因：{{ v.returnReason }}）</span></div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@/store'
import { TODAY } from '@/db/seed'
import { fmtDateTime, STATUS_LABEL, STATUS_TYPE, VERSION_ACTION_LABEL } from '@/lib/labels'
import type { DraftStatus, Project, Schedule } from '@/types'

const router = useRouter()
const store = useStore()
const user = computed(() => store.currentUser!)
const role = computed(() => user.value.role)
const today = TODAY

const myProjects = computed(() => store.projects.filter((p) => p.plannerId === user.value.id))
const countStatus = (s: DraftStatus) => myProjects.value.filter((p) => p.status === s).length
const isOverdue = (p: Project) => (p.status === 'in_progress' || p.status === 'returned') && p.deadline < today
const overdueMine = computed(() => myProjects.value.filter((p) => isOverdue(p)).length)

function open(p: Project) {
  if (p.status === 'approved' || p.status === 'completed') {
    router.push({ name: 'editor', params: { projectId: p.id }, query: { readonly: '1' } })
  } else {
    router.push({ name: 'editor', params: { projectId: p.id } })
  }
}

const todaySchedules = computed(() =>
  store.schedules.filter((s) => s.pilotId === user.value.id && s.showDate === today)
)
const pendingCount = computed(() => todaySchedules.value.filter((s) => s.status === 'scheduled').length)
const doneCount = computed(() => todaySchedules.value.filter((s) => s.status === 'done').length)
const myAnomalies = computed(() => store.anomalies.filter((a) => a.pilotId === user.value.id))
function projectTitle(id: string) {
  return store.projectOf(id)?.title ?? '—'
}
function scheduleLabel(s: string) {
  return { scheduled: '待确认', confirmed: '已确认', executing: '执行中', done: '已完成', aborted: '已中止' }[s] ?? s
}
function scheduleTag(s: string): 'info' | 'warning' | 'primary' | 'success' | 'danger' {
  return ({ scheduled: 'info', confirmed: 'warning', executing: 'primary', done: 'success', aborted: 'danger' } as const)[s as 'scheduled']
}

const pendingReview = computed(() => store.projects.filter((p) => p.status === 'submitted').length)
const airspacePending = computed(() => store.airspace.filter((a) => a.stage !== 'approved' && a.stage !== 'rejected').length)
const totalSorties = computed(() => store.receipts.reduce((s, r) => s + r.sorties, 0))
const recentVersions = computed(() =>
  [...store.versions].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
)
</script>

<style scoped>
.stat {
  text-align: center;
  padding: 20px 10px;
}

.stat .num {
  font-size: 30px;
  font-weight: 800;
  color: var(--accent);
}

.warn-text .num {
  color: var(--warn);
}

.danger-text {
  color: var(--danger);
}

.danger-text .num,
.stat.danger-text .num {
  color: var(--danger);
}
</style>
