<template>
  <div class="page" v-if="p">
    <div class="row" style="justify-content:space-between">
      <h2>{{ p.name }}</h2>
      <div class="row">
        <span v-if="store.isOverdue(p)" class="tag bad">已逾期 {{ -store.daysLeft(p.deadline) }} 天</span>
        <span v-else class="tag">剩 {{ store.daysLeft(p.deadline) }} 天</span>
        <button class="primary" :disabled="!store.canDeliver(p.id)" @click="deliver">
          打包交付
        </button>
      </div>
    </div>
    <p class="muted" v-if="!store.canDeliver(p.id)">项目下所有任务审核通过后才能打包交付。</p>

    <div class="panel">
      <div class="form-grid">
        <div><div class="muted">客户</div>{{ p.client }}</div>
        <div><div class="muted">房型</div>{{ p.houseType }}</div>
        <div><div class="muted">面积</div>{{ p.area }}㎡</div>
        <div><div class="muted">预算</div>¥{{ p.budget.toLocaleString() }}</div>
        <div><div class="muted">交付日期</div>{{ p.deadline }}</div>
        <div><div class="muted">用途</div>{{ p.purpose }}</div>
      </div>
      <div class="row" style="margin-top:12px">
        <div class="progress" style="flex:1"><i :style="{ width: prog.pct + '%' }"></i></div>
        <span>{{ prog.done }}/{{ prog.total }} 项通过（{{ prog.pct }}%）</span>
      </div>
    </div>

    <div class="panel">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0">房间</h3>
        <div class="row" v-if="state.role !== 'client'">
          <input v-model="newRoom" placeholder="新房间名" style="width:140px" />
          <button class="sm" @click="addRoom">添加房间</button>
        </div>
      </div>
      <table>
        <thead><tr><th>房间</th><th>最新版本</th><th>版本数</th><th>面数</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rooms" :key="r.id">
            <td>{{ r.name }}</td>
            <td>{{ latest(r) ? 'v' + latest(r).n + '（' + statusText(latest(r).status) + '）' : '—' }}</td>
            <td>{{ store.versionsOf(r.id).length }}</td>
            <td>{{ latest(r) ? latest(r).faceCount : '—' }}</td>
            <td class="row">
              <RouterLink :to="`/compare?room=${r.id}`"><button class="sm">版本比对</button></RouterLink>
              <button class="sm" v-if="state.role !== 'client'" @click="addShot(r)">加镜头任务</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel">
      <h3 style="margin-top:0">任务</h3>
      <table>
        <thead><tr><th>任务</th><th>类型</th><th>房间</th><th>制作员</th><th>状态</th><th>返工次数</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in tasks" :key="t.id">
            <td>{{ t.title }}</td>
            <td><span class="tag">{{ t.kind === 'shot' ? '镜头' : '房间' }}</span></td>
            <td>{{ store.room(t.roomId)?.name }}</td>
            <td>{{ t.assignee || '—' }}</td>
            <td><span class="tag" :class="t.status">{{ statusText(t.status) }}</span></td>
            <td>{{ t.reworkCount }}</td>
            <td>
              <RouterLink v-if="t.assignee && t.status !== 'approved'" :to="`/editor/${t.id}`"><button class="sm">进建模器</button></RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" v-if="deliveries.length">
      <h3 style="margin-top:0">交付记录</h3>
      <table>
        <thead><tr><th>交付批次</th><th>日期</th><th>包含项</th></tr></thead>
        <tbody>
          <tr v-for="d in deliveries" :key="d.id">
            <td>{{ d.id }}</td><td>{{ d.at }}</td><td>{{ d.items.length }} 项</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { store, state } from '../store.js'

const route = useRoute()
const p = computed(() => store.project(route.params.id))
const rooms = computed(() => store.roomsOf(route.params.id))
const tasks = computed(() => store.tasksOf(route.params.id))
const deliveries = computed(() => store.deliveriesOf(route.params.id))
const prog = computed(() => store.projectProgress(route.params.id))
const newRoom = ref('')

function latest(r) { return store.latestVersion(r.id) }
function statusText(s) {
  return { open: '待领取', doing: '进行中', review: '待审核', approved: '已通过', pending: '待审核', rejected: '已打回' }[s] || s
}
function addRoom() {
  if (!newRoom.value.trim()) return
  store.addRoom(route.params.id, newRoom.value.trim())
  newRoom.value = ''
}
function addShot(r) {
  const title = prompt('镜头任务名称', `${r.name}·新镜头`)
  if (title) store.addShotTask(route.params.id, r.id, title)
}
function deliver() {
  const d = store.deliver(route.params.id)
  if (d) alert(`已打包交付 ${d.id}，共 ${d.items.length} 项，客户可在交付中心查看。`)
}
</script>
