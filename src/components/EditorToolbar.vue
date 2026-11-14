<template>
  <div class="toolbar">
    <div class="grp">
      <button :class="['tooltip', { active: tool === 'select' }]" @click="setTool('select')" title="选择 / 移动 (V)" data-tip="选择 V">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3 2l9 7-4 .6L6 14z" fill="currentColor"/></svg>
      </button>
      <button :class="['tooltip', { active: tool === 'pen' }]" @click="setTool('pen')" title="钢笔绘制路径" data-tip="钢笔 P">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M11 2l3 3-7 7-4 1 1-4z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="3.5" cy="12.5" r="1" fill="currentColor"/></svg>
      </button>
      <button :class="['tooltip', { active: tool === 'pan' }]" @click="setTool('pan')" title="平移画布" data-tip="平移 H">
        <svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
    </div>

    <span class="sep" />

    <div class="grp">
      <button class="tiny tooltip" :disabled="!canBool" @click="bool('union')" title="并集（合并）" data-tip="并集">
        <span class="op">∪</span>
      </button>
      <button class="tiny tooltip" :disabled="!canBool" @click="bool('difference')" title="差集（挖空）" data-tip="差集">
        <span class="op">∖</span>
      </button>
      <button class="tiny tooltip" :disabled="!canBool" @click="bool('intersection')" title="交集" data-tip="交集">
        <span class="op">∩</span>
      </button>
      <button class="tiny tooltip" :disabled="!canBool" @click="bool('xor')" title="异或" data-tip="异或">
        <span class="op">⊕</span>
      </button>
    </div>

    <span class="sep" />

    <div class="grp">
      <button class="tiny tooltip" :disabled="!undoOk" @click="undo" title="撤销 Ctrl+Z" data-tip="撤销">
        <svg viewBox="0 0 16 16" width="13" height="13"><path d="M6 4L2 8l4 4M2 8h4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        <span v-if="undoCount > 0" class="undo-count mono">{{ undoCount }}</span>
      </button>
      <button class="tiny tooltip" :disabled="!redoOk" @click="redo" title="重做 Ctrl+Shift+Z" data-tip="重做">
        <svg viewBox="0 0 16 16" width="13" height="13"><path d="M10 4l4 4-4 4M14 8H10" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
        <span v-if="redoCount > 0" class="undo-count mono">{{ redoCount }}</span>
      </button>
    </div>

    <span class="sep" />

    <div class="grp">
      <button class="tiny" @click="$emit('zoom-fit')">适应</button>
      <button class="tiny" :disabled="!selCount" @click="$emit('delete')">删除</button>
    </div>

    <span class="spacer" />
    <div class="meta-hint mono">
      {{ doc.width }}×{{ doc.height }} mm · δ{{ doc.plateThickness }} · {{ doc.filmGrade }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { undo, redo, canUndo, canRedo, undoDepth, redoDepth, commit, toast } from '../core/store.js';
import { applyBoolean } from '../core/editor.js';

const props = defineProps({
  doc: { type: Object, required: true },
  selection: { type: Object, default: () => ({ layerIds: [] }) },
  tool: { type: String, default: 'select' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:tool', 'update:selection', 'zoom-fit', 'delete']);

const undoOk = computed(() => canUndo());
const redoOk = computed(() => canRedo());
const undoCount = computed(() => undoDepth());
const redoCount = computed(() => redoDepth());
const selCount = computed(() => (props.selection.layerIds || []).length);
const canBool = computed(() => !props.disabled && selCount.value >= 2);

function setTool(t) {
  emit('update:tool', t);
}

function bool(op) {
  const res = applyBoolean(props.doc, props.selection.layerIds || [], op);
  if (res.ok) {
    emit('update:selection', { layerIds: [res.layerId], mode: 'select' });
    commit();
  }
  toast(res.message, res.ok ? 'success' : 'warn');
}
</script>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.grp { display: flex; gap: 2px; }
.grp button { padding: 3px 7px; display: inline-flex; align-items: center; gap: 3px; }
.op { font-size: 14px; line-height: 1; }
.sep { width: 1px; height: 18px; background: var(--line); margin: 0 3px; }
.undo-count {
  font-size: 9px; color: var(--text-faint);
  background: rgba(255,255,255,0.06); border-radius: 6px; padding: 0 3px;
}
.meta-hint { font-size: 10.5px; color: var(--text-faint); }
</style>
