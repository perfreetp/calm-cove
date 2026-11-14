<template>
  <div>
    <h2 class="page-title">统计看板</h2>

    <el-row :gutter="14">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">策划工作负荷（在制稿 / 延期稿）</div>
          <div ref="workloadChart" style="height: 320px"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">稿件状态分布</div>
          <div ref="statusChart" style="height: 320px"></div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="14" style="margin-top: 14px">
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">各场次编队架次 / 用机时长</div>
          <div ref="sortieChart" style="height: 320px"></div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="panel">
          <div class="panel-title">异常类型分布</div>
          <div ref="anomalyChart" style="height: 320px"></div>
        </div>
      </el-col>
    </el-row>

    <div class="panel" style="margin-top: 14px">
      <div class="panel-title">策划明细表</div>
      <el-table :data="store.plannerWorkload" size="small">
        <el-table-column prop="plannerName" label="策划" />
        <el-table-column prop="inProgress" label="在制稿数量" width="140" />
        <el-table-column label="延期稿数" width="140">
          <template #default="{ row }">
            <el-tag :type="row.overdue > 0 ? 'danger' : 'info'" size="small">{{ row.overdue }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="累计已完成项目" width="160">
          <template #default="{ row }">{{ completedOf(row.plannerId) }}</template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import * as echarts from 'echarts'
import { useStore } from '@/store'
import { ANOMALY_TYPE_LABEL, STATUS_LABEL } from '@/lib/labels'

const store = useStore()
const workloadChart = ref<HTMLDivElement>()
const statusChart = ref<HTMLDivElement>()
const sortieChart = ref<HTMLDivElement>()
const anomalyChart = ref<HTMLDivElement>()
const charts: echarts.ECharts[] = []

const dark = {
  backgroundColor: 'transparent',
  textStyle: { color: '#8aa0c3' }
}

function completedOf(plannerId: string) {
  return store.projects.filter((p) => p.plannerId === plannerId && p.status === 'completed').length
}

onMounted(() => {
  // 工作负荷
  const c1 = echarts.init(workloadChart.value!)
  c1.setOption({
    ...dark,
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#8aa0c3' }, top: 0 },
    grid: { top: 44, left: 40, right: 20, bottom: 30 },
    xAxis: { type: 'category', data: store.plannerWorkload.map((w) => w.plannerName), axisLabel: { color: '#8aa0c3' } },
    yAxis: { type: 'value', axisLabel: { color: '#8aa0c3' }, splitLine: { lineStyle: { color: '#1e2d49' } } },
    series: [
      { name: '在制稿数量', type: 'bar', data: store.plannerWorkload.map((w) => w.inProgress), itemStyle: { color: '#4c8dff' } },
      { name: '延期稿数', type: 'bar', data: store.plannerWorkload.map((w) => w.overdue), itemStyle: { color: '#ff3040' } }
    ]
  })
  charts.push(c1)

  // 状态分布
  const c2 = echarts.init(statusChart.value!)
  const statusKeys = Object.keys(STATUS_LABEL)
  c2.setOption({
    ...dark,
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#8aa0c3' } },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      data: statusKeys.map((k) => ({
        name: STATUS_LABEL[k as keyof typeof STATUS_LABEL],
        value: store.projects.filter((p) => p.status === k).length
      })),
      label: { color: '#dce6f7' }
    }]
  })
  charts.push(c2)

  // 架次/时长
  const c3 = echarts.init(sortieChart.value!)
  const rcpts = store.receipts
  c3.setOption({
    ...dark,
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#8aa0c3' }, top: 0 },
    grid: { top: 44, left: 50, right: 50, bottom: 60 },
    xAxis: {
      type: 'category',
      data: rcpts.map((r) => store.projectOf(r.projectId)?.projectNo ?? '—'),
      axisLabel: { color: '#8aa0c3', rotate: 20 }
    },
    yAxis: [
      { type: 'value', name: '架次', axisLabel: { color: '#8aa0c3' }, splitLine: { lineStyle: { color: '#1e2d49' } } },
      { type: 'value', name: '分钟', axisLabel: { color: '#8aa0c3' } }
    ],
    series: [
      { name: '编队架次', type: 'bar', data: rcpts.map((r) => r.sorties), itemStyle: { color: '#2fce7d' } },
      { name: '用机时长(分)', type: 'line', yAxisIndex: 1, data: rcpts.map((r) => r.flightMinutes), itemStyle: { color: '#ffb020' } }
    ]
  })
  charts.push(c3)

  // 异常类型
  const c4 = echarts.init(anomalyChart.value!)
  const keys = Object.keys(ANOMALY_TYPE_LABEL)
  c4.setOption({
    ...dark,
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      roseType: 'radius',
      radius: ['25%', '70%'],
      data: keys.map((k) => ({
        name: ANOMALY_TYPE_LABEL[k],
        value: store.anomalies.filter((a) => a.type === k).length
      })).filter((d) => d.value > 0),
      label: { color: '#dce6f7' }
    }]
  })
  charts.push(c4)

  window.addEventListener('resize', resizeAll)
})

function resizeAll() {
  charts.forEach((c) => c.resize())
}

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeAll)
  charts.forEach((c) => c.dispose())
})
</script>
