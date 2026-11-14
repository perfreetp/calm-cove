<template>
  <el-container class="shell">
    <el-aside width="230px" class="aside">
      <div class="logo-row">
        <span class="logo">◈</span>
        <span class="sys-name">编队运营平台</span>
      </div>
      <el-menu :default-active="activeMenu" router class="menu" background-color="transparent" text-color="#8aa0c3"
        active-text-color="#ffffff">
        <el-menu-item index="/workbench">
          <el-icon><Monitor /></el-icon><span>工作台</span>
        </el-menu-item>

        <template v-if="role === 'planner'">
          <el-menu-item index="/planner/projects">
            <el-icon><EditPen /></el-icon><span>我的稿件 / 编排</span>
          </el-menu-item>
        </template>

        <template v-if="role === 'pilot'">
          <el-menu-item index="/pilot/schedule">
            <el-icon><Promotion /></el-icon><span>当天排期执行</span>
          </el-menu-item>
        </template>

        <template v-if="role === 'admin'">
          <el-sub-menu index="biz">
            <template #title><el-icon><OfficeBuilding /></el-icon><span>业务管理</span></template>
            <el-menu-item index="/admin/customers">客户与订单</el-menu-item>
            <el-menu-item index="/admin/projects">立项与稿件审核</el-menu-item>
          </el-sub-menu>
          <el-sub-menu index="ops">
            <template #title><el-icon><SetUp /></el-icon><span>运营保障</span></template>
            <el-menu-item index="/admin/airspace">空域申报</el-menu-item>
            <el-menu-item index="/admin/rehearsal">彩排记录</el-menu-item>
            <el-menu-item index="/admin/receipt">执行回执</el-menu-item>
          </el-sub-menu>
          <el-menu-item index="/admin/stats">
            <el-icon><DataAnalysis /></el-icon><span>统计看板</span>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="crumb">{{ pageTitle }}</div>
        <div class="flex-row">
          <el-tag :type="roleTagType" effect="dark">{{ roleLabel }}</el-tag>
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <el-avatar :size="28" style="background: var(--accent)">{{ user?.name.slice(0, 1) }}</el-avatar>
              {{ user?.name }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="reset">重置演示数据</el-dropdown-item>
                <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useStore } from '@/store'
import { ROLE_LABEL } from '@/lib/labels'

const route = useRoute()
const router = useRouter()
const store = useStore()
const user = computed(() => store.currentUser)
const role = computed(() => user.value?.role)
const roleLabel = computed(() => (role.value ? ROLE_LABEL[role.value] : ''))
const roleTagType = computed(() => (role.value === 'planner' ? 'primary' : role.value === 'pilot' ? 'success' : 'warning'))
const activeMenu = computed(() => route.path)
const pageTitle = computed(() => (route.meta.title as string) ?? '工作台')

function onCommand(cmd: string) {
  if (cmd === 'logout') {
    store.logout()
    router.push({ name: 'login' })
  } else if (cmd === 'reset') {
    ElMessageBox.confirm('将清空本地全部演示数据并恢复种子数据，确定？', '重置数据', { type: 'warning' })
      .then(() => {
        store.resetAll()
        ElMessage.success('已重置')
      })
      .catch(() => undefined)
  }
}
</script>

<style scoped>
.shell {
  height: 100vh;
}

.aside {
  background: var(--bg-panel);
  border-right: 1px solid var(--border);
}

.logo-row {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  border-bottom: 1px solid var(--border);
}

.logo {
  color: var(--accent);
  font-size: 24px;
  text-shadow: 0 0 16px rgba(76, 141, 255, 0.8);
}

.sys-name {
  font-weight: 700;
  font-size: 15px;
}

.menu {
  border-right: none;
}

.menu :deep(.el-menu-item),
.menu :deep(.el-sub-menu__title) {
  height: 46px;
}

.header {
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.crumb {
  font-weight: 700;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-main);
  outline: none;
}

.main {
  background: var(--bg-deep);
  padding: 18px;
}
</style>
