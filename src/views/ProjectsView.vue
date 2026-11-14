<template>
  <div class="page">
    <h2>项目列表</h2>

    <div class="panel" v-if="state.role === 'client'">
      <h3 style="margin-top:0">客户下单 · 新建项目</h3>
      <div class="form-grid">
        <label class="f">项目名称<input v-model="form.name" placeholder="如：云溪山居民宿改造" /></label>
        <label class="f">客户姓名<input v-model="form.client" placeholder="如：陈先生" /></label>
        <label class="f">房型<input v-model="form.houseType" placeholder="如：夯土院落 / 山地木屋" /></label>
        <label class="f">面积（㎡）<input v-model="form.area" type="number" min="1" /></label>
        <label class="f">预算（元）<input v-model="form.budget" type="number" min="0" /></label>
        <label class="f">交付日期<input v-model="form.deadline" type="date" /></label>
        <label class="f">用途<input v-model="form.purpose" placeholder="如：精品民宿 / 自住度假" /></label>
        <label class="f">房间（逗号分隔）<input v-model="form.roomNames" placeholder="大堂, 客房A, 露台茶室" /></label>
      </div>
      <div class="row" style="margin-top:12px">
        <button class="primary" @click="create">创建项目</button>
        <span class="muted">创建后每个房间自动生成一个建模任务，可在项目详情中追加镜头任务</span>
      </div>
    </div>

    <div class="panel">
      <table>
        <thead>
          <tr>
            <th>项目</th><th>客户</th><th>房型</th><th>面积</th><th>预算</th>
            <th>交付日期</th><th>剩余天数</th><th>进度</th><th>状态</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in state.projects" :key="p.id" :class="{ overdue: store.isOverdue(p) }">
            <td>{{ p.name }}</td>
            <td>{{ p.client }}</td>
            <td>{{ p.houseType }}</td>
            <td>{{ p.area }}㎡</td>
            <td>¥{{ p.budget.toLocaleString() }}</td>
            <td>{{ p.deadline }}</td>
            <td>
              <span v-if="store.projectProgress(p.id).pct >= 100" class="ok-text">已完成</span>
              <span v-else-if="store.daysLeft(p.deadline) < 0" class="overdue-text">已逾期 {{ -store.daysLeft(p.deadline) }} 天</span>
              <span v-else>剩 {{ store.daysLeft(p.deadline) }} 天</span>
            </td>
            <td>
              <div class="row" style="gap:6px">
                <div class="progress"><i :style="{ width: store.projectProgress(p.id).pct + '%' }"></i></div>
                <span class="muted">{{ store.projectProgress(p.id).done }}/{{ store.projectProgress(p.id).total }}</span>
              </div>
            </td>
            <td>
              <span v-if="store.isOverdue(p)" class="tag bad">逾期</span>
              <span v-else-if="store.projectProgress(p.id).pct >= 100" class="tag approved">全部通过</span>
              <span v-else class="tag doing">进行中</span>
            </td>
            <td><RouterLink :to="`/projects/${p.id}`"><button class="sm">详情</button></RouterLink></td>
          </tr>
        </tbody>
      </table>
      <p v-if="!state.projects.length" class="muted">暂无项目，请切换到「客户」角色下单。</p>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'
import { store, state, today } from '../store.js'

const form = reactive({
  name: '', client: '', houseType: '', area: 200, budget: 500000,
  deadline: today(), purpose: '', roomNames: '大堂, 客房A'
})

function create() {
  if (!form.name || !form.client || !form.deadline) { alert('请填写项目名称、客户和交付日期'); return }
  store.createProject(form)
  Object.assign(form, { name: '', client: '', houseType: '', purpose: '', roomNames: '大堂, 客房A' })
}
</script>
