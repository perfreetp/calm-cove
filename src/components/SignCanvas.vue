<template>
  <div class="canvas-wrap" ref="wrap" :class="{ 'comment-mode': commentMode }">
    <canvas
      ref="cv"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointerleave="onLeave"
      @wheel.prevent="onWheel"
      @dblclick="onDblClick"
      @contextmenu.prevent
    />

    <!-- zoom / pan HUD -->
    <div class="hud">
      <button class="tiny ghost" @click="zoomBy(1 / 1.2)" title="缩小">−</button>
      <span class="pct mono">{{ Math.round(view.scale * 100 / dprScale) }}%</span>
      <button class="tiny ghost" @click="zoomBy(1.2)" title="放大">＋</button>
      <button class="tiny ghost" @click="fit" title="适应窗口">适应</button>
      <span class="sep" />
      <button class="tiny ghost" :class="{ active: showGuides }" @click="showGuides = !showGuides" title="安全边距与视认参考线">参考线</button>
      <button class="tiny ghost" :class="{ active: showGrid }" @click="showGrid = !showGrid" title="100mm 标尺网格">标尺</button>
      <button class="tiny ghost" :class="{ active: snapEnabled }" @click="snapEnabled = !snapEnabled" title="8px 网格 + 端点吸附">吸附</button>
    </div>

    <div class="readout mono" v-if="pointerMm">
      X {{ pointerMm.x.toFixed(0) }} · Y {{ pointerMm.y.toFixed(0) }} mm
      <span v-if="snapHint" class="snap-hint">{{ snapHint }}</span>
    </div>

    <div v-if="locked && !commentMode && mode !== 'view' && veilOpen" class="locked-veil">
      <div class="lv-card">
        <div class="lv-title">当前版本不可编辑</div>
        <div class="lv-sub">{{ lockedReason }}</div>
        <div class="row" style="justify-content:center">
          <button class="tiny" @click="veilOpen = false">知道了</button>
          <button class="tiny primary" @click="emit('new-version')" v-if="isMaker()">基于此版本新建版本</button>
        </div>
      </div>
    </div>
    <button v-else-if="locked && mode !== 'view'" class="lock-chip" @click="veilOpen = true">
      只读 · {{ lockedReason.slice(0, 14) }}…
    </button>

    <div v-if="commentMode" class="comment-hint">
      点画面任意位置打批注 · Esc 退出
    </div>

    <!-- inline comment composer -->
    <div
      v-if="composer"
      class="composer"
      :style="{ left: composer.screenX + 'px', top: composer.screenY + 'px' }"
      @pointerdown.stop
      @click.stop
    >
      <div class="cp-head mono">批注 @ ({{ Math.round(composer.x) }}, {{ Math.round(composer.y) }}) mm</div>
      <textarea
        ref="composerInput"
        v-model="composerText"
        rows="3"
        placeholder="写明问题与期望的修改，例如：地名与拼音行距过大，建议压缩到 1.2 倍字高。"
        @keydown.meta.enter="submitComposer"
        @keydown.ctrl.enter="submitComposer"
        @keydown.esc="composer = null"
      />
      <div class="cp-foot row">
        <span class="faint small">Ctrl+Enter 提交</span>
        <span class="spacer" />
        <button class="tiny" @click="composer = null">取消</button>
        <button class="tiny primary" :disabled="!composerText.trim()" @click="submitComposer">添加批注</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { store, activeSign, activeVersion, isMaker, commit, toast } from '../composables';
import {
  EditorRenderer, hitTestLayers, snapPoint, collectVertices, GRID,
  applyBoolean, translateLayer, scaleLayer, convertLayerToPath, buildPenLayer, rotateLayer,
} from '../core/editor.js';
import { addVersionComment, replyComment, commentStats } from '../core/store.js';
import { legibility, layerSubpaths, layerBBox } from '../core/model.js';
import { subpathsBBox, translateSubpaths, polylineSubpath, dist } from '../core/geom.js';

const props = defineProps({
  selection: { type: Object, default: () => ({ layerIds: [] }) },
  tool: { type: String, default: 'select' },
  commentMode: { type: Boolean, default: false },
  comments: { type: Array, default: () => [] },
  highlightComment: { type: Object, default: null },
  mode: { type: String, default: 'edit' },
});
const emit = defineEmits(['update:selection', 'update:commentMode', 'new-version', 'comment-created', 'cursor-mm']);

const wrap = ref(null);
const cv = ref(null);
const dprScale = ref(1);
const showGuides = ref(true);
const showGrid = ref(true);
const snapEnabled = ref(true);
const pointerMm = ref(null);
const snapHint = ref('');
const marquee = ref(null);
const hoveredLayerId = ref(null);
const veilOpen = ref(false);
let lastLockKey = '';

const view = reactive({ scale: 1, panX: 0, panY: 0 });

let renderer = null;
let ro = null;
let dpr = 1;
let raf = null;

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const doc = computed(() => version.value?.doc || null);

const locked = computed(() => {
  const s = sign.value, v = version.value;
  if (!s || !v) return true;
  if (s.status === 'closed') return true;
  if (v.status === 'submitted' || v.status === 'approved') return true;
  return !isMaker();
});
const lockedReason = computed(() => {
  const s = sign.value, v = version.value;
  if (!s || !v) return '无版本';
  if (s.status === 'closed') return '标志牌已结项，版本冻结';
  if (v.status === 'submitted') return `${v.name} 已提交审核，等待审核方处理`;
  if (v.status === 'approved') return `${v.name} 已通过审核`;
  return '当前身份为审核方，请切换到制作方身份编辑';
});

/* ---------- coordinate transforms ---------- */

function toMm(clientX, clientY) {
  const rect = cv.value.getBoundingClientRect();
  return {
    x: (clientX - rect.left - view.panX) / view.scale,
    y: (clientY - rect.top - view.panY) / view.scale,
  };
}
function toScreen(x, y) {
  return { x: view.panX + x * view.scale, y: view.panY + y * view.scale };
}

const mmPerPx = computed(() => 1 / view.scale);

/* ---------- render ---------- */

function scheduleRender() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = null;
    doRender();
  });
}

function doRender() {
  if (!renderer || !cv.value || !doc.value) return;
  const rect = wrap.value.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (cv.value.width !== w * dpr || cv.value.height !== h * dpr) {
    cv.value.width = w * dpr;
    cv.value.height = h * dpr;
    cv.value.style.width = w + 'px';
    cv.value.style.height = h + 'px';
  }
  const sel = props.selection;
  const selLayers = (sel.layerIds || []).map((id) => doc.value.layers.find((l) => l.id === id)).filter(Boolean);
  let handles = null;
  if (selLayers.length === 1 && sel.mode !== 'vertex') {
    const layer = selLayers[0];
    const bb = layer.type === 'text' ? renderer.textBB(layer) : subpathsBBox(layerSubpaths(layer, doc.value));
    handles = renderer.handlePoints(bb, false);
  }
  renderer.render(view, {
    doc: doc.value,
    dpr,
    width: w, height: h,
    scale: view.scale,
    panX: view.panX, panY: view.panY,
    selection: { ...sel, handles },
    showGuides: showGuides.value,
    showGrid: showGrid.value,
    safeMargin: doc.value.safeMargin,
    marquee: marquee.value,
    hoveredLayerId: hoveredLayerId.value,
    commentMode: props.commentMode,
    overlayComments: props.comments,
    overlayCommentsVersion: props.comments,
    legibility: legibility(doc.value),
    penPreview: drag.mode === 'pen' ? { points: drag.penPoints, cursor: pointerMm.value } : null,
    pointerScreen: props.commentMode && pointerMm.value ? toScreen(pointerMm.value.x, pointerMm.value.y) : null,
  });
}

/* ---------- viewport ---------- */

function fit() {
  if (!doc.value) return;
  userAdjusted = false;
  const rect = wrap.value.getBoundingClientRect();
  // Bottom rail reserves 88px; keep ~34px above the sign for the safe-margin label.
  const showRail = showGuides.value && legibility(doc.value).charHeight > 0;
  const padX = 56, padTop = 44, padBottom = showRail ? 92 : 56;
  const sc = Math.max(0.01, Math.min((rect.width - padX * 2) / doc.value.width, (rect.height - padTop - padBottom) / doc.value.height));
  view.scale = sc;
  dprScale.value = sc;
  view.panX = Math.round((rect.width - doc.value.width * sc) / 2);
  view.panY = Math.round(padTop + (rect.height - padTop - padBottom - doc.value.height * sc) / 2);
  scheduleRender();
}

let userAdjusted = false;
function zoomBy(f, cx, cy) {
  userAdjusted = true;
  const rect = wrap.value.getBoundingClientRect();
  const px = cx != null ? cx - rect.left : rect.width / 2;
  const py = cy != null ? cy - rect.top : rect.height / 2;
  const before = { x: (px - view.panX) / view.scale, y: (py - view.panY) / view.scale };
  view.scale = Math.max(0.02, Math.min(24, view.scale * f));
  view.panX = px - before.x * view.scale;
  view.panY = py - before.y * view.scale;
  scheduleRender();
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey || !e.shiftKey) {
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  } else {
    view.panX -= e.deltaX;
    view.panY -= e.deltaY;
    scheduleRender();
  }
}

/* ---------- interaction state ---------- */

const drag = reactive({
  mode: null, // pan | move | marquee | pen | dragvertex | resizing
  startScreen: null,
  startMm: null,
  lastMm: null,
  baseDoc: null,
  startSel: null,
  handle: null,
  penPoints: [],
  vertexRef: null,
  originDoc: null,
  moved: false,
  penDown: false,
});

onMounted(() => {
  renderer = new EditorRenderer(cv.value);
  dpr = Math.min(2.5, window.devicePixelRatio || 1);
  ro = new ResizeObserver(() => {
    // keep the sign fitted until the user zooms or pans manually
    if (!userAdjusted) fit();
    else scheduleRender();
  });
  ro.observe(wrap.value);
  window.addEventListener('keydown', onKey);
  nextTick(fit);
  // second pass after layout settles (tabs swap panes at different widths)
  setTimeout(fit, 80);
});

onBeforeUnmount(() => {
  ro?.disconnect();
  window.removeEventListener('keydown', onKey);
});

watch([doc, () => props.selection, () => props.comments, () => props.commentMode, showGuides, showGrid], scheduleRender, { deep: true });
watch([() => sign.value?.id, () => version.value?.status, () => sign.value?.status], () => {
  // Surface the read-only notice once per (sign, version, status) transition.
  const key = [sign.value?.id, version.value?.id, sign.value?.status, version.value?.status].join('|');
  if (key !== lastLockKey) {
    lastLockKey = key;
    veilOpen.value = locked.value && (version.value?.status === 'submitted' || sign.value?.status === 'closed');
  }
}, { immediate: true });

// refit when switching signs/versions or resizing the plate
watch([() => sign.value?.id, () => version.value?.id, () => doc.value?.width, () => doc.value?.height], ([, , w, h], old) => {
  if (!old || old[2] !== w || old[3] !== h || old[0] !== sign.value?.id || old[1] !== version.value?.id) {
    nextTick(fit);
  }
});

/* ---------- hit testing & snapping ---------- */

function hitAt(p) {
  if (!doc.value) return null;
  const tol = 8 / view.scale;
  return hitTestLayers(doc.value, p, tol);
}

function snap(p, activeLayerIds = []) {
  if (!snapEnabled.value) return { ...p, snappedTo: null };
  const verts = collectVertices(doc.value, activeLayerIds[0]);
  // 8 screen-pixel grid: convert to mm at the current zoom
  const gridMm = 8 / view.scale;
  const radius = Math.max(9 / view.scale, gridMm);
  const res = snapPoint(p, null, { grid: gridMm, vertices: verts, radius });
  snapHint.value = res.snappedTo ? '端点吸附' : `网格 ${gridMm.toFixed(1)}mm`;
  return res;
}

/* ---------- pointer handlers ---------- */

function onDown(e) {
  if (e.button !== 0) {
    if (e.button === 1) startPan(e);
    return;
  }
  const p = toMm(e.clientX, e.clientY);
  drag.moved = false;
  drag.startScreen = { x: e.clientX, y: e.clientY };
  drag.startMm = p;
  drag.lastMm = p;

  if (props.commentMode) {
    createPointComment(p);
    return;
  }

  if (props.tool === 'pen') {
    drag.penDown = true;
    startPen(p);
    return;
  }
  if (props.tool === 'pan' || e.altKey || e.button === 1) {
    startPan(e);
    return;
  }

  if (locked.value && props.mode !== 'view') return;

  // handles first
  const sel = props.selection;
  if ((sel.layerIds || []).length === 1 && sel.mode !== 'vertex') {
    const layer = doc.value.layers.find((l) => l.id === sel.layerIds[0]);
    if (layer) {
      const bb = layer.type === 'text' ? renderer.textBB(layer) : subpathsBBox(layerSubpaths(layer, doc.value));
      const handles = renderer.handlePoints(bb, false);
      const hs = 12 / view.scale;
      const hitH = handles.find((h) => Math.abs(p.x - h.x) < hs && Math.abs(p.y - h.y) < hs);
      if (hitH && !locked.value) {
        drag.mode = 'resize';
        drag.handle = hitH;
        drag.originDoc = JSON.parse(JSON.stringify(doc.value));
        beginDragHistory();
        return;
      }
    }
  }

  // vertex handles (path edit mode) — independent of the bbox handles above
  if (sel.mode === 'vertex' && sel.vertexLayerId && !locked.value) {
    const layer = doc.value.layers.find((l) => l.id === sel.vertexLayerId);
    if (layer) {
      if (layer.type !== 'path') convertLayerToPath(layer, doc.value);
      const subs = layerSubpaths(layer, doc.value);
      const r = 10 / view.scale;
      let found = null;
      for (let si = 0; si < subs.length && !found; si++) {
        for (let pi = 0; pi < subs[si].pts.length && !found; pi++) {
          const vp = subs[si].pts[pi];
          if (Math.hypot(vp.x - p.x, vp.y - p.y) < r) found = { si, pi };
          else {
            for (const hk of ['cOut', 'cIn']) {
              const hv = vp[hk];
              if (hv && Math.hypot(hv.x - p.x, hv.y - p.y) < r) { found = { si, pi, handle: hk }; break; }
            }
          }
        }
      }
      if (found) {
        drag.mode = 'dragvertex';
        drag.vertexRef = found;
        drag.originDoc = JSON.parse(JSON.stringify(doc.value));
        beginDragHistory();
        return;
      }
    }
  }

  const hit = hitAt(p);
  if (hit) {
    const layer = hit.layer;
    const prev = props.selection.layerIds || [];
    let ids = prev;
    if (e.shiftKey) {
      ids = ids.includes(layer.id) ? ids.filter((x) => x !== layer.id) : [...ids, layer.id];
    } else if (!ids.includes(layer.id)) {
      ids = [layer.id];
    } else {
      // already part of a multi-selection: keep it, but solo on a plain click
      ids = prev.length > 1 ? prev : [layer.id];
    }
    if (ids.length !== prev.length || ids.some((x, i) => x !== prev[i])) {
      emit('update:selection', { layerIds: ids, mode: props.selection.mode, vertexLayerId: props.selection.vertexLayerId });
      // the emit is applied on the next tick; keep dragging with the intended ids
    }
    // begin move (skip for read-only view so selecting never mutates)
    if (locked.value) return;
    drag.mode = 'move';
    drag.originDoc = JSON.parse(JSON.stringify(doc.value));
    drag.startSel = ids.slice();
    drag.captureIds = ids.slice();
    beginDragHistory();
    return;
  }

  if (!e.shiftKey) emit('update:selection', { layerIds: [], mode: 'select' });
  drag.mode = 'marquee';
  drag.marqueeStart = p;
  marquee.value = { x: 0, y: 0, w: 0, h: 0 };
  const s = toScreen(p.x, p.y);
  marquee.value = { x: s.x, y: s.y, w: 0, h: 0 };
}

function startPan(e) {
  drag.mode = 'pan';
  drag.startScreen = { x: e.clientX, y: e.clientY };
  drag.panStart = { x: view.panX, y: view.panY };
}

let historyBegan = false;
function beginDragHistory() {
  // The store records a snapshot when the drag completes; here we just reset
  // the flag used to avoid duplicate commits.
  historyBegan = false;
}

function onMove(e) {
  const p = toMm(e.clientX, e.clientY);
  pointerMm.value = p;
  emit('cursor-mm', p);

  if (drag.mode === 'pan') {
    userAdjusted = true;
    view.panX = drag.panStart.x + (e.clientX - drag.startScreen.x);
    view.panY = drag.panStart.y + (e.clientY - drag.startScreen.y);
    scheduleRender();
    return;
  }

  if (!drag.mode) {
    if (!props.commentMode && !locked.value) {
      const hit = hitAt(p);
      const id = hit ? hit.layer.id : null;
      if (id !== hoveredLayerId.value) {
        hoveredLayerId.value = id;
        scheduleRender();
      }
    }
    scheduleRender();
    return;
  }

  if ((drag.mode === 'move' || drag.mode === 'resize' || drag.mode === 'dragvertex') &&
      drag.startScreen && Math.hypot(e.clientX - drag.startScreen.x, e.clientY - drag.startScreen.y) > 2) {
    drag.moved = true;
  }

  if (drag.mode === 'marquee') {
    const s0 = toScreen(drag.marqueeStart.x, drag.marqueeStart.y);
    const s1 = toScreen(p.x, p.y);
    marquee.value = { x: Math.min(s0.x, s1.x), y: Math.min(s0.y, s1.y), w: Math.abs(s1.x - s0.x), h: Math.abs(s1.y - s0.y) };
    scheduleRender();
    return;
  }

  if (drag.mode === 'pen') {
    // click-to-place: vertices only come from pointerdown. A deliberate drag
    // (>4 screen px with the button held) draws a freehand segment.
    if (drag.penDown) {
      const sp = snap(p, []);
      const pts = drag.penPoints;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(sp.x - last.x, sp.y - last.y) > 4 / view.scale) {
        pts.push({ x: sp.x, y: sp.y });
      }
    }
    scheduleRender();
    return;
  }

  if (drag.mode === 'move') {
    const dx = p.x - drag.startMm.x;
    const dy = p.y - drag.startMm.y;
    applyMove(dx, dy, e);
    scheduleRender();
    return;
  }

  if (drag.mode === 'resize') {
    applyResize(p, e);
    scheduleRender();
    return;
  }

  if (drag.mode === 'dragvertex') {
    applyVertexDrag(p, e);
    scheduleRender();
    return;
  }
}

function onUp(e) {
  const p = drag.lastMm;
  if (drag.mode === 'pen') {
    // pen clicks are handled on pointerdown; keep the path open
    drag.penDown = false;
    drag.startScreen = null;
    scheduleRender();
    return;
  }
  if (drag.mode === 'marquee') {
    const s0 = drag.marqueeStart;
    const p1 = toMm(e.clientX, e.clientY);
    const box = { x: Math.min(s0.x, p1.x), y: Math.min(s0.y, p1.y), w: Math.abs(p1.x - s0.x), h: Math.abs(p1.y - s0.y) };
    if (box.w > 2 && box.h > 2) {
      const ids = [];
      for (const layer of doc.value.layers) {
        if (layer.locked) continue;
        const bb = layer.type === 'text' ? renderer.textBB(layer) : subpathsBBox(layerSubpaths(layer, doc.value));
        if (bb.x >= box.x && bb.y >= box.y && bb.x + bb.width <= box.x + box.w && bb.y + bb.height <= box.y + box.h) {
          ids.push(layer.id);
        }
      }
      emit('update:selection', { layerIds: ids, mode: 'select' });
    }
    marquee.value = null;
  }

  if (drag.mode === 'move' || drag.mode === 'resize' || drag.mode === 'dragvertex') {
    if (drag.moved) commit();
    else if (drag.mode === 'move' && drag.originDoc) doc.value.layers = drag.originDoc.layers;
  }

  drag.mode = null;
  drag.originDoc = null;
  drag.baseDoc = null;
  drag.marqueeStart = null;
  drag.startScreen = null;
  scheduleRender();
}

function onLeave() {
  pointerMm.value = null;
}

function onDblClick(e) {
  if (props.commentMode || locked.value) return;
  if (drag.mode === 'pen') { commitPen(false); return; }
  const p = toMm(e.clientX, e.clientY);
  const hit = hitAt(p);
  if (hit && (hit.layer.type === 'path' || hit.layer.kind === 'custom')) {
    emit('update:selection', { layerIds: [hit.layer.id], mode: 'vertex', vertexLayerId: hit.layer.id });
  }
}

/* ---------- move / resize / vertex ---------- */

function applyMove(dx, dy, e) {
  const d = doc.value;
  if (!drag.originDoc) return;
  const ids = drag.captureIds || props.selection.layerIds || [];
  // snapping: snap the primary layer's bbox top-left corner
  if (ids.length) {
    const primary = d.layers.find((l) => l.id === ids[0]);
    if (primary) {
      const orig = drag.originDoc.layers.find((l) => l.id === primary.id);
      // restore then re-apply so repeated moves don't drift
      const bb0 = orig.type === 'text' ? textBBPlain(orig) : subpathsBBox(layerSubpaths(orig, drag.originDoc));
      if (e && !e.shiftKey) {
        const target = snap({ x: bb0.x + dx, y: bb0.y + dy }, ids);
        dx = target.x - bb0.x;
        dy = target.y - bb0.y;
      }
    }
  }
  for (const id of ids) {
    const layer = d.layers.find((l) => l.id === id);
    const orig = drag.originDoc.layers.find((l) => l.id === id);
    if (!layer || !orig) continue;
    layer.type = orig.type;
    layer.kind = orig.kind;
    layer.params = JSON.parse(JSON.stringify(orig.params || {}));
    layer.subpaths = orig.subpaths ? JSON.parse(JSON.stringify(orig.subpaths)) : undefined;
    layer.x = orig.x;
    layer.y = orig.y;
    translateLayer(layer, dx, dy);
  }
}

function textBBPlain(layer) {
  const l = layer;
  return { x: layer.x, y: layer.y, width: 0, height: 0 };
}

function applyResize(p, e) {
  const d = doc.value;
  const ids = props.selection.layerIds || [];
  if (!ids.length) return;
  const layer = d.layers.find((l) => l.id === (props.selection.vertexLayerId || ids[0]));
  const orig = drag.originDoc.layers.find((l) => l.id === (props.selection.vertexLayerId || ids[0]));
  if (!layer || !orig) return;
  const bb0 = orig.type === 'text' ? renderer.textBB(orig) : subpathsBBox(layerSubpaths(orig, drag.originDoc));
  let anchorX = bb0.x + bb0.width / 2;
  let anchorY = bb0.y + bb0.height / 2;
  const h = drag.handle;
  if (h) {
    if (h.hx !== 1) anchorX = bb0.x + (h.hx === 0 ? bb0.width : 0);
    if (h.hy !== 1) anchorY = bb0.y + (h.hy === 0 ? bb0.height : 0);
  }
  // snap the moved corner
  let mx = p.x, my = p.y;
  if (snapEnabled.value && e && !e.shiftKey) {
    const sp = snap(p, ids);
    mx = sp.x; my = sp.y;
  }
  const newW = Math.max(4, Math.abs(mx - anchorX));
  const newH = Math.max(4, Math.abs(my - anchorY));
  let sx = h && h.hx === 1 ? 1 : newW / (bb0.width || 1);
  let sy = h && h.hy === 1 ? 1 : newH / (bb0.height || 1);
  if (e && e.shiftKey && h && h.corner) {
    const s = Math.max(sx, sy);
    sx = s; sy = s;
  }
  Object.assign(layer, JSON.parse(JSON.stringify(orig)));
  const res = scaleLayer(layer, d, { x: anchorX, y: anchorY }, sx, sy);
  if (res && res.resizeDoc) {
    d.width = Math.max(40, Math.round(res.resizeDoc.width));
    d.height = Math.max(40, Math.round(res.resizeDoc.height));
  }
}

function applyVertexDrag(p, e) {
  const d = doc.value;
  const layer = d.layers.find((l) => l.id === (props.selection.vertexLayerId || (props.selection.layerIds || [])[0]));
  const orig = drag.originDoc.layers.find((l) => l.id === layer?.id);
  if (!layer || !orig) return;
  layer.type = 'path';
  layer.kind = 'custom';
  layer.params = {};
  layer.subpaths = JSON.parse(JSON.stringify(orig.subpaths));
  const { si, pi, handle } = drag.vertexRef;
  const sub = layer.subpaths[si];
  if (!sub || !sub.pts[pi]) return;
  let target = p;
  if (snapEnabled.value && e && !e.shiftKey) {
    const sp = snap(p, [layer.id]);
    target = sp;
  }
  const vertex = sub.pts[pi];
  if (handle) {
    const dx = target.x - vertex.x;
    const dy = target.y - vertex.y;
    const key = handle;
    const other = key === 'cIn' ? 'cOut' : 'cIn';
    sub.pts[pi][key] = { x: target.x, y: target.y };
    if (!e || !e.altKey) {
      sub.pts[pi][other] = { x: vertex.x - dx, y: vertex.y - dy };
    }
  } else {
    const dx = target.x - vertex.x;
    const dy = target.y - vertex.y;
    vertex.x = target.x;
    vertex.y = target.y;
    for (const k of ['cIn', 'cOut']) if (vertex[k]) { vertex[k].x += dx; vertex[k].y += dy; }
  }
  if (layer.id === '') layer.id = layer.id;
}

/* ---------- pen ---------- */

const penStartDoc = ref(null);

function startPen(p) {
  const sp = snap(p, []);
  // clicking the first point again closes the polygon
  if (drag.mode === 'pen' && drag.penPoints.length > 2) {
    const first = drag.penPoints[0];
    if (Math.hypot(sp.x - first.x, sp.y - first.y) < 12 / view.scale) {
      commitPen(true);
      return;
    }
  }
  if (drag.mode !== 'pen') {
    drag.mode = 'pen';
    drag.penPoints = [{ x: sp.x, y: sp.y }];
  } else {
    drag.penPoints.push({ x: sp.x, y: sp.y });
  }
  emit('update:selection', { layerIds: [], mode: 'select' });
  scheduleRender();
}

const penDraft = ref(null);

function commitPen(closed = false) {
  const pts = drag.penPoints || [];
  if (pts.length < 2) {
    drag.mode = null;
    drag.penPoints = [];
    penDraft.value = null;
    scheduleRender();
    return;
  }
  const layer = buildPenLayer(pts, closed, { fill: closed ? '#ffffff' : null, stroke: closed ? null : '#ffffff', strokeWidth: closed ? 0 : 12 });
  layer.name = closed ? '闭合路径' : '折线路径';
  layer.id = nextLayerId();
  doc.value.layers.push(layer);
  commit();
  drag.mode = null;
  drag.penPoints = [];
  penDraft.value = null;
  emit('update:selection', { layerIds: [layer.id], mode: 'select' });
  scheduleRender();
}

let layerSeq = 0;
function nextLayerId() {
  return 'L_' + Date.now().toString(36) + (layerSeq++).toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---------- comments ---------- */

const composer = ref(null);
const composerText = ref('');
const composerInput = ref(null);

function createPointComment(p) {
  const v = version.value;
  if (!v) return;
  const s = toScreen(p.x, p.y);
  const rect = wrap.value.getBoundingClientRect();
  composerText.value = '';
  composer.value = {
    x: Math.round(p.x), y: Math.round(p.y),
    screenX: Math.min(Math.max(8, s.x + 16), rect.width - 290),
    screenY: Math.min(Math.max(8, s.y - 20), rect.height - 150),
  };
  nextTick(() => composerInput.value?.focus());
}

function submitComposer() {
  const v = version.value;
  if (!v || !composer.value || !composerText.value.trim()) return;
  addVersionComment({
    version: v, kind: 'point',
    x: composer.value.x, y: composer.value.y,
    text: composerText.value.trim(),
  });
  composer.value = null;
  composerText.value = '';
  emit('comment-created');
}

/* ---------- keyboard ---------- */

function onKey(e) {
  if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.key === 'Escape') {
    if (composer.value) { composer.value = null; return; }
    if (drag.mode === 'pen') commitPen(false);
    else if (props.commentMode) emit('update:commentMode', false);
    else emit('update:selection', { layerIds: [], mode: 'select' });
    return;
  }
  if (e.key === 'Enter' && drag.mode === 'pen') { commitPen(false); return; }
  if (e.shiftKey && e.key === 'c' && drag.mode === 'pen') { commitPen(true); return; }
  if (props.tool === 'pen' && drag.mode === 'pen') {
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) { drag.penPoints.pop(); scheduleRender(); }
  }
  // arrow-key nudge: one 8-px grid step, Shift for four steps
  if (!locked.value && (props.selection.layerIds || []).length && /^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown)$/.test(e.key)) {
    e.preventDefault();
    const gridMm = 8 / view.scale;
    const steps = e.shiftKey ? 4 : 1;
    const dx = e.key === 'ArrowLeft' ? -gridMm * steps : e.key === 'ArrowRight' ? gridMm * steps : 0;
    const dy = e.key === 'ArrowUp' ? -gridMm * steps : e.key === 'ArrowDown' ? gridMm * steps : 0;
    for (const id of props.selection.layerIds) {
      const l = doc.value.layers.find((x) => x.id === id);
      if (l && !l.locked) translateLayer(l, dx, dy);
    }
    commit();
    scheduleRender();
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (!locked.value && (props.selection.layerIds || []).length) {
      e.preventDefault();
      const ids = new Set(props.selection.layerIds);
      doc.value.layers = doc.value.layers.filter((l) => !(ids.has(l.id) && l.kind !== 'plate'));
      commit();
      emit('update:selection', { layerIds: [], mode: 'select' });
      scheduleRender();
    }
  }
}

/* ---------- public ---------- */

function cancelPen() {
  if (drag.mode === 'pen') {
    drag.mode = null;
    drag.penPoints = [];
    penDraft.value = null;
    scheduleRender();
  }
}

function setTool(t) {
  if (t !== 'pen') cancelPen();
}

function getCanvasSize() {
  return { w: wrap.value.clientWidth, h: wrap.value.clientHeight };
}

defineExpose({ fit, zoomBy, cancelPen, setTool, getCanvasSize, view });

watch(() => props.tool, (t) => { if (t !== 'pen') cancelPen(); });
watch(() => props.commentMode, () => scheduleRender());
watch(() => props.highlightComment, () => scheduleRender());
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #20242b;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: default;
}
.comment-mode canvas { cursor: crosshair; }
.hud {
  position: absolute; top: 10px; right: 10px;
  display: flex; align-items: center; gap: 2px;
  padding: 3px;
  background: rgba(16, 20, 26, 0.9);
  border: 1px solid var(--line);
  border-radius: 7px;
  backdrop-filter: blur(6px);
}
.hud button { padding: 2px 7px; font-size: 11px; }
.pct { min-width: 38px; text-align: center; color: var(--text-dim); font-size: 10.5px; }
.sep { width: 1px; height: 15px; background: var(--line); margin: 0 3px; }
.readout {
  position: absolute; bottom: 74px; left: 12px;
  background: rgba(16,20,26,0.82);
  border: 1px solid var(--line-soft);
  padding: 2px 9px; border-radius: 6px; color: var(--text-dim); font-size: 10.5px;
}
.snap-hint { color: var(--amber); margin-left: 7px; }
.comment-hint {
  position: absolute; top: 10px; left: 12px;
  background: rgba(58, 47, 22, 0.94); border: 1px solid #5c4a22;
  color: #ffc971; padding: 4px 11px; border-radius: 6px; font-size: 11.5px;
}
.composer {
  position: absolute;
  width: 274px;
  background: #121820;
  border: 1px solid #5c4a22;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  padding: 8px;
  display: flex; flex-direction: column; gap: 6px;
  z-index: 50;
}
.cp-head { font-size: 10.5px; color: #ffc971; }
.composer textarea { font-size: 12px; resize: none; }
.cp-foot { gap: 5px; }
.locked-veil {
  position: absolute; inset: 0;
  background: rgba(10, 13, 17, 0.28);
  display: flex; justify-content: center; align-items: flex-start;
  pointer-events: none;
  padding-top: 70px;
}
.lock-chip {
  position: absolute; top: 10px; left: 12px; font-size: 11px;
  background: rgba(58, 47, 22, 0.92); border: 1px solid #5c4a22; color: #ffc971;
  border-radius: 6px; padding: 3px 9px;
}
.lv-card {
  pointer-events: auto;
  flex: 0 0 auto;
  background: var(--panel); border: 1px solid var(--line);
  border-radius: 9px; padding: 16px 22px; text-align: center;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  max-width: 340px;
}
.lv-title { font-weight: 600; color: #ffc971; margin-bottom: 4px; }
.lv-sub { color: var(--text-dim); font-size: 12px; margin-bottom: 10px; }
</style>
