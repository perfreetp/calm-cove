<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="#ff4d6d" stroke-width="4"/>
          <rect x="9" y="14" width="14" height="4" fill="#ff4d6d"/>
          <path d="M4 30 L12 22" stroke="#8b98a8" stroke-width="2"/>
        </svg>
      </div>
      <div class="brand-text">
        <div class="name">标版通</div>
        <div class="sub">公路交通标志牌 · 版面制作与版本审片</div>
      </div>
    </div>

    <div class="crumbs">
      <span class="faint">项目</span>
      <select v-model="projectId" class="project-select">
        <option v-for="p in store.projects" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <span class="faint">/</span>
      <span v-if="sign" class="mono">{{ sign.code }}</span>
      <span v-if="sign">{{ sign.name }}</span>
      <span v-if="sign && version" class="tag slate">{{ version.name }}</span>
      <span v-if="sign" :class="['tag', STATUS[sign.status].tone]">{{ STATUS[sign.status].label }}</span>
    </div>

    <div class="spacer" />

    <div class="status-strip mono">
      <span v-if="fontState.error" class="err">字体未加载</span>
      <span v-else-if="!fontState.ready" class="faint">字体载入中…</span>
      <span v-else class="ok">文字矢量化就绪</span>
      <span class="faint">·</span>
      <span class="faint">撤销栈 {{ historyDepth }}/{{ maxHistory }}</span>
    </div>

    <div class="user-switch">
      <label class="faint small">当前身份</label>
      <div class="seg">
        <button :class="{ active: store.currentUser === 'maker' }" @click="store.currentUser = 'maker'" class="tiny">制作方 · 陈工</button>
        <button :class="{ active: store.currentUser === 'reviewer' }" @click="store.currentUser = 'reviewer'" class="tiny">审核方 · 李审</button>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { store, activeSign, activeVersion, fontState } from '../composables';
import { STATUS, HISTORY_LIMIT } from '../core/store.js';
import { canUndo, canRedo } from '../core/store.js';

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const historyDepth = computed(() => {
  // reading canUndo triggers reactivity on the sign/version change
  canUndo(); canRedo();
  return sign.value ? 1 : 0;
});
const maxHistory = HISTORY_LIMIT;

const projectId = computed({
  get: () => store.activeProjectId,
  set: (v) => { store.activeProjectId = v; },
});
</script>

<style scoped>
.topbar {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  background: linear-gradient(180deg, #1a2029, #151a21);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.brand { display: flex; align-items: center; gap: 9px; }
.logo { display: grid; place-items: center; }
.brand-text .name { font-weight: 650; font-size: 15px; letter-spacing: .03em; }
.brand-text .sub { font-size: 10.5px; color: var(--text-faint); letter-spacing: .01em; margin-top: -2px; }
.crumbs { display: flex; align-items: center; gap: 7px; font-size: 12px; min-width: 0; padding-left: 12px; border-left: 1px solid var(--line); }
.project-select { width: auto; max-width: 300px; font-size: 12px; padding: 3px 8px; background: var(--panel-2); }
.status-strip { display: flex; gap: 6px; align-items: center; font-size: 11px; }
.ok { color: var(--green); }
.err { color: var(--red); }
.user-switch { display: flex; align-items: center; gap: 8px; padding-left: 12px; border-left: 1px solid var(--line); }
.seg { display: flex; gap: 0; }
.seg button { border-radius: 0; }
.seg button:first-child { border-radius: 6px 0 0 6px; }
.seg button:last-child { border-radius: 0 6px 6px 0; border-left: none; }
</style>
