import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore, statusName } from '../store'
import { FENCE_TYPES, STATUS } from '../constants'

export default function ArchiveSearch() {
  const archives = useStore((s) => s.archives)
  const role = useStore((s) => s.role)
  const archiveFile = useStore((s) => s.archiveFile)
  const unarchiveFile = useStore((s) => s.unarchiveFile)

  const [household, setHousehold] = useState('')
  const [year, setYear] = useState('')
  const [fenceType, setFenceType] = useState('')
  const [status, setStatus] = useState('')
  const [openId, setOpenId] = useState(null)

  const households = useMemo(() => [...new Set(archives.map((a) => a.household))], [archives])
  const years = useMemo(
    () => [...new Set(archives.map((a) => a.archiveNo.split('-')[1]?.slice(0, 4)).filter(Boolean))],
    [archives]
  )

  const results = useMemo(() => {
    return archives.filter((a) => {
      if (household && a.household !== household) return false
      if (year && !a.archiveNo.includes('-' + year)) return false
      if (fenceType && a.fenceType !== fenceType) return false
      if (status && a.status !== status) return false
      return true
    })
  }, [archives, household, year, fenceType, status])

  const reset = () => {
    setHousehold('')
    setYear('')
    setFenceType('')
    setStatus('')
  }

  const opened = archives.find((a) => a.id === openId)

  return (
    <div className="page">
      <div className="page-pad">
        <div className="card">
          <h2>归档检索</h2>
          <div className="grid grid-4">
            <label className="field">
              <span>牧户</span>
              <select value={household} onChange={(e) => setHousehold(e.target.value)}>
                <option value="">全部牧户</option>
                {households.map((h) => <option key={h}>{h}</option>)}
              </select>
            </label>
            <label className="field">
              <span>年份(按档案号)</span>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">全部年份</option>
                {years.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
            <label className="field">
              <span>围栏类型</span>
              <select value={fenceType} onChange={(e) => setFenceType(e.target.value)}>
                <option value="">全部类型</option>
                {FENCE_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              <span>状态</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">全部状态</option>
                {Object.values(STATUS).map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button className="ghost small" onClick={reset}>清空条件</button>
            <span className="muted">命中 {results.length} 份档案</span>
          </div>
        </div>

        <div className="card">
          {results.length === 0 ? (
            <div className="empty">没有符合条件的档案</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>档案号</th><th>草场编号</th><th>牧户</th><th>围栏类型</th>
                  <th>面积(亩)</th><th>版本</th><th>状态</th><th>更新时间</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {results.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.archiveNo}</td>
                    <td>{a.pastureNo}</td>
                    <td>{a.household}</td>
                    <td>{a.fenceType}</td>
                    <td>{a.area}</td>
                    <td>V{a.currentVersion} / {a.versions.length}版</td>
                    <td><span className={'tag ' + STATUS[a.status].cls}>{statusName(a.status)}</span></td>
                    <td className="muted">{a.updatedAt}</td>
                    <td>
                      <div className="btn-row">
                        <button className="small ghost" onClick={() => setOpenId(a.id === openId ? null : a.id)}>
                          {a.id === openId ? '收起档案' : '查看档案'}
                        </button>
                        {role === '监理' && a.status === 'approved' && (
                          <button className="small" onClick={() => archiveFile(a.id)}>归档</button>
                        )}
                        {role === '监理' && a.status === 'archived' && (
                          <button className="small ghost" onClick={() => unarchiveFile(a.id)}>取消归档</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {opened && (
          <div className="card">
            <div className="btn-row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>
                档案详情 <span className="mono">{opened.archiveNo}</span>
                <span className={'tag ' + STATUS[opened.status].cls} style={{ marginLeft: 10 }}>{statusName(opened.status)}</span>
              </h2>
              <div className="btn-row">
                <Link to={`/layout/${opened.id}`}><button className="small ghost">三维场景</button></Link>
                <Link to={`/overview/${opened.id}`}><button className="small ghost">俯视统计</button></Link>
                <Link to={`/review/${opened.id}`}><button className="small ghost">审核页</button></Link>
              </div>
            </div>

            <div className="grid grid-4" style={{ marginTop: 14 }}>
              <div><div className="muted">草场编号</div><b>{opened.pastureNo}</b></div>
              <div><div className="muted">面积</div><b>{opened.area} 亩</b></div>
              <div><div className="muted">围栏类型</div><b>{opened.fenceType}</b></div>
              <div><div className="muted">牧户</div><b>{opened.household}</b></div>
            </div>

            <h3 style={{ marginTop: 20 }}>版本链({opened.versions.length})</h3>
            {opened.versions.length === 0 && <div className="muted">尚未保存版本</div>}
            {opened.versions.map((v, idx) => (
              <div key={v.id} className="timeline-item" style={{ marginBottom: 6 }}>
                <b>V{v.version}</b>
                <span className={'tag ' + STATUS[v.status].cls} style={{ marginLeft: 8 }}>{statusName(v.status)}</span>
                {idx > 0 && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>基于 V{opened.versions[idx - 1].version} 演进</span>}
                <div className="at">{v.createdAt} · 桩距 {v.spacingMode}m 档 · {v.note}</div>
                <div className="muted mono" style={{ fontSize: 12, marginTop: 4 }}>
                  水泥桩 {v.stats.postCount} 根 · 网片 {v.stats.meshLength}m(3m片 {v.stats.panels3} / 5m片 {v.stats.panels5})
                  · 大门 {v.stats.gateCount} 樘 · 饮水点 {v.stats.waterCount} 处 · 拐点 {v.stats.turningPoints.length} 处
                </div>
                {v.reviews.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {v.reviews.map((r) => (
                      <div key={r.id} style={{ marginTop: 6, paddingLeft: 10, borderLeft: '3px solid var(--line)' }}>
                        <span className={r.action === 'approve' ? 'act-approve' : 'act-reject'}>
                          {r.action === 'approve' ? '✓ 审核通过' : '✗ 退回修改'}
                        </span>
                        <span className="at" style={{ marginLeft: 8 }}>{r.reviewer} · {r.at}</span>
                        <div style={{ marginTop: 2 }}>{r.comment}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
