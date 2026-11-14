<template>
  <div>
    <h2 class="page-title">彩排记录与异常处置</h2>

    <el-tabs v-model="tab">
      <el-tab-pane label="彩排记录" name="rehearsal">
        <div class="toolbar">
          <el-button type="primary" :icon="Plus" @click="openRehearsal()">新增彩排记录</el-button>
        </div>
        <div class="panel">
          <el-table :data="store.rehearsals" size="small">
            <el-table-column label="项目" min-width="180">
              <template #default="{ row }">{{ store.projectOf(row.projectId)?.title ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ fmtDateTime(row.at) }}</template>
            </el-table-column>
            <el-table-column prop="location" label="地点" width="180" />
            <el-table-column label="飞手" width="120">
              <template #default="{ row }">{{ store.userName(row.pilotId) }}</template>
            </el-table-column>
            <el-table-column prop="droneCount" label="架数" width="80" />
            <el-table-column prop="durationMin" label="时长(分)" width="90" />
            <el-table-column label="结论" width="100">
              <template #default="{ row }">
                <el-tag :type="row.result === 'pass' ? 'success' : row.result === 'issues' ? 'warning' : 'danger'" size="small">
                  {{ row.result === 'pass' ? '通过' : row.result === 'issues' ? '有问题' : '不通过' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="issues" label="问题记录" min-width="240" />
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button link type="primary" @click="openRehearsal(row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="`现场异常（${store.anomalies.length}）`" name="anomaly">
        <div class="panel">
          <el-table :data="store.anomalies" size="small">
            <el-table-column label="项目" min-width="160">
              <template #default="{ row }">{{ store.projectOf(row.projectId)?.title ?? '—' }}</template>
            </el-table-column>
            <el-table-column prop="droneId" label="无人机" width="100" />
            <el-table-column label="类型" width="140">
              <template #default="{ row }">{{ ANOMALY_TYPE_LABEL[row.type] }}</template>
            </el-table-column>
            <el-table-column label="级别" width="90">
              <template #default="{ row }">
                <el-tag :type="row.level === 'serious' ? 'danger' : 'warning'" size="small">
                  {{ row.level === 'serious' ? '严重' : '警告' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="detail" label="描述" min-width="220" />
            <el-table-column label="上报飞手" width="120">
              <template #default="{ row }">{{ store.userName(row.pilotId) }}</template>
            </el-table-column>
            <el-table-column label="上报时间" width="160">
              <template #default="{ row }">{{ fmtDateTime(row.at) }}</template>
            </el-table-column>
            <el-table-column label="处置" width="110">
              <template #default="{ row }">
                <el-button v-if="!row.handled" link type="success" @click="store.handleAnomaly(row.id)">标记已处置</el-button>
                <el-tag v-else type="success" size="small">已处置</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="visible" :title="form.id ? '编辑彩排记录' : '新增彩排记录'" width="520px">
      <el-form label-width="96px">
        <el-form-item label="所属项目">
          <el-select v-model="form.projectId" style="width: 100%">
            <el-option v-for="p in store.projects" :key="p.id" :value="p.id" :label="`${p.projectNo} · ${p.title}`" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间">
          <el-date-picker v-model="form.at" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" style="width: 100%" />
        </el-form-item>
        <el-form-item label="地点"><el-input v-model="form.location" /></el-form-item>
        <el-form-item label="飞手">
          <el-select v-model="form.pilotId" style="width: 100%">
            <el-option v-for="u in pilots" :key="u.id" :value="u.id" :label="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="参演架数"><el-input-number v-model="form.droneCount" :min="1" /></el-form-item>
        <el-form-item label="时长(分钟)"><el-input-number v-model="form.durationMin" :min="1" /></el-form-item>
        <el-form-item label="结论">
          <el-radio-group v-model="form.result">
            <el-radio value="pass">通过</el-radio>
            <el-radio value="issues">有问题</el-radio>
            <el-radio value="fail">不通过</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="问题记录">
          <el-input v-model="form.issues" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useStore } from '@/store'
import { ANOMALY_TYPE_LABEL, fmtDateTime } from '@/lib/labels'
import { uid } from '@/db/storage'
import type { Rehearsal } from '@/types'

const store = useStore()
const tab = ref('rehearsal')
const pilots = computed(() => store.users.filter((u) => u.role === 'pilot'))
const visible = ref(false)
const form = reactive<Rehearsal>({
  id: '', projectId: '', at: '', location: '', pilotId: '', droneCount: 0,
  durationMin: 30, issues: '', result: 'pass'
})

function openRehearsal(r?: Rehearsal) {
  if (r) Object.assign(form, r)
  else {
    Object.assign(form, {
      id: '', projectId: store.projects[0]?.id ?? '', at: new Date().toISOString().slice(0, 16),
      location: '', pilotId: pilots.value[0]?.id ?? '', droneCount: store.projects[0]?.droneCount ?? 0,
      durationMin: 30, issues: '', result: 'pass'
    })
  }
  visible.value = true
}
function save() {
  if (!form.projectId || !form.at) return ElMessage.warning('请选择项目与时间')
  store.saveRehearsal({ ...form, id: form.id || uid('r') })
  visible.value = false
  ElMessage.success('彩排记录已保存')
}
</script>
