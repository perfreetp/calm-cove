<template>
  <div class="topbar">
    <div class="brand">山舍体素 · 民宿改造交付系统</div>
    <nav>
      <RouterLink to="/projects">项目</RouterLink>
      <RouterLink to="/tasks">任务大厅</RouterLink>
      <RouterLink to="/review">审核</RouterLink>
      <RouterLink to="/compare">版本比对</RouterLink>
      <RouterLink to="/delivery">交付中心</RouterLink>
      <RouterLink to="/dashboard">工作台</RouterLink>
    </nav>
    <div class="rolebox">
      <span class="muted" style="color:#a89f8f">角色</span>
      <select :value="state.role" @change="store.setRole($event.target.value)">
        <option value="client">客户</option>
        <option value="worker">制作员</option>
        <option value="supervisor">主管</option>
      </select>
      <template v-if="state.role === 'worker'">
        <span class="muted" style="color:#a89f8f">制作员</span>
        <select :value="state.user" @change="store.setUser($event.target.value)">
          <option v-for="u in state.users" :key="u" :value="u">{{ u }}</option>
        </select>
      </template>
    </div>
  </div>
  <RouterView />
</template>

<script setup>
import { store, state } from './store.js'
</script>
