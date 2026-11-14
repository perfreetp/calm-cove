<template>
  <div class="page">
    <div class="toolbar" style="margin-bottom:16px">
      <h2 style="margin:0;font-size:18px">方案看板</h2>
      <span class="spacer"></span>
      <button class="btn sm" @click="resetDemo">重置演示数据</button>
      <RouterLink class="btn primary sm" to="/projects">全部方案</RouterLink>
    </div>

    <div class="stat-grid" style="margin-bottom:16px">
      <div class="stat">
        <div class="lbl">全院区待审方案</div>
        <div class="num" style="color:#ffb020">{{ stats.totalPending }}</div>
        <div class="sub">审核中 + 待返工</div>
      </div>
      <div class="stat">
        <div class="lbl">平均返工次数</div>
        <div class="num">{{ stats.globalRework }}</div>
        <div class="sub">按方案版本迭代数均值</div>
      </div>
      <div class="stat">
        <div class="lbl">常用药位覆盖率</div>
        <div class="num" :style="{ color: stats.globalCoverage >= 80 ? '#38d6a0' : '#ff5d6c' }">
          {{ stats.globalCoverage }}%
        </div>
        <div class="sub">已配药名常用位 / 全部常用位</div>
      </div>
      <div class="stat">
        <div class="lbl">方案总数</div>
        <div class="num">{{ projectCount }}</div>
        <div class="sub">{{ campusCount }} 个院区</div>
      </div>
    </div>

    <div class="card">
      <h3>各院区统计</h3>
      <table>
        <thead>
          <tr>
            <th>院区</th><th>方案数</th><th>待审量</th>
            <th>平均返工次数</th><th>常用药位覆盖率</th><th>覆盖率条</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in stats.rows" :key="r.campus">
            <td><strong>{{ r.campus }}</strong></td>
            <td>{{ r.total }}</td>
            <td><strong :style="{ color: r.pending ? '#ffb020' : undefined }">{{ r.pending }}</strong></td>
            <td>{{ r.avgRework }}</td>
            <td><strong :style="{ color: r.coverage >= 80 ? '#38d6a0' : '#ff5d6c' }">{{ r.coverage }}%</strong></td>
            <td style="width:220px">
              <div class="bar"><div class="fill" :style="{ width: r.coverage + '%' }"></div></div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>待办方案</h3>
      <table>
        <thead><tr><th>方案</th><th>院区</th><th>状态</th><th>当前版本</th><th>更新时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in todoProjects" :key="p.id">
            <td>{{ p.name }}</td>
            <td>{{ campusName(p.campusId) }}</td>
            <td><span class="badge" :class="p.status">{{ STATUS_LABELS[p.status] }}</span></td>
            <td class="mono">{{ verOf(p).version }}</td>
            <td>{{ fmt(p.updatedAt) }}</td>
            <td><RouterLink class="btn sm" :to="`/review/${p.id}`">去处理</RouterLink></td>
          </tr>
          <tr v-if="!todoProjects.length"><td colspan="6" class="empty-hint">没有待办,全部方案已闭环 🎉</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  dashboardStats, listProjects, getCampuses, currentVersion, resetAll
} from '../lib/store.js'
import { STATUS_LABELS } from '../lib/constants.js'
import { toast } from '../composables/useToast.js'

const stats = ref({ rows: [], totalPending: 0, globalRework: '0.0', globalCoverage: 0 })
const projects = ref([])
const campuses = ref([])

function refresh() {
  stats.value = dashboardStats()
  projects.value = listProjects()
  campuses.value = getCampuses()
}
onMounted(refresh)

const projectCount = computed(() => projects.value.length)
const campusCount = computed(() => campuses.value.length)
const todoProjects = computed(() =>
  projects.value.filter(p => ['reviewing', 'rework'].includes(p.status)).slice(0, 8))

function campusName(id) { return campuses.value.find(c => c.id === id)?.name || '—' }
function verOf(p) { return currentVersion(p) }
function resetDemo() { resetAll(); refresh(); toast('演示数据已重置', 'success') }
function fmt(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
</script>

<style scoped>
.bar {
  height: 8px; border-radius: 5px; background: var(--panel-2);
  overflow: hidden; width: 100%;
}
.bar .fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}
</style>
