<template>
  <div class="app-shell">
    <TopBar />
    <div class="app-body">
      <SignList @new-sign="showNew = true" />
      <main class="workarea">
        <WorkTabs @new-version="newVersion" />
        <transition name="fade">
          <EditView v-if="tab === 'edit'" key="edit" @new-version="newVersion" />
          <ReviewView v-else-if="tab === 'review'" key="review" />
          <CompareView v-else-if="tab === 'compare'" key="compare" @new-version="newVersion" />
          <DetailsView v-else-if="tab === 'details'" key="details" @new-version="newVersion" />
        </transition>
      </main>
    </div>
    <div v-if="showNew" class="modal-host">
      <NewSignModal @close="afterCreate" />
    </div>
    <ToastHost />
    <div v-if="!fontState.ready && !fontState.error" class="boot">
      <div class="boot-card">
        <div class="spin" />
        <div>正在载入矢量字体…</div>
        <div class="faint small">汉字按字高/字宽参数实时矢量化</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { store, initStore, loadFontReady, fontState, toast } from './composables';
import { activeSign, createNextVersion } from './core/store.js';
import TopBar from './components/TopBar.vue';
import SignList from './components/SignList.vue';
import WorkTabs from './components/WorkTabs.vue';
import EditView from './components/EditView.vue';
import ReviewView from './components/ReviewView.vue';
import CompareView from './components/CompareView.vue';
import DetailsView from './components/DetailsView.vue';
import NewSignModal from './components/NewSignModal.vue';
import ToastHost from './components/ToastHost.vue';

const tab = computed(() => store.ui.tab);
const showNew = ref(false);

onMounted(async () => {
  initStore();
  await loadFontReady();
  if (fontState.error) toast('字体加载失败：' + fontState.error, 'error');
});

function afterCreate() {
  showNew.value = false;
  store.ui.tab = 'edit';
}

function newVersion() {
  try {
    const v = createNextVersion(activeSign());
    if (v) {
      store.ui.tab = 'edit';
      toast(`已创建 ${v.name}（基于上一版），可直接编辑`, 'success');
    }
  } catch (e) {
    toast(e.message, 'warn');
  }
}
</script>

<style scoped>
.app-shell { height: 100%; display: flex; flex-direction: column; background: var(--bg); }
.app-body { flex: 1; display: flex; min-height: 0; }
.workarea { flex: 1; display: flex; flex-direction: column; min-width: 0; border-left: 1px solid var(--line); position: relative; }
.modal-host { position: fixed; inset: 0; z-index: 500; }
.boot { position: fixed; inset: 0; background: rgba(8, 11, 15, 0.8); display: grid; place-items: center; z-index: 800; backdrop-filter: blur(3px); }
.boot-card { display: flex; flex-direction: column; align-items: center; gap: 9px; font-size: 12.5px; color: var(--text-dim); }
.spin {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid var(--line); border-top-color: var(--accent);
  animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
