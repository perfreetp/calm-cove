<template>
  <div class="insert-veil" @click.self="$emit('close')">
    <div class="insert">
      <div class="ih row">
        <span class="ih-title">插入图元</span>
        <span class="tag slate">{{ cat.label }}</span>
        <span class="spacer" />
        <button class="tiny ghost" @click="$emit('close')">✕</button>
      </div>
      <div class="ibody">
        <div class="section-title">本类基础图元</div>
        <div class="grid">
          <button v-for="p in prims" :key="p.id" class="item" @click="addPrimitive(p)">
            <span class="glyph" v-html="preview(p.id)" />
            <span class="lbl">{{ p.label }}</span>
          </button>
        </div>
        <div class="divider" />
        <div class="section-title">通用形状</div>
        <div class="grid">
          <button class="item" @click="addShape('roundedRect')">
            <span class="glyph"><svg viewBox="0 0 40 40" width="34" height="34"><rect x="6" y="9" width="28" height="22" rx="5" fill="#dde5ef" opacity="0.9"/></svg></span>
            <span class="lbl">圆角矩形</span>
          </button>
          <button class="item" @click="addShape('circle')">
            <span class="glyph"><svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="13" fill="#dde5ef" opacity="0.9"/></svg></span>
            <span class="lbl">圆形</span>
          </button>
          <button class="item" @click="addShape('polygon')">
            <span class="glyph"><svg viewBox="0 0 40 40" width="34" height="34"><polygon points="20,5 34,14 34,28 20,36 6,28 6,14" fill="#dde5ef" opacity="0.9"/></svg></span>
            <span class="lbl">正多边形</span>
          </button>
          <button class="item" @click="addShape('triangle')">
            <span class="glyph"><svg viewBox="0 0 40 40" width="34" height="34"><polygon points="20,6 35,32 5,32" fill="#dde5ef" opacity="0.9"/></svg></span>
            <span class="lbl">三角形</span>
          </button>
          <button class="item" @click="addText">
            <span class="glyph"><span class="gcjk">字</span></span>
            <span class="lbl">文字块</span>
          </button>
          <button class="item" @click="startPen">
            <span class="glyph"><svg viewBox="0 0 40 40" width="34" height="34"><path d="M27 7l6 6-15 15-8 2 2-8z" fill="none" stroke="#dde5ef" stroke-width="2.4"/></svg></span>
            <span class="lbl">钢笔路径</span>
          </button>
        </div>
      </div>
      <div class="ifoot small faint">
        插入后可在右侧属性面板调整圆角、线宽、字高、字宽、行距与字距。
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { PRIMITIVES, CATEGORIES, shapeLayer, textLayer } from '../core/model.js';

const props = defineProps({
  doc: { type: Object, required: true },
  category: { type: String, default: 'guide' },
});
const emit = defineEmits(['close', 'insert', 'pen']);

const cat = computed(() => CATEGORIES[props.category] || CATEGORIES.guide);
const prims = computed(() => PRIMITIVES[props.category] || []);

const svgs = {
  'circle-plate': '<svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="14" fill="#fff" stroke="#c8102e" stroke-width="3"/></svg>',
  'red-ring': '<svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="13" fill="#fff" stroke="#c8102e" stroke-width="5"/></svg>',
  slash: '<svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="13" fill="#fff" stroke="#c8102e" stroke-width="3.5"/><path d="M11 29L29 11" stroke="#c8102e" stroke-width="4"/></svg>',
  num: '<svg viewBox="0 0 40 40" width="34" height="34"><text x="20" y="28" text-anchor="middle" font-size="19" font-weight="700" fill="#141414">60</text></svg>',
  'blue-circle': '<svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="14" fill="#0057a8"/></svg>',
  'blue-rect': '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="4" y="8" width="32" height="24" rx="3" fill="#0057a8"/></svg>',
  arrow: '<svg viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="14" fill="#0057a8"/><path d="M20 31V14M20 10l-6 7h12z" fill="#fff" stroke="#fff" stroke-width="3"/></svg>',
  triangle: '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="3" y="6" width="34" height="28" rx="3" fill="#0057a8"/><polygon points="20,10 31,29 9,29" fill="#fff"/></svg>',
  'green-rect': '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="4" y="8" width="32" height="24" rx="2" fill="#00693e"/></svg>',
  'white-border': '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="4" y="8" width="32" height="24" fill="none" stroke="#fff" stroke-width="3"/></svg>',
  'place-text': '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="3" y="7" width="34" height="26" fill="#00693e"/><text x="20" y="27" text-anchor="middle" font-size="15" fill="#fff">地名</text></svg>',
  'big-arrow': '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="3" y="7" width="34" height="26" fill="#00693e"/><path d="M20 29V13M20 9l-5 6h10z" fill="#fff"/></svg>',
  divider: '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="3" y="7" width="34" height="26" fill="#00693e"/><rect x="19" y="9" width="2.5" height="22" fill="#fff"/></svg>',
};

function preview(id) {
  return svgs[id] || '<svg viewBox="0 0 40 40" width="34" height="34"><rect x="8" y="8" width="24" height="24" rx="4" fill="#dde5ef" opacity=".8"/></svg>';
}

function addPrimitive(p) {
  const layer = p.make(props.doc);
  emit('insert', layer);
}
function addShape(kind) {
  const w = props.doc.width, h = props.doc.height;
  const size = Math.min(w, h) * 0.35;
  if (kind === 'circle') {
    emit('insert', shapeLayer('circle', { cx: w / 2, cy: h / 2, r: size / 2 }, { fill: '#ffffff' }, { name: '圆形' }));
  } else if (kind === 'polygon') {
    emit('insert', shapeLayer('polygon', { cx: w / 2, cy: h / 2, r: size / 2, sides: 6 }, { fill: '#ffffff' }, { name: '多边形' }));
  } else if (kind === 'triangle') {
    emit('insert', shapeLayer('triangle', { cx: w / 2, cy: h / 2, r: size / 2 }, { fill: '#ffffff' }, { name: '三角形' }));
  } else {
    emit('insert', shapeLayer('roundedRect', { x: w / 2 - size / 2, y: h / 2 - size / 4, w: size, h: size / 2, r: 12 }, { fill: '#ffffff' }, { name: '圆角矩形' }));
  }
}
function addText() {
  emit('insert', textLayer('文字', { x: props.doc.width / 2, y: props.doc.height * 0.4, charHeight: Math.min(props.doc.width, props.doc.height) * 0.14, fill: '#ffffff', name: '文字' }));
}
function startPen() {
  emit('pen');
}
</script>

<style scoped>
.insert-veil { position: fixed; inset: 0; background: rgba(6,9,13,0.5); z-index: 400; display: grid; place-items: center; backdrop-filter: blur(2px); }
.insert { width: 470px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,0.55); }
.ih { padding: 10px 13px; border-bottom: 1px solid var(--line-soft); }
.ih-title { font-weight: 600; font-size: 13px; }
.ibody { padding: 12px 13px; display: flex; flex-direction: column; gap: 8px; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 4px; border-radius: 7px; background: var(--panel-2); border: 1px solid var(--line-soft);
}
.item:hover { background: var(--panel-3); border-color: #3a4655; }
.glyph { height: 38px; display: grid; place-items: center; }
.gcjk { font-size: 24px; font-weight: 600; color: #dde5ef; }
.lbl { font-size: 10.5px; color: var(--text-dim); }
.ifoot { padding: 8px 13px; border-top: 1px solid var(--line-soft); }
</style>
