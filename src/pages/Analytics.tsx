import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp, fmtDate, relTime } from '../store';
import { STATUS_META, THICKNESS_META } from '../types';
import type { OrderStatus } from '../types';
import {
  storeStats,
  statusCounts,
  thicknessDistribution,
  fitterStats,
  dailySeries,
  curvatureHotspots,
  last30,
} from '../lib/stats';
import { AreaChart, Donut, Spark } from '../components/Charts';
import { IconDownload, IconAlert, IconTrend, IconSheet, IconArrow } from '../components/Icons';
import { toast } from '../components/ui';
import { downloadText, toCsv } from '../lib/export';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS: Record<OrderStatus, string> = {
  pending_model: '#5d7085',
  pending_review: '#e5b76a',
  returned: '#e8624f',
  ordered: '#4fd1c5',
  delivered: '#6ecf97',
};

export default function Analytics() {
  const { db } = useApp();
  const nav = useNavigate();
  const [storeF, setStoreF] = useState<string>('all');
  const [range, setRange] = useState<30 | 60 | 90>(30);

  const scoped = useMemo(
    () => (storeF === 'all' ? db.orders : db.orders.filter((o) => o.storeId === storeF)),
    [db.orders, storeF],
  );

  const days = useMemo(
    () => scoped.filter((o) => new Date(o.createdAt).getTime() >= Date.now() - range * 86400000),
    [scoped, range],
  );

  const sts = useMemo(() => storeStats(db), [db]);
  const counts = useMemo(() => statusCounts(scoped), [scoped]);
  const walls = useMemo(() => thicknessDistribution(scoped), [scoped]);
  const fitters = useMemo(() => fitterStats(db, storeF === 'all' ? undefined : storeF), [db, storeF]);
  const series = useMemo(() => dailySeries(scoped, range), [scoped, range]);
  const hotspots = useMemo(() => curvatureHotspots(scoped), [scoped]);

  const totalReturns = scoped.reduce((a, o) => a + o.returns.length, 0);
  const avgReturns = scoped.length ? totalReturns / scoped.length : 0;
  const delivered = scoped.filter((o) => o.status === 'delivered');
  const onTime = delivered.filter((o) => new Date(o.updatedAt) <= new Date(o.dueAt)).length;
  const passRate = scoped.length
    ? scoped.filter((o) => o.returns.length === 0 && o.status !== 'pending_model').length /
      Math.max(1, scoped.filter((o) => o.status !== 'pending_model').length)
    : 0;

  const exportOrders = () => {
    downloadText(
      `AURIS-近30天订单明细-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        scoped
          .filter((o) => new Date(o.createdAt).getTime() >= Date.now() - 30 * 86400000)
          .map((o) => {
            const v = o.versions[o.versions.length - 1];
            const sub = [...o.events].reverse().find((e) => e.type === 'submitted');
            const apr = o.events.find((e) => e.type === 'approved');
            return {
              code: o.code,
              patient: o.patient,
              ear: o.ear === 'right' ? '右耳' : '左耳',
              store: db.stores.find((s) => s.id === o.storeId)?.name ?? '',
              fitter: db.users.find((u) => u.id === o.fitterId)?.name ?? '',
              material: db.materials.find((m) => m.id === o.materialId)?.code ?? '',
              status: STATUS_META[o.status].label,
              wall: v.wallThickness,
              adaptive: v.adaptive ? '自适应' : '等壁厚',
              version: v.seq,
              curvMax: v.metrics.curvatureMax.toFixed(3),
              curvThreshold: v.threshold.toFixed(2),
              overRatio: (v.metrics.overRatio * 100).toFixed(2),
              returns: o.returns.length,
              createdAt: o.createdAt.slice(0, 16).replace('T', ' '),
              submittedAt: sub ? sub.at.slice(0, 16).replace('T', ' ') : '',
              approvedAt: apr ? apr.at.slice(0, 16).replace('T', ' ') : '',
              dueAt: o.dueAt.slice(0, 10),
              note: o.versions.map((vv) => vv.note).join('; '),
            };
          }),
        [
          ['code', '订单号'],
          ['patient', '患者'],
          ['ear', '耳别'],
          ['store', '门店'],
          ['fitter', '验配师'],
          ['material', '材料'],
          ['status', '状态'],
          ['wall', '壁厚(mm)'],
          ['adaptive', '偏置方式'],
          ['version', '版本'],
          ['curvMax', '曲率峰值'],
          ['curvThreshold', '曲率阈值'],
          ['overRatio', '超限面积(%)'],
          ['returns', '退回次数'],
          ['createdAt', '创建时间'],
          ['submittedAt', '提交时间'],
          ['approvedAt', '审核通过'],
          ['dueAt', '交期'],
          ['note', '版本说明'],
        ],
      ),
      'text/csv',
    );
    toast('已导出近 30 天订单明细 CSV', 'ok');
  };

  const exportHot = () => {
    downloadText(
      `AURIS-曲率超限列表-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        hotspots.map((h) => ({
          code: h.order.code,
          patient: h.order.patient,
          store: db.stores.find((s) => s.id === h.order.storeId)?.name ?? '',
          fitter: db.users.find((u) => u.id === h.order.fitterId)?.name ?? '',
          status: STATUS_META[h.order.status].label,
          version: h.versionSeq,
          curvature: h.curvature.toFixed(3),
          threshold: h.order.versions[h.order.versions.length - 1].threshold.toFixed(2),
          overPct: (h.overBy * 100).toFixed(1),
          region: h.region,
          wall: h.wall,
          at: h.createdAt.slice(0, 16).replace('T', ' '),
        })),
        [
          ['code', '订单号'],
          ['patient', '患者'],
          ['store', '门店'],
          ['fitter', '验配师'],
          ['status', '状态'],
          ['version', '版本'],
          ['curvature', '曲率峰值'],
          ['threshold', '阈值'],
          ['overPct', '超出百分比(%)'],
          ['region', '区域'],
          ['wall', '壁厚(mm)'],
          ['at', '版本时间'],
        ],
      ),
      'text/csv',
    );
    toast(`已导出 ${hotspots.length} 条曲率超限记录`, 'ok');
  };

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div style={{ flex: 1 }}>
            <h1>统计与导出</h1>
            <div className="sub">按门店统计订单量、平均退回次数、壁厚分布与验配师完成量</div>
          </div>
          <select className="select" style={{ width: 190 }} value={storeF} onChange={(e) => setStoreF(e.target.value)}>
            <option value="all">全部门店</option>
            {db.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="seg">
            {[30, 60, 90].map((r) => (
              <button key={r} className={range === r ? 'on' : ''} onClick={() => setRange(r as 30 | 60 | 90)}>{r} 天</button>
            ))}
          </div>
          <button className="btn" onClick={exportOrders}>
            <IconDownload size={14} /> 订单明细
          </button>
          <button className="btn" onClick={exportHot}>
            <IconAlert size={14} /> 曲率超限
          </button>
        </div>

        <div className="grid-stats" style={{ marginBottom: 14 }}>
          <div className="stat">
            <div className="lbl">订单总量</div>
            <div className="val">{scoped.length}<small>单</small></div>
            <div className="sub">近 {range} 天新增 {days.length} 单</div>
            <Spark values={series.map((s) => s.created)} />
          </div>
          <div className="stat">
            <div className="lbl">平均退回次数</div>
            <div className="val" style={{ color: avgReturns > 0.8 ? '#e8624f' : '#e5b76a' }}>
              {avgReturns.toFixed(2)}
              <small>次 / 单</small>
            </div>
            <div className="sub">累计退回 {totalReturns} 次</div>
            <Spark values={series.map((s) => s.returned)} color="#e8624f" />
          </div>
          <div className="stat">
            <div className="lbl">一次通过率</div>
            <div className="val" style={{ color: '#4fd1c5' }}>
              {(passRate * 100).toFixed(1)}<small>%</small>
            </div>
            <div className="sub">未被退回的方案占比</div>
            <Spark values={series.map((s) => s.delivered)} color="#4fd1c5" />
          </div>
          <div className="stat">
            <div className="lbl">准交率</div>
            <div className="val" style={{ color: '#6ecf97' }}>
              {delivered.length ? ((onTime / delivered.length) * 100).toFixed(0) : '—'}<small>%</small>
            </div>
            <div className="sub">已交付 {delivered.length} 单 / 逾期 {delivered.length - onTime}</div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <IconTrend size={14} />
              <h2>订单趋势</h2>
              <div className="spacer" />
              <span className="tiny dim">实线 交付 · 虚线 新建 · 红点 退回</span>
            </div>
            <div className="panel-body">
              <AreaChart data={series} height={150} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head">
              <IconSheet size={14} />
              <h2>壁厚档位分布</h2>
              <div className="spacer" />
              <span className="tiny dim">按当前版本统计</span>
            </div>
            <div className="panel-body row" style={{ gap: 18, alignItems: 'center' }}>
              <Donut
                slices={walls.map((w) => ({ label: `${w.wall}mm`, value: w.count, color: ['#6aa6e8', '#4fd1c5', '#e5b76a', '#e8624f'][[0.8, 1.2, 1.6, 2.0].indexOf(w.wall)] }))}
                centerLabel="订单"
                centerValue={scoped.length}
              />
              <div className="donut-legend" style={{ flex: 1 }}>
                {walls.map((w, i) => {
                  const pct = scoped.length ? (w.count / scoped.length) * 100 : 0;
                  const col = ['#6aa6e8', '#4fd1c5', '#e5b76a', '#e8624f'][i];
                  return (
                    <div className="li" key={w.wall}>
                      <span className="sw" style={{ background: col }} />
                      <span>{w.wall.toFixed(1)} mm · {THICKNESS_META[w.wall]?.name}</span>
                      <span className="vv">{w.count} · {pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
                <div className="tiny dim" style={{ marginTop: 4, lineHeight: 1.5 }}>
                  自适应偏置订单 {scoped.filter((o) => o.versions[o.versions.length - 1].adaptive).length} 单，
                  平均实测壁厚 {(
                    scoped.reduce((a, o) => a + o.versions[o.versions.length - 1].metrics.wallMax, 0) /
                    Math.max(1, scoped.length)
                  ).toFixed(2)} mm
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 14, gridTemplateColumns: '1fr 1fr' }}>
          <div className="panel">
            <div className="panel-head">
              <IconTrend size={14} />
              <h2>门店订单量 & 退回率</h2>
            </div>
            <div className="panel-body">
              {sts.map((s) => {
                const store = db.stores.find((x) => x.id === s.storeId)!;
                return (
                  <div key={s.storeId} style={{ padding: '7px 0' }}>
                    <div className="row" style={{ justifyContent: 'space-between', fontSize: 11.5 }}>
                      <span>{store.name}</span>
                      <span className="mono tiny muted">
                        {s.orders} 单 · 退回 {s.avgReturns.toFixed(2)} 次/单
                      </span>
                    </div>
                    <div className="row" style={{ gap: 4, marginTop: 5 }}>
                      <div className="bar-track" style={{ flex: 1 }}>
                        <div className="bar-fill" style={{ width: `${(s.orders / Math.max(1, ...sts.map((x) => x.orders))) * 100}%` }} />
                      </div>
                      <div className="bar-track" style={{ flex: 0.5 }}>
                        <div
                          className="bar-fill red"
                          style={{ width: `${Math.min(100, s.avgReturns * 100)}%`, background: s.avgReturns > 0.8 ? undefined : '#5c7a92' }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <IconTrend size={14} />
              <h2>验配师完成量</h2>
              <div className="spacer" />
              <span className="tiny dim">订单 / 已交付</span>
            </div>
            <div className="panel-body">
              {fitters.slice(0, 8).map((f, i) => {
                const maxO = Math.max(1, ...fitters.map((x) => x.orders));
                return (
                  <div className="bar-row" key={f.user.id} style={{ gridTemplateColumns: '84px 1fr 62px' }}>
                    <span className="mono tiny dim">{String(i + 1).padStart(2, '0')} {f.user.name}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(f.orders / maxO) * 100}%` }} />
                    </div>
                    <span className="bar-val">{f.delivered}/{f.orders}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <IconAlert size={14} />
            <h2>曲率超限列表</h2>
            <span className="badge red">{hotspots.length}</span>
            <div className="spacer" />
            <button className="btn ghost sm" onClick={exportHot}>
              <IconDownload size={12} /> 导出 CSV
            </button>
          </div>
          {hotspots.length === 0 ? (
            <div style={{ padding: 16 }}><div className="empty">当前范围内没有曲率超限的版本。</div></div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>订单 / 患者</th>
                  <th>门店</th>
                  <th>验配师</th>
                  <th>状态</th>
                  <th>版本</th>
                  <th>曲率峰值</th>
                  <th>超出阈值</th>
                  <th>壁厚</th>
                  <th>版本时间</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hotspots.slice(0, 12).map((h, i) => (
                  <tr key={`${h.order.id}-${i}`} className="clickable" onClick={() => nav(`/review/${h.order.id}`)}>
                    <td>
                      <div className="cell-main">{h.order.patient}</div>
                      <div className="cell-sub mono">{h.order.code}</div>
                    </td>
                    <td className="small">{db.stores.find((s) => s.id === h.order.storeId)?.name}</td>
                    <td className="small">{db.users.find((u) => u.id === h.order.fitterId)?.name}</td>
                    <td><span className={`badge ${STATUS_META[h.order.status].tone}`}><i />{STATUS_META[h.order.status].label}</span></td>
                    <td className="mono">V{h.versionSeq}</td>
                    <td className="mono" style={{ color: '#ff9f8d' }}>{h.curvature.toFixed(2)}</td>
                    <td className="mono" style={{ color: '#e5b76a' }}>+{(h.overBy * 100).toFixed(0)}%</td>
                    <td className="mono">{h.wall.toFixed(1)}</td>
                    <td className="dim tiny">{relTime(h.createdAt)}</td>
                    <td><IconArrow size={12} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>状态分布与库存提醒</h2>
            <div className="spacer" />
            <span className="tiny dim">{fmtDate(new Date(Date.now() - 30 * 86400000).toISOString())} 至今</span>
          </div>
          <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              {(Object.keys(counts) as OrderStatus[]).map((k) => (
                <div key={k} className="bar-row" style={{ gridTemplateColumns: '76px 1fr 40px' }}>
                  <span>{STATUS_META[k].label}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(counts[k] / Math.max(1, scoped.length)) * 100}%`, background: STATUS_COLORS[k] }} />
                  </div>
                  <span className="bar-val">{counts[k]}</span>
                </div>
              ))}
            </div>
            <div>
              {db.materials.filter((m) => m.stock < m.minStock).map((m) => (
                <div key={m.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(26,39,53,0.5)' }}>
                  <span className="row" style={{ gap: 7 }}>
                    <IconAlert size={12} />
                    <span>{m.name}</span>
                    <span className="mono tiny dim">{m.code}</span>
                  </span>
                  <span className="mono tiny" style={{ color: '#ff9f8d' }}>{m.stock} / {m.minStock} 只</span>
                </div>
              ))}
              {db.materials.every((m) => m.stock >= m.minStock) && (
                <div className="notice ok"><IconSheet size={14} /><div>全部材料库存高于安全线（200 只）。</div></div>
              )}
              <div className="tiny dim" style={{ marginTop: 8 }}>
                共 {last30(scoped).length} 单近 30 天订单纳入导出明细。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
