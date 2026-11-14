import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, fmtTime, fmtDate, relTime } from '../store';
import { STATUS_META, RETURN_REASONS_INTERNAL, THICKNESS_META } from '../types';
import {
  buildSurface,
  CURV_THRESHOLD_DEFAULT,
} from '../lib/geom';
import { developFromModel } from '../lib/unroll';
import { Preview3D } from '../components/Preview3D';
import { SheetView } from '../components/SheetView';
import { Modal, toast, Field } from '../components/ui';
import {
  IconAlert,
  IconCheck,
  IconX,
  IconArrow,
  IconClock,
  IconInfo,
  IconDownload,
  IconSheet,
  IconUser,
  IconLock,
} from '../components/Icons';
import { downloadText, sheetSvg, toCsv } from '../lib/export';

export default function ReviewDetail() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const { db, approveOrder, returnOrder, deliverOrder } = useApp();
  const order = db.orders.find((o) => o.id === orderId);
  const [viewMode, setViewMode] = useState<'curv' | 'solid' | 'thick'>('curv');
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);

  const version = order ? order.versions[order.versions.length - 1] : null;

  const model = useMemo(() => {
    if (!version) return null;
    return buildSurface(version.controlPoints, {
      nu: 110,
      nv: 118,
      wall: version.wallThickness,
      adaptive: version.adaptive,
      threshold: version.threshold,
    });
  }, [version]);

  const sheet = useMemo(() => {
    if (!model || !version) return null;
    return developFromModel(model, {
      wall: version.wallThickness,
      adaptive: version.adaptive,
      threshold: version.threshold,
    });
  }, [model, version]);

  if (!order || !version) {
    return (
      <div className="page-pad">
        <div className="empty">订单不存在。</div>
      </div>
    );
  }

  const store = db.stores.find((s) => s.id === order.storeId);
  const fitter = db.users.find((u) => u.id === order.fitterId);
  const material = db.materials.find((m) => m.id === order.materialId);
  const over = version.metrics.curvatureMax > version.threshold;
  const meta = {
    orderCode: order.code,
    patient: order.patient,
    ear: order.ear === 'right' ? '右' : '左',
    fitter: fitter?.name ?? '—',
    store: store?.name ?? '—',
    date: new Date().toISOString().slice(0, 10),
    material: material?.name ?? '—',
    version: version.seq,
    threshold: version.threshold,
  };

  const checks = [
    {
      ok: !over,
      title: '曲率合规',
      detail: over
        ? `峰值 ${version.metrics.curvatureMax.toFixed(2)} mm⁻¹ 超出阈值 ${version.threshold.toFixed(2)} ${((version.metrics.curvatureMax / version.threshold - 1) * 100).toFixed(0)}%`
        : `峰值 ${version.metrics.curvatureMax.toFixed(2)} mm⁻¹，在阈值 ${version.threshold.toFixed(2)} 以内`,
    },
    {
      ok: version.wallThickness >= 1.2 || version.metrics.curvatureMax < version.threshold * 0.8,
      title: '壁厚匹配',
      detail:
        version.wallThickness >= 1.2
          ? `当前 ${version.wallThickness.toFixed(1)} mm（${THICKNESS_META[version.wallThickness]?.name ?? '自定义'}），满足常用强度要求`
          : `当前 ${version.wallThickness.toFixed(1)} mm 为超薄档，需曲率显著低于阈值方可放行`,
    },
    {
      ok: version.metrics.overRatio < 0.01,
      title: '超限面积',
      detail: `超限面积占比 ${(version.metrics.overRatio * 100).toFixed(2)}%，阈值要求 < 1.0%`,
    },
    {
      ok: true,
      title: '下料图完整',
      detail: sheet ? `展开 ${sheet.length.toFixed(1)} × ${sheet.widthTop.toFixed(1)} mm，泄压孔 Ø1.3、贴合边 2.0mm 止口齐全` : '展开计算中',
    },
  ];
  const passable = checks.every((c) => c.ok);

  const doApprove = (note?: string) => {
    approveOrder(order.id, note || `曲率与下料图复核通过 · 材料 ${material?.code} 交期 ${material?.leadDays} 天`);
    setApproveOpen(false);
    toast(`已通过并下单生产 · ${order.patient}`, 'ok');
    nav('/review');
  };

  const doReturn = () => {
    if (reason.trim().length < 8) {
      toast('退回原因至少 8 个字，需具体说明问题', 'err');
      return;
    }
    returnOrder(order.id, reason.trim());
    setReturnOpen(false);
    setReason('');
    toast('已退回验配师，退回次数 +1', 'info');
    nav('/review');
  };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', gap: 12 }}>
        <button className="btn ghost sm" onClick={() => nav('/review')}>
          <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><IconArrow size={13} /></span> 返回队列
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--line)' }} />
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{order.patient}</span>
            <span className="chip">{order.ear === 'right' ? '右耳' : '左耳'}</span>
            <span className="mono dim tiny">{order.code}</span>
            <span className={`badge ${STATUS_META[order.status].tone}`}><i />{STATUS_META[order.status].label}</span>
            {order.returns.length > 0 && <span className="badge red">退回 {order.returns.length} 次</span>}
          </div>
          <div className="tiny dim" style={{ marginTop: 3 }}>
            {store?.name} · {fitter?.name} · V{version.seq} · 提交 {fmtTime(version.createdAt)}
          </div>
        </div>
        <div className="spacer" />
        {order.status === 'ordered' && (
          <button className="btn sm" onClick={() => { deliverOrder(order.id); toast('已标记交付', 'ok'); }}>
            <IconCheck size={13} /> 标记已交付
          </button>
        )}
        <button className="btn danger sm" disabled={order.status !== 'pending_review'} onClick={() => { setReason(''); setReturnOpen(true); }}>
          <IconX size={13} /> 退回修改
        </button>
        <button className="btn primary sm" disabled={order.status !== 'pending_review'} onClick={() => setApproveOpen(true)}>
          <IconCheck size={13} /> 审核通过
        </button>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 340px', minHeight: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--line)' }}>
          <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <div className="seg">
              <button className={viewMode === 'curv' ? 'on' : ''} onClick={() => setViewMode('curv')}>曲率视图</button>
              <button className={viewMode === 'solid' ? 'on' : ''} onClick={() => setViewMode('solid')}>实体</button>
              <button className={viewMode === 'thick' ? 'on' : ''} onClick={() => setViewMode('thick')}>壁厚</button>
            </div>
            <div className="spacer" />
            <span className="tiny dim">拖动旋转 · 滚轮缩放</span>
          </div>
          <div style={{ flex: '1 1 52%', minHeight: 200, display: 'flex' }}>
            {model && (
              <Preview3D
                model={model}
                mode={viewMode}
                threshold={version.threshold}
                height="100%"
              />
            )}
          </div>
          <div className="row" style={{ padding: '8px 12px', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
            <IconSheet size={13} />
            <span style={{ fontSize: 12 }}>下料展开图</span>
            <span className="tiny dim">· 1:1 mm · V{version.seq}</span>
            <div className="spacer" />
            <button
              className="btn ghost sm"
              onClick={() => sheet && downloadText(`${order.code}-V${version.seq}-${order.ear}.svg`, sheetSvg(sheet, meta))}
              disabled={!sheet}
            >
              <IconDownload size={12} /> SVG
            </button>
          </div>
          <div style={{ flex: '1 1 48%', minHeight: 220, display: 'flex', flexDirection: 'column' }}>
            {sheet && <SheetView sheet={sheet} threshold={version.threshold} meta={meta} compact />}
          </div>
        </div>

        <div style={{ overflowY: 'auto' }}>
          <div style={{ padding: 14 }}>
            <div className={passable ? 'notice ok' : 'notice err'} style={{ marginBottom: 12 }}>
              {passable ? <IconCheck /> : <IconAlert />}
              <div>
                {passable
                  ? '合规检查全部通过，可批准下单。'
                  : '存在不合规项，建议退回并写明原因。'}
              </div>
            </div>

            <div className="panel-sub" style={{ marginBottom: 8 }}>合规检查</div>
            <div className="stack" style={{ gap: 7 }}>
              {checks.map((c) => (
                <div key={c.title} className="row" style={{ alignItems: 'flex-start', gap: 9 }}>
                  <span style={{ color: c.ok ? '#6ecf97' : '#e8624f', marginTop: 1 }}>
                    {c.ok ? <IconCheck size={13} /> : <IconX size={13} />}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11.5 }}>{c.title}</div>
                    <div className="tiny dim" style={{ marginTop: 2, lineHeight: 1.5 }}>{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="dash" />
          <div style={{ padding: 14 }}>
            <div className="panel-sub" style={{ marginBottom: 8 }}>方案参数</div>
            <div className="kv" style={{ fontSize: 11 }}>
              <dt>材料</dt>
              <dd>{material?.name ?? '—'}</dd>
              <dt>交期</dt>
              <dd className="mono">{material?.leadDays} 天</dd>
              <dt>壁厚档位</dt>
              <dd className="mono">{version.wallThickness.toFixed(1)} mm · {THICKNESS_META[version.wallThickness]?.name}</dd>
              <dt>偏置方式</dt>
              <dd>{version.adaptive ? '自适应（曲率加权）' : '等距偏置'}</dd>
              <dt>壁厚实测</dt>
              <dd className="mono">{version.metrics.wallMin.toFixed(2)} – {version.metrics.wallMax.toFixed(2)} mm</dd>
              <dt>曲率阈值</dt>
              <dd className="mono">{version.threshold.toFixed(2)} mm⁻¹</dd>
              <dt>超限处</dt>
              <dd className="mono">{model?.hotspotDetail.length ?? 0} 处</dd>
              <dt>展开尺寸</dt>
              <dd className="mono">{sheet ? `${sheet.length.toFixed(1)}×${sheet.widthTop.toFixed(1)}` : '—'}</dd>
              <dt>库存扣减</dt>
              <dd className="mono">{material ? `${material.stock} 只` : '—'}</dd>
            </div>
          </div>
          <div className="dash" />
          <div style={{ padding: 14 }}>
            <div className="panel-sub" style={{ marginBottom: 8 }}>版本说明</div>
            <div className="phone-frame" style={{ marginBottom: 10 }}>{version.note}</div>
            {order.notes && (
              <div className="tiny dim" style={{ lineHeight: 1.6 }}>
                <IconInfo size={11} /> 验配师备注：{order.notes}
              </div>
            )}
          </div>
          {order.returns.length > 0 && (
            <>
              <div className="dash" />
              <div style={{ padding: 14 }}>
                <div className="panel-sub" style={{ marginBottom: 8 }}>历史退回</div>
                {order.returns.map((r, i) => (
                  <div key={r.id} className="notice err" style={{ marginBottom: 7, flexDirection: 'column', alignItems: 'stretch' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <b>第 {i + 1} 次退回 · V{r.versionSeq}</b>
                      <span className="tiny">{fmtTime(r.at)}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>{r.reason}</div>
                    <div className="tiny dim" style={{ marginTop: 4 }}>审核人 {db.users.find((u) => u.id === r.reviewerId)?.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="dash" />
          <div style={{ padding: 14 }}>
            <div className="panel-sub" style={{ marginBottom: 8 }}>操作记录</div>
            <div className="timeline">
              {order.events.map((e, i) => (
                <div className="tl-item" key={e.id}>
                  <div className="tl-rail">
                    <div className={`tl-dot ${e.type === 'approved' || e.type === 'delivered' ? 'teal' : e.type === 'returned' ? 'red' : e.type === 'submitted' ? 'amber' : ''}`} />
                    {i < order.events.length - 1 && <div className="tl-line" />}
                  </div>
                  <div className="tl-body">
                    <div className="t">{e.label}</div>
                    <div className="m">
                      <span>{db.users.find((u) => u.id === e.actorId)?.name}</span>
                      <span>{fmtTime(e.at)}</span>
                    </div>
                    {e.note && <div className="note">{e.note}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {returnOpen && (
        <Modal
          title="退回修改"
          subtitle={`${order.patient} · V${version.seq} · 退回将计入订单退回次数（当前 ${order.returns.length} 次）`}
          onClose={() => setReturnOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setReturnOpen(false)}>取消</button>
              <button className="btn danger" onClick={doReturn}>
                <IconX size={13} /> 确认退回
              </button>
            </>
          }
        >
          <Field label="退回原因（必填）" hint="至少 8 个字，验配师会在订单中看到完整说明">
            <textarea
              className="textarea"
              style={{ minHeight: 90 }}
              value={reason}
              placeholder="请具体说明不合规问题与修改要求…"
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div>
            <div className="tiny dim" style={{ marginBottom: 6 }}>常用原因（点击填入）</div>
            <div className="stack" style={{ gap: 5 }}>
              {RETURN_REASONS_INTERNAL.slice(0, 4).map((r) => (
                <button
                  key={r}
                  className="btn ghost sm"
                  style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.5 }}
                  onClick={() => setReason(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {approveOpen && (
        <Modal
          title="审核通过并下单"
          subtitle="通过后订单进入生产队列，并按材料库存扣减 1 只"
          onClose={() => setApproveOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setApproveOpen(false)}>取消</button>
              <button className="btn primary" onClick={() => doApprove()}>
                <IconCheck size={13} /> 确认通过
              </button>
            </>
          }
        >
          <div className="notice ok">
            <IconCheck />
            <div>
              {order.patient} · {order.ear === 'right' ? '右耳' : '左耳'} · V{version.seq} ·
              壁厚 {version.wallThickness.toFixed(1)}mm · 曲率峰值 {version.metrics.curvatureMax.toFixed(2)}
            </div>
          </div>
          <div className="kv" style={{ fontSize: 12 }}>
            <dt>材料</dt>
            <dd>{material?.name}</dd>
            <dt>当前库存</dt>
            <dd className="mono">{material?.stock} 只</dd>
            <dt>预计交期</dt>
            <dd className="mono">{material?.leadDays} 天</dd>
          </div>
          {material && material.stock - 1 < material.minStock && (
            <div className="notice warn">
              <IconAlert />
              <div>下单后库存 {material.stock - 1} 只将低于安全库存 {material.minStock} 只，系统会触发补货提示。</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
