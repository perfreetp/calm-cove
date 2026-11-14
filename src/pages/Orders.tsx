import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp, fmtTime, relTime } from '../store';
import { STATUS_META, ROLE_LABEL } from '../types';
import type { Order, OrderStatus } from '../types';
import { IconSearch, IconPlus, IconCube, IconArrow, IconAlert, IconSheet } from '../components/Icons';
import { Modal, toast, Field } from '../components/ui';

const FILTERS: Array<{ key: 'all' | OrderStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'pending_model', label: '待建模' },
  { key: 'pending_review', label: '待审核' },
  { key: 'returned', label: '已退回' },
  { key: 'ordered', label: '已下单' },
  { key: 'delivered', label: '已交付' },
];

export default function Orders() {
  const { db, currentUser, createOrder } = useApp();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | OrderStatus>('all');
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(currentUser.role === 'fitter');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    patient: '',
    ear: 'right' as 'left' | 'right',
    materialId: db.materials[0]?.id ?? '',
    notes: '',
  });

  const visible = useMemo(() => {
    let list = db.orders;
    if (mine && currentUser.role === 'fitter') list = list.filter((o) => o.fitterId === currentUser.id);
    if (filter !== 'all') list = list.filter((o) => o.status === filter);
    if (q.trim()) {
      const k = q.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.patient.toLowerCase().includes(k) ||
          o.code.toLowerCase().includes(k) ||
          (db.users.find((u) => u.id === o.fitterId)?.name ?? '').toLowerCase().includes(k),
      );
    }
    return list;
  }, [db.orders, db.users, filter, q, mine, currentUser]);

  const counts = useMemo(() => {
    const base = db.orders.filter((o) => (currentUser.role === 'fitter' ? o.fitterId === currentUser.id : true));
    const c: Record<string, number> = { all: base.length };
    base.forEach((o) => {
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [db.orders, currentUser]);

  const submit = () => {
    if (!form.patient.trim()) {
      toast('请填写患者姓名', 'err');
      return;
    }
    const o = createOrder({
      patient: form.patient.trim(),
      ear: form.ear,
      storeId: currentUser.storeId,
      fitterId: currentUser.role === 'fitter' ? currentUser.id : db.users.find((u) => u.role === 'fitter')!.id,
      materialId: form.materialId,
      notes: form.notes,
    });
    setOpen(false);
    setForm({ ...form, patient: '', notes: '' });
    toast(`订单 ${o.code} 已创建`, 'ok');
    nav(`/studio/${o.id}`);
  };

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>订单建模</h1>
            <div className="sub">
              导入耳印扫描或手动摆点生成耳模曲面 · 共 {db.orders.length} 单 · 待建模 {counts.pending_model ?? 0}
            </div>
          </div>
          {currentUser.role !== 'reviewer' && (
            <button className="btn primary" onClick={() => setOpen(true)}>
              <IconPlus size={14} /> 新建订单
            </button>
          )}
        </div>

        <div className="panel">
          <div className="filter-bar">
            <div className="status-tabs">
              {FILTERS.map((f) => (
                <button key={f.key} className={filter === f.key ? 'on' : ''} onClick={() => setFilter(f.key)}>
                  {f.label}
                  <span className="n">{counts[f.key] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="spacer" />
            {currentUser.role === 'fitter' && (
              <button className={`btn ghost sm ${mine ? 'on' : ''}`} style={mine ? { color: 'var(--accent)', borderColor: 'rgba(79,209,197,0.3)' } : undefined} onClick={() => setMine((v) => !v)}>
                仅看我的
              </button>
            )}
            <div className="search">
              <IconSearch size={14} />
              <input className="input" placeholder="搜索患者 / 订单号 / 验配师" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: 16 }}>
              <div className="empty">没有符合条件的订单。点击右上角「新建订单」开始建模。</div>
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 260px)', overflow: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>订单 / 患者</th>
                    <th>门店</th>
                    <th>验配师</th>
                    <th>材料</th>
                    <th>版本</th>
                    <th>壁厚</th>
                    <th>曲率</th>
                    <th>退回</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th style={{ width: 108 }} />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((o) => {
                    const store = db.stores.find((s) => s.id === o.storeId);
                    const fitter = db.users.find((u) => u.id === o.fitterId);
                    const material = db.materials.find((m) => m.id === o.materialId);
                    const v = o.versions[o.versions.length - 1];
                    const over = v.metrics.curvatureMax > v.threshold;
                    return (
                      <tr key={o.id} className="clickable" onClick={() => nav(`/studio/${o.id}`)}>
                        <td>
                          <div className="cell-main">{o.patient} <span className="chip" style={{ marginLeft: 4 }}>{o.ear === 'right' ? 'R' : 'L'}</span></div>
                          <div className="cell-sub mono">{o.code}</div>
                        </td>
                        <td>{store?.name}</td>
                        <td>{fitter?.name}</td>
                        <td className="mono tiny">{material?.code}</td>
                        <td className="mono">V{v.seq}</td>
                        <td className="mono">{v.wallThickness.toFixed(1)}</td>
                        <td>
                          <span className="mono" style={{ color: over ? '#ff9f8d' : 'var(--muted)' }}>
                            {v.metrics.curvatureMax.toFixed(2)}
                          </span>
                        </td>
                        <td className="mono" style={{ color: o.returns.length ? '#e5b76a' : 'var(--dim)' }}>
                          {o.returns.length}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_META[o.status].tone}`}>
                            <i />
                            {STATUS_META[o.status].label}
                          </span>
                        </td>
                        <td className="dim tiny">{relTime(o.updatedAt)}</td>
                        <td>
                          <button
                            className="btn ghost sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              nav(`/studio/${o.id}`);
                            }}
                          >
                            建模 <IconArrow size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {open && (
        <Modal
          title="新建建模订单"
          subtitle="创建后进入工作室导入耳印扫描点云或手动摆点"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setOpen(false)}>取消</button>
              <button className="btn primary" onClick={submit}>
                <IconCube size={13} /> 创建并进入工作室
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="患者姓名">
              <input className="input" value={form.patient} placeholder="例如 陈砚清" onChange={(e) => setForm({ ...form, patient: e.target.value })} />
            </Field>
            <Field label="耳别">
              <div className="row" style={{ gap: 6 }}>
                {(['right', 'left'] as const).map((e) => (
                  <button
                    key={e}
                    className={`btn ${form.ear === e ? 'primary' : 'ghost'} sm`}
                    style={{ flex: 1 }}
                    onClick={() => setForm({ ...form, ear: e })}
                  >
                    {e === 'right' ? '右耳' : '左耳'}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="材料规格">
            <select className="select" value={form.materialId} onChange={(e) => setForm({ ...form, materialId: e.target.value })}>
              {db.materials.filter((m) => m.active).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.code} · 交期 {m.leadDays} 天 · 库存 {m.stock}
                </option>
              ))}
            </select>
          </Field>
          <Field label="备注" hint="患者耳道特征、佩戴时长等，会同步给审核员">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="notice info">
            <IconAlert size={14} />
            <div>创建后订单状态为「待建模」，提交审核后验配师不可再修改当前版本，需重新保存新版本。</div>
          </div>
        </Modal>
      )}
    </div>
  );
}
