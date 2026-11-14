import React, { useCallback, useMemo, useState } from 'react';
import DesignWorkbench from './components/DesignWorkbench.jsx';
import BatchList from './components/BatchList.jsx';
import BatchDetail from './components/BatchDetail.jsx';
import CompareView from './components/CompareView.jsx';
import { loadState, saveState, resetState, snapshotChecks, fmtTime, REVIEWER, nowISO } from './lib/store.js';
import { batchView } from './lib/store.js';
import { STATUS_META } from './lib/qc.js';

export default function App() {
  const [state, setState] = useState(() => loadState());
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  React.useEffect(() => {
    saveState(state);
  }, [state]);

  const showToast = useCallback((msg, tone = 'info') => {
    setToast({ msg, tone, id: Date.now() });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const ui = state.ui;
  const setUi = useCallback((patch) => {
    setState((s) => ({ ...s, ui: typeof patch === 'function' ? patch(s.ui) : { ...s.ui, ...patch } }));
  }, []);

  const design = state.designs.find((d) => d.id === ui.designId) ?? state.designs[0];

  const setDesign = useCallback(
    (fn) => {
      setState((s) => ({
        ...s,
        designs: s.designs.map((d) => (d.id === s.ui.designId ? { ...fn(d), updatedAt: nowISO() } : d)),
      }));
    },
    []
  );

  const resetLamps = useCallback(() => {
    setDesign((d) => ({ ...d, lamps: d.lamps.map((l) => ({ ...l })) }));
  }, [setDesign]);

  // 提交图纸 → 新建送审版本
  const submitToBatch = useCallback(() => {
    setModal({ kind: 'submit', design });
  }, [design]);

  const doSubmit = useCallback(
    ({ batchId, reviewer, note }) => {
      const snap = snapshotChecks(design);
      setState((s) => {
        const newSub = {
          id: `SB-${Date.now().toString(36)}`,
          designId: design.id,
          version: design.rev,
          designer: design.designer,
          reviewer,
          submittedAt: nowISO(),
          returnCount: 0,
          decisions: {},
          note,
          ...snap,
        };
        let batches;
        if (batchId === 'new') {
          const n = s.batches.length + 1;
          batches = [
            ...s.batches,
            {
              id: `BT-${String(41 + n).padStart(3, '0')}`,
              code: `Q-2026-0${41 + n}`,
              title: `${design.name.split('·').pop().trim()} · ${design.code} 送审`,
              hallId: design.room.id,
              createdAt: nowISO(),
              dueAt: nowISO(),
              submissions: [newSub],
            },
          ];
        } else {
          batches = s.batches.map((b) =>
            b.id === batchId ? { ...b, submissions: [...b.submissions, newSub] } : b
          );
        }
        const targetBatch = batches.find((b) => b.submissions.includes(newSub));
        return { ...s, batches, ui: { ...s.ui, tab: 'batches', batchId: targetBatch.id } };
      });
      setModal(null);
      showToast(`已提交至质检批次，共 ${snap.findings.length} 项问题待复核`, 'ok');
    },
    [design, showToast]
  );

  const decide = useCallback(
    (batchId, subId, findingId, payload) => {
      let autoReturn = null;
      setState((s) => ({
        ...s,
        batches: s.batches.map((b) => {
          if (b.id !== batchId) return b;
          const subs = b.submissions.map((sub) => {
            if (sub.id !== subId) return sub;
            // 已退回 / 已放行的版本锁定，不再接受判定
            if (sub.returnedAt || sub.releasedAt) return sub;
            if (payload.confirmedAs) {
              const next = { ...sub.decisions };
              delete next[findingId];
              return { ...sub, decisions: next };
            }
            const finding = sub.findings.find((f) => f.id === findingId);
            const decisions = {
              ...sub.decisions,
              [findingId]: {
                ...sub.decisions[findingId],
                decision: payload.decision,
                reason: payload.reason ?? sub.decisions[findingId]?.reason ?? '',
                rectified: payload.rectified ?? sub.decisions[findingId]?.rectified ?? false,
                by: REVIEWER.name,
                at: nowISO(),
              },
            };
            // 规则：任一项「严重」问题确认属实 → 整批退回设计方
            if (payload.decision === 'confirm' && finding?.severity === 'serious') {
              autoReturn = finding;
              return {
                ...sub,
                decisions,
                returnCount: (sub.returnCount ?? 0) + 1,
                returnedAt: nowISO(),
                returnedBy: REVIEWER.name,
                returnReason: `复核确认严重问题「${finding.title}」，按规则整批退回设计方修订。`,
              };
            }
            return { ...sub, decisions };
          });
          return { ...b, submissions: subs };
        }),
      }));
      if (autoReturn) {
        showToast(`确认严重问题属实：${autoReturn.title} —— 本批次已整批退回设计方`, 'danger');
      } else if (payload.decision === 'confirm') {
        showToast('已确认该问题属实', 'danger');
      } else if (payload.decision === 'reject') {
        showToast('已驳回该问题，驳回理由已记录', 'ok');
      }
    },
    [showToast]
  );

  const returnBatch = useCallback(
    (batchId) => {
      setModal({ kind: 'return', batchId });
    },
    []
  );

  const doReturn = useCallback(
    ({ batchId, reason }) => {
      setState((s) => ({
        ...s,
        batches: s.batches.map((b) => {
          if (b.id !== batchId) return b;
          return {
            ...b,
            submissions: b.submissions.map((sub, i) =>
              i === b.submissions.length - 1
                ? {
                    ...sub,
                    returnCount: (sub.returnCount ?? 0) + 1,
                    returnReason: reason,
                    returnedAt: nowISO(),
                    returnedBy: REVIEWER.name,
                  }
                : sub
            ),
          };
        }),
      }));
      setModal(null);
      showToast('整批已退回设计方，退回次数 +1', 'danger');
    },
    [showToast]
  );

  const releaseBatch = useCallback(
    (batchId) => {
      setState((s) => ({
        ...s,
        batches: s.batches.map((b) => {
          if (b.id !== batchId) return b;
          return {
            ...b,
            submissions: b.submissions.map((sub, i) =>
              i === b.submissions.length - 1
                ? { ...sub, releasedAt: nowISO(), releasedBy: REVIEWER.name }
                : sub
            ),
          };
        }),
      }));
      showToast('批次已放行出版', 'ok');
    },
    [showToast]
  );

  const openBatch = useCallback(
    (id) => setUi({ tab: 'batch-detail', batchId: id }),
    [setUi]
  );

  const batch = state.batches.find((b) => b.id === ui.batchId) ?? state.batches[0];
  const attention = useMemo(
    () => state.batches.reduce((a, b) => a + batchView(b).pendingCount, 0),
    [state.batches]
  );

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">LCD</div>
          <div className="brand-text">
            <div className="brand-title">车辆段检修库照明设计</div>
            <div className="brand-sub">Lighting Layout & Drawing QA</div>
          </div>
        </div>

        <div className="tabs">
          <button className={`tab ${ui.tab === 'design' ? 'active' : ''}`} onClick={() => setUi({ tab: 'design' })}>
            布光工作台
          </button>
          <button
            className={`tab ${ui.tab === 'batches' || ui.tab === 'batch-detail' ? 'active' : ''}`}
            onClick={() => setUi({ tab: 'batches' })}
          >
            质检批次
            {attention > 0 && <span className="badge-n">{attention}</span>}
          </button>
          <button className={`tab ${ui.tab === 'compare' ? 'active' : ''}`} onClick={() => setUi({ tab: 'compare' })}>
            方案比照
          </button>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-meta">
          <span>{state.hall.name} · {state.hall.w}×{state.hall.h} m · 净高 {state.hall.ceiling} m</span>
          <span className="dim">|</span>
          <span>
            {design?.code} · v{design?.rev} · 更新 {fmtTime(design?.updatedAt)}
          </span>
        </div>

        <div className="user-chip">
          <span className="avatar">{REVIEWER.name.slice(0, 1)}</span>
          <span>{REVIEWER.name}</span>
          <span className="dim" style={{ fontSize: 10.5 }}>{REVIEWER.role}</span>
        </div>
        <button
          className="btn ghost sm"
          title="恢复初始数据"
          onClick={() => {
            if (confirm('恢复初始演示数据？当前编辑将丢失。')) {
              resetState();
              setState(loadState());
              showToast('已恢复初始数据', 'ok');
            }
          }}
        >
          ⟲
        </button>
      </header>

      <main className="main">
        {ui.tab === 'design' && (
          <DesignWorkbench
            state={state}
            design={design}
            setDesign={setDesign}
            ui={ui}
            setUi={setUi}
            onToast={showToast}
            onSubmit={() => submitToBatch()}
          />
        )}
        {ui.tab === 'batches' && (
          <BatchList
            state={state}
            onOpenBatch={openBatch}
            onCreateBatch={() => setModal({ kind: 'new-batch' })}
          />
        )}
        {ui.tab === 'batch-detail' && batch && (
          <BatchDetail
            state={state}
            batch={batch}
            onBack={() => setUi({ tab: 'batches' })}
            onDecide={decide}
            onRelease={releaseBatch}
            onReturn={returnBatch}
            onToast={showToast}
            ui={ui}
            setUi={setUi}
          />
        )}
        {ui.tab === 'compare' && (
          <CompareView state={state} ui={ui} setUi={setUi} onToast={showToast} />
        )}
      </main>

      {modal?.kind === 'submit' && (
        <SubmitModal
          state={state}
          design={modal.design}
          onClose={() => setModal(null)}
          onSubmit={doSubmit}
        />
      )}
      {modal?.kind === 'return' && (
        <ReturnModal onClose={() => setModal(null)} onSubmit={(reason) => doReturn({ batchId: modal.batchId, reason })} />
      )}
      {modal?.kind === 'new-batch' && (
        <NewBatchModal
          state={state}
          onClose={() => setModal(null)}
          onCreate={(payload) => {
            setState((s) => ({
              ...s,
              batches: [
                ...s.batches,
                {
                  id: `BT-${Date.now().toString(36)}`,
                  code: payload.code,
                  title: payload.title,
                  hallId: s.hall.id,
                  createdAt: nowISO(),
                  dueAt: nowISO(),
                  submissions: [],
                },
              ],
              ui: { ...s.ui, tab: 'batches' },
            }));
            setModal(null);
            showToast('批次已创建，请在布光工作台提交图纸', 'ok');
          }}
        />
      )}

      {toast && <div className={`toast ${toast.tone}`}>{toast.msg}</div>}
    </div>
  );
}

/* ───────── 模态 ───────── */

function SubmitModal({ state, design, onClose, onSubmit }) {
  const [batchId, setBatchId] = useState(state.batches[0]?.id ?? 'new');
  const [reviewer, setReviewer] = useState(REVIEWER.name);
  const [note, setNote] = useState('');
  const [snap] = useState(() => snapshotChecks(design));
  const counts = { serious: 0, general: 0, suggestion: 0 };
  for (const f of snap.findings) counts[f.severity]++;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          提交图纸至质检批次
        </div>
        <div className="modal-bd">
          <div className="kv"><span>图号</span><span>{design.code}</span></div>
          <div className="kv"><span>方案</span><span>{design.name}</span></div>
          <div className="kv"><span>灯具</span><span>{design.lamps.length} 盏（应急 {design.lamps.filter((l) => l.emergency).length} 盏）</span></div>
          <div className="kv" style={{ paddingBottom: 8, borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
            <span>预检结果</span>
            <span>
              <span className="sev-badge serious" style={{ marginRight: 4 }}>严重 {counts.serious}</span>
              <span className="sev-badge general" style={{ marginRight: 4 }}>一般 {counts.general}</span>
              <span className="sev-badge suggestion">建议 {counts.suggestion}</span>
            </span>
          </div>
          <div className="field-row" style={{ gridTemplateColumns: '70px 1fr' }}>
            <label>目标批次</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ width: '100%', textAlign: 'left' }}>
              <option value="new">＋ 新建批次</option>
              {state.batches.map((b) => (
                <option key={b.id} value={b.id}>{b.code} · {b.title}</option>
              ))}
            </select>
          </div>
          <div className="field-row" style={{ gridTemplateColumns: '70px 1fr' }}>
            <label>复核员</label>
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} style={{ width: '100%', textAlign: 'left' }}>
              {['周敏', '罗建', '陈立群'].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 8 }}>
            <div className="label" style={{ marginBottom: 5 }}>送审说明</div>
            <textarea
              style={{ width: '100%', minHeight: 62, resize: 'vertical' }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="说明本轮修改内容、遗留问题或需要复核员注意的事项…"
            />
          </div>
          <div className="tooltip-note" style={{ marginTop: 10 }}>
            提交后冻结当前四项检查结果（灯具间距 / 检修通道照度 / 应急回路覆盖 / 眩光指数）与问题清单，进入复核流程。
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => onSubmit({ batchId, reviewer, note })}>
            确认提交
          </button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState(null);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd" style={{ color: 'var(--danger)' }}>整批退回设计方</div>
        <div className="modal-bd">
          <div className="tooltip-note" style={{ borderColor: 'var(--danger)', lineHeight: 1.7, marginBottom: 10 }}>
            批次内已确认存在「严重」问题，按规则整批退回。退回次数将 +1，并通知设计方修订。
          </div>
          <div className="label" style={{ marginBottom: 5 }}>退回说明</div>
          <textarea
            style={{ width: '100%', minHeight: 88, resize: 'vertical' }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="概述退回原因与整改要求…"
          />
          {err && <div className="rf-hint err" style={{ color: 'var(--danger)', fontSize: 11, marginTop: 5 }}>{err}</div>}
        </div>
        <div className="modal-ft">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button
            className="btn danger"
            onClick={() => {
              if (reason.trim().length < 4) { setErr('请填写退回说明（不少于 4 字）。'); return; }
              onSubmit(reason.trim());
            }}
          >
            确认退回
          </button>
        </div>
      </div>
    </div>
  );
}

function NewBatchModal({ state, onClose, onCreate }) {
  const [title, setTitle] = useState(`${state.hall.name} 照明施工图`);
  const [code, setCode] = useState(`Q-2026-${String(41 + state.batches.length).padStart(3, '0')}`);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">新建质检批次</div>
        <div className="modal-bd">
          <div className="field-row" style={{ gridTemplateColumns: '70px 1fr' }}>
            <label>批次号</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} style={{ width: '100%', textAlign: 'left' }} />
          </div>
          <div className="field-row" style={{ gridTemplateColumns: '70px 1fr' }}>
            <label>名称</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: '100%', textAlign: 'left' }} />
          </div>
          <div className="tooltip-note" style={{ marginTop: 10 }}>
            批次创建后，可在「布光工作台 → 预检 → 提交图纸至质检批次」中选择该批次送审。
          </div>
        </div>
        <div className="modal-ft">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => onCreate({ code, title })}>创建</button>
        </div>
      </div>
    </div>
  );
}
