<template>
  <div class="page">
    <h2>工作台</h2>

    <div class="panel">
      <h3 style="margin-top:0">制作员绩效</h3>
      <table>
        <thead><tr><th>制作员</th><th>在手项数</th><th>平均返工次数</th><th>准时交付率</th><th>累计通过</th></tr></thead>
        <tbody>
          <tr v-for="w in stats" :key="w.user">
            <td>{{ w.user }}</td>
            <td>{{ w.inHand }}</td>
            <td :class="{ 'overdue-text': +w.avgRework > 1 }">{{ w.avgRework }}</td>
            <td>{{ w.onTimeRate }}</td>
            <td>{{ w.approved }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h3 style="margin-top:0">逾期项目</h3>
      <table v-if="overdue.length">
        <thead><tr><th>项目</th><th>客户</th><th>交付日期</th><th>剩余天数</th><th>进度</th></tr></thead>
        <tbody>
          <tr v-for="p in overdue" :key="p.id" class="overdue">
            <td>{{ p.name }}</td>
            <td>{{ p.client }}</td>
            <td>{{ p.deadline }}</td>
            <td class="overdue-text">已逾期 {{ -store.daysLeft(p.deadline) }} 天</td>
            <td>{{ store.projectProgress(p.id).pct }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted" style="margin:0">暂无逾期项目。</p>
    </div>

    <div class="panel">
      <h3 style="margin-top:0">全部项目一览</h3>
      <table>
        <thead><tr><th>项目</th><th>交付日期</th><th>剩余天数</th><th>进度</th><th>交付批次</th></tr></thead>
        <tbody>
          <tr v-for="p in state.projects" :key="p.id" :class="{ overdue: store.isOverdue(p) }">
            <td>{{ p.name }}</td>
            <td>{{ p.deadline }}</td>
            <td>
              <span v-if="store.daysLeft(p.deadline) < 0" class="overdue-text">已逾期 {{ -store.daysLeft(p.deadline) }} 天</span>
              <span v-else>剩 {{ store.daysLeft(p.deadline) }} 天</span>
            </td>
            <td>{{ store.projectProgress(p.id).done }}/{{ store.projectProgress(p.id).total }}</td>
            <td>{{ store.deliveriesOf(p.id).length }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, state } from '../store.js'

const stats = computed(() => store.workerStats())
const overdue = computed(() => state.projects.filter(p => store.isOverdue(p)))
</script>
