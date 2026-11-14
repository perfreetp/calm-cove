import React, { useMemo, useState } from 'react';
import { useApp, fmtDate } from '../store';
import { storeStats, statusCounts, thicknessDistribution } from '../lib/stats';
import { IconStore, IconPlus, IconCheck, IconSearch, IconUsers } from '../components/Icons';
import { Modal, toast, Field } from '../components/ui';
import type { Store } from '../types';

const PALETTE = ['#4fd1c5', '#6aa6e8', '#e5b76a', '#a48bea', '#6ecf97', '#e8895f'];

export default function Stores() {
  const { db, upsertStore, currentUser } = useApp();
  const [edit, setEdit] = useState<Store | null>(null);
  const [q, setQ] = useState('');
  const stats = useMemo(() => storeStats(db), [db]);

  const list = db.stores.filter((s) => {
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return s.name.toLowerCase().includes(k) || s.city.toLowerCase().includes(k) || s.code.toLowerCase().includes(k);
  });

  const maxOrders = Math.max(1, ...stats.map((s) => s.orders));

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>门店管理</h1>
            <div className="sub">{db.stores.length} 家门店 · {db.stores.filter((s) => s.active).length} 家营业中 · 按门店统计订单量与退回率</div>
          </div>
          <button
            className="btn primary"
            disabled={currentUser.role !== 'admin'}
            onClick={() =>
              setEdit({
                id: `st-${Date.now().toString(36)}`,
                name: '',
                code: '',
                city: '',
                address: '',
                phone: '',
                manager: '',
                openedAt: new Date().toISOString().slice(0, 10),
                active: true,
              })
            }
          >
            <IconPlus size={14} /> 新增门店
          </button>
        </div>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          {list.map((s, idx) => {
            const st = stats.find((x) => x.storeId === s.id)!;
            const color = PALETTE[idx % PALETTE.length];
            const fitters = db.users.filter((u) => u.storeId === s.id && u.role === 'fitter');
            return (
              <div className="panel" key={s.id} style={{ padding: 14, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(200px 90px at 100% 0%, ${color}14, transparent 70%)` }} />
                <div className="row" style={{ justifyContent: 'space-between', position: 'relative' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div
                      className="avatar"
                      style={{ background: `linear-gradient(150deg, ${color}22, #13202c)`, borderColor: `${color}55`, color }}
                    >
                      <IconStore size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                      <div className="tiny mono dim">{s.code} · {s.city}</div>
                    </div>
                  </div>
                  <span className={`badge ${s.active ? 'teal' : 'slate'}`}><i />{s.active ? '营业' : '停业'}</span>
                </div>

                <div className="row" style={{ marginTop: 14, gap: 16 }}>
                  <div>
                    <div className="tiny dim">订单量</div>
                    <div className="mono" style={{ fontSize: 20, color }}>{st.orders}</div>
                  </div>
                  <div>
                    <div className="tiny dim">平均退回</div>
                    <div className="mono" style={{ fontSize: 20, color: st.avgReturns > 0.8 ? '#e8624f' : 'var(--text)' }}>
                      {st.avgReturns.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="tiny dim">准交率</div>
                    <div className="mono" style={{ fontSize: 20, color: st.onTime > 0.85 ? '#6ecf97' : '#e5b76a' }}>
                      {(st.onTime * 100).toFixed(0)}<span className="tiny">%</span>
                    </div>
                  </div>
                </div>

                <div className="meter" style={{ marginTop: 12 }}>
                  <div className="track">
                    <div className="fill" style={{ width: `${(st.orders / maxOrders) * 100}%`, background: color }} />
                  </div>
                  <span className="val">{st.orders} 单</span>
                </div>

                <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
                  <div className="tag-list">
                    {fitters.map((f) => (
                      <span className="chip" key={f.id}>{f.name}</span>
                    ))}
                    {fitters.length === 0 && <span className="tiny dim">暂无验配师</span>}
                  </div>
                  <button className="btn ghost sm" onClick={() => setEdit(s)}>编辑</button>
                </div>
                <div className="divider" style={{ borderTop: '1px solid var(--line)', margin: '11px -14px 9px' }} />
                <div className="tiny dim" style={{ lineHeight: 1.6 }}>
                  {s.address}<br />
                  {s.phone} · 店长 {s.manager} · 开店 {fmtDate(s.openedAt)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="panel-head">
            <IconUsers size={14} />
            <h2>门店运营对比</h2>
            <div className="spacer" />
            <div className="search" style={{ maxWidth: 240 }}>
              <IconSearch size={14} />
              <input className="input" placeholder="搜索门店" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>门店</th>
                <th>订单量</th>
                <th>交付</th>
                <th>在途</th>
                <th>退回总数</th>
                <th>平均退回次数</th>
                <th>平均壁厚</th>
                <th>验配师</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const st = stats.find((x) => x.storeId === s.id)!;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-main">{s.name}</div>
                      <div className="cell-sub mono">{s.code}</div>
                    </td>
                    <td className="mono">{st.orders}</td>
                    <td className="mono">{st.delivered}</td>
                    <td className="mono">{st.pending}</td>
                    <td className="mono" style={{ color: st.returns ? '#e5b76a' : undefined }}>{st.returns}</td>
                    <td className="mono" style={{ color: st.avgReturns > 0.8 ? '#ff9f8d' : undefined }}>
                      {st.avgReturns.toFixed(2)}
                    </td>
                    <td className="mono">{st.avgWall.toFixed(2)} mm</td>
                    <td className="mono">{st.fitters}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setEdit(s)}>编辑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <Modal
          title={edit.name ? '编辑门店' : '新增门店'}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEdit(null)}>取消</button>
              <button
                className="btn primary"
                disabled={!edit.name.trim() || !edit.code.trim()}
                onClick={() => {
                  upsertStore(edit);
                  setEdit(null);
                  toast('门店信息已保存', 'ok');
                }}
              >
                <IconCheck size={13} /> 保存
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="门店名称"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="门店编码"><input className="input mono" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="城市"><input className="input" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
            <Field label="店长"><input className="input" value={edit.manager} onChange={(e) => setEdit({ ...edit, manager: e.target.value })} /></Field>
            <Field label="电话"><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="开店日期"><input className="input" type="date" value={edit.openedAt.slice(0, 10)} onChange={(e) => setEdit({ ...edit, openedAt: e.target.value })} /></Field>
          </div>
          <Field label="地址"><input className="input" value={edit.address} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></Field>
          <Field label="营业状态">
            <div className="row" style={{ gap: 6 }}>
              {[true, false].map((a) => (
                <button key={String(a)} className={`btn sm ${edit.active === a ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setEdit({ ...edit, active: a })}>
                  {a ? '营业中' : '停业'}
                </button>
              ))}
            </div>
          </Field>
        </Modal>
      )}
    </div>
  );
}
