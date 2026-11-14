<template>
  <div>
    <h2 class="page-title">执行回执 · 按场次统计</h2>

    <el-row :gutter="14" style="margin-bottom: 14px">
      <el-col :span="6">
        <div class="panel stat-card"><div class="num">{{ total.sessions }}</div><div class="dim">演出场次</div></div>
      </el-col>
      <el-col :span="6">
        <div class="panel stat-card"><div class="num">{{ total.sorties }}</div><div class="dim">编队架次合计</div></div>
      </el-col>
      <el-col :span="6">
        <div class="panel stat-card"><div class="num">{{ total.flightMinutes }}</div><div class="dim">用机时长合计(分钟)</div></div>
      </el-col>
      <el-col :span="6">
        <div class="panel stat-card danger"><div class="num">{{ total.anomalies }}</div><div class="dim">异常次数合计</div></div>
      </el-col>
    </el-row>

    <div class="panel">
      <div class="panel-title">按演出场次汇总</div>
      <el-table :data="perProject" size="small">
        <el-table-column label="项目" min-width="200">
          <template #default="{ row }">
            <b>{{ store.projectOf(row.projectId)?.title ?? '—' }}</b>
            <div class="dim">{{ store.projectOf(row.projectId)?.projectNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="sessions" label="场次" width="90" />
        <el-table-column prop="sorties" label="编队架次" width="110" />
        <el-table-column prop="flightMinutes" label="用机时长(分)" width="130" />
        <el-table-column prop="anomalies" label="异常次数" width="110">
          <template #default="{ row }">
            <span :class="{ 'danger-text': row.anomalies > 0 }">{{ row.anomalies }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="panel">
      <div class="panel-title">回执明细</div>
      <el-table :data="store.receipts" size="small">
        <el-table-column label="项目" min-width="180">
          <template #default="{ row }">{{ store.projectOf(row.projectId)?.title ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="开始" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.startedAt) }}</template>
        </el-table-column>
        <el-table-column label="结束" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.endedAt) }}</template>
        </el-table-column>
        <el-table-column prop="sorties" label="架次" width="80" />
        <el-table-column prop="flightMinutes" label="用机(分)" width="100" />
        <el-table-column prop="anomalyCount" label="异常" width="80" />
        <el-table-column label="回执飞手" width="120">
          <template #default="{ row }">{{ store.userName(row.operatorId) }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="总结" min-width="200" />
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '@/store'
import { fmtDateTime } from '@/lib/labels'

const store = useStore()

const perProject = computed(() => {
  const ids = [...new Set(store.receipts.map((r) => r.projectId))]
  return ids.map((projectId) => ({ projectId, ...store.statsByProject(projectId) }))
})

const total = computed(() => ({
  sessions: store.receipts.length,
  sorties: store.receipts.reduce((s, r) => s + r.sorties, 0),
  flightMinutes: store.receipts.reduce((s, r) => s + r.flightMinutes, 0),
  anomalies: store.receipts.reduce((s, r) => s + r.anomalyCount, 0)
}))
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 18px 8px;
}

.stat-card .num {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
}

.stat-card.danger .num {
  color: var(--danger);
}
</style>
