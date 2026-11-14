import React, { useMemo } from 'react';
import { batchView, fmtTime } from '../lib/store.js';
import { STATUS_META } from '../lib/qc.js';

const toneColor = {
  neutral: '#8698ad',
  accent: '#4ea8de',
  danger: '#ef5b5b',
  ok: '#52b788',
};

export default function BatchList({ state, onOpenBatch, onCreateBatch }) {
  const rows = useMemo(
    () =>
      state.batches.map((b) => ({
        batch: b,
        v: batchView(b),
        design: state.designs.find(
          (d) => d.id === b.submissions[b.submissions.length - 1]?.designId
        ),
      })),
    [state.batches, state.designs]
  );

  const totals = useMemo(() => {
    const n = rows.length;
    const returned = rows.filter((r) => r.v.status === 'returned').length;
    const approved = rows.filter((r) => r.v.status === 'approved').length;
    const pending = rows.filter((r) => r.v.pendingCount > 0).length;
    const avgPass = n ? rows.reduce((a, r) => a + r.v.passRate, 0) / n : 0;
    return { n, returned, approved, pending, avgPass };
  }, [rows]);

  return (
    <div className="batch-layout">
      <div className="batch-hd">
        <div>
          <h1 className="page-title">图纸质检批次</h1>
          <div className="page-sub">
            {state.hall.name} · 照明施工图 · 四项检查（间距 / 通道照度 / 应急覆盖 / 眩光）
          </div>
        </div>
        <div className="summary-pills">
          <div className="pill">
            <span className="p-val">{totals.n}</span>
            <span className="p-lbl">在办批次</span>
          </div>
          <div className="pill">
            <span className="p-val" style={{ color: 'var(--ok)' }}>{(totals.avgPass * 100).toFixed(0)}%</span>
            <span className="p-lbl">平均通过率</span>
          </div>
          <div className="pill">
            <span className="p-val" style={{ color: 'var(--danger)' }}>{totals.returned}</span>
            <span className="p-lbl">已退回</span>
          </div>
          <div className="pill">
            <span className="p-val" style={{ color: 'var(--accent)' }}>{totals.pending}</span>
            <span className="p-lbl">待处理问题</span>
          </div>
          <button className="btn primary" style={{ alignSelf: 'center' }} onClick={onCreateBatch}>
            + 新建质检批次
          </button>
        </div>
      </div>

      <div className="batch-body">
        <table className="batch-table">
          <thead>
            <tr>
              <th style={{ width: 118 }}>批次号</th>
              <th>批次 / 送审图</th>
              <th style={{ width: 128 }}>当前处理人</th>
              <th style={{ width: 172 }}>检查通过率</th>
              <th style={{ width: 72 }}>退回次数</th>
              <th style={{ width: 96 }}>问题</th>
              <th style={{ width: 96 }}>状态</th>
              <th style={{ width: 104 }}>提交时间</th>
              <th style={{ width: 92 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ batch, v, design }) => {
              const latestSub = v.latestSub;
              const pass = v.passRate;
              const passColor = pass >= 0.99 ? '#52b788' : pass >= 0.5 ? '#e9a13b' : '#ef5b5b';
              return (
                <tr key={batch.id} onClick={() => onOpenBatch(batch.id)}>
                  <td>
                    <div className="batch-code">{batch.code}</div>
                    <div className="batch-sub">{batch.submissions.length} 版</div>
                  </td>
                  <td>
                    <div className="batch-title">{batch.title}</div>
                    <div className="batch-sub">
                      {design?.code ?? '—'} · {design?.name.split('·').pop().trim() ?? ''} · 设计员 {latestSub?.designer}
                    </div>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="avatar" style={{ width: 20, height: 20, fontSize: 10 }}>
                        {(v.assignee ?? '—').slice(0, 1)}
                      </span>
                      <span>{v.assignee}</span>
                    </div>
                  </td>
                  <td>
                    <div className="passbar-wrap">
                      <div className="passbar">
                        <div className="passbar-fill" style={{ width: `${Math.round(pass * 100)}%`, background: passColor }} />
                      </div>
                      <span className="pass-pct" style={{ color: passColor }}>{(pass * 100).toFixed(0)}%</span>
                    </div>
                    <div className="batch-sub">
                      {v.latest?.d.checksPassed}/{v.latest?.d.checkTotal} 项检查通过
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ color: v.returns > 0 ? 'var(--danger)' : 'var(--ink-2)' }}>
                      {v.returns}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {v.confirmedSerious > 0 && <span className="sev-badge serious">严重 {v.confirmedSerious}</span>}
                      {v.pendingCount > 0 && <span className="sev-badge neutral">待定 {v.pendingCount}</span>}
                      {v.pendingCount === 0 && v.confirmedSerious === 0 && <span className="sev-badge ok">已闭环</span>}
                    </div>
                  </td>
                  <td>
                    <span className={`sev-badge ${STATUS_META[v.status].tone}`}>{STATUS_META[v.status].label}</span>
                  </td>
                  <td className="mono" style={{ fontSize: 11, color: 'var(--ink-2)' }}>
                    {fmtTime(latestSub?.submittedAt)}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={(e) => { e.stopPropagation(); onOpenBatch(batch.id); }}
                    >
                      复核 →
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div className="panel" style={{ flex: 1, minWidth: 300, padding: 12 }}>
            <div className="label" style={{ marginBottom: 7 }}>放行规则</div>
            <div className="tooltip-note" style={{ borderStyle: 'solid', lineHeight: 1.7 }}>
              任一「严重」问题经复核确认属实 → <b style={{ color: 'var(--danger)' }}>整批退回设计方</b>，退回次数 +1；<br />
              全部问题逐条确认或驳回（驳回须填写原因）且无确认的严重问题 → 方可 <b style={{ color: 'var(--ok)' }}>放行出版</b>。
            </div>
          </div>
          <div className="panel" style={{ flex: 1, minWidth: 300, padding: 12 }}>
            <div className="label" style={{ marginBottom: 7 }}>通过率口径</div>
            <div className="tooltip-note" style={{ borderStyle: 'solid', lineHeight: 1.7 }}>
              通过率 = 该批次各送审版本中四项检查通过项数的均值。四项检查分别为灯具间距、检修通道照度、应急回路覆盖与眩光指数。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
