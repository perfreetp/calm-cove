<template>
  <canvas
    ref="el"
    class="voxel-canvas"
    @mousedown="onDown"
    @mousemove="onMove"
    @mouseup="onUp"
    @mouseleave="onLeave"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  ></canvas>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { VoxelRenderer } from '../voxel/renderer.js'

const props = defineProps({
  chunks: { type: Array, default: () => [] },
  dims: { type: Array, default: () => [24, 12, 24] },
  layer: { type: Number, default: 0 },
  selection: { type: Object, default: null },
  readOnly: { type: Boolean, default: false },
  getVoxel: { type: Function, default: null },
  camera: { type: Object, default: null } // 初始相机 {yaw,pitch,dist}
})
const emit = defineEmits(['cellDown', 'cellMove', 'cellUp', 'cameraChange'])

const el = ref(null)
let r = null
let raf = 0
let orbiting = false
let editing = false
let lastX = 0, lastY = 0

function info(e) {
  const ray = r.screenRay(e.clientX, e.clientY)
  return {
    plane: r.layerCell(ray),
    hit: props.getVoxel ? r.raycastVoxel(ray) : null,
    shift: e.shiftKey
  }
}

function onDown(e) {
  if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
    orbiting = true
  } else if (e.button === 0 && !props.readOnly) {
    editing = true
    emit('cellDown', info(e))
  }
  lastX = e.clientX; lastY = e.clientY
}

function onMove(e) {
  if (orbiting) {
    const dx = e.clientX - lastX, dy = e.clientY - lastY
    r.camera.yaw -= dx * 0.008
    r.camera.pitch = Math.min(1.5, Math.max(0.05, r.camera.pitch + dy * 0.008))
    emit('cameraChange', { ...r.camera })
  } else if (!props.readOnly) {
    const i = info(e)
    r.setScene({ cursor: i.plane })
    if (editing) emit('cellMove', i)
  }
  lastX = e.clientX; lastY = e.clientY
}

function onUp(e) {
  if (orbiting) orbiting = false
  else if (editing) { editing = false; emit('cellUp', info(e)) }
}

function onLeave() {
  r.setScene({ cursor: null })
  orbiting = false
  if (editing) { editing = false; emit('cellUp', { plane: null, hit: null }) }
}

function onWheel(e) {
  r.camera.dist = Math.min(120, Math.max(8, r.camera.dist * (e.deltaY > 0 ? 1.1 : 0.9)))
  emit('cameraChange', { ...r.camera })
}

function loop() {
  r.render()
  raf = requestAnimationFrame(loop)
}

onMounted(() => {
  r = new VoxelRenderer(el.value)
  if (props.camera) Object.assign(r.camera, props.camera)
  r.getVoxelFn = props.getVoxel
  r.setChunks(props.chunks)
  r.setScene({ dims: props.dims, layer: props.layer, selection: props.selection })
  loop()
})

onBeforeUnmount(() => { cancelAnimationFrame(raf); r && r.destroy() })

watch(() => props.chunks, c => r && r.setChunks(c), { deep: false })
watch(() => [props.dims, props.layer, props.selection], () => {
  r && r.setScene({ dims: props.dims, layer: props.layer, selection: props.selection })
}, { deep: true })
watch(() => props.getVoxel, f => { if (r) r.getVoxelFn = f })

defineExpose({
  getCamera: () => (r ? { ...r.camera } : null),
  setCamera: c => { if (r && c) Object.assign(r.camera, c) }
})
</script>
