import React, { useMemo, useState } from 'react';
import { useApp, fmtDate, relTime } from '../store';
import { IconBox, IconAlert, IconPlus, IconDownload, IconSearch, IconCheck, IconUser, IconStore } from '../components/Icons';
import { Modal, toast, Field } from '../components/ui';
import { downloadText, toCsv } from '../lib/export';
import type { Material } from '../types';

export default function Materials() {
  const { db, upsertMaterial, restock } = useApp();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Material | null>(null);
  const [restockTarget, setRestockTarget] = useState<Material | null>(null);
  const [qty, setQty] = useState(200);

  const low = db.materials.filter((m) => m.stock < m.minStock);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return db.materials;
    return db.materials.filter((m) => m.name.toLowerCase().includes(k) || m.code.toLowerCase().includes(k));
  }, [db.materials, q]);

  const usage = useMemo(() => {
    const map = new Map<string, { orders: number; stockOut: number; lastAt?: string }>();
    db.materials.forEach((m) => map.set(m.id, { orders: 0, stockOut: 0 }));
    db.orders.forEach((o) => {
      const e = map.get(o.materialId);
      if (!e) return;
      e.orders++;
      if (o.status === 'ordered' || o.status === 'delivered') e.stockOut++;
      const key = o.createdAt;
      if (!e.lastAt || key > e.lastAt) e.lastAt = key;
    });
    return map;
  }, [db.orders, db.materials]);

  const exportSpecs = () => {
    downloadText(
      `AURIS-材料规格-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        db.materials.map((m) => ({
          code: m.code,
          name: m.name,
          spec: m.spec,
          hardness: m.hardness,
          color: m.color,
          lead: m.leadDays,
          stock: m.stock,
          min: m.minStock,
          price: m.unitPrice,
          status: m.active ? '启用' : '停用',
        })),
        [
          ['code', '物料编码'],
          ['name', '材料名称'],
          ['spec', '规格'],
          ['hardness', '硬度'],
          ['color', '颜色'],
          ['lead', '交期(天)'],
          ['stock', '库存(只)'],
          ['min', '安全库存(只)'],
          ['price', '单价(元)'],
          ['status', '状态'],
        ],
      ),
      'text/csv',
    );
    toast('材料规格已导出', 'ok');
  };

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>材料规格与交期</h1>
            <div className="sub">
              {db.materials.length} 种材料 · 安全库存 {db.materials[0]?.minStock} 只 · 低于安全库存自动提示补货
            </div>
          </div>
          <button className="btn ghost" onClick={exportSpecs}>
            <IconDownload size={14} /> 导出规格
          </button>
          <button
            className="btn primary"
            onClick={() =>
              setEdit({
                id: `m-${Date.now().toString(36)}`,
                name: '',
                code: '',
                spec: '',
                hardness: '',
                color: '',
                leadDays: 5,
                stock: 0,
                minStock: 200,
                unitPrice: 50,
                active: true,
              })
            }
          >
            <IconPlus size={14} /> 新增材料
          </button>
        </div>

        {low.length > 0 && (
          <div className="notice warn" style={{ marginBottom: 14 }}>
            <IconAlert />
            <div>
              <b>{low.length} 种材料库存低于 200 只安全线：</b>{' '}
              {low.map((m) => `${m.code}（${m.stock} 只）`).join('、')}。
              建议立即补货，避免影响交期承诺。
            </div>
          </div>
        )}

        <div className="grid-stats" style={{ marginBottom: 14 }}>
          {db.materials.slice(0, 4).map((m) => {
            const ratio = Math.min(1.4, m.stock / m.minStock);
            const lowHere = m.stock < m.minStock;
            return (
              <div className="stat" key={m.id}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="lbl">{m.code} · {m.hardness}</div>
                  {lowHere && <span className="badge red">需补货</span>}
                </div>
                <div className="val" style={{ color: lowHere ? '#ff9f8d' : undefined }}>
                  {m.stock}
                  <small>只</small>
                </div>
                <div className="sub">安全库存 {m.minStock} · 交期 {m.leadDays} 天</div>
                <div className="meter" style={{ marginTop: 8 }}>
                  <div className="track">
                    <div
                      className="fill"
                      style={{ width: `${Math.min(100, ratio * 100)}%`, background: lowHere ? '#e8624f' : ratio < 1.2 ? '#e5b76a' : '#4fd1c5' }}
                    />
                  </div>
                  <span className="val">{m.stock}/{m.minStock}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <div className="filter-bar">
            <div className="row gap6">
              <IconBox size={14} />
              <span className="panel-sub">材料清单</span>
            </div>
            <div className="spacer" />
            <div className="search">
              <IconSearch size={14} />
              <input className="input" placeholder="搜索材料名称 / 编码" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 200 }}>材料</th>
                <th>规格</th>
                <th>硬度</th>
                <th>颜色</th>
                <th>交期</th>
                <th style={{ width: 190 }}>库存水位</th>
                <th>订单量</th>
                <th>单价</th>
                <th>状态</th>
                <th style={{ width: 120 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => {
                const lowHere = m.stock < m.minStock;
                const u = usage.get(m.id);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="cell-main">{m.name}</div>
                      <div className="cell-sub mono">{m.code}</div>
                    </td>
                    <td className="small muted">{m.spec}</td>
                    <td className="small">{m.hardness}</td>
                    <td className="small muted">{m.color}</td>
                    <td className="mono">{m.leadDays} 天</td>
                    <td>
                      <div className="meter">
                        <div className="track" style={{ width: 96 }}>
                          <div
                            className="fill"
                            style={{
                              width: `${Math.min(100, (m.stock / (m.minStock * 2)) * 100)}%`,
                              background: lowHere ? '#e8624f' : '#4fd1c5',
                            }}
                          />
                        </div>
                        <span className="val" style={{ color: lowHere ? '#ff9f8d' : undefined }}>
                          {m.stock}
                        </span>
                      </div>
                      {lowHere && <div className="tiny" style={{ color: '#ff9f8d', marginTop: 3 }}>低于 200 只安全线</div>}
                    </td>
                    <td className="mono">{u?.orders ?? 0}</td>
                    <td className="mono">¥{m.unitPrice}</td>
                    <td>
                      <span className={`badge ${m.active ? 'teal' : 'slate'}`}><i />{m.active ? '启用' : '停用'}</span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn ghost sm" onClick={() => { setQty(Math.max(m.minStock * 2 - m.stock, 50)); setRestockTarget(m); }}>
                          补货
                        </button>
                        <button className="btn ghost sm" onClick={() => setEdit(m)}>编辑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {edit && (
        <MaterialModal
          material={edit}
          onClose={() => setEdit(null)}
          onSave={(m) => {
            upsertMaterial(m);
            setEdit(null);
            toast('材料信息已更新', 'ok');
          }}
        />
      )}

      {restockTarget && (
        <Modal
          title="补货入库"
          subtitle={`${restockTarget.name} · ${restockTarget.code} · 当前库存 ${restockTarget.stock} 只（安全库存 ${restockTarget.minStock}）`}
          onClose={() => setRestockTarget(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setRestockTarget(null)}>取消</button>
              <button
                className="btn primary"
                onClick={() => {
                  restock(restockTarget.id, Math.max(0, Math.round(qty)));
                  toast(`已入库 ${Math.round(qty)} 只 ${restockTarget.code}`, 'ok');
                  setRestockTarget(null);
                }}
              >
                <IconCheck size={13} /> 确认入库
              </button>
            </>
          }
        >
          <Field label="入库数量（只）" hint={`入库后库存 ${restockTarget.stock + Math.round(qty)} 只`}>
            <input className="input" type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </Field>
          <div className="phone-frame">
            建议按 2 倍安全库存备料：{restockTarget.minStock * 2} 只。近 30 天该材料关联订单{' '}
            {usage.get(restockTarget.id)?.orders ?? 0} 单。
          </div>
        </Modal>
      )}
    </div>
  );
}

function MaterialModal({
  material,
  onClose,
  onSave,
}: {
  material: Material;
  onClose: () => void;
  onSave: (m: Material) => void;
}) {
  const [f, setF] = useState<Material>(material);
  return (
    <Modal
      title={material.name ? '编辑材料' : '新增材料'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button
            className="btn primary"
            disabled={!f.name.trim() || !f.code.trim()}
            onClick={() => onSave(f)}
          >
            <IconCheck size={13} /> 保存
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="材料名称"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="物料编码"><input className="input mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
        <Field label="规格"><input className="input" value={f.spec} onChange={(e) => setF({ ...f, spec: e.target.value })} /></Field>
        <Field label="硬度"><input className="input" value={f.hardness} onChange={(e) => setF({ ...f, hardness: e.target.value })} /></Field>
        <Field label="颜色"><input className="input" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></Field>
        <Field label="交期（天）"><input className="input" type="number" value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: Number(e.target.value) })} /></Field>
        <Field label="库存（只）"><input className="input" type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: Number(e.target.value) })} /></Field>
        <Field label="安全库存（只）"><input className="input" type="number" value={f.minStock} onChange={(e) => setF({ ...f, minStock: Number(e.target.value) })} /></Field>
        <Field label="单价（元）"><input className="input" type="number" value={f.unitPrice} onChange={(e) => setF({ ...f, unitPrice: Number(e.target.value) })} /></Field>
        <Field label="状态">
          <div className="row" style={{ gap: 6 }}>
            {[true, false].map((a) => (
              <button key={String(a)} className={`btn sm ${f.active === a ? 'primary' : 'ghost'}`} style={{ flex: 1 }} onClick={() => setF({ ...f, active: a })}>
                {a ? '启用' : '停用'}
              </button>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
