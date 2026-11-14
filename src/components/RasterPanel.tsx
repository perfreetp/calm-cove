import React from 'react'
import { useStore } from '../store'
import { WORLD_H, WORLD_W } from '../data/worldgen'
import { uid } from '../lib/geo'

export default function RasterPanel() {
  const sheets = useStore((s) => s.sheets)
  const addSheet = useStore((s) => s.addSheet)
  const updateSheet = useStore((s) => s.updateSheet)
  const removeSheet = useStore((s) => s.removeSheet)
  const bringSheetToFront = useStore((s) => s.bringSheetToFront)
  const rasterOn = useStore((s) => s.rasterOn)
  const setRasterOn = useStore((s) => s.setRasterOn)
  const notify = useStore((s) => s.notify)
  const role = useStore((s) => s.role)
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [dragOver, setDragOver] = React.useState(false)

  const active = sheets.find((s) => s.id === activeId) || sheets[sheets.length - 1] || null

  function ingest(files: FileList | File[]) {
    if (role === 'reviewer') {
      notify('审核员不可导入底图', 'error')
      return
    }
    const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|svg)$/i.test(f.name))
    if (list.length === 0) {
      notify('请选择 PNG / JPG / WebP / SVG 格式的扫描图或照片', 'error')
      return
    }
    for (const file of list) {
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result)
        const probe = new Image()
        probe.onload = () => {
          const ratio = probe.naturalHeight / Math.max(1, probe.naturalWidth)
          // 以当前视口八成宽度铺放，按原图长宽比定高
          const s = useStore.getState()
          const cam = s.camera || { x: WORLD_W / 2, y: WORLD_H / 2, k: 0.4 }
          const w = Math.min(WORLD_W * 0.9, Math.max(600, 1900))
          const h = Math.min(WORLD_H * 0.95, Math.max(300, w * ratio))
          addSheet({
            id: uid('sheet'),
            name: file.name.replace(/\.[^.]+$/, ''),
            url,
            x: cam.x - w / 2,
            y: cam.y - h / 2,
            w,
            h,
            opacity: 0.45,
          })
          setActiveId(null)
        }
        probe.onerror = () => notify(`无法解析图片：${file.name}`, 'error')
        probe.src = url
      }
      reader.onerror = () => notify(`读取失败：${file.name}`, 'error')
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="panel-section raster-panel">
      <div className="section-head">
        <span>扫描原图</span>
        <span className="layer-toggles">
          <button className="link-btn" onClick={() => setRasterOn(!rasterOn)}>
            {rasterOn ? '隐藏叠加' : '显示叠加'}
          </button>
        </span>
      </div>

      <div
        className={`raster-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          ingest(e.dataTransfer.files)
        }}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf"
          hidden
          onChange={(e) => {
            if (e.target.files) ingest(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="rd-icon">⊞</span>
        <span className="rd-text">
          拖入或点击导入扫描渠系图 / 照片
          <em>支持 PNG · JPG · WebP · SVG，可多选</em>
        </span>
      </div>

      <div className="raster-list">
        {sheets.length === 0 && <div className="empty-note">尚未导入底图，可先导入扫描件再矢量化。</div>}
        {sheets.map((s) => (
          <div
            key={s.id}
            className={`raster-item ${active?.id === s.id ? 'active' : ''}`}
            onClick={() => setActiveId(s.id === activeId ? null : s.id)}
          >
            <span className="ri-thumb" style={s.url ? { backgroundImage: `url(${s.url})` } : undefined} />
            <div className="ri-main">
              <div className="ri-name" title={s.name}>
                {s.name}
              </div>
              <div className="ri-meta mono">
                {Math.round(s.w)}×{Math.round(s.h)} · 不透明度 {Math.round(s.opacity * 100)}%
              </div>
            </div>
            <button
              className="ri-act"
              title="置于最上层"
              onClick={(e) => {
                e.stopPropagation()
                bringSheetToFront(s.id)
              }}
            >
              ↑
            </button>
            <button
              className="ri-act danger"
              title="移除"
              onClick={(e) => {
                e.stopPropagation()
                removeSheet(s.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {active && (
        <div className="raster-controls">
          <div className="rc-label-row">
            <span>底图校正 · <span className="mono">{active.name}</span></span>
          </div>
          <label className="slider-row">
            <span>不透明度</span>
            <input
              type="range"
              min={5}
              max={100}
              value={Math.round(active.opacity * 100)}
              onChange={(e) => updateSheet(active.id, { opacity: Number(e.target.value) / 100 })}
            />
            <span className="mono">{Math.round(active.opacity * 100)}%</span>
          </label>
          <label className="slider-row">
            <span>宽度 (m)</span>
            <input
              type="range"
              min={200}
              max={4000}
              step={20}
              value={Math.round(active.w * 4)}
              onChange={(e) => {
                const newW = Number(e.target.value) / 4
                const ratio = active.h / active.w
                updateSheet(active.id, { w: newW, h: newW * ratio })
              }}
            />
            <span className="mono">{Math.round(active.w * 4)}</span>
          </label>
          <label className="slider-row">
            <span>缩放微调</span>
            <input
              type="range"
              min={-100}
              max={100}
              value={0}
              onChange={(e) => {
                const f = 1 + Number(e.target.value) / 400
                const cx = active.x + active.w / 2
                const cy = active.y + active.h / 2
                const w = active.w * f
                const h = active.h * f
                updateSheet(active.id, { w, h, x: cx - w / 2, y: cy - h / 2 })
              }}
            />
            <span className="mono dim">拖动</span>
          </label>
          <div className="nudge-grid">
            <span className="dim">微移 (m)</span>
            {[
              ['←', -20, 0],
              ['→', 20, 0],
              ['↑', 0, -20],
              ['↓', 0, 20],
            ].map(([label, dx, dy]) => (
              <button
                key={label as string}
                className="btn tiny"
                onClick={() => updateSheet(active.id, { x: active.x + (dx as number) / 4, y: active.y + (dy as number) / 4 })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rc-hint dim tiny-note">
            提示：先降低不透明度，用渠道矢量线与扫描图套合，再逐段描线。
          </div>
        </div>
      )}
    </div>
  )
}
