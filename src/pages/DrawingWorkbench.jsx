import { createSignal, createEffect, onCleanup, onMount, Show, For, createMemo } from 'solid-js';
import { useParams, useNavigate, A } from '@solidjs/router';
import { api } from '../lib/api.js';
import { TunnelPlan } from '../lib/planEngine.js';
import {
  LAYERS, LAYER_ORDER, KINDS, KIND_KEYS, STATUS_LABELS, formatChainage, formatDate,
} from '../../shared/domain.js';

export default function DrawingWorkbench() {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = () => Number(params.id);

  const [data, setData] = createSignal(null);
  const [geo, setGeo] = createSignal(null);
  const [plan, setPlan] = createSignal(null);
  const [view, setView] = createSignal({ denominator: 100000, lod: 'overview', widthM: 0 });
  const [layers, setLayers] = createSignal({ hvac: true, elec: true, civil: true, anno: true });
  const [selected, setSelected] = createSignal([]);
  const [selection, setSelection] = createSignal(null);
  const [hover, setHover] = createSignal(null);
  const [tool, setTool] = createSignal('select');
  const [rubber, setRubber] = createSignal(null);
  const [toast, setToast] = createSignal(null);
  const [issues, setIssues] = createSignal([]);
  const [issueIds, setIssueIds] = createSignal(new Set());
  const [tab, setTab] = createSignal('detail');
  const [bulkTarget, setBulkTarget] = createSignal('');
  const [loadMs, setLoadMs] = createSignal(0);
  const [editModel, setEditModel] = createSignal(null);
  const [saving, setSaving] = createSignal(false);

  let canvasEl;
  let planRef;

  const notify = (msg, bad = false) => {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 3200);
  };

  async function bootstrap() {
    const t0 = performance.now();
    const [proj, g] = await Promise.all([
      api.project(projectId()),
      api.geometryBinary(projectId()),
    ]);
    setData(proj);
    setGeo(g);
    setLoadMs(Math.round(performance.now() - t0));
    const ids = new Set();
    for (const f of proj.issues) for (const id of f.element_ids) ids.add(id);
    setIssueIds(ids);
    setIssues(proj.issues);
  }

  onMount(async () => {
    try {
      await bootstrap();
    } catch (e) {
      notify(e.message, true);
    }
  });

  createEffect(() => {
    const g = geo();
    if (!g || !canvasEl || planRef) return;
    const p = new TunnelPlan(canvasEl, {
      onViewChange: (v) => setView(v),
    });
    planRef = p;
    setPlan(p);
    p.loadGeometry(g);
    p.attachInteractions?.({
      onPick: handlePick,
      onRect: handleRect,
      onHover: handleHover,
    });
    bindPointer();
  });

  onCleanup(() => {
    planRef?.dispose();
    planRef = null;
  });

  function bindPointer() {
    // Selection/pan/zoom are handled here so the engine stays UI-agnostic.
    let panning = false;
    let panStart = null;
    let rectStart = null;
    let moved = false;

    const onDown = (e) => {
      if (e.button === 1 || (e.button === 0 && (e.altKey || spaceDown))) {
        panning = true;
        panStart = { x: e.clientX, y: e.clientY, view: { ...plan().viewRect } };
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      if (tool() === 'rect') {
        const r = canvasEl.getBoundingClientRect();
        rectStart = { x: e.clientX - r.left, y: e.clientY - r.top };
        moved = false;
        return;
      }
      const hit = plan().pickAt(e.clientX, e.clientY);
      if (hit) {
        if (e.shiftKey) {
          const cur = new Set(selected());
          cur.has(hit.id) ? cur.delete(hit.id) : cur.add(hit.id);
          applySelection([...cur]);
        } else {
          applySelection([hit.id]);
        }
      } else if (!e.shiftKey) {
        applySelection([]);
      }
    };

    const onMove = (e) => {
      if (panning && panStart) {
        const rect = canvasEl.getBoundingClientRect();
        const v = panStart.view;
        const dx = ((e.clientX - panStart.x) / rect.width) * (v.x1 - v.x0);
        const dy = ((e.clientY - panStart.y) / rect.height) * (v.y1 - v.y0);
        plan().setView({ x0: v.x0 - dx, x1: v.x1 - dx, y0: v.y0 + dy, y1: v.y1 + dy });
        return;
      }
      if (rectStart) {
        const r = canvasEl.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (Math.abs(x - rectStart.x) > 3 || Math.abs(y - rectStart.y) > 3) moved = true;
        setRubber({ x0: Math.min(rectStart.x, x), y0: Math.min(rectStart.y, y), x1: Math.max(rectStart.x, x), y1: Math.max(rectStart.y, y) });
        plan().rubberBand = rubber();
        plan()._drawOverlay();
        return;
      }
      // hover feedback (throttled by frame)
      const hit = plan().pickAt(e.clientX, e.clientY);
      setHover(hit ? hit.id : null);
      plan().setHover(hit ? hit.id : null);
    };

    const onUp = (e) => {
      if (panning) { panning = false; panStart = null; return; }
      if (rectStart) {
        if (moved && rubber()) {
          const ids = plan().pickInRect(rubber());
          applySelection(ids);
          notify(`框选 ${ids.length} 个要素`);
        }
        rectStart = null;
        setRubber(null);
        plan().rubberBand = null;
        plan()._drawOverlay();
      }
    };

    const onWheel = (e) => {
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0012);
      const w = plan().screenToWorld(e.clientX, e.clientY);
      plan().zoomAt(factor, w.x, w.y);
    };

    // Pointer events (not mouse events): Babylon's InputManager preventDefaults
    // pointerdown, which suppresses the compatibility mousedown sequence.
    canvasEl.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvasEl.addEventListener('wheel', onWheel, { passive: false });
    const preventCtx = (e) => e.preventDefault();
    canvasEl.addEventListener('contextmenu', preventCtx);
    onCleanup(() => {
      canvasEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvasEl.removeEventListener('wheel', onWheel);
      canvasEl.removeEventListener('contextmenu', preventCtx);
    });

    // Keyboard: V = select, R = rubber band, Esc = clear, F = fit all, +/- zoom.
    let spaceDown = false;
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
        || (e.target instanceof HTMLSelectElement)) return;
      if (e.code === 'Space') { spaceDown = e.type === 'keydown'; e.preventDefault(); return; }
      switch (e.key.toLowerCase()) {
        case 'v': setTool('select'); break;
        case 'r': setTool('rect'); break;
        case 'f': fitAll(); break;
        case '=': case '+': handleZoom(0.66); break;
        case '-': handleZoom(1.5); break;
        case 'escape':
          setRubber(null);
          if (plan()) { plan().rubberBand = null; plan()._drawOverlay(); }
          applySelection([]);
          break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    onCleanup(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    });
  }

  async function applySelection(ids) {
    setSelected(ids);
    plan()?.setSelection(ids);
    if (!ids.length) { setSelection(null); return; }
    if (ids.length === 1) {
      try {
        const detail = await api.element(projectId(), ids[0]);
        setSelection(detail);
        setTab('detail');
      } catch (e) { notify(e.message, true); }
      return;
    }
    // Multi-selection: show the distinct sections among the selection.
    const g = geo();
    const secIdx = new Map();
    if (g) {
      for (const id of ids) {
        const i = findIndex(g, id);
        if (i < 0) continue;
        secIdx.set(g.elements.sectionIdx[i], (secIdx.get(g.elements.sectionIdx[i]) || 0) + 1);
      }
    }
    setSelection({
      multi: true, count: ids.length,
      sections: [...secIdx.entries()].map(([idx, n]) => ({
        idx, n, code: idx >= 0 ? g.sections[idx]?.code : '未挂接',
      })),
    });
    setTab('detail');
  }

  function findIndex(g, id) {
    const ids = g.elements.ids;
    // index hint cache
    if (!g._indexMap || g._indexMapId !== g) {
      const m = new Map();
      for (let i = 0; i < ids.length; i++) m.set(ids[i], i);
      g._indexMap = m;
      g._indexMapId = g;
    }
    return g._indexMap.has(id) ? g._indexMap.get(id) : -1;
  }

  async function handlePick(hit) { await applySelection([hit.id]); }
  async function handleRect(ids) { await applySelection(ids); }
  function handleHover(id) { setHover(id); }

  const handleZoom = (factor) => {
    const v = plan().viewRect;
    plan().zoomAt(factor, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2);
  };

  const fitAll = () => plan()?.fitAll();
  const fitSelection = () => {
    const s = selection();
    if (!s || s.multi || !s.section_id) return;
    const sec = data().sections.find((x) => x.id === s.section_id);
    if (sec) focusSection(sec);
  };
  const focusSection = (sec) => {
    if (!sec) return;
    plan()?.fitSection(sec);
  };

  const toggleLayer = (id) => {
    const next = { ...layers(), [id]: !layers()[id] };
    setLayers(next);
    plan()?.setLayers(next);
  };

  const sectionOptions = createMemo(() => (data()?.sections || []).map((s) => ({
    code: s.code, label: `${s.code}（${Math.round(s.start_m)}–${Math.round(s.end_m)} m）`,
  })));

  async function bulkAssign() {
    const ids = selected();
    if (!ids.length) return notify('请先框选要素', true);
    const code = bulkTarget();
    try {
      setSaving(true);
      const out = await api.bulkSection(projectId(), ids, code || null);
      notify(`已将 ${out.changed} 个要素挂接到 ${code || '未挂接'}`);
      const fresh = await api.geometryBinary(projectId());
      setGeo(fresh);
      plan()?.loadGeometry(fresh);
      const proj = await api.project(projectId());
      setData(proj);
      applySelection([]);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  async function saveElement(patch) {
    const s = selection();
    if (!s || s.multi) return;
    try {
      setSaving(true);
      const updated = await api.updateElement(projectId(), s.id, patch);
      setSelection(updated);
      const fresh = await api.geometryBinary(projectId());
      setGeo(fresh);
      plan()?.loadGeometry(fresh);
      applySelection([updated.id]);
      notify('要素已更新');
    } catch (e) {
      notify(e.message, true);
    } finally {
      setSaving(false);
    }
  }

  const selectedSection = createMemo(() => {
    const s = selection();
    if (!s || s.multi || !s.section_id) return null;
    return data()?.sections.find((x) => x.id === s.section_id) || null;
  });

  return (
    <div class="workspace">
      <div class="canvas-wrap">
        <canvas id="plan-canvas" ref={canvasEl} tabindex="0" />
        <div class="hud hud-toolbar">
          <button class={`tool-btn ${tool() === 'select' ? 'on' : ''}`} onClick={() => setTool('select')} title="选择 (点击要素)">
            ▣ 选择
          </button>
          <button class={`tool-btn ${tool() === 'rect' ? 'on' : ''}`} onClick={() => setTool('rect')} title="框选 (拖拽)">
            ⬚ 框选
          </button>
          <div class="divider" />
          <button class="tool-btn" onClick={() => handleZoom(1.5)} title="缩小">－</button>
          <button class="tool-btn" onClick={() => handleZoom(0.66)} title="放大">＋</button>
          <button class="tool-btn" onClick={fitAll}>适合全部</button>
          <button class="tool-btn" onClick={fitSelection} disabled={!selectedSection()}>定位选区</button>
          <div class="divider" />
          <div class="seg" style={{ 'border': '0' }}>
            <For each={[1, 500, 5000, 20000]}>
              {(d) => (
                <button
                  class={Math.abs(view().denominator - d) / d < 0.15 ? 'on' : ''}
                  style={{ background: 'transparent', border: '0', 'padding': '4px 7px' }}
                  onClick={() => {
                    const v = plan().viewRect;
                    const target = v.x1 - v.x0;
                    const widthPx = canvasEl.getBoundingClientRect().width;
                    const desired = (d * 0.0254 / 96) * widthPx; // metres visible at 1:d
                    const f = desired / target;
                    plan().zoomAt(f, (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2);
                  }}
                >1:{d}</button>
              )}
            </For>
          </div>
          <div class="divider" />
          <button class="tool-btn" onClick={async () => {
            try {
              const out = await api.runChecks(projectId());
              const proj = await api.project(projectId());
              setData(proj); setIssues(proj.issues);
              const ids = new Set();
              for (const f of proj.issues) for (const id of f.element_ids) ids.add(id);
              setIssueIds(ids);
              plan()?.setIssueIds(ids);
              notify(`校验完成：新增 ${out.created} 项，保留 ${out.kept} 项，失效 ${out.superseded} 项`);
            } catch (e) { notify(e.message, true); }
          }}>⟳ 运行校验</button>
          <button class="tool-btn" onClick={() => navigate(`/projects/${projectId()}`)}>← 返回项目</button>
          <span style={{ 'font-size': '10.5px', color: '#5d7387', 'margin-left': '4px' }}>
            V/R 工具 · F 全景 · 滚轮缩放 · 空格拖动
          </span>
        </div>

        <div class="hud hud-scale">
          <span class="denom">1:{view().denominator.toLocaleString('zh-CN')}</span>
          <span class="lod">{view().lod === 'overview' ? '概览（区段 + 风机数量）' : '单机展开'}</span>
        </div>

        <div class="hud hud-status">
          <span>可见要素 <b>{view().lod === 'overview' ? '区段汇总' : num(visibleCount())}</b></span>
          <span>要素总量 <b>{num(geo()?.elements.count)}</b></span>
          <span>视宽 <b>{view().widthM >= 1000 ? `${(view().widthM / 1000).toFixed(2)} km` : `${Math.round(view().widthM)} m`}</b></span>
          <span>选中 <b style={{ color: selected().length ? '#ffd166' : undefined }}>{selected().length}</b></span>
          <Show when={hover()}><span>悬停 <b>#{hover()}</b></span></Show>
        </div>

        <div class="hud hud-legend">
          <For each={LAYER_ORDER}>
            {(id) => (
              <label class="layer-row">
                <input type="checkbox" checked={layers()[id]} onChange={() => toggleLayer(id)} />
                <span class="swatch" style={{ background: LAYERS[id].color }} />
                <span class="name">{LAYERS[id].name}</span>
                <span class="cnt">{layerCount(id)}</span>
              </label>
            )}
          </For>
          <div style={{ 'border-top': '1px solid var(--line)', 'margin-top': '2px', 'padding-top': '6px', color: '#7d93a8', 'font-size': '11px' }}>
            缩放 &lt; 1:5000 仅区段轮廓与风机数量；≥ 1:500 展开单机与管线
          </div>
        </div>

        <Show when={rubber()}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
        </Show>
      </div>

      <aside class="sidebar">
        <div class="sidebar-tabs">
          <button class={tab() === 'detail' ? 'on' : ''} onClick={() => setTab('detail')}>要素 / 区段</button>
          <button class={tab() === 'sections' ? 'on' : ''} onClick={() => setTab('sections')}>区段列表</button>
          <button class={tab() === 'issues' ? 'on' : ''} onClick={() => setTab('issues')}>校验问题 {issues().length ? `(${issues().length})` : ''}</button>
        </div>
        <div class="sidebar-body">
          <Show when={selected().length > 1}>
            <div class="bulk-bar">
              <span style={{ 'font-size': '12px', color: '#bfe9fc' }}>已选 {selected().length} 个要素</span>
              <select value={bulkTarget()} onChange={(e) => setBulkTarget(e.currentTarget.value)}
                style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', 'border-radius': '6px', padding: '4px 8px' }}>
                <option value="">— 取消挂接区段 —</option>
                <For each={sectionOptions()}>{((s) => <option value={s.code}>{s.label}</option>)}</For>
              </select>
              <button class="btn small primary" disabled={saving()} onClick={bulkAssign}>批量改区段</button>
              <button class="btn small ghost" onClick={() => applySelection([])}>清除选择</button>
            </div>
          </Show>

          <Show when={tab() === 'detail'}>
            <Show when={selection()} fallback={
              <div class="empty">
                点击图中的射流风机、风阀、传感器或机房设备查看详情。<br /><br />
                使用「框选」可批量选中要素并修改所属区段。
              </div>
            }>
              {(s) => (
                <Show when={!s().multi} fallback={
                  <div class="detail">
                    <h3>批量选择 · {s().count} 个要素</h3>
                    <div class="kv">
                      <span class="k">涉及区段</span>
                      <span class="v">{s().sections.filter((x) => x.idx >= 0).length} 个 · 未挂接 {s().sections.find((x) => x.idx < 0)?.n || 0} 个</span>
                    </div>
                    <For each={s().sections.filter((x) => x.idx >= 0)}>
                      {(x) => <div class="relation-item">
                        <span class="chip accent">{x.code}</span>
                        <span style={{ color: '#7d93a8' }}>{x.n} 个要素</span>
                      </div>}
                    </For>
                    <div class="notice">
                      在左侧工具条选择区段后点击「批量改区段」完成挂接调整。
                    </div>
                  </div>
                }>
                  <div class="detail">
                    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                      <span class="swatch" style={{ width: '12px', height: '12px', background: LAYERS[s().layer]?.color }} />
                      <h3 style={{ flex: 1 }}>{s().kind_label} · {s().code}</h3>
                      <span class={`chip ${s().mounted ? 'ok' : 'bad'}`}>{s().mounted ? '已挂接' : '未挂接'}</span>
                    </div>

                    <div class="kv">
                      <span class="k">编号</span><span class="v"><code>{s().code}</code></span>
                      <span class="k">型号</span><span class="v">{s().model || '—'}</span>
                      <span class="k">所属区段</span>
                      <span class="v">
                        <Show when={s().section_code} fallback={<span style={{ color: '#ffb3b3' }}>未挂接区段</span>}>
                          <a href="javascript:void 0" style={{ color: '#bfe9fc' }}
                            onClick={() => {
                              const sec = data().sections.find((x) => x.id === s().section_id);
                              focusSection(sec);
                            }}>{s().section_code}</a>
                          <span style={{ display: 'block', color: '#7d93a8', 'font-size': '11px', 'margin-top': '2px' }}>
                            {s().section_range}
                          </span>
                        </Show>
                      </span>
                      <span class="k">桩号</span><span class="v">{formatChainage(s().chainage)}　横向偏移 {s().offset.toFixed(2)} m</span>
                      <span class="k">图层</span><span class="v">{LAYERS[s().layer]?.name}</span>
                    </div>

                    <div>
                      <div style={{ 'font-size': '11.5px', color: '#7d93a8', 'margin-bottom': '6px' }}>上下游关系</div>
                      <div class="relation">
                        <div class="relation-item">
                          <span class="arrow">↑ 上游</span>
                          <Show when={s().upstream} fallback={<span style={{ color: '#7d93a8' }}>无（该类要素起点）</span>}>
                            <a href="javascript:void 0" style={{ color: '#bfe9fc' }}
                              onClick={async () => { const d = await api.element(projectId(), s().upstream.id); applySelection([d.id]); }}>
                              {s().upstream.code}
                            </a>
                            <span style={{ color: '#7d93a8' }}>{formatChainage(s().upstream.chainage)}</span>
                          </Show>
                        </div>
                        <div class="relation-item">
                          <span class="arrow">↓ 下游</span>
                          <Show when={s().downstream} fallback={<span style={{ color: '#7d93a8' }}>无（该类要素终点）</span>}>
                            <a href="javascript:void 0" style={{ color: '#bfe9fc' }}
                              onClick={async () => { const d = await api.element(projectId(), s().downstream.id); applySelection([d.id]); }}>
                              {s().downstream.code}
                            </a>
                            <span style={{ color: '#7d93a8' }}>{formatChainage(s().downstream.chainage)}</span>
                          </Show>
                        </div>
                      </div>
                    </div>

                    <Show when={s().open_issues?.length}>
                      <div class="notice bad">
                        <For each={s().open_issues}>{(i) => <div>· {i.message}</div>}</For>
                      </div>
                    </Show>

                    <ElementEditor element={s()} disabled={saving()} onSave={saveElement} />
                  </div>
                </Show>
              )}
            </Show>

            <Show when={selectedSection()}>
              {(sec) => (
                <div class="card" style={{ margin: '0 12px 12px' }}>
                  <div class="card-head">
                    <h2>所属区段 {sec().code}</h2>
                    <div class="spacer" />
                    <button class="btn tiny" onClick={() => focusSection(sec())}>定位</button>
                  </div>
                  <div class="card-body" style={{ display: 'flex', 'flex-direction': 'column', gap: '8px' }}>
                    <div class="kv">
                      <span class="k">范围</span><span class="v">{Math.round(sec().start_m)}–{Math.round(sec().end_m)} m</span>
                      <span class="k">状态</span><span class="v">{STATUS_LABELS[sec().status] || sec().status}</span>
                      <span class="k">制作员</span><span class="v">{sec().assignee_name || '未分配'}</span>
                      <span class="k">返工</span><span class="v">{sec().rework_count} 次</span>
                    </div>
                    <A class="btn small" href={`/projects/${projectId()}`}>在项目页处理审核</A>
                  </div>
                </div>
              )}
            </Show>
          </Show>

          <Show when={tab() === 'sections'}>
            <div class="section-list">
              <For each={data()?.sections || []}>
                {(sec) => (
                  <div class="section-item" onClick={() => { focusSection(sec); setTab('detail'); }}>
                    <span class="code">{sec.code}</span>
                    <div>
                      <div class="range">{Math.round(sec.start_m)}–{Math.round(sec.end_m)} m · {sec.element_count} 要素</div>
                      <div class="kinds">
                        风机 {(sec.kinds.jet_fan || 0)} · 风阀 {(sec.kinds.damper || 0)} · 传感器 {(sec.kinds.co_sensor || 0) + (sec.kinds.vi_sensor || 0)}
                      </div>
                    </div>
                    <span class={`badge chip ${sec.open_issues ? 'bad' : sec.status === 'approved' ? 'ok' : 'muted'}`}>
                      {sec.open_issues ? `${sec.open_issues}问题` : STATUS_LABELS[sec.status]}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          <Show when={tab() === 'issues'}>
            <Show when={issues().length} fallback={<div class="empty">当前没有未处理问题。点击工具条「运行校验」重新检查。</div>}>
              <For each={issues()}>
                {(issue) => (
                  <div class="issue-item">
                    <div class="head">
                      <span class={`issue-type ${issue.check_type}`}>{issue.type_label}</span>
                      <span style={{ color: '#bfe9fc', 'font-size': '11.5px' }}>{issue.section_code || '未挂接'}</span>
                      <span style={{ 'margin-left': 'auto', 'font-size': '11px', color: '#7d93a8' }}>
                        {issue.status === 'open' ? '待处理' : issue.status === 'waived' ? '已豁免' : '已整改'}
                      </span>
                    </div>
                    <div class="msg">{issue.message}</div>
                    <div class="actions">
                      <button class="btn tiny" onClick={async () => {
                        const ids = issue.element_ids;
                        applySelection(ids);
                        const v = plan().viewRect;
                        const g = geo();
                        const i = findIndex(g, ids[0]);
                        if (i >= 0) {
                          plan().setView({ x0: g.elements.x[i] - 80, x1: g.elements.x[i] + 80, y0: g.elements.y[i] - 40, y1: g.elements.y[i] + 40 });
                        }
                      }}>定位</button>
                      <button class="btn tiny" onClick={async () => {
                        const proj = await api.project(projectId());
                        setData(proj); setIssues(proj.issues);
                        notify('已刷新');
                      }}>刷新</button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </aside>

      <Show when={toast()}>
        <div class={`toast ${toast().bad ? 'bad' : ''}`}>{toast().msg}</div>
      </Show>
    </div>
  );

  function visibleCount() {
    return plan()?.visibleCounts?.total || 0;
  }

  function layerCount(id) {
    const g = geo();
    if (!g) return '';
    let n = 0;
    for (let i = 0; i < g.elements.count; i++) if (g.elements.layer[i] === LAYER_ORDER.indexOf(id)) n++;
    return n > 999 ? `${(n / 1000).toFixed(1)}k` : n;
  }
}

const num = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));

function ElementEditor(props) {
  const [code, setCode] = createSignal(props.element.code);
  const [model, setModel] = createSignal(props.element.model);
  const [mounted, setMounted] = createSignal(!!props.element.mounted);
  createEffect(() => {
    setCode(props.element.code);
    setModel(props.element.model);
    setMounted(!!props.element.mounted);
  });
  const dirty = () => code() !== props.element.code || model() !== props.element.model || mounted() !== !!props.element.mounted;
  return (
    <div class="card">
      <div class="card-head"><h2>编辑要素</h2></div>
      <div class="card-body" style={{ display: 'flex', 'flex-direction': 'column', gap: '10px' }}>
        <div class="field">
          <label>编号</label>
          <input value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </div>
        <div class="field">
          <label>型号</label>
          <input value={model()} onInput={(e) => setModel(e.currentTarget.value)} />
        </div>
        <label style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'font-size': '12px', color: '#a7bacd' }}>
          <input type="checkbox" checked={mounted()} onChange={(e) => setMounted(e.currentTarget.checked)} />
          已挂装到结构 / 区段
        </label>
        <button class="btn small primary" disabled={!dirty() || props.disabled}
          onClick={() => props.onSave({ code: code(), model: model(), mounted: mounted() ? 1 : 0 })}>
          {props.disabled ? '保存中…' : '保存修改'}
        </button>
      </div>
    </div>
  );
}
