<template>
  <div class="layers panel">
    <div class="head row">
      <span class="section-title" style="padding:0">图层 · {{ doc.layers.length }}</span>
      <span class="spacer" />
      <button class="tiny ghost" :disabled="!canReorder" @click="raise" title="上移一层">↑</button>
      <button class="tiny ghost" :disabled="!canReorder" @click="lower" title="下移一层">↓</button>
      <button class="tiny ghost" :disabled="locked" @click="duplicate" title="复制选中图层">⧉</button>
      <button class="tiny danger" :disabled="locked || !selIds.length" @click="remove" title="删除">✕</button>
    </div>
    <div class="list scroll">
      <div
        v-for="(layer, i) in reversed"
        :key="layer.id"
        class="row-item"
        :class="{ sel: selIds.includes(layer.id), hidden: !layer.visible, locked: layer.locked }"
        @click="select(layer, $event)"
      >
        <button class="eye" @click.stop="toggleVisible(layer)" :title="layer.visible ? '隐藏' : '显示'">
          <svg v-if="layer.visible" viewBox="0 0 16 16" width="13" height="13"><path d="M1 8s2.5-4.5 7-4.5S15 8 15 8 12.5 12.5 8 12.5 1 8 1 8z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>
          <svg v-else viewBox="0 0 16 16" width="13" height="13"><path d="M2 2l12 12M1 8s2.5-4.5 7-4.5c1.2 0 2.3.4 3.2 1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        </button>
        <span class="type-ico" :title="typeLabel(layer)">
          <span v-if="layer.type === 'text'" class="ico-t">字</span>
          <span v-else-if="layer.kind === 'plate'" class="ico-p">板</span>
          <span v-else class="ico-s">◫</span>
        </span>
        <span class="name" :title="layer.name">{{ layer.name }}</span>
        <span class="swatch" :style="swatchStyle(layer)" />
        <span v-if="commentCount(layer)" class="cbadge" :title="commentCount(layer) + ' 条元素批注'">{{ commentCount(layer) }}</span>
        <button v-if="commentable && layer.kind !== 'plate'" class="cbtn" @click.stop="emit('comment-layer', layer)" title="对该元素提意见">
          <svg viewBox="0 0 16 16" width="12" height="12"><path d="M2 3h12v8H6l-3 3v-3H2z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        </button>
        <button class="lock" @click.stop="toggleLock(layer)" :title="layer.locked ? '解锁' : '锁定'">
          <svg v-if="layer.locked" viewBox="0 0 16 16" width="12" height="12"><rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
          <svg v-else viewBox="0 0 16 16" width="12" height="12" opacity="0.35"><rect x="3.5" y="7" width="9" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 7V5a2.5 2.5 0 015 0" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        </button>
      </div>
    </div>
    <div class="foot small faint" v-if="selIds.length">
      已选 {{ selIds.length }} 个图层
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { store, activeSign, activeVersion, isMaker, commit, toast } from '../composables';
import { subpathsBBox } from '../core/geom.js';
import { layerSubpaths } from '../core/model.js';
import { canEdit } from '../core/store.js';

const props = defineProps({
  doc: { type: Object, required: true },
  selection: { type: Object, default: () => ({ layerIds: [] }) },
  comments: { type: Array, default: () => [] },
  commentable: { type: Boolean, default: false },
});
const emit = defineEmits(['update:selection', 'select-layer', 'comment-layer']);

const reversed = computed(() => [...props.doc.layers].reverse());
const selIds = computed(() => props.selection.layerIds || []);
const locked = computed(() => !canEdit(activeSign(), activeVersion()));
const canReorder = computed(() => !locked.value && selIds.value.length === 1);

function typeLabel(layer) {
  return layer.type === 'text' ? '文字（已转曲）' : layer.kind === 'plate' ? '底板' : layer.type === 'path' ? '路径' : '图形';
}

function swatchStyle(layer) {
  if (layer.type === 'text') return { background: layer.fill || 'transparent' };
  if (layer.fill && layer.stroke) {
    return { background: `linear-gradient(135deg, ${layer.fill} 50%, ${layer.stroke} 50%)` };
  }
  if (layer.fill) return { background: layer.fill };
  if (layer.stroke) return { background: layer.stroke, opacity: 0.75 };
  return { background: 'transparent' };
}

function commentCount(layer) {
  return props.comments.filter((c) => c.kind === 'layer' && c.layerId === layer.id && c.status !== 'closed').length;
}

function select(layer, e) {
  let ids = selIds.value;
  if (e.shiftKey || e.metaKey || e.ctrlKey) {
    ids = ids.includes(layer.id) ? ids.filter((x) => x !== layer.id) : [...ids, layer.id];
  } else {
    ids = [layer.id];
  }
  emit('update:selection', { layerIds: ids, mode: 'select' });
  emit('select-layer', layer.id);
}

function toggleVisible(layer) {
  layer.visible = !layer.visible;
  commit();
}

function toggleLock(layer) {
  layer.locked = !layer.locked;
  commit();
}

function duplicate() {
  if (locked.value || !props.doc) return;
  const src = props.doc.layers.filter((l) => selIds.value.includes(l.id));
  if (!src.length) return;
  const copies = src.map((l) => {
    const c = JSON.parse(JSON.stringify(l));
    c.id = 'L_' + Math.random().toString(36).slice(2, 10);
    c.name = l.name + ' 副本';
    c.locked = false;
    // nudge 16mm
    if (c.type === 'text') { c.x += 16; c.y += 16; }
    else if (c.subpaths) c.subpaths = translate(c.subpaths, 16, 16);
    else if (c.params) {
      if (c.params.x != null) c.params.x += 16;
      if (c.params.y != null) c.params.y += 16;
      if (c.params.cx != null) c.params.cx += 16;
      if (c.params.cy != null) c.params.cy += 16;
    }
    return c;
  });
  props.doc.layers.push(...copies);
  emit('update:selection', { layerIds: copies.map((c) => c.id), mode: 'select' });
  commit();
  toast(`已复制 ${copies.length} 个图层`);
}

function translate(subs, dx, dy) {
  return subs.map((s) => ({
    ...s,
    pts: s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy, cIn: p.cIn ? { x: p.cIn.x + dx, y: p.cIn.y + dy } : undefined, cOut: p.cOut ? { x: p.cOut.x + dx, y: p.cOut.y + dy } : undefined })),
  }));
}

function remove() {
  if (locked.value || !selIds.value.length) return;
  const ids = new Set(selIds.value);
  const removable = props.doc.layers.filter((l) => ids.has(l.id) && l.kind !== 'plate');
  props.doc.layers = props.doc.layers.filter((l) => !(ids.has(l.id) && l.kind !== 'plate'));
  emit('update:selection', { layerIds: [], mode: 'select' });
  commit();
  if (removable.length) toast(`已删除 ${removable.length} 个图层`);
}

function raise() {
  const id = selIds.value[0];
  const i = props.doc.layers.findIndex((l) => l.id === id);
  if (i < 0 || i === props.doc.layers.length - 1) return;
  const [l] = props.doc.layers.splice(i, 1);
  props.doc.layers.splice(i + 1, 0, l);
  commit();
}

function lower() {
  const id = selIds.value[0];
  const i = props.doc.layers.findIndex((l) => l.id === id);
  if (i <= 0) return;
  const [l] = props.doc.layers.splice(i, 1);
  props.doc.layers.splice(i - 1, 0, l);
  commit();
}
</script>

<style scoped>
.layers { display: flex; flex-direction: column; min-height: 0; }
.head { padding: 8px 9px 6px; border-bottom: 1px solid var(--line-soft); gap: 2px; }
.head button { padding: 1px 6px; font-size: 11.5px; }
.list { flex: 1; min-height: 0; padding: 4px; display: flex; flex-direction: column; gap: 1px; }
.row-item {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 5px; border-radius: 5px; cursor: pointer;
  border: 1px solid transparent;
}
.row-item:hover { background: var(--panel-2); }
.row-item.sel { background: #1b2634; border-color: var(--accent-dim); }
.row-item.hidden .name { opacity: 0.45; text-decoration: line-through; }
.row-item.locked { opacity: 0.78; }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; }
.eye, .lock {
  background: none; border: none; padding: 1px; width: 18px; height: 18px;
  color: var(--text-faint); display: grid; place-items: center; flex-shrink: 0;
}
.eye:hover, .lock:hover { color: var(--text); background: none; }
.type-ico { width: 16px; height: 16px; display: grid; place-items: center; border-radius: 3px; background: var(--panel-3); font-size: 9.5px; color: var(--text-dim); flex-shrink: 0; }
.ico-t { color: #7fc0f5; }
.ico-p { color: #ffc971; }
.cbtn {
  background: none; border: none; padding: 1px; width: 18px; height: 18px;
  color: #ffc971; display: grid; place-items: center; flex-shrink: 0; opacity: .75;
}
.cbtn:hover { opacity: 1; background: none; }
.swatch { width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(255,255,255,0.15); flex-shrink: 0; }
.cbadge {
  background: #3a2f16; color: #ffc971; border-radius: 8px; font-size: 9px;
  padding: 0 4px; line-height: 14px; flex-shrink: 0;
}
.foot { padding: 4px 9px; border-top: 1px solid var(--line-soft); }
</style>
