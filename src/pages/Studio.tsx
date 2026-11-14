import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp, fmtTime, relTime } from '../store';
import { STATUS_META, THICKNESS_LEVELS, THICKNESS_META } from '../types';
import type { ControlPoint, Order, PlanVersion } from '../types';
import {
  buildSurface,
  cloneControlPoints,
  defaultControlPoints,
  fitControlPointsFromCloud,
  parsePointCloudText,
  syntheticScan,
  syncControlPoints,
  CURV_THRESHOLD_DEFAULT,
  CTRL_V,
} from '../lib/geom';
import type { GeoModel } from '../lib/geom';
import { developFromModel } from '../lib/unroll';
import { EarRenderer } from '../webgl/EarRenderer';
import { SheetView } from '../components/SheetView';
import { Modal, toast, Field } from '../components/ui';
import {
  IconAlert,
  IconCheck,
  IconCube,
  IconDownload,
  IconInfo,
  IconLayers,
  IconRotate,
  IconSave,
  IconSliders,
  IconSparkle,
  IconTarget,
  IconUndo,
  IconUpload,
  IconSheet,
  IconClock,
  IconArrow,
  IconLock,
} from '../components/Icons';

const REGIONS = [
  { max: 0.3, name: '耳甲腔' },
  { max: 0.55, name: '耳道第一弯' },
  { max: 0.82, name: '耳道第二弯' },
  { max: 1.1, name: '深耳道' },
];
function regionOf(u: number) {
  return REGIONS.find((r) => u <= r.max)?.name ?? '深耳道';
}
function clockOf(phi: number) {
  const hours = ((phi / (Math.PI * 2)) * 12 + 6) % 12;
  const hh = Math.floor(hours) || 12;
  return `${hh} 点方位`;
}

interface DragState {
  index: number;
  startX: number;
  startY: number;
  baseDr: number;
  baseDz: number;
  bdr: { x: number; y: number };
  bdz: { x: number; y: number };
}

export default function Studio() {
  const { orderId } = useParams();
  const nav = useNavigate();
  const { db, currentUser, commitVersion, submitOrder, updateOrderMeta } = useApp();
  const order = db.orders.find((o) => o.id === orderId);

  const [points, setPoints] = useState<ControlPoint[]>([]);
  const [wall, setWall] = useState(1.2);
  const [adaptive, setAdaptive] = useState(true);
  const [threshold, setThreshold] = useState(db.settings.threshold || CURV_THRESHOLD_DEFAULT);
  const [versionId, setVersionId] = useState<string>('');
  const [model, setModel] = useState<GeoModel | null>(null);
  const [mode, setMode] = useState<'solid' | 'curv' | 'thick'>('solid');
  const [tab, setTab] = useState<'3d' | 'sheet'>('3d');
  const [sel, setSel] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const [sideTab, setSideTab] = useState<'analysis' | 'versions' | 'log'>('analysis');
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [showLattice, setShowLattice] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<EarRenderer | null>(null);
  const rafRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef(false);
  const pointsRef = useRef<ControlPoint[]>([]);
  pointsRef.current = points;

  const version = useMemo(
    () => order?.versions.find((v) => v.id === versionId) ?? order?.versions[order.versions.length - 1],
    [order, versionId],
  );

  // seed editor from the selected version
  useEffect(() => {
    if (!order) return;
    const v = order.versions.find((x) => x.id === versionId) ?? order.versions[order.versions.length - 1];
    setPoints(cloneControlPoints(v.controlPoints));
    setWall(v.wallThickness);
    setAdaptive(v.adaptive);
    setThreshold(v.threshold);
    setDirty(false);
    setSel(-1);
  }, [order?.id, versionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // renderer lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !order) return;
    let r: EarRenderer;
    try {
      r = new EarRenderer(canvas);
    } catch {
      toast('当前浏览器不支持 WebGL2，三维视图不可用', 'err');
      return;
    }
    rendererRef.current = r;
    if (import.meta.env.DEV) {
      (window as unknown as { __studio?: unknown }).__studio = {
        renderer: r,
        getPoints: () => pointsRef.current,
      };
    }
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    let t0 = performance.now();
    const loop = () => {
      const t = (performance.now() - t0) / 1000;
      if (r.camera && autoRotate) r.camera.yaw += 0.0032;
      r.render(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      r.dispose();
      rendererRef.current = null;
    };
  }, [order?.id, autoRotate]);

  // rebuild geometry
  const rebuild = useCallback(
    (pts: ControlPoint[], opts: { preview?: boolean } = {}) => {
      if (!pts.length) return;
      const res = opts.preview ? { nu: 92, nv: 100 } : { nu: 132, nv: 142 };
      const g = buildSurface(pts, {
        nu: res.nu,
        nv: res.nv,
        wall,
        adaptive,
        threshold,
      });
      setModel(g);
      const r = rendererRef.current;
      if (r) {
        r.setModel(g);
        r.mode = mode;
        r.threshold = threshold;
        r.showLattice = showLattice;
        const hot: number[] = [];
        g.hotspotDetail.slice(0, 6).forEach((h) => {
          let best = -1;
          let bd = 9;
          pts.forEach((c, idx) => {
            const d = Math.hypot(c.u - h.u, ((c.phi - h.phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d < bd) {
              bd = d;
              best = idx;
            }
          });
          if (best >= 0 && !hot.includes(best)) hot.push(best);
        });
        r.setSelection(sel, hot);
      }
    },
    [wall, adaptive, threshold, mode, sel, showLattice],
  );

  useEffect(() => {
    if (!points.length) return;
    const id = window.setTimeout(() => rebuild(points), 16);
    return () => window.clearTimeout(id);
  }, [points, rebuild]);

  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.mode = mode;
    r.threshold = threshold;
    r.showLattice = showLattice;
    r.setSelection(sel);
  }, [mode, threshold, sel, showLattice]);

  useEffect(() => {
    if (!order) return;
    if (order.patient) document.title = `${order.code} · ${order.patient} · AURIS`;
    return () => {
      document.title = 'AURIS · 耳模定制云平台';
    };
  }, [order?.id]);

  const sheet = useMemo(() => {
    if (!model) return null;
    return developFromModel(model, { wall, adaptive, threshold });
  }, [model, wall, adaptive, threshold]);

  if (!order) {
    return (
      <div className="page-pad">
        <div className="empty">订单不存在或已被删除。</div>
      </div>
    );
  }

  const locked = order.status === 'pending_review' || order.status === 'ordered' || order.status === 'delivered';
  const store = db.stores.find((s) => s.id === order.storeId);
  const fitter = db.users.find((u) => u.id === order.fitterId);
  const material = db.materials.find((m) => m.id === order.materialId);

  /* ---------------- interaction ---------------- */

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = rendererRef.current;
    if (!r) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.button === 0 && !e.shiftKey) {
      const idx = r.pick(e.clientX, e.clientY);
      if (idx >= 0) {
        if (locked) {
          setSel(idx);
          toast('当前订单已锁定，请先退回或新建版本', 'info');
          return;
        }
        const basis = r.getHandleBasis(idx);
        if (basis) {
          const p = points[idx];
          dragRef.current = {
            index: idx,
            startX: e.clientX,
            startY: e.clientY,
            baseDr: p.dr,
            baseDz: p.dz,
            bdr: basis.dr,
            bdz: basis.dz,
          };
          setSel(idx);
          previewRef.current = true;
        }
        return;
      }
    }
    // orbit / pan
    const start = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      start.x = ev.clientX;
      start.y = ev.clientY;
      if (ev.buttons === 4 || ev.shiftKey) r.pan(dx, dy);
      else r.orbit(dx, dy);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    const r = rendererRef.current;
    if (!d || !r) {
      const idx = r?.pick(e.clientX, e.clientY) ?? -1;
      if (r) r.canvas.style.cursor = idx >= 0 ? 'grab' : 'default';
      return;
    }
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    // solve [bdr bdz] * [a b]^T = [dx dy]^T  (mm along surface normal / canal axis)
    const det = d.bdr.x * d.bdz.y - d.bdr.y * d.bdz.x;
    let a = 0;
    let b = 0;
    if (Math.abs(det) > 1e-3) {
      a = (dx * d.bdz.y - dy * d.bdz.x) / det;
      b = (d.bdr.x * dy - d.bdr.y * dx) / det;
    } else {
      a = dx / 8;
    }
    setPoints((prev) => {
      const next = prev.map((c) => ({ ...c }));
      const p = next[d.index];
      if (!p) return prev;
      // keep a single handle move within a fold-free envelope
      const maxDr = 2.6 * Math.min(1, 0.35 + Math.min(p.u, 1 - p.u) * 1.6);
      p.dr = Math.max(-maxDr, Math.min(maxDr, d.baseDr + a * 0.8));
      p.dz = Math.max(-0.9, Math.min(0.9, d.baseDz + b * 0.45));
      return next;
    });
    setDirty(true);
  };

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      previewRef.current = false;
      setPoints((prev) => syncControlPoints(prev));
      toast('曲面已更新，记得保存方案版本', 'info');
    }
  };

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rendererRef.current?.zoom(e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [tab, order?.id]);

  /* ---------------- actions ---------------- */

  const importCloud = (text: string, label: string) => {
    const pts = parsePointCloudText(text);
    if (pts.length < 300) {
      toast('点云数据不足（少于 100 点），请检查文件格式', 'err');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const fitted = fitControlPointsFromCloud(pts);
      setPoints(fitted);
      setDirty(true);
      setScanNote(`${label} · ${Math.floor(pts.length / 3).toLocaleString()} 点已拟合`);
      setBusy(false);
      toast(`已从 ${label} 拟合耳模曲面`, 'ok');
    }, 30);
  };

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCloud(String(reader.result ?? ''), file.name);
    reader.readAsText(file);
  };

  const doSave = () => {
    commitVersion(order.id, points, wall, adaptive, threshold, saveNote || '手动调整控制点后保存');
    setDirty(false);
    setSaveOpen(false);
    setSaveNote('');
    setVersionId('');
    toast('方案版本已保存', 'ok');
  };

  const doSubmit = () => {
    if (dirty) {
      toast('有未保存的改动，请先保存方案版本', 'err');
      return;
    }
    submitOrder(order.id, `壁厚 ${wall.toFixed(1)} mm${adaptive ? ' · 自适应偏置' : ''}`);
    toast('已提交审核，等待审核员复核', 'ok');
  };

  const resetShape = () => {
    setPoints(syncControlPoints(defaultControlPoints()));
    setDirty(true);
    toast('已恢复基础耳模形态', 'info');
  };

  const undoEdit = () => {
    if (!version) return;
    setPoints(cloneControlPoints(version.controlPoints));
    setWall(version.wallThickness);
    setAdaptive(version.adaptive);
    setThreshold(version.threshold);
    setDirty(false);
    toast(`已回滚到版本 V${version.seq}`, 'info');
  };

  const hotspots = model?.hotspotDetail ?? [];
  const over = hotspots.length > 0 && model ? model.metrics.overRatio > 0 : false;

  const meta = {
    orderCode: order.code,
    patient: order.patient,
    ear: order.ear === 'right' ? '右' : '左',
    fitter: fitter?.name ?? '—',
    store: store?.name ?? '—',
    date: new Date().toISOString().slice(0, 10),
    material: material ? `${material.name}` : '—',
    version: version?.seq ?? 1,
    threshold,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="row" style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', gap: 12, background: 'rgba(8,13,20,0.6)' }}>
        <button className="btn ghost sm" onClick={() => nav('/orders')}>
          <IconChevronLeft /> 订单
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--line)' }} />
        <div>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{order.patient}</span>
            <span className="chip">{order.ear === 'right' ? '右耳' : '左耳'}</span>
            <span className="mono dim tiny">{order.code}</span>
            <span className={`badge ${STATUS_META[order.status].tone}`}>
              <i />
              {STATUS_META[order.status].label}
            </span>
            {dirty && <span className="badge amber">未保存</span>}
          </div>
          <div className="tiny dim" style={{ marginTop: 3 }}>
            {store?.name} · {fitter?.name} · 交期 {order.dueAt.slice(0, 10)} · 已退回 {order.returns.length} 次
          </div>
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={resetShape} disabled={locked}>
          <IconSparkle size={13} /> 基础形态
        </button>
        <button className="btn ghost sm" onClick={undoEdit} disabled={!dirty}>
          <IconUndo size={13} /> 回滚
        </button>
        <button className="btn sm" onClick={() => setSaveOpen(true)} disabled={locked}>
          <IconSave size={13} /> 保存版本
        </button>
        <button className="btn primary sm" onClick={doSubmit} disabled={locked || order.status === 'pending_review'}>
          <IconCheck size={13} /> 提交审核
        </button>
      </div>

      <div className="studio">
        {/* ---------------- left ---------------- */}
        <div className="studio-col left">
          <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ marginBottom: 9 }}>
              <span className="panel-sub">耳印输入</span>
              <div className="spacer" />
              <span className="tiny dim">STEP 01</span>
            </div>
            <label className="dropzone" style={{ display: 'block', cursor: locked ? 'not-allowed' : 'pointer' }}>
              <input
                type="file"
                accept=".txt,.xyz,.csv,.pts,.asc"
                style={{ display: 'none' }}
                disabled={locked}
                onChange={(e) => onFile(e.target.files?.[0])}
              />
              <IconUpload size={19} />
              <div style={{ marginTop: 6 }}>
                <b>导入点云文件</b>
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>xyz / csv / pts · 每行 x y z</div>
            </label>
            <button
              className="btn ghost sm"
              style={{ width: '100%', marginTop: 8 }}
              disabled={locked || busy}
              onClick={() => {
                setBusy(true);
                window.setTimeout(() => {
                  const pts = syntheticScan(Math.floor(Math.random() * 40) + 2);
                  let text = '';
                  for (let i = 0; i < pts.length; i += 3) {
                    text += `${pts[i].toFixed(3)} ${pts[i + 1].toFixed(3)} ${pts[i + 2].toFixed(3)}\n`;
                  }
                  importCloud(text, '示例扫描 wavely-scan.xyz');
                  setBusy(false);
                }, 20);
              }}
            >
              <IconWave size={13} /> 使用示例扫描数据
            </button>
            {scanNote && (
              <div className="tiny" style={{ marginTop: 8, color: 'var(--accent)', display: 'flex', gap: 5 }}>
                <IconInfo size={12} /> {scanNote}
              </div>
            )}
          </div>

          <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="panel-sub">壁厚与偏置</span>
              <div className="spacer" />
              <span className="tiny dim">STEP 02</span>
            </div>
            <div className="wall-opts">
              {THICKNESS_LEVELS.map((t) => (
                <button
                  key={t}
                  className={`wall-opt ${wall === t ? 'on' : ''}`}
                  onClick={() => {
                    setWall(t);
                    setDirty(true);
                  }}
                  disabled={locked}
                >
                  <div className="t">
                    {t.toFixed(1)} <span>mm</span>
                  </div>
                  <div className="d">{THICKNESS_META[t].name}</div>
                </button>
              ))}
            </div>
            <div className="param-row" style={{ marginTop: 6, borderBottom: 'none', paddingBottom: 0 }}>
              <div className="top">
                <span className="k">自适应偏置</span>
                <button
                  className={`icon-btn ${adaptive ? 'on' : ''}`}
                  style={{ width: 38, height: 22, borderRadius: 999 }}
                  onClick={() => {
                    setAdaptive((v) => !v);
                    setDirty(true);
                  }}
                  disabled={locked}
                >
                  <span className="dot" style={{ background: adaptive ? 'var(--accent)' : '#40536a' }} />
                </button>
              </div>
              <div className="tiny dim">
                沿曲率阈值自动加厚高风险区域（最大 {adaptive ? '×1.55' : '关闭'}）
              </div>
            </div>
            <div className="param-row">
              <div className="top">
                <span className="k">曲率阈值</span>
                <span className="v">{threshold.toFixed(2)} mm⁻¹</span>
              </div>
              <input
                type="range"
                min={0.45}
                max={1.2}
                step={0.01}
                value={threshold}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setThreshold(v);
                  setDirty(true);
                }}
                disabled={locked}
              />
              <div className="row tiny dim" style={{ justifyContent: 'space-between' }}>
                <span>宽松</span>
                <span>当前 {hotspots.length} 处超限</span>
                <span>严格</span>
              </div>
            </div>
          </div>

          <div style={{ padding: '13px 14px', borderBottom: '1px solid var(--line)' }}>
            <div className="row" style={{ marginBottom: 9 }}>
              <span className="panel-sub">控制点</span>
              <div className="spacer" />
              <span className="tiny dim">{sel >= 0 ? `#${sel + 1}` : '未选中'}</span>
            </div>
            {sel >= 0 && points[sel] ? (
              <div className="stack gap4" style={{ gap: 8 }}>
                <div className="kv" style={{ fontSize: 11 }}>
                  <dt>深度位置</dt>
                  <dd className="mono">{(points[sel].u * 100).toFixed(1)}% · {regionOf(points[sel].u)}</dd>
                  <dt>方位</dt>
                  <dd className="mono">{clockOf(points[sel].phi)}</dd>
                  <dt>径向偏移</dt>
                  <dd className="mono" style={{ color: points[sel].dr > 0 ? 'var(--accent)' : 'var(--amber)' }}>
                    {points[sel].dr > 0 ? '+' : ''}{points[sel].dr.toFixed(2)} mm
                  </dd>
                  <dt>轴向偏移</dt>
                  <dd className="mono">{points[sel].dz > 0 ? '+' : ''}{points[sel].dz.toFixed(2)} mm</dd>
                </div>
                <div className="param-row" style={{ padding: '4px 0', border: 'none' }}>
                  <input
                    type="range" min={-4.5} max={4.5} step={0.01} value={points[sel].dr}
                    disabled={locked}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setPoints((prev) => syncControlPoints(prev.map((c, i) => (i === sel ? { ...c, dr: v } : { ...c }))));
                      setDirty(true);
                    }}
                  />
                  <input
                    type="range" min={-2.5} max={2.5} step={0.01} value={points[sel].dz}
                    disabled={locked}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setPoints((prev) => syncControlPoints(prev.map((c, i) => (i === sel ? { ...c, dz: v } : { ...c }))));
                      setDirty(true);
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="tiny dim" style={{ lineHeight: 1.7 }}>
                在三维视图中点击控制点后拖动：
                <br />径向拖动 → 改变耳模外扩；轴向拖动 → 调整耳道走向。
              </div>
            )}
          </div>

          <div style={{ padding: '13px 14px' }}>
            <div className="panel-sub" style={{ marginBottom: 8 }}>订单信息</div>
            <div className="kv" style={{ fontSize: 11 }}>
              <dt>材料</dt>
              <dd>
                <select
                  className="select"
                  style={{ padding: '3px 6px', fontSize: 10.5, width: 'auto' }}
                  value={order.materialId}
                  disabled={order.status !== 'pending_model'}
                  onChange={(e) => updateOrderMeta(order.id, { materialId: e.target.value })}
                >
                  {db.materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.code}</option>
                  ))}
                </select>
              </dd>
              <dt>交期</dt>
              <dd className="mono">{material ? `${material.leadDays} 天` : '—'}</dd>
              <dt>版本</dt>
              <dd className="mono">V{version?.seq} / 共 {order.versions.length}</dd>
            </div>
          </div>
        </div>

        {/* ---------------- center ---------------- */}
        <div className="studio-col" style={{ borderRight: '1px solid var(--line)' }}>
          <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)', gap: 8 }}>
            <div className="seg">
              <button className={tab === '3d' ? 'on' : ''} onClick={() => setTab('3d')}>
                <IconCube size={12} /> 三维曲面
              </button>
              <button className={tab === 'sheet' ? 'on' : ''} onClick={() => setTab('sheet')}>
                <IconSheet size={12} /> 下料展开
              </button>
            </div>
            <div className="spacer" />
            {tab === '3d' ? (
              <>
                <div className="seg">
                  <button className={mode === 'solid' ? 'on' : ''} onClick={() => setMode('solid')}>实体</button>
                  <button className={mode === 'curv' ? 'on' : ''} onClick={() => setMode('curv')}>曲率</button>
                  <button className={mode === 'thick' ? 'on' : ''} onClick={() => setMode('thick')}>壁厚</button>
                </div>
                <button className="icon-btn" title="自动旋转" onClick={() => setAutoRotate((v) => !v)}>
                  <IconRotate size={15} />
                </button>
                <button className="icon-btn" title="复位视角" onClick={() => rendererRef.current?.fit()}>
                  <IconTarget size={15} />
                </button>
              </>
            ) : (
              <span className="tiny dim">1:1 mm · 展开图可导出 SVG</span>
            )}
          </div>

          {tab === '3d' ? (
            <div className="viewer">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <div className="viewer-overlay">
                <div className="vp-tools">
                  <button className={`icon-btn ${showLattice ? 'on' : ''}`} onClick={() => setShowLattice((v) => !v)} title="显示控制网格">
                    <IconLayers size={15} />
                  </button>
                  <div className="sep" />
                  <span className="tiny dim" style={{ padding: '0 6px' }}>
                    {points.length} 控制点
                  </span>
                </div>
                <div className="vp-legend">
                  <div style={{ color: '#b6c7d8' }}>
                    {mode === 'curv' ? '曲率 K (mm⁻¹)' : mode === 'thick' ? '壁厚 t (mm)' : '表面预览'}
                  </div>
                  {mode === 'curv' ? (
                    <>
                      <div className="legend-grad" style={{ background: 'linear-gradient(90deg,#0e3d59,#1a9e99,#dbb35c,#e04a34)' }} />
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span>0</span>
                        <span style={{ color: '#ff9f8d' }}>阈值 {threshold.toFixed(2)}</span>
                        <span>高</span>
                      </div>
                    </>
                  ) : mode === 'thick' ? (
                    <>
                      <div className="legend-grad" style={{ background: 'linear-gradient(90deg,#1a8585,#59c7a8,#edc273,#eb7550)' }} />
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span>{(model?.metrics.wallMin ?? 0).toFixed(2)}</span>
                        <span>{(model?.metrics.wallMax ?? 0).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ marginTop: 5, lineHeight: 1.6 }}>
                      拖动圆形控制点实时改形<br />
                      空白处拖动旋转 · 滚轮缩放
                    </div>
                  )}
                </div>
                <div className="vp-stats">
                  <div className="vp-stat">
                    <div className="k">最大曲率</div>
                    <div className={`v ${(model?.metrics.curvatureMax ?? 0) > threshold ? 'warn' : 'ok'}`}>
                      {model ? model.metrics.curvatureMax.toFixed(2) : '—'}
                    </div>
                  </div>
                  <div className="vp-stat">
                    <div className="k">超限面积</div>
                    <div className={`v ${(model?.metrics.overRatio ?? 0) > 0.005 ? 'warn' : 'ok'}`}>
                      {model ? (model.metrics.overRatio * 100).toFixed(1) : '—'}
                      <span style={{ fontSize: 9 }}> %</span>
                    </div>
                  </div>
                  <div className="vp-stat">
                    <div className="k">壁厚范围</div>
                    <div className="v">
                      {model ? `${model.metrics.wallMin.toFixed(2)}–${model.metrics.wallMax.toFixed(2)}` : '—'}
                    </div>
                  </div>
                  <div className="vp-stat">
                    <div className="k">三角面</div>
                    <div className="v">{model ? ((model.nu - 1) * (model.nv - 1) * 2).toLocaleString() : '—'}</div>
                  </div>
                </div>
                <div className="vp-hint">
                  左键拖动控制点改形 · 左键外侧旋转 · Shift+拖动平移 · 滚轮缩放
                </div>
                {!showLattice && null}
              </div>
            </div>
          ) : (
            sheet && (
              <SheetView sheet={sheet} threshold={threshold} meta={meta} />
            )
          )}
        </div>

        {/* ---------------- right ---------------- */}
        <div className="studio-col right">
          <div className="row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>
            <div className="seg">
              <button className={sideTab === 'analysis' ? 'on' : ''} onClick={() => setSideTab('analysis')}>曲率分析</button>
              <button className={sideTab === 'versions' ? 'on' : ''} onClick={() => setSideTab('versions')}>
                方案版本 <span className="mono">{order.versions.length}</span>
              </button>
              <button className={sideTab === 'log' ? 'on' : ''} onClick={() => setSideTab('log')}>操作记录</button>
            </div>
          </div>

          {sideTab === 'log' ? (
            <div style={{ overflowY: 'auto', flex: 1, padding: 14 }}>
              <div className="notice info" style={{ marginBottom: 12 }}>
                <IconLock />
                <div>订单状态流转与操作人、时间均自动留痕，不可编辑。</div>
              </div>
              <div className="timeline">
                {[...order.events].reverse().map((e, i) => (
                  <div className="tl-item" key={e.id}>
                    <div className="tl-rail">
                      <div className={`tl-dot ${e.type === 'approved' || e.type === 'delivered' ? 'teal' : e.type === 'returned' ? 'red' : e.type === 'submitted' ? 'amber' : ''}`} />
                      {i < order.events.length - 1 && <div className="tl-line" />}
                    </div>
                    <div className="tl-body">
                      <div className="t">{e.label}</div>
                      <div className="m">
                        <span>{db.users.find((u) => u.id === e.actorId)?.name ?? '系统'}</span>
                        <span>{fmtTime(e.at)}</span>
                      </div>
                      {e.note && <div className="note">{e.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {order.returns.length > 0 && (
                <>
                  <div className="dash" style={{ margin: '14px 0' }} />
                  <div className="panel-sub" style={{ marginBottom: 8 }}>退回记录（计入订单）</div>
                  {order.returns.map((r, i) => (
                    <div key={r.id} className="notice err" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5, marginBottom: 7 }}>
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <b>第 {i + 1} 次 · V{r.versionSeq}</b>
                        <span className="tiny">{fmtTime(r.at)}</span>
                      </div>
                      <div>{r.reason}</div>
                      <div className="tiny dim">审核人 {db.users.find((u) => u.id === r.reviewerId)?.name}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          ) : sideTab === 'analysis' ? (
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ padding: 12 }}>
                {over ? (
                  <div className="notice err">
                    <IconAlert />
                    <div>
                      检测到 <b>{hotspots.length}</b> 处曲率超限区域（K &gt; {threshold.toFixed(2)} mm⁻¹），
                      建议下调对应控制点或提高壁厚后再提交。
                    </div>
                  </div>
                ) : (
                  <div className="notice ok">
                    <IconCheck />
                    <div>曲率分布均匀，当前阈值下无超限区域，可提交审核。</div>
                  </div>
                )}
              </div>
              <div style={{ padding: '0 12px 12px' }}>
                <div className="panel-sub" style={{ marginBottom: 7 }}>危险区域</div>
                {hotspots.length ? (
                  <div className="sev-list">
                    {hotspots.map((h, i) => {
                      const k = h.curv / threshold;
                      return (
                        <button
                          key={i}
                          className="sev-item"
                          style={{ textAlign: 'left', cursor: 'pointer' }}
                          onClick={() => {
                            let best = -1;
                            let bd = 9;
                            points.forEach((c, idx) => {
                              const d = Math.hypot(c.u - h.u, ((c.phi - h.phi + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                              if (d < bd) {
                                bd = d;
                                best = idx;
                              }
                            });
                            setSel(best);
                            if (mode !== 'curv') setMode('curv');
                          }}
                        >
                          <span className="k">{h.curv.toFixed(2)}</span>
                          <div className="lbl">
                            <div style={{ color: '#ffc0b4' }}>{regionOf(h.u)} · {clockOf(h.phi)}</div>
                            <div className="loc">
                              深度 {(h.u * 100).toFixed(0)}% · 超出阈值 {((k - 1) * 100).toFixed(0)}%
                            </div>
                          </div>
                          <IconArrow size={12} />
                        </button>
                      );
                    })}
                    <div className="tiny dim" style={{ marginTop: 4, lineHeight: 1.6 }}>
                      点击定位到最近控制点，向下拖动可降低隆起。
                    </div>
                  </div>
                ) : (
                  <div className="tiny dim">无超限区域。</div>
                )}
              </div>

              <div className="dash" />
              <div style={{ padding: 12 }}>
                <div className="panel-sub" style={{ marginBottom: 9 }}>几何统计</div>
                <div className="kv" style={{ fontSize: 11 }}>
                  <dt>曲率最大值</dt>
                  <dd className="mono" style={{ color: (model?.metrics.curvatureMax ?? 0) > threshold ? '#ff9f8d' : undefined }}>
                    {model ? `${model.metrics.curvatureMax.toFixed(3)} mm⁻¹` : '—'}
                  </dd>
                  <dt>曲率 P95</dt>
                  <dd className="mono">{model ? `${model.metrics.curvatureP95.toFixed(3)} mm⁻¹` : '—'}</dd>
                  <dt>平均曲率</dt>
                  <dd className="mono">{model ? `${model.metrics.curvatureMean.toFixed(3)} mm⁻¹` : '—'}</dd>
                  <dt>超限面积占比</dt>
                  <dd className="mono">{model ? `${(model.metrics.overRatio * 100).toFixed(2)} %` : '—'}</dd>
                  <dt>壁厚区间</dt>
                  <dd className="mono">
                    {model ? `${model.metrics.wallMin.toFixed(2)} – ${model.metrics.wallMax.toFixed(2)} mm` : '—'}
                  </dd>
                  <dt>展开长度</dt>
                  <dd className="mono">{sheet ? `${sheet.length.toFixed(1)} mm` : '—'}</dd>
                  <dt>展开宽度</dt>
                  <dd className="mono">{sheet ? `${sheet.widthTop.toFixed(1)} mm` : '—'}</dd>
                </div>
              </div>

              <div className="dash" />
              <div style={{ padding: 12 }}>
                <div className="panel-sub" style={{ marginBottom: 9 }}>下料图要点</div>
                <div className="stack gap4" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  <div className="row"><span className="dot" style={{ background: '#5fded0' }} /> 贴合边 2.0 mm 止口，沿接缝缝合</div>
                  <div className="row"><span className="dot" style={{ background: '#8ad6c0' }} /> 泄压孔 Ø1.3，位于耳道段 90% 深度</div>
                  <div className="row"><span className="dot" style={{ background: '#e8624f' }} /> 红色虚线圈为曲率超限处，需手工修形</div>
                </div>
                <button
                  className="btn ghost sm"
                  style={{ width: '100%', marginTop: 10 }}
                  disabled={!sheet}
                  onClick={() => {
                    if (!sheet) return;
                    setTab('sheet');
                  }}
                >
                  <IconSheet size={13} /> 查看下料展开图
                </button>
              </div>
            </div>
          ) : (
            <div className="ver-list">
              {[...order.versions].reverse().map((v) => {
                const active = v.id === version?.id;
                const author = db.users.find((u) => u.id === v.authorId);
                return (
                  <div
                    key={v.id}
                    className={`ver-item ${active ? 'on' : ''}`}
                    onClick={() => setVersionId(v.id)}
                  >
                    {v.id === order.currentVersionId && <span className="cur-flag">当前</span>}
                    <div className="vh">
                      <span className="vi">V{v.seq}</span>
                      <span className="vd">{fmtTime(v.createdAt)}</span>
                    </div>
                    <div className="vb">{v.note}</div>
                    <div className="vm">
                      <span>t <b>{v.wallThickness.toFixed(1)}</b>mm</span>
                      <span>{v.adaptive ? '自适应' : '等壁厚'}</span>
                      <span>K <b>{v.metrics.curvatureMax.toFixed(2)}</b></span>
                    </div>
                    <div className="vm">
                      <span>{author?.name}</span>
                      <span className="dim">·</span>
                      <span className="dim">{relTime(v.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div className="tiny dim" style={{ padding: '6px 2px', lineHeight: 1.6 }}>
                每个版本完整记录控制点坐标、壁厚档位与自适应参数，可随时回溯。
              </div>
            </div>
          )}
        </div>
      </div>

      {saveOpen && (
        <Modal
          title="保存方案版本"
          subtitle={`将当前 ${points.length} 个控制点、壁厚 ${wall.toFixed(1)}mm 与阈值 ${threshold.toFixed(2)} 存为 V${order.versions.length + 1}`}
          onClose={() => setSaveOpen(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setSaveOpen(false)}>取消</button>
              <button className="btn primary" onClick={doSave}>
                <IconSave size={13} /> 保存版本
              </button>
            </>
          }
        >
          <Field label="改动说明" hint="审核员会在版本记录中看到这条说明">
            <textarea
              className="textarea"
              value={saveNote}
              placeholder="例如：降低第二转折隆起 0.4mm，壁厚上调至 1.2mm"
              onChange={(e) => setSaveNote(e.target.value)}
            />
          </Field>
          <div className="notice info">
            <IconInfo />
            <div>
              保存后版本号自动递增，历史版本不会被覆盖。提交审核前请确认曲率无超限区域。
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function IconChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  );
}

function IconWave({ size }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size ?? 14} height={size ?? 14} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2.5 12c1.5 0 1.5-4.5 3-4.5s1.5 9 3 9 1.5-6.5 3-6.5 1.5 4 3 4 1.5-2.5 3-2.5h3" />
    </svg>
  );
}
