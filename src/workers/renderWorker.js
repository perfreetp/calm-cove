// OffscreenCanvas 渲染 Worker：预览与导出均在 Worker 内绘制，不阻塞主线程
import { samplePose, solveWorld } from '../engine/rig.js'
import { drawFrame } from '../engine/render.js'
import { phonemeAt } from '../engine/lipsync.js'

let canvas = null
let ctx = null
let parts = {}
let playing = false
let timer = null

function renderFrame(state, frame) {
  const pose = samplePose(state.bones, state.tracks, state.loopTracks, frame)
  const world = solveWorld(state.bones, pose)
  drawFrame(ctx, {
    width: canvas.width,
    height: canvas.height,
    bones: state.bones,
    world,
    parts,
    phoneme: phonemeAt(state.lipTrack, frame),
    showBones: state.showBones,
    annotations: (state.annotations || []).filter((a) => a.frame === frame),
    meta: state.meta
  })
}

self.onmessage = async (e) => {
  const msg = e.data
  if (msg.type === 'init') {
    canvas = msg.canvas
    canvas.width = msg.width
    canvas.height = msg.height
    ctx = canvas.getContext('2d')
    parts = msg.parts // { id: {img: ImageBitmap, ax, ay} }（已 transfer）
    self.postMessage({ type: 'ready' })
  } else if (msg.type === 'setParts') {
    parts = msg.parts
  } else if (msg.type === 'render') {
    if (!ctx) return
    renderFrame(msg.state, msg.frame)
    self.postMessage({ type: 'rendered', frame: msg.frame })
  } else if (msg.type === 'play') {
    if (timer) clearInterval(timer)
    playing = true
    let frame = msg.from || 0
    const step = () => {
      if (!playing) return
      renderFrame(msg.state, frame)
      self.postMessage({ type: 'tick', frame })
      frame++
      if (frame > msg.state.duration) frame = 0
    }
    step()
    timer = setInterval(step, 1000 / (msg.fps || 25))
  } else if (msg.type === 'updateState') {
    // 播放中更新状态（保持当前帧继续）
    if (timer) {
      clearInterval(timer)
      timer = null
      playing = false
    }
  } else if (msg.type === 'stop') {
    playing = false
    if (timer) { clearInterval(timer); timer = null }
  } else if (msg.type === 'exportFrame') {
    // 渲染单帧并回传 PNG Blob（导出序列帧用）
    renderFrame(msg.state, msg.frame)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    self.postMessage({ type: 'frameBlob', frame: msg.frame, blob })
  }
}
