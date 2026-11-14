<template>
  <el-dialog v-model="modelValue" title="编队脚本只读预览（飞手不可改稿）" width="86%" top="4vh"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)">
    <div v-if="script" class="preview">
      <div class="canvas-box panel" style="height: 460px; padding: 8px">
        <SceneCanvas :points="points" :lines="lines" :pick-ids="pickIds" :selected-drone="selected"
          @pick="(id: string) => (selected = id)" />
      </div>
      <TimelineTrack :keyframes="script.keyframes" :segments="script.segments" :duration="duration"
        :current-time="time" :selected-segment-id="null" :playing="playing"
        @update:current-time="(t: number) => (time = t)" @select-segment="() => undefined"
        @select-keyframe="() => undefined" @toggle-play="toggle" @stop="stop" />
      <div class="panel" style="margin-top: 10px">
        <div class="flex-row" style="justify-content: space-between">
          <b>无人机数：{{ script.droneCount }} · 总时长：{{ duration.toFixed(0) }}s</b>
          <span class="dim">限速 {{ script.limits.maxSpeed }}m/s · 限加速 {{ script.limits.maxAccel }}m/s²</span>
        </div>
        <el-alert type="warning" :closable="false" show-icon style="margin-top: 10px"
          title="飞手账号仅可预览，编队骨架、关键帧与缓动曲线均为只读，不能修改稿件。" />
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ShowScript } from '@/types'
import { buildScene } from '@/render/scene'
import { allDroneIds } from '@/lib/geometry'
import { totalDuration } from '@/lib/script'
import SceneCanvas from '@/components/SceneCanvas.vue'
import TimelineTrack from '@/components/TimelineTrack.vue'

const props = defineProps<{ modelValue: boolean; script: ShowScript | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const modelValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})
const time = ref(0)
const playing = ref(false)
const selected = ref<string | null>(null)
let timer: number | null = null

const duration = computed(() => (props.script ? totalDuration(props.script) : 0))
const payload = computed(() =>
  props.script ? buildScene(props.script, { timeSec: time.value }) : { points: [], lines: [] }
)
const points = computed(() => payload.value.points)
const lines = computed(() => payload.value.lines)
const pickIds = computed(() => (props.script ? allDroneIds(props.script.droneCount) : []))

function toggle() {
  if (playing.value) {
    playing.value = false
    if (timer) clearInterval(timer)
    return
  }
  if (time.value >= duration.value) time.value = 0
  playing.value = true
  let last = performance.now()
  timer = window.setInterval(() => {
    const now = performance.now()
    time.value += (now - last) / 1000
    last = now
    if (time.value >= duration.value) {
      time.value = duration.value
      playing.value = false
      if (timer) clearInterval(timer)
    }
  }, 50)
}
function stop() {
  time.value = 0
  playing.value = false
  if (timer) clearInterval(timer)
}
watch(
  () => props.modelValue,
  (v) => {
    if (!v) stop()
    else time.value = 0
  }
)
</script>
