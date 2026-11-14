<template>
  <div class="viewer">
    <div class="head row">
      <span class="section-title" style="padding:0">立体效果 · 侧向视认</span>
      <span class="spacer" />
      <span class="angle mono">侧向 {{ angle.toFixed(0) }}°</span>
    </div>
    <div class="canvas-box">
      <canvas ref="cv" />
      <div class="overlay-hud mono">
        <span>{{ doc.width }}×{{ doc.height }}mm · δ{{ doc.plateThickness }}</span>
      </div>
    </div>
    <div class="controls">
      <div class="presets">
        <button v-for="p in presets" :key="p.key" class="tiny" :class="{ active: mode === p.key }" @click="setPreset(p.key)">{{ p.label }}</button>
      </div>
      <div class="row">
        <button class="tiny" :class="{ active: lighting === 'day' }" @click="setLighting('day')">白天</button>
        <button class="tiny" :class="{ active: lighting === 'night' }" @click="setLighting('night')">夜间逆反</button>
        <span class="spacer" />
        <button class="tiny" @click="resetView">重置视角</button>
      </div>
      <div class="angle-slider">
        <label>侧向角度</label>
        <input type="range" min="-45" max="45" step="1" :value="angleInput" @input="onAngleInput" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';
import { SignViewer } from '../core/viewer.js';

const props = defineProps({ doc: { type: Object, required: true } });
const emit = defineEmits(['angle']);

const cv = ref(null);
const mode = ref('perspective');
const lighting = ref('day');
const angle = ref(38);
const angleInput = ref(38);
let viewer = null;
let raf = null;

const presets = [
  { key: 'front', label: '正视' },
  { key: 'perspective', label: '透视' },
  { key: 'side15', label: '15°' },
  { key: 'side30', label: '30°' },
  { key: 'side45', label: '45°' },
];

function rebuild() {
  if (!viewer || !props.doc) return;
  try {
    viewer.update(props.doc);
    mode.value = viewer.mode;
    syncAngle();
  } catch (e) {
    console.error('3D 更新失败', e);
  }
}

let pending = null;
function scheduleRebuild() {
  if (pending) cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => { pending = null; rebuild(); });
}

onMounted(() => {
  viewer = new SignViewer(cv.value);
  rebuild();
});
onBeforeUnmount(() => {
  if (pending) cancelAnimationFrame(pending);
  viewer?.dispose();
});

watch(() => props.doc, scheduleRebuild, { deep: true });

function setPreset(k) {
  mode.value = k;
  viewer.applyCameraPreset(k);
  syncAngle();
}
function setLighting(l) {
  lighting.value = l;
  viewer.setLighting(l);
}
function resetView() {
  viewer.camera.alpha = -Math.PI / 2 + (38 * Math.PI) / 180;
  viewer.camera.beta = Math.PI / 2 - (16 * Math.PI) / 180;
  viewer.camera.radius = 5.6;
  syncAngle();
}
function onAngleInput(e) {
  const deg = +e.target.value;
  applyAngle(deg);
}
function applyAngle(deg) {
  const rad = (deg * Math.PI) / 180;
  viewer.camera.alpha = -Math.PI / 2 + rad;
  viewer.camera.beta = Math.PI / 2 - (Math.abs(deg) * 0.4 * Math.PI) / 180;
  angle.value = Math.abs(deg);
  angleInput.value = deg;
  emit('angle', Math.abs(deg));
  highlightPreset();
}
function syncAngle() {
  const a = Math.abs(viewer.signedAngleDeg());
  angle.value = a;
  angleInput.value = Math.round(viewer.signedAngleDeg());
  emit('angle', Math.round(a));
}
function highlightPreset() {
  const a = Math.abs(angleInput.value);
  mode.value = a < 4 ? 'front' : a < 9 ? 'perspective' : a < 22 ? 'side15' : a < 38 ? 'side30' : 'side45';
}

defineExpose({ snapshot: () => viewer?.snapshot() });
</script>

<style scoped>
.viewer { display: flex; flex-direction: column; min-height: 0; }
.head { padding: 8px 11px 6px; border-bottom: 1px solid var(--line-soft); }
.angle { color: var(--sky); font-size: 11px; }
.canvas-box { position: relative; flex: 1; min-height: 190px; }
canvas { width: 100%; height: 100%; display: block; }
.overlay-hud {
  position: absolute; bottom: 8px; left: 10px; font-size: 10px;
  color: rgba(200, 215, 235, 0.65); pointer-events: none;
}
.controls { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line-soft); }
.presets { display: flex; gap: 2px; }
.presets button { flex: 1; padding: 2px 0; font-size: 11px; border-radius: 5px; }
.angle-slider { display: grid; grid-template-columns: 58px 1fr; align-items: center; gap: 7px; }
</style>
