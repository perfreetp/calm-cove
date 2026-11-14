<template>
  <div>
    <h2 class="page-title">空域申报进度</h2>

    <el-row :gutter="14" style="margin-bottom: 14px">
      <el-col :span="4" v-for="stage in stageCards" :key="stage.key">
        <div class="panel stat-card">
          <div class="num" :style="{ color: stage.color }">{{ stage.count }}</div>
          <div class="dim">{{ stage.label }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="panel">
      <el-table :data="store.airspace" size="small">
        <el-table-column label="项目" min-width="200">
          <template #default="{ row }">
            <b>{{ store.projectOf(row.projectId)?.title ?? '—' }}</b>
            <div class="dim">{{ store.projectOf(row.projectId)?.projectNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="airspace" label="申报空域" min-width="180" />
        <el-table-column prop="ceilingM" label="限高(m)" width="100" />
        <el-table-column prop="applyNo" label="申报编号" width="140">
          <template #default="{ row }">{{ row.applyNo || '—' }}</template>
        </el-table-column>
        <el-table-column label="阶段" width="120">
          <template #default="{ row }">
            <el-tag :type="AIRSPACE_STAGE_TYPE[row.stage]" size="small">{{ AIRSPACE_STAGE_LABEL[row.stage] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近更新" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="open(row)">更新进度</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="visible" title="空域申报进度更新" width="480px">
      <el-form label-width="100px" v-if="form.id">
        <el-form-item label="项目">
          <el-input :model-value="store.projectOf(form.projectId)?.title" disabled />
        </el-form-item>
        <el-form-item label="申报阶段">
          <el-select v-model="form.stage" style="width: 100%">
            <el-option v-for="(label, key) in AIRSPACE_STAGE_LABEL" :key="key" :value="key" :label="label" />
          </el-select>
        </el-form-item>
        <el-form-item label="申报编号">
          <el-input v-model="form.applyNo" placeholder="如 AS-2026-1102" />
        </el-form-item>
        <el-form-item label="空域描述">
          <el-input v-model="form.airspace" />
        </el-form-item>
        <el-form-item label="限高(米)">
          <el-input-number v-model="form.ceilingM" :min="10" :max="500" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.note" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存（记录更新时间）</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useStore } from '@/store'
import { AIRSPACE_STAGE_LABEL, AIRSPACE_STAGE_TYPE, fmtDateTime } from '@/lib/labels'
import type { AirspaceFiling } from '@/types'

const store = useStore()
const visible = ref(false)
const form = reactive<AirspaceFiling>({
  id: '', projectId: '', stage: 'not_started', applyNo: '', airspace: '', ceilingM: 120,
  submittedAt: '', updatedAt: '', note: ''
})

const stageCards = computed(() =>
  Object.entries(AIRSPACE_STAGE_LABEL).map(([key, label]) => ({
    key,
    label,
    count: store.airspace.filter((a) => a.stage === key).length,
    color: AIRSPACE_STAGE_TYPE[key] === 'success' ? 'var(--ok)' : AIRSPACE_STAGE_TYPE[key] === 'danger' ? 'var(--danger)' : 'var(--accent)'
  }))
)

function open(row: AirspaceFiling) {
  Object.assign(form, row)
  visible.value = true
}
function save() {
  if (form.stage === 'submitted' && !form.submittedAt) form.submittedAt = new Date().toISOString()
  store.saveAirspace({ ...form })
  visible.value = false
  ElMessage.success('申报进度已更新')
}
</script>

<style scoped>
.stat-card {
  text-align: center;
  padding: 16px 8px;
}

.stat-card .num {
  font-size: 26px;
  font-weight: 800;
}
</style>
