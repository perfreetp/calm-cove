<template>
  <div class="panel formation-panel">
    <div class="panel-title">
      编队骨架
      <div style="flex: 1"></div>
      <el-button size="small" type="primary" :icon="Plus" @click="addVisible = true" :disabled="readonly">新增编队</el-button>
    </div>

    <el-menu :default-active="selectedFormationId" class="f-menu" @select="(id: string) => emit('select-formation', id)">
      <el-menu-item v-for="f in script.formations" :key="f.id" :index="f.id">
        <el-icon><Grid /></el-icon>
        <span>{{ f.name }}</span>
        <el-tag size="small" style="margin-left: auto" type="info">{{ f.nodes.filter((n) => n.droneId).length }}机</el-tag>
      </el-menu-item>
    </el-menu>

    <template v-if="formation">
      <el-divider style="margin: 10px 0" />
      <div class="flex-row" style="justify-content: space-between">
        <b>骨节点绑定（{{ formation.nodes.length }} 节点）</b>
        <el-button size="small" link type="primary" :disabled="readonly" @click="emit('rebind-all', formation.id)">
          按顺序重新绑定
        </el-button>
      </div>
      <el-table :data="formation.nodes" size="small" height="260" class="node-table"
        :row-class-name="rowClass" @row-click="(row: SkeletonNode) => emit('select-node', row.id)">
        <el-table-column label="节点" width="78">
          <template #default="{ row }">{{ row.id.slice(-4) }}</template>
        </el-table-column>
        <el-table-column label="无人机编号" width="120">
          <template #default="{ row }">
            <el-select v-model="row.droneId" size="small" :disabled="readonly" filterable
              @change="(v: string | null) => onBind(row, v)" style="width: 104px">
              <el-option label="未绑定" :value="null" />
              <el-option v-for="id in droneIds" :key="id" :label="id" :value="id"
                :disabled="isIdTakenByOther(row, id)" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="x / y / z（米）" min-width="180">
          <template #default="{ row }">
            <div class="xyz">
              <el-input-number v-model="row.position.x" :disabled="readonly" size="small" :controls="false"
                @change="emit('binding-changed')" />
              <el-input-number v-model="row.position.y" :disabled="readonly" size="small" :controls="false"
                @change="emit('binding-changed')" />
              <el-input-number v-model="row.position.z" :disabled="readonly" size="small" :controls="false"
                @change="emit('binding-changed')" />
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="dim" style="margin-top: 8px; font-size: 12px">
        最小机间距：
        <span :style="{ color: minDist && minDist.dist < 3 ? 'var(--danger)' : 'var(--ok)' }">
          {{ minDist ? minDist.dist.toFixed(2) + ' m（' + minDist.a + ' ↔ ' + minDist.b + '）' : '—' }}
        </span>
        <span v-if="minDist && minDist.dist < 3"> · 低于 3m 安全间距</span>
      </div>
    </template>

    <!-- 新增编队对话框 -->
    <el-dialog v-model="addVisible" title="从预设图形生成编队骨架" width="480px">
      <el-form label-width="92px">
        <el-form-item label="编队名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="图形">
          <el-radio-group v-model="form.preset">
            <el-radio-button value="grid">矩形阵列</el-radio-button>
            <el-radio-button value="circle">圆环</el-radio-button>
            <el-radio-button value="heart">心形</el-radio-button>
            <el-radio-button value="star">星形</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="无人机数">
          <el-input-number v-model="form.count" :min="1" :max="script.droneCount" />
          <span class="dim" style="margin-left: 8px">项目总架数 {{ script.droneCount }}</span>
        </el-form-item>
        <el-form-item v-if="form.preset === 'grid'" label="列 × 行距">
          <el-input-number v-model="form.gap" :min="1" :max="20" /> 米
        </el-form-item>
        <el-form-item v-if="form.preset === 'circle'" label="半径">
          <el-input-number v-model="form.radius" :min="5" :max="150" /> 米
        </el-form-item>
        <el-form-item v-if="form.preset === 'heart'" label="缩放">
          <el-input-number v-model="form.scale" :min="0.5" :max="8" :step="0.1" />
        </el-form-item>
        <el-form-item v-if="form.preset === 'star'" label="外半径">
          <el-input-number v-model="form.outer" :min="10" :max="150" /> 米
        </el-form-item>
        <el-form-item label="高度 z">
          <el-input-number v-model="form.z" :min="0" :max="300" /> 米
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmAdd">生成</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Grid, Plus } from '@element-plus/icons-vue'
import type { Formation, ShowScript, SkeletonNode } from '@/types'
import { allDroneIds, minPairDistance, buildFormation, presetCircle, presetGrid, presetHeart, presetStar } from '@/lib/geometry'
import { uid } from '@/db/storage'

const props = defineProps<{
  script: ShowScript
  selectedFormationId: string
  selectedNodeId: string | null
  redDroneIds: Set<string>
  readonly: boolean
}>()

const emit = defineEmits<{
  (e: 'select-formation', id: string): void
  (e: 'select-node', id: string): void
  (e: 'add-formation', formation: Formation): void
  (e: 'rebind-all', formationId: string): void
  (e: 'binding-changed'): void
}>()

const addVisible = ref(false)
const form = reactive({ name: '新编队', preset: 'circle', count: 30, gap: 4, radius: 40, scale: 3, outer: 50, z: 60 })

const droneIds = computed(() => allDroneIds(props.script.droneCount))
const formation = computed(() => props.script.formations.find((f) => f.id === props.selectedFormationId))
const minDist = computed(() => (formation.value ? minPairDistance(formation.value) : null))

function rowClass({ row }: { row: SkeletonNode }) {
  const cls: string[] = []
  if (row.id === props.selectedNodeId) cls.push('row-selected')
  if (row.droneId && props.redDroneIds.has(row.droneId)) cls.push('row-danger')
  return cls.join(' ')
}

function isIdTakenByOther(row: SkeletonNode, id: string): boolean {
  if (!formation.value) return false
  return formation.value.nodes.some((n) => n.id !== row.id && n.droneId === id)
}

function onBind(row: SkeletonNode, id: string | null) {
  if (id && isIdTakenByOther(row, id)) {
    ElMessage.warning(`${id} 已绑定到其他骨节点，一架无人机在同一编队只能绑一个节点`)
    // 回滚为未绑定，避免出现重复编号
    row.droneId = null
    return
  }
  emit('binding-changed')
}

function confirmAdd() {
  let pts
  const id = uid('f')
  if (form.preset === 'grid') {
    const cols = Math.ceil(Math.sqrt(form.count))
    const rows = Math.ceil(form.count / cols)
    pts = presetGrid(cols, rows, form.gap, form.z).slice(0, form.count)
  } else if (form.preset === 'circle') {
    pts = presetCircle(form.count, form.radius, form.z)
  } else if (form.preset === 'heart') {
    pts = presetHeart(form.count, form.scale, form.z)
  } else {
    pts = presetStar(form.count, form.outer, form.outer * 0.45, form.z)
  }
  const f = buildFormation(id, form.name || '未命名编队', pts)
  emit('add-formation', f)
  addVisible.value = false
}
</script>

<style scoped>
.formation-panel {
  height: 100%;
  overflow-y: auto;
}

.f-menu {
  border-right: none;
}

.f-menu :deep(.el-menu-item) {
  height: 40px;
}

.xyz {
  display: flex;
  gap: 4px;
}

.xyz :deep(.el-input-number) {
  width: 56px;
}

.node-table :deep(.row-selected) {
  background: rgba(76, 141, 255, 0.18) !important;
}

.node-table :deep(.row-danger) {
  background: rgba(255, 48, 64, 0.14) !important;
}
</style>
