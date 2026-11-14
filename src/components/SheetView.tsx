import React, { useEffect, useRef, useState } from 'react';
import type { DevelopSheet } from '../lib/unroll';
import { downloadText, sheetSvg } from '../lib/export';
import type { SvgMeta } from '../lib/export';
import { IconDownload, IconTarget, IconSheet } from './Icons';

function drawSheet(
  ctx: CanvasRenderingContext2D,
  sheet: DevelopSheet,
  w: number,
  h: number,
  opts: { heat: boolean; showDims: boolean; threshold: number },
) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (ctx.canvas.width !== w * dpr || ctx.canvas.height !== h * dpr) {
    ctx.canvas.width = w * dpr;
    ctx.canvas.height = h * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const xs = sheet.outline.map((p) => p[0]);
  const ys = sheet.outline.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padX = 46;
  const padY = 54;
  const scale = Math.min((w - padX * 2) / (maxX - minX || 1), (h - padY * 2) / (maxY - minY || 1));
  const ox = w / 2 - ((minX + maxX) / 2) * scale;
  const oy = h / 2 - ((minY + maxY) / 2) * scale;
  const tx = (x: number) => ox + x * scale;
  const ty = (y: number) => oy + y * scale;

  // grid
  ctx.save();
  ctx.strokeStyle = 'rgba(38,58,78,0.35)';
  ctx.lineWidth = 1;
  for (let gx = Math.ceil(minX / 10) * 10; gx < maxX; gx += 10) {
    ctx.beginPath();
    ctx.moveTo(tx(gx), ty(minY));
    ctx.lineTo(tx(gx), ty(maxY));
    ctx.stroke();
  }
  for (let gy = Math.ceil(minY / 10) * 10; gy < maxY; gy += 10) {
    ctx.beginPath();
    ctx.moveTo(tx(minX), ty(gy));
    ctx.lineTo(tx(maxX), ty(gy));
    ctx.stroke();
  }
  // 10mm ruler
  ctx.strokeStyle = 'rgba(126,150,172,0.5)';
  ctx.beginPath();
  ctx.moveTo(tx(minX) + 6, ty(maxY) + 14);
  ctx.lineTo(tx(minX) + 6 + 10 * scale, ty(maxY) + 14);
  ctx.stroke();
  ctx.fillStyle = 'rgba(126,150,172,0.75)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.fillText('10mm', tx(minX) + 8, ty(maxY) + 27);
  ctx.restore();

  // outline fill
  const path = new Path2D();
  sheet.outline.forEach(([x, y], i) => {
    if (i === 0) path.moveTo(tx(x), ty(y));
    else path.lineTo(tx(x), ty(y));
  });
  path.closePath();

  const grad = ctx.createLinearGradient(tx(minX), ty(minY), tx(maxX), ty(maxY));
  grad.addColorStop(0, 'rgba(28,60,66,0.55)');
  grad.addColorStop(1, 'rgba(16,34,44,0.42)');
  ctx.fillStyle = grad;
  ctx.fill(path);

  // heat overlay per cell
  if (opts.heat) {
    const s = sheet.sample;
    for (let i = 0; i < s.nu - 1; i++) {
      for (let j = 0; j < s.nv - 1; j += 1) {
        const k = i * s.nv + j;
        const c = s.curv[k];
        const t = c / (opts.threshold * 1.6);
        if (t < 0.45) continue;
        const k01 = i * s.nv + j + 1;
        const k10 = (i + 1) * s.nv + j;
        const k11 = (i + 1) * s.nv + j + 1;
        ctx.beginPath();
        ctx.moveTo(tx(s.X[k]), ty(s.Y[k]));
        ctx.lineTo(tx(s.X[k01]), ty(s.Y[k01]));
        ctx.lineTo(tx(s.X[k11]), ty(s.Y[k11]));
        ctx.lineTo(tx(s.X[k10]), ty(s.Y[k10]));
        ctx.closePath();
        const over = t >= 1;
        ctx.fillStyle = over
          ? `rgba(232,98,79,${Math.min(0.75, 0.28 + (t - 1) * 0.6)})`
          : `rgba(229,183,106,${Math.min(0.35, (t - 0.45) * 0.8)})`;
        ctx.fill();
      }
    }
  }

  // hatch could be heavy; use diagonal lines clipped to the sheet
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = 'rgba(120,170,160,0.08)';
  ctx.lineWidth = 1;
  const step = 11;
  for (let d = -h; d < w + h; d += step) {
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d - h, h);
    ctx.stroke();
  }
  ctx.restore();

  // outline stroke
  ctx.strokeStyle = '#5fded0';
  ctx.lineWidth = 1.6;
  ctx.stroke(path);

  // seam stitch marks
  ctx.fillStyle = 'rgba(150,180,200,0.55)';
  sheet.outline.forEach(([x, y], i) => {
    if (i > 2 && i % 5 === 0) {
      ctx.beginPath();
      ctx.arc(tx(x), ty(y), 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // bore slot
  const bx = tx(sheet.bore.x - sheet.bore.w / 2);
  const by = ty(sheet.bore.y) - 3;
  ctx.strokeStyle = 'rgba(120,145,170,0.8)';
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(bx, by, sheet.bore.w * scale, 6);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(140,165,190,0.85)';
  ctx.font = '9.5px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('耳道接口', tx(sheet.bore.x), ty(sheet.bore.y) + 20);
  ctx.textAlign = 'left';

  // vent
  ctx.beginPath();
  ctx.arc(tx(sheet.vent.x), ty(sheet.vent.y), Math.max(3, sheet.vent.r * scale), 0, Math.PI * 2);
  ctx.fillStyle = '#08111a';
  ctx.fill();
  ctx.strokeStyle = '#8ad6c0';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(138,214,192,0.55)';
  ctx.beginPath();
  ctx.moveTo(tx(sheet.vent.x) + 5, ty(sheet.vent.y) - 4);
  ctx.lineTo(tx(sheet.vent.x) + 26, ty(sheet.vent.y) - 16);
  ctx.stroke();
  ctx.fillStyle = '#8ad6c0';
  ctx.font = '9.5px system-ui, sans-serif';
  ctx.fillText(sheet.vent.label, tx(sheet.vent.x) + 28, ty(sheet.vent.y) - 15);

  // hotspots
  sheet.hotspots.forEach((s) => {
    ctx.beginPath();
    ctx.arc(tx(s.x), ty(s.y), Math.max(5, s.r * scale), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(232,98,79,0.9)';
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,150,135,0.95)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(s.label, tx(s.x) + 8, ty(s.y) - 6);
  });

  if (opts.showDims) {
    ctx.strokeStyle = 'rgba(150,175,200,0.5)';
    ctx.fillStyle = 'rgba(160,185,205,0.8)';
    ctx.lineWidth = 1;
    const y = ty(minY) - 12;
    ctx.beginPath();
    ctx.moveTo(tx(minX), y);
    ctx.lineTo(tx(maxX), y);
    ctx.moveTo(tx(minX), y - 4);
    ctx.lineTo(tx(minX), y + 4);
    ctx.moveTo(tx(maxX), y - 4);
    ctx.lineTo(tx(maxX), y + 4);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = '9.5px ui-monospace, monospace';
    ctx.fillText(`${sheet.widthTop.toFixed(1)} mm`, (tx(minX) + tx(maxX)) / 2, y - 6);
    const x = tx(maxX) + 16;
    ctx.beginPath();
    ctx.moveTo(x, ty(minY));
    ctx.lineTo(x, ty(maxY));
    ctx.stroke();
    ctx.save();
    ctx.translate(x + 11, (ty(minY) + ty(maxY)) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`${sheet.length.toFixed(1)} mm`, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
  }
}

export function SheetView({
  sheet,
  threshold,
  meta,
  compact,
}: {
  sheet: DevelopSheet;
  threshold: number;
  meta: SvgMeta;
  compact?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const [heat, setHeat] = useState(true);
  const [dims, setDims] = useState(true);

  useEffect(() => {
    const canvas = ref.current;
    const host = wrap.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const render = () => {
      drawSheet(ctx, sheet, host.clientWidth, host.clientHeight, { heat, showDims: dims, threshold });
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(host);
    return () => ro.disconnect();
  }, [sheet, threshold, heat, dims]);

  return (
    <div className="sheet-wrap" ref={wrap}>
      <canvas ref={ref} />
      <div className="sheet-tools">
        <button className={`icon-btn ${heat ? 'on' : ''}`} onClick={() => setHeat((v) => !v)} title="曲率叠色">
          <IconTarget size={15} />
        </button>
        <button className={`icon-btn ${dims ? 'on' : ''}`} onClick={() => setDims((v) => !v)} title="尺寸标注">
          <IconSheet size={15} />
        </button>
        <button
          className="icon-btn"
          title="导出 SVG"
          onClick={() => downloadText(`${meta.orderCode}-V${meta.version}-${meta.ear}.svg`, sheetSvg(sheet, meta))}
        >
          <IconDownload size={15} />
        </button>
      </div>
      {!compact && (
        <div className="sheet-legend">
          <span>✓ 贴合边 2.0mm 止口</span>
          <span>● 泄压孔 Ø1.3</span>
          <span style={{ color: '#e8624f' }}>◌ 曲率超限点</span>
        </div>
      )}
    </div>
  );
}
