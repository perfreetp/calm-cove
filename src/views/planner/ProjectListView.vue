<template>
  <div>
    <h2 class="page-title">我的稿件</h2>
    <div class="toolbar">
      <el-input v-model="kw" placeholder="搜索演出名称 / 编号" clearable style="width: 260px" :prefix-icon="Search" />
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 160px">
        <el-option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key" :label="label" />
      </el-select>
    </div>
    <div class="panel">
      <el-table :data="filtered" size="small">
        <el-table-column prop="projectNo" label="项目编号" width="110" />
        <el-table-column prop="title" label="演出名称" min-width="220" />
        <el-table-column prop="droneCount" label="编队架数" width="100" />
        <el-table-column prop="showDate" label="演出日期" width="120" />
        <el-table-column label="交稿截止" width="120">
          <template #default="{ row }">
            <span :class="{ 'danger-text': isOverdue(row) }">{{ row.deadline }}</span>
            <el-tag v-if="isOverdue(row)" type="danger" size="small" style="margin-left: 4px">延期</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status as DraftStatus]" size="small">{{ STATUS_LABEL[row.status as DraftStatus] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="安全校验" width="110">
          <template #default="{ row }">
            <el-tag v-if="safetyOf(row.id)?.ok === false" type="danger" size="small">
              {{ safetyOf(row.id)!.violations.length }} 项超限
            </el-tag>
            <el-tag v-else-if="safetyOf(row.id)" type="success" size="small">通过</el-tag>
            <span v-else class="dim">未校验</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button link type="primary" @click="open(row)">
              {{ row.status === 'returned' ? '继续修改' : row.status === 'approved' || row.status === 'completed' ? '查看' : '进入编排' }}
            </el-button>
            <el-button link @click="showHistory(row)">版本记录</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="historyVisible" title="版本与操作记录" size="46%">
      <el-timeline v-if="current">
        <el-timeline-item v-for="v in store.versionsOf(current.id)" :key="v.id" :timestamp="fmtDateTime(v.at)"
          :type="v.action === 'return' ? 'danger' : v.action === 'approve' ? 'success' : 'primary'">
          <el-tag size="small" style="margin-right: 8px">v{{ v.version }} · {{ VERSION_ACTION_LABEL[v.action] }}</el-tag>
          {{ v.operatorName }}
          <p style="margin: 6px 0 0">{{ v.comment }}</p>
          <p v-if="v.returnReason" style="margin: 4px 0 0; color: var(--danger)">
            退回原因（{{ v.returnBy === 'customer' ? '客户' : '主管' }}）：{{ v.returnReason }}
          </p>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { useStore } from '@/store'
import { TODAY } from '@/db/seed'
import { fmtDateTime, STATUS_LABEL, STATUS_TYPE, VERSION_ACTION_LABEL } from '@/lib/labels'
import type { DraftStatus, Project } from '@/types'

const router = useRouter()
const store = useStore()
const kw = ref('')
const statusFilter = ref<DraftStatus | ''>('')
const historyVisible = ref(false)
const current = ref<Project | null>(null)

const filtered = computed(() =>
  store.projects
    .filter((p) => p.plannerId === store.currentUser!.id)
    .filter((p) => !kw.value || p.title.includes(kw.value) || p.projectNo.includes(kw.value))
    .filter((p) => !statusFilter.value || p.status === statusFilter.value)
)

function isOverdue(p: Project) {
  return (p.status === 'in_progress' || p.status === 'returned') && p.deadline < TODAY
}
function safetyOf(id: string) {
  return store.safetyCache[id]
}
function open(p: Project) {
  const readonly = p.status === 'approved' || p.status === 'completed'
  router.push({ name: 'editor', params: { projectId: p.id }, query: readonly ? { readonly: '1' } : {} })
}
function showHistory(p: Project) {
  current.value = p
  historyVisible.value = true
}
</script>
