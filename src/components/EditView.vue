<template>
  <div class="edit-view">
    <div v-if="!sign || !doc" class="empty"><div>未选择标志牌</div></div>
    <template v-else>
      <EditorToolbar
        :doc="doc"
        :selection="selection"
        :tool="tool"
        :disabled="locked"
        @update:tool="tool = $event"
        @update:selection="setSelection"
        @zoom-fit="canvas?.fit()"
        @delete="deleteSelection"
      />
      <div class="main">
        <section class="editor pane">
          <SignCanvas
            ref="canvas"
            :selection="selection"
            :tool="tool"
            :comment-mode="commentMode"
            :comments="[]"
            @update:selection="setSelection"
            @update:comment-mode="commentMode = $event"
            @new-version="$emit('new-version')"
          />
        </section>

        <aside class="right">
          <div class="panel-block wf-block">
            <WorkflowPanel />
          </div>
          <div class="panel-block insp">
            <Inspector
              :doc="doc"
              :selection="selection"
              :locked="locked"
              :legibility="lig"
              @update:selection="setSelection"
            />
          </div>
          <div class="panel-block layers-block">
            <LayerList
              :doc="doc"
              :selection="selection"
              :comments="sign.comments.filter(c => c.versionId === version.id)"
              @update:selection="setSelection"
            />
          </div>
          <div class="panel-block viewer-block">
            <Viewer3D :doc="doc" />
          </div>
        </aside>
      </div>

      <div class="statusbar">
        <span class="mono">版本 {{ version.name }}</span>
        <span class="tag" :class="vStatusTone">{{ vStatusLabel }}</span>
        <span class="faint">·</span>
        <span class="faint">{{ locked ? '只读' : '可编辑' }}</span>
        <span class="faint">·</span>
        <span class="mono faint">{{ doc.layers.length }} 图层</span>
        <span class="spacer" />
        <span :class="['small', lig.meetsSpeed ? 'okc' : 'warnc']">
          主视认字高 {{ lig.charHeight }}mm / 视认 {{ lig.distance.toFixed(0) }}m
        </span>
        <button class="tiny primary" :disabled="locked" @click="showInsert = true">＋ 插入图元</button>
        <button class="tiny" @click="showQuickActions = !showQuickActions">快速操作 ▾</button>
        <transition name="fade">
          <div v-if="showQuickActions" class="quick-menu">
            <button @click="downloadSvgNow">导出当前 SVG</button>
            <button @click="$emit('submit')" :disabled="locked">提交审核</button>
          </div>
        </transition>
      </div>

      <InsertPalette
        v-if="showInsert"
        :doc="doc"
        :category="doc.category"
        @close="showInsert = false"
        @insert="insertLayer"
        @pen="startPen"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import EditorToolbar from './EditorToolbar.vue';
import SignCanvas from './SignCanvas.vue';
import Inspector from './Inspector.vue';
import LayerList from './LayerList.vue';
import Viewer3D from './Viewer3D.vue';
import InsertPalette from './InsertPalette.vue';
import WorkflowPanel from './WorkflowPanel.vue';
import { store, activeSign, activeVersion, isMaker, commit, toast } from '../composables';
import { canEdit } from '../core/store.js';
import { legibility, PRIMITIVES, CATEGORIES } from '../core/model.js';
import { buildSvg } from '../core/export.js';
import { downloadSvg } from '../core/download.js';

defineEmits(['new-version', 'submit']);

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const doc = computed(() => version.value?.doc || null);
const locked = computed(() => !canEdit(sign.value, version.value));
const lig = computed(() => (doc.value ? legibility(doc.value) : {}));

const selection = ref({ layerIds: [], mode: 'select' });
const tool = ref('select');
const commentMode = ref(false);
const canvas = ref(null);
const showQuickActions = ref(false);
const showInsert = ref(false);

watch(() => sign.value?.id + ':' + version.value?.id, () => {
  selection.value = { layerIds: [], mode: 'select' };
});

function setSelection(sel) {
  selection.value = sel;
}

const vStatusLabel = computed(() => {
  const s = version.value?.status;
  return { draft: '草稿', submitted: '审核中', returned: '已退回', approved: '已通过' }[s] || s;
});
const vStatusTone = computed(() => {
  const s = version.value?.status;
  return { draft: 'slate', submitted: 'amber', returned: 'red', approved: 'green' }[s] || 'slate';
});

function deleteSelection() {
  if (locked.value) return;
  const ids = new Set(selection.value.layerIds || []);
  if (!ids.size) return;
  doc.value.layers = doc.value.layers.filter((l) => !(ids.has(l.id) && l.kind !== 'plate'));
  selection.value = { layerIds: [], mode: 'select' };
  commit();
}

function addPrimitive() {
  if (locked.value) return;
  const list = PRIMITIVES[doc.value.category] || PRIMITIVES.guide;
  const layer = list[0].make(doc.value);
  doc.value.layers.push(layer);
  selection.value = { layerIds: [layer.id], mode: 'select' };
  commit();
  toast(`已添加 ${layer.name}`);
}

function insertLayer(layer) {
  if (locked.value) return;
  doc.value.layers.push(layer);
  selection.value = { layerIds: [layer.id], mode: 'select' };
  commit();
  showInsert.value = false;
  toast(`已插入 ${layer.name}`, 'success');
}

function startPen() {
  showInsert.value = false;
  tool.value = 'pen';
}

function downloadSvgNow() {
  const svg = buildSvg(doc.value, { sign: sign.value, version: version.value });
  downloadSvg(svg, sign.value, version.value);
  toast('已导出 SVG', 'success');
}

function onKey(e) {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault(); redo();
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!locked.value) { e.preventDefault(); deleteSelection(); }
  } else if (e.key === 'v' || e.key === 'V') tool.value = 'select';
  else if (e.key === 'p' || e.key === 'P') tool.value = 'pen';
  else if (e.key === 'h' || e.key === 'H') tool.value = 'pan';
}
import { undo as undoFn, redo as redoFn } from '../core/store.js';
const undo = undoFn, redo = redoFn;

onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
.edit-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.main { flex: 1; display: flex; min-height: 0; }
.editor { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.right {
  width: 310px; flex-shrink: 0; display: flex; flex-direction: column;
  border-left: 1px solid var(--line); background: var(--panel); min-height: 0; overflow: hidden;
}
.panel-block { border-bottom: 1px solid var(--line); min-height: 0; display: flex; flex-direction: column; }
.wf-block { flex: 0 0 auto; }
.wf-block :deep(.wf) { border-bottom: none; }
.insp { flex: 1 1 auto; overflow: auto; }
.insp::-webkit-scrollbar { width: 8px; }
.layers-block { flex: 0 0 168px; }
.viewer-block { flex: 0 0 250px; border-bottom: none; }
.statusbar {
  height: 32px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: var(--panel); border-top: 1px solid var(--line); flex-shrink: 0; position: relative;
}
.okc { color: var(--green); }
.warnc { color: var(--amber); }
.quick-menu {
  position: absolute; bottom: 34px; right: 8px; display: flex; flex-direction: column; gap: 3px;
  background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px; padding: 4px;
  box-shadow: 0 8px 22px rgba(0,0,0,0.4); z-index: 20;
}
.quick-menu button { border: none; background: none; text-align: left; font-size: 11.5px; }
.quick-menu button:hover { background: var(--panel-3); }
</style>
