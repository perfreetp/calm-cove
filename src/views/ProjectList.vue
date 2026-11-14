<template>
  <div class="page">
    <div class="card" style="margin-bottom:14px">
      <div class="toolbar">
        <h2 style="margin:0;font-size:17px">全部方案</h2>
        <span class="spacer"></span>
        <select v-model="filterCampus" style="min-width:150px">
          <option value="">全部院区</option>
          <option v-for="c in campuses" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button class="btn primary" @click="showCreate = true">+ 新建方案</button>
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>方案名称</th><th>院区</th><th>状态</th><th>版本数</th>
            <th>当前版本</th><th>未闭环批注</th><th>更新时间</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filtered" :key="p.id">
            <td><strong>{{ p.name }}</strong></td>
            <td>{{ campusName(p.campusId) }}</td>
            <td><span class="badge" :class="p.status">{{ STATUS_LABELS[p.status] }}</span></td>
            <td>{{ p.versions.length }}</td>
            <td class="mono">{{ currentVersion(p).version }}</td>
            <td>
              <span :style="{ color: openOf(p) ? '#ff5d6c' : '#38d6a0', fontWeight: 700 }">
                {{ openOf(p) }}
              </span>
            </td>
            <td>{{ fmt(p.updatedAt) }}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap">
                <RouterLink class="btn sm" :to="`/editor/${p.id}`">编辑</RouterLink>
                <RouterLink class="btn sm" :to="`/review/${p.id}`">审片</RouterLink>
                <RouterLink class="btn sm" :to="`/diff/${p.id}`">对比</RouterLink>
                <button class="btn sm danger" @click="remove(p)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="8" class="empty-hint">暂无方案,点击右上角新建</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
      <div class="card modal-box">
        <h3>新建中药房方案</h3>
        <label class="field" style="margin-bottom:10px">所属院区
          <select v-model="form.campusId">
            <option v-for="c in campuses" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </label>
        <label class="field">方案名称
          <input v-model="form.name" placeholder="如:总院三层中药房" @keyup.enter="create" />
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
          <button class="btn" @click="showCreate = false">取消</button>
          <button class="btn primary" @click="create">创建并进入编辑器</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import {
  listProjects, getCampuses, addProject, deleteProject, currentVersion
} from '../lib/store.js'
import { STATUS_LABELS } from '../lib/constants.js'
import { toast } from '../composables/useToast.js'

const router = useRouter()
const projects = ref([])
const campuses = ref([])
const filterCampus = ref('')
const showCreate = ref(false)
const form = reactive({ campusId: '', name: '' })

function refresh() {
  projects.value = listProjects()
  campuses.value = getCampuses()
  if (!form.campusId && campuses.value[0]) form.campusId = campuses.value[0].id
}
onMounted(refresh)

const filtered = computed(() =>
  filterCampus.value ? projects.value.filter(p => p.campusId === filterCampus.value) : projects.value)

function campusName(id) { return campuses.value.find(c => c.id === id)?.name || '—' }
function openOf(p) {
  return currentVersion(p).annotations.filter(a => a.status === 'open').length
}
function create() {
  if (!form.name.trim()) return toast('请填写方案名称', 'error')
  const p = addProject(form.campusId, form.name.trim())
  showCreate.value = false
  form.name = ''
  toast('方案已创建', 'success')
  router.push(`/editor/${p.id}`)
}
function remove(p) {
  if (!confirm(`确认删除方案「${p.name}」及其全部版本?`)) return
  deleteProject(p.id)
  refresh()
  toast('已删除')
}
function fmt(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
.modal-mask {
  position: fixed; inset: 0; background: rgba(5, 9, 18, .62);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.modal-box { width: 420px; }
.modal-box input, .modal-box select { width: 100%; }
</style>
