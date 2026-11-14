import React from 'react'
import { useStore } from '../store'
import type { Role, FeatureType } from '../types'
import { ROLE_LABEL, TYPE_COLOR, TYPE_LABEL } from '../types'
import { symSvgFor } from './icons'

const TOOL_TYPES: FeatureType[] = ['gate', 'weir', 'pump', 'drop', 'culvert']

export default function Toolbar() {
  const tool = useStore((s) => s.tool)
  const setTool = useStore((s) => s.setTool)
  const role = useStore((s) => s.role)
  const setRole = useStore((s) => s.setRole)
  const editMode = useStore((s) => s.editMode)
  const setEditMode = useStore((s) => s.setEditMode)
  const notify = useStore((s) => s.notify)
  const clearDraw = useStore((s) => s.clearDraw)
  const showShortcuts = useStore((s) => s.showShortcuts)
  const setShowShortcuts = useStore((s) => s.setShowShortcuts)

  const reviewer = role === 'reviewer'

  return (
    <div className="toolbar">
      <div className="tb-group">
        <button className={`tool-btn ${tool === 'select' ? 'on' : ''}`} onClick={() => setTool('select')} title="选择 (V)">
          <span className="tb-icon">◈</span>
          选择
        </button>
        <button className={`tool-btn ${tool === 'pan' ? 'on' : ''}`} onClick={() => setTool('pan')} title="平移 (P)">
          <span className="tb-icon">✥</span>
          平移
        </button>
        <button className={`tool-btn ${tool === 'measure' ? 'on' : ''}`} onClick={() => setTool('measure')} title="量距 (M)">
          <span className="tb-icon">⟷</span>
          量距
          {tool === 'measure' && <span className="tb-badge">Esc 清除</span>}
        </button>
      </div>

      <div className="tb-sep" />

      <div className="tb-group">
        <button
          className={`tool-btn ${tool === 'draw' ? 'on' : ''}`}
          onClick={() => {
            if (reviewer) {
              notify('审核员不可描线建档', 'error')
              return
            }
            setTool('draw')
          }}
          title="描线建档"
        >
          <span className="tb-icon">╱</span>
          描线建档
        </button>
      </div>

      <div className="tb-sep" />

      <div className="tb-group types">
        {TOOL_TYPES.map((t, i) => (
          <button
            key={t}
            className={`tool-btn type-tool ${tool === t ? 'on' : ''}`}
            style={{ '--tc': TYPE_COLOR[t] } as React.CSSProperties}
            onClick={() => {
              if (reviewer) {
                notify('审核员不可新增要素', 'error')
                return
              }
              const next = useStore.getState()
              next.setTool(t)
              if (!next.editMode) next.setEditMode(true)
            }}
            title={`${TYPE_LABEL[t]} (${i + 1})`}
          >
            <span
              className="tb-sym"
              dangerouslySetInnerHTML={{ __html: symSvgFor(t) }}
            />
            {TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="tb-spacer" />

      <div className="tb-group">
        <button className="tool-btn ghost" onClick={() => setShowShortcuts(!showShortcuts)} title="操作速查 (?)">
          ?
        </button>
      </div>

      <div className="tb-sep" />

      <div className="role-switch" title="切换岗位角色（演示用）">
        {(['archivist', 'processor', 'reviewer'] as Role[]).map((r) => (
          <button key={r} className={`role-btn ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
    </div>
  )
}
