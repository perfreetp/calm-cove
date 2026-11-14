<template>
  <svg ref="svgEl" @click="onSvgClick" @pointermove="onMove" @pointerleave="hover = null">
    <defs>
      <filter id="pin-shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-opacity="0.5" />
      </filter>
    </defs>
    <g ref="rootG">
      <!-- 地面网格 -->
      <g class="floor">
        <polygon
          v-for="t in floorTiles" :key="t.k"
          :points="pts(t.poly)"
          :fill="t.gold ? 'rgba(255,213,74,.10)' : 'rgba(120,150,210,.05)'"
          :stroke="t.gold ? 'rgba(255,213,74,.55)' : 'rgba(120,150,210,.18)'"
          stroke-width="1"
        />
      </g>
      <!-- 镜像轴 -->
      <line v-if="mirror" :x1="mirrorAxis[0].x" :y1="mirrorAxis[0].y"
            :x2="mirrorAxis[1].x" :y2="mirrorAxis[1].y"
            stroke="#38d6a0" stroke-width="1.6" stroke-dasharray="6 5" opacity=".8" />

      <!-- 体素 -->
      <g v-for="item in renderList" :key="item.voxel.id"
         @pointerdown="onVoxelDown($event, item)"
         @click.stop="onVoxelClick(item)">
        <polygon
          v-for="(f, fi) in item.faces" :key="fi"
          :points="pts(f.poly)"
          :fill="faceFill(item.voxel, f.kind)"
          :stroke="selected.has(item.voxel.id) ? '#4f8cff' : 'rgba(0,0,0,.35)'"
          :stroke-width="selected.has(item.voxel.id) ? 2 : 0.8"
          :opacity="item.ghost"
          class="voxel-face"
          :class="hlClass(item.voxel)"
        />
        <!-- 常用药位金星 -->
        <text v-if="item.voxel.commonSlot && item.faces.some(f=>f.kind==='top')"
              :x="topCenter(item).x" :y="topCenter(item).y - 4"
              text-anchor="middle" font-size="11" class="gold-star" :opacity="item.ghost">★</text>
        <!-- 拖拽幽灵 / 悬停框 -->
        <polygon v-if="dragId === item.voxel.id || (hover && hover.key === vkey(item.voxel))"
                 :points="pts(item.faces[0].poly)" fill="none"
                 stroke="#fff" stroke-width="1.4" stroke-dasharray="4 3" opacity=".9" />
      </g>

      <!-- 落位预览 -->
      <g v-if="hover && placementTool && !readonly">
        <polygon :points="pts(previewFaces.top)" :fill="VOXEL_TYPES[placementTool].color"
                 opacity=".35" stroke="#fff" stroke-dasharray="4 3" />
        <polygon :points="pts(previewFaces.left)" :fill="VOXEL_TYPES[placementTool].color"
                 opacity=".22" stroke="#fff" stroke-dasharray="4 3" />
        <polygon :points="pts(previewFaces.right)" :fill="VOXEL_TYPES[placementTool].color"
                 opacity=".28" stroke="#fff" stroke-dasharray="4 3" />
        <text v-if="!placementValid" :x="hover.sx" :y="hover.sy - 14"
              text-anchor="middle" fill="#ff5d6c" font-size="11.5">
          {{ hover.reason || '不可落位' }}
        </text>
      </g>

      <!-- 框选矩形 -->
      <rect v-if="marquee" :x="marquee.x0" :y="marquee.y0"
            :width="marquee.x1 - marquee.x0" :height="marquee.y1 - marquee.y0"
            fill="rgba(79,140,255,.14)" stroke="#4f8cff" stroke-dasharray="5 4" />

      <!-- 标注点 -->
      <g v-if="visibleLayers.annotation">
        <g v-for="(a, i) in annoPins" :key="a.id"
           @click.stop="$emit('annotation-click', a)"
           class="anno-pin" :class="a.status"
           :transform="`translate(${a.x},${a.y})`" filter="url(#pin-shadow)">
          <circle r="9" :fill="annoColor(a)" stroke="#fff" stroke-width="1.4" />
          <text y="3.6" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">{{ i + 1 }}</text>
        </g>
      </g>
    </g>
  </svg>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import * as d3 from 'd3'
import {
  iso, voxelFaces, pts, shade, painterSort as painterDraw, screenToGrid, TILE, H
} from '../lib/geometry.js'
import { VOXEL_TYPES, layerOf, GOLD_ZONE, inGoldZone } from '../lib/constants.js'

const props = defineProps({
  voxels: { type: Array, required: true },
  gridW: { type: Number, default: 20 },
  gridD: { type: Number, default: 14 },
  tool: { type: String, default: 'select' }, // select | marquee | <voxel type>
  level: { type: Number, default: 0 },
  mirror: { type: Boolean, default: false },
  visibleLayers: { type: Object, required: true },
  selected: { type: Set, default: () => new Set() },
  annotations: { type: Array, default: () => [] },
  highlight: { type: Map, default: () => new Map() }, // vkey -> added|removed|changed|issue
  readonly: { type: Boolean, default: false },
  showGold: { type: Boolean, default: true },
  showUpperGhost: { type: Boolean, default: true },
  zoomToken: { type: Number, default: 0 },
  externalTransform: { type: Object, default: null }
})
const emit = defineEmits([
  'place', 'voxel-click', 'selection-change', 'translate',
  'annotate-point', 'annotation-click', 'hover-info'
])

const svgEl = ref(null)
const rootG = ref(null)
const transform = ref(d3.zoomIdentity)
const hover = ref(null)
const marquee = ref(null)
const dragId = ref(null)
let dragState = null
let marqueeState = null

const placementTool = computed(() =>
  props.tool && VOXEL_TYPES[props.tool] ? props.tool : null)

const vkey = v => `${v.x},${v.y},${v.z}`

// ---------- D3 缩放 ----------
let zoomBehavior
onMounted(() => {
  const svg = d3.select(svgEl.value)
  zoomBehavior = d3.zoom()
    .scaleExtent([0.35, 3])
    .on('zoom', (event) => {
      transform.value = event.transform
      d3.select(rootG.value).attr('transform', event.transform.toString())
    })
    .filter((event) => {
      // 左键拖空白走框选;滚轮/中键/右键交给 d3 缩放平移
      if (event.type === 'mousedown' && event.button === 0) return false
      return true
    })
  svg.call(zoomBehavior)
  // 初始居中
  const box = svgEl.value.getBoundingClientRect()
  svg.call(zoomBehavior.transform,
    d3.zoomIdentity.translate(box.width / 2, 60).scale(1.05))
})
// 外部联动缩放(版本对比左右同步)
watch(() => props.zoomToken, (v, old) => {
  if (v === old || !props.externalTransform || !zoomBehavior) return
  d3.select(svgEl.value).call(zoomBehavior.transform, props.externalTransform)
})
onBeforeUnmount(() => { if (svgEl.value) d3.select(svgEl.value).on('.zoom', null) })

function toLocal(event) {
  const rect = svgEl.value.getBoundingClientRect()
  const sx0 = event.clientX - rect.left
  const sy0 = event.clientY - rect.top
  const t = transform.value
  return { sx: (sx0 - t.x) / t.k, sy: (sy0 - t.y) / t.k, sx0, sy0 }
}

function cellAt(event) {
  const { sx, sy, sx0, sy0 } = toLocal(event)
  const g = screenToGrid(sx, sy)
  return { ...g, sx, sy, sx0, sy0 }
}

// ---------- 地面 ----------
const floorTiles = computed(() => {
  const out = []
  for (let y = 0; y < props.gridD; y++) {
    for (let x = 0; x < props.gridW; x++) {
      const c = iso(x, y, 0)
      const t = TILE / 2, q = TILE / 4
      out.push({
        k: x + ',' + y,
        gold: props.showGold && inGoldZone(x, y),
        poly: [
          [c.x, c.y], [c.x + t, c.y + q],
          [c.x, c.y + t / 2], [c.x - t, c.y + q]
        ]
      })
    }
  }
  return out
})

const mirrorAxis = computed(() => {
  const mid = (props.gridW - 1) / 2
  const a = iso(mid, -0.6, 0), b = iso(mid, props.gridD - 0.4, 0)
  return [a, b]
})

// ---------- 体素渲染 ----------
const occupied = computed(() => {
  const m = new Map()
  props.voxels.forEach(v => m.set(vkey(v), v))
  return m
})

const renderList = computed(() => {
  const layerOn = props.visibleLayers
  const list = props.voxels.filter(v => layerOn[layerOf(v.type)] !== false)
  return painterDraw(list).map(voxel => {
    const f = voxelFaces(voxel.x, voxel.y, voxel.z)
    const faces = []
    if (!occupied.value.has(`${voxel.x},${voxel.y},${voxel.z + 1}`))
      faces.push({ kind: 'top', poly: f.top })
    if (!occupied.value.has(`${voxel.x - 1},${voxel.y},${voxel.z}`))
      faces.push({ kind: 'left', poly: f.left })
    if (!occupied.value.has(`${voxel.x},${voxel.y + 1},${voxel.z}`))
      faces.push({ kind: 'right', poly: f.right })
    let ghost = 1
    if (voxel.z > props.level) ghost = props.showUpperGhost ? 0.16 : 0
    else if (voxel.z < props.level) ghost = 0.55
    return { voxel, faces, ghost }
  }).filter(r => r.ghost > 0)
})

function faceFill(v, kind) {
  const base = VOXEL_TYPES[v.type].color
  if (kind === 'top') return shade(base, 1.12)
  if (kind === 'left') return shade(base, 0.82)
  return shade(base, 0.96)
}

function hlClass(v) {
  const h = props.highlight.get(vkey(v))
  return h ? 'hl-' + h : ''
}

function topCenter(item) {
  const f = item.faces.find(f => f.kind === 'top')
  const p = f.poly
  return { x: (p[0][0] + p[2][0]) / 2, y: (p[0][1] + p[2][1]) / 2 }
}

// ---------- 标注投影 ----------
const annoPins = computed(() => {
  return props.annotations.map(a => {
    const c = iso(a.gx, a.gy, (a.gz || 0) + 1)
    return { ...a, x: c.x, y: c.y - 6 }
  })
})
function annoColor(a) {
  if (a.status === 'closed') return '#38d6a0'
  if (a.status === 'kept') return '#ffb020'
  return a.kind === 'distance' ? '#ff5d6c' : a.kind === 'gold' ? '#ffd54a' : '#4f8cff'
}

// ---------- 落位预览 ----------
const previewFaces = computed(() => {
  if (!hover.value || !placementTool.value) return voxelFaces(0, 0, props.level)
  return voxelFaces(hover.value.x, hover.value.y, props.level)
})
const placementValid = computed(() => hover.value?.valid !== false)

// ---------- 交互 ----------
function onMove(event) {
  const c = cellAt(event)
  const inside = c.x >= 0 && c.x < props.gridW && c.y >= 0 && c.y < props.gridD
  const blocked = occupied.value.has(`${c.x},${c.y},${props.level}`)
  const valid = inside && !blocked
  hover.value = {
    ...c, key: `${c.x},${c.y},${props.level}`,
    valid, reason: !inside ? '超出网格' : blocked ? '该格已占用' : null
  }
  emit('hover-info', { ...hover.value, inside })

  if (dragState) {
    const dx = c.x - dragState.gx0
    const dy = c.y - dragState.gy0
    if (dx !== dragState.dx || dy !== dragState.dy) {
      dragState.dx = dx; dragState.dy = dy
      dragState.preview = { dx, dy }
    }
    return
  }
  if (marqueeState) {
    marquee.value = {
      x0: Math.min(marqueeState.x0, c.sx0), y0: Math.min(marqueeState.y0, c.sy0),
      x1: Math.max(marqueeState.x0, c.sx0), y1: Math.max(marqueeState.y0, c.sy0)
    }
  }
}

function onSvgClick(event) {
  const c = cellAt(event)
  if (props.tool === 'marquee' && marqueeState) {
    finishMarquee()
    return
  }
  if (placementTool.value && !props.readonly) {
    if (!hover.value || hover.value.valid === false) return
    emit('place', { x: c.x, y: c.y, z: props.level, type: placementTool.value })
    return
  }
  if (props.tool === 'annotate') {
    emit('annotate-point', { gx: c.x, gy: c.y, gz: props.level })
    return
  }
  // 空白点击清空选择
  if (!dragState) emit('selection-change', [])
}

function onVoxelClick(item) {
  emit('voxel-click', item.voxel)
}

function onVoxelDown(event, item) {
  if (event.button !== 0 || props.readonly) return
  if (props.tool === 'annotate') return
  // 框选工具按下启动 marquee;选择工具按下启动拖拽
  if (props.tool === 'marquee') {
    const c = cellAt(event)
    marqueeState = { x0: c.sx0, y0: c.sy0 }
    marquee.value = { x0: c.sx0, y0: c.sy0, x1: c.sx0, y1: c.sy0 }
    return
  }
  if (props.tool === 'select' && !placementTool.value) {
    const c = cellAt(event)
    const ids = props.selected.has(item.voxel.id)
      ? [...props.selected]
      : (event.shiftKey ? [...props.selected, item.voxel.id] : [item.voxel.id])
    if (!props.selected.has(item.voxel.id)) emit('selection-change', ids)
    dragState = {
      gx0: c.x, gy0: c.y, dx: 0, dy: 0, ids,
      moved: false
    }
    dragId.value = item.voxel.id
    window.addEventListener('pointerup', onDragUp)
  }
}

function onDragUp() {
  window.removeEventListener('pointerup', onDragUp)
  if (dragState && (dragState.dx || dragState.dy)) {
    emit('translate', { dx: dragState.dx, dy: dragState.dy, ids: dragState.ids })
  }
  dragState = null
  dragId.value = null
}

function finishMarquee() {
  const r = marquee.value
  const ids = []
  if (r) {
    for (const v of props.voxels) {
      if (v.z !== props.level) continue
      if (props.visibleLayers[layerOf(v.type)] === false) continue
      const c = iso(v.x, v.y, v.z + 1)
      if (c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1) ids.push(v.id)
    }
  }
  emit('selection-change', ids)
  marquee.value = null
  marqueeState = null
}

defineExpose({
  resetView() {
    const box = svgEl.value.getBoundingClientRect()
    d3.select(svgEl.value).call(zoomBehavior.transform,
      d3.zoomIdentity.translate(box.width / 2, 60).scale(1.05))
  },
  getTransform() { return transform.value }
})
</script>

<style scoped>
.voxel-face { transition: opacity .15s; cursor: pointer; }
.hl-added { stroke: #38d6a0 !important; stroke-width: 2.4; }
.hl-removed { stroke: #ff5d6c !important; stroke-width: 2.4; stroke-dasharray: 4 3; }
.hl-changed { stroke: #ffb020 !important; stroke-width: 2.4; }
.hl-issue { stroke: #ff5d6c !important; stroke-width: 2; }
.gold-star { fill: #ffd54a; pointer-events: none; font-family: sans-serif; }
.anno-pin { cursor: pointer; transition: transform .12s; }
.anno-pin:hover { transform: scale(1.18); }
</style>
