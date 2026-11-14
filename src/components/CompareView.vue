<template>
  <div class="compare-view">
    <div v-if="!sign" class="empty"><div>未选择标志牌</div></div>
    <div v-else-if="sign.versions.length < 2" class="empty">
      <div>该标志牌只有 {{ sign.versions.length }} 个版本</div>
      <div class="faint small">新建版本后即可并排叠加对比</div>
      <button class="tiny" @click="$emit('new-version')" v-if="isMaker()">＋ 新建版本</button>
    </div>
    <template v-else>
      <div class="cmp-bar">
        <div class="row">
          <label class="faint small">版本 A</label>
          <select v-model="idA" class="ver-select">
            <option v-for="v in sign.versions" :key="v.id" :value="v.id">{{ v.name }} · {{ vlabel(v) }}</option>
          </select>
          <label class="faint small">版本 B</label>
          <select v-model="idB" class="ver-select">
            <option v-for="v in sign.versions" :key="v.id" :value="v.id">{{ v.name }} · {{ vlabel(v) }}</option>
          </select>
        </div>
        <span class="sep" />
        <div class="seg">
          <button class="tiny" :class="{ active: mode === 'sidebyside' }" @click="mode = 'sidebyside'">并排</button>
          <button class="tiny" :class="{ active: mode === 'overlay' }" @click="mode = 'overlay'">叠加</button>
          <button class="tiny" :class="{ active: mode === 'diffonly' }" @click="mode = 'diffonly'">仅看差异</button>
        </div>
        <span class="sep" />
        <button class="tiny" :class="{ active: showDiff }" @click="showDiff = !showDiff">差异高亮</button>
        <span class="spacer" />
        <span class="mono small dim">差异元素 {{ diff.changedNames.length }} 个</span>
      </div>

      <div class="cmp-body" :class="mode">
        <div class="sheet" v-if="mode !== 'diffonly'">
          <div class="sheet-label">
            <span class="tag slate">{{ docA.name }}</span>
            <span class="faint small">{{ docA.submittedAt ? '提交 ' + date(docA.submittedAt) : '创建 ' + date(docA.createdAt) }}</span>
            <span v-if="idA === sign.activeVersionId" class="tag blue">当前</span>
          </div>
          <div class="cv-wrap">
            <canvas ref="cvA" @pointermove="onMove($event, 'A')" @pointerleave="cursorA = null" />
            <div class="ov" v-if="mode === 'overlay'">
              <canvas ref="ov" />
            </div>
            <div v-if="mode === 'overlay'" class="opacity-ctl">
              <label class="small faint">叠加透明度</label>
              <input type="range" min="0" max="100" v-model.number="overlayOpacity" />
              <span class="mono small">{{ overlayOpacity }}%</span>
            </div>
          </div>
        </div>
        <div class="sheet" v-if="mode === 'sidebyside'">
          <div class="sheet-label">
            <span class="tag slate">{{ docB.name }}</span>
            <span class="faint small">{{ docB.submittedAt ? '提交 ' + date(docB.submittedAt) : '创建 ' + date(docB.createdAt) }}</span>
            <span v-if="idB === sign.activeVersionId" class="tag blue">当前</span>
          </div>
          <div class="cv-wrap">
            <canvas ref="cvB" @pointermove="onMove($event, 'B')" @pointerleave="cursorB = null" />
          </div>
        </div>
        <div class="sheet" v-if="mode === 'diffonly'">
          <div class="sheet-label">
            <span class="tag amber">差异视图</span>
            <span class="faint small">红色为 {{ docB.name }} 相对 {{ docA.name }} 的变化区域</span>
          </div>
          <div class="cv-wrap">
            <canvas ref="cvD" @pointermove="onMove($event, 'D')" @pointerleave="cursorD = null" />
          </div>
        </div>
      </div>

      <div class="cmp-foot">
        <div class="diff-list panel">
          <div class="dl-head row">
            <span class="section-title" style="padding:0">差异清单</span>
            <span class="spacer" />
            <span class="faint small mono">{{ diff.changedNames.length }}</span>
          </div>
          <div class="dl-body scroll">
            <div v-if="!diff.changedNames.length" class="empty small">两个版本版面完全一致</div>
            <div v-for="n in diff.changedNames" :key="n" class="dl-row">
              <span class="dotmark" />
              <span>{{ n }}</span>
            </div>
          </div>
        </div>
        <div class="cmp-legend small faint">
          A/B 两侧等比缩放；粉色虚线框 = 该元素在两版之间发生了变化（外包框）。<br />
          叠加模式下低透明度版本压在另一版上，位移与线宽差异可直接目测。
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { activeSign, activeVersion, isMaker } from '../composables';
import { EditorRenderer, diffRingsBetween } from '../core/editor.js';
import { subpathsBBox } from '../core/geom.js';

defineEmits(['new-version']);

const sign = computed(() => activeSign());
const versions = computed(() => sign.value?.versions || []);

const idA = ref(null);
const idB = ref(null);
const mode = ref('sidebyside');
const showDiff = ref(true);
const overlayOpacity = ref(55);

const cvA = ref(null), cvB = ref(null), ov = ref(null), cvD = ref(null);
const cursorA = ref(null), cursorB = ref(null), cursorD = ref(null);

watch(sign, () => {
  const vs = versions.value;
  if (vs.length >= 2) {
    idB.value = vs[vs.length - 1].id;
    idA.value = vs[vs.length - 2].id;
  }
}, { immediate: true });

const docA = computed(() => versions.value.find((v) => v.id === idA.value) || versions.value[0] || {});
const docB = computed(() => versions.value.find((v) => v.id === idB.value) || versions.value[versions.value.length - 1] || {});

const diff = computed(() => {
  if (!docA.value.doc || !docB.value.doc) return { rings: [], changedNames: [] };
  return diffRingsBetween(docA.value.doc, docB.value.doc);
});

const renderers = new Map();
let raf = null;

function vlabel(v) {
  return { draft: '草稿', submitted: '审核中', returned: '已退回', approved: '已通过' }[v.status] || v.status;
}
function date(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function ensureRenderer(name, canvas) {
  if (!canvas) return null;
  if (!renderers.has(name) || renderers.get(name).canvas !== canvas) {
    renderers.set(name, new EditorRenderer(canvas));
  }
  return renderers.get(name);
}

function renderAll() {
  if (!docA.value.doc || !docB.value.doc) return;
  nextTick(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (mode.value !== 'diffonly') {
      drawSheet(cvA.value, renderers, 'A', docA.value.doc, docB.value, mode.value === 'overlay');
    }
    if (mode.value === 'sidebyside') {
      drawSheet(cvB.value, renderers, 'B', docB.value.doc, docA.value, false);
    }
    if (mode.value === 'overlay') {
      drawOverlay();
    }
    if (mode.value === 'diffonly') {
      drawDiffOnly();
    }
  });
}

function setupCanvas(canvas) {
  if (!canvas) return null;
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  return { w, h, dpr };
}

function fitView(doc, w, h, dpr) {
  const pad = 26;
  const scale = Math.min((w - pad * 2) / doc.width, (h - pad * 2) / doc.height);
  return { scale, panX: (w - doc.width * scale) / 2, panY: (h - doc.height * scale) / 2 };
}

function drawSheet(canvas, map, name, doc, otherVersion, ghost) {
  if (!canvas) return;
  const size = setupCanvas(canvas);
  if (!size) return;
  const r = ensureRenderer(name, canvas);
  const { w, h, dpr } = size;
  const view = fitView(doc, w, h, dpr);
  r.render(view, {
    doc, dpr, width: w, height: h, scale: view.scale, panX: view.panX, panY: view.panY,
    selection: { layerIds: [] },
    showGuides: false, showGrid: false,
    safeMargin: doc.safeMargin,
    hoveredLayerId: null, commentMode: false, overlayComments: [],
    legibility: null,
    compare: null,
  });
  if (showDiff.value && diff.value.rings.length) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(view.panX, view.panY);
    ctx.scale(view.scale, view.scale);
    ctx.strokeStyle = 'rgba(255,45,111,0.9)';
    ctx.lineWidth = 2 / view.scale;
    ctx.setLineDash([6 / view.scale, 4 / view.scale]);
    for (const ring of diff.value.rings) {
      ctx.beginPath();
      ring.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawOverlay() {
  const canvas = ov.value;
  if (!canvas) return;
  const size = setupCanvas(canvas);
  if (!size) return;
  const { w, h, dpr } = size;
  const doc = docB.value.doc;
  const view = fitView(doc, w, h, dpr);
  const r = ensureRenderer('OV', canvas);
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.clearRect(0, 0, w, h);
  r.ctx.globalAlpha = overlayOpacity.value / 100;
  r.render(view, {
    doc, dpr, width: w, height: h, scale: view.scale, panX: view.panX, panY: view.panY,
    selection: { layerIds: [] }, showGuides: false, showGrid: false,
    safeMargin: doc.safeMargin, hoveredLayerId: null, commentMode: false,
    overlayComments: [], legibility: null, compare: null,
    transparentBg: true,
  });
  r.ctx.globalAlpha = 1;
}

function drawDiffOnly() {
  const canvas = cvD.value;
  if (!canvas) return;
  const size = setupCanvas(canvas);
  if (!size) return;
  const { w, h, dpr } = size;
  const doc = docB.value.doc;
  const view = fitView(doc, w, h, dpr);
  const r = ensureRenderer('D', canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#20242b';
  ctx.fillRect(0, 0, w, h);
  // ghost of B
  ctx.save();
  ctx.translate(view.panX, view.panY);
  ctx.scale(view.scale, view.scale);
  ctx.globalAlpha = 0.16;
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const p = r.pathFor(layer, doc);
    if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(p); }
    if (layer.stroke && layer.strokeWidth) { ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth; ctx.stroke(p); }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,45,111,0.4)';
  ctx.strokeStyle = '#ff2d6f';
  ctx.lineWidth = 2.4 / view.scale;
  for (const ring of diff.value.rings) {
    ctx.beginPath();
    ring.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function schedule() {
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => { raf = null; renderAll(); });
}

watch([docA, docB, mode, showDiff], schedule, { deep: true });
watch(overlayOpacity, () => { if (mode.value === 'overlay') drawOverlay(); });

let ro = null;
onMounted(() => {
  schedule();
  ro = new ResizeObserver(schedule);
  const el = document.querySelector('.cmp-body');
  if (el) ro.observe(el);
});
onBeforeUnmount(() => ro?.disconnect());

function onMove(e, which) {}
</script>

<style scoped>
.compare-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.cmp-bar {
  height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: var(--panel); border-bottom: 1px solid var(--line); flex-shrink: 0;
}
.ver-select { width: auto; min-width: 132px; font-size: 11.5px; padding: 3px 7px; background: var(--panel-2); }
.seg { display: flex; gap: 2px; }
.sep { width: 1px; height: 18px; background: var(--line); margin: 0 4px; }
.cmp-body { flex: 1; display: flex; min-height: 0; gap: 1px; background: var(--line); }
.sheet { flex: 1; display: flex; flex-direction: column; min-width: 0; background: #20242b; }
.sheet-label {
  height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: rgba(16,20,26,0.8); border-bottom: 1px solid var(--line-soft);
}
.cv-wrap { flex: 1; position: relative; min-height: 0; }
.cv-wrap canvas { display: block; position: absolute; inset: 0; }
.ov { position: absolute; inset: 0; pointer-events: none; }
.opacity-ctl {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 8px;
  background: rgba(16,20,26,0.9); border: 1px solid var(--line); border-radius: 7px;
  padding: 4px 12px; width: 260px;
}
.opacity-ctl input { flex: 1; }
.cmp-foot { display: flex; gap: 12px; padding: 10px 12px; border-top: 1px solid var(--line); background: var(--panel); flex-shrink: 0; }
.diff-list { width: 300px; max-height: 150px; display: flex; flex-direction: column; }
.dl-head { padding: 6px 9px; border-bottom: 1px solid var(--line-soft); }
.dl-body { overflow: auto; padding: 5px; }
.dl-row { display: flex; align-items: center; gap: 7px; padding: 2px 4px; font-size: 12px; }
.dotmark { width: 6px; height: 6px; border-radius: 50%; background: #ff2d6f; flex-shrink: 0; }
.cmp-legend { flex: 1; align-self: center; line-height: 1.7; }
</style>
