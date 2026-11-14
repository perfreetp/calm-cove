import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, fmtTime, fmtDate, relTime } from '../store';
import { STATUS_META, ROLE_LABEL } from '../types';
import type { OrderStatus } from '../types';
import { storeStats, statusCounts, fitterStats, dailySeries, curvatureHotspots, last30 } from '../lib/stats';
import { AreaChart, Spark } from '../components/Charts';
import { IconArrow, IconAlert, IconCube, IconClock, IconShield, IconTrend, IconCheck, IconUser, IconDownload } from '../components/Icons';
import { downloadText, toCsv } from '../lib/export';
import { toast } from '../components/ui';

export default function Overview() {
  const { db, currentUser, resetDemo } = useApp();
  const nav = useNavigate();

  const isFitter = currentUser.role === 'fitter';
  const myOrders = db.orders.filter((o) => o.fitterId === currentUser.id);
  const scoped = isFitter ? myOrders : db.orders;

  const sts = useMemo(() => storeStats(db), [db]);
  const counts = useMemo(() => statusCounts(scoped), [scoped]);
  const series = useMemo(() => dailySeries(scoped, 14), [scoped]);
  const hotspots = useMemo(() => curvatureHotspots(scoped), [scoped]);
  const fitters = useMemo(() => fitterStats(db), [db]);
  const returns = scoped.reduce((a, o) => a + o.returns.length, 0);

  const todo = scoped
    .filter((o) => o.status === 'pending_model' || o.status === 'returned')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  const reviewQueue = db.orders
    .filter((o) => o.status === 'pending_review')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  const lowStock = db.materials.filter((m) => m.stock < m.minStock);

  const exportQuick = () => {
    downloadText(
      `AURIS-近30天订单明细-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        last30(db.orders).map((o) => {
          const v = o.versions[o.versions.length - 1];
          return {
            code: o.code,
            patient: o.patient,
            status: STATUS_META[o.status].label,
            store: db.stores.find((s) => s.id === o.storeId)?.name ?? '',
            fitter: db.users.find((u) => u.id === o.fitterId)?.name ?? '',
            wall: v.wallThickness,
            curv: v.metrics.curvatureMax.toFixed(3),
            returns: o.returns.length,
            createdAt: o.createdAt.slice(0, 16).replace('T', ' '),
          };
        }),
        [
          ['code', '订单号'],
          ['patient', '患者'],
          ['status', '状态'],
          ['store', '门店'],
          ['fitter', '验配师'],
          ['wall', '壁厚(mm)'],
          ['curv', '曲率峰值'],
          ['returns', '退回次数'],
          ['createdAt', '创建时间'],
        ],
      ),
      'text/csv',
    );
    toast('已导出近 30 天订单明细', 'ok');
  };

  const hour = new Date().getHours();
  const greet = hour < 6 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>{greet}，{currentUser.name}</h1>
            <div className="sub">
              {isFitter
                ? `你是 ${db.stores.find((s) => s.id === currentUser.storeId)?.name} 的${ROLE_LABEL[currentUser.role]} · 今日待办 ${todo.length} 单`
                : `全平台 ${db.stores.length} 家门店 · ${db.orders.length} 单 · 待审核 ${reviewQueue.length} 单`}
            </div>
          </div>
          <button className="btn ghost" onClick={exportQuick}>
            <IconDownload size={14} /> 导出明细
          </button>
          <button className="btn primary" onClick={() => nav(isFitter ? '/orders' : '/analytics')}>
            <IconCube size={14} /> {isFitter ? '进入建模' : '查看统计'}
          </button>
        </div>

        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="lbl">{isFitter ? '我的订单' : '订单总量'}</div>
            <div className="val">{scoped.length}<small>单</small></div>
            <div className="sub">待建模 {counts.pending_model} · 待审核 {counts.pending_review}</div>
            <Spark values={series.map((s) => s.created)} />
          </div>
          <div className="stat">
            <div className="lbl">平均退回次数</div>
            <div className="val" style={{ color: returns / Math.max(1, scoped.length) > 0.8 ? '#e8624f' : '#e5b76a' }}>
              {(returns / Math.max(1, scoped.length)).toFixed(2)}
              <small>次 / 单</small>
            </div>
            <div className="sub">累计退回 {returns} 次</div>
            <Spark values={series.map((s) => s.returned)} color="#e8624f" />
          </div>
          <div className="stat">
            <div className="lbl">已交付</div>
            <div className="val" style={{ color: '#6ecf97' }}>{counts.delivered}<small>单</small></div>
            <div className="sub">已下单 {counts.ordered} · 退回待改 {counts.returned}</div>
            <Spark values={series.map((s) => s.delivered)} color="#6ecf97" />
          </div>
          <div className="stat">
            <div className="lbl">曲率超限版本</div>
            <div className="val" style={{ color: hotspots.length ? '#ff9f8d' : '#4fd1c5' }}>
              {hotspots.length}<small>个</small>
            </div>
            <div className="sub">{hotspots.length ? '需修形后提交' : '全部合规'}</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 14, gridTemplateColumns: '1.35fr 1fr' }}>
          <div className="panel">
            <div className="panel-head">
              <IconTrend size={14} />
              <h2>近 14 天订单趋势</h2>
              <div className="spacer" />
              <span className="tiny dim">交付 / 新建 / 退回</span>
            </div>
            <div className="panel-body">
              <AreaChart data={series} height={158} />
            </div>
          </div>

          {isFitter ? (
            <div className="panel">
              <div className="panel-head">
                <IconClock size={14} />
                <h2>待办订单</h2>
                <div className="spacer" />
                <span className="badge amber">{todo.length}</span>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {todo.length === 0 ? (
                  <div style={{ padding: 14 }}><div className="empty">没有待建模或退回的订单。</div></div>
                ) : (
                  todo.slice(0, 6).map((o) => (
                    <div
                      key={o.id}
                      className="row"
                      style={{ padding: '10px 14px', borderBottom: '1px solid rgba(26,39,53,0.5)', cursor: 'pointer' }}
                      onClick={() => nav(`/studio/${o.id}`)}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12.5 }}>{o.patient} <span className="chip">{o.ear === 'right' ? 'R' : 'L'}</span></div>
                        <div className="tiny mono dim">{o.code}</div>
                      </div>
                      {o.returns.length > 0 && <span className="badge red">退回 {o.returns.length}</span>}
                      <span className={`badge ${STATUS_META[o.status].tone}`}>{STATUS_META[o.status].label}</span>
                      <IconArrow size={12} />
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <IconShield size={14} />
                <h2>审核队列</h2>
                <div className="spacer" />
                <span className="badge amber">{reviewQueue.length}</span>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {reviewQueue.length === 0 ? (
                  <div style={{ padding: 14 }}><div className="empty">审核队列已清空。</div></div>
                ) : (
                  reviewQueue.slice(0, 6).map((o) => {
                    const v = o.versions[o.versions.length - 1];
                    const over = v.metrics.curvatureMax > v.threshold;
                    return (
                      <div
                        key={o.id}
                        className="row"
                        style={{ padding: '10px 14px', borderBottom: '1px solid rgba(26,39,53,0.5)', cursor: 'pointer' }}
                        onClick={() => nav(`/review/${o.id}`)}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12.5 }}>{o.patient}</div>
                          <div className="tiny dim">{db.stores.find((s) => s.id === o.storeId)?.name} · {db.users.find((u) => u.id === o.fitterId)?.name}</div>
                        </div>
                        {over && <span className="badge red"><IconAlert size={10} /> 超限</span>}
                        <span className="mono tiny dim">{relTime(o.updatedAt)}</span>
                        <IconArrow size={12} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <IconCube size={14} />
              <h2>门店订单量</h2>
              <div className="spacer" />
              <span className="tiny dim">平均退回次数</span>
            </div>
            <div className="panel-body">
              {sts.map((s) => {
                const store = db.stores.find((x) => x.id === s.storeId)!;
                const max = Math.max(1, ...sts.map((x) => x.orders));
                return (
                  <div className="bar-row" key={s.storeId} style={{ gridTemplateColumns: '104px 1fr 78px' }}>
                    <span className="nowrap">{store.name.replace('旗舰店', '').replace('中心店', '')}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(s.orders / max) * 100}%` }} />
                    </div>
                    <span className="bar-val">{s.orders} · {s.avgReturns.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <IconUser size={14} />
              <h2>验配师完成量</h2>
              <div className="spacer" />
              <span className="tiny dim">交付 / 订单</span>
            </div>
            <div className="panel-body">
              {fitters.slice(0, 6).map((f, i) => {
                const max = Math.max(1, ...fitters.map((x) => x.delivered));
                return (
                  <div className="bar-row" key={f.user.id} style={{ gridTemplateColumns: '88px 1fr 62px' }}>
                    <span className="mono tiny dim">{String(i + 1).padStart(2, '0')} {f.user.name}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(f.delivered / max) * 100}%` }} />
                    </div>
                    <span className="bar-val">{f.delivered}/{f.orders}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {lowStock.length > 0 && !isFitter && (
          <div className="notice warn" style={{ marginBottom: 12 }}>
            <IconAlert />
            <div>
              <b>{lowStock.map((m) => `${m.code} ${m.stock} 只`).join(' · ')}</b>{' '}
              低于 200 只安全库存，请在「材料规格」中补货，避免交期延误。
            </div>
          </div>
        )}

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <span className="tiny dim">
            数据保存在本机浏览器（localStorage）· 初始化于 {fmtDate(db.settings.seededAt)}
          </span>
          <button
            className="btn ghost sm"
            onClick={() => {
              resetDemo();
              toast('演示数据已重置', 'ok');
            }}
          >
            重置演示数据
          </button>
        </div>
      </div>
    </div>
  );
}
