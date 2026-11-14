<template>
  <div class="details-view scroll">
    <div v-if="!sign" class="empty"><div>未选择标志牌</div></div>
    <template v-else>
      <div class="cols">
        <!-- left column: versions + review trail -->
        <div class="col-main">
          <section class="panel pad">
            <div class="row">
              <h3>版本</h3>
              <span class="spacer" />
              <button class="tiny" @click="emit('new-version')" :disabled="!isMaker() || sign.status === 'closed'">＋ 新建版本</button>
            </div>
            <div class="ver-table">
              <div class="vt-row head">
                <span>版本</span><span>状态</span><span>提交</span><span>通过</span><span>批注</span><span>投产包</span>
              </div>
              <div v-for="v in sign.versions" :key="v.id" class="vt-row" :class="{ cur: v.id === sign.activeVersionId }">
                <span class="mono">{{ v.name }}</span>
                <span><span class="tag" :class="vTone(v.status)">{{ vLabel(v.status) }}</span></span>
                <span class="faint small mono">{{ v.submittedAt ? v.submittedAt.slice(0, 10) : '—' }}</span>
                <span class="faint small mono">{{ v.approvedAt ? v.approvedAt.slice(0, 10) : '—' }}</span>
                <span class="mono small">{{ commentsFor(v).length }} / {{ commentsFor(v).filter(c => c.status === 'closed').length }} 关</span>
                <span>
                  <span v-if="v.packageExportedAt" class="tag green tiny-tag">已导出</span>
                  <span v-else class="faint small">—</span>
                </span>
              </div>
            </div>

            <div class="divider" />
            <div class="row wrap">
              <button class="tiny" @click="doExportSvg">导出 SVG（刻字机）</button>
              <button class="tiny" @click="doExportPng">导出预览 PNG</button>
              <button class="tiny primary" :disabled="!pkgReady.ok" @click="doExportPackage">导出投产包 .zip</button>
              <span class="spacer" />
              <span class="small" :class="pkgReady.ok ? 'okc' : 'warnc'">
                {{ pkgReady.ok ? '可导出投产包' : pkgReady.reason }}
              </span>
            </div>
            <div v-if="!pkgReady.ok" class="faint small" style="margin-top:6px">
              结项规则：本版所有批注必须关闭，版本通过审核且标志牌状态为「已结项」。
            </div>
          </section>

          <section class="panel pad">
            <h3>审片记录</h3>
            <div v-if="!sign.comments.length" class="empty small">暂无批注</div>
            <div v-for="c in sign.comments" :key="c.id" class="rec">
              <div class="row">
                <span class="mono faint small">#{{ c.no }}</span>
                <span class="tag" :class="c.kind === 'layer' ? 'blue' : 'amber'">{{ c.kind === 'layer' ? '元素' : '打点' }}</span>
                <span class="tag" :class="c.status === 'closed' ? 'green' : c.status === 'replied' ? 'sky' : 'amber'">{{ cLabel(c.status) }}</span>
                <span class="faint small">{{ versionName(c.versionId) }}</span>
                <span class="spacer" />
                <span class="faint small">{{ c.author }}</span>
              </div>
              <div class="rec-text">{{ c.text }}</div>
              <div v-for="(r, i) in c.replies" :key="i" class="rec-reply small">
                ↳ <span :class="r.action === 'declined' ? 'dim' : 'okc'">{{ r.action === 'declined' ? '不修改' : '已处理' }}</span>
                · {{ r.text }}
              </div>
              <div v-if="c.status === 'closed'" class="faint small">✓ {{ c.closedBy }} 关闭</div>
            </div>
          </section>
        </div>

        <!-- right column: BOM, process, 3D snapshot -->
        <div class="col-side">
          <section class="panel pad">
            <div class="row"><h3>材料清单</h3><span class="spacer" /><span class="faint small">自动按版面面积估算</span></div>
            <div class="bom">
              <div class="bom-row head">
                <span>名称</span><span>规格</span><span>数量</span>
              </div>
              <div v-for="(r, i) in bom.rows" :key="i" class="bom-row">
                <span>{{ r.item }}</span>
                <span class="faint small">{{ r.spec }}</span>
                <span class="mono">{{ r.qty }} {{ r.unit }}</span>
              </div>
            </div>
            <div class="bom-totals small faint">
              板面积 {{ bom.totals.plateAreaM2 }} m² · 膜 {{ bom.totals.filmM2 }} m² · 板重 ≈ {{ bom.totals.plateWeight }} kg
            </div>
          </section>

          <section class="panel pad">
            <div class="row"><h3>工艺说明</h3><span class="spacer" />
              <button class="tiny" @click="doExportProcess">导出 .md</button>
            </div>
            <pre class="process scroll">{{ processText }}</pre>
          </section>

          <section class="panel pad">
            <div class="row"><h3>状态摘要</h3></div>
            <div class="kv"><span class="faint">状态</span><span class="tag" :class="STATUS[sign.status].tone">{{ STATUS[sign.status].label }}</span></div>
            <div class="kv"><span class="faint">修改轮次</span><b class="mono">R{{ sign.round }}</b></div>
            <div class="kv"><span class="faint">截止日期</span><span class="mono">{{ sign.dueDate }}</span></div>
            <div class="kv"><span class="faint">超期</span>
              <span class="mono" :class="overdueDays(sign) ? 'warnc' : ''">{{ overdueDays(sign) ? overdueDays(sign) + ' 天' : '未超期' }}</span>
            </div>
            <div class="kv"><span class="faint">批次</span><span>{{ sign.batch || '—' }}</span></div>
          </section>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { activeSign, activeVersion, isMaker, toast } from '../composables';
import { STATUS, canExportPackage, markPackageExported } from '../core/store.js';
import { computeBOM, buildProcessSpec, buildPackage, buildSvg } from '../core/export.js';
import { downloadSvg, downloadBlob, downloadText } from '../core/download.js';
import { diffRingsBetween, EditorRenderer } from '../core/editor.js';

const emit = defineEmits(['new-version']);

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());

const bom = computed(() => (version.value ? computeBOM(version.value.doc) : { rows: [], totals: {} }));
const processText = computed(() => (version.value ? buildProcessSpec(version.value.doc, sign.value, version.value) : ''));
const pkgReady = computed(() => canExportPackage(sign.value, version.value));

function vLabel(s) {
  return { draft: '草稿', submitted: '审核中', returned: '已退回', approved: '已通过' }[s] || s;
}
function vTone(s) {
  return { draft: 'slate', submitted: 'amber', returned: 'red', approved: 'green' }[s] || 'slate';
}
function cLabel(s) {
  return { open: '待处理', replied: '待确认', closed: '已关闭' }[s] || s;
}
function commentsFor(v) {
  return sign.value.comments.filter((c) => c.versionId === v.id);
}
function versionName(id) {
  const v = sign.value.versions.find((x) => x.id === id);
  return v ? v.name : '—';
}

function doExportSvg() {
  const svg = buildSvg(version.value.doc, { sign: sign.value, version: version.value });
  downloadSvg(svg, sign.value, version.value);
  toast('SVG 已导出（1:1，mm，文字已转曲）', 'success');
}

function doExportPng() {
  const doc = version.value.doc;
  const c = document.createElement('canvas');
  c.width = Math.min(2400, Math.round(doc.width * 2));
  c.height = Math.round((c.width * doc.height) / doc.width);
  const r = new EditorRenderer(c);
  const scale = c.width / doc.width;
  r.render(
    { scale, panX: 0, panY: 0 },
    { doc, dpr: 1, width: c.width, height: c.height, scale, panX: 0, panY: 0,
      selection: { layerIds: [] }, showGuides: false, showGrid: false, overlayComments: [], legibility: null, compare: null }
  );
  c.toBlob((blob) => downloadBlob(blob, `${sign.value.code}_${version.value.name}.png`), 'image/png');
  toast('预览图已导出', 'success');
}

async function doExportPackage() {
  if (!pkgReady.value.ok) return toast(pkgReady.value.reason, 'warn');
  const vs = sign.value.versions;
  const idx = vs.findIndex((v) => v.id === version.value.id);
  let diff = null;
  if (idx > 0) {
    const base = vs[idx - 1];
    const d = diffRingsBetween(base.doc, version.value.doc);
    diff = { ...d, baseName: base.name, targetName: version.value.name };
  }
  try {
    const { blob, filename } = await buildPackage({ sign: sign.value, version: version.value, diff });
    downloadBlob(blob, filename);
    markPackageExported(version.value);
    toast('投产包已导出：SVG + 材料清单 + 工艺说明 + 审片记录', 'success');
  } catch (e) {
    console.error(e);
    toast('导出失败：' + e.message, 'error');
  }
}

function doExportProcess() {
  downloadText(processText.value, `${sign.value.code}_${version.value.name}_工艺说明.md`);
}

const overdueDays = (s) => {
  const end = s.status === 'closed' && s.closedAt ? s.closedAt : new Date().toISOString().slice(0, 10);
  const d = Math.max(0, Math.round((new Date(end) - new Date(s.dueDate)) / 86400000));
  return d;
};
</script>

<style scoped>
.details-view { flex: 1; overflow: auto; padding: 14px; }
.cols { display: flex; gap: 14px; align-items: flex-start; }
.col-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
.col-side { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
.pad { padding: 12px 14px; }
h3 { margin: 0 0 9px; font-size: 13px; font-weight: 600; }
.ver-table { display: flex; flex-direction: column; gap: 1px; }
.vt-row { display: grid; grid-template-columns: 56px 90px 1fr 1fr 90px 74px; gap: 8px; align-items: center; padding: 5px 6px; border-radius: 5px; font-size: 12px; }
.vt-row.head { color: var(--text-faint); font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--line-soft); border-radius: 0; }
.vt-row.cur { background: #1b2634; }
.tiny-tag { padding: 0 6px; font-size: 10px; }
.wrap { flex-wrap: wrap; }
.rec { padding: 7px 0; border-bottom: 1px solid var(--line-soft); }
.rec:last-child { border-bottom: none; }
.rec-text { font-size: 12.5px; margin: 3px 0; }
.rec-reply { color: var(--text-dim); margin-top: 2px; }
.bom { display: flex; flex-direction: column; gap: 1px; font-size: 12px; }
.bom-row { display: grid; grid-template-columns: 1.1fr 1.4fr 80px; gap: 8px; padding: 3px 4px; }
.bom-row.head { color: var(--text-faint); font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--line-soft); }
.bom-totals { margin-top: 7px; padding-top: 6px; border-top: 1px solid var(--line-soft); }
.process { font-family: var(--mono); font-size: 10.5px; line-height: 1.6; color: var(--text-dim); white-space: pre-wrap; max-height: 280px; overflow: auto; margin: 0; background: #10151a; border-radius: 6px; padding: 8px 10px; }
.kv { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 12px; }
.kv .faint { min-width: 62px; }
.okc { color: var(--green); }
.warnc { color: var(--amber); }
</style>
