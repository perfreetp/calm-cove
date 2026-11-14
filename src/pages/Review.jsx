import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, statusName } from '../store'
import { STATUS, OBJ_TYPES } from '../constants'
import { validatePoint } from '../lib/geometry'

export default function Review() {
  const { id } = useParams()
  const nav = useNavigate()
  const archives = useStore((s) => s.archives)
  const role = useStore((s) => s.role)
  const reviewVersion = useStore((s) => s.reviewVersion)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState('')

  const archive = archives.find((a) => a.id === id)
  const pending = archives.filter((a) => a.status === 'submitted')

  const version = useMemo(() => {
    if (!archive) return null
    return archive.versions.find((v) => v.version === archive.currentVersion) || null
  }, [archive])

  const conflicts = useMemo(() => {
    if (!archive || !version) return []
    const out = []
    for (const o of version.objects) {
      const r = validatePoint(
        o.x, o.z,
        archive.terrain.zones,
        archive.terrain.existingFences,
        [archive.terrain.width, archive.terrain.depth]
      )
      if (!r.ok) out.push({ obj: o, names: r.conflicts.map((c) => c.name).join('、'), nearest: r.nearest })
    }
    return out
  }, [archive, version])

  const canAct = role === '施工组长' && archive?.status === 'submitted' && version?.status === 'submitted'

  const act = (action) => {
    if (action === 'reject' && !comment.trim()) {
      setErr('退回必须写明桩位冲突原因及整改要求')
      return
    }
    if (action === 'approve' && conflicts.length > 0 && !confirm('仍存在位置冲突构件,确认审核通过?')) return
    setErr('')
    reviewVersion(archive.id, version.id, action, comment.trim() || (action === 'approve' ? '审核通过,同意施工。' : ''), role)
    setComment('')
  }

  if (!archive) {
    return (
      <div className="page">
        <div className="page-pad">
          <div className="card">
            <h2>待审核档案({pending.length})</h2>
            {pending.length === 0 ? (
              <div className="empty">暂无待审核提交</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>档案号</th><th>草场编号</th><th>牧户</th><th>围栏类型</th><th>提交版本</th><th>更新时间</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.archiveNo}</td>
                      <td>{a.pastureNo}</td>
                      <td>{a.household}</td>
                      <td>{a.fenceType}</td>
                      <td>V{a.currentVersion}</td>
                      <td className="muted">{a.updatedAt}</td>
                      <td><button className="small" onClick={() => nav(`/review/${a.id}`)}>进入审核</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h2>全部档案审核状态</h2>
            <table>
              <thead><tr><th>档案号</th><th>牧户</th><th>状态</th><th>版本数</th><th></th></tr></thead>
              <tbody>
                {archives.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.archiveNo}</td>
                    <td>{a.household}</td>
                    <td><span className={'tag ' + STATUS[a.status].cls}>{statusName(a.status)}</span></td>
                    <td>{a.versions.length}</td>
                    <td><button className="small ghost" onClick={() => nav(`/review/${a.id}`)}>查看</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-pad">
        <div className="card">
          <div className="btn-row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>
              档案审核 <span className="mono">{archive.archiveNo}</span>
              <span className={'tag ' + STATUS[archive.status].cls} style={{ marginLeft: 10 }}>{statusName(archive.status)}</span>
            </h2>
            <button className="ghost small" onClick={() => nav('/review')}>← 返回待审队列</button>
          </div>
          <div className="grid grid-4" style={{ marginTop: 14 }}>
            <div><div className="muted">草场编号</div><b>{archive.pastureNo}</b></div>
            <div><div className="muted">面积(亩)</div><b>{archive.area}</b></div>
            <div><div className="muted">围栏类型</div><b>{archive.fenceType}</b></div>
            <div><div className="muted">牧户</div><b>{archive.household}</b></div>
          </div>
        </div>

        {!version ? (
          <div className="card"><div className="empty">该档案尚无提交版本</div></div>
        ) : (
          <>
            <div className="card">
              <h2>V{version.version} 布点复核</h2>
              <div className="grid grid-4">
                <div className="kpi"><div className="num">{version.stats.postCount}<span className="unit">根</span></div><div className="lab">水泥桩</div></div>
                <div className="kpi"><div className="num">{version.stats.meshLength}<span className="unit">m</span></div><div className="lab">网片米数</div></div>
                <div className="kpi"><div className="num">{version.stats.gateCount}<span className="unit">樘</span></div><div className="lab">大门</div></div>
                <div className="kpi"><div className="num">{version.stats.turningPoints.length}<span className="unit">处</span></div><div className="lab">拐点</div></div>
              </div>

              <h3 style={{ marginTop: 18 }}>桩位冲突检查</h3>
              {conflicts.length === 0 ? (
                <div className="alert alert-green">全部构件均避让河流、道路、牲畜通道与已有围栏,无位置冲突。</div>
              ) : (
                <table>
                  <thead><tr><th>构件</th><th>坐标</th><th>冲突对象</th><th>系统推荐最近可放位置</th></tr></thead>
                  <tbody>
                    {conflicts.map((c) => (
                      <tr key={c.obj.id}>
                        <td style={{ color: '#ffb3b3' }}>{OBJ_TYPES[c.obj.type].name}</td>
                        <td className="mono">({c.obj.x}, {c.obj.z})</td>
                        <td>{c.names}</td>
                        <td className="mono">
                          {c.nearest ? `(${c.nearest.x}, ${c.nearest.z}) 距 ${c.nearest.distance}m` : '无可用位置'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h3 style={{ marginTop: 18 }}>桩距档位检查({version.spacingMode}m 档,容差 ±0.8m)</h3>
              {version.stats.spacingBad.length === 0 ? (
                <div className="alert alert-green">桩间距全部符合 {version.spacingMode}m 档位要求。</div>
              ) : (
                <div className="alert alert-red">
                  存在 {version.stats.spacingBad.length} 对桩距偏差,施工前须由设计员复核调整。
                </div>
              )}

              <div className="btn-row" style={{ marginTop: 14 }}>
                <button className="ghost small" onClick={() => nav(`/overview/${archive.id}`)}>查看俯视图与物料清单</button>
                <button className="ghost small" onClick={() => nav(`/layout/${archive.id}`)}>查看三维场景</button>
              </div>
            </div>

            <div className="card">
              <h2>审核操作</h2>
              {role !== '施工组长' && (
                <div className="alert alert-amber">当前角色为「{role}」,仅施工组长可执行审核操作。</div>
              )}
              {!canAct && role === '施工组长' && (
                <div className="alert alert-amber">
                  当前版本状态为「{statusName(version.status)}」,不可再审核。通过后的版本已锁定,修改需新建版本。
                </div>
              )}
              {canAct && (
                <>
                  <label className="field">
                    <span>审核意见(退回时必须写明桩位冲突原因)</span>
                    <textarea
                      placeholder="如:第 7、8 号桩距牧道3号线不足 3m,请按系统推荐坐标向北平移后重新提交"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </label>
                  {err && <div className="alert alert-red" style={{ marginTop: 10 }}>{err}</div>}
                  <div className="btn-row" style={{ marginTop: 12 }}>
                    <button onClick={() => act('approve')}>审核通过并锁定版本</button>
                    <button className="danger" onClick={() => act('reject')}>退回修改</button>
                  </div>
                </>
              )}
            </div>

            <div className="card">
              <h2>版本链与审核记录</h2>
              {archive.versions.map((v) => (
                <div key={v.id} className="review-item">
                  <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                    <div>
                      <b>V{v.version}</b>
                      <span className={'tag ' + STATUS[v.status].cls} style={{ marginLeft: 8 }}>{statusName(v.status)}</span>
                      <span className="at" style={{ marginLeft: 10 }}>{v.createdAt} · {v.note}</span>
                    </div>
                    <div className="muted mono" style={{ fontSize: 12 }}>
                      桩 {v.stats.postCount} · 网 {v.stats.meshLength}m · 门 {v.stats.gateCount}
                    </div>
                  </div>
                  {v.reviews.length === 0 ? (
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>暂无审核记录</div>
                  ) : (
                    v.reviews.map((r) => (
                      <div key={r.id} style={{ marginTop: 8, paddingLeft: 10, borderLeft: '3px solid var(--line)' }}>
                        <span className={r.action === 'approve' ? 'act-approve' : 'act-reject'}>
                          {r.action === 'approve' ? '✓ 通过' : '✗ 退回'}
                        </span>
                        <span className="at" style={{ marginLeft: 8 }}>{r.reviewer} · {r.at}</span>
                        <div style={{ marginTop: 4 }}>{r.comment}</div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
