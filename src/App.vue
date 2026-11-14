<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">本草<span class="tag">·</span> voxel 中药房体素排布审片系统</div>
      <nav>
        <RouterLink to="/">首页看板</RouterLink>
        <RouterLink to="/projects">方案管理</RouterLink>
      </nav>
      <div class="role-switch">
        当前身份
        <select :value="role" @change="changeRole($event.target.value)">
          <option v-for="r in ROLES" :key="r.key" :value="r.key">{{ r.label }}</option>
        </select>
      </div>
    </header>
    <RouterView />
    <div class="toast-wrap">
      <div v-for="t in toastState.items" :key="t.id" class="toast" :class="t.type">
        {{ t.message }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ROLES } from './lib/constants.js'
import { getRole, setRole } from './lib/store.js'
import { toastState } from './composables/useToast.js'

const role = ref(getRole())
function changeRole(r) {
  setRole(r)
  role.value = r
}
</script>
