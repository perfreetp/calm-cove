<template>
  <div class="inspector scroll">

    <div v-if="layer" class="sec">
      <div class="section-title row">
        <span>{{ single ? '选中图层' : `选中 ${selCount} 个图层` }}</span>
        <span class="spacer" />
        <span v-if="layer.locked" class="tag slate">已锁定</span>
      </div>

      <div class="field" v-if="single">
        <label>名称</label>
        <input type="text" :value="layer.name" @input="e => rename(e.target.value)" :disabled="locked" />
      </div>

      <template v-if="single">
        <!-- text properties -->
        <template v-if="layer.type === 'text'">
          <div class="field wide">
            <label>文字内容</label>
            <textarea :value="layer.text" rows="2" @change="e => setText(e.target.value)" :disabled="locked" />
          </div>
          <div class="field">
            <label>字高 mm</label>
            <div class="row">
              <input type="number" :value="layer.charHeight" min="10" step="1" @change="e => setNum('charHeight', +e.target.value)" :disabled="locked" />
              <input type="range" :value="layer.charHeight" min="40" max="700" step="1" @input="e => setNum('charHeight', +e.target.value, true)" :disabled="locked" />
            </div>
          </div>
          <div class="field">
            <label>字宽 mm</label>
            <div class="row">
              <input type="number" :value="layer.charWidth" min="10" step="1" @change="e => setNum('charWidth', +e.target.value)" :disabled="locked" />
              <input type="range" :value="layer.charWidth" min="40" max="700" step="1" @input="e => setNum('charWidth', +e.target.value, true)" :disabled="locked" />
            </div>
          </div>
          <div class="field">
            <label>字间距</label>
            <div class="row">
              <input type="number" :value="layer.tracking" step="1" @change="e => setNum('tracking', +e.target.value)" :disabled="locked" />
              <input type="range" :value="layer.tracking" min="-50" max="120" step="1" @input="e => setNum('tracking', +e.target.value, true)" :disabled="locked" />
            </div>
          </div>
          <div class="field">
            <label>行间距</label>
            <div class="row">
              <input type="number" :value="layer.lineHeight" step="1" @change="e => setNum('lineHeight', +e.target.value)" :disabled="locked" />
              <input type="range" :value="layer.lineHeight" min="20" max="900" step="1" @input="e => setNum('lineHeight', +e.target.value, true)" :disabled="locked" />
            </div>
          </div>
          <div class="field">
            <label>对齐</label>
            <div class="seg">
              <button v-for="a in ['left','center','right']" :key="a" class="tiny" :class="{ active: layer.align === a }" @click="setEnum('align', a)" :disabled="locked">{{ {left:'左',center:'中',right:'右'}[a] }}</button>
            </div>
          </div>
          <div class="field"><label>X / Y</label>
            <div class="row">
              <input type="number" :value="Math.round(layer.x)" @change="e => setNum('x', +e.target.value)" :disabled="locked" />
              <input type="number" :value="Math.round(layer.y)" @change="e => setNum('y', +e.target.value)" :disabled="locked" />
            </div>
          </div>
        </template>

        <!-- shape properties -->
        <template v-else>
          <div class="field" v-if="layer.kind === 'roundedRect' || layer.kind === 'rect'">
            <label>圆角 R</label>
            <input type="number" :value="layer.params.r || 0" min="0" step="1" @change="e => setParam('r', +e.target.value)" :disabled="locked" />
          </div>
          <div class="field" v-if="layer.kind === 'circle'">
            <label>半径 R</label>
            <input type="number" :value="layer.params.r || 0" min="1" step="1" @change="e => setParam('r', +e.target.value)" :disabled="locked" />
          </div>
          <div class="field" v-if="layer.kind === 'circle' || layer.kind === 'polygon' || layer.kind === 'triangle' || layer.params.cx != null">
            <label>圆心 X/Y</label>
            <div class="row">
              <input type="number" :value="Math.round(layer.params.cx || 0)" @change="e => setParam('cx', +e.target.value)" :disabled="locked" />
              <input type="number" :value="Math.round(layer.params.cy || 0)" @change="e => setParam('cy', +e.target.value)" :disabled="locked" />
            </div>
          </div>
          <div class="field" v-if="layer.kind === 'polygon'">
            <label>边数</label>
            <input type="number" :value="layer.params.sides || 6" min="3" max="24" @change="e => setParam('sides', +e.target.value)" :disabled="locked" />
          </div>
          <div class="field" v-if="layer.kind === 'symbol' && layer.params.symbol === 'arrow'">
            <label>方向 °</label>
            <input type="number" :value="layer.params.direction || 90" step="1" @change="e => setParam('direction', +e.target.value)" :disabled="locked" />
          </div>
          <div class="field" v-if="layer.type === 'path'">
            <label>转曲</label>
            <div class="row small faint">路径节点 {{ vertexCount }} 个</div>
          </div>
        </template>

        <!-- shared style -->
        <div class="divider" />
        <div class="section-title">外观</div>
        <div class="field"><label>填充</label>
          <div class="row">
            <input type="color" :value="layer.fill || '#ffffff'" @input="e => setStyle('fill', e.target.value)" :disabled="locked || layer.fill === null" />
            <input type="text" class="mono" :value="layer.fill || '无'" @change="e => setStyle('fill', e.target.value.trim() || null)" :disabled="locked" />
            <button class="tiny ghost" @click="setStyle('fill', null)" :disabled="locked" title="无填充">⊘</button>
          </div>
        </div>
        <div class="field"><label>描边色</label>
          <div class="row">
            <input type="color" :value="layer.stroke || '#ffffff'" @input="e => setStyle('stroke', e.target.value)" :disabled="locked || !layer.stroke" />
            <input type="text" class="mono" :value="layer.stroke || '无'" @change="e => setStyle('stroke', e.target.value.trim() || null)" :disabled="locked" />
            <button class="tiny ghost" @click="setStyle('stroke', layer.stroke ? null : '#ffffff')" :disabled="locked">{{ layer.stroke ? '⊘' : '＋' }}</button>
          </div>
        </div>
        <div class="field"><label>边框线宽</label>
          <div class="row">
            <input type="number" :value="layer.strokeWidth || 0" min="0" step="1" @change="e => setStyle('strokeWidth', +e.target.value)" :disabled="locked" />
            <input type="range" :value="layer.strokeWidth || 0" min="0" max="120" step="1" @input="e => setStyle('strokeWidth', +e.target.value)" :disabled="locked" />
          </div>
        </div>
        <div class="row" style="margin-top:6px">
          <button class="tiny" @click="convertToPath" :disabled="locked || layer.type === 'path'" v-if="layer.type !== 'text'">转为路径</button>
          <button class="tiny" @click="enterVertex" :disabled="locked" v-if="layer.type === 'path' && selection.mode !== 'vertex'">节点编辑</button>
          <button class="tiny active" @click="exitVertex" v-if="selection.mode === 'vertex'">退出节点</button>
        </div>
      </template>

      <!-- multi-select bulk style -->
      <template v-else>
        <div class="field"><label>填充</label>
          <div class="row">
            <input type="color" :value="commonFill || '#ffffff'" @input="e => bulkStyle('fill', e.target.value)" :disabled="locked" />
          </div>
        </div>
      </template>
    </div>

    <div v-else class="empty small">
      <div>未选中图层</div>
      <div class="faint">在画布上点选，或在图层列表中选择</div>
    </div>

    <div class="divider" />
    <div class="row sec-toggle" @click="showDoc = !showDoc">
      <span class="section-title" style="padding:0">版面参数</span>
      <span class="spacer" />
      <span class="faint small">{{ showDoc ? "收起" : "展开" }}</span>
    </div>
    <!-- document-level -->
    <div class="sec" v-show="showDoc">
      <div class="section-title">版面</div>
      <div class="field"><label>宽 / 高</label>
        <div class="row">
          <input type="number" :value="doc.width" :min="40" step="1" @change="e => setDoc('width', +e.target.value)" :disabled="locked" />
          <input type="number" :value="doc.height" :min="40" step="1" @change="e => setDoc('height', +e.target.value)" :disabled="locked" />
        </div>
      </div>
      <div class="field"><label>底板形状</label>
        <select :value="doc.plate.shape" @change="e => setPlateShape(e.target.value)" :disabled="locked">
          <option value="rect">矩形</option>
          <option value="roundedRect">圆角矩形</option>
          <option value="circle">圆形</option>
          <option value="triangle">三角形</option>
        </select>
      </div>
      <div class="field" v-if="doc.plate.shape === 'roundedRect'">
        <label>圆角 R</label>
        <input type="number" :value="doc.plate.radius" min="0" step="1" @change="e => setPlateRadius(+e.target.value)" :disabled="locked" />
      </div>
      <div class="field">
        <label>板厚 mm</label>
        <input type="number" :value="doc.plateThickness" min="0.5" step="0.1" @change="e => setDoc('plateThickness', +e.target.value)" :disabled="locked" />
      </div>
      <div class="field">
        <label>反光膜</label>
        <select :value="doc.filmGrade" @change="e => setDoc('filmGrade', e.target.value)" :disabled="locked">
          <option>一级反光膜</option>
          <option>二级反光膜</option>
          <option>三级反光膜</option>
          <option>四级反光膜</option>
          <option>五级反光膜</option>
        </select>
      </div>
      <div class="field">
        <label>安全边距</label>
        <input type="number" :value="doc.safeMargin" min="0" step="1" @change="e => setDoc('safeMargin', +e.target.value)" :disabled="locked" />
      </div>
      <div class="field">
        <label>设计速度</label>
        <select :value="doc.designSpeed" @change="e => setDoc('designSpeed', +e.target.value)" :disabled="locked">
          <option v-for="s in [40,60,80,100,120]" :key="s" :value="s">{{ s }} km/h</option>
        </select>
      </div>
      <div class="field">
        <label>目标视认</label>
        <div class="row">
          <input type="number" :value="doc.targetDistance || 0" min="0" step="10" @change="e => setDoc('targetDistance', +e.target.value)" :disabled="locked" />
          <span class="unit">m</span>
        </div>
      </div>
      <div class="lig-box small" :class="{ warn: !lig.meetsSpeed || (doc.targetDistance > 0 && !lig.meetsTarget) }">
        <div class="row"><span>主视认字高</span><span class="spacer" /><b class="mono">{{ lig.charHeight }} mm</b></div>
        <div class="row"><span>最小视认距离</span><span class="spacer" /><b class="mono">{{ lig.distance.toFixed(0) }} m</b></div>
        <div class="row" v-if="doc.targetDistance > 0"><span>目标距离需字高</span><span class="spacer" /><b class="mono">≥ {{ lig.requiredHeight.toFixed(0) }} mm</b></div>
        <div class="row"><span>速度推荐字高</span><span class="spacer" /><b class="mono">{{ lig.recommended }} mm</b></div>
      </div>
    </div>


  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { commit } from '../composables';
import { layerBBox, layerSubpaths } from '../core/model.js';

const props = defineProps({
  doc: { type: Object, required: true },
  selection: { type: Object, default: () => ({ layerIds: [] }) },
  locked: { type: Boolean, default: false },
  legibility: { type: Object, default: () => ({}) },
});
const emit = defineEmits(['update:selection']);

const showDoc = ref(false);
const selIds = computed(() => props.selection.layerIds || []);
const selCount = computed(() => selIds.value.length);
const single = computed(() => selCount.value === 1);
const layer = computed(() => (single.value ? props.doc.layers.find((l) => l.id === selIds.value[0]) : null));
const lig = computed(() => props.legibility);
const vertexCount = computed(() => {
  if (!layer.value || layer.value.type !== 'path') return 0;
  return (layer.value.subpaths || []).reduce((n, s) => n + s.pts.length, 0);
});
const commonFill = computed(() => {
  const ls = props.doc.layers.filter((l) => selIds.value.includes(l.id));
  const f = ls[0]?.fill;
  return ls.every((l) => l.fill === f) ? f : null;
});

function setDoc(key, v) {
  if (!Number.isFinite(v)) return;
  props.doc[key] = v;
  commit();
}
function setPlateShape(shape) {
  props.doc.plate.shape = shape;
  if (shape === 'roundedRect' && !props.doc.plate.radius) props.doc.plate.radius = 60;
  commit();
}
function setPlateRadius(v) {
  props.doc.plate.radius = v;
  commit();
}

let lastSliderCommit = 0;
function setNum(key, v, fromSlider = false) {
  if (!layer.value || !Number.isFinite(v)) return;
  layer.value[key] = v;
  if (fromSlider) {
    const now = Date.now();
    if (now - lastSliderCommit > 350) { commit(); lastSliderCommit = now; }
  } else commit();
}
function setText(v) {
  if (!layer.value) return;
  layer.value.text = v;
  commit();
}
function setEnum(key, v) {
  if (!layer.value) return;
  layer.value[key] = v;
  commit();
}
function setParam(key, v) {
  if (!layer.value || !Number.isFinite(v)) return;
  layer.value.params[key] = v;
  commit();
}
function rename(v) {
  if (!layer.value) return;
  layer.value.name = v;
  commit();
}
function setStyle(key, v) {
  if (!layer.value) return;
  layer.value[key] = v;
  if (key === 'stroke' && v && (!layer.value.strokeWidth || layer.value.strokeWidth <= 0)) layer.value.strokeWidth = 4;
  commit();
}
function bulkStyle(key, v) {
  for (const l of props.doc.layers) if (selIds.value.includes(l.id)) l[key] = v;
  commit();
}
function convertToPath() {
  if (!layer.value) return;
  const subs = layerSubpaths(layer.value, props.doc);
  layer.value.type = 'path';
  layer.value.kind = 'custom';
  layer.value.subpaths = JSON.parse(JSON.stringify(subs));
  layer.value.params = {};
  commit();
}
function enterVertex() {
  emit('update:selection', { ...props.selection, mode: 'vertex', vertexLayerId: layer.value.id });
}
function exitVertex() {
  emit('update:selection', { ...props.selection, mode: 'select' });
}
</script>

<style scoped>
.inspector { width: 100%; padding: 10px 11px 24px; display: flex; flex-direction: column; gap: 9px; }
.sec { display: flex; flex-direction: column; gap: 7px; }
.unit { color: var(--text-faint); font-size: 11px; }
.lig-box {
  border: 1px solid var(--line-soft); border-radius: 6px; padding: 6px 8px;
  background: #12171d; display: flex; flex-direction: column; gap: 3px;
  color: var(--text-dim);
}
.lig-box.warn { border-color: #5c4a22; background: #1d1811; color: #ffc971; }
.seg { display: flex; gap: 2px; }
.seg button { border-radius: 4px; flex: 1; }
.sec-toggle { cursor: pointer; padding: 2px 0 4px; }
.sec-toggle:hover .section-title { color: var(--text-dim); }
textarea { resize: vertical; min-height: 38px; }
</style>