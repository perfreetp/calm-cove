import React, { useMemo, useState } from 'react';
import PlanCanvas from './PlanCanvas.jsx';
import { batchView, fmtTime } from '../lib/store.js';
import { batchDerived, SEVERITY, STATUS_META } from '../lib/qc.js';
import { exportQcReport } from '../lib/exporters.js';



export default function BatchDetail({ state, batch, onBack, onDecide, onRelease, onReturn, onToast, ui, setUi }) {
  const [focusFindingId, setFocusFindingId] = useState(null);
  const [versionIdx, setVersionIdx] = useState(batch.submissions.length - 1);
  const [rejectDrafts, setRejectDrafts] = useState({});
  const [rejectErrors, setRejectErrors] = useState({});
  const [sideTab, setSideTab] = useState('see');
  const design = state.designs.find((d) => d.id === batch.submissions[0]?.designId);

  const view = batchView(batch);
  const latest = batch.submissions[versionIdx] ?? view.latestSub;

  const derived = useMemo(() => batchDerived(latest), [latest]);

  const severityCounts = useMemo(() => {
    const c = { serious: 0, general: 0, suggestion: 0 };
    for (const f of latest?.findings ?? []) c[f.severity] = (c[f.severity] ?? 0) + 1;
    return c;
  }, [latest]);

  const focusFinding = latest?.findings.find((f) => f.id === focusFindingId) ?? null;

  const submitReject = (f) => {
    const reason = (rejectDrafts[f.id] ?? '').trim();
    if (reason.length < 6) {
      setRejectErrors((e) => ({ ...e, [f.id]: '驳回必须填写不少于 6 个字的理由，说明判定依据。' }));
      return;
    }
    setRejectErrors((e) => ({ ...e, [f.id]: null }));
    onDecide(batch.id, latest.id, f.id, { decision: 'reject', reason });
    setRejectDrafts((d) => ({ ...d, [f.id]: '' }));
  };

  return (
    <div className="detail-layout">
      <div className="detail-main">
        <div className="detail-hd">
          <div className="row" style={{ gap: 10, marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}>← 批次列表</button>
            <span className="batch-code" style={{ fontSize: 12 }}>{batch.code}</span>
            <span className={`sev-badge ${STATUS_META[derived.status].tone}`}>{STATUS_META[derived.status].label}</span>
            <div style={{ flex: 1 }} />
            <button
              className="btn sm"
              onClick={() => {
                exportQcReport(batch, latest, design);
                onToast?.('质检报告已导出', 'ok');
              }}
            >
              ↓ 导出报告
            </button>
            <span className="dim mono" style={{ fontSize: 11 }}>提交 {fmtTime(latest?.submittedAt)}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 650 }}>{batch.title}</h2>
          {batch.submissions.length > 1 && (
            <div className="row" style={{ gap: 5, marginTop: 8 }}>
              {batch.submissions.map((sub, i) => {
                const dv = batchDerived(sub);
                return (
                  <button
                    key={sub.id}
                    className={`chip ${i === versionIdx ? 'on' : ''}`}
                    onClick={() => setVersionIdx(i)}
                  >
                    v{sub.version}
                    {dv.status === 'returned' && <span style={{ color: 'var(--danger)' }}>· 退回</span>}
                    {dv.status === 'approved' && <span style={{ color: 'var(--ok)' }}>· 放行</span>}
                    {dv.status === 'reviewing' && <span style={{ color: 'var(--accent)' }}>· 复核中</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="row" style={{ gap: 14, marginTop: 6, fontSize: 11.5, color: 'var(--ink-2)' }}>
            <span>图号 <b className="mono" style={{ color: 'var(--ink-1)' }}>{design?.code}</b></span>
            <span>设计员 <b style={{ color: 'var(--ink-1)' }}>{latest?.designer}</b></span>
            <span>复核员 <b style={{ color: 'var(--ink-1)' }}>{latest?.reviewer}</b></span>
            <span>版本 v{latest?.version}</span>
            <span>退回 <b className="mono">{view.returns}</b> 次</span>
          </div>
        </div>

        {design && (
          <div className="plan-band">
            <div className="pb-side">
              <div className="pb-metrics">
                {latest?.checks?.map((c) => (
                  <div key={c.key} className={`pb-tile ${c.pass ? 'pass' : c.severity}`}>
                    <div className="pbt-hd">
                      <span className="pbt-title">{c.title}</span>
                      {c.pass ? (
                        <span className="sev-badge ok">通过</span>
                      ) : (
                        <span className={`sev-badge ${c.severity}`}>{SEVERITY[c.severity].label}</span>
                      )}
                    </div>
                    <div className="pbt-std">{c.standard}</div>
                    <div className="pbt-val">
                      {metricOf(c.key, latest)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pb-canvas">
              <PlanCanvas
                compact
                design={design}
                mode="night"
                cell={0.75}
                showHeat
                showContour
                showShadow
                showZones
                showLabels={false}
                selectedLampId={null}
                onSelectLamp={() => {}}
                target={150}
                focusZone={
                  focusFinding?.locus
                    ? { bbox: { x: focusFinding.locus.x - 3, y: focusFinding.locus.y - 3, w: 6, h: 6 } }
                    : null
                }
              />
              <div className="plan-band-hd">
                <span className="dim mono">
                  夜间工况 · 0.75 m 网格 · {focusFinding ? `定位至 ${focusFinding.id}` : '全库视图'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="detail-scroll">
          {/* 四项检查 */}
          {latest?.checks?.map((c) => (
            <div key={c.key} className="check-block">
              <div className="check-hd">
                <span className="ch-title">{c.title}</span>
                <span className="ch-std">{c.standard}</span>
                <div className="ch-pass">
                  {c.pass ? (
                    <span className="sev-badge ok">通过</span>
                  ) : (
                    <span className={`sev-badge ${c.severity}`}>
                      {SEVERITY[c.severity].label} · {c.findings.length} 项
                    </span>
                  )}
                </div>
              </div>
              {c.pass && <div className="tooltip-note" style={{ marginBottom: 6 }}>该项检查全部指标满足规范限值，无需复核。</div>}
              {c.findings.map((f) => (
                <FindingRow
                  key={f.id}
                  finding={f}
                  decision={latest.decisions[f.id]}
                  focused={focusFindingId === f.id}
                  onFocus={() => setFocusFindingId(f.id)}
                  onDecide={(payload) => onDecide(batch.id, latest.id, f.id, payload)}
                  rejectDraft={rejectDrafts[f.id] ?? ''}
                  rejectError={rejectErrors[f.id]}
                  setRejectDraft={(v) => setRejectDrafts((d) => ({ ...d, [f.id]: v }))}
                  onSubmitReject={() => submitReject(f)}
                  locked={!!latest.returnedAt || !!latest.releasedAt}
                />
              ))}
            </div>
          ))}

          {latest?.findings.length === 0 && (
            <div className="empty">
              <span className="e-icon">✓</span>
              四项检查全部通过，无问题条目。<br />
              可直接放行出版。
            </div>
          )}
        </div>
      </div>

      {/* 右侧：平面图 + 汇总 */}
      <aside className="detail-side">
        <div className="subtabs">
          <button className={`subtab ${sideTab === 'see' ? 'active' : ''}`} onClick={() => setSideTab('see')}>复核记录</button>
          <button className={`subtab ${sideTab === 'verdict' ? 'active' : ''}`} onClick={() => setSideTab('verdict')}>判定与放行</button>
        </div>

        <div className="scroll-y" style={{ padding: '11px 12px' }}>
          {sideTab === 'see' && (
            <>
              <div className="side-title">待判定问题（{derived.pending.length}）</div>
              {derived.pending.length === 0 && <div className="tooltip-note">全部问题已有结论。</div>}
              {derived.pending.map((f) => (
                <div
                  key={f.id}
                  className={`finding-card ${f.severity} ${focusFindingId === f.id ? 'focused' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setFocusFindingId(f.id)}
                >
                  <div className="fc-hd">
                    <span className={`sev-badge ${f.severity}`}>{SEVERITY[f.severity].label}</span>
                    <span className="fc-title">{f.title}</span>
                  </div>
                  {f.locus && <div className="fc-meta">◎ ({f.locus.x.toFixed(1)}, {f.locus.y.toFixed(1)}) m</div>}
                </div>
              ))}

              <div className="side-title" style={{ marginTop: 14 }}>已确认属实（{derived.confirmed.length}）</div>
              {derived.confirmed.length === 0 && <div className="tooltip-note">暂无确认属实的问题。</div>}
              {derived.confirmed.map((f) => (
                <div key={f.id} className="finding-card serious" style={{ cursor: 'pointer' }} onClick={() => setFocusFindingId(f.id)}>
                  <div className="fc-hd">
                    <span className="sev-badge danger">属实</span>
                    <span className="fc-title" style={{ fontSize: 11.5 }}>{f.title}</span>
                  </div>
                  <div className="fc-meta">
                    <span>{latest.decisions[f.id]?.by}</span>
                    {latest.decisions[f.id]?.rectified && <span style={{ color: 'var(--ok)' }}>已整改</span>}
                  </div>
                </div>
              ))}

              <div className="side-title" style={{ marginTop: 14 }}>已驳回（{derived.rejected.length}）</div>
              {derived.rejected.length === 0 && <div className="tooltip-note">暂无驳回记录。</div>}
              {derived.rejected.map((f) => (
                <div key={f.id} className="finding-card suggestion" style={{ cursor: 'pointer' }} onClick={() => setFocusFindingId(f.id)}>
                  <div className="fc-hd">
                    <span className="sev-badge ok">驳回</span>
                    <span className="fc-title" style={{ fontSize: 11.5 }}>{f.title}</span>
                  </div>
                  <div className="fc-body" style={{ fontSize: 10.5 }}>
                    理由：{latest.decisions[f.id]?.reason}
                  </div>
                </div>
              ))}
            </>
          )}

          {sideTab === 'verdict' && (
            <>
              <div className="side-title">复核进度</div>
              <div className="kv"><span>已判定</span><span>{derived.decidedCount} / {derived.totalFindings}</span></div>
              <div className="kv"><span>确认属实</span><span style={{ color: 'var(--danger)' }}>{derived.confirmed.length}</span></div>
              <div className="kv"><span>驳回</span><span style={{ color: 'var(--ok)' }}>{derived.rejected.length}</span></div>
              <div className="kv"><span>待判定</span><span style={{ color: 'var(--warn)' }}>{derived.pending.length}</span></div>
              <div className="kv"><span>确认的严重问题</span><span style={{ color: 'var(--danger)', fontWeight: 700 }}>{derived.confirmedSerious.length}</span></div>
              <div className="kv"><span>四项检查通过</span><span>{derived.checksPassed} / {derived.checkTotal}</span></div>
              <div className="kv"><span>检查通过率</span><span>{(derived.passRate * 100).toFixed(0)}%</span></div>

              <div className="side-title" style={{ marginTop: 14 }}>判定结论</div>
              {derived.confirmedSerious.length > 0 && (
                <div className="tooltip-note" style={{ borderColor: 'var(--danger)', color: '#ffb9b9', lineHeight: 1.65 }}>
                  已确认 <b>{derived.confirmedSerious.length}</b> 项严重问题属实，按规则本批次须整批退回设计方。
                </div>
              )}
              {derived.confirmedSerious.length === 0 && derived.pending.length > 0 && (
                <div className="tooltip-note" style={{ borderColor: 'var(--warn)', color: '#ffd8a1', lineHeight: 1.65 }}>
                  尚有 <b>{derived.pending.length}</b> 项问题未判定，须逐条确认或驳回后方可放行。
                </div>
              )}
              {(derived.status === 'ready' || derived.status === 'approved') && (
                <div className="tooltip-note" style={{ borderColor: 'var(--ok)', color: '#b6f0d3', lineHeight: 1.65 }}>
                  全部问题已闭环且无确认的严重问题，本批次满足放行条件。
                </div>
              )}

              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {derived.confirmedSerious.length > 0 && !latest.returnedAt && (
                  <button className="btn danger" onClick={() => onReturn(batch.id)}>
                    整批退回设计方（{derived.confirmedSerious.length} 项严重）
                  </button>
                )}
                {latest.returnedAt && (
                  <div className="sev-badge danger" style={{ padding: '6px 9px', justifyContent: 'center' }}>
                    本版本已退回设计方，等待修订稿重新送审
                  </div>
                )}
                <button className="btn ok" disabled={!derived.canRelease} onClick={() => onRelease(batch.id)}>
                  {latest.releasedAt ? '已放行出版' : '放行出版'}
                </button>
              </div>

              {latest.returnReason && (
                <div className="tooltip-note" style={{ marginTop: 10, lineHeight: 1.65 }}>
                  <div className="label" style={{ marginBottom: 3 }}>退回记录</div>
                  {latest.returnReason}
                  <div className="dim" style={{ marginTop: 3 }}>{latest.returnedBy} · {fmtTime(latest.returnedAt)}</div>
                </div>
              )}
              {latest.releasedAt && (
                <div className="tooltip-note" style={{ marginTop: 10, borderColor: 'var(--ok)', lineHeight: 1.65 }}>
                  已由 {latest.releasedBy} 于 {fmtTime(latest.releasedAt)} 放行出版。
                </div>
              )}
            </>
          )}
        </div>

        {/* 统计条 */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--line)', padding: '9px 12px', background: 'var(--bg-0)' }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="sev-badge serious">严重 {severityCounts.serious}</span>
            <span className="sev-badge general">一般 {severityCounts.general}</span>
            <span className="sev-badge suggestion">建议 {severityCounts.suggestion}</span>
            <span className="grow" />
            <span className="dim mono" style={{ fontSize: 10.5 }}>通过率 {(derived.passRate * 100).toFixed(0)}%</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function metricOf(key, sub) {
  const m = sub?.metrics;
  if (!m) return '—';
  if (key === 'spacing') return `最近邻 ${m.minNN?.toFixed(2) ?? '—'} m`;
  if (key === 'aisle') {
    const worst = (m.aisleAvg ?? []).reduce((a, b) => (b.avg < a.avg ? b : a), m.aisleAvg?.[0] ?? { avg: 0 });
    return `最低通道 ${Math.round(worst.avg)} lx`;
  }
  if (key === 'emergency') return `覆盖率 ${((m.coverage ?? 0) * 100).toFixed(1)}%`;
  if (key === 'glare') return `UGR ${m.ugr?.toFixed(1) ?? '—'}`;
  return '—';
}

function FindingRow({ finding, decision, focused, onFocus, onDecide, rejectDraft, rejectError, setRejectDraft, onSubmitReject, locked }) {
  const [open, setOpen] = useState(false);
  const decided = !!decision;
  return (
    <div className={`finding-row ${finding.severity} ${focused ? 'focused' : ''}`}>
      <div className="fr-body">
        <div className="fr-hd">
          <span className={`sev-badge ${finding.severity}`}>{SEVERITY[finding.severity].label}</span>
          <span className="mono dim" style={{ fontSize: 10 }}>{finding.id}</span>
          <span className="fr-title">{finding.title}</span>
          <span className="grow" />
          {decided ? (
            <span className={`sev-badge ${decision.decision === 'confirm' ? 'danger' : 'ok'}`}>
              {decision.decision === 'confirm' ? '✓ 属实' : '✕ 已驳回'}
            </span>
          ) : (
            <span className="sev-badge neutral">待判定</span>
          )}
        </div>
        <div className="fr-detail">{finding.detail}</div>
        {finding.locus && (
          <div className="fr-locus" onClick={onFocus}>
            ◎ 定位 ({finding.locus.x.toFixed(1)}, {finding.locus.y.toFixed(1)})
          </div>
        )}

        {decision && (
          <div className={`fr-verdict ${decision.decision}`}>
            <div className="v-hd">
              <span style={{ color: decision.decision === 'confirm' ? 'var(--danger)' : 'var(--ok)' }}>
                {decision.decision === 'confirm' ? '复核确认属实' : '复核驳回'}
              </span>
              <span className="dim mono" style={{ fontSize: 10, fontWeight: 400 }}>
                {decision.by} · {fmtTime(decision.at)}
              </span>
            </div>
            {decision.reason && <div className="v-reason">{decision.reason}</div>}
            {decision.decision === 'confirm' && (
              <div className="row" style={{ gap: 6, marginTop: 5 }}>
                <button
                  className="btn xs"
                  onClick={() => onDecide({ decision: 'confirm', rectified: !decision.rectified })}
                >
                  {decision.rectified ? '↺ 标记为未整改' : '✓ 标记已整改'}
                </button>
                {decision.rectified && <span className="sev-badge ok">已整改</span>}
              </div>
            )}
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <button className="btn xs ghost" onClick={() => onDecide({ decision: decision.decision, confirmedAs: decision.decision === 'confirm' ? 'reject' : 'confirm' })}>
                撤销判定
              </button>
            </div>
          </div>
        )}

        {!decision && locked && (
          <div className="tooltip-note" style={{ marginTop: 8 }}>
            本版本已{`退回`}，判定已锁定；请待设计方提交修订稿后重新复核。
          </div>
        )}

        {!decision && !locked && (
          <>
            <div className="fr-actions">
              <button className="btn sm danger" onClick={() => onDecide({ decision: 'confirm' })}>
                确认属实
              </button>
              <button className="btn sm" onClick={() => setOpen((v) => !v)}>
                驳回并填写理由
              </button>
              {finding.refs?.lamps?.length > 0 && (
                <span className="dim" style={{ fontSize: 10.5, fontFamily: 'var(--mono)' }}>
                  涉及 {finding.refs.lamps.length} 盏灯具
                </span>
              )}
            </div>
            {open && (
              <div className="reject-form">
                <textarea
                  placeholder="填写驳回理由：说明为何该检查项判定不成立（如工况假设、规范适用性、现场条件等），不少于 6 字。"
                  value={rejectDraft}
                  onChange={(e) => setRejectDraft(e.target.value)}
                />
                {rejectError && <div className="rf-hint err">{rejectError}</div>}
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm primary" onClick={onSubmitReject}>提交驳回</button>
                  <button className="btn sm ghost" onClick={() => setOpen(false)}>取消</button>
                  <span className="rf-hint">驳回理由将写入复核记录，不可留空。</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
