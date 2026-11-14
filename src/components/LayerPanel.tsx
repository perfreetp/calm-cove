import React from 'react'
import { useStore } from '../store'
import { LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER, TYPE_COLOR, TYPE_LABEL, TYPE_ORDER } from '../types'
import { symbolForType } from '../map/symbols'

export default function LayerPanel() {
  const layers = useStore((s) => s.layers)
  const toggleLevel = useStore((s) => s.toggleLevel)
  const toggleType = useStore((s) => s.toggleType)
  const setLayer = useStore((s) => s.setLayer)
  const allLevels = useStore((s) => s.allLevels)
  const allTypes = useStore((s) => s.allTypes)
  const rasterOn = useStore((s) => s.rasterOn)
  const setRasterOn = useStore((s) => s.setRasterOn)

  return (
    <div className="panel-section layers">
      <div className="section-head">
        <span>图层控制</span>
        <span className="dim tiny-note">状态自动记忆</span>
      </div>

      <div className="layer-block">
        <div className="layer-block-head">
          <span>按渠系等级</span>
          <span className="layer-toggles">
            <button className="link-btn" onClick={() => allLevels(true)}>
              全开
            </button>
            <button className="link-btn" onClick={() => allLevels(false)}>
              全关
            </button>
          </span>
        </div>
        {LEVEL_ORDER.map((l) => (
          <label className="layer-row" key={l}>
            <span className="switch" data-on={layers.levels[l]}>
              <input type="checkbox" checked={layers.levels[l]} onChange={() => toggleLevel(l)} />
              <span className="slider" />
            </span>
            <span className="layer-swatch" style={{ background: LEVEL_COLOR[l] }} />
            <span className="layer-name">{LEVEL_LABEL[l]}</span>
            <span className="layer-note">{l === 'trunk' ? '骨干输水' : l === 'branch' ? '分水配水' : '田间配水'}</span>
          </label>
        ))}
      </div>

      <div className="layer-block">
        <div className="layer-block-head">
          <span>按要素类型</span>
          <span className="layer-toggles">
            <button className="link-btn" onClick={() => allTypes(true)}>
              全开
            </button>
            <button className="link-btn" onClick={() => allTypes(false)}>
              全关
            </button>
          </span>
        </div>
        {TYPE_ORDER.map((t) => (
          <label className="layer-row" key={t}>
            <span className="switch" data-on={layers.types[t]}>
              <input type="checkbox" checked={layers.types[t]} onChange={() => toggleType(t)} />
              <span className="slider" />
            </span>
            <span
              className="layer-sym"
              style={{ color: TYPE_COLOR[t] }}
              dangerouslySetInnerHTML={{ __html: symMini(t) }}
            />
            <span className="layer-name">{TYPE_LABEL[t]}</span>
            <span className="layer-note">{TYPE_NOTE[t]}</span>
          </label>
        ))}
      </div>

      <div className="layer-block">
        <div className="layer-block-head">
          <span>底图与标注</span>
        </div>
        <ToggleRow label="扫描原图" checked={layers.showRaster} onChange={(v) => setLayer('showRaster', v)} />
        <ToggleRow
          label="扫描图叠加显示"
          checked={rasterOn}
          onChange={(v) => setRasterOn(v)}
          hint="快速隐藏以便核对矢量线"
        />
        <ToggleRow label="地形晕渲" checked={layers.showTerrain} onChange={(v) => setLayer('showTerrain', v)} />
        <ToggleRow label="渠道名称" checked={layers.showLabels} onChange={(v) => setLayer('showLabels', v)} />
        <ToggleRow label="桩号里程" checked={layers.showChainage} onChange={(v) => setLayer('showChainage', v)} hint="缩放 ≥ 3.2× 显示" />
        <ToggleRow label="退回段落" checked={layers.showRejections} onChange={(v) => setLayer('showRejections', v)} />
      </div>
    </div>
  )
}

const TYPE_NOTE: Record<string, string> = {
  gate: '分水/节制',
  weir: '量水',
  pump: '提灌',
  drop: '消能',
  culvert: '交叉',
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="layer-row compact">
      <span className="switch" data-on={checked}>
        <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} />
        <span className="slider" />
      </span>
      <span className="layer-name">{label}</span>
      {hint && <span className="layer-note">{hint}</span>}
    </label>
  )
}

function symMini(type: 'gate' | 'weir' | 'pump' | 'drop' | 'culvert') {
  return `<svg width="15" height="15" viewBox="-8 -8 16 16">${symbolForType(type, 13)
    .map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(0.9, p.sw)}" />`)
    .join('')}</svg>`
}
