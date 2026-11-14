import React from 'react'
import { useStore } from '../store'
import type { Canal, CanalLevel, DocStatus } from '../types'
import { LEVEL_COLOR, LEVEL_LABEL, LEVEL_ORDER, STATUS_COLOR, STATUS_LABEL } from '../types'
import { fmtQ, stake } from '../lib/geo'

export default function CanalTree() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const selectedCanalId = useStore((s) => s.selectedCanalId)
  const selectCanal = useStore((s) => s.selectCanal)
  const role = useStore((s) => s.role)
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const [query, setQuery] = React.useState('')
  const [formOpen, setFormOpen] = React.useState(false)

  // 图上描线完成后由 MapView 调用，打开建档表单
  React.useEffect(() => {
    ;(window as any).__requestCanalForm = () => setFormOpen(true)
    return () => {
      delete (window as any).__requestCanalForm
    }
  }, [])

  const roots = meta.byParent.get('__root') || []

  const matchSet = React.useMemo(() => {
    if (!query.trim()) return null
    const q = query.trim().toLowerCase()
    const set = new Set<string>()
    for (const c of world.canals) {
      if (c.code.toLowerCase().includes(q) || c.name.includes(q)) {
        set.add(c.id)
        let p = c.parentId
        while (p) {
          set.add(p)
          p = meta.canalById.get(p)?.parentId || null
        }
      }
    }
    return set
  }, [query, world.canals, meta])

  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  function renderCanal(c: Canal, depth: number) {
    if (matchSet && !matchSet.has(c.id)) return null
    const kids = meta.byParent.get(c.id) || []
    const features = meta.byCanal.get(c.id) || []
    const isOpen = matchSet ? true : open[c.id] === true
    const sel = selectedCanalId === c.id
    return (
      <div key={c.id} className="tree-group">
        <div
          className={`tree-row level-${c.level} ${sel ? 'selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => selectCanal(sel ? null : c.id)}
        >
          <button
            className={`twisty ${kids.length ? '' : 'empty'}`}
            onClick={(e) => {
              e.stopPropagation()
              if (kids.length) toggle(c.id)
            }}
            aria-label={isOpen ? '收起' : '展开'}
          >
            {kids.length ? (isOpen ? '▾' : '▸') : '·'}
          </button>
          <span className="level-dot" style={{ background: LEVEL_COLOR[c.level] }} />
          <span className="tree-code">{c.code}</span>
          <span className="tree-name">{c.name}</span>
          <span className={`status-pill st-${c.status}`} title={STATUS_LABEL[c.status]}>
            {STATUS_LABEL[c.status]}
          </span>
          <span className="tree-count">{features.length}</span>
        </div>
        {sel && <CanalDetail canal={c} />}
        {isOpen && depth < 3 && kids.length > 0 && (
          <div className="tree-children">{kids.map((k) => renderCanal(k, depth + 1))}</div>
        )}
      </div>
    )
  }

  const allStats = React.useMemo(() => {
    const byLevel: Record<CanalLevel, { n: number; archive: number }> = {
      trunk: { n: 0, archive: 0 },
      branch: { n: 0, archive: 0 },
      lateral: { n: 0, archive: 0 },
    }
    for (const c of world.canals) {
      byLevel[c.level].n++
      if (c.status === 'archived') byLevel[c.level].archive++
    }
    return byLevel
  }, [world.canals])

  return (
    <div className="panel-section canal-tree">
      <div className="section-head">
        <span>渠系建档</span>
        <button
          className="btn tiny"
          disabled={role === 'reviewer'}
          title={role === 'reviewer' ? '审核员无建档权限' : '新建渠道'}
          onClick={() => setFormOpen(true)}
        >
          + 建档
        </button>
      </div>
      <div className="tree-summary">
        {LEVEL_ORDER.map((l) => (
          <span key={l} className="tree-summary-chip">
            {LEVEL_LABEL[l]} {allStats[l].n}
            <em>归档 {allStats[l].archive}</em>
          </span>
        ))}
      </div>
      <input
        className="search-input"
        placeholder="搜索渠道编号或名称…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="tree-scroll">{roots.map((c) => renderCanal(c, 0))}</div>
      {formOpen && <CanalForm onClose={() => setFormOpen(false)} />}
    </div>
  )
}

function CanalDetail({ canal }: { canal: Canal }) {
  const meta = useStore((s) => s.meta)
  const role = useStore((s) => s.role)
  const submitCanal = useStore((s) => s.submitCanal)
  const flyTo = useStore((s) => s.flyTo)
  const openReview = useStore((s) => s.openReview)
  const archiveCanal = useStore((s) => s.archiveCanal)
  const updateCanalMeta = useStore((s) => s.updateCanalMeta)
  const features = meta.byCanal.get(canal.id) || []
  const processed = features.filter((f) => f.processed).length
  const [editing, setEditing] = React.useState(false)
  const [flow, setFlow] = React.useState(String(canal.designFlow))
  const [year, setYear] = React.useState(String(canal.builtYear))
  const [end, setEnd] = React.useState(String(canal.endChainage))
  const locked = canal.status === 'archived'

  return (
    <div className="canal-detail">
      <div className="cd-title">
        <span className="cd-code">{canal.code}</span>
        <span className="cd-name">{canal.name}</span>
        <span className={`status-pill st-${canal.status}`}>{STATUS_LABEL[canal.status]}</span>
      </div>
      <dl className="kv">
        <dt>渠系等级</dt>
        <dd>{LEVEL_LABEL[canal.level]}</dd>
        <dt>起止桩号</dt>
        <dd>
          {stake(canal.startChainage)} ～ {stake(canal.endChainage)}
        </dd>
        <dt>渠段长度</dt>
        <dd>{(canal.length / 1000).toFixed(2)} km</dd>
        <dt>设计流量</dt>
        <dd>{fmtQ(canal.designFlow)}</dd>
        <dt>建成年代</dt>
        <dd>{canal.builtYear} 年</dd>
        <dt>要素数量</dt>
        <dd>
          {features.length} 个 · 已加工 {features.length ? Math.round((processed / features.length) * 100) : 0}%
        </dd>
        <dt>档案版本</dt>
        <dd>v{canal.version}</dd>
      </dl>

      <div className="progress-rail slim">
        <div className="progress-fill" style={{ width: `${features.length ? (processed / features.length) * 100 : 0}%` }} />
      </div>

      <div className="cd-actions">
        <button className="btn tiny" onClick={() => flyTo([canal.bbox[0] - 30, canal.bbox[1] - 30, canal.bbox[2] + 30, canal.bbox[3] + 30])}>
          定位
        </button>
        <button className="btn tiny" onClick={() => setEditing((v) => !v)} disabled={locked}>
          {editing ? '收起' : '改档'}
        </button>
        {canal.status === 'draft' || canal.status === 'rejected' ? (
          <button className="btn tiny primary" disabled={role === 'reviewer' || locked} onClick={() => submitCanal(canal.id)}>
            提交审核
          </button>
        ) : null}
        {canal.status === 'submitted' && (
          <button className="btn tiny primary" onClick={() => openReview(canal.id)}>
            去审核
          </button>
        )}
        {canal.status === 'approved' && (role === 'reviewer' || role === 'archivist') && (
          <button className="btn tiny" onClick={() => archiveCanal(canal.id)}>
            归档冻结
          </button>
        )}
      </div>

      {editing && !locked && (
        <div className="cd-edit">
          <label>
            设计流量 (m³/s)
            <input value={flow} onChange={(e) => setFlow(e.target.value)} inputMode="decimal" />
          </label>
          <label>
            建成年代
            <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            终止桩号 (m)
            <input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" />
          </label>
          <button
            className="btn tiny"
            onClick={() => {
              updateCanalMeta(canal.id, {
                designFlow: Number(flow) || canal.designFlow,
                builtYear: Number(year) || canal.builtYear,
                endChainage: Number(end) || canal.endChainage,
              })
              setEditing(false)
            }}
          >
            保存
          </button>
        </div>
      )}
    </div>
  )
}

function CanalForm({ onClose }: { onClose: () => void }) {
  const meta = useStore((s) => s.meta)
  const drawPts = useStore((s) => s.drawPts)
  const createCanal = useStore((s) => s.createCanal)
  const [level, setLevel] = React.useState<CanalLevel>('lateral')
  const [code, setCode] = React.useState('')
  const [name, setName] = React.useState('')
  const [parentId, setParentId] = React.useState<string>('')
  const [start, setStart] = React.useState('0')
  const [end, setEnd] = React.useState('')
  const [flow, setFlow] = React.useState('0.3')
  const [year, setYear] = React.useState(String(new Date().getFullYear()))

  const allCanals = Array.from(meta.canalById.values())
  const candidates = allCanals.filter((c) =>
    level === 'trunk' ? false : level === 'branch' ? c.level === 'trunk' : c.level === 'trunk' || c.level === 'branch',
  )

  const drawnLen = drawPts.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - drawPts[i - 1][0], p[1] - drawPts[i - 1][1]) : 0), 0) * 4

  React.useEffect(() => {
    if (!end && drawnLen > 0) setEnd(String(Math.round(drawnLen)))
  }, [drawnLen, end])

  const canSave = code.trim() && name.trim() && drawPts.length >= 2 && Number(end) > Number(start)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>新建渠道档案</h3>
          <button className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label>
              渠系等级
              <select value={level} onChange={(e) => setLevel(e.target.value as CanalLevel)}>
                {LEVEL_ORDER.map((l) => (
                  <option key={l} value={l}>
                    {LEVEL_LABEL[l]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              上级渠道
              <select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={level === 'trunk'}>
                <option value="">{level === 'trunk' ? '无（干渠为根）' : '请选择…'}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              渠道编号
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="如 QG-1-08" />
            </label>
            <label>
              渠道名称
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 核桃坪支渠" />
            </label>
            <label>
              起始桩号 (m)
              <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" />
            </label>
            <label>
              终止桩号 (m)
              <input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" placeholder="留空按描线长度" />
            </label>
            <label>
              设计流量 (m³/s)
              <input value={flow} onChange={(e) => setFlow(e.target.value)} inputMode="decimal" />
            </label>
            <label>
              建成年代
              <input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <div className="draw-status">
            <div className={`draw-dot ${drawPts.length >= 2 ? 'ok' : 'warn'}`} />
            {drawPts.length >= 2 ? (
              <span>
                已描 {drawPts.length} 个节点，渠线长度约 <strong>{drawnLen.toFixed(1)} m</strong>
              </span>
            ) : (
              <span>请先在底图上点击「描线」工具，沿扫描图描出渠线走向（至少 2 个节点）</span>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() => {
              createCanal({
                code: code.trim(),
                name: name.trim(),
                level,
                parentId: parentId || null,
                startChainage: Number(start) || 0,
                endChainage: Number(end) || Math.round(drawnLen),
                designFlow: Number(flow) || 0.1,
                builtYear: Number(year) || 2000,
                pts: drawPts,
              })
              onClose()
            }}
          >
            建立档案
          </button>
        </div>
      </div>
    </div>
  )
}
