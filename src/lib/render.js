// Canvas2D 渲染层：所有绘制都在 OffscreenCanvas 上完成，再合成回可见画布。
import { clamp, round } from './geometry.js';

export const COLORS = {
  bg: '#0a1019',
  gridMinor: 'rgba(120, 155, 200, 0.07)',
  gridMajor: 'rgba(120, 155, 200, 0.16)',
  axis: 'rgba(150, 180, 220, 0.30)',
  limbEdge: 'rgba(120, 200, 220, 0.22)',
  curve: '#46d3c5',
  curveGlow: 'rgba(70, 211, 197, 0.35)',
  control: '#e6eefb',
  reference: '#a78bfa',
  comb: 'rgba(130, 220, 235, 0.55)',
  abrupt: '#f3c14b',
  seam: '#2aa7ff',
  seamFill: 'rgba(42, 167, 255, 0.07)',
  selfX: '#ff6b6b',
  scar: 'rgba(255, 138, 128, 0.14)',
  scarEdge: 'rgba(255, 138, 128, 0.35)',
  text: '#cfe0f5',
  textDim: '#7f93ae',
  ok: '#54d98c',
};

/** 基础视图：世界坐标（mm）→ 屏幕像素。纵向适度夸张以便观察轮廓起伏 */
export function makeView(samples, width, height, opts = {}) {
  const pad = opts.pad ?? 42;
  const bottom = opts.bottom ?? 54;
  const top = opts.top ?? 74;
  let x0 = samples[0].x;
  let x1 = samples[samples.length - 1].x;
  if (!(x1 - x0 > 1)) {
    x0 -= 20;
    x1 += 20;
  }
  let maxR = 1;
  for (const p of samples) maxR = Math.max(maxR, Math.abs(p.y));
  const availW = Math.max(80, width - pad * 2);
  const availH = Math.max(80, height - top - bottom);
  const scaleX = availW / (x1 - x0);
  const scaleY = (availH * 0.5) / maxR;
  const scale = Math.max(0.12, Math.min(scaleX, scaleY));
  const vy = clamp((availH * 0.46) / (maxR * scale), 1, 2.2);
  return {
    baseScale: scale,
    x0,
    x1,
    maxR,
    cx: (x0 + x1) / 2,
    vy,
    axisY: top + availH * 0.58,
    plotBottom: top + availH,
    plotTop: top,
  };
}

/** 带缩放平移的视口；缩放时保持轴心位置 */
export function makeViewport(base, width, height, zoom = 1, pan = { x: 0, y: 0 }) {
  const scale = base.baseScale * zoom;
  const vScale = scale * base.vy;
  const ox = width / 2 - base.cx * scale + (pan.x ?? 0);
  const oy = base.axisY + (pan.y ?? 0);
  return {
    scale,
    vScale,
    vy: base.vy,
    ox,
    oy,
    yTop: base.plotTop,
    yBottom: base.plotBottom,
    x0: base.x0,
    x1: base.x1,
    maxR: base.maxR,
    toScreen(p) {
      return { x: ox + p.x * scale, y: oy - p.y * vScale };
    },
    toWorld(px, py) {
      return { x: (px - ox) / scale, y: (oy - py) / vScale };
    },
  };
}

function pathFromPoints(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

/** 主建模视图 */
export function drawProfile(ctx, opts) {
  const {
    width, height, dpr = 1, samples, view, measurements = [], scars = [],
    showComb = true, showSeam = false, seamPoly = null, selfIntersections = [],
    showReference = false, refSpline = null, abruptSegments = [],
    deviationOverlay = false, deviationSegments = [], deviationThreshold = 5,
    hover = null, curvePoints = [], dragIndex = -1, showControl = true,
    strip = false,
    vy = 1,
  } = opts;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  const stripH = strip && deviationOverlay ? 56 : 0;
  drawGrid(ctx, width, height, view, stripH);

  if (!samples || samples.length < 2) {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('在画布上添加控制点以开始建模', width / 2, height / 2);
    ctx.restore();
    return;
  }

  drawScars(ctx, width, height, view, scars);
  drawLimbBody(ctx, view, samples);

  if (showReference && refSpline) drawReference(ctx, view, refSpline, samples);

  if (showSeam && seamPoly) drawSeam(ctx, view, samples, seamPoly, selfIntersections);

  if (deviationOverlay && deviationSegments.length) drawDeviationBands(ctx, view, samples, deviationSegments, height, strip && deviationOverlay);

  drawCurve(ctx, view, samples);

  if (showComb) drawComb(ctx, view, samples, abruptSegments);

  drawAbruptMarks(ctx, view, samples, abruptSegments);

  drawMeasurements(ctx, view, measurements);

  if (strip && deviationOverlay) {
    drawDeviationStrip(ctx, width, height, samples, deviationThreshold, deviationSegments);
  }

  if (showControl) drawControls(ctx, view, curvePoints, dragIndex, hover);

  ctx.restore();
}

function drawGrid(ctx, width, height, view, stripH = 0) {
  const step = view.scale > 3.2 ? 10 : view.scale > 1.6 ? 20 : 50;
  const p0 = view.toWorld(0, height);
  const p1 = view.toWorld(width, 0);
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, Consolas, monospace';
  for (let x = Math.floor(p0.x / step) * step; x <= p1.x; x += step) {
    const s = view.toScreen({ x, y: 0 });
    const major = Math.abs(x % (step * 5)) < 1e-6;
    ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
    ctx.beginPath();
    ctx.moveTo(s.x, 0);
    ctx.lineTo(s.x, height - stripH);
    ctx.stroke();
    if (major && !stripH) {
      ctx.fillStyle = 'rgba(150,180,220,.42)';
      ctx.textAlign = 'center';
      ctx.fillText(`${round(x, 0)}`, s.x, height - 10);
    }
  }
  for (let y = Math.ceil(p0.y / step) * step; y <= p1.y; y += step) {
    const s = view.toScreen({ x: 0, y });
    const major = Math.abs(y % (step * 5)) < 1e-6;
    ctx.strokeStyle = major ? COLORS.gridMajor : COLORS.gridMinor;
    ctx.beginPath();
    ctx.moveTo(0, s.y);
    ctx.lineTo(width, s.y);
    ctx.stroke();
    if (major && Math.abs(y) > 1e-6) {
      ctx.fillStyle = 'rgba(150,180,220,.34)';
      ctx.textAlign = 'left';
      ctx.fillText(`${round(Math.abs(y), 0)}`, 6, s.y - 3);
    }
  }
  const axis = view.toScreen({ x: 0, y: 0 });
  ctx.strokeStyle = COLORS.axis;
  ctx.setLineDash([2, 6]);
  ctx.beginPath();
  ctx.moveTo(0, axis.y);
  ctx.lineTo(width, axis.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(150,180,220,.5)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('肢体轴线 · 半径 mm', 8, axis.y - 6);
}

function drawScars(ctx, width, height, view, scars) {
  if (!scars.length) return;
  const axis = view.toScreen({ x: 0, y: 0 }).y;
  const topY = view.yTop - 18;
  for (const s of scars) {
    const a = view.toScreen({ x: s.start, y: 0 });
    const b = view.toScreen({ x: s.end, y: 0 });
    ctx.fillStyle = COLORS.scar;
    ctx.fillRect(a.x, topY, b.x - a.x, axis - topY);
    ctx.strokeStyle = COLORS.scarEdge;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(a.x, topY);
    ctx.lineTo(a.x, axis);
    ctx.moveTo(b.x, topY);
    ctx.lineTo(b.x, axis);
    ctx.stroke();
    ctx.setLineDash([]);

    // 标签放在瘢痕带内、贴近轴线处
    const cx = (a.x + b.x) / 2;
    ctx.fillStyle = 'rgba(255,180,170,.92)';
    ctx.font = '600 9.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`⚠ 瘢痕 ${s.severity}`, cx, axis - 20);
    ctx.fillStyle = 'rgba(255,180,170,.6)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`${s.start}–${s.end} mm`, cx, axis - 8);
  }
}

function drawLimbBody(ctx, view, samples) {
  const top = samples.map((p) => view.toScreen(p));
  const mirrorFits = view.maxR * view.vScale < (view.oy - view.yBottom - 6);
  const axis = view.toScreen({ x: 0, y: 0 }).y;
  const g = ctx.createLinearGradient(0, axis - view.maxR * view.vScale, 0, axis);
  g.addColorStop(0, 'rgba(70,211,197,.10)');
  g.addColorStop(1, 'rgba(42,167,255,.02)');

  if (mirrorFits) {
    const bottom = [];
    for (let i = samples.length - 1; i >= 0; i--) {
      bottom.push(view.toScreen({ x: samples[i].x, y: -samples[i].y }));
    }
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (const p of top) ctx.lineTo(p.x, p.y);
    for (const p of bottom) ctx.lineTo(p.x, p.y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = COLORS.limbEdge;
    ctx.lineWidth = 1;
    ctx.stroke();
    return;
  }

  // 仅上半断面：曲线到轴线之间着色
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  for (const p of top) ctx.lineTo(p.x, p.y);
  ctx.lineTo(top[top.length - 1].x, axis);
  ctx.lineTo(top[0].x, axis);
  ctx.closePath();
  ctx.fillStyle = g;
  ctx.fill();

  // 轴线以下画一条与轮廓平行的镜像虚线（示意完整肢体）
  const mirrored = samples.map((p) => view.toScreen({ x: p.x, y: -p.y }));
  pathFromPoints(ctx, mirrored);
  ctx.strokeStyle = 'rgba(120,200,220,.13)';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawReference(ctx, view, refSpline, samples) {
  const refPts = [];
  const n = 200;
  for (let i = 0; i <= n; i++) {
    const x = view.x0 + ((view.x1 - view.x0) * i) / n;
    refPts.push(view.toScreen({ x, y: refSpline.eval(x).y }));
  }
  pathFromPoints(ctx, refPts);
  ctx.setLineDash([7, 5]);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(167,139,250,.8)';
  ctx.stroke();
  ctx.setLineDash([]);

  // 控制点
  const cp = refSpline.xs.map((x, i) => view.toScreen({ x, y: refSpline.ys[i] }));
  for (const p of cp) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(167,139,250,.85)';
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(180,155,255,.92)';
  ctx.font = '600 10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const anchor = cp[0];
  ctx.fillText('虚线 = 教师参考轮廓', anchor.x + 4, anchor.y + 18);
}

function drawSeam(ctx, view, samples, seamPoly, selfIntersections) {
  const scr = seamPoly.map((p) => view.toScreen(p));
  const main = samples.map((p) => view.toScreen(p));
  ctx.beginPath();
  ctx.moveTo(main[0].x, main[0].y);
  for (const p of main) ctx.lineTo(p.x, p.y);
  for (let i = scr.length - 1; i >= 0; i--) ctx.lineTo(scr[i].x, scr[i].y);
  ctx.closePath();
  ctx.fillStyle = COLORS.seamFill;
  ctx.fill();

  pathFromPoints(ctx, scr);
  ctx.strokeStyle = COLORS.seam;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const h of selfIntersections) {
    const p = view.toScreen(h);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,86,86,.26)';
    ctx.fill();
    ctx.strokeStyle = COLORS.selfX;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y - 5);
    ctx.lineTo(p.x + 5, p.y + 5);
    ctx.moveTo(p.x + 5, p.y - 5);
    ctx.lineTo(p.x - 5, p.y + 5);
    ctx.stroke();
  }
}

function drawDeviationBands(ctx, view, samples, segments, height, hasStrip = false) {
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const pts = samples.filter((p) => p.x >= seg.startMM - 0.5 && p.x <= seg.endMM + 0.5);
    if (pts.length < 2) continue;
    const upper = pts.map((p) => view.toScreen(p));
    const lower = pts.map((p) => view.toScreen({ x: p.x, y: p.reference }));
    ctx.beginPath();
    ctx.moveTo(upper[0].x, upper[0].y);
    for (const p of upper) ctx.lineTo(p.x, p.y);
    for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,86,86,.26)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,107,107,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lower[0].x, lower[0].y);
    for (const p of lower) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,107,107,.95)';
    ctx.lineWidth = 3;
    pathFromPoints(ctx, upper);
    ctx.stroke();
    // 区段端点
    for (const e of [upper[0], upper[upper.length - 1]]) {
      const lo = lower[e === upper[0] ? 0 : lower.length - 1];
      ctx.strokeStyle = 'rgba(255,120,120,.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(lo.x, lo.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 偏差刻度：每隔 4 个采样画一条细竖线，直观显示超出幅度
    ctx.strokeStyle = 'rgba(255,120,120,.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < upper.length; i += 4) {
      ctx.beginPath();
      ctx.moveTo(upper[i].x, upper[i].y);
      ctx.lineTo(lower[i].x, lower[i].y);
      ctx.stroke();
    }
    // 超标标注（带底色的胶囊，避免压住曲线）
    const midIdx = Math.floor(upper.length / 2);
    const below = lower[midIdx];
    const dir = seg.signed >= 0 ? '偏外' : '偏内';
    const text = `${dir} ${Math.abs(seg.maxAbs).toFixed(1)} mm`;
    ctx.font = '600 10px ui-monospace, monospace';
    const tw = ctx.measureText(text).width + 12;
    let bx = clamp(upper[midIdx].x - tw / 2, 4, view.ox + view.x1 * view.scale - tw - 4);
    // 轴下方两条通道；若空间不足则整体上移到偏差带之上
    const axisY = view.toScreen({ x: 0, y: 0 }).y;
    const limit = height - (hasStrip ? 84 : 16);
    let lane0 = axisY + 54;
    if (lane0 + 36 > limit) lane0 = limit - 36;
    const by = lane0 + (si % 2) * 18;
    ctx.fillStyle = 'rgba(30,10,14,.86)';
    ctx.strokeStyle = 'rgba(255,107,107,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, tw, 17, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,178,178,.98)';
    ctx.textAlign = 'center';
    ctx.fillText(text, bx + tw / 2, by + 12);
    // 指向线（从区段中点垂直引到胶囊）
    ctx.strokeStyle = 'rgba(255,107,107,.28)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(upper[midIdx].x, upper[midIdx].y);
    ctx.lineTo(bx + tw / 2, by);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCurve(ctx, view, samples) {
  const pts = samples.map((p) => view.toScreen(p));
  ctx.save();
  ctx.shadowColor = COLORS.curveGlow;
  ctx.shadowBlur = 12;
  pathFromPoints(ctx, pts);
  ctx.strokeStyle = 'rgba(70,211,197,.5)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  pathFromPoints(ctx, pts);
  ctx.strokeStyle = COLORS.curve;
  ctx.lineWidth = 2.1;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawComb(ctx, view, samples, abruptSegments) {
  let maxK = 1e-9;
  for (const p of samples) if (p.kappa > maxK) maxK = p.kappa;
  const maxLen = clamp(view.scale * 16, 14, 62);
  const sp = samples.map((p) => view.toScreen(p));
  const env = [];
  ctx.lineWidth = 1;
  for (let i = 0; i < samples.length; i += 2) {
    const p = samples[i];
    const a = sp[i];
    const prev = sp[Math.max(0, i - 2)];
    const next = sp[Math.min(sp.length - 1, i + 2)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) continue;
    // 屏幕空间法线（指向肢体外侧，即屏幕上方）
    let nx = -ty / tl;
    let ny = tx / tl;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const len = (p.kappa / maxK) * maxLen;
    const b = { x: a.x + nx * len, y: a.y + ny * len };
    env.push(b);
    if (len < 0.5) continue;
    const isAbrupt = abruptSegments.some((v) => p.x >= v.startMM - 0.5 && p.x <= v.endMM + 0.5);
    ctx.strokeStyle = isAbrupt ? 'rgba(243,193,75,.9)' : COLORS.comb;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (env.length > 1) {
    pathFromPoints(ctx, env);
    ctx.strokeStyle = 'rgba(130,220,235,.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawAbruptMarks(ctx, view, samples, segments) {
  if (!segments.length) return;
  // 相邻区段（间距 < 10 mm）合并为一组，避免标签互相压叠
  const groups = [];
  for (const seg of segments) {
    const last = groups[groups.length - 1];
    if (last && seg.startMM - last.endMM < 10) last.endMM = Math.max(last.endMM, seg.endMM);
    else groups.push({ startMM: seg.startMM, endMM: seg.endMM });
  }

  for (const g of groups) {
    const pts = samples.filter((p) => p.x >= g.startMM - 0.5 && p.x <= g.endMM + 0.5);
    if (pts.length < 2) continue;
    const scr = pts.map((p) => view.toScreen(p));
    const a = scr[0];
    const b = scr[scr.length - 1];
    // 黄色高亮带
    ctx.strokeStyle = 'rgba(243,193,75,.85)';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (const p of scr) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // 组标签贴在带上方；相邻组距离过近时错开一行
    const mid = scr[Math.floor(scr.length / 2)];
    const count = segments.filter((sg) => sg.startMM >= g.startMM - 0.5 && sg.endMM <= g.endMM + 0.5).length;
    const label = count > 1 ? `曲率突变 ×${count}` : '曲率突变';
    ctx.font = '600 9.5px ui-monospace, monospace';
    const tw = ctx.measureText(label).width;
    const prev = groups[groups.indexOf(g) - 1];
    const near = prev && (g.startMM - prev.endMM) < 40 && g.startMM < 300;
    const minY = Math.min(...scr.map((p) => p.y));
    const y = Math.max(view.yTop + 10, minY - 12) - (near ? 14 : 0);
    ctx.fillStyle = 'rgba(243,193,75,.95)';
    ctx.textAlign = 'center';
    ctx.fillText(label, clamp(mid.x, tw / 2 + 6, ctx.canvas.width - tw / 2 - 6), y);
  }
}

function drawMeasurements(ctx, view, measurements) {
  const axis = view.toScreen({ x: 0, y: 0 }).y;
  for (const m of measurements) {
    const p = view.toScreen({ x: m.pos, y: 0 });
    ctx.strokeStyle = 'rgba(120,160,210,.2)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x, view.yTop);
    ctx.lineTo(p.x, axis + 10);
    ctx.stroke();
    ctx.setLineDash([]);
    // 刻度小横线
    ctx.strokeStyle = 'rgba(140,175,215,.55)';
    ctx.beginPath();
    ctx.moveTo(p.x - 4, axis + 10);
    ctx.lineTo(p.x + 4, axis + 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,190,225,.8)';
    ctx.font = '9.5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${m.circ}`, p.x, axis + 23);
    ctx.fillStyle = 'rgba(110,140,175,.55)';
    ctx.font = '8.5px ui-monospace, monospace';
    ctx.fillText(`${m.pos}`, p.x, axis + 34);
  }
}

function drawDeviationStrip(ctx, width, height, samples, threshold, segments) {
  const h = 62;
  const top = height - h;
  const left = 66;
  const right = width - 20;
  const mid = top + 32;
  const half = 17;
  let span = 12;
  for (const p of samples) {
    if (p.reference === undefined) continue;
    const d = Math.abs(p.y - p.reference);
    if (d > span - 1) span = d + 2;
  }
  span = Math.min(span, 40);
  const mapY = (d) => mid - clamp(d / span, -1.05, 1.05) * half;
  const x0 = samples[0].x;
  const x1 = samples[samples.length - 1].x;
  const mapX = (x) => left + ((x - x0) / Math.max(x1 - x0, 1)) * (right - left);

  // 底板
  ctx.fillStyle = 'rgba(9,15,24,.92)';
  ctx.fillRect(0, top, width, h);
  ctx.strokeStyle = 'rgba(120,155,200,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(width, top + 0.5);
  ctx.stroke();

  // 阈值带
  ctx.fillStyle = 'rgba(255,107,107,.05)';
  ctx.fillRect(left, mapY(threshold), right - left, mapY(-threshold) - mapY(threshold));
  ctx.strokeStyle = 'rgba(120,155,200,.24)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(left, mapY(threshold));
  ctx.lineTo(right, mapY(threshold));
  ctx.moveTo(left, mapY(-threshold));
  ctx.lineTo(right, mapY(-threshold));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(120,155,200,.3)';
  ctx.beginPath();
  ctx.moveTo(left, mid);
  ctx.lineTo(right, mid);
  ctx.stroke();

  // 左侧刻度
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(160,190,225,.6)';
  ctx.fillText(`+${threshold}`, left - 8, mapY(threshold) + 3);
  ctx.fillText('0', left - 8, mid + 3);
  ctx.fillText(`-${threshold}`, left - 8, mapY(-threshold) + 3);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(150,175,205,.7)';
  ctx.font = '600 9.5px system-ui, sans-serif';
  ctx.fillText('逐点偏差 Δr', 8, top + 12);
  ctx.fillStyle = 'rgba(120,150,185,.6)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillText('单位 mm', 8, top + 24);

  const devs = samples.map((p) => ({ x: p.x, dev: p.y - (p.reference ?? p.y) }));
  const inSeg = (x) => segments.some((s) => x >= s.startMM - 0.5 && x <= s.endMM + 0.5);

  // 正常段（青色）
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  for (const d of devs) {
    if (inSeg(d.x)) { started = false; continue; }
    const px = mapX(d.x);
    const py = mapY(d.dev);
    if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = 'rgba(70,211,197,.8)';
  ctx.stroke();

  // 超标段（红色）+ 末端标记
  for (const seg of segments) {
    const pts = devs.filter((d) => d.x >= seg.startMM - 0.5 && d.x <= seg.endMM + 0.5);
    if (pts.length < 2) continue;
    pathFromPoints(ctx, pts.map((d) => ({ x: mapX(d.x), y: mapY(d.dev) })));
    ctx.strokeStyle = COLORS.selfX;
    ctx.lineWidth = 2.6;
    ctx.stroke();

    const peak = pts.reduce((a, d) => (Math.abs(d.dev) > Math.abs(a.dev) ? d : a), pts[0]);
    const px = mapX(peak.x);
    ctx.beginPath();
    ctx.arc(px, mapY(peak.dev), 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.selfX;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,170,170,.95)';
    ctx.font = '600 8.5px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const above = peak.dev > 0;
    const ly = clamp(mapY(peak.dev) + (above ? -7 : 12), top + 10, height - 8);
    ctx.fillText(`${Math.abs(peak.dev).toFixed(1)}mm`, clamp(px, left + 16, right - 16), ly);
  }

  // 横轴标注（任务首末位置）
  ctx.fillStyle = 'rgba(120,150,185,.5)';
  ctx.font = '8.5px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${x0.toFixed(0)}`, left, height - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${x1.toFixed(0)} mm`, right, height - 6);
}

function drawControls(ctx, view, points, dragIndex, hover) {
  for (let i = 0; i < points.length; i++) {
    const p = view.toScreen(points[i]);
    const active = i === dragIndex;
    const over = hover && Math.abs(hover.x - p.x) < 9 && Math.abs(hover.y - p.y) < 9;
    const r = active ? 8 : over ? 7 : 5.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = active ? 'rgba(70,211,197,.22)' : 'rgba(230,238,251,.08)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = active ? COLORS.curve : COLORS.control;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,16,25,.9)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (active || over) {
      const label = `${points[i].x.toFixed(0)} / ${points[i].y.toFixed(1)}`;
      ctx.font = '600 10px ui-monospace, monospace';
      const w = ctx.measureText(label).width + 12;
      let bx = p.x + 12;
      let by = p.y - 26;
      if (bx + w > view.ox + (view.x1 + 60) * view.scale) bx = p.x - w - 12;
      ctx.fillStyle = 'rgba(10,16,25,.92)';
      ctx.strokeStyle = 'rgba(70,211,197,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx, by, w, 19, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.textAlign = 'left';
      ctx.fillText(label, bx + 6, by + 13);
    }
  }
}

/** 下料图渲染（独立画布） */
export function drawPattern(ctx, opts) {
  const {
    width, height, dpr = 1, pattern, offsetMM = 0, taskTitle = '', studentName = '',
    showGrid = true, showDims = true, showSeam = true, paper = null,
  } = opts;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7f4ec';
  ctx.fillRect(0, 0, width, height);

  if (!pattern) {
    ctx.fillStyle = '#8a8272';
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('尚未生成下料图', width / 2, height / 2);
    ctx.restore();
    return;
  }

  const rows = pattern.rows;
  const lenMM = pattern.lengthMM;
  const maxHalf = Math.max(...rows.map((r) => r.halfWidth));
  const padX = 62;
  const padY = 74;
  const scale = Math.min((width - padX * 2) / Math.max(lenMM, 1), (height - padY * 2) / Math.max(maxHalf * 2, 1));
  const ox = (width - lenMM * scale) / 2;
  const oy = height / 2;

  if (showGrid) {
    // 10 mm 方格纸
    const stepMM = 10;
    const stepPx = stepMM * scale;
    if (stepPx > 4) {
      ctx.strokeStyle = 'rgba(120,130,150,.22)';
      ctx.lineWidth = 1;
      const xStart = ox - Math.ceil(ox / stepPx) * stepPx;
      for (let x = xStart; x < width; x += stepPx) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      const yStart = oy - Math.ceil(oy / stepPx) * stepPx;
      for (let y = yStart; y < height; y += stepPx) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(120,130,150,.14)';
      for (let x = xStart + stepPx / 2; x < width; x += stepPx) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let y = yStart + stepPx / 2; y < height; y += stepPx) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
      }
    }
  }

  // 缝份轮廓（外）
  const map = (s, half) => ({ x: ox + s * scale, y: oy - half * scale });
  const left = rows.map((r) => map(r.s, r.halfWidth));
  const right = rows.map((r) => map(r.s, -r.halfWidth));
  const all = [...left, ...right.slice().reverse()];
  pathFromPoints(ctx, all);
  ctx.fillStyle = 'rgba(42,167,255,.05)';
  ctx.fill();
  ctx.strokeStyle = '#2a6fa0';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // 净样线（不含缝份）
  const innerHalf = rows.map((r) => r.circ / 2);
  const iLeft = rows.map((r, i) => map(r.s, innerHalf[i] + 0));
  const iRight = rows.map((r, i) => map(r.s, -innerHalf[i]));
  const inner = [...iLeft, ...iRight.slice().reverse()];
  pathFromPoints(ctx, inner);
  ctx.strokeStyle = '#8a8272';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 对位标记（中点与四等分）
  if (showSeam) {
    for (const r of [rows[0], rows[Math.floor(rows.length / 2)], rows[rows.length - 1]]) {
      const x = ox + r.s * scale;
      ctx.strokeStyle = 'rgba(42,111,160,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, oy + 8);
      ctx.lineTo(x, oy - 8);
      ctx.stroke();
    }
  }

  // 尺寸标注
  if (showDims) {
    const yb = oy + maxHalf * scale;
    drawDim(ctx, ox, yb + 24, ox + lenMM * scale, yb + 24, `${lenMM.toFixed(0)} mm`, '#2a6fa0');
    drawDim(ctx, ox + lenMM * scale + 22, oy - maxHalf * scale, ox + lenMM * scale + 22, oy + maxHalf * scale, `${(maxHalf * 2).toFixed(0)} mm`, '#2a6fa0', true);
  }

  // 标题栏
  ctx.fillStyle = 'rgba(42,50,60,.92)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`下料图 · ${taskTitle}`, 20, 24);
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = 'rgba(90,100,115,.95)';
  ctx.fillText(`${studentName} · 面积 ${pattern.areaCM2.toFixed(0)} cm² · 周长 ${pattern.perimeterCM.toFixed(1)} cm · 缝份 ${offsetMM} mm ×2`, 20, 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(42,111,160,.95)';
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.fillText(`1 mm 图上 = ${(1 / scale).toFixed(2)} mm 实际`, width - 20, 24);
  ctx.fillStyle = 'rgba(90,100,115,.95)';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`${pattern.lengthMM.toFixed(0)} × ${(maxHalf * 2).toFixed(0)} mm · 净样 + 缝份`, width - 20, 40);

  // 裁切角标
  ctx.strokeStyle = 'rgba(42,50,60,.5)';
  ctx.lineWidth = 1.2;
  const m = 12;
  for (const [cx0, cy0, dx, dy] of [
    [m, m, 1, 1], [width - m, m, -1, 1], [m, height - m, 1, -1], [width - m, height - m, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx0 + dx * 16, cy0);
    ctx.lineTo(cx0, cy0);
    ctx.lineTo(cx0, cy0 + dy * 16);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDim(ctx, x1, y1, x2, y2, label, color, vertical = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5);
    ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  if (vertical) {
    ctx.save();
    ctx.translate((x1 + x2) / 2 + 12, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  } else {
    ctx.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 6);
  }
}

/** 瘢痕位置示意图（小画布） */
export function drawScarMap(ctx, opts) {
  const { width, height, dpr = 1, scars = [], span, limbName = '' } = opts;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0d1522';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(110,140,180,.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  const x0 = 34;
  const x1 = width - 20;
  const axisY = height / 2;
  const mapX = (mm) => x0 + ((mm - span[0]) / (span[1] - span[0]) * (x1 - x0));

  // 肢体示意
  ctx.beginPath();
  ctx.moveTo(mapX(span[0]), axisY - 22);
  ctx.bezierCurveTo(mapX(span[0] + (span[1] - span[0]) * 0.33), axisY - 34, mapX(span[0] + (span[1] - span[0]) * 0.7), axisY - 30, mapX(span[1]), axisY - 20);
  ctx.bezierCurveTo(mapX(span[0] + (span[1] - span[0]) * 0.7), axisY + 30, mapX(span[0] + (span[1] - span[0]) * 0.33), axisY + 34, mapX(span[0]), axisY + 22);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, axisY - 30, 0, axisY + 30);
  g.addColorStop(0, 'rgba(70,211,197,.14)');
  g.addColorStop(1, 'rgba(42,167,255,.04)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,220,.32)';
  ctx.stroke();

  // 瘢痕区
  for (const s of scars) {
    const a = mapX(s.start);
    const b = mapX(s.end);
    const grad = ctx.createLinearGradient(0, axisY - 22, 0, axisY + 22);
    grad.addColorStop(0, 'rgba(255,138,128,.06)');
    grad.addColorStop(0.5, 'rgba(255,138,128,.28)');
    grad.addColorStop(1, 'rgba(255,138,128,.06)');
    ctx.fillStyle = grad;
    ctx.fillRect(a, axisY - 32, b - a, 64);
    ctx.strokeStyle = 'rgba(255,138,128,.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(a, axisY - 32); ctx.lineTo(a, axisY + 32);
    ctx.moveTo(b, axisY - 32); ctx.lineTo(b, axisY + 32);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,175,165,.9)';
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.severity, (a + b) / 2, axisY - 38);
    ctx.font = '8.5px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,175,165,.55)';
    ctx.fillText(`${s.start}–${s.end}`, (a + b) / 2, axisY + 44);
  }

  // 刻度
  ctx.strokeStyle = 'rgba(110,140,180,.32)';
  ctx.fillStyle = 'rgba(140,165,195,.7)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const span2 = span[1] - span[0];
  const step = span2 > 250 ? 50 : 25;
  for (let m = Math.ceil(span[0] / step) * step; m <= span[1]; m += step) {
    const x = mapX(m);
    ctx.beginPath();
    ctx.moveTo(x, axisY + 52);
    ctx.lineTo(x, axisY + 57);
    ctx.stroke();
    ctx.fillText(`${m}`, x, axisY + 68);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(140,165,195,.55)';
  ctx.font = '9.5px system-ui, sans-serif';
  ctx.fillText(limbName, 8, 14);
  ctx.restore();
}
