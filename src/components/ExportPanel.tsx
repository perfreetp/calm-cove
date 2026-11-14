import React from 'react'
import { useStore } from '../store'
import { LEVEL_LABEL, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, TYPE_LABEL, TYPE_ORDER } from '../types'
import { buildExport, downloadBlob } from '../lib/exporters'

export default function ExportPanel() {
  const world = useStore((s) => s.world)
  const meta = useStore((s) => s.meta)
  const selectedCanalId = useStore((s) => s.selectedCanalId)
  const [scope, setScope] = React.useState<'canal' | 'all-approved'>('all-approved')
  const [includeArchived, setIncludeArchived] = React.useState(true)
  const [preview, setPreview] = React.useState<ReturnType<typeof buildExport> | null>(null)
  const [last, setLast] = React.useState<{ name: string; version: string; at: string; count: number } | null>(null)
  const notify = useStore((s) => s.notify)

  const eligible = world.canals.filter((c) => c.status === 'approved' || c.status === 'archived')
  const blocked = world.canals.filter((c) => c.status !== 'approved' && c.status !== 'archived')

  const doExport = (format: 'svg' | 'csv') => {
    const res = buildExport({
      scope,
      canalId: scope === 'canal' ? selectedCanalId || eligible[0]?.id : undefined,
      format,
      includeArchived,
    })
    if ('error' in res) {
      notify(res.error, 'error')
      setPreview({ error: res.error } as any)
      return
    }
    downloadBlob(res.filename, res.content, res.mime)
    setLast({ name: res.filename, version: res.version, at: new Date().toLocaleTimeString('zh-CN'), count: res.featureCount })
    notify(`已导出 ${res.filename}（${res.featureCount} 个要素）`, 'ok')
    setPreview(res as any)
  }

  return (
    <div className="export-panel">
      <div className="sp-head">
        <h2>导出与版本</h2>
      </div>
      <div className="sp-hint">
        只有<strong>审核通过</strong>或<strong>已归档</strong>的渠道可导出。导出文件名与图纸标题栏均带档案版本号，便于与纸质档案对照。
      </div>

      <div className="export-form">
        <div className="export-scope">
          <label className={`radio-card ${scope === 'all-approved' ? 'on' : ''}`}>
            <input type="radio" checked={scope === 'all-approved'} onChange={() => setScope('all-approved')} />
            <div>
              <strong>全灌区已通过档案</strong>
              <span>{eligible.length} 条渠道</span>
            </div>
          </label>
          <label className={`radio-card ${scope === 'canal' ? 'on' : ''}`}>
            <input type="radio" checked={scope === 'canal'} onChange={() => setScope('canal')} />
            <div>
              <strong>当前选中渠道</strong>
              <span>
                {selectedCanalId
                  ? `${meta.canalById.get(selectedCanalId)?.code} ${STATUS_LABEL[meta.canalById.get(selectedCanalId)!.status]}`
                  : '未选择'}
              </span>
            </div>
          </label>
        </div>

        <label className="check-row">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          同时导出已归档档案（版本号沿用归档时版本）
        </label>

        <div className="export-actions">
          <button className="btn primary" onClick={() => doExport('svg')}>
            导出渠系图 SVG
          </button>
          <button className="btn" onClick={() => doExport('csv')}>
            导出要素清单 CSV
          </button>
        </div>

        {last && (
          <div className="export-last">
            <div className="el-title">最近导出</div>
            <div className="mono el-name">{last.name}</div>
            <div className="dim">
              版本 {last.version} · {last.count} 个要素 · {last.at}
            </div>
          </div>
        )}

        {'error' in (preview || {}) && <div className="export-error">{(preview as any).error}</div>}
      </div>

      <div className="stat-subhead">档案状态一览（可导出性）</div>
      <div className="export-table">
        {STATUS_ORDER.map((st) => {
          const n = world.canals.filter((c) => c.status === st).length
          const ok = st === 'approved' || st === 'archived'
          return (
            <div className="et-row" key={st}>
              <span className="et-dot" style={{ background: STATUS_COLOR[st] }} />
              <span className="et-label">{STATUS_LABEL[st]}</span>
              <span className="mono et-num">{n}</span>
              <span className={`et-ok ${ok ? 'yes' : 'no'}`}>{ok ? '可导出' : '不可导出'}</span>
            </div>
          )
        })}
      </div>
      {blocked.length > 0 && (
        <div className="dim tiny-note" style={{ marginTop: 6 }}>
          尚有 {blocked.length} 条渠道未通过审核，导出时自动跳过。
        </div>
      )}

      <div className="stat-subhead">版本与留痕规则</div>
      <ul className="rules-list">
        <li>要素每次修改属性或位置，自动生成新版本，旧版本位置保留可叠加比对。</li>
        <li>导出文件名格式：<span className="mono">渠系图_范围_版本号.svg</span></li>
        <li>版本号由<code>导出日期 + 渠道数 + 要素数</code>构成，归档后不再变化。</li>
        <li>已归档档案在系统中一律只读，任何修改尝试都会被拒绝并记录提示。</li>
      </ul>
    </div>
  )
}
