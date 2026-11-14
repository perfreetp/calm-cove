<template>
  <div class="tabs">
    <button v-for="t in tabs" :key="t.key" :class="{ active: store.ui.tab === t.key }" @click="go(t.key)">
      {{ t.label }}
      <span v-if="t.key === 'review' && openCount" class="badge">{{ openCount }}</span>
      <span v-if="t.key === 'compare'" class="badge subtle">差异</span>
    </button>
    <div class="spacer" />
    <div v-if="sign" class="vers">
      <label class="faint small">当前版本</label>
      <select v-model="activeVersionId" class="ver-select" :disabled="!sign.versions.length">
        <option v-for="v in sign.versions" :key="v.id" :value="v.id">
          {{ v.name }} · {{ vstatus(v) }}
        </option>
      </select>
      <button class="tiny" :disabled="!isMaker()" @click="emit('new-version')" title="基于当前版本复制出新版本">＋ 新版本</button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store, activeSign, activeVersion, isMaker } from '../composables';
import { setActiveVersion } from '../core/store.js';

const emit = defineEmits(['new-version']);
const tabs = [
  { key: 'edit', label: '版面编辑' },
  { key: 'review', label: '审片批注' },
  { key: 'compare', label: '版本对比' },
  { key: 'details', label: '投产与记录' },
];

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const openCount = computed(() => (sign.value ? sign.value.comments.filter((c) => c.status !== 'closed').length : 0));

const activeVersionId = computed({
  get: () => version.value?.id || null,
  set: (id) => id && setActiveVersion(id),
});

function go(k) {
  store.ui.tab = k;
}

function vstatus(v) {
  return { draft: '草稿', submitted: '审核中', returned: '已退回', approved: '已通过' }[v.status] || v.status;
}
</script>

<style scoped>
.tabs {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 12px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.tabs > button {
  background: transparent; border: none; border-bottom: 2px solid transparent;
  border-radius: 0; padding: 10px 12px; color: var(--text-dim); font-size: 12.5px;
  margin-bottom: -1px;
}
.tabs > button:hover { color: var(--text); background: transparent; }
.tabs > button.active { color: #fff; border-bottom-color: var(--accent); }
.badge {
  margin-left: 5px; background: #3b1e26; color: #ff97ab; border-radius: 8px;
  padding: 0 5px; font-size: 10px; line-height: 15px; display: inline-block;
}
.badge.subtle { background: #1c2b3a; color: #7fc0f5; }
.vers { display: flex; align-items: center; gap: 7px; }
.ver-select { width: auto; min-width: 152px; font-size: 11.5px; padding: 3px 7px; background: var(--panel-2); }
</style>
