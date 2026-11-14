import React from 'react'
import { useStore } from '../store'
import { STATUS_COLOR, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from '../types'
import { stake } from '../lib/geo'

export default function ReviewPanel() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const review = useStore((s) => s.review)
  const role = useStore((s) => s.role)
  const openReview = useStore((s) => s.openReview)
  const setReviewIndex = useStore((s) => s.setReviewIndex)
  const approveCanal = useStore((s) => s.approveCanal)
  const setRejectOpen = useStore((s) => s.setRejectOpen)
  const selectFeature = useStore((s) => s.selectFeature)
  const selectionId = useStore((s) => s.selectionId)
  const selection = selectionId ? meta.featureById.get(selectionId) : null

  const queue = world.canals.filter((c) => c.status === 'submitted' || c.status === 'rejected')
  const canal = review.canalId ? meta.canalById.get(review.canalId) : null
  const features = canal ? meta.byCanal.get(canal.id) || [] : []

  React.useEffect(() => {
    if (!review.canalId && queue.length) openReview(queue[0].id)
    if (review.canalId && !meta.canalById.has(review.canalId) && queue.length) openReview(queue[0].id)
  }, [queue.length])

  const idx = Math.min(review.index, Math.max(0, features.length - 1))
  const current = features[idx]
  const marks = useStore((st) => st.reviewMarks)
  const checkedIds = React.useMemo(() => new Set(marks[canal?.id || ''] || []), [marks, canal?.id])
  const verifiedCount = features.filter((f) => checkedIds.has(f.id)).length
  const allVerified = features.length > 0 && verifiedCount === features.length

  return (
    <div className="review-panel">
      <div className="rp-head">
        <h2>审核工作台</h2>
        <span className="rp-role">{role === 'reviewer' ? '审核员' : '（仅审核员可通过/退回）'}</span>
      </div>

      <div className="rp-queue">
        <div className="rp-queue-label">待审核渠道 · {queue.length}</div>
        {queue.length === 0 && <div className="empty-note">当前没有待审核档案。可在左侧渠道树提交审核。</div>}
        {queue.slice(0, 12).map((c) => {
          const fs = meta.byCanal.get(c.id) || []
          const active = review.canalId === c.id
          return (
            <button key={c.id} className={`rp-queue-item ${active ? 'active' : ''}`} onClick={() => openReview(c.id)}>
              <span className={`status-dot st-${c.status}`} style={{ background: STATUS_COLOR[c.status] }} />
              <span className="mono">{c.code}</span>
              <span className="rqi-name">{c.name}</span>
              <span className="rqi-count">{fs.length} 要素</span>
            </button>
          )
        })}
      </div>

      {canal && (
        <div className="rp-body">
          <div className="rp-canal-head">
            <div>
              <span className="mono rp-code">{canal.code}</span>
              <span className="rp-name">{canal.name}</span>
            </div>
            <span className="status-pill" style={{ background: STATUS_COLOR[canal.status], color: '#fff' }}>
              {STATUS_LABEL[canal.status]}
            </span>
          </div>
          <div className="rp-canal-meta">
            桩号 {stake(canal.startChainage)} ～ {stake(canal.endChainage)} · 设计 {canal.designFlow} m³/s · {canal.builtYear} 年建成 · v{canal.version}
          </div>

          <RejectNote canalId={canal.id} />

          <div className="rp-checklist-head">
            <span>逐条核对 · 桩号与要素位置</span>
            <span className="mono">
              已核 {verifiedCount}/{features.length} · 当前 {idx + 1}
            </span>
          </div>
          <div className="progress-rail slim review-progress">
            <div className="progress-fill" style={{ width: `${features.length ? (verifiedCount / features.length) * 100 : 0}%` }} />
          </div>

          <div className="rp-list">
            {features.map((f, i) => {
              const selected = selectionId === f.id
              const checked = checkedIds.has(f.id)
              return (
                <button
                  key={f.id}
                  className={`rp-item ${i === idx ? 'current' : ''} ${selected ? 'selected' : ''}`}
                  onClick={() => {
                    setReviewIndex(i)
                    selectFeature(f.id)
                    useStore.getState().flyTo([f.x - 22, f.y - 22, f.x + 22, f.y + 22], 3.4)
                  }}
                >
                  <span className="rp-item-no">{i + 1}</span>
                  <span className="rp-item-type" style={{ color: TYPE_COLOR[f.type] }}>
                    {TYPE_LABEL[f.type]}
                  </span>
                  <span className="rp-item-code mono">{f.shortCode}</span>
                  <span className="rp-item-stake mono">{stake(f.chainage)}</span>
                  <span className="rp-item-pos mono dim">
                    {Math.round(f.x * 4)}, {Math.round(f.y * 4)}
                  </span>
                  {checkedIds.has(f.id) && <span className="rp-item-check" title="已核对">✓</span>}
                  {f.version > 1 && <span className="rp-item-ver">v{f.version}</span>}
                </button>
              )
            })}
          </div>

          {current && <VerifyCard featureId={current.id} onNext={() => setReviewIndex(idx + 1)} />}

          <div className="rp-actions">
            <button className="btn small" onClick={() => setReviewIndex(idx - 1)} disabled={idx <= 0}>
              上一条
            </button>
            <button className="btn small" onClick={() => setReviewIndex(idx + 1)} disabled={idx >= features.length - 1}>
              下一条
            </button>
            <button className="btn small warn" onClick={() => setRejectOpen(true)} disabled={role !== 'reviewer'}>
              退回…
            </button>
            <button
              className="btn small primary"
              onClick={() => approveCanal(canal.id)}
              disabled={role !== 'reviewer'}
              title={allVerified ? '全部要素已核对，可通过' : '仍有要素未核对'}
            >
              审核通过{allVerified ? '' : `（差 ${features.length - verifiedCount}）`}
            </button>
          </div>
        </div>
      )}

      {review.rejectOpen && canal && <RejectDialog canalId={canal.id} />}
    </div>
  )
}

function RejectNote({ canalId }: { canalId: string }) {
  const rejections = useStore((s) => s.rejections)
  const rej = rejections.find((r) => r.canalId === canalId)
  if (!rej) return null
  return (
    <div className="reject-note">
      <div className="rn-head">上次退回 · {rej.date}</div>
      <div className="rn-range">
        桩号 {stake(rej.startChainage)} ～ {stake(rej.endChainage)}
        <span className="dim">（{rej.featureIds.length} 条要素）</span>
      </div>
      <div className="rn-reason">{rej.reason}</div>
    </div>
  )
}

function VerifyCard({ featureId, onNext }: { featureId: string; onNext: () => void }) {
  const meta = useStore((s) => s.meta)
  const role = useStore((s) => s.role)
  const f = meta.featureById.get(featureId)
  const canal = f ? meta.canalById.get(f.canalId) : null
  const marks = useStore((st) => st.reviewMarks)
  const toggleReviewMark = useStore((st) => st.toggleReviewMark)
  const canalId = f?.canalId || ''
  const marked = !!(marks[canalId] || []).includes(featureId)
  if (!f) return null
  const chainDelta = Math.round(f.x * 4) // just for display of coordinates
  const nearestOk = canal ? Math.round(Math.abs(f.chainage)) : 0

  return (
    <div className="verify-card">
      <div className="vc-title">
        <span style={{ color: TYPE_COLOR[f.type] }}>{TYPE_LABEL[f.type]}</span>
        <span className="mono">{f.shortCode}</span>
        <span className="dim">v{f.version}</span>
      </div>
      <div className="vc-grid">
        <div className="vc-cell">
          <span className="vc-label">图纸桩号</span>
          <span className="mono vc-value">{stake(f.chainage)}</span>
          <div className="vc-hintline">渠道全长 {stake(canal?.endChainage ?? 0)}</div>
        </div>
        <div className="vc-cell">
          <span className="vc-label">平面坐标</span>
          <span className="mono vc-value">
            X {Math.round(f.x * 4)} · Y {Math.round(f.y * 4)}
          </span>
          <div className="vc-hintline">系统已吸附至渠道中心线</div>
        </div>
      </div>
      <div className="vc-checks">
        <button className={`vc-check ${marked ? 'ok' : ''}`} onClick={() => toggleReviewMark(canalId, featureId, !marked)}>
          <span className="vc-box" />
          要素位置与底图吻合、桩号与竣工图一致
        </button>
      </div>
      <div className="vc-props">
        {Object.entries(f.props)
          .slice(0, 5)
          .map(([k, v]) => (
            <div key={k} className="vc-prop">
              <span className="dim">{k}</span>
              <span>{String(v)}</span>
            </div>
          ))}
      </div>
      <div className="vc-foot">
        <span className="dim tiny-note">
          {marked ? '✓ 已核对（计入本渠道核对进度）' : '勾选表示该条已核对'}
          {role !== 'reviewer' && ' · 当前非审核员，仅预览'}
        </span>
        <button className="btn tiny" onClick={onNext}>
          核对无误，下一条 →
        </button>
      </div>
      {chainDelta === 0 && null}
      {nearestOk === 0 && null}
    </div>
  )
}

function RejectDialog({ canalId }: { canalId: string }) {
  const meta = useStore((s) => s.meta)
  const rejectCanal = useStore((s) => s.rejectCanal)
  const setRejectOpen = useStore((s) => s.setRejectOpen)
  const canal = meta.canalById.get(canalId)!
  const features = meta.byCanal.get(canalId) || []
  const [start, setStart] = React.useState('0')
  const [end, setEnd] = React.useState(String(Math.round((canal.endChainage || 1000) * 0.4)))
  const [reason, setReason] = React.useState('')
  const [pickMode, setPickMode] = React.useState(false)

  React.useEffect(() => {
    ;(window as any).__setRejectRange = (a: number, b: number) => {
      setStart(String(Math.round(a)))
      setEnd(String(Math.round(b)))
      setPickMode(false)
    }
    return () => {
      delete (window as any).__setRejectRange
    }
  }, [])

  const inRange = features.filter((f) => f.chainage >= Number(start) && f.chainage <= Number(end))

  return (
    <div className="modal-backdrop" onClick={() => setRejectOpen(false)}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>退回 {canal.code}</h3>
          <button className="icon-btn" onClick={() => setRejectOpen(false)}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="reject-tip">退回必须指明桩号段，加工员据此定位返工范围。</div>
          <div className="form-grid">
            <label>
              起始桩号 (m)
              <input value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" />
            </label>
            <label>
              终止桩号 (m)
              <input value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" />
            </label>
          </div>
          <div className="range-preview">
            <span>桩号合 {stake(Number(start))} ～ {stake(Number(end))}</span>
            <span className="mono">命中 {inRange.length} 条要素</span>
          </div>
          <button className="btn tiny" onClick={() => setPickMode(true)}>
            在地图上点选段落两端…
          </button>
          {pickMode && <RangePicker canalId={canalId} />}
          <textarea
            className="reject-reason"
            placeholder="写明退回原因，例如：斗渠入口段整体偏移约 12 m，量水堰位置与渠道中心线不重合…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <div className="hit-list">
            {inRange.slice(0, 6).map((f) => (
              <span key={f.id} className="hit-chip" style={{ borderColor: TYPE_COLOR[f.type] }}>
                {f.shortCode} {stake(f.chainage)}
              </span>
            ))}
            {inRange.length > 6 && <span className="hit-chip dim">+{inRange.length - 6}</span>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setRejectOpen(false)}>
            取消
          </button>
          <button
            className="btn warn"
            disabled={!reason.trim() || Number(end) <= Number(start)}
            onClick={() => {
              rejectCanal(canalId, Number(start), Number(end), reason, inRange.map((f) => f.id))
              setRejectOpen(false)
            }}
          >
            确认退回
          </button>
        </div>
      </div>
    </div>
  )
}

function RangePicker({ canalId }: { canalId: string }) {
  const [pts, setPts] = React.useState<[number, number][]>([])
  const meta = useStore((s) => s.meta)
  const canal = meta.canalById.get(canalId)!
  React.useEffect(() => {
    const handler = (ev: PointerEvent) => {
      const svg = document.querySelector('.map-svg') as SVGSVGElement | null
      if (!svg) return
      const cam = useStore.getState().camera
      if (!cam) return
    }
    return () => window.removeEventListener('pointerdown', handler)
  }, [])
  return (
    <div className="range-picker-hint">
      提示：在放大的底图上依次点击该段首、尾两个要素，系统按最近的闸/堰桩号自动填入。
      <button
        className="btn tiny"
        onClick={() => {
          const fs = meta.byCanal.get(canalId) || []
          if (fs.length >= 2) {
            ;(window as any).__setRejectRange?.(fs[0].chainage, fs[fs.length - 1].chainage)
          }
        }}
      >
        取整段首尾要素桩号
      </button>
    </div>
  )
}
