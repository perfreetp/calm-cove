import React, { useMemo, useState } from 'react';
import { useApp, fmtDate } from '../store';
import { ROLE_LABEL } from '../types';
import type { Role, User } from '../types';
import { fitterStats } from '../lib/stats';
import { IconUsers, IconPlus, IconCheck, IconSearch, IconShield, IconLock, IconUser } from '../components/Icons';
import { Modal, toast, Field } from '../components/ui';

const ROLES: Role[] = ['fitter', 'reviewer', 'admin'];

export default function Users() {
  const { db, upsertUser, currentUser } = useApp();
  const [q, setQ] = useState('');
  const [roleF, setRoleF] = useState<'all' | Role>('all');
  const [edit, setEdit] = useState<User | null>(null);

  const stats = useMemo(() => fitterStats(db), [db]);
  const list = db.users.filter((u) => {
    if (roleF !== 'all' && u.role !== roleF) return false;
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return u.name.toLowerCase().includes(k) || u.email.toLowerCase().includes(k);
  });

  const roleCount = (r: Role) => db.users.filter((u) => u.role === r).length;

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>账号与角色</h1>
            <div className="sub">
              验配师 {roleCount('fitter')} · 审核员 {roleCount('reviewer')} · 管理员 {roleCount('admin')} · 按权限控制建模与审核入口
            </div>
          </div>
          <button
            className="btn primary"
            disabled={currentUser.role !== 'admin'}
            onClick={() =>
              setEdit({
                id: `u-${Date.now().toString(36)}`,
                name: '',
                role: 'fitter',
                storeId: db.stores[0].id,
                email: '',
                phone: '',
                active: true,
                joinedAt: new Date().toISOString().slice(0, 10),
                title: '验配师',
              })
            }
          >
            <IconPlus size={14} /> 新增账号
          </button>
        </div>

        <div className="grid-3" style={{ marginBottom: 16 }}>
          <div className="stat">
            <div className="lbl">验配师人均完成量</div>
            <div className="val">
              {(stats.reduce((a, s) => a + s.delivered, 0) / Math.max(1, stats.length)).toFixed(1)}
              <small>单 / 人</small>
            </div>
            <div className="sub">统计全部在册验配师</div>
          </div>
          <div className="stat">
            <div className="lbl">最高完成量</div>
            <div className="val" style={{ color: '#4fd1c5' }}>
              {Math.max(0, ...stats.map((s) => s.delivered))}
              <small>单</small>
            </div>
            <div className="sub">{stats.sort((a, b) => b.delivered - a.delivered)[0]?.user.name ?? '—'}</div>
          </div>
          <div className="stat">
            <div className="lbl">待激活 / 停用</div>
            <div className="val" style={{ color: '#e5b76a' }}>
              {db.users.filter((u) => !u.active).length}
              <small>人</small>
            </div>
            <div className="sub">停用账号无法登录</div>
          </div>
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
          <div className="panel">
            <div className="filter-bar">
              <div className="status-tabs">
                <button className={roleF === 'all' ? 'on' : ''} onClick={() => setRoleF('all')}>全部<span className="n">{db.users.length}</span></button>
                {ROLES.map((r) => (
                  <button key={r} className={roleF === r ? 'on' : ''} onClick={() => setRoleF(r)}>
                    {ROLE_LABEL[r]}<span className="n">{roleCount(r)}</span>
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <div className="search">
                <IconSearch size={14} />
                <input className="input" placeholder="搜索姓名 / 邮箱" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>角色</th>
                  <th>门店</th>
                  <th>联系方式</th>
                  <th>完成 / 订单</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((u) => {
                  const st = stats.find((s) => s.user.id === u.id);
                  const store = db.stores.find((s) => s.id === u.storeId);
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <div className="avatar" style={{ width: 26, height: 26, fontSize: 10 }}>{u.name.slice(0, 1)}</div>
                          <div>
                            <div className="cell-main">{u.name}</div>
                            <div className="cell-sub">{u.title}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.role === 'admin' ? 'red' : u.role === 'reviewer' ? 'blue' : 'teal'}`}>
                          {u.role === 'admin' ? <IconShield size={10} /> : u.role === 'reviewer' ? <IconLock size={10} /> : <IconUser size={10} />}
                          {ROLE_LABEL[u.role]}
                        </span>
                      </td>
                      <td className="small">{store?.name ?? '—'}</td>
                      <td className="tiny muted">
                        {u.email}
                        <div className="dim mono">{u.phone}</div>
                      </td>
                      <td className="mono small">
                        {u.role === 'fitter' ? `${st?.delivered ?? 0} / ${st?.orders ?? 0}` : '—'}
                      </td>
                      <td>
                        <span className={`badge ${u.active ? 'green' : 'slate'}`}><i />{u.active ? '在职' : '停用'}</span>
                      </td>
                      <td>
                        <button className="btn ghost sm" onClick={() => setEdit(u)}>编辑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <IconUsers size={14} />
              <h2>验配师完成量</h2>
              <div className="spacer" />
              <span className="panel-sub">交付口径</span>
            </div>
            <div className="panel-body">
              {[...stats].sort((a, b) => b.delivered - a.delivered).map((s, i) => {
                const maxD = Math.max(1, ...stats.map((x) => x.delivered));
                return (
                  <div className="bar-row" key={s.user.id} style={{ gridTemplateColumns: '96px 1fr 64px' }}>
                    <span className="row" style={{ gap: 6 }}>
                      <span className="mono tiny dim">{String(i + 1).padStart(2, '0')}</span>
                      {s.user.name}
                    </span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(s.delivered / maxD) * 100}%` }} />
                    </div>
                    <span className="bar-val">{s.delivered} / {s.orders}</span>
                  </div>
                );
              })}
              <div className="dash" style={{ margin: '12px 0' }} />
              <div className="panel-sub" style={{ marginBottom: 8 }}>审核员工作量</div>
              {db.users.filter((u) => u.role === 'reviewer').map((u) => {
                const reviewed = db.orders.filter((o) =>
                  o.events.some((e) => e.actorId === u.id && (e.type === 'approved' || e.type === 'returned')),
                ).length;
                const ret = db.orders.reduce((a, o) => a + o.returns.filter((r) => r.reviewerId === u.id).length, 0);
                return (
                  <div className="row" key={u.id} style={{ justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid rgba(26,39,53,0.5)' }}>
                    <span>{u.name}</span>
                    <span className="mono tiny muted">复核 {reviewed} 单 · 退回 {ret} 次</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {edit && (
        <Modal
          title={edit.name ? '编辑账号' : '新增账号'}
          onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setEdit(null)}>取消</button>
              <button
                className="btn primary"
                disabled={!edit.name.trim() || !edit.email.trim()}
                onClick={() => {
                  upsertUser(edit);
                  setEdit(null);
                  toast('账号已保存', 'ok');
                }}
              >
                <IconCheck size={13} /> 保存
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="姓名"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="职称"><input className="input" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="角色">
              <select className="select" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </Field>
            <Field label="门店">
              <select className="select" value={edit.storeId} onChange={(e) => setEdit({ ...edit, storeId: e.target.value })}>
                {db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="邮箱"><input className="input" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="手机"><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
          </div>
          <Field label="账号状态">
            <div className="row" style={{ gap: 6 }}>
              {[true, false].map((a) => (
                <button key={String(a)} className={`btn sm ${edit.active === a ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setEdit({ ...edit, active: a })}>
                  {a ? '在职' : '停用'}
                </button>
              ))}
            </div>
          </Field>
        </Modal>
      )}
    </div>
  );
}
