import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAT, CCT_TINT } from '../lib/catalog.js';
import { computeGrid, findDarkZones, pitDepthAt } from '../lib/lighting.js';
import { MODE, LUX_STOPS } from '../lib/modes.js';
import { heatDataUrl, contourPaths, darkMaskDataUrl } from '../lib/heatmap.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 阴影叠加层：由网格 shadow 因子生成透明黑图 */
function shadowDataUrl(r) {
  const { nx, ny, shadow } = r;
  if (!shadow) return null;
  const c = document.createElement('canvas');
  c.width = nx; c.height = ny;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(nx, ny);
  for (let k = 0; k < nx * ny; k++) {
    const a = Math.round(clamp(shadow[k] || 0, 0, 1) * 232);
    const o = k * 4;
    img.data[o] = 2; img.data[o + 1] = 5; img.data[o + 2] = 9; img.data[o + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}

export default function PlanCanvas({
  design,
  mode,
  cell,
  showHeat,
  showContour,
  showShadow,
  showZones,
  showLabels,
  showValues = false,
  selectedLampId,
  onSelectLamp,
  onMoveLamp,
  onAddLamp,
  onDeleteLamp,
  onOpenZones,
  tool,
  target,
  compact = false,
  focusZone,
}) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 520 });
  const [view, setView] = useState({ x: -3, y: -3, w: 90, h: 42 });
  const [hover, setHover] = useState(null);
  const [draft, setDraft] = useState(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);
  const lampNodes = useRef(new Map());
  const recomputeAt = useRef(0);

  const room = design.room;

  // 尺寸自适应
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(200, r.width), h: Math.max(160, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 初始视图：铺满可视区
  const fit = useCallback(() => {
    const pad = 2.6;
    const w = room.w + pad * 2;
    const h = room.h + pad * 2;
    const ar = size.w / Math.max(1, size.h);
    let vw = w, vh = h;
    if (w / h > ar) vh = w / ar; else vw = h * ar;
    setView({ x: room.w / 2 - vw / 2, y: room.h / 2 - vh / 2, w: vw, h: vh });
  }, [room.w, room.h, size.w, size.h]);

  useEffect(() => { fit(); }, [fit]);

  // 有效方案（含拖动中的临时位置）
  const effDesign = useMemo(() => {
    if (!draft) return design;
    return {
      ...design,
      lamps: design.lamps.map((l) => (l.id === draft.id ? { ...l, x: draft.x, y: draft.y } : l)),
    };
  }, [design, draft]);

  // 拖动灯具时降采样，保证 60fps 级别的交互反馈；松手后回到正常网格
  const activeCell = draft ? Math.max(1.5, cell * 2) : cell;

  const grid = useMemo(
    () =>
      computeGrid(effDesign, {
        cell: activeCell,
        ambient: (MODE[mode] ?? MODE.night).ambient,
        powerScale: (MODE[mode] ?? MODE.night).powerScale,
      }),
    [effDesign, mode, activeCell]
  );

  const darkZones = useMemo(() => findDarkZones(grid, target), [grid, target]);
  // 只给较成片的暗区打标签，避免密集小碎块把图纸盖住
  const labelZones = useMemo(() => {
    // 取面积最大的若干暗区打标签，避免大量细碎暗区标签互相重叠
    const minCells = Math.max(0.8 / (grid.cell * grid.cell), 6);
    const big = darkZones.filter((z) => z.cells >= minCells);
    return (big.length ? big : darkZones).slice(0, compact ? 6 : 8);
  }, [darkZones, compact, grid.cell]);

  const heatUrl = useMemo(
    () => (showHeat ? heatDataUrl(grid, { tintAmt: 0.26 }) : null),
    [grid, showHeat]
  );
  const darkMaskUrl = useMemo(
    () => (showZones && !compact ? darkMaskDataUrl(grid, target, 92) : null),
    [grid, showZones, target]
  );
  const shadowUrl = useMemo(
    () => (showShadow && !draft ? shadowDataUrl(grid) : null),
    [grid, showShadow, draft]
  );

  const contours = useMemo(
    () => (showContour && !draft ? contourPaths(grid, contourLevels(target)) : []),
    [grid, showContour, target, draft]
  );

  // 世界单位 → 屏幕像素的比例，用于让线宽/字号在缩放后保持恒定
  const s = view.w / Math.max(1, size.w);
  const font = (px) => px * s;

  // ── 坐标换算 ──
  const toWorld = useCallback(
    (clientX, clientY) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const r = svg.getBoundingClientRect();
      const px = ((clientX - r.left) / r.width) * view.w + view.x;
      const py = ((clientY - r.top) / r.height) * view.h + view.y;
      return { x: px, y: py };
    },
    [view]
  );

  // ── 缩放 ──
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      const factor = Math.exp(e.deltaY * 0.0016);
      setView((v) => {
        const nw = clamp(v.w * factor, 6, 240);
        const nh = (nw / v.w) * v.h;
        const rx = (p.x - v.x) / v.w;
        const ry = (p.y - v.y) / v.h;
        return { x: p.x - rx * nw, y: p.y - ry * nh, w: nw, h: nh };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [toWorld]);

  const beginPan = (e) => {
    if (e.button !== 1 && !(e.button === 0 && e.shiftKey)) return false;
    e.preventDefault();
    panRef.current = { sx: e.clientX, sy: e.clientY, view: { ...view }, moved: 0 };
    return true;
  };

  const onPointerDown = (e) => {
    if (beginPan(e)) return;
    const p = toWorld(e.clientX, e.clientY);
    if (tool === 'add') {
      onAddLamp?.({ x: round(p.x, 0.25), y: round(p.y, 0.25) });
      return;
    }
    // 空白处拖拽 = 平移
    panRef.current = { sx: e.clientX, sy: e.clientY, view: { ...view }, moved: 0, mayDeselect: true };
  };

  const onPointerMove = (e) => {
    const p = toWorld(e.clientX, e.clientY);
    // 拖动灯具
    if (dragRef.current) {
      const d = dragRef.current;
      const nx = round(clamp(p.x + d.dx, 0, room.w), 0.25);
      const ny = round(clamp(p.y + d.dy, 0, room.h), 0.25);
      if (nx === d.lastX && ny === d.lastY) return;
      d.lastX = nx;
      d.lastY = ny;
      // 灯具符号立即跟随指针（直接改 DOM，绕过 React 重绘）
      const node = lampNodes.current.get(d.id);
      if (node) node.setAttribute('transform', `translate(${nx} ${ny})`);
      // 照度重算按帧节流，拖动过程保持流畅
      const now = performance.now();
      const due = now - recomputeAt.current > 110;
      if (due || !d.moved) {
        recomputeAt.current = now;
        d.moved = true;
        setDraft({ id: d.id, x: nx, y: ny });
      }
      d.pending = { x: nx, y: ny };
      d.trailing = !d.trailing;
      return;
    }
    if (panRef.current) {
      const pn = panRef.current;
      const dx = e.clientX - pn.sx;
      const dy = e.clientY - pn.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) pn.moved = 1;
      if (!pn.moved) return;
      const r = svgRef.current.getBoundingClientRect();
      const scaleX = (pn.view.w / r.width);
      const scaleY = (pn.view.h / r.height);
      setView({ ...pn.view, x: pn.view.x - dx * scaleX, y: pn.view.y - dy * scaleY });
      return;
    }
    setHover(p);
  };

  const onPointerUp = () => {
    if (dragRef.current) {
      const d = dragRef.current;
      const pos = d.pending ?? draft;
      if (pos) onMoveLamp?.(d.id, { x: pos.x, y: pos.y });
      dragRef.current = null;
      setDraft(null);
      return;
    }
    panRef.current = null;
  };

  const startLampDrag = (e, lamp) => {
    if (tool === 'add') return;
    e.stopPropagation();
    e.preventDefault();
    onSelectLamp?.(lamp.id);
    const p = toWorld(e.clientX, e.clientY);
    dragRef.current = { id: lamp.id, dx: lamp.x - p.x, dy: lamp.y - p.y, lastX: lamp.x, lastY: lamp.y, pending: null };
    recomputeAt.current = performance.now();
    setDraft({ id: lamp.id, x: lamp.x, y: lamp.y });
  };

  // 删除选中灯具：监听全局键盘，输入框内不拦截
  useEffect(() => {
    if (!onDeleteLamp) return undefined;
    const handler = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      if (!selectedLampId || dragRef.current) return;
      e.preventDefault();
      onDeleteLamp(selectedLampId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedLampId, onDeleteLamp]);

  // 悬停读数
  const hoverInfo = useMemo(() => {
    if (!hover || !showHeat) return null;
    const i = clamp(Math.round(hover.x / grid.cell), 0, grid.nx - 1);
    const j = clamp(Math.round(hover.y / grid.cell), 0, grid.ny - 1);
    const v = grid.values[j * grid.nx + i];
    const val = grid.valid ? grid.valid[j * grid.nx + i] : 1;
    const inRoom = hover.x >= 0 && hover.x <= room.w && hover.y >= 0 && hover.y <= room.h;
    if (!inRoom) return null;
    const pit = pitDepthAt(hover.x, hover.y, design.fixtures);
    // 最近的灯
    let best = null;
    for (const l of effDesign.lamps) {
      const d = Math.hypot(l.x - hover.x, l.y - hover.y);
      if (!best || d < best.d) best = { l, d };
    }
    return { x: hover.x, y: hover.y, lux: v, valid: val, pit, best };
  }, [hover, grid, room.w, room.h, design.fixtures, effDesign.lamps, showHeat]);

  return (
    <div
      className="svg-stage"
      ref={wrapRef}
      tabIndex={0}
      style={compact ? { position: 'absolute', inset: 0 } : undefined}
    >
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { onPointerUp(); setHover(null); }}
        style={{ display: 'block', touchAction: 'none' }}
        className={dragRef.current ? 'dragging-lamp' : ''}
      >
        <defs>
          <pattern id="hatch" width="0.55" height="0.55" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="0.55" stroke="#3b5570" strokeWidth="0.1" />
          </pattern>
          <pattern id="hatch2" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="0.4" stroke="#5b7590" strokeWidth="0.08" />
          </pattern>
          <radialGradient id="lampGlow">
            <stop offset="0%" stopColor={CCT_TINT[4000]} stopOpacity="0.75" />
            <stop offset="55%" stopColor={CCT_TINT[4000]} stopOpacity="0.16" />
            <stop offset="100%" stopColor={CCT_TINT[4000]} stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={0.55 * s * 1} />
          </filter>
          <filter id="lampglowBlur" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation={1.1} />
          </filter>
        </defs>

        {/* 地面底色 */}
        <rect x="0" y="0" width={room.w} height={room.h} fill="#0a1018" />

        {/* 照度热力图 */}
        {showHeat && heatUrl && (
          <image
            href={heatUrl}
            x="0" y="0"
            width={room.w} height={room.h}
            preserveAspectRatio="xMidYMid meet"
            style={{ imageRendering: 'auto', opacity: 0.92 }}
          />
        )}

        {/* 遮挡软阴影 */}
        {showShadow && shadowUrl && (
          <image
            href={shadowUrl}
            x="0" y="0"
            width={room.w} height={room.h}
            preserveAspectRatio="xMidYMid meet"
            filter="url(#soft)"
            style={{ imageRendering: 'auto', opacity: 0.95 }}
          />
        )}

        {/* 时段氛围：天窗采光方向与色温，叠在热力图之上做轻微染色 */}
        {showHeat && !compact && <ModeAtmosphere mode={mode} room={room} />}

        {/* 等照度线 */}
        {contours.map((c) => (
          <path
            key={c.level}
            d={c.d}
            transform={`scale(${grid.cell})`}
            fill="none"
            stroke={c.level === 150 ? '#ffffff' : 'rgba(255,255,255,0.32)'}
            strokeWidth={(c.level === 150 ? 1.7 : 0.9) * s * (showHeat ? 1 : 0.6)}
            strokeDasharray={c.level === 150 ? `${4 * s} ${2.4 * s}` : `${2 * s} ${2.6 * s}`}
            strokeOpacity={c.level === 150 ? 0.9 : 0.5}
          />
        ))}

        {/* 房间墙体 */}
        <rect
          x="0" y="0" width={room.w} height={room.h}
          fill="none" stroke="#7b96b3" strokeWidth={3.4 * s}
        />
        <rect x={-0.55} y={-0.55} width={room.w + 1.1} height={room.h + 1.1} fill="none" stroke="#2a3d52" strokeWidth={1.4 * s} />

        {/* 网格与刻度 */}
        <GridLayer room={room} view={view} s={s} showLabels={showLabels && !compact} />

        {/* 图元 */}
        <FixturesLayer fixtures={design.fixtures} s={s} showLabels={showLabels} grid={grid} />

        {/* 暗区标注 */}
        {showZones && darkMaskUrl && (
          <image
            href={darkMaskUrl}
            x="0" y="0"
            width={room.w} height={room.h}
            preserveAspectRatio="none"
            style={{ imageRendering: 'auto' }}
          />
        )}
        {showZones &&
          labelZones.map((z) => (
            <g key={z.id} onClick={() => onOpenZones?.(z)} style={{ cursor: 'pointer' }}>
              <g
                transform={`translate(${Math.min(room.w - 22 * s, Math.max(22 * s, z.centroid.x))} ${Math.min(room.h - 4 * s, Math.max(9 * s, z.centroid.y))})`}
                pointerEvents="none"
              >
                <rect x={-20 * s} y={-7 * s} width={40 * s} height={14 * s} rx={3 * s} fill="rgba(239,91,91,0.94)" />
                <text textAnchor="middle" dy={3.6 * s} fontSize={9.5 * s} fill="#fff" fontWeight="700" fontFamily="var(--mono)">
                  {z.id} · {Math.round(z.minLux)}lx
                </text>
              </g>
            </g>
          ))}

        {/* 聚焦暗区 */}
        {focusZone && (
          <rect
            x={focusZone.bbox.x - 1} y={focusZone.bbox.y - 1}
            width={focusZone.bbox.w + 2} height={focusZone.bbox.h + 2}
            fill="none" stroke="#ffd166" strokeWidth={2.2 * s} strokeDasharray={`${5 * s} ${3 * s}`}
            rx={0.5}
          />
        )}

        {/* 照度数值网格 */}
        {showValues && cell <= 1 && view.w < 34 && (
          <g pointerEvents="none">
            {Array.from({ length: grid.ny }, (_, j) =>
              Array.from({ length: grid.nx }, (_, i) => {
                const step = view.w < 14 ? Math.max(1, Math.round(0.5 / cell)) : Math.max(2, Math.round(1.5 / cell));
                if (i % step || j % step) return null;
                const k = j * grid.nx + i;
                if (grid.valid && !grid.valid[k]) return null;
                const v = grid.values[k];
                if (v < 1) return null;
                return (
                  <text
                    key={k}
                    x={i * grid.cell}
                    y={j * grid.cell + 3 * s}
                    textAnchor="middle"
                    fontSize={8 * s}
                    fontFamily="var(--mono)"
                    fill={v < target ? '#ff8f8f' : 'rgba(255,255,255,0.82)'}
                    stroke="rgba(0,0,0,0.55)"
                    strokeWidth={0.34}
                    style={{ paintOrder: 'stroke' }}
                  >
                    {Math.round(v)}
                  </text>
                );
              })
            )}
          </g>
        )}

        {/* 灯具 */}
        <LampsLayer
          lampNodes={lampNodes}
          lamps={effDesign.lamps}
          selectedId={selectedLampId}
          dragId={draft?.id}
          s={s}
          onPointerDown={startLampDrag}
          showLabels={showLabels}
          mode={mode}
          grid={grid}
        />

        {/* 悬停十字线 */}
        {hoverInfo && (
          <g pointerEvents="none">
            <line x1={hoverInfo.x} y1={0} x2={hoverInfo.x} y2={room.h} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7 * s} strokeDasharray={`${2 * s} ${2 * s}`} />
            <line x1={0} y1={hoverInfo.y} x2={room.w} y2={hoverInfo.y} stroke="rgba(255,255,255,0.22)" strokeWidth={0.7 * s} strokeDasharray={`${2 * s} ${2 * s}`} />
            <circle cx={hoverInfo.x} cy={hoverInfo.y} r={2.6 * s} fill="#fff" />
          </g>
        )}
      </svg>

      {/* 悬停读数 */}
      {hoverInfo && !compact && (
        <div
          className="hover-readout"
          style={{
            left: clamp((hoverInfo.x - view.x) / view.w * size.w + 14, 8, size.w - 160),
            top: clamp((hoverInfo.y - view.y) / view.h * size.h + 14, 8, size.h - 130),
          }}
        >
          <div className="hr-lux" style={{ color: hoverInfo.lux < target ? '#ef8f8f' : '#cfe9ff' }}>
            {Math.round(hoverInfo.lux)} <small>lx</small>
          </div>
          <div className="hr-row"><span>坐标</span><b>{hoverInfo.x.toFixed(1)}, {hoverInfo.y.toFixed(1)}</b></div>
          <div className="hr-row"><span>状态</span><b style={{ color: hoverInfo.lux < target ? '#ef8f8f' : '#79d0a4' }}>{hoverInfo.lux < target ? '暗区' : '达标'}</b></div>
          {hoverInfo.pit > 0 && <div className="hr-row"><span>地沟</span><b>−{hoverInfo.pit.toFixed(1)} m</b></div>}
          {hoverInfo.best && (
            <div className="hr-row"><span>最近灯</span><b>{hoverInfo.best.l.id} · {hoverInfo.best.d.toFixed(1)}m</b></div>
          )}
        </div>
      )}

      {/* 图例 */}
      {showHeat && !compact && <Legend target={target} />}
      {showHeat && compact && <MiniLegend />}

      {/* 比例尺 */}
      {!compact && <ScaleBar view={view} size={size} />}

      {/* 罗盘 */}
      {!compact && <Compass />}
    </div>
  );
}

function ModeAtmosphere({ mode, room }) {
  const cfg = {
    day: { color: '#7fbfff', opacity: 0.16, shafts: 0.1, warm: false },
    dusk: { color: '#ff7a2e', opacity: 0.2, shafts: 0.13, warm: true },
    night: { color: '#05101f', opacity: 0.2, shafts: 0, warm: false },
    maint: { color: '#0a3438', opacity: 0.18, shafts: 0, warm: false },
  }[mode] ?? { color: '#05101f', opacity: 0.2, shafts: 0, warm: false };

  return (
    <g pointerEvents="none">
      <defs>
        <linearGradient id={`atmo-${mode}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.color} stopOpacity={cfg.opacity} />
          <stop offset="65%" stopColor={cfg.color} stopOpacity={cfg.opacity * 0.55} />
          <stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id="shaftGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cfg.warm ? '#ffd0a0' : '#e6f4ff'} stopOpacity={cfg.shafts} />
          <stop offset="100%" stopColor={cfg.warm ? '#ffd0a0' : '#e6f4ff'} stopOpacity={0} />
        </linearGradient>
      </defs>
      <clipPath id="roomClip">
        <rect x="0" y="0" width={room.w} height={room.h} />
      </clipPath>
      <g clipPath="url(#roomClip)">
        <rect x="0" y="0" width={room.w} height={room.h} fill={`url(#atmo-${mode})`} style={{ mixBlendMode: 'screen' }} />
        {cfg.shafts > 0 &&
          [0, 1, 2, 3].map((i) => (
            <rect
              key={i}
              x={4 + i * 20}
              y={-3}
              width={11}
              height={room.h + 6}
              fill="url(#shaftGrad)"
              transform="skewX(-4)"
              style={{ mixBlendMode: 'screen' }}
            />
          ))}
      </g>
    </g>
  );
}

function Legend({ target }) {
  const grad = LUX_STOPS.map((s, i) => `${s.color} ${(i / (LUX_STOPS.length - 1)) * 100}%`).join(', ');
  return (
    <div className="legend">
      <div className="lg-title">照度 E (lx)</div>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${grad})` }} />
      <div className="legend-ticks">
        <span>0</span><span>50</span><span>150</span><span>300</span><span>500</span><span>1000</span>
      </div>
      <div className="legend-note">
        <span><i style={{ background: '#ffffff' }} />150 lx 等照度线</span>
        <span><i style={{ background: '#ef5b5b' }} />暗区</span>
      </div>
    </div>
  );
}

function MiniLegend() {
  return (
    <div className="mini-legend">
      <div className="ml-bar" style={{ background: rampCss() }} />
      <div className="ml-ticks"><span>0</span><span>150</span><span>250</span><span>400+</span></div>
    </div>
  );
}

export function rampCss(n = 22) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = (i / (n - 1)) * 1000;
    let c = LUX_STOPS[LUX_STOPS.length - 1];
    for (let q = 1; q < LUX_STOPS.length; q++) {
      if (v <= LUX_STOPS[q].v) {
        const a = LUX_STOPS[q - 1], b = LUX_STOPS[q];
        const t = Math.max(0, Math.min(1, (v - a.v) / (b.v - a.v)));
        c = { color: mixHex(a.color, b.color, t) };
        break;
      }
    }
    out.push(`${c.color} ${(i / (n - 1)) * 100}%`);
  }
  return `linear-gradient(90deg, ${out.join(', ')})`;
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c.join(',')})`;
}

function ScaleBar({ view, size }) {
  const pxPerM = size.w / view.w;
  const candidates = [1, 2, 5, 10, 20, 50];
  let m = 10;
  for (const c of candidates) {
    if (c * pxPerM > 60 && c * pxPerM < 150) { m = c; break; }
    if (c * pxPerM <= 60) m = c;
  }
  const wpx = m * pxPerM;
  return (
    <div style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 3, textAlign: 'right' }}>
      <div style={{ width: wpx, height: 5, borderLeft: '2px solid #8698ad', borderRight: '2px solid #8698ad', borderBottom: '2px solid #8698ad' }} />
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: '#8698ad', marginTop: 2 }}>{m} m</div>
    </div>
  );
}

function Compass() {
  return (
    <svg className="compass" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#8698ad" strokeWidth="1" />
      <path d="M20 6 L24 24 L20 21 L16 24 Z" fill="#8698ad" />
      <text x="20" y="37" textAnchor="middle" fontSize="8" fill="#8698ad" fontFamily="var(--mono)">N</text>
    </svg>
  );
}

function GridLayer({ room, view, s, showLabels }) {
  const step = view.w > 45 ? 10 : 5;
  const xs = [];
  for (let x = 0; x <= room.w + 0.01; x += step) xs.push(+x.toFixed(2));
  const ys = [];
  for (let y = 0; y <= room.h + 0.01; y += step) ys.push(+y.toFixed(2));
  return (
    <g pointerEvents="none">
      {xs.map((x) => (
        <g key={`gx${x}`}>
          <line x1={x} y1={0} x2={x} y2={room.h} stroke="rgba(120,150,180,0.10)" strokeWidth={0.7 * s} />
          {showLabels && (
            <text x={x} y={room.h + 1.4 * s} fontSize={7.5 * s} fill="#5d6f85" textAnchor="middle" fontFamily="var(--mono)">
              {x}
            </text>
          )}
        </g>
      ))}
      {ys.map((y) => (
        <g key={`gy${y}`}>
          <line x1={0} y1={y} x2={room.w} y2={y} stroke="rgba(120,150,180,0.10)" strokeWidth={0.7 * s} />
          {showLabels && (
            <text x={-0.7 * s} y={y + 2.4 * s} fontSize={7.5 * s} fill="#5d6f85" textAnchor="end" fontFamily="var(--mono)">
              {y}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

function FixturesLayer({ fixtures, s, showLabels, grid }) {
  return (
    <g pointerEvents="none">
      {fixtures.map((f) => {
        if (f.kind === 'aisle') {
          return (
            <g key={f.id}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(120,190,255,0.045)" stroke="rgba(120,190,255,0.34)" strokeWidth={0.9 * s} strokeDasharray={`${5 * s} ${3 * s}`} />
              {showLabels && (
                <text x={f.x + f.w - 0.8} y={f.y + f.h - 0.8 * s} fontSize={6.6 * s} fill="rgba(140,200,255,0.75)" textAnchor="end" fontFamily="var(--mono)">
                  {f.label}
                </text>
              )}
            </g>
          );
        }
        if (f.kind === 'trench') {
          return (
            <g key={f.id}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#0b1017" stroke="#4d7a99" strokeWidth={1.1 * s} />
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="url(#hatch)" opacity="0.55" />
              <line x1={f.x} y1={f.y + f.h / 2} x2={f.x + f.w} y2={f.y + f.h / 2} stroke="rgba(255,255,255,0.10)" strokeWidth={0.6 * s} strokeDasharray={`${2 * s} ${3 * s}`} />
              {showLabels && (
                <text x={f.x + 0.8 * s} y={f.y + f.h / 2 + 2.3 * s} fontSize={6.9 * s} fill="#6fa8c8" fontFamily="var(--mono)">
                  {f.id} ±0.00 ↓ −{f.depth.toFixed(1)}
                </text>
              )}
            </g>
          );
        }
        if (f.kind === 'column') {
          return (
            <g key={f.id}>
              <circle cx={f.cx} cy={f.cy} r={f.r} fill="#20313f" stroke="#7f9bb5" strokeWidth={1 * s} />
              <line x1={f.cx - f.r} y1={f.cy} x2={f.cx + f.r} y2={f.cy} stroke="#7f9bb5" strokeWidth={0.6 * s} />
              <line x1={f.cx} y1={f.cy - f.r} x2={f.cx} y2={f.cy + f.r} stroke="#7f9bb5" strokeWidth={0.6 * s} />
            </g>
          );
        }
        if (f.kind === 'platform') {
          return (
            <g key={f.id}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="rgba(90,130,170,0.22)" stroke="#8aa9c6" strokeWidth={1.15 * s} />
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="url(#hatch2)" opacity="0.5" />
              {showLabels && (
                <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 1.6 * s} fontSize={6.6 * s} fill="#b9d2e6" textAnchor="middle" fontFamily="var(--mono)">
                  {f.id} +{f.z.toFixed(1)}m
                </text>
              )}
            </g>
          );
        }
        if (f.kind === 'cabinet') {
          return (
            <g key={f.id}>
              <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#2a3543" stroke="#93a8bb" strokeWidth={1 * s} />
              <text x={f.x + f.w / 2} y={f.y + f.h / 2 + 1.5 * s} fontSize={6.4 * s} fill="#c6d6e4" textAnchor="middle" fontFamily="var(--mono)">
                {f.id}
              </text>
            </g>
          );
        }
        return null;
      })}
    </g>
  );
}

function LampsLayer({ lamps, selectedId, dragId, s, onPointerDown, showLabels, lampNodes }) {
  return (
    <g>
      {lamps.map((l) => {
        const model = CAT[l.model] ?? CAT.HB150;
        const sel = l.id === selectedId;
        const dragging = l.id === dragId;
        const tint = CCT_TINT[l.cct] ?? CCT_TINT[4000];
        // 灯具符号在世界坐标下有上限，同时保证屏幕上不小于 6 px
        const r = Math.min(0.42, Math.max(0.16, 6 * s));
        const glow = Math.min(2.6, Math.max(0.9, 13 * s));
        return (
          <g
            key={l.id}
            ref={(node) => {
              if (!lampNodes) return;
              if (node) lampNodes.current.set(l.id, node);
              else lampNodes.current.delete(l.id);
            }}
            transform={`translate(${l.x} ${l.y})`}
            onPointerDown={(e) => onPointerDown(e, l)}
            style={{ cursor: 'grab' }}
          >
            {/* 光晕 */}
            <circle r={glow} fill="url(#lampGlow)" opacity={dragging ? 0.9 : 0.55} style={{ mixBlendMode: 'screen' }} />
            {sel && (
              <>
                <circle r={r * 2.9} fill="none" stroke="#7fd4ff" strokeWidth={0.9 * s} strokeDasharray={`${2.4 * s} ${1.6 * s}`} />
                <circle r={r * 2.1} fill="none" stroke="#7fd4ff" strokeWidth={1.2 * s} />
              </>
            )}
            {/* 灯具本体 */}
            <circle r={r} fill="#0d1620" stroke={sel ? '#8fe0ff' : tint} strokeWidth={(sel ? 1.7 : 1.15) * s} />
            <circle r={r * 0.42} fill={tint} opacity={0.95} />
            {l.emergency && (
              <g transform={`translate(${r * 1.35} ${-r * 1.35})`}>
                <circle r={5.5 * s} fill="#161006" stroke="#f0b84c" strokeWidth={0.9 * s} />
                <text textAnchor="middle" dy={3.1 * s} fontSize={7 * s} fill="#f0b84c" fontWeight="700" fontFamily="var(--mono)">E</text>
              </g>
            )}
            {/* 倾角指示 */}
            {Math.abs(l.tilt ?? 0) > 1 && (
              <g transform={`rotate(${l.tilt})`}>
                <line x1={0} y1={-r * 1.4} x2={0} y2={-r * 4.2} stroke={tint} strokeWidth={0.9 * s} markerEnd="url(#arrow)" />
              </g>
            )}
            {showLabels && sel && (
              <text y={r * 4.2} textAnchor="middle" fontSize={9 * s} fill="#cfe9ff" fontFamily="var(--mono)">
                {l.id} · {model.short} · {l.h.toFixed(1)}m
              </text>
            )}
          </g>
        );
      })}
      <defs>
        <marker id="arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.4" markerHeight="3.4" orient="auto">
          <path d="M0 1 L5 3 L0 5 z" fill="#f0b84c" />
        </marker>
      </defs>
    </g>
  );
}

function contourLevels(target) {
  return [...new Set([50, 100, target, target * 1.5, target * 2, 400].map((v) => Math.round(v)))].sort((a, b) => a - b);
}

function round(v, step) {
  return Math.round(v / step) * step;
}
