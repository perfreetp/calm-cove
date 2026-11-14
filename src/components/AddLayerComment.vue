<template>
  <div class="modal-veil" @click.self="$emit('close')">
    <div class="modal">
      <div class="m-head row">
        <span class="m-title">对元素提意见</span>
        <span class="spacer" />
        <button class="tiny ghost" @click="$emit('close')">✕</button>
      </div>
      <div class="m-body">
        <div class="field wide">
          <label>选择图层</label>
          <select v-model="layerId">
            <option value="" disabled>请选择要提意见的图层</option>
            <option v-for="l in selectable" :key="l.id" :value="l.id">{{ l.name }}（{{ typeName(l) }}）</option>
          </select>
        </div>
        <div class="field wide">
          <label>意见内容</label>
          <textarea v-model="text" rows="4" placeholder="例如：红圈线宽应为 50mm 级，当前偏细。" />
        </div>
        <div class="faint small">批注会挂在该图层上，制作方逐条回复后由审核方确认关闭。</div>
      </div>
      <div class="m-foot row">
        <span class="spacer" />
        <button class="tiny" @click="$emit('close')">取消</button>
        <button class="tiny primary" :disabled="!layerId || !text.trim()" @click="create">添加批注</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  doc: { type: Object, required: true },
  presetLayerId: { type: String, default: '' },
});
const emit = defineEmits(['close', 'create']);

const layerId = ref(props.presetLayerId || '');
const text = ref('');
const selectable = computed(() => props.doc.layers.filter((l) => l.kind !== 'plate'));

function typeName(l) {
  return l.type === 'text' ? '文字' : l.kind === 'custom' ? '路径' : '图形';
}

function create() {
  if (!layerId.value || !text.value.trim()) return;
  emit('create', { layerId: layerId.value, text: text.value.trim() });
}
</script>

<style scoped>
.modal-veil {
  position: fixed; inset: 0; background: rgba(6, 9, 13, 0.65);
  display: grid; place-items: center; z-index: 500; backdrop-filter: blur(2px);
}
.modal {
  width: 420px; background: var(--panel); border: 1px solid var(--line);
  border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,0.55);
}
.m-head { padding: 11px 14px; border-bottom: 1px solid var(--line-soft); }
.m-title { font-weight: 600; font-size: 13px; }
.m-body { padding: 13px 14px; display: flex; flex-direction: column; gap: 11px; }
.m-foot { padding: 10px 14px; border-top: 1px solid var(--line-soft); }
textarea { resize: vertical; }
</style>
