<template>
  <div class="page">
    <h2>任务大厅</h2>

    <div class="panel">
      <h3 style="margin-top:0">可领取任务（按房间 / 镜头）</h3>
      <table>
        <thead><tr><th>任务</th><th>类型</th><th>项目</th><th>房间</th><th>交付日期</th><th>剩余天数</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in open" :key="t.id">
            <td>{{ t.title }}</td>
            <td><span class="tag">{{ t.kind === 'shot' ? '镜头' : '房间' }}</span></td>
            <td>{{ store.project(t.projectId)?.name }}</td>
            <td>{{ store.room(t.roomId)?.name }}</td>
            <td>{{ store.project(t.projectId)?.deadline }}</td>
            <td :class="{ 'overdue-text': store.daysLeft(store.project(t.projectId).deadline) < 0 }">
              {{ leftText(t) }}
            </td>
            <td>
              <button class="sm primary" :disabled="state.role !== 'worker'" @click="claim(t)">领取</button>
            </td>
          </tr>
          <tr v-if="!open.length"><td colspan="7" class="muted">暂无可领取任务</td></tr>
        </tbody>
      </table>
      <p class="muted" v-if="state.role !== 'worker'">请切换为「制作员」角色领取任务。</p>
    </div>

    <div class="panel">
      <h3 style="margin-top:0">我的在手任务（{{ state.user }}）</h3>
      <table>
        <thead><tr><th>任务</th><th>类型</th><th>项目</th><th>状态</th><th>返工次数</th><th>审核意见</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in mine" :key="t.id">
            <td>{{ t.title }}</td>
            <td><span class="tag">{{ t.kind === 'shot' ? '镜头' : '房间' }}</span></td>
            <td>{{ store.project(t.projectId)?.name }}</td>
            <td><span class="tag" :class="t.status">{{ statusText(t.status) }}</span></td>
            <td>{{ t.reworkCount }}</td>
            <td class="muted">{{ lastComment(t) }}</td>
            <td><RouterLink :to="`/editor/${t.id}`"><button class="sm primary">进建模器</button></RouterLink></td>
          </tr>
          <tr v-if="!mine.length"><td colspan="7" class="muted">暂无在手任务</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, state } from '../store.js'

const open = computed(() => store.openTasks())
const mine = computed(() => store.myTasks())

function claim(t) {
  store.claimTask(t.id)
}
function leftText(t) {
  const d = store.daysLeft(store.project(t.projectId).deadline)
  return d < 0 ? `已逾期 ${-d} 天` : `剩 ${d} 天`
}
function statusText(s) {
  return { doing: '进行中', review: '待审核', approved: '已通过' }[s] || s
}
function lastComment(t) {
  const vs = store.versionsOf(t.roomId, t.kind === 'shot' ? 'shot' : 'room')
  const rejected = vs.find(v => v.review && !v.review.pass && v.taskId === t.id)
  return rejected ? rejected.review.comment : ''
}
</script>
