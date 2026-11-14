import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, relTime } from '../store';
import { STATUS_META, ROLE_LABEL } from '../types';
import type { OrderStatus } from '../types';
import { IconChevron, IconClock, IconShield, IconAlert, IconCheck, IconSearch } from '../components/Icons';

export default function Review() {
  const { db, currentUser } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState<'pending' | 'returned' | 'done'>('pending');
  const [q, setQ] = useState('');

  const pending = db.orders.filter((o) => o.status === 'pending_review');
  const returned = db.orders.filter((o) => o.status === 'returned');
  const done = db.orders.filter((o) => o.status === 'ordered' || o.status === 'delivered');

  const list = useMemo(() => {
    const src = tab === 'pending' ? pending : tab === 'returned' ? returned : done;
    if (!q.trim()) return src;
    const k = q.trim().toLowerCase();
    return src.filter((o) => o.patient.toLowerCase().includes(k) || o.code.toLowerCase().includes(k));
  }, [tab, pending, returned, done, q]);

  const oldestPending = [...pending].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>审核中心</h1>
            <div className="sub">复核曲面曲率与下料图合规性 · 退回需写明原因并计入订单退回次数</div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <StatBubble label="待审核" value={pending.length} tone="amber" />
            <StatBubble label="已退回待改" value={returned.length} tone="red" />
            <StatBubble label="累计通过" value={done.length} tone="teal" />
          </div>
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
          <div className="panel" style={{ overflow: 'hidden' }}>
            <div className="filter-bar">
              <div className="status-tabs">
                <button className={tab === 'pending' ? 'on' : ''} onClick={() => setTab('pending')}>
                  待审核<span className="n">{pending.length}</span>
                </button>
                <button className={tab === 'returned' ? 'on' : ''} onClick={() => setTab('returned')}>
                  已退回<span className="n">{returned.length}</span>
                </button>
                <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>
                  已通过<span className="n">{done.length}</span>
                </button>
              </div>
              <div className="spacer" />
              <div className="search">
                <IconSearch size={14} />
                <input className="input" placeholder="搜索患者 / 订单号" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 250px)', overflow: 'auto' }}>
              {list.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <div className="empty">该分类下暂无订单。</div>
                </div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>患者 / 订单</th>
                      <th>门店 · 验配师</th>
                      <th>版本</th>
                      <th>曲率峰值</th>
                      <th>壁厚</th>
                      <th>退回</th>
                      <th>提交时间</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((o) => {
                      const v = o.versions[o.versions.length - 1];
                      const over = v.metrics.curvatureMax > v.threshold;
                      const submitted = [...o.events].reverse().find((e) => e.type === 'submitted');
                      return (
                        <tr key={o.id} className="clickable" onClick={() => nav(`/review/${o.id}`)}>
                          <td>
                            <div className="cell-main">{o.patient}</div>
                            <div className="cell-sub mono">{o.code} · {o.ear === 'right' ? '右耳' : '左耳'}</div>
                          </td>
                          <td>
                            <div>{db.stores.find((s) => s.id === o.storeId)?.name}</div>
                            <div className="cell-sub">{db.users.find((u) => u.id === o.fitterId)?.name}</div>
                          </td>
                          <td className="mono">V{v.seq}</td>
                          <td>
                            <div className={over ? 'row' : ''} style={{ color: over ? '#ff9f8d' : 'var(--muted)' }}>
                              {over && <IconAlert size={12} />}
                              <span className="mono">{v.metrics.curvatureMax.toFixed(2)}</span>
                              <span className="dim tiny"> / {v.threshold.toFixed(2)}</span>
                            </div>
                          </td>
                          <td className="mono">{v.wallThickness.toFixed(1)}</td>
                          <td>
                            {o.returns.length ? (
                              <span className="badge red">{o.returns.length} 次</span>
                            ) : (
                              <span className="dim tiny">—</span>
                            )}
                          </td>
                          <td className="dim tiny">{submitted ? relTime(submitted.at) : '—'}</td>
                          <td>
                            <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); nav(`/review/${o.id}`); }}>
                              复核 <IconChevron size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="stack">
            <div className="panel">
              <div className="panel-head">
                <IconClock size={14} />
                <h2>审核节奏</h2>
                <div className="spacer" />
                <span className="panel-sub">SLA 4h</span>
              </div>
              <div className="panel-body stack" style={{ gap: 10 }}>
                {oldestPending ? (
                  <>
                    <div className="tiny dim">最早等待</div>
                    <div className="row">
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{oldestPending.patient}</div>
                        <div className="tiny mono dim">{oldestPending.code}</div>
                      </div>
                      <div className="mono" style={{ fontSize: 16, color: '#e5b76a' }}>
                        {waitHours(oldestPending.updatedAt)}h
                      </div>
                    </div>
                    <div className="meter">
                      <div className="track">
                        <div
                          className="fill"
                          style={{
                            width: `${Math.min(100, (waitHours(oldestPending.updatedAt) / 4) * 100)}%`,
                            background: waitHours(oldestPending.updatedAt) > 4 ? '#e8624f' : '#e5b76a',
                          }}
                        />
                      </div>
                    </div>
                    <button className="btn sm" onClick={() => nav(`/review/${oldestPending.id}`)}>
                      立即复核
                    </button>
                  </>
                ) : (
                  <div className="tiny dim">审核队列已清空，暂无等待中的方案。</div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <IconShield size={14} />
                <h2>常见退回原因</h2>
              </div>
              <div className="panel-body" style={{ padding: '6px 0' }}>
                {[
                  ['曲率超限未降形', '第二转折隆起 K＞阈值，应力集中'],
                  ['泄压孔偏离轴线', '下料图泄压孔偏心 > 2mm'],
                  ['壁厚档位不匹配', '狭小耳道使用 0.8mm 壁厚'],
                  ['贴合边无法密封', '耳屏处控制点外扩过度'],
                ].map(([t, d], i) => (
                  <div key={t} style={{ padding: '9px 14px', borderBottom: i < 3 ? '1px solid rgba(26,39,53,0.6)' : 'none' }}>
                    <div className="row" style={{ gap: 7 }}>
                      <span className="mono tiny" style={{ color: '#e5b76a' }}>{String(i + 1).padStart(2, '0')}</span>
                      <span style={{ fontSize: 12 }}>{t}</span>
                    </div>
                    <div className="tiny dim" style={{ marginTop: 3, paddingLeft: 24 }}>{d}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-head">
                <IconCheck size={14} />
                <h2>最近审核记录</h2>
              </div>
              <div style={{ padding: '10px 14px 14px' }}>
                <div className="timeline">
                  {db.orders
                    .flatMap((o) => o.events.filter((e) => e.type === 'approved' || e.type === 'returned').map((e) => ({ o, e })))
                    .sort((a, b) => b.e.at.localeCompare(a.e.at))
                    .slice(0, 5)
                    .map(({ o, e }) => (
                      <div className="tl-item" key={e.id}>
                        <div className="tl-rail">
                          <div className={`tl-dot ${e.type === 'approved' ? 'teal' : 'red'}`} />
                          <div className="tl-line" />
                        </div>
                        <div className="tl-body">
                          <div className="t">
                            {e.type === 'approved' ? '通过' : '退回'} · {o.patient}
                          </div>
                          <div className="m">
                            <span>{db.users.find((u) => u.id === e.actorId)?.name}</span>
                            <span>{relTime(e.at)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function waitHours(iso: string) {
  return Math.max(0, Math.round(((Date.now() - new Date(iso).getTime()) / 3600000) * 10) / 10);
}

function StatBubble({ label, value, tone }: { label: string; value: number; tone: 'amber' | 'red' | 'teal' }) {
  const color = tone === 'amber' ? '#e5b76a' : tone === 'red' ? '#e8624f' : '#4fd1c5';
  return (
    <div style={{ textAlign: 'right', paddingLeft: 18, borderLeft: `2px solid ${color}33` }}>
      <div className="tiny dim">{label}</div>
      <div className="mono" style={{ fontSize: 20, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
