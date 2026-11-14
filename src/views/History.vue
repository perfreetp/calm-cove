<template>
  <div v-if="project" class="page">
    <div class="card" style="margin-bottom:14px">
      <div class="toolbar">
        <strong style="font-size:15px">{{ project.name }} · 版本历史</strong>
        <span class="badge" :class="project.status">{{ STATUS_LABELS[project.status] }}</span>
        <span class="spacer"></span>
        <RouterLink class="btn sm" :to="`/review/${project.id}`">返回审片</RouterLink>
        <RouterLink class="btn sm" :to="`/diff/${project.id}`">版本对比</RouterLink>
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th>版本号</th><th>提交时间</th><th>操作人</th><th>版本说明</th>
            <th>批注数</th><th>未闭环</th><th>减面率</th><th>体素</th><th>基于</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(v, i) in project.versions" :key="v.id">
            <td><strong class="mono">{{ v.version }}</strong>
              <span v-if="i === 0" class="badge approved" style="margin-left:6px">当前</span>
            </td>
            <td>{{ fmt(v.at) }}</td>
            <td>{{ v.operator }}</td>
            <td style="max-width:260px">{{ v.note || '—' }}</td>
            <td><strong>{{ v.annotations.length }}</strong></td>
            <td>
              <strong :style="{ color: openOf(v) ? '#ff5d6c' : '#38d6a0' }">{{ openOf(v) }}</strong>
              <span class="muted"> / 改{{ closedOf(v) }} / 留{{ keptOf(v) }}</span>
            </td>
            <td>
              <span v-if="v.mergeStats">{{ v.mergeStats.reduction }}%
                <span class="muted">({{ v.mergeStats.beforeFaces }}→{{ v.mergeStats.afterFaces }}面)</span>
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td>{{ v.voxels.length }}</td>
            <td class="muted mono">{{ baseLabel(v) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>每轮批注闭环记录</h3>
      <div v-for="v in project.versions" :key="'t' + v.id" style="margin-bottom:12px">
        <strong class="mono">{{ v.version }}</strong>
        <span class="muted"> · {{ v.operator }} · {{ fmt(v.at) }}</span>
        <div v-if="v.annotations.length" style="margin-top:6px;padding-left:14px;border-left:2px solid var(--line)">
          <div v-for="a in v.annotations" :key="a.id" style="font-size:12.5px;padding:4px 0">
            <span class="badge sm" :class="a.status">
              {{ { open: '未闭环', closed: '已改', kept: '保留' }[a.status] }}
            </span>
            <span style="margin:0 8px">{{ a.text }}</span>
            <span class="muted">— {{ a.who }} · {{ fmt(a.at) }}</span>
          </div>
        </div>
        <div v-else class="muted" style="font-size:12px;padding-left:14px">该轮无批注</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProject } from '../lib/store.js'
import { STATUS_LABELS } from '../lib/constants.js'

const props = defineProps({ id: String })
const router = useRouter()
const project = ref(null)
onMounted(() => {
  const p = getProject(props.id)
  if (!p) router.push('/')
  project.value = p
})
const openOf = v => v.annotations.filter(a => a.status === 'open').length
const closedOf = v => v.annotations.filter(a => a.status === 'closed').length
const keptOf = v => v.annotations.filter(a => a.status === 'kept').length
function baseLabel(v) {
  if (!v.basedOn) return '初始'
  const b = project.value.versions.find(x => x.id === v.basedOn)
  return b ? b.version : '旧版'
}
function fmt(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>
