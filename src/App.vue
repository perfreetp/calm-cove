<script setup>
import { computed, ref, provide } from 'vue'
import { useRoute } from 'vue-router'
import { navGroups } from './router'
import { state, activeProject, resetDemo, setActiveProject } from './store'

function switchProject(id) {
  setActiveProject(id)
  const p = state.projects.find((x) => x.id === id)
  if (p) toast(`切换到 ${p.lineCode} · ${p.name}`, 'info')
}

const route = useRoute()
const toasts = ref([])
let toastId = 0

function toast(message, tone = 'info', ms = 2800) {
  const id = ++toastId
  toasts.value.push({ id, message, tone })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, ms)
}

provide('toast', toast)

function confirmReset() {
  if (window.confirm('将清空本地所有立项、街区改造与工单记录，恢复初始演示数据。确定继续？')) {
    resetDemo()
    toast('已恢复初始演示数据', 'good')
  }
}

const statusText = computed(() => {
  const p = activeProject.value
  if (!p) return '未立项'
  return p.status === 'approved' ? '已立项' : '草稿'
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">
          <div class="brand-glyph">BL</div>
          <div>
            <div class="brand-title">站点营造</div>
            <div class="brand-sub">Bus Stop Studio</div>
          </div>
        </div>
      </div>

      <nav class="nav">
        <div v-for="g in navGroups" :key="g.title" class="nav-group">
          <div class="nav-group-title">{{ g.title }}</div>
          <router-link
            v-for="item in g.items"
            :key="item.path"
            :to="item.path"
            class="nav-item"
            :class="{ active: route.path === item.path }"
          >
            <span class="nav-idx">{{ item.idx }}</span>
            <span>
              <span class="nav-name">{{ item.name }}</span>
              <span class="nav-sub" style="display:block">{{ item.sub }}</span>
            </span>
            <span class="nav-role">{{ item.role }}</span>
          </router-link>
        </div>
      </nav>

      <div class="sidebar-foot">
        <div class="seed-chip">
          <span class="dot-live"></span>
          <span v-if="activeProject">{{ activeProject.seed }}</span>
          <span v-else>NO PROJECT</span>
        </div>
        <div>{{ statusText }} · 本地存储运行</div>
        <button class="btn btn-ghost btn-xs" style="margin-top:8px" @click="confirmReset">重置演示数据</button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <b>{{ route.meta.crumb || '' }}</b>
        </div>
        <select
          v-if="state.projects.length > 1"
          class="select"
          style="width: 230px; padding: 5px 9px; font-size: 11.5px"
          :value="state.activeProjectId"
          @change="switchProject($event.target.value)"
        >
          <option v-for="p in state.projects" :key="p.id" :value="p.id">
            {{ p.lineCode }} · {{ p.name }}（{{ p.stops.length }}站）
          </option>
        </select>
        <span v-else class="tag" :class="activeProject?.status === 'approved' ? 'good' : 'warn'">
          {{ activeProject?.lineCode || '—' }} · {{ activeProject?.name || '尚无线网立项' }}
        </span>
        <div class="topbar-right">
          <span class="tag idle mono">LOCAL · {{ state.orders.length }} 工单</span>
          <div class="user-pill">
            <span class="avatar">郑</span>
            <span>郑岚 · 主管</span>
          </div>
        </div>
      </header>

      <main class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>

    <div class="toast-wrap">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.tone">
        <span style="color:var(--amber)">◆</span>
        <span>{{ t.message }}</span>
      </div>
    </div>
  </div>
</template>
