<template>
  <aside class="signlist scroll">
    <div class="head">
      <div class="row">
        <span class="section-title" style="padding:0">标志牌</span>
        <span class="spacer" />
        <span class="count mono">{{ signs.length }}</span>
      </div>
      <div class="filter-row">
        <button v-for="f in filters" :key="f.key" class="tiny"
          :class="{ active: filter === f.key }" @click="filter = f.key">
          {{ f.label }}<span v-if="f.key !== 'all' && counts[f.key]" class="badge">{{ counts[f.key] }}</span>
        </button>
      </div>
    </div>

    <div class="list">
      <button v-for="s in signs" :key="s.id" class="card" :class="{ sel: s.id === store.activeSignId, overdue: overdueDays(s) > 0 && s.status !== 'closed' }" @click="open(s)">
        <div class="row top">
          <span class="cat" :style="{ background: CATEGORIES[s.category].color }">{{ CATEGORIES[s.category].short }}</span>
          <span class="code mono">{{ s.code }}</span>
          <span class="spacer" />
          <span class="tag" :class="STATUS[s.status].tone">{{ STATUS[s.status].label }}</span>
        </div>
        <div class="nm">{{ s.name }}</div>
        <div class="row meta">
          <span class="mono faint">{{ s.versions.length }} 版 · {{ versionLabel(s) }}</span>
          <span class="spacer" />
          <span v-if="overdueDays(s) > 0 && s.status !== 'closed'" class="late mono">超 {{ overdueDays(s) }} 天</span>
          <span v-else-if="s.status !== 'closed'" class="faint mono">余 {{ dueInDays(s) }} 天</span>
        </div>
        <div class="row meta2">
          <span class="faint">修改轮次</span>
          <span class="mono">R{{ s.round }}</span>
          <span class="faint">·</span>
          <span class="faint">{{ blockingCount(s) ? `批注 ${blockingCount(s)} 未关` : '批注已清' }}</span>
          <span class="spacer" />
          <span class="faint mono" :title="'截止 ' + s.dueDate">{{ s.dueDate?.slice(5) }}</span>
        </div>
      </button>
      <div v-if="!signs.length" class="empty small">该筛选条件下没有标志牌</div>
    </div>

    <div class="foot">
      <button class="primary grow" @click="$emit('new-sign')">＋ 新建标志牌</button>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue';
import { store, CATEGORIES } from '../composables';
import { STATUS, setActiveSign, overdueDays, dueInDays } from '../core/store.js';

defineEmits(['new-sign']);

const filter = ref('all');
const filters = [
  { key: 'all', label: '全部' },
  { key: 'drafting', label: '制版中' },
  { key: 'reviewing', label: '待审核' },
  { key: 'returned', label: '退回' },
  { key: 'closed', label: '已结项' },
];

const signs = computed(() => {
  let list = store.signs.filter((s) => s.projectId === store.activeProjectId);
  if (filter.value !== 'all') list = list.filter((s) => s.status === filter.value);
  return list;
});

const counts = computed(() => {
  const out = {};
  for (const s of store.signs.filter((x) => x.projectId === store.activeProjectId)) {
    out[s.status] = (out[s.status] || 0) + 1;
  }
  return out;
});

function versionLabel(s) {
  const v = s.versions[s.versions.length - 1];
  return v ? v.name : '-';
}

function blockingCount(s) {
  return s.comments.filter((c) => c.status !== 'closed').length;
}

function open(s) {
  if (s.id !== store.activeSignId) setActiveSign(s.id);
}
</script>

<style scoped>
.signlist {
  width: 268px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--line);
}
.head { padding: 12px 12px 8px; border-bottom: 1px solid var(--line-soft); }
.count { color: var(--text-faint); font-size: 11px; }
.filter-row { display: flex; gap: 3px; margin-top: 9px; flex-wrap: wrap; }
.filter-row button { padding: 2px 7px; font-size: 11px; }
.badge { margin-left: 4px; background: rgba(255,255,255,0.1); border-radius: 8px; padding: 0 4px; font-size: 10px; }
.list { flex: 1; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.card {
  display: block; text-align: left; width: 100%;
  padding: 9px 10px; border-radius: 7px;
  background: var(--panel-2); border: 1px solid var(--line-soft);
  cursor: pointer;
}
.card:hover { background: var(--panel-3); }
.card.sel { border-color: var(--accent-dim); background: #1b2634; box-shadow: inset 0 0 0 1px rgba(59,157,255,0.2); }
.card.overdue { border-left: 3px solid var(--red); }
.cat {
  width: 17px; height: 17px; border-radius: 4px; display: grid; place-items: center;
  font-size: 10px; color: #fff; font-weight: 600; flex-shrink: 0;
}
.code { font-size: 11px; color: var(--text-dim); }
.nm { margin: 5px 0 3px; font-size: 13px; font-weight: 550; }
.meta, .meta2 { font-size: 10.5px; gap: 4px; }
.late { color: #ff8098; }
.foot { padding: 9px 12px; border-top: 1px solid var(--line-soft); }
</style>
