<template>
  <div class="review">
    <!-- 版本历史 -->
    <h4>版本记录</h4>
    <div class="ver-list">
      <div v-for="v in [...store.versions].reverse()" :key="v.n" class="ver-item"
           :class="{ active: viewN === v.n }" @click="viewN = v.n">
        <b>V{{ v.n }}</b>
        <span class="tag" :class="v.status">{{ statusLabel(v.status) }}</span>
        <span class="dim">{{ fmtTime(v.submittedAt) }}</span>
        <span class="dim">批注 {{ v.annotations.length }}（未处理 {{ v.annotations.filter(a => a.status === 'open').length }}）</span>
      </div>
    </div>

    <template v-if="version">
      <div class="row" style="justify-content: space-between">
        <h4 style="margin:0">V{{ version.n }} 批注（{{ version.annotations.length }}）</h4>
        <button v-if="version.status !== 'approved'" :disabled="version.annotations.some(a => a.status === 'open')"
                class="primary" @click="approveVersion(version.n)">✔ 审核通过</button>
      </div>

      <!-- 新增批注 -->
      <div class="anno-form">
        <div class="row">
          <label>帧</label>
          <input type="number" v-model.number="form.frame" style="width:64px" />
          <label>关节</label>
          <select v-model="form.boneId">
            <option v-for="b in store.bones" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
          <button :class="{ primary: store.ui.annotateMode }" @click="pickPoint">
            {{ store.ui.annotateMode ? '点击画面打点…' : (form.x != null ? `📍(${form.x},${form.y})` : '画面打点') }}
          </button>
        </div>
        <div class="row">
          <input v-model="form.text" placeholder="写清哪一帧哪个关节不对，如：第40帧右前臂抬起过快" style="flex:1" />
          <button class="primary" :disabled="!form.text" @click="add">添加批注</button>
        </div>
      </div>

      <!-- 批注列表 -->
      <div v-for="(a, i) in version.annotations" :key="a.id" class="anno" :class="a.status">
        <div class="row">
          <b>#{{ i + 1 }}</b>
          <button class="jump" @click="jump(a)">帧{{ a.frame }} · {{ boneName(a.boneId) }} 📍</button>
          <span class="tag" :class="a.status">{{ a.status === 'open' ? '待处理' : a.status === 'fixed' ? '已改' : '已驳回' }}</span>
        </div>
        <div class="anno-text">{{ a.text }}</div>
        <div class="dim" style="font-size:11px">{{ a.reviewer }} · {{ fmtTime(a.at) }} · 画面坐标 ({{ a.x }}, {{ a.y }})</div>
        <template v-if="a.status === 'open'">
          <div class="row">
            <input v-model="replyDraft[a.id]" placeholder="制作方回复：说明修改内容或驳回理由" style="flex:1" />
            <button class="primary" @click="reply(a, 'fixed')">已改</button>
            <button class="danger" @click="reply(a, 'rejected')">驳回</button>
          </div>
        </template>
        <div v-else class="reply">制作方：{{ a.reply }}</div>
      </div>

      <p v-if="version.annotations.some(a => a.status === 'open')" class="warn">
        ⚠ 还有 {{ version.annotations.filter(a => a.status === 'open').length }} 条批注未处理，逐条回复「已改」或「驳回」后才能提交下一版。
      </p>
    </template>
    <p v-else class="dim">还没有版本，点击顶部「提交审核」生成 V1。</p>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { store, save, latestVersion, addAnnotation, replyAnnotation, approveVersion } from '../store.js'

const viewN = ref(latestVersion.value ? latestVersion.value.n : 0)
const version = computed(() => store.versions.find((v) => v.n === viewN.value))
const form = reactive({ frame: store.ui.currentFrame, boneId: 'handR', text: '', x: null, y: null })
const replyDraft = reactive({})

watch(() => store.ui.currentFrame, (f) => { if (!form.text) form.frame = f })
watch(() => store.ui.annotateAt, (pt) => {
  if (pt) { form.x = pt.x; form.y = pt.y }
})

function pickPoint() {
  store.ui.annotateMode = true
}
function add() {
  addAnnotation({
    frame: form.frame,
    boneId: form.boneId,
    x: form.x ?? 480,
    y: form.y ?? 270,
    text: form.text
  })
  form.text = ''
  form.x = form.y = null
}
function reply(a, status) {
  const text = replyDraft[a.id]
  if (!text) return
  replyAnnotation(version.value.n, a.id, status, text)
  replyDraft[a.id] = ''
}
function jump(a) {
  store.ui.currentFrame = a.frame
  store.ui.selectedBoneId = a.boneId
}
function boneName(id) {
  const b = store.bones.find((x) => x.id === id)
  return b ? b.name : id
}
function fmtTime(t) { return new Date(t).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function statusLabel(s) {
  return { reviewing: '审核中', resolved: '已处理待确认', approved: '已通过' }[s] || s
}
</script>

<style scoped>
.review { display: flex; flex-direction: column; gap: 8px; }
h4 { margin: 4px 0; color: var(--dim); font-size: 12px; }
.ver-list { display: flex; flex-direction: column; gap: 4px; }
.ver-item { display: flex; gap: 8px; align-items: center; padding: 5px 8px; border: 1px solid var(--line); border-radius: 4px; cursor: pointer; font-size: 12px; }
.ver-item.active { border-color: var(--accent); }
.dim { color: var(--dim); }
.anno-form { border: 1px dashed var(--line); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
.anno { border: 1px solid var(--line); border-left-width: 3px; border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 5px; }
.anno.open { border-left-color: var(--warn); }
.anno.fixed { border-left-color: var(--ok); }
.anno.rejected { border-left-color: var(--dim); }
.anno-text { font-size: 12px; }
.reply { font-size: 12px; color: #9be7c4; }
.jump { font-size: 11px; }
.warn { color: #ffb27a; margin: 0; }
</style>
