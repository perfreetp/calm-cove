import React from 'react'
import { useStore } from '../store'
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  TYPE_COLOR,
  TYPE_LABEL,
  TYPE_ORDER,
} from '../types'
import type { Feature } from '../types'
import { stake } from '../lib/geo'

const PAGE = 60

export default function SearchPanel() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const filters = useStore((s) => s.filters)
  const setFilters = useStore((s) => s.setFilters)
  const resetFilters = useStore((s) => s.resetFilters)
  const selectFeature = useStore((s) => s.selectFeature)
  const flyTo = useStore((s) => s.flyTo)
  const selectionId = useStore((s) => s.selectionId)
  const [page, setPage] = React.useState(0)

  const results = React.useMemo(() => {
    const kw = filters.keyword.trim().toLowerCase()
    const yFrom = filters.yearFrom ? Number(filters.yearFrom) : -Infinity
    const yTo = filters.yearTo ? Number(filters.yearTo) : Infinity
    const out: Feature[] = []
    for (const f of world.features) {
      if (filters.level !== 'all' && f.level !== filters.level) continue
      if (filters.type !== 'all' && f.type !== filters.type) continue
      if (filters.status !== 'all' && f.status !== filters.status) continue
      if (filters.canalId !== 'all' && f.canalId !== filters.canalId) continue
      if (f.builtYear < yFrom || f.builtYear > yTo) continue
      if (kw) {
        if (
          !f.code.toLowerCase().includes(kw) &&
          !f.shortCode.toLowerCase().includes(kw) &&
          !f.name.toLowerCase().includes(kw) &&
          !String(f.chainage).includes(kw)
        )
          continue
      }
      out.push(f)
      if (out.length >= 5000) break
    }
    return out
  }, [world.features, filters])

  React.useEffect(() => setPage(0), [filters])

  const pageItems = results.slice(page * PAGE, page * PAGE + PAGE)
  const canalOptions = React.useMemo(() => world.canals.slice(0, 400), [world.canals])

  return (
    <div className="search-panel">
      <div className="sp-head">
        <h2>档案检索</h2>
        <button className="btn tiny ghost" onClick={resetFilters}>
          重置条件
        </button>
      </div>
      <div className="sp-hint">仅检索已通过 / 已归档的正式档案时，请把状态筛为「已通过」「已归档」。</div>

      <div className="filter-grid">
        <label className="span2">
          关键字
          <input
            className="search-input"
            placeholder="要素编号 / 名称 / 桩号"
            value={filters.keyword}
            onChange={(e) => setFilters({ keyword: e.target.value })}
          />
        </label>
        <label>
          渠系等级
          <select value={filters.level} onChange={(e) => setFilters({ level: e.target.value as any })}>
            <option value="all">全部</option>
            {LEVEL_ORDER.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          要素类型
          <select value={filters.type} onChange={(e) => setFilters({ type: e.target.value as any })}>
            <option value="all">全部</option>
            {TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          所属渠道
          <select value={filters.canalId} onChange={(e) => setFilters({ canalId: e.target.value })}>
            <option value="all">全部</option>
            {canalOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          档案状态
          <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value as any })}>
            <option value="all">全部</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          建成年代 起
          <input value={filters.yearFrom} onChange={(e) => setFilters({ yearFrom: e.target.value })} placeholder="1958" inputMode="numeric" />
        </label>
        <label>
          建成年代 止
          <input value={filters.yearTo} onChange={(e) => setFilters({ yearTo: e.target.value })} placeholder="2024" inputMode="numeric" />
        </label>
      </div>

      <div className="sp-result-head">
        <span>
          命中 <strong>{results.length.toLocaleString()}</strong> 条
          {results.length >= 5000 && <span className="dim">（已截断至 5000）</span>}
        </span>
        <button
          className="btn tiny"
          onClick={() => {
            if (results.length === 0) return
            const xs = results.map((f) => f.x)
            const ys = results.map((f) => f.y)
            flyTo([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
          }}
          disabled={results.length === 0}
        >
          定位全部命中
        </button>
      </div>

      <div className="sp-list">
        <div className="sp-list-head">
          <span>编号</span>
          <span>类型</span>
          <span>渠道</span>
          <span>桩号</span>
          <span>年代</span>
          <span>状态</span>
        </div>
        {pageItems.map((f) => {
          const c = meta.canalById.get(f.canalId)
          return (
            <button
              key={f.id}
              className={`sp-row ${selectionId === f.id ? 'selected' : ''}`}
              onClick={() => {
                selectFeature(f.id)
                flyTo([f.x - 24, f.y - 24, f.x + 24, f.y + 24], 3.6)
              }}
            >
              <span className="mono">{f.shortCode}</span>
              <span style={{ color: TYPE_COLOR[f.type] }}>{TYPE_LABEL[f.type]}</span>
              <span className="dim">{c?.code}</span>
              <span className="mono">{stake(f.chainage)}</span>
              <span>{f.builtYear}</span>
              <span className="sp-status" style={{ color: STATUS_COLOR[f.status] }}>
                {STATUS_LABEL[f.status]}
              </span>
            </button>
          )
        })}
        {pageItems.length === 0 && <div className="empty-note">没有符合条件的档案。</div>}
      </div>

      {results.length > PAGE && (
        <div className="pager">
          <button className="btn tiny" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="mono">
            {page + 1} / {Math.ceil(results.length / PAGE)}
          </span>
          <button
            className="btn tiny"
            disabled={(page + 1) * PAGE >= results.length}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
