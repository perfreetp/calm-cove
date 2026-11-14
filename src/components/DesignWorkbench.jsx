import React, { useCallback, useMemo, useState } from 'react';
import PlanCanvas from './PlanCanvas.jsx';
import { CATALOG, CAT, CCT_OPTIONS, CCT_LABEL } from '../lib/catalog.js';
import { computeGrid, findDarkZones, statsIn, statsAll, spacingReport, ugrAt } from '../lib/lighting.js';
import { MODE, MODES } from '../lib/modes.js';
import { runChecks } from '../lib/qc.js';
import { exportGridCsv, exportZoneCsv } from '../lib/exporters.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export default function DesignWorkbench({ state, design, setDesign, ui, setUi, onToast, onSubmit }) {
  const [rightTab, setRightTab] = React.useState('lamps');
  const [showHeat, setShowHeat] = useState(true);
  const [showContour, setShowContour] = useState(true);
  const [showShadow, setShowShadow] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(false);
  const [tool, setTool] = useState('select');
  const [focusZone, setFocusZone] = useState(null);
  const [bulkCct, setBulkCct] = useState(4000);
  const [bulkModel, setBulkModel] = useState('HB150');
  const [bulkH, setBulkH] = useState(9);
  const [arrayCfg, setArrayCfg] = useState({ rows: 6, cols: 10, margin: 2.5 });

  const applyArray = (clear = false) => {
    const { rows, cols, margin } = arrayCfg;
    setDesign((d) => {
      const x0 = margin, x1 = d.room.w - margin;
      const y0 = margin + 1.5, y1 = d.room.h - margin - 1.5;
      const next = clear ? [] : d.lamps.map((l) => ({ ...l }));
      let seq = next.length;
      for (let r = 0; r < rows; r++) {
        const y = rows === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * r) / (rows - 1);
        for (let c = 0; c < cols; c++) {
          const x = cols === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * c) / (cols - 1);
          seq += 1;
          next.push({
            id: `L${String(seq).padStart(2, '0')}`,
            model: bulkModel,
            h: bulkH,
            tilt: 0,
            cct: bulkCct,
            circuit: ['N1', 'N2', 'N3', 'N4'][(r + c) % 4],
            emergency: false,
            battery: true,
            x: +x.toFixed(2),
            y: +y.toFixed(2),
          });
        }
      }
      return { ...d, lamps: next };
    });
    onToast?.(`已按 ${rows}×${cols} 阵列${clear ? '重排' : '追加'} ${rows * cols} 盏灯具`, 'ok');
  };

  const cell = ui.cell ?? 0.5;
  const target = design.prefs?.target ?? 150;
  const modeKey = ui.mode ?? 'night';
  const selectedLampId = ui.selectedLampId;

  const grid = useMemo(
    () =>
      computeGrid(design, {
        cell,
        ambient: MODE[modeKey].ambient,
        powerScale: MODE[modeKey].powerScale,
      }),
    [design, cell, modeKey]
  );

  const dark = useMemo(() => findDarkZones(grid, target, 2, design.fixtures), [grid, target, design.fixtures]);
  const KIND_LABEL = { floor: '地面', trench: '地沟', shelf: '平台下' };
  const all = useMemo(() => statsAll(grid), [grid]);
  const ceils = useMemo(() => {
    const map = {};
    for (const f of design.fixtures.filter((f) => f.kind === 'aisle')) map[f.id] = statsIn(grid, f);
    return map;
  }, [grid, design.fixtures]);

  const ugr = useMemo(() => {
    const pts = design.fixtures
      .filter((f) => f.kind === 'aisle')
      .map((f) => ({ id: f.id, label: f.label, x: f.x + f.w / 2, y: f.y + f.h / 2 }));
    pts.push({ id: 'mid', label: '库房中心', x: design.room.w / 2, y: design.room.h / 2 });
    return pts.map((p) => ({ ...p, v: ugrAt(design, p) }));
  }, [design]);
  const ugrMax = Math.max(...ugr.map((u) => u.v));

  // 分区统计：按 4 条检修线划分区域（地沟两侧各 4.5 m 带）
  const regions = useMemo(() => {
    const tracks = design.fixtures.filter((f) => f.kind === 'trench');
    return tracks.map((t, i) => {
      const y0 = Math.max(0, t.y - 4.25);
      const y1 = Math.min(design.room.h, t.y + t.h + 4.25);
      const rect = { x: 0, y: y0, w: design.room.w, h: y1 - y0 };
      const st = statsIn(grid, rect);
      const lamps = design.lamps.filter((l) => l.y >= y0 && l.y <= y1);
      return {
        id: t.id,
        label: `${i + 1} 道区域`,
        rect,
        ...st,
        lamps: lamps.length,
        target,
      };
    });
  }, [grid, design, target]);

  const spacing = useMemo(() => spacingReport(design.lamps), [design.lamps]);

  const qc = useMemo(() => runChecks(design), [design]);
  const serious = qc.findings.filter((f) => f.severity === 'serious').length;
  const general = qc.findings.filter((f) => f.severity === 'general').length;
  const suggest = qc.findings.filter((f) => f.severity === 'suggestion').length;

  const selected = design.lamps.find((l) => l.id === selectedLampId) ?? null;

  const setLamp = useCallback(
    (id, patch) => {
      setDesign((d) => ({ ...d, lamps: d.lamps.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
    },
    [setDesign]
  );

  const moveLamp = useCallback(
    (id, pos) => {
      setLamp(id, { x: pos.x, y: pos.y });
    },
    [setLamp]
  );

  const addLamp = useCallback(
    (pos) => {
      const id = `L${String(design.lamps.length + 1).padStart(2, '0')}`;
      const exists = design.lamps.some((l) => l.id === id);
      const finalId = exists ? `L${id}-${Math.random().toString(36).slice(2, 5)}` : id;
      const lamp = {
        id: finalId,
        model: bulkModel,
        h: bulkH,
        tilt: 0,
        cct: bulkCct,
        circuit: 'N1',
        emergency: false,
        battery: true,
        x: pos.x,
        y: pos.y,
      };
      setDesign((d) => ({ ...d, lamps: [...d.lamps, lamp] }));
      setUi((u) => ({ ...u, selectedLampId: finalId }));
      onToast?.(`新增灯具 ${finalId} @ (${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`, 'ok');
    },
    [design.lamps, bulkModel, bulkH, bulkCct, setDesign, setUi, onToast]
  );

  const delLamp = useCallback(
    (id) => {
      setDesign((d) => ({ ...d, lamps: d.lamps.filter((l) => l.id !== id) }));
      setUi((u) => ({ ...u, selectedLampId: null }));
      onToast?.(`已删除灯具 ${id}`, 'danger');
    },
    [setDesign, setUi, onToast]
  );

  const applyBulk = (kind) => {
    setDesign((d) => ({
      ...d,
      lamps: d.lamps.map((l) =>
        kind === 'model' ? { ...l, model: bulkModel } : kind === 'h' ? { ...l, h: bulkH } : { ...l, cct: bulkCct }
      ),
    }));
    const label = kind === 'model' ? '灯具型号' : kind === 'h' ? '安装高度' : '色温';
    onToast?.(`已将 ${design.lamps.length} 盏灯具的${label}批量更新`, 'ok');
  };

  const applyTilt = (deg) => {
    setDesign((d) => ({
      ...d,
      lamps: d.lamps.map((l) => ({ ...l, tilt: deg })),
    }));
    onToast?.(`全部灯具倾角设为 ${deg}°`, 'ok');
  };

  const setMode = (m) => setUi((u) => ({ ...u, mode: m }));

  return (
    <div className="design-layout">
      {/* ── 左栏 ── */}
      <aside className="sidebar">
        <div className="side-sec">
          <div className="side-title">方案</div>
          <select
            value={design.id}
            onChange={(e) => setUi((u) => ({ ...u, designId: e.target.value, selectedLampId: null }))}
            style={{ width: '100%', fontSize: 12 }}
          >
            {state.designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.name.split('·').pop().trim()}
              </option>
            ))}
          </select>
          <div className="tooltip-note" style={{ marginTop: 8 }}>
            {design.name}
            <br />
            设计员 {design.designer} · v{design.rev} · {design.lamps.length} 盏
          </div>
        </div>

        <div className="side-sec">
          <div className="side-title">时段工况</div>
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.key}
                className={`mode-btn ${modeKey === m.key ? 'active' : ''}`}
                onClick={() => setMode(m.key)}
              >
                <span className="m-icon">{m.icon}</span>
                <span className="m-name">{m.label}</span>
                <span className="m-amb">{m.ambient} lx 本底</span>
              </button>
            ))}
          </div>
          <div className="tooltip-note" style={{ marginTop: 8 }}>
            {MODE[modeKey].note}
          </div>
        </div>

        <div className="side-sec">
          <div className="side-title">
            <span>布灯工具</span>
            <span className="dim" style={{ fontWeight: 400 }}>{design.lamps.length} 盏</span>
          </div>
          <div className="row" style={{ gap: 5, marginBottom: 7 }}>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => applyArray()}>
              按阵列布灯
            </button>
            <button className="btn sm" style={{ flex: 1 }} onClick={() => applyArray(true)}>
              清空重排
            </button>
          </div>
          <div className="row" style={{ gap: 5 }}>
            <input
              type="number" min={2} max={16} value={arrayCfg.rows}
              onChange={(e) => setArrayCfg((c) => ({ ...c, rows: clamp(+e.target.value || 2, 2, 16) }))}
              style={{ width: 52, textAlign: 'center' }}
              title="行数"
            />
            <span className="dim">×</span>
            <input
              type="number" min={2} max={24} value={arrayCfg.cols}
              onChange={(e) => setArrayCfg((c) => ({ ...c, cols: clamp(+e.target.value || 2, 2, 24) }))}
              style={{ width: 52, textAlign: 'center' }}
              title="列数"
            />
            <span className="dim" style={{ fontSize: 10.5 }}>行 × 列</span>
          </div>
          <div className="dim mono" style={{ fontSize: 10, marginTop: 5 }}>
            间距 ≈ {(design.room.w / (arrayCfg.cols - 1 || 1)).toFixed(2)} × {((design.room.h - 5) / (arrayCfg.rows - 1 || 1)).toFixed(2)} m
          </div>
        </div>

        <div className="side-sec">
          <div className="side-title">
            <span>库房尺寸</span>
            <span className="dim" style={{ fontWeight: 400 }}>净高 {design.room.ceiling} m</span>
          </div>
          <div className="field-row">
            <label>长 (x, m)</label>
            <input
              type="number" min={20} max={160} step={1} value={design.room.w}
              onChange={(e) => {
                const w = clamp(+e.target.value || 20, 20, 160);
                setDesign((d) => ({ ...d, room: { ...d.room, w } }));
              }}
            />
          </div>
          <div className="field-row">
            <label>宽 (y, m)</label>
            <input
              type="number" min={12} max={80} step={1} value={design.room.h}
              onChange={(e) => {
                const h = clamp(+e.target.value || 12, 12, 80);
                setDesign((d) => ({ ...d, room: { ...d.room, h } }));
              }}
            />
          </div>
          <div className="field-row">
            <label>净高 (m)</label>
            <input
              type="number" min={5} max={16} step={0.1} value={design.room.ceiling}
              onChange={(e) => {
                const c = clamp(+e.target.value || 5, 5, 16);
                setDesign((d) => ({ ...d, room: { ...d.room, ceiling: c } }));
              }}
            />
          </div>
        </div>

        <div className="side-sec">
          <div className="side-title">
            <span>照度统计</span>
            <span className="dim" style={{ fontWeight: 400, letterSpacing: 0 }}>
              网格 {cell}×{cell} m
            </span>
          </div>
          <div className="stat-grid">
            <div className={`stat-cell ${all.avg < target ? 'bad' : 'good'}`}>
              <div className="s-val">
                {Math.round(all.avg)}
                <span className="s-unit">lx</span>
              </div>
              <div className="s-lbl">平均照度</div>
            </div>
            <div className={`stat-cell ${all.min < target * 0.5 ? 'bad' : all.min < target ? 'warnv' : 'good'}`}>
              <div className="s-val">
                {Math.round(all.min)}
                <span className="s-unit">lx</span>
              </div>
              <div className="s-lbl">最小照度</div>
            </div>
            <div className={`stat-cell ${dark.length ? 'bad' : 'good'}`}>
              <div className="s-val">{dark.length}</div>
              <div className="s-lbl">暗区 (＜{target} lx)</div>
            </div>
            <div className={`stat-cell ${all.uniformity < 0.4 ? 'warnv' : 'good'}`}>
              <div className="s-val">{all.uniformity.toFixed(2)}</div>
              <div className="s-lbl">均匀度 U₀</div>
            </div>
            <div className={`stat-cell ${ugrMax > 22 ? 'warnv' : ''}`}>
              <div className="s-val">{ugrMax.toFixed(1)}</div>
              <div className="s-lbl">最大 UGR</div>
            </div>
            <div className="stat-cell">
              <div className="s-val">{Math.round(qc.metrics.emergency.coverage * 100)}<span className="s-unit">%</span></div>
              <div className="s-lbl">应急覆盖</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 6, flexWrap: 'wrap' }}>
            {serious > 0 && <span className="sev-badge serious">严重 {serious}</span>}
            {general > 0 && <span className="sev-badge general">一般 {general}</span>}
            {suggest > 0 && <span className="sev-badge suggestion">建议 {suggest}</span>}
            {!qc.findings.length && <span className="sev-badge ok">四项检查通过</span>}
          </div>
        </div>

        <div className="side-sec">
          <div className="side-title">检修通道</div>
          {design.fixtures
            .filter((f) => f.kind === 'aisle')
            .map((f) => {
              const st = ceils[f.id];
              const ok = st.avg >= 150;
              return (
                <div className="kv" key={f.id}>
                  <span style={{ maxWidth: 132, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>
                  <span style={{ color: ok ? 'var(--ok)' : 'var(--danger)' }}>
                    {Math.round(st.avg)} lx
                  </span>
                </div>
              );
            })}
        </div>

        <div className="side-sec">
          <div className="side-title">
            <span>暗区清单</span>
            <span className="dim" style={{ fontWeight: 400 }}>
              {dark.length} 处
            </span>
          </div>
          {dark.length === 0 && <div className="tooltip-note">当前工况下全部网格点 ≥ {target} lx，无暗区。</div>}
          {dark.slice(0, 8).map((z) => (
            <div
              key={z.id}
              className="zone-item"
              onClick={() => {
                setFocusZone(z);
                setRightTab('zones');
              }}
            >
              <span className="z-id">{z.id}</span>
              <div className="z-main">
                <div className="z-lux">
                  {Math.round(z.minLux)}–{Math.round(z.avgLux)} lx
                </div>
                <div className="z-coord">
                  {KIND_LABEL[z.kind] ?? '地面'} · ({z.centroid.x.toFixed(1)}, {z.centroid.y.toFixed(1)}) · {z.cells} 格
                </div>
              </div>
            </div>
          ))}
          {dark.length > 8 && (
            <button className="btn ghost sm" style={{ width: '100%' }} onClick={() => setRightTab('zones')}>
              查看全部 {dark.length} 处暗区 →
            </button>
          )}
        </div>
      </aside>

      {/* ── 画布 ── */}
      <div className="canvas-wrap">
        <div className="canvas-toolbar">
          <div className="seg">
            <button className={tool === 'select' ? 'on' : ''} onClick={() => setTool('select')}>选择 / 拖拽</button>
            <button className={tool === 'add' ? 'on' : ''} onClick={() => setTool('add')}>布灯</button>
          </div>
          <div className="divider" />
          <button className={`chip ${showHeat ? 'on' : ''}`} onClick={() => setShowHeat((v) => !v)}>热力图</button>
          <button className={`chip ${showContour ? 'on' : ''}`} onClick={() => setShowContour((v) => !v)}>等照度线</button>
          <button className={`chip ${showShadow ? 'on' : ''}`} onClick={() => setShowShadow((v) => !v)}>遮挡软阴影</button>
          <button className={`chip ${showZones ? 'on' : ''}`} onClick={() => setShowZones((v) => !v)}>暗区标注</button>
          <button className={`chip ${showLabels ? 'on' : ''}`} onClick={() => setShowLabels((v) => !v)}>标注</button>
          <button
            className={`chip ${showValues ? 'on' : ''}`}
            onClick={() => setShowValues((v) => !v)}
            title="放大后显示逐格照度数值"
          >
            数值
          </button>
          <div className="divider" />
          <span className="dim" style={{ fontSize: 11 }}>网格</span>
          <div className="seg">
            {[1, 0.75, 0.5, 0.25].map((c) => (
              <button key={c} className={cell === c ? 'on' : ''} onClick={() => setUi((u) => ({ ...u, cell: c }))}>
                {c}
              </button>
            ))}
          </div>
          <button
            className="chip"
            onClick={() => {
              exportGridCsv(design, grid, MODE[modeKey].label);
              onToast?.('照度网格已导出 CSV', 'ok');
            }}
            title="导出当前工况的逐格照度 CSV"
          >
            导出网格
          </button>
          <button
            className="chip"
            onClick={() => {
              exportZoneCsv(design, grid, target);
              onToast?.(`暗区清单已导出（${dark.length} 处）`, 'ok');
            }}
            title="导出暗区清单 CSV"
          >
            导出暗区
          </button>
          <div className="tool-hint">
            <kbd>滚轮</kbd>缩放
            <kbd>Shift+拖</kbd>平移
            <kbd>Del</kbd>删灯
          </div>
        </div>

        <PlanCanvas
          design={design}
          mode={modeKey}
          cell={cell}
          showHeat={showHeat}
          showContour={showContour}
          showShadow={showShadow}
          showZones={showZones}
          showLabels={showLabels}
          showValues={showValues}
          selectedLampId={selectedLampId}
          onSelectLamp={(id) => setUi((u) => ({ ...u, selectedLampId: id }))}
          onMoveLamp={moveLamp}
          onAddLamp={addLamp}
          onDeleteLamp={delLamp}
          onOpenZones={(z) => { setFocusZone(z); setRightTab('zones'); }}
          tool={tool}
          target={target}
          focusZone={focusZone}
        />
      </div>

      {/* ── 右栏 ── */}
      <aside className="sidebar right">
        <div className="subtabs">
          <button className={`subtab ${rightTab === 'lamps' ? 'active' : ''}`} onClick={() => setRightTab('lamps')}>
            灯具 <span className="cnt">{design.lamps.length}</span>
          </button>
          <button className={`subtab ${rightTab === 'zones' ? 'active' : ''}`} onClick={() => setRightTab('zones')}>
            暗区 <span className="cnt">{dark.length}</span>
          </button>
          <button className={`subtab ${rightTab === 'regions' ? 'active' : ''}`} onClick={() => setRightTab('regions')}>
            分区 <span className="cnt">{regions.length}</span>
          </button>
          <button className={`subtab ${rightTab === 'checks' ? 'active' : ''}`} onClick={() => setRightTab('checks')}>
            预检 <span className="cnt">{qc.findings.length}</span>
          </button>
        </div>

        {rightTab === 'lamps' && (
          <div className="scroll-y">
            {selected ? (
              <div className="side-sec">
                <div className="side-title">
                  <span>灯具 {selected.id}</span>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn xs" onClick={() => delLamp(selected.id)}>删除</button>
                  </div>
                </div>
                <div className="field-row">
                  <label>坐标 x</label>
                  <input
                    type="number" step="0.25" value={selected.x}
                    onChange={(e) => setLamp(selected.id, { x: clamp(+e.target.value, 0, design.room.w) })}
                  />
                </div>
                <div className="field-row">
                  <label>坐标 y</label>
                  <input
                    type="number" step="0.25" value={selected.y}
                    onChange={(e) => setLamp(selected.id, { y: clamp(+e.target.value, 0, design.room.h) })}
                  />
                </div>
                <div className="field-row">
                  <label>灯具型号</label>
                  <select value={selected.model} onChange={(e) => setLamp(selected.id, { model: e.target.value })}>
                    {CATALOG.map((m) => (
                      <option key={m.id} value={m.id}>{m.short}</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <label>安装高度 h (m)</label>
                  <input
                    type="number" step="0.1" value={selected.h}
                    onChange={(e) => setLamp(selected.id, { h: clamp(+e.target.value, 2, design.room.ceiling) })}
                  />
                </div>
                <div className="field-row">
                  <label>倾角 (°)</label>
                  <input
                    type="number" step="5" value={selected.tilt ?? 0}
                    onChange={(e) => setLamp(selected.id, { tilt: clamp(+e.target.value, -75, 75) })}
                  />
                </div>
                <div className="field-row">
                  <label>色温</label>
                  <select value={selected.cct} onChange={(e) => setLamp(selected.id, { cct: +e.target.value })}>
                    {CCT_OPTIONS.map((c) => (
                      <option key={c} value={c}>{CCT_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <label>回路</label>
                  <select value={selected.circuit} onChange={(e) => setLamp(selected.id, { circuit: e.target.value })}>
                    {['N1', 'N2', 'N3', 'N4', 'E1', 'E2'].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <label>应急 / 蓄电池</label>
                  <div className="row" style={{ gap: 12, justifyContent: 'flex-end' }}>
                    <label className="chk">
                      <input
                        type="checkbox" checked={!!selected.emergency}
                        onChange={(e) => setLamp(selected.id, { emergency: e.target.checked })}
                      />
                      <span>应急</span>
                    </label>
                    <label className="chk">
                      <input
                        type="checkbox" checked={selected.battery !== false}
                        onChange={(e) => setLamp(selected.id, { battery: e.target.checked })}
                      />
                      <span>蓄电池</span>
                    </label>
                  </div>
                </div>
                <div className="kv" style={{ marginTop: 6, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
                  <span>光通量</span>
                  <span>{(CAT[selected.model]?.lumens ?? 0).toLocaleString()} lm</span>
                </div>
                <div className="kv">
                  <span>峰值光强</span>
                  <span>{Math.round((CAT[selected.model]?.lumens ?? 0) / (2 * Math.PI))} cd·sr⁻¹</span>
                </div>
                <div className="kv">
                  <span>配光光束角</span>
                  <span>{CAT[selected.model]?.beam}°</span>
                </div>
              </div>
            ) : (
              <div className="side-sec">
                <div className="side-title">批量设置</div>
                <div className="field-row">
                  <label>型号</label>
                  <select value={bulkModel} onChange={(e) => setBulkModel(e.target.value)}>
                    {CATALOG.map((m) => (
                      <option key={m.id} value={m.id}>{m.short}</option>
                    ))}
                  </select>
                </div>
                <div className="field-row">
                  <label>安装高度</label>
                  <input type="number" step="0.1" value={bulkH} onChange={(e) => setBulkH(+e.target.value)} />
                </div>
                <div className="field-row">
                  <label>色温</label>
                  <select value={bulkCct} onChange={(e) => setBulkCct(+e.target.value)}>
                    {CCT_OPTIONS.map((c) => (
                      <option key={c} value={c}>{CCT_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="row" style={{ gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                  <button className="btn sm" onClick={() => applyBulk('model')}>应用型号</button>
                  <button className="btn sm" onClick={() => applyBulk('h')}>应用高度</button>
                  <button className="btn sm" onClick={() => applyBulk('cct')}>应用色温</button>
                </div>
                <div className="label" style={{ margin: '12px 0 6px' }}>整排倾斜（绕 x 轴）</div>
                <div className="row" style={{ gap: 5 }}>
                  {[-20, -10, 0, 10, 20].map((d) => (
                    <button key={d} className="btn xs" onClick={() => applyTilt(d)}>{d > 0 ? `+${d}` : d}°</button>
                  ))}
                </div>
                <div className="tooltip-note" style={{ marginTop: 10 }}>
                  点击画布选中灯具后可单独编辑。在“布灯”模式下点击空白处即新增灯具。
                </div>
              </div>
            )}

            <div className="side-sec" style={{ paddingBottom: 4 }}>
              <div className="side-title">
                <span>灯具表</span>
                <span className="dim" style={{ fontWeight: 400 }}>含应急 {design.lamps.filter((l) => l.emergency).length}</span>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', margin: '0 -4px' }}>
                <table className="lamp-table">
                  <thead>
                    <tr>
                      <th>ID</th><th>型号</th><th>h</th><th>倾角</th><th>K</th><th>回路</th>
                    </tr>
                  </thead>
                  <tbody>
                    {design.lamps.map((l) => (
                      <tr
                        key={l.id}
                        className={l.id === selectedLampId ? 'sel' : ''}
                        onClick={() => setUi((u) => ({ ...u, selectedLampId: l.id }))}
                      >
                        <td>
                          {l.id}
                          {l.emergency && <span className="badge-em"> E</span>}
                        </td>
                        <td>{CAT[l.model]?.short ?? l.model}</td>
                        <td>{l.h.toFixed(1)}</td>
                        <td>{l.tilt ?? 0}°</td>
                        <td>{l.cct}</td>
                        <td>{l.circuit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {rightTab === 'zones' && (
          <div className="scroll-y">
            <div className="side-sec">
              <div className="side-title">
                <span>暗区（＜{target} lx）</span>
                <span className="dim" style={{ fontWeight: 400 }}>{Math.round(grid.values.length ? (qc.metrics.darkNight.darkRatio * 100) : 0)}% 网格</span>
              </div>
              {dark.length === 0 && <div className="tooltip-note">无暗区。全部有效网格点照度 ≥ {target} lx。</div>}
              {dark.map((z) => (
                <div key={z.id} className="zone-item" onClick={() => setFocusZone(z)}>
                  <span className="z-id">{z.id}</span>
                  <div className="z-main">
                    <div className="z-lux">
                      最小 {Math.round(z.minLux)} lx · 平均 {Math.round(z.avgLux)} lx
                    </div>
                    <div className="z-coord">
                      {KIND_LABEL[z.kind] ?? '地面'} · 质心 ({z.centroid.x.toFixed(2)}, {z.centroid.y.toFixed(2)}) m
                      <br />
                      范围 {z.bbox.w.toFixed(1)}×{z.bbox.h.toFixed(1)} m · 四角 {z.corners.map((c) => `(${c.x.toFixed(1)},${c.y.toFixed(1)})`).join(' ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="side-sec">
              <div className="side-title">重算说明</div>
              <div className="tooltip-note">
                照度网格随灯具位置、型号、高度、倾角、色温与时段实时重算（{cell} m 网格，{grid.nx}×{grid.ny} 点）。
                地沟、立柱与检修平台按解析投影形成软阴影，暗区按 4 邻域连通聚类并给出坐标。
              </div>
            </div>
          </div>
        )}

        {rightTab === 'regions' && (
          <div className="scroll-y">
            <div className="side-sec">
              <div className="side-title">
                <span>{modeKey === 'day' ? '白天' : modeKey === 'dusk' ? '黄昏' : modeKey === 'maint' ? '检修' : '夜间'}工况分区照度</span>
                <span className="dim" style={{ fontWeight: 400 }}>限值 {target} lx</span>
              </div>
              {regions.map((r) => {
                const ok = r.avg >= target && r.min >= target * 0.5;
                return (
                  <div key={r.id} style={{ marginBottom: 9 }}>
                    <div className="kv" style={{ paddingBottom: 2 }}>
                      <span style={{ color: 'var(--ink-1)' }}>{r.label}</span>
                      <span style={{ color: ok ? 'var(--ok)' : r.avg < target * 0.7 ? 'var(--danger)' : 'var(--warn)' }}>
                        {Math.round(r.avg)} lx
                      </span>
                    </div>
                    <div className="passbar" style={{ height: 5 }}>
                      <div
                        className="passbar-fill"
                        style={{ width: `${Math.min(100, (r.avg / (target * 1.6)) * 100)}%`, background: ok ? 'var(--ok)' : '#e9a13b' }}
                      />
                    </div>
                    <div className="dim mono" style={{ fontSize: 9.5, marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                      <span>min {Math.round(r.min)} · U₀ {r.uniformity.toFixed(2)}</span>
                      <span>{r.lamps} 盏 · y {r.rect.y.toFixed(1)}–{(r.rect.y + r.rect.h).toFixed(1)} m</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="side-sec">
              <div className="side-title">地沟工作面</div>
              <div className="kv"><span>沟内平均</span><span>{Math.round(qc.metrics.trench?.avg ?? 0)} lx</span></div>
              <div className="kv"><span>沟内最小</span><span>{Math.round(qc.metrics.trench?.min ?? 0)} lx</span></div>
              <div className="kv"><span>沟内网格</span><span>{qc.metrics.trench?.cells ?? 0}</span></div>
              <div className="tooltip-note" style={{ marginTop: 7 }}>
                地沟工作面按 −1.5 m 标高计算，沟壁遮挡按解析投影计入，仅保留经由沟口进入的直射光。
              </div>
            </div>
            <div className="side-sec">
              <div className="side-title">全库工作面</div>
              <div className="kv"><span>平均照度</span><span>{Math.round(qc.metrics.workPlane?.avg ?? 0)} lx</span></div>
              <div className="kv"><span>最小照度</span><span>{Math.round(qc.metrics.workPlane?.min ?? 0)} lx</span></div>
              <div className="kv"><span>均匀度 U₀</span><span>{(qc.metrics.workPlane?.uniformity ?? 0).toFixed(2)}</span></div>
              <div className="kv"><span>灯具数量</span><span>{design.lamps.length} 盏</span></div>
            </div>
          </div>
        )}

        {rightTab === 'checks' && (
          <div className="scroll-y">
            {qc.checks.map((c) => (
              <div key={c.key} className="side-sec">
                <div className="side-title">
                  <span>{c.title}</span>
                  {c.pass ? <span className="sev-badge ok">通过</span> : <span className={`sev-badge ${c.severity}`}>{c.findings.length} 项</span>}
                </div>
                <div className="dim" style={{ fontSize: 10.5, fontFamily: 'var(--mono)', marginBottom: 7 }}>{c.standard}</div>
                {c.findings.map((f) => (
                  <div key={f.id} className={`finding-card ${f.severity}`}>
                    <div className="fc-hd">
                      <span className={`sev-badge ${f.severity}`}>{f.severity === 'serious' ? '严重' : f.severity === 'general' ? '一般' : '建议'}</span>
                      <span className="fc-title">{f.title}</span>
                    </div>
                    <div className="fc-body">{f.detail}</div>
                  </div>
                ))}
              </div>
            ))}
            <div className="side-sec">
              <button className="btn primary" style={{ width: '100%' }} onClick={() => onSubmit?.(qc)}>
                提交图纸至质检批次
              </button>
              <div className="tooltip-note" style={{ marginTop: 8 }}>
                提交后系统冻结当前四项检查结果与问题清单，进入复核批次，逐条由复核员确认或驳回。
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
