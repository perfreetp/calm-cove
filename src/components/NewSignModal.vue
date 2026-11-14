<template>
  <div class="modal-veil" @click.self="$emit('close')">
    <div class="modal">
      <div class="m-head row">
        <span class="m-title">新建标志牌</span>
        <span class="spacer" />
        <button class="tiny ghost" @click="$emit('close')">✕</button>
      </div>
      <div class="m-body">
        <div class="field wide">
          <label>从国标模板起稿</label>
          <div class="cat-tabs">
            <button v-for="c in cats" :key="c.key" class="tiny" :class="{ active: category === c.key }" @click="category = c.key">
              <span class="chip" :style="{ background: c.color }">{{ c.short }}</span>{{ c.label }}
            </button>
          </div>
        </div>
        <div class="tpl-grid">
          <button v-for="t in templates" :key="t.id" class="tpl" :class="{ sel: templateId === t.id }" @click="templateId = t.id">
            <span class="tpl-code mono">{{ t.code }}</span>
            <span class="tpl-name">{{ t.name }}</span>
            <span class="tpl-check" v-if="templateId === t.id">✓</span>
          </button>
        </div>
        <div class="grid2">
          <div class="field wide"><label>编号</label><input type="text" v-model="code" placeholder="自动生成" /></div>
          <div class="field wide"><label>名称</label><input type="text" v-model="name" placeholder="同模板名" /></div>
          <div class="field wide"><label>安装位置</label><input type="text" v-model="location" placeholder="如 K1120+350 右侧" /></div>
          <div class="field wide"><label>交稿截止</label><input type="date" v-model="dueDate" /></div>
        </div>
        <div class="row">
          <span class="faint small">版面尺寸将按模板自动设定，起稿后可在右侧「版面」中调整。</span>
        </div>
      </div>
      <div class="m-foot row">
        <span class="spacer" />
        <button class="tiny" @click="$emit('close')">取消</button>
        <button class="tiny primary" :disabled="!templateId" @click="create">创建并开始制版</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { CATEGORIES, TEMPLATES } from '../core/model.js';
import { createSign, toast, addDays, todayISO } from '../core/store.js';

const emit = defineEmits(['close']);

const cats = Object.values(CATEGORIES);
const category = ref('prohibition');
const templateId = ref('p-no-entry');
const code = ref('');
const name = ref('');
const location = ref('');
const dueDate = ref(addDays(todayISO(), 14));

const templates = computed(() => TEMPLATES.filter((t) => t.category === category.value));

watch(category, () => {
  templateId.value = templates.value[0]?.id || null;
});

function create() {
  if (!templateId.value) return;
  const sign = createSign({
    templateId: templateId.value,
    code: code.value.trim() || undefined,
    name: name.value.trim() || undefined,
    location: location.value.trim(),
    dueDate: dueDate.value,
  });
  toast(`已创建 ${sign.code} ${sign.name}`, 'success');
  emit('close');
}
</script>

<style scoped>
.modal-veil { position: fixed; inset: 0; background: rgba(6,9,13,0.65); display: grid; place-items: center; z-index: 500; backdrop-filter: blur(2px); }
.modal { width: 560px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,0.55); }
.m-head { padding: 11px 14px; border-bottom: 1px solid var(--line-soft); }
.m-title { font-weight: 600; font-size: 13px; }
.m-body { padding: 13px 14px; display: flex; flex-direction: column; gap: 12px; }
.m-foot { padding: 10px 14px; border-top: 1px solid var(--line-soft); }
.cat-tabs { display: flex; gap: 5px; }
.chip { display: inline-block; width: 15px; height: 15px; border-radius: 4px; color: #fff; font-size: 9px; line-height: 15px; text-align: center; margin-right: 5px; vertical-align: -3px; }
.tpl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.tpl {
  position: relative; text-align: left; padding: 9px 10px; border-radius: 7px;
  background: var(--panel-2); border: 1px solid var(--line-soft); display: flex; flex-direction: column; gap: 2px;
}
.tpl:hover { background: var(--panel-3); }
.tpl.sel { border-color: var(--accent-dim); background: #1b2634; }
.tpl-code { font-size: 10px; color: var(--text-faint); }
.tpl-name { font-size: 12.5px; font-weight: 550; }
.tpl-check { position: absolute; top: 6px; right: 8px; color: var(--accent); font-size: 11px; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 12px; }
</style>
