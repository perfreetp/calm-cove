<template>
  <div>
    <h2 class="page-title">立项与稿件审核</h2>

    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="全部状态" clearable style="width: 160px">
        <el-option v-for="(label, key) in STATUS_LABEL" :key="key" :value="key" :label="label" />
      </el-select>
      <el-input v-model="kw" placeholder="搜索项目名称 / 编号" clearable style="width: 240px" />
    </div>

    <div class="panel">
      <el-table :data="filtered" size="small">
        <el-table-column prop="projectNo" label="项目编号" width="110" />
        <el-table-column prop="title" label="演出名称" min-width="200" />
        <el-table-column label="责任策划" width="130">
          <template #default="{ row }">{{ store.userName(row.plannerId) }}</template>
        </el-table-column>
        <el-table-column prop="droneCount" label="架数" width="80" />
        <el-table-column prop="deadline" label="交稿截止" width="120">
          <template #default="{ row }">
            <span :class="{ 'danger-text': isOverdue(row) }">{{ row.deadline }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPE[row.status as DraftStatus]" size="small">{{ STATUS_LABEL[row.status as DraftStatus] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300">
          <template #default="{ row }">
            <el-button link type="primary" @click="openVersions(row)">版本记录</el-button>
            <el-button link @click="preview(row)">脚本预览</el-button>
            <template v-if="row.status === 'submitted'">
              <el-button link type="success" @click="openApprove(row)">通过</el-button>
              <el-button link type="danger" @click="openReturn(row)">退回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 版本记录抽屉 -->
    <el-drawer v-model="versionVisible" :title="`版本记录 · ${current?.title ?? ''}`" size="48%">
      <el-timeline v-if="current">
        <el-timeline-item v-for="v in store.versionsOf(current.id)" :key="v.id" :timestamp="fmtDateTime(v.at)"
          :type="v.action === 'return' ? 'danger' : v.action === 'approve' ? 'success' : 'primary'">
          <el-tag size="small" style="margin-right: 8px">v{{ v.version }} · {{ VERSION_ACTION_LABEL[v.action] }}</el-tag>
          {{ v.operatorName }}
          <p style="margin: 6px 0 0">{{ v.comment }}</p>
          <p v-if="v.returnReason" style="margin: 4px 0 0; color: var(--danger)">
            退回原因（{{ v.returnBy === 'customer' ? '客户侧' : '主管侧' }}）：{{ v.returnReason }}
          </p>
          <el-button v-if="v.snapshot" link type="primary" size="small" @click="previewSnapshot(v.snapshot!)">
            查看该版本快照
          </el-button>
        </el-timeline-item>
      </el-timeline>
    </el-drawer>

    <!-- 退回对话框：原因必须来自下拉 -->
    <el-dialog v-model="returnVisible" title="退回稿件（回到策划工位继续修改）" width="480px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px"
        title="退回原因必须从下拉列表选择；退回后稿件状态变为「已退回」，策划可继续编辑后重新提交。" />
      <el-form label-width="92px">
        <el-form-item label="退回方">
          <el-radio-group v-model="returnForm.by">
            <el-radio value="supervisor">主管退回</el-radio>
            <el-radio value="customer">客户退回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="退回原因" required>
          <el-select v-model="returnForm.reason" placeholder="请选择退回原因" style="width: 100%">
            <el-option v-for="r in RETURN_REASONS" :key="r" :value="r" :label="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="补充说明">
          <el-input v-model="returnForm.comment" type="textarea" :rows="3" placeholder="给策划的具体修改意见" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="returnVisible = false">取消</el-button>
        <el-button type="danger" @click="doReturn">确认退回</el-button>
      </template>
    </el-dialog>

    <!-- 通过对话框 -->
    <el-dialog v-model="approveVisible" title="审核通过" width="420px">
      <el-input v-model="approveComment" type="textarea" :rows="3" placeholder="审核意见" />
      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="success" @click="doApprove">确认通过</el-button>
      </template>
    </el-dialog>

    <ScriptPreviewDialog v-model="previewVisible" :script="previewScript" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useStore } from '@/store'
import { TODAY, RETURN_REASONS } from '@/db/seed'
import { fmtDateTime, STATUS_LABEL, STATUS_TYPE, VERSION_ACTION_LABEL } from '@/lib/labels'
import type { DraftStatus, Project, ShowScript } from '@/types'
import ScriptPreviewDialog from '@/components/pilot/ScriptPreviewDialog.vue'

const store = useStore()
const kw = ref('')
const statusFilter = ref<DraftStatus | ''>('')

const filtered = computed(() =>
  store.projects
    .filter((p) => !statusFilter.value || p.status === statusFilter.value)
    .filter((p) => !kw.value || p.title.includes(kw.value) || p.projectNo.includes(kw.value))
)
function isOverdue(p: Project) {
  return (p.status === 'in_progress' || p.status === 'returned') && p.deadline < TODAY
}

// ---- 版本 ----
const versionVisible = ref(false)
const current = ref<Project | null>(null)
function openVersions(p: Project) {
  current.value = p
  versionVisible.value = true
}

// ---- 预览 ----
const previewVisible = ref(false)
const previewScript = ref<ShowScript | null>(null)
function preview(p: Project) {
  previewScript.value = store.scriptOf(p.id) ?? null
  previewVisible.value = true
}
function previewSnapshot(snap: ShowScript) {
  versionVisible.value = false
  previewScript.value = snap
  previewVisible.value = true
}

// ---- 退回 ----
const returnVisible = ref(false)
const returnForm = reactive({ reason: '', comment: '', by: 'supervisor' as 'customer' | 'supervisor' })
function openReturn(p: Project) {
  current.value = p
  Object.assign(returnForm, { reason: '', comment: '', by: 'supervisor' })
  returnVisible.value = true
}
function doReturn() {
  if (!current.value) return
  if (!returnForm.reason) return ElMessage.warning('请从下拉列表选择退回原因')
  const r = store.returnScript(current.value.id, returnForm.reason, returnForm.comment || '（无补充说明）', returnForm.by)
  if (r.ok) {
    ElMessage.success('已退回，稿件回到策划工位')
    returnVisible.value = false
  } else ElMessage.error(r.error!)
}

// ---- 通过 ----
const approveVisible = ref(false)
const approveComment = ref('')
function openApprove(p: Project) {
  current.value = p
  approveComment.value = ''
  approveVisible.value = true
}
function doApprove() {
  if (!current.value) return
  const r = store.approveScript(current.value.id, approveComment.value || '审核通过')
  if (r.ok) {
    ElMessage.success('已审核通过，可安排现场执行')
    approveVisible.value = false
  } else ElMessage.error(r.error!)
}
</script>
