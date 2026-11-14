<template>
  <div class="timeline panel">
    <div class="panel-title">
      时间轴
      <span class="dim" style="font-weight: 400; font-size: 12px">总时长 {{ duration.toFixed(0) }}s · 当前 T+{{ currentTime.toFixed(1) }}s</span>
      <div style="flex: 1"></div>
      <el-button-group size="small">
        <el-button :type="playing ? 'danger' : 'primary'" @click="$emit('toggle-play')">
          {{ playing ? '暂停' : '播放' }}
        </el-button>
        <el-button @click="$emit('stop')">回到起点</el-button>
      </el-button-group>
    </div>

    <div ref="trackRef" class="track-scroll scroll-y" @pointerdown="onTrackDown" @pointermove="onTrackMove"
      @pointerup="onTrackUp" @pointerleave="onTrackUp">
      <div class="track" :style="{ width: trackWidth + 'px' }">
        <!-- 刻度 -->
        <div class="ruler">
          <div v-for="t in ticks" :key="t" class="tick" :style="{ left: t * pxPerSec + 'px' }">
            <span>{{ t }}s</span>
          </div>
        </div>

        <!-- 段（缓动区间） -->
        <div class="segments">
          <div v-for="seg in segments" :key="seg.id" class="segment"
            :class="{ active: seg.id === selectedSegmentId }" :style="segmentStyle(seg)"
            @click.stop="$emit('select-segment', seg.id)">
            <span class="seg-label">{{ easingText(seg) }} · {{ seg.durationSec }}s</span>
          </div>
        </div>

        <!-- 关键帧 -->
        <div class="keyframes">
          <div v-for="kf in keyframes" :key="kf.id" class="keyframe"
            :style="{ left: kf.timeSec * pxPerSec - 9 + 'px', background: kfColor(kf.type) }"
            :title="`${kfLabel(kf.type)} @${kf.timeSec}s ${kf.note}`"
            @click.stop="$emit('select-keyframe', kf.id)">
            <el-icon><component :is="kfIcon(kf.type)" /></el-icon>
          </div>
        </div>

        <!-- 播放头 -->
        <div class="playhead" :style="{ left: currentTime * pxPerSec + 'px' }">
          <div class="playhead-grip"></div>
          <div class="playhead-line"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Keyframe, KeyframeType, MotionSegment } from '@/types'
import { KEYFRAME_COLOR, KEYFRAME_LABEL } from '@/lib/labels'
import { controlPointsOf } from '@/lib/easing'

const props = defineProps<{
  keyframes: Keyframe[]
  segments: MotionSegment[]
  duration: number
  currentTime: number
  selectedSegmentId: string | null
  playing: boolean
}>()

const emit = defineEmits<{
  (e: 'update:currentTime', t: number): void
  (e: 'select-segment', id: string): void
  (e: 'select-keyframe', id: string): void
  (e: 'toggle-play'): void
  (e: 'stop'): void
}>()

const pxPerSec = 9
const trackRef = ref<HTMLDivElement>()
const scrubbing = ref(false)

const trackWidth = computed(() => Math.max(props.duration * pxPerSec + 80, 900))
const ticks = computed(() => {
  const step = props.duration > 120 ? 15 : 10
  const arr: number[] = []
  for (let t = 0; t <= props.duration; t += step) arr.push(t)
  return arr
})

function kfColor(t: KeyframeType) {
  return KEYFRAME_COLOR[t]
}
function kfLabel(t: KeyframeType) {
  return KEYFRAME_LABEL[t]
}
function kfIcon(t: KeyframeType) {
  return t === 'takeoff' ? 'Top' : t === 'land' ? 'Bottom' : 'Switch'
}
function easingText(seg: MotionSegment) {
  if (seg.easing !== 'custom') {
    return { linear: '线性', easeIn: '缓入', easeOut: '缓出', easeInOut: '缓入缓出', custom: '自定义' }[seg.easing]
  }
  const [p1] = controlPointsOf(seg)
  return `自定义(${p1.x.toFixed(1)},${p1.y.toFixed(1)})`
}
function segmentStyle(seg: MotionSegment) {
  const from = props.keyframes.find((k) => k.id === seg.fromKeyframeId)
  const to = props.keyframes.find((k) => k.id === seg.toKeyframeId)
  if (!from || !to) return {}
  return {
    left: from.timeSec * pxPerSec + 'px',
    width: (to.timeSec - from.timeSec) * pxPerSec - 4 + 'px'
  }
}

function timeFromEvent(e: PointerEvent): number {
  const rect = trackRef.value!.getBoundingClientRect()
  const x = e.clientX - rect.left + trackRef.value!.scrollLeft
  return Math.min(props.duration, Math.max(0, x / pxPerSec))
}
function onTrackDown(e: PointerEvent) {
  scrubbing.value = true
  emit('update:currentTime', timeFromEvent(e))
}
function onTrackMove(e: PointerEvent) {
  if (scrubbing.value) emit('update:currentTime', timeFromEvent(e))
}
function onTrackUp() {
  scrubbing.value = false
}
</script>

<style scoped>
.track-scroll {
  overflow-x: auto;
  padding-bottom: 8px;
}

.track {
  position: relative;
  height: 132px;
}

.ruler {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  border-bottom: 1px solid var(--border);
}

.tick {
  position: absolute;
  top: 4px;
  font-size: 11px;
  color: var(--text-dim);
}

.tick::after {
  content: '';
  position: absolute;
  left: 0;
  top: 16px;
  width: 1px;
  height: 6px;
  background: var(--border);
}

.segments {
  position: absolute;
  top: 34px;
  left: 0;
  right: 0;
  height: 34px;
}

.segment {
  position: absolute;
  top: 2px;
  height: 30px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(76, 141, 255, 0.25), rgba(76, 141, 255, 0.12));
  border: 1px solid rgba(76, 141, 255, 0.45);
  display: flex;
  align-items: center;
  padding: 0 8px;
  cursor: pointer;
}

.segment.active {
  border-color: #ffd60a;
  box-shadow: 0 0 0 1px #ffd60a inset;
}

.seg-label {
  font-size: 11px;
  color: #bcd4ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.keyframes {
  position: absolute;
  top: 78px;
  left: 0;
  right: 0;
  height: 36px;
}

.keyframe {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #06101f;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.35);
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  pointer-events: none;
  z-index: 5;
}

.playhead-line {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ff3040;
}

.playhead-grip {
  position: absolute;
  left: -6px;
  top: -2px;
  width: 14px;
  height: 10px;
  border-radius: 3px;
  background: #ff3040;
}
</style>
