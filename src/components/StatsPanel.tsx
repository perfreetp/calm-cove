import React from 'react'
import { useStore } from '../store'
import { LEVEL_LABEL, LEVEL_ORDER, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, TYPE_COLOR, TYPE_LABEL, TYPE_ORDER } from '../types'

export default function StatsPanel() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const flyTo = useStore((s) => s.flyTo)
  const setFilters = useStore((s) => s.setFilters)
  const setTab = useStore((s) => s.setTab)
  const [hoverType, setHoverType] = React.useState<string | null>(null)

  const stats = React.useMemo(() => {
    const total = world.features.length
    const byType = Object.fromEntries(TYPE_ORDER.map((t) => [t, { total: 0, processed: 0 }])) as Record<
      string,
      { total: number; processed: number }
    >
    const byLevel = Object.fromEntries(LEVEL_ORDER.map((l) => [l, { total: 0, processed: 0 }])) as Record<
      string,
      { total: number; processed: number }
    >
    const byStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>
    let processed = 0
    for (const f of world.features) {
      byType[f.type].total++
      byLevel[f.level].total++
      byStatus[f.status]++
      if (f.processed) {
        byType[f.type].processed++
        byLevel[f.level].processed++
        processed++
      }
    }
    const canalsByStatus = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<string, number>
    for (const c of world.canals) canalsByStatus[c.status]++
    return { total, processed, byType, byLevel, byStatus, canalsByStatus }
  }, [world])

  const pct = stats.total ? (stats.processed / stats.total) * 100 : 0
  const maxType = Math.max(...TYPE_ORDER.map((t) => stats.byType[t].total), 1)

  return (
    <div className="panel-section stats">
      <div className="section-head">
        <span>要素统计</span>
        <span className="dim tiny-note">实时汇总</span>
      </div>

      <div className="stat-hero">
        <div className="hero-num">
          {stats.processed.toLocaleString()}
          <span className="hero-denom"> / {stats.total.toLocaleString()}</span>
        </div>
        <div className="hero-label">已加工要素 / 要素总量</div>
        <div className="progress-rail">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
          <span className="progress-label">{pct.toFixed(1)}%</span>
        </div>
      </div>

      <div className="stat-list">
        {TYPE_ORDER.map((t) => {
          const s = stats.byType[t]
          const p = s.total ? (s.processed / s.total) * 100 : 0
          return (
            <div
              className={`stat-row ${hoverType === t ? 'hot' : ''}`}
              key={t}
              onMouseEnter={() => setHoverType(t)}
              onMouseLeave={() => setHoverType(null)}
              onClick={() => {
                setFilters({ type: t, status: 'all', level: 'all', canalId: 'all' })
                setTab('search')
              }}
              title="点击检索该类型要素"
            >
              <span className="stat-dot" style={{ background: TYPE_COLOR[t] }} />
              <span className="stat-name">{TYPE_LABEL[t]}</span>
              <span className="stat-bar">
                <span className="stat-bar-fill" style={{ width: `${(s.total / maxType) * 100}%`, background: TYPE_COLOR[t] }} />
              </span>
              <span className="stat-val mono">{s.total.toLocaleString()}</span>
              <span className="stat-pct mono">{p.toFixed(0)}%</span>
            </div>
          )
        })}
      </div>

      <div className="stat-divider" />

      <div className="stat-subhead">按渠系等级</div>
      <div className="mini-table">
        {LEVEL_ORDER.map((l) => {
          const s = stats.byLevel[l]
          const p = s.total ? (s.processed / s.total) * 100 : 0
          return (
            <div className="mt-row" key={l}>
              <span className="mt-label">{LEVEL_LABEL[l]}</span>
              <span className="mt-bar">
                <span style={{ width: `${p}%` }} />
              </span>
              <span className="mono">
                {s.processed}/{s.total}
              </span>
              <span className="mono dim">{p.toFixed(0)}%</span>
            </div>
          )
        })}
      </div>

      <div className="stat-subhead">档案状态分布</div>
      <div className="status-chips">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            className="status-chip"
            style={{ borderColor: STATUS_COLOR[s], color: STATUS_COLOR[s] }}
            onClick={() => {
              setFilters({ status: s, type: 'all', level: 'all', canalId: 'all' })
              setTab('search')
            }}
          >
            <span className="chip-dot" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
            <strong>{stats.byStatus[s]}</strong>
          </button>
        ))}
      </div>

      <div className="stat-subhead">渠道档案</div>
      <div className="canal-status-mini">
        {STATUS_ORDER.map((s) => (
          <div key={s} className="csm-row">
            <span>{STATUS_LABEL[s]}</span>
            <span className="csm-track">
              <span
                style={{
                  width: `${(stats.canalsByStatus[s] / Math.max(1, world.canals.length)) * 100}%`,
                  background: STATUS_COLOR[s],
                }}
              />
            </span>
            <span className="mono">{stats.canalsByStatus[s]}</span>
          </div>
        ))}
      </div>

      <div className="stat-foot">
        <button className="btn tiny" onClick={() => flyTo([0, 0, 4200, 3000], 0.9)}>
          全图视图
        </button>
        <button className="btn tiny" onClick={() => setTab('batch')}>
          批量导出
        </button>
      </div>
    </div>
  )
}
