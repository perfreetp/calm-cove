import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, statusName } from '../store'
import { FENCE_TYPES, STATUS } from '../constants'

const EMPTY = { pastureNo: '', area: '', fenceType: FENCE_TYPES[0], household: '' }

export default function ArchiveList() {
  const archives = useStore((s) => s.archives)
  const createArchive = useStore((s) => s.createArchive)
  const deleteArchive = useStore((s) => s.deleteArchive)
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const nav = useNavigate()

  const submit = () => {
    if (!form.pastureNo.trim()) return setErr('请填写草场编号')
    if (!form.area || Number(form.area) <= 0) return setErr('请填写有效面积(亩)')
    if (!form.household.trim()) return setErr('请填写牧户姓名')
    setErr('')
    const id = createArchive(form)
    setForm(EMPTY)
    nav(`/layout/${id}`)
  }

  return (
    <div className="page">
      <div className="page-pad">
        <div className="card">
          <h2>新建地块档案</h2>
          <div className="grid grid-4">
            <label className="field">
              <span>草场编号 *</span>
              <input
                placeholder="如 CC-0715"
                value={form.pastureNo}
                onChange={(e) => setForm({ ...form, pastureNo: e.target.value })}
              />
            </label>
            <label className="field">
              <span>草场面积(亩)*</span>
              <input
                type="number"
                placeholder="如 326.5"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              />
            </label>
            <label className="field">
              <span>围栏类型 *</span>
              <select
                value={form.fenceType}
                onChange={(e) => setForm({ ...form, fenceType: e.target.value })}
              >
                {FENCE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>牧户 *</span>
              <input
                placeholder="牧户姓名"
                value={form.household}
                onChange={(e) => setForm({ ...form, household: e.target.value })}
              />
            </label>
          </div>
          {err && <div className="alert alert-red" style={{ marginTop: 12 }}>{err}</div>}
          <div className="btn-row" style={{ marginTop: 14 }}>
            <button onClick={submit}>建档并进入三维布置</button>
            <span className="muted">
              档案号规则:WL-年月日-序号,建档时自动生成
            </span>
          </div>
        </div>

        <div className="card">
          <h2>档案列表({archives.length})</h2>
          {archives.length === 0 ? (
            <div className="empty">暂无档案,请先新建地块档案</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>档案号</th>
                  <th>草场编号</th>
                  <th>面积(亩)</th>
                  <th>围栏类型</th>
                  <th>牧户</th>
                  <th>版本</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.archiveNo}</td>
                    <td>{a.pastureNo}</td>
                    <td>{a.area}</td>
                    <td>{a.fenceType}</td>
                    <td>{a.household}</td>
                    <td>V{a.currentVersion || 0} / {a.versions.length}版</td>
                    <td>
                      <span className={'tag ' + STATUS[a.status].cls}>{statusName(a.status)}</span>
                    </td>
                    <td className="muted">{a.updatedAt}</td>
                    <td>
                      <div className="btn-row">
                        <Link to={`/layout/${a.id}`}>
                          <button className="small ghost">三维</button>
                        </Link>
                        <Link to={`/overview/${a.id}`}>
                          <button className="small ghost">俯视</button>
                        </Link>
                        <Link to={`/review/${a.id}`}>
                          <button className="small ghost">审核</button>
                        </Link>
                        <button
                          className="small danger"
                          onClick={() => {
                            if (confirm(`确认删除档案 ${a.archiveNo}?`)) deleteArchive(a.id)
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
