<template>
  <div class="stats">
    <h4>审片记录筛选</h4>
    <div class="row">
      <label>播报模板</label>
      <select v-model="store.ui.filter.template">
        <option value="">全部</option>
        <option v-for="t in templates" :key="t" :value="t">{{ t }}</option>
      </select>
      <label>主播角色</label>
      <select v-model="store.ui.filter.character">
        <option value="">全部</option>
        <option v-for="c in characters" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>
    <div class="row">
      <label>时间段</label>
      <input type="date" v-model="store.ui.filter.from" />
      <span>~</span>
      <input type="date" v-model="store.ui.filter.to" />
    </div>

    <div class="cards">
      <div class="card"><div class="num">{{ stats.total }}</div><div class="lbl">送审版本数</div></div>
      <div class="card"><div class="num">{{ stats.firstPassRate }}<small>%</small></div><div class="lbl">一次通过率</div></div>
      <div class="card"><div class="num">{{ stats.avgRework }}</div><div class="lbl">平均返工轮次</div></div>
      <div class="card"><div class="num">{{ stats.openAnnotations }}</div><div class="lbl">未处理批注</div></div>
    </div>

    <h4>审片记录（{{ filteredVersions.length }}）</h4>
    <table>
      <thead>
        <tr><th>版本</th><th>模板</th><th>角色</th><th>提交时间</th><th>批注</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="v in filteredVersions" :key="v.n">
          <td>V{{ v.n }}</td>
          <td>{{ v.snapshot.meta.template }}</td>
          <td>{{ v.snapshot.meta.character }}</td>
          <td>{{ fmtTime(v.submittedAt) }}</td>
          <td>{{ v.annotations.length }}</td>
          <td><span class="tag" :class="v.status">{{ statusLabel(v.status) }}</span></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, stats, filteredVersions } from '../store.js'

const templates = computed(() => [...new Set(store.versions.map((v) => v.snapshot.meta.template))])
const characters = computed(() => [...new Set(store.versions.map((v) => v.snapshot.meta.character))])

function fmtTime(t) { return new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function statusLabel(s) {
  return { reviewing: '审核中', resolved: '已处理待确认', approved: '已通过' }[s] || s
}
</script>

<style scoped>
.stats { display: flex; flex-direction: column; gap: 10px; }
h4 { margin: 4px 0; color: var(--dim); font-size: 12px; }
.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.card { background: var(--panel2); border: 1px solid var(--line); border-radius: 6px; padding: 10px 6px; text-align: center; }
.num { font-size: 20px; font-weight: bold; color: var(--accent); }
.num small { font-size: 12px; }
.lbl { font-size: 11px; color: var(--dim); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { border-bottom: 1px solid var(--line); padding: 4px 6px; text-align: left; }
</style>
