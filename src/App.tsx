import React from 'react'
import { useStore } from './store'
import MapView from './map/MapView'
import CanalTree from './components/CanalTree'
import LayerPanel from './components/LayerPanel'
import RasterPanel from './components/RasterPanel'
import StatsPanel from './components/StatsPanel'
import ArchiveCard from './components/ArchiveCard'
import ReviewPanel from './components/ReviewPanel'
import SearchPanel from './components/SearchPanel'
import ExportPanel from './components/ExportPanel'
import Toolbar from './components/Toolbar'
import { STATUS_COLOR, STATUS_LABEL } from './types'

type Tab = 'map' | 'review' | 'search' | 'batch'

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: '加工底图' },
  { id: 'review', label: '审核工作台' },
  { id: 'search', label: '档案检索' },
  { id: 'batch', label: '导出与版本' },
]

export default function App() {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const role = useStore((s) => s.role)
  const world = useStore((s) => s.world)
  const selectionId = useStore((s) => s.selectionId)
  const selectedCanalId = useStore((s) => s.selectedCanalId)
  const notices = useStore((s) => s.notices)
  const dismissNotice = useStore((s) => s.dismissNotice)
  const panelCollapsed = useStore((s) => s.panelCollapsed)
  const togglePanel = useStore((s) => s.togglePanel)

  const selectedCanal = selectedCanalId ? world.canals.find((c) => c.id === selectedCanalId) : null
  const submitted = world.canals.filter((c) => c.status === 'submitted').length
  const rejected = world.canals.filter((c) => c.status === 'rejected').length

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">渠</div>
          <div className="brand-text">
            <h1>青杠岭山区灌区 · 渠系档案加工系统</h1>
            <p>渠系平面图矢量化 · 要素建档 · 审核归档一体化</p>
          </div>
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'review' && submitted + rejected > 0 && <span className="tab-badge">{submitted + rejected}</span>}
            </button>
          ))}
        </nav>
        <div className="header-meta">
          <div className="hm-item">
            <span className="hm-label">岗位</span>
            <span className="hm-value">{role === 'archivist' ? '档案员' : role === 'processor' ? '加工员' : '审核员'}</span>
          </div>
          <div className="hm-item">
            <span className="hm-label">待审</span>
            <span className="hm-value" style={{ color: submitted ? '#2f6fae' : undefined }}>
              {submitted}
            </span>
          </div>
          <div className="hm-item">
            <span className="hm-label">退回</span>
            <span className="hm-value" style={{ color: rejected ? '#bd3b32' : undefined }}>
              {rejected}
            </span>
          </div>
        </div>
      </header>

      <div className={`app-body mode-${tab}`}>
        {tab === 'map' && (
          <>
            <aside className={`left-panel ${panelCollapsed.left ? 'collapsed' : ''}`}>
              <button className="panel-collapse left" onClick={() => togglePanel('left')} title="收起面板">
                {panelCollapsed.left ? '»' : '«'}
              </button>
              {!panelCollapsed.left && (
                <>
                  <CanalTree />
                  <RasterPanel />
                  <LayerPanel />
                </>
              )}
            </aside>

            <main className="map-area">
              <Toolbar />
              <MapView />
              {selectedCanal && (
                <div className="selected-canal-strip">
                  <span className="scs-code">{selectedCanal.code}</span>
                  <span className="scs-name">{selectedCanal.name}</span>
                  <span className="scs-status" style={{ background: STATUS_COLOR[selectedCanal.status] }}>
                    {STATUS_LABEL[selectedCanal.status]}
                  </span>
                  <button className="link-btn" onClick={() => useStore.getState().selectCanal(null)}>
                    取消选中
                  </button>
                </div>
              )}
            </main>

            <aside className={`right-panel ${panelCollapsed.right ? 'collapsed' : ''}`}>
              <button className="panel-collapse right" onClick={() => togglePanel('right')} title="收起面板">
                {panelCollapsed.right ? '«' : '»'}
              </button>
              {!panelCollapsed.right && (
                <>
                  <ArchiveCard />
                  <StatsPanel />
                </>
              )}
            </aside>
          </>
        )}

        {tab === 'review' && (
          <>
            <main className="map-area review-map">
              <Toolbar />
              <MapView />
            </main>
            <aside className="review-side">
              <ReviewPanel />
            </aside>
          </>
        )}

        {(tab === 'search' || tab === 'batch') && (
          <main className="workspace-page">
            {tab === 'search' ? <SearchPanel /> : <ExportPanel />}
          </main>
        )}
      </div>

      <div className="toast-stack">
        {notices.map((n) => (
          <div key={n.id} className={`toast tone-${n.tone}`} onClick={() => dismissNotice(n.id)}>
            <span className="toast-dot" />
            {n.text}
          </div>
        ))}
      </div>

      {selectionId && tab !== 'map' && <SelectionPeek />}
    </div>
  )
}

function SelectionPeek() {
  return null
}
