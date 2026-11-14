// 序列帧导出：Worker 逐帧渲染 → PNG → ZIP（含带帧号的清单 manifest.json）
import { makeZip } from './zip.js'

export async function exportSequence(worker, state, { fps, width, height, prefix = 'frame', onProgress } = {}) {
  const files = []
  const manifest = {
    project: state.meta?.template || '未命名',
    fps,
    width,
    height,
    frameCount: state.duration + 1,
    exportedAt: new Date().toISOString(),
    frames: []
  }
  for (let f = 0; f <= state.duration; f++) {
    const blob = await requestFrame(worker, state, f)
    const buf = new Uint8Array(await blob.arrayBuffer())
    const name = `${prefix}_${String(f).padStart(4, '0')}.png`
    files.push({ name, data: buf })
    manifest.frames.push({
      frame: f,
      file: name,
      timecode: frameToTimecode(f, fps)
    })
    onProgress && onProgress(f, state.duration)
  }
  files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) })
  return makeZip(files)
}

function requestFrame(worker, state, frame) {
  return new Promise((resolve, reject) => {
    const handler = (e) => {
      if (e.data.type === 'frameBlob' && e.data.frame === frame) {
        worker.removeEventListener('message', handler)
        resolve(e.data.blob)
      }
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'exportFrame', state, frame })
    setTimeout(() => { worker.removeEventListener('message', handler); reject(new Error('导出超时')) }, 15000)
  })
}

export function frameToTimecode(frame, fps) {
  const s = Math.floor(frame / fps)
  const ff = frame % fps
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `00:${mm}:${ss}:${String(ff).padStart(2, '0')}`
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
