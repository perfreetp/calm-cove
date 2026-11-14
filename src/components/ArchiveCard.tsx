import React from 'react'
import { useStore } from '../store'
import type { Feature, FeatureType } from '../types'
import { LEVEL_LABEL, STATUS_COLOR, STATUS_LABEL, TYPE_COLOR, TYPE_LABEL } from '../types'
import { stake } from '../lib/geo'
import { symbolForType } from '../map/symbols'

export default function ArchiveCard() {
  const selectionId = useStore((s) => s.selectionId)
  const meta = useStore((s) => s.meta)
  const role = useStore((s) => s.role)
  const compareVersions = useStore((s) => s.compareVersions)
  const setCompareVersions = useStore((s) => s.setCompareVersions)
  const selectFeature = useStore((s) => s.selectFeature)
  const world = useStore((s) => s.world)

  const f = selectionId ? meta.featureById.get(selectionId) : null

  const canal = f ? meta.canalById.get(f.canalId) : undefined
  const locked = f?.status === 'archived'
  const [a, b] = compareVersions
  const revA = f?.revisions.find((r) => r.version === a)
  const revB = f?.revisions.find((r) => r.version === b)

  const diffKeys = React.useMemo(() => {
    if (!revA || !revB) return []
    const keys = new Set([...Object.keys(revA.props), ...Object.keys(revB.props)])
    return Array.from(keys).filter((k) => String(revA.props[k] ?? '') !== String(revB.props[k] ?? ''))
  }, [revA, revB])

  if (!f) return <EmptyCard />

  return (
    <div className="archive-card">
      <div className="ac-head" style={{ borderColor: TYPE_COLOR[f.type] }}>
        <span
          className="ac-sym"
          dangerouslySetInnerHTML={{
            __html: `<svg width="26" height="26" viewBox="-13 -13 26 26">${symbolForType(f.type, 22)
              .map((p) => `<path d="${p.d}" fill="${p.fill}" stroke="${p.stroke}" stroke-width="${Math.max(0.9, p.sw)}" />`)
              .join('')}</svg>`,
          }}
        />
        <div className="ac-head-text">
          <div className="ac-type" style={{ color: TYPE_COLOR[f.type] }}>
            {TYPE_LABEL[f.type]}
            <span className="ac-version">v{f.version}</span>
            {locked && <span className="lock-tag">已归档 · 锁定</span>}
          </div>
          <div className="ac-code">{f.code}</div>
        </div>
        <button className="icon-btn" onClick={() => selectFeature(null)} title="关闭档案卡">
          ×
        </button>
      </div>

      <div className="ac-status-row">
        <span className="status-pill" style={{ background: STATUS_COLOR[f.status], color: '#fff' }}>
          {STATUS_LABEL[f.status]}
        </span>
        <span className="ac-updated">最近更新 {f.updatedAt}</span>
      </div>

      <div className="ac-name">{f.name}</div>

      <dl className="kv tight">
        <dt>所属渠道</dt>
        <dd>
          {canal?.code} · {canal?.name}
        </dd>
        <dt>渠系等级</dt>
        <dd>{LEVEL_LABEL[f.level]}</dd>
        <dt>桩号</dt>
        <dd className="mono">{stake(f.chainage)} <span className="dim">({f.chainage} m)</span></dd>
        <dt>平面坐标</dt>
        <dd className="mono dim">
          X {(f.x * 4).toFixed(0)} · Y {(f.y * 4).toFixed(0)}
        </dd>
        <dt>建成年代</dt>
        <dd>{f.builtYear} 年</dd>
      </dl>

      <div className="ac-section-label">
        属性
        <span className="dim">{role === 'reviewer' ? '（审核只读）' : locked ? '（归档锁定）' : '双击值可改'}</span>
      </div>
      <PropsEditor feature={f} canEdit={role !== 'reviewer' && !locked} />

      <div className="ac-section-label">
        历史版本 <span className="dim">共 {f.revisions.length} 版</span>
      </div>
      <div className="rev-list">
        {[...f.revisions].reverse().map((r) => {
          const pickedA = a === r.version
          const pickedB = b === r.version
          return (
            <div className={`rev-row ${pickedA || pickedB ? 'picked' : ''}`} key={r.version}>
              <span className="rev-v">v{r.version}</span>
              <span className="rev-date">{r.date}</span>
              <span className="rev-author">{r.author}</span>
              <span className="rev-note" title={r.note}>
                {r.note}
              </span>
              <span className="rev-pos">
                {stake(r.chainage)}
              </span>
              <button
                className={`rev-pick ${pickedA ? 'a' : ''}`}
                title="设为对比版本 A"
                onClick={() => setCompareVersions([pickedA ? null : r.version, b])}
              >
                A
              </button>
              <button
                className={`rev-pick ${pickedB ? 'b' : ''}`}
                title="设为对比版本 B"
                onClick={() => setCompareVersions([a, pickedB ? null : r.version])}
              >
                B
              </button>
            </div>
          )
        })}
      </div>

      {revA && revB && (
        <div className="rev-compare">
          <div className="rc-head">
            版本对比 v{revA.version} → v{revB.version}
            <button className="btn tiny ghost" onClick={() => setCompareVersions([null, null])}>
              清除
            </button>
          </div>
          <div className="rc-metrics">
            <div>
              <span className="rc-label">桩号变化</span>
              <span className="mono">
                {stake(revA.chainage)} → {stake(revB.chainage)}
                <em className={revB.chainage === revA.chainage ? '' : 'up'}>
                  {revB.chainage === revA.chainage ? ' 无变化' : ` ${revB.chainage > revA.chainage ? '+' : ''}${revB.chainage - revA.chainage} m`}
                </em>
              </span>
            </div>
            <div>
              <span className="rc-label">平面位移</span>
              <span className="mono">{Math.hypot((revB.x - revA.x) * 4, (revB.y - revA.y) * 4).toFixed(1)} m</span>
            </div>
            <div>
              <span className="rc-label">属性变更</span>
              <span className="mono">{diffKeys.length} 项</span>
            </div>
          </div>
          {diffKeys.length > 0 && (
            <table className="rc-diff">
              <thead>
                <tr>
                  <th>属性</th>
                  <th>v{revA.version}</th>
                  <th>v{revB.version}</th>
                </tr>
              </thead>
              <tbody>
                {diffKeys.map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="old">{String(revA.props[k] ?? '—')}</td>
                    <td className="new">{String(revB.props[k] ?? '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="rc-hint">地图上已叠加两版位置轮廓与位移标注</div>
        </div>
      )}

      <div className="ac-foot">
        <button
          className="btn tiny"
          onClick={() => {
            const target = canal
            if (target) useStore.getState().flyTo([f.x - 40, f.y - 40, f.x + 40, f.y + 40], 4.5)
          }}
        >
          聚焦要素
        </button>
        {f.version > 1 && (
          <button className="btn tiny" onClick={() => setCompareVersions([Math.max(1, f.version - 1), f.version])}>
            最近一次改动对比
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyCard() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const selectFeature = useStore((s) => s.selectFeature)
  const [q, setQ] = React.useState('')
  const results = React.useMemo(() => {
    if (!q.trim()) return []
    const query = q.trim().toLowerCase()
    const out: Feature[] = []
    for (const f of world.features) {
      if (out.length > 24) break
      if (f.code.toLowerCase().includes(query) || f.shortCode.toLowerCase().includes(query) || f.name.includes(query)) {
        out.push(f)
      }
    }
    return out
  }, [q, world.features])

  return (
    <div className="archive-card empty-card">
      <div className="ec-title">档案卡</div>
      <div className="ec-hint">在地图上点选堰、闸、泵站等要素，即可展开其档案卡与历史版本。</div>
      <input className="search-input" placeholder="按要素编号定位，如 ZHA-021…" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <div className="ec-results">
          {results.map((f) => (
            <button key={f.id} className="ec-result" onClick={() => selectFeature(f.id)}>
              <span style={{ color: TYPE_COLOR[f.type as FeatureType] }}>{TYPE_LABEL[f.type]}</span>
              <span className="mono">{f.shortCode}</span>
              <span className="dim">{f.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ec-stats">
        全灌区要素 {world.features.length.toLocaleString()} 个
        <br />
        渠道 {world.canals.length.toLocaleString()} 条
        <br />
        调用索引 {meta.index.buckets.size} 个网格桶
      </div>
    </div>
  )
}

const PROP_ORDER: Record<FeatureType, string[]> = {
  gate: ['类别', '闸门型式', '孔口宽度', '设计流量', '启闭方式', '管理单位'],
  weir: ['堰型', '堰宽', '量程', '刻度精度', '水尺零点'],
  pump: ['装机功率', '扬程', '机组台数', '设计流量', '管理单位'],
  drop: ['跌差', '消能方式', '边墙型式', '设计流量'],
  culvert: ['断面型式', '孔径', '洞长', '设计流量', '进出口形式'],
}

function PropsEditor({ feature, canEdit }: { feature: Feature; canEdit: boolean }) {
  const updateFeatureProps = useStore((s) => s.updateFeatureProps)
  const keys = React.useMemo(() => {
    const base = PROP_ORDER[feature.type]
    const extra = Object.keys(feature.props).filter((k) => !base.includes(k))
    return [...base, ...extra]
  }, [feature.type, feature.props])
  const [editing, setEditing] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')

  return (
    <table className="prop-table">
      <tbody>
        {keys.map((k) => (
          <tr key={k} className={k.startsWith('新') ? 'extra' : ''}>
            <th>{k}</th>
            <td>
              {editing === k ? (
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => {
                    if (draft !== String(feature.props[k] ?? '')) {
                      updateFeatureProps(feature.id, { [k]: draft }, `修正${k}`)
                    }
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <span
                  className={canEdit ? 'editable' : ''}
                  onDoubleClick={() => {
                    if (!canEdit) return
                    setEditing(k)
                    setDraft(String(feature.props[k] ?? ''))
                  }}
                  title={canEdit ? '双击编辑，自动生成新版本' : '只读'}
                >
                  {String(feature.props[k] ?? '—') || '—'}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
