<template>
  <div class="wf">
    <div class="wf-head row">
      <span class="section-title" style="padding:0">流程</span>
      <span class="tag" :class="statusTone">{{ STATUS[sign.status].label }}</span>
      <span class="spacer" />
      <button class="tiny" v-if="isMaker()" :disabled="!canSubmit" @click="submit">提交 {{ version?.name }}</button>
      <button class="tiny danger" v-if="store.currentUser === 'reviewer'" :disabled="!canReturn" @click="ret = !ret">
        {{ ret ? '取消' : '退回修改' }}
      </button>
      <button class="tiny primary" v-if="store.currentUser === 'reviewer'" :disabled="!canApprove" @click="approve">
        通过并结项
      </button>
    </div>

    <div class="steps">
      <template v-for="(s, i) in steps" :key="i">
        <div class="step" :class="s.state" :title="s.desc">
          <span class="node">
            <span v-if="s.state === 'done'" class="tick">✓</span>
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="step-name">{{ s.name }}</span>
        </div>
        <span v-if="i < steps.length - 1" class="bar" :class="{ on: s.state === 'done' }" />
      </template>
      <span class="spacer" />
      <span class="small" :class="stats.blocking ? 'warnc' : 'okc'">
        {{ stats.blocking ? `批注 ${stats.blocking} 条未关` : '批注已清' }}
      </span>
    </div>

    <div v-if="ret" class="ret-box">
      <textarea v-model="retNote" rows="2" placeholder="退回原因（可选）" />
      <button class="tiny danger" @click="doReturn">确认退回（记 1 个修改轮次）</button>
    </div>
    <div class="hints small faint" v-if="blockReason">{{ blockReason }}</div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { store, activeSign, activeVersion, isMaker, toast } from '../composables';
import { STATUS, submitVersion, returnForRevision, approveVersion, commentStats } from '../core/store.js';

const sign = computed(() => activeSign());
const version = computed(() => activeVersion());
const ret = ref(false);
const retNote = ref('');

const stats = computed(() => commentStats(sign.value, version.value));
const statusTone = computed(() => STATUS[sign.value?.status || 'drafting'].tone);

const steps = computed(() => {
  const s = sign.value, v = version.value;
  if (!s || !v) return [];
  const makerDone = v.status !== 'draft';
  const reviewDone = v.status === 'approved';
  const closed = s.status === 'closed';
  return [
    { name: '制版', desc: v.status === 'draft' ? '编辑中' : `${v.name} 已提交`, state: makerDone ? 'done' : 'active' },
    { name: '审核', desc: stats.value.blocking ? `${stats.value.blocking} 条批注待处理` : '批注已清', state: reviewDone ? 'done' : makerDone ? 'active' : 'idle' },
    { name: '结项', desc: closed ? `已结项 · R${s.round}` : '批注关闭后结项', state: closed ? 'done' : 'idle' },
  ];
});

const canSubmit = computed(() => {
  const s = sign.value, v = version.value;
  return isMaker() && s && v && s.status !== 'closed' && v.status !== 'submitted' && v.status !== 'approved';
});
const canReturn = computed(() => store.currentUser === 'reviewer' && version.value?.status === 'submitted');
const canApprove = computed(() => store.currentUser === 'reviewer' && version.value?.status === 'submitted' && stats.value.blocking === 0);

const blockReason = computed(() => {
  const v = version.value;
  if (!v) return '';
  if (v.status === 'submitted') {
    if (stats.value.blocking) return `结项前必须关闭所有批注（当前剩 ${stats.value.blocking} 条）`;
    return '审核方可以确认通过并结项';
  }
  if (v.status === 'approved') return '本版本已通过审核，可导出投产包';
  if (!isMaker()) return '切换到制作方身份可继续编辑并提交';
  if (v.status === 'returned') return '退回修改中：编辑完成后提交新版本';
  return '';
});

function submit() {
  const res = submitVersion(sign.value, version.value);
  toast(res.message, res.ok ? 'success' : 'warn');
}
function doReturn() {
  const res = returnForRevision(sign.value, version.value, retNote.value);
  toast(res.message, res.ok ? 'success' : 'warn');
  if (res.ok) { ret.value = false; retNote.value = ''; }
}
function approve() {
  const res = approveVersion(sign.value, version.value);
  toast(res.message, res.ok ? 'success' : 'error');
}
</script>

<style scoped>
.wf { padding: 9px 11px; border-bottom: 1px solid var(--line); background: var(--panel); }
.wf-head { margin-bottom: 8px; gap: 6px; flex-wrap: wrap; }
.steps { display: flex; align-items: center; gap: 5px; }
.step { display: flex; align-items: center; gap: 5px; }
.node {
  width: 16px; height: 16px; border-radius: 50%; display: grid; place-items: center;
  font-size: 9.5px; flex-shrink: 0;
  background: var(--panel-3); color: var(--text-faint); border: 1px solid var(--line);
}
.step.done .node { background: #153629; color: #6fe3a8; border-color: #235540; }
.step.active .node { background: #16293d; color: #7fc0f5; border-color: var(--accent-dim); }
.step-name { font-size: 11.5px; color: var(--text-dim); }
.step.active .step-name { color: #7fc0f5; font-weight: 550; }
.step.done .step-name { color: var(--green); }
.bar { width: 14px; height: 1px; background: var(--line); flex-shrink: 0; }
.bar.on { background: #235540; }
.tick { color: inherit; }
.ret-box { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
.hints { margin-top: 6px; }
.okc { color: var(--green); }
.warnc { color: var(--amber); }
</style>
