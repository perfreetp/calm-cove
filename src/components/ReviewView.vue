<template>
  <div class="review-view">
    <div v-if="!sign" class="empty"><div>未选择标志牌</div></div>
    <template v-else>
      <div class="review-bar">
        <div class="row">
          <span class="section-title" style="padding:0">批注</span>
          <span class="tag slate">{{ version?.name }}</span>
          <span class="tag amber" v-if="stats.open">待处理 {{ stats.open }}</span>
          <span class="tag blue" v-if="stats.replied">待确认 {{ stats.replied }}</span>
          <span class="tag green" v-if="stats.closed">已关闭 {{ stats.closed }}</span>
        </div>
        <span class="spacer" />
        <button
          class="tiny"
          :class="{ active: commentMode }"
          :disabled="!canAnnotate"
          @click="commentMode = !commentMode"
        >{{ commentMode ? '打点中… 点击画面' : '＋ 画面打点批注' }}</button>
        <button class="tiny" @click="openLayerComment(presetLayerId)" :disabled="!canAnnotate">＋ 元素批注</button>
        <button class="tiny" @click="showClosed = !showClosed">{{ showClosed ? '隐藏已关闭' : '显示已关闭' }}</button>
      </div>

      <div class="review-main">
        <section class="canvas-area">
          <SignCanvas
            ref="canvas"
            mode="view"
            :selection="selection"
            :tool="'select'"
            :comment-mode="commentMode"
            :comments="visibleComments"
            :highlight-comment="highlightId"
            @update:selection="onCanvasSelect"
            @update:comment-mode="commentMode = $event"
            @comment-created="onCommentCreated"
          />
          <div class="legend small">
            <span><i class="pd open" /> 待处理</span>
            <span><i class="pd replied" /> 待确认</span>
            <span><i class="pd closed" /> 已关闭</span>
            <span class="sep-dot">·</span>
            <span>点选元素后可按「元素批注」定向提意见</span>
          </div>
        </section>

        <aside class="layer-rail">
          <LayerList
            :doc="version.doc"
            :selection="selection"
            :comments="versionComments"
            :commentable="canAnnotate"
            @update:selection="onCanvasSelect"
            @comment-layer="l => openLayerComment(l.id)"
          />
        </aside>

        <aside class="threads panel">
          <div class="panel-head row">
            <span class="section-title" style="padding:0">批注列表</span>
            <span class="spacer" />
            <span class="faint small mono">{{ list.length }}</span>
          </div>
          <div class="thread-list scroll">
            <div v-if="!list.length" class="empty small">还没有批注。切到审核方身份，在画面上打点或选中图层提意见。</div>
            <div
              v-for="c in list"
              :key="c.id"
              class="thread"
              :class="[c.status, { hl: highlightId === c.id }]"
              @click="focusComment(c)"
            >
              <div class="th-head">
                <span class="no mono">#{{ c.no }}</span>
                <span class="kind small" :class="c.kind === 'layer' ? 'blue' : 'amber'">
                  {{ c.kind === 'layer' ? '元素批注' : '画面打点' }}
                </span>
                <span v-if="c.carriedFrom" class="tag slate tiny-tag">沿用自上一版</span>
                <span class="spacer" />
                <span class="tag" :class="statusTone(c.status)">{{ statusLabel(c.status) }}</span>
              </div>
              <div class="th-target small faint" v-if="c.kind === 'layer' && layerName(c.layerId)">
                图层：{{ layerName(c.layerId) }}
              </div>
              <div class="th-target small faint" v-else-if="c.kind === 'point'">
                位置：({{ c.x }}, {{ c.y }}) mm
              </div>
              <div class="th-text">{{ c.text }}</div>
              <div class="th-meta small faint">{{ c.author }} · {{ fmtDate(c.createdAt) }}</div>

              <div v-if="c.replies.length" class="replies">
                <div v-for="(r, i) in c.replies" :key="i" class="reply">
                  <span class="tag" :class="r.action === 'declined' ? 'slate' : 'green'">{{ r.action === 'declined' ? '不修改' : '已处理' }}</span>
                  <span class="rt">{{ r.text }}</span>
                  <span class="rm small faint">{{ r.author }} · {{ fmtDate(r.createdAt) }}</span>
                </div>
              </div>

              <div v-if="c.status === 'closed'" class="closed-meta small faint">
                ✓ {{ c.closedBy }} 于 {{ fmtDate(c.closedAt) }} 确认关闭
                <button v-if="isReviewer" class="tiny ghost" @click.stop="onReopen(c)">重开</button>
              </div>

              <!-- maker reply -->
              <div v-if="c.status !== 'closed' && isMakerUser" class="reply-box" @click.stop>
                <textarea v-model="drafts[c.id].text" rows="2" placeholder="说明如何处理，或写明不改的理由…" />
                <div class="row">
                  <button class="tiny" @click="submitReply(c, 'fixed')" :disabled="!drafts[c.id].text.trim()">已处理</button>
                  <button class="tiny" @click="submitReply(c, 'declined')" :disabled="!drafts[c.id].text.trim()">不修改</button>
                  <span class="spacer" />
                  <span class="faint small" v-if="c.replies.length">已回复 {{ c.replies.length }} 次</span>
                </div>
              </div>

              <!-- reviewer actions -->
              <div v-if="c.status === 'replied' && isReviewer" class="row" @click.stop>
                <button class="tiny primary" @click="onClose(c)">确认关闭</button>
                <button class="tiny" @click="onReopen(c)">仍不满意，退回</button>
              </div>
              <div v-else-if="c.status === 'open' && isReviewer" class="row" @click.stop>
                <span class="faint small">等待制作方回复</span>
                <span class="spacer" />
                <button class="tiny danger" @click="onDelete(c)">删除</button>
              </div>
            </div>
          </div>
          <div class="panel-foot">
            <div class="row small">
              <span :class="stats.blocking ? 'warnc' : 'okc'">
                {{ stats.blocking ? `${stats.blocking} 条批注未关闭` : '批注已全部关闭' }}
              </span>
              <span class="spacer" />
              <button class="tiny primary" :disabled="!canApprove" @click="onApprove">审核通过并结项</button>
            </div>
            <div v-if="!canApprove" class="faint small" style="margin-top:4px">{{ approveHint }}</div>
          </div>
        </aside>
      </div>

      <AddLayerComment
        v-if="showAddLayerComment"
        :doc="version.doc"
        :preset-layer-id="presetLayerId"
        @close="showAddLayerComment = false"
        @create="onLayerComment"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import SignCanvas from './SignCanvas.vue';
import AddLayerComment from './AddLayerComment.vue';
import LayerList from './LayerList.vue';
import { store, activeSign, activeVersion, isMaker, toast } from '../composables';
import {
  addVersionComment, replyComment, closeComment, reopenComment, deleteComment,
  commentStats, approveVersion, canExportPackage,
} from '../core/store.js';

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const isMakerUser = computed(() => store.currentUser === 'maker');
const isReviewer = computed(() => store.currentUser === 'reviewer');
const canAnnotate = computed(() => {
  if (!version.value) return false;
  return isReviewer.value && version.value.status === 'submitted';
});

const commentMode = ref(false);
const showClosed = ref(true);
const showAddLayerComment = ref(false);
const presetLayerId = ref('');
const selection = ref({ layerIds: [], mode: 'select' });
const highlightId = ref(null);
const canvas = ref(null);
const drafts = ref({});

const versionComments = computed(() =>
  (sign.value?.comments || []).filter((c) => c.versionId === version.value?.id)
);

const list = computed(() => {
  let l = versionComments.value;
  if (!showClosed.value) l = l.filter((c) => c.status !== 'closed');
  const order = { open: 0, replied: 1, closed: 2 };
  return [...l].sort((a, b) => order[a.status] - order[b.status] || a.no - b.no);
});

const visibleComments = computed(() => (showClosed.value ? versionComments.value : versionComments.value.filter((c) => c.status !== 'closed')));

const stats = computed(() => commentStats(sign.value, version.value));

const canApprove = computed(() =>
  isReviewer.value && version.value?.status === 'submitted' && stats.value.blocking === 0
);
const approveHint = computed(() => {
  if (!isReviewer.value) return '切换到审核方身份后可结项';
  if (version.value?.status !== 'submitted') return '仅审核中的版本可结项';
  return `还有 ${stats.value.blocking} 条批注未关闭，不能结项`;
});

watch(versionComments, (v) => {
  for (const c of v) if (!drafts.value[c.id]) drafts.value[c.id] = { text: '' };
}, { immediate: true });

watch(canAnnotate, (v) => { if (!v) commentMode.value = false; });

function layerName(id) {
  if (!id || !version.value) return '';
  return version.value.doc.layers.find((l) => l.id === id)?.name || '（已删除图层）';
}

function statusLabel(s) {
  return { open: '待处理', replied: '待确认', closed: '已关闭' }[s] || s;
}
function statusTone(s) {
  return { open: 'amber', replied: 'blue', closed: 'green' }[s] || 'slate';
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function focusComment(c) {
  highlightId.value = c.id;
}

function onCommentCreated() {
  commentMode.value = false;
  toast('批注已添加', 'success');
}

function submitReply(c, action) {
  const d = drafts.value[c.id];
  const res = replyComment(c.id, { text: d.text, action });
  toast(res.message, res.ok ? 'success' : 'warn');
  if (res.ok) d.text = '';
}

function onClose(c) {
  const res = closeComment(c.id);
  toast(res.message, res.ok ? 'success' : 'warn');
}
function onReopen(c) {
  const res = reopenComment(c.id);
  toast(res.message, res.ok ? 'success' : 'warn');
}
function onDelete(c) {
  const res = deleteComment(c.id);
  toast(res.message, res.ok ? 'success' : 'warn');
}

function onCanvasSelect(sel) {
  selection.value = sel;
  if (canAnnotate.value && sel.layerIds?.length === 1) {
    // keep the selection; the toolbar button can now target this element
    presetLayerId.value = sel.layerIds[0];
  }
}

function openLayerComment(layerId = '') {
  presetLayerId.value = layerId;
  showAddLayerComment.value = true;
}

function onLayerComment({ layerId, text }) {
  const res = addVersionComment({ version: version.value, kind: 'layer', layerId, text });
  showAddLayerComment.value = false;
  if (res) toast('元素批注已添加', 'success');
}

function onApprove() {
  const res = approveVersion(sign.value, version.value);
  toast(res.message, res.ok ? 'success' : 'error');
}
</script>

<style scoped>
.review-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.review-bar {
  height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  background: var(--panel); border-bottom: 1px solid var(--line); flex-shrink: 0;
}
.review-main { flex: 1; display: flex; min-height: 0; }
.canvas-area { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
.legend {
  position: absolute; bottom: 10px; right: 12px; display: flex; gap: 12px;
  background: rgba(16,20,26,0.85); padding: 3px 10px; border-radius: 6px; border: 1px solid var(--line-soft);
  color: var(--text-dim); pointer-events: none;
}
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.legend i.open { background: var(--amber); }
.legend i.replied { background: var(--sky); }
.legend i.closed { background: var(--green); }
.sep-dot { color: var(--text-faint); }
.layer-rail {
  width: 208px; flex-shrink: 0; border-left: 1px solid var(--line);
  background: var(--panel); display: flex; flex-direction: column; min-height: 0;
}
.layer-rail :deep(.layers) { border: none; border-radius: 0; height: 100%; }
.threads { width: 350px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--line); border-radius: 0; border-top: none; border-right: none; border-bottom: none; }
.panel-head { padding: 9px 11px 7px; border-bottom: 1px solid var(--line-soft); }
.thread-list { flex: 1; overflow: auto; padding: 8px; display: flex; flex-direction: column; gap: 7px; }
.thread {
  border: 1px solid var(--line-soft); border-radius: 7px; padding: 8px 9px;
  background: var(--panel-2); cursor: pointer; transition: border-color .12s;
}
.thread:hover { border-color: #3a4655; }
.thread.hl { border-color: var(--accent-dim); box-shadow: 0 0 0 1px rgba(59,157,255,0.25); }
.thread.open { border-left: 3px solid var(--amber); }
.thread.replied { border-left: 3px solid var(--sky); }
.thread.closed { border-left: 3px solid var(--green); opacity: 0.85; }
.th-head { display: flex; align-items: center; gap: 6px; }
.no { color: var(--text-faint); font-size: 10.5px; }
.kind { font-weight: 550; }
.kind.blue { color: #7fc0f5; }
.kind.amber { color: #ffc971; }
.tiny-tag { padding: 0 5px; font-size: 9.5px; line-height: 14px; }
.th-target { margin-top: 2px; }
.th-text { margin: 5px 0 3px; font-size: 12.5px; line-height: 1.55; }
.th-meta { margin-bottom: 2px; }
.replies { margin-top: 6px; display: flex; flex-direction: column; gap: 5px; border-left: 2px solid var(--line); padding-left: 8px; }
.reply { font-size: 12px; display: flex; flex-direction: column; gap: 2px; }
.rt { color: var(--text); }
.rm { }
.reply-box { margin-top: 7px; display: flex; flex-direction: column; gap: 5px; }
.reply-box textarea { font-size: 12px; }
.closed-meta { margin-top: 5px; display: flex; align-items: center; gap: 6px; color: var(--green); }
.panel-foot { padding: 9px 11px; border-top: 1px solid var(--line-soft); background: #141920; }
.okc { color: var(--green); }
.warnc { color: var(--amber); }
</style>
