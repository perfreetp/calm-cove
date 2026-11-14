import {
  path2dFromSubpaths, subpathVertices, segmentsOf, polylineSubpath, circleSubpath,
  roundedRectSubpath, ngonSubpath, subpathsBBox, translateSubpaths, scaleSubpaths,
  booleanSubpaths, flattenSubpath, rotateSubpaths, dist, strokeOutlineSubpaths,
} from './geom.js';
import { layerSubpaths, plateSubpaths, layerBBox, textLayoutFor, shapeSubpaths, layerSubpaths as getSubs, PALETTE } from './model.js';

export const GRID = 8;

export function snapValue(v, grid = GRID) {
  return Math.round(v / grid) * grid;
}

/** Snap one point to grid and to existing vertices within `radius` mm. */
export function snapPoint(p, ctx, opts = {}) {
  const { grid = GRID, vertices = [], radius = 10, activeId = null } = opts;
  let best = null, bestD = radius;
  for (const v of vertices) {
    if (activeId && v.layerId === activeId) continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    if (d < bestD) { bestD = d; best = v; }
  }
  if (best) return { x: best.x, y: best.y, snappedTo: best };
  return { x: snapValue(p.x, grid), y: snapValue(p.y, grid), snappedTo: null };
}

export function collectVertices(doc, excludeLayerId = null) {
  const out = [];
  for (const layer of doc.layers) {
    if (layer.id === excludeLayerId) continue;
    if (!layer.visible) continue;
    if (layer.type === 'text') {
      const l = textLayoutFor(layer);
      // anchor points: centre-top, centre, left-top, right-top
      out.push(
        { x: layer.x, y: layer.y, layerId: layer.id, kind: 'text-anchor' },
        { x: layer.x - l.width / 2, y: layer.y, layerId: layer.id, kind: 'text-box' },
        { x: layer.x + l.width / 2, y: layer.y, layerId: layer.id, kind: 'text-box' },
        { x: layer.x, y: layer.y + l.height, layerId: layer.id, kind: 'text-box' }
      );
      continue;
    }
    const subs = getSubs(layer, doc);
    for (const s of subs) for (const p of s.pts) if (Math.abs(p.x) < 1e7) out.push({ x: p.x, y: p.y, layerId: layer.id, kind: 'vertex' });
  }
  return out;
}

export function hitTestLayers(doc, p, tolMm) {
  const hits = [];
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    if (!layer.visible || layer.locked) continue;
    if (layer.type === 'text') {
      const l = textLayoutFor(layer);
      const bb = textBBoxOf(layer, l);
      if (p.x >= bb.x - tolMm && p.x <= bb.x + bb.width + tolMm && p.y >= bb.y - tolMm && p.y <= bb.y + bb.height + tolMm) {
        hits.push({ layer, kind: 'text' });
      }
      continue;
    }
    const subs = getSubs(layer, doc);
    const bb = subpathsBBox(subs);
    if (p.x < bb.x - tolMm || p.x > bb.x + bb.width + tolMm || p.y < bb.y - tolMm || p.y > bb.y + bb.height + tolMm) continue;
    let inside = false;
    let nearEdge = false;
    const tol = Math.max(tolMm, (layer.strokeWidth || 0) / 2 + tolMm);
    for (const s of subs) {
      const ring = flattenSubpath(s, 0.6);
      if (ring.length < 2) continue;
      // even-odd inside test over all subpaths
      if (pointInFlatRing(p.x, p.y, ring)) inside = !inside;
      for (let k = 0; k < ring.length; k++) {
        const a = ring[k], b = ring[(k + 1) % ring.length];
        if (segDist(p, a, b) <= tol) nearEdge = true;
      }
      // fill with no fill but stroke: only edges count
    }
    if (inside || nearEdge || layer.fill === null) {
      if (layer.fill === null && !layer.stroke) continue;
      if (layer.fill === null && !nearEdge) continue;
      hits.push({ layer, kind: 'shape', inside, nearEdge });
      break;
    }
  }
  return hits[0] || null;
}

function textBBoxOf(layer, l) {
  if (layer.align === 'left') return { x: layer.x, y: layer.y, width: l.width, height: l.height };
  if (layer.align === 'right') return { x: layer.x - l.width, y: layer.y, width: l.width, height: l.height };
  return { x: layer.x - l.width / 2, y: layer.y, width: l.width, height: l.height };
}

function pointInFlatRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a[0] + t * dx), p.y - (a[1] + t * dy));
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

export class EditorRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pathCache = new Map();
  }

  pathFor(layer, doc) {
    const subs = getSubs(layer, doc);
    const key = layer.id + '|' + subs.length + '|' + (subs.length ? subs[0].pts.length : 0) + '|' + JSON.stringify(layer.params);
    const hit = this.pathCache.get(layer.id);
    if (hit && hit.key === key && hit.subsRef === subs) return hit.path;
    const path = path2dFromSubpaths(subs);
    this.pathCache.set(layer.id, { key, subsRef: subs, path });
    if (this.pathCache.size > 500) this.pathCache.clear();
    return path;
  }

  render(view, opts) {
    const { doc, dpr = 1, width, height, scale, panX, panY, selection, showGuides, showGrid, safeMargin,
      marquee, hoveredLayerId, commentMode, overlayComments, diffRings, compare, penPreview } = opts;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!opts.transparentBg) {
      ctx.fillStyle = '#20242b';
      ctx.fillRect(0, 0, width, height);
    }

    // work area shadow
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // paper / plate backdrop
    if (!opts.transparentBg) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 24 / scale;
      ctx.shadowOffsetY = 8 / scale;
      ctx.fillStyle = 'rgba(0,0,0,0.001)';
      const plate = plateSubpaths(doc);
      ctx.fill(path2dFromSubpaths(plate));
      ctx.restore();
    }

    const isCompare = compare && compare.enabled;

    ctx.save();
    if (isCompare) {
      // draw the other version at 35% for overlay comparison, then diff highlights
      if (compare.ghostSubpaths && compare.ghostSubpaths.length) {
        ctx.globalAlpha = compare.mode === 'sidebyside' ? 1 : 0.30;
        ctx.fillStyle = '#9fb3c8';
        for (const layer of compare.ghostLayers) {
          const p = this.pathFor(layer, compare.ghostDoc);
          if (layer.fill) { ctx.fillStyle = layer.fill; ctx.globalAlpha = 0.22; ctx.fill(p); }
          if (layer.stroke) { ctx.strokeStyle = layer.stroke; ctx.globalAlpha = 0.3; ctx.lineWidth = layer.strokeWidth; ctx.stroke(p); }
        }
        ctx.globalAlpha = 1;
      }
    }

    for (const layer of doc.layers) {
      if (!layer.visible) continue;
      if (isCompare && compare.mode === 'diffonly') {
        // dim everything, then highlight the diff
        ctx.globalAlpha = 0.22;
      }
      this.drawLayer(ctx, layer, doc, scale, opts);
      ctx.globalAlpha = 1;
    }

    if (isCompare && diffRings && diffRings.length) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,92,128,0.45)';
      ctx.strokeStyle = '#ff2d6f';
      ctx.lineWidth = 2.2 / scale;
      for (const ring of diffRings) {
        const p = path2dFromSubpaths([polylineSubpath(ring, true)]);
        ctx.fill(p);
        ctx.stroke(p);
      }
      ctx.restore();
    }
    ctx.restore();

    // guides
    if (showGuides) this.drawGuides(ctx, doc, scale, opts);
    if (showGrid) this.drawGrid(ctx, doc, scale, panX, panY, width, height);

    // selection overlay
    if (selection) this.drawSelection(ctx, doc, selection, scale);

    // hover
    if (hoveredLayerId && (!selection || hoveredLayerId !== selection.layerIds?.[0])) {
      const layer = doc.layers.find((l) => l.id === hoveredLayerId);
      if (layer) this.drawOutline(ctx, layer, doc, scale, 'rgba(255,255,255,0.45)', 1.5);
    }

    // comments
    if (overlayComments && overlayComments.length) {
      for (const c of overlayComments) {
        if (c.kind === 'point' && c.x != null) {
          this.drawPin(ctx, c, scale);
        }
      }
      for (const c of overlayComments) {
        if (c.kind === 'layer' && c.layerId) {
          const layer = doc.layers.find((l) => l.id === c.layerId);
          if (layer) {
            this.drawOutline(ctx, layer, doc, scale, c.status === 'closed' ? 'rgba(74,222,128,0.85)' : 'rgba(255,190,60,0.95)', 3);
            this.drawPinAtBBox(ctx, layer, doc, c, scale);
          }
        }
      }
    }

    // marquee
    if (marquee) {
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'rgba(96,180,255,0.9)';
      ctx.fillStyle = 'rgba(96,180,255,0.15)';
      ctx.lineWidth = 1;
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
      ctx.restore();
    }

    // pen preview
    if (penPreview && penPreview.points && penPreview.points.length) {
      ctx.save();
      const pts = penPreview.points;
      ctx.strokeStyle = '#ffcc33';
      ctx.lineWidth = 1.8 / scale;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (penPreview.cursor) ctx.lineTo(penPreview.cursor.x, penPreview.cursor.y);
      ctx.stroke();
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5 / scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ffcc33';
        ctx.fill();
      }
      if (penPreview.closed && pts.length > 2) {
        // hint closing edge
        const a = pts[0], b = pts[pts.length - 1];
        ctx.strokeStyle = 'rgba(255,204,51,0.5)';
        ctx.setLineDash([5 / scale, 5 / scale]);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // screen-space HUD: comment crosshair
    if (commentMode) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const c = opts.pointerScreen;
      if (c) {
        ctx.strokeStyle = 'rgba(255,190,60,0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(c.x - 10, c.y); ctx.lineTo(c.x + 10, c.y);
        ctx.moveTo(c.x, c.y - 10); ctx.lineTo(c.x, c.y + 10);
        ctx.stroke();
      }
    }
  }

  drawLayer(ctx, layer, doc, scale, opts) {
    if (layer.type === 'text') {
      const path = this.pathFor(layer, doc);
      if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(path); }
      if (layer.stroke && layer.strokeWidth) {
        ctx.strokeStyle = layer.stroke; ctx.lineWidth = layer.strokeWidth; ctx.stroke(path);
      }
      return;
    }
    const path = this.pathFor(layer, doc);
    if (layer.kind === 'plate' && layer.fill == null) {
      ctx.fillStyle = '#f2f4f7';
      ctx.fill(path);
      return;
    }
    if (layer.fill) { ctx.fillStyle = layer.fill; ctx.fill(path); }
    if (layer.stroke && layer.strokeWidth) {
      ctx.strokeStyle = layer.stroke;
      ctx.lineJoin = 'round';
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke(path);
    }
  }

  drawOutline(ctx, layer, doc, scale, color, w) {
    const bb = layer.type === 'text' ? this.textBB(layer) : subpathsBBox(getSubs(layer, doc));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = w / scale;
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);
    ctx.restore();
  }

  textBB(layer) {
    const l = textLayoutFor(layer);
    if (layer.align === 'left') return { x: layer.x, y: layer.y, width: l.width, height: l.height };
    if (layer.align === 'right') return { x: layer.x - l.width, y: layer.y, width: l.width, height: l.height };
    return { x: layer.x - l.width / 2, y: layer.y, width: l.width, height: l.height };
  }

  drawSelection(ctx, doc, selection, scale) {
    const layerIds = selection.layerIds || [];
    const showHandles = selection.showHandles !== false && selection.mode !== 'vertex';
    for (const id of layerIds) {
      const layer = doc.layers.find((l) => l.id === id);
      if (!layer) continue;
      const bb = layer.type === 'text' ? this.textBB(layer) : subpathsBBox(getSubs(layer, doc));
      ctx.save();
      ctx.strokeStyle = '#4ea8ff';
      ctx.lineWidth = 2 / scale;
      ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);
      if (showHandles) {
        const hs = selection.handles;
        const size = 9 / scale;
        const pts = hs || this.handlePoints(bb, selection.keepAspect);
        for (const h of pts) {
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#1a7fd4';
          ctx.lineWidth = 1.5 / scale;
          ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
          ctx.strokeRect(h.x - size / 2, h.y - size / 2, size, size);
        }
      }
      ctx.restore();
    }
    // vertex handles for path edit mode
    if (selection.mode === 'vertex' && (selection.vertexLayer || selection.vertexLayerId)) {
      const layer = selection.vertexLayer || doc.layers.find((l) => l.id === selection.vertexLayerId);
      if (!layer) return;
      const subs = getSubs(layer, doc);
      ctx.save();
      for (const s of subs) {
        for (const p of s.pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5 / scale, 0, Math.PI * 2);
          ctx.fillStyle = '#ffcc33';
          ctx.fill();
          ctx.strokeStyle = '#8a6a00';
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
          for (const h of [p.cIn, p.cOut]) {
            if (!h) continue;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 3 / scale, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#c08a00';
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(h.x, h.y);
            ctx.strokeStyle = 'rgba(255,204,51,0.7)';
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }

  handlePoints(bb, keepAspect) {
    const xs = [bb.x, bb.x + bb.width / 2, bb.x + bb.width];
    const ys = [bb.y, bb.y + bb.height / 2, bb.y + bb.height];
    const out = [];
    for (let iy = 0; iy < 3; iy++) for (let ix = 0; ix < 3; ix++) {
      if (ix === 1 && iy === 1) continue;
      out.push({ x: xs[ix], y: ys[iy], hx: ix, hy: iy, cursor: handleCursor(ix, iy), corner: ix !== 1 && iy !== 1 });
    }
    return out;
  }

  drawGuides(ctx, doc, scale, opts) {
    const sm = opts.safeMargin ?? doc.safeMargin ?? 0;
    if (sm > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,214,102,0.9)';
      ctx.lineWidth = Math.max(1.2 / scale, 0.4);
      ctx.setLineDash([10 / scale, 6 / scale]);
      const isCircle = doc.plate?.shape === 'circle';
      if (isCircle) {
        const r = Math.min(doc.width, doc.height) / 2 - sm;
        ctx.beginPath();
        ctx.arc(doc.width / 2, doc.height / 2, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(sm, sm, doc.width - sm * 2, doc.height - sm * 2);
      }
      ctx.restore();
      // safe-margin callouts
      if (scale * sm > 14) {
        ctx.save();
        ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
        const p0 = this.screenOf(opts, 0, sm);
        ctx.fillStyle = 'rgba(255,214,102,0.85)';
        ctx.font = '9.5px sans-serif';
        if (!isCircle) {
          const label = `安全边距 ${sm}mm`;
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = 'rgba(16,20,26,0.72)';
          ctx.fillRect(p0.x + 1, p0.y - 14, tw + 8, 13);
          ctx.fillStyle = 'rgba(255,214,102,0.9)';
          ctx.fillText(label, p0.x + 5, p0.y - 4);
        }
        ctx.restore();
      }
    }

    // minimum legibility distance ladder (derived from the active text height)
    const lig = opts.legibility;
    if (lig && lig.charHeight > 0 && opts.showLegibilityRail !== false) {
      this.drawLegibilityRail(ctx, doc, scale, opts, lig);
    }

  }

  screenOf(opts, x, y) {
    return { x: opts.panX + x * opts.scale, y: opts.panY + y * opts.scale };
  }

  /**
   * A distance ladder along the bottom of the work area. Each stop marks where a
   * driver at that distance sees the sign, computed from the legibility ratio.
   * Dashed red when the current character height can't reach the design speed.
   */
  drawLegibilityRail(ctx, doc, scale, opts, lig) {
    ctx.save();
    ctx.setTransform(opts.dpr, 0, 0, opts.dpr, 0, 0);
    // Pinned to the bottom of the viewport (not the document) so it always reads.
    const y = opts.height - 44;
    const left = 18;
    const right = opts.width - 18;
    if (right - left < 200) { ctx.restore(); return; }
    const stops = [40, 60, 80, 100, 120, 160].filter((d) => d <= Math.max(160, lig.distance * 1.5));
    const maxD = stops[stops.length - 1] || 160;
    ctx.strokeStyle = 'rgba(140,160,185,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.font = '9.5px sans-serif';
    for (const d of stops) {
      const x = left + ((right - left) * d) / maxD;
      const ok = d <= lig.distance;
      ctx.strokeStyle = ok ? 'rgba(90,200,140,0.55)' : 'rgba(255,120,140,0.45)';
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
      ctx.fillStyle = ok ? 'rgba(140,220,175,0.8)' : 'rgba(255,150,165,0.65)';
      const labelX = Math.min(x - 8, right - 26);
      ctx.fillText(`${d}m`, labelX, y + 16);
    }
    const dx = left + ((right - left) * Math.min(lig.distance, maxD)) / maxD;
    ctx.fillStyle = lig.meetsSpeed ? '#4ade80' : '#ffb547';
    ctx.beginPath(); ctx.arc(dx, y, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,214,230,0.7)';
    ctx.fillText(`字高 ${lig.charHeight.toFixed(0)}mm → 最小视认距离 ${lig.distance.toFixed(0)}m`, left, y - 9);
    if (doc.targetDistance > 0) {
      const tx = left + ((right - left) * Math.min(doc.targetDistance, maxD)) / maxD;
      ctx.strokeStyle = lig.meetsTarget ? 'rgba(90,200,140,0.9)' : 'rgba(255,92,128,0.9)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(tx, y - 15); ctx.lineTo(tx, y + 8); ctx.stroke();
      ctx.fillStyle = lig.meetsTarget ? '#4ade80' : '#ff5c80';
      ctx.fillText(`目标 ${doc.targetDistance}m`, Math.min(tx - 20, right - 74), y - 18);
    }
    ctx.restore();
  }

  drawGrid(ctx, doc, scale, panX, panY, width, height) {
    const step = 100;
    const t = ctx.getTransform();
    ctx.save();
    ctx.strokeStyle = 'rgba(120,140,165,0.10)';
    ctx.lineWidth = 1;
    const x0 = Math.floor((-panX / scale) / step) * step;
    const y0 = Math.floor((-panY / scale) / step) * step;
    const x1 = (width - panX) / scale;
    const y1 = (height - panY) / scale;
    for (let x = x0; x < x1; x += step) {
      const sx = panX + x * scale;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
    }
    for (let y = y0; y < y1; y += step) {
      const sy = panY + y * scale;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
    }
    ctx.restore();
  }

  drawPin(ctx, c, scale) {
    ctx.save();
    const r = 13 / scale;
    const color = c.status === 'closed' ? '#4ade80' : c.status === 'replied' ? '#7dd3fc' : '#ffb547';
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10,14,20,0.75)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4 / scale;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `600 ${14 / scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.no), c.x, c.y);
    ctx.restore();
  }

  drawPinAtBBox(ctx, layer, doc, c, scale) {
    const bb = layer.type === 'text' ? this.textBB(layer) : subpathsBBox(getSubs(layer, doc));
    this.drawPin(ctx, { ...c, x: bb.x - 4, y: bb.y - 4 }, scale);
  }
}

function handleCursor(ix, iy) {
  if (ix === 0 && iy === 0) return 'nwse-resize';
  if (ix === 2 && iy === 2) return 'nwse-resize';
  if (ix === 2 && iy === 0) return 'nesw-resize';
  if (ix === 0 && iy === 2) return 'nesw-resize';
  if (ix === 1) return 'ns-resize';
  return 'ew-resize';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Editing operations                                                 */
/* ------------------------------------------------------------------ */

export function convertLayerToPath(layer, doc) {
  const subs = getSubs(layer, doc);
  layer.type = 'path';
  layer.kind = 'custom';
  layer.subpaths = JSON.parse(JSON.stringify(subs));
  layer.params = {};
  return layer;
}

export function applyBoolean(doc, layerIds, op) {
  const layers = layerIds.map((id) => doc.layers.find((l) => l.id === id)).filter(Boolean);
  if (layers.length < 2) return { ok: false, message: '布尔运算需要至少 2 个图层' };
  const blocks = layers.map((l) => getSubs(l, doc));
  let subs;
  try {
    subs = booleanSubpaths(op, blocks);
  } catch (e) {
    return { ok: false, message: '布尔运算失败：' + e.message };
  }
  if (!subs.length) return { ok: false, message: '运算结果为空，请检查图层是否相交' };
  const first = layers[0];
  const idx = doc.layers.indexOf(first);
  const opLabel = { union: '并集', intersection: '交集', difference: '差集', xor: '异或' }[op];
  const newLayer = {
    id: first.id,
    type: 'path',
    kind: 'custom',
    name: `${layers.map((l) => l.name).join(' ' + opLabel + ' ')}`,
    params: {},
    subpaths: subs,
    fill: first.fill,
    stroke: first.stroke,
    strokeWidth: first.strokeWidth,
    visible: true,
    locked: false,
  };
  doc.layers.splice(idx, 1, newLayer);
  // remove the other consumed layers
  for (const l of layers.slice(1)) {
    const i = doc.layers.indexOf(l);
    if (i >= 0) doc.layers.splice(i, 1);
  }
  return { ok: true, layerId: newLayer.id, message: `${opLabel}完成` };
}

export function translateLayer(layer, dx, dy) {
  if (layer.type === 'text') {
    layer.x += dx;
    layer.y += dy;
    return;
  }
  if (layer.kind === 'custom' || layer.type === 'path') {
    layer.subpaths = translateSubpaths(layer.subpaths, dx, dy);
    return;
  }
  const p = layer.params;
  if (p.x != null) p.x += dx;
  if (p.y != null) p.y += dy;
  if (p.cx != null) p.cx += dx;
  if (p.cy != null) p.cy += dy;
  if (p.start) p.start = { x: p.start.x + dx, y: p.start.y + dy };
  if (p.bend) p.bend = { x: p.bend.x + dx, y: p.bend.y + dy };
}

export function scaleLayer(layer, doc, anchor, sx, sy) {
  if (layer.type === 'text') {
    layer.charHeight = Math.max(20, Math.round(layer.charHeight * sy));
    layer.charWidth = Math.max(20, Math.round(layer.charWidth * sx));
    layer.lineHeight = Math.max(20, Math.round(layer.lineHeight * sy));
    layer.x = anchor.x + (layer.x - anchor.x) * sx;
    layer.y = anchor.y + (layer.y - anchor.y) * sy;
    return;
  }
  if (layer.kind === 'plate') {
    const b = subpathsBBox(getSubs(layer, doc));
    // resize the document instead
    return { resizeDoc: { width: doc.width * sx, height: doc.height * sy } };
  }
  if (layer.kind === 'custom' || layer.type === 'path') {
    layer.subpaths = scaleSubpaths(layer.subpaths, anchor.x, anchor.y, sx, sy);
    return;
  }
  const p = layer.params;
  if (p.r != null) p.r = Math.max(4, p.r * Math.min(sx, sy));
  if (p.w != null) p.w = Math.max(2, p.w * sx);
  if (p.h != null) p.h = Math.max(2, p.h * sy);
  if (p.cx != null) p.cx = anchor.x + (p.cx - anchor.x) * sx;
  if (p.cy != null) p.cy = anchor.y + (p.cy - anchor.y) * sy;
  if (p.x != null) p.x = anchor.x + (p.x - anchor.x) * sx;
  if (p.y != null) p.y = anchor.y + (p.y - anchor.y) * sy;
  if (p.size != null) p.size = Math.max(10, p.size * Math.min(sx, sy));
  if (p.shaft != null) p.shaft = Math.max(2, p.shaft * Math.min(sx, sy));
  if (p.headWidth != null) p.headWidth = Math.max(2, p.headWidth * Math.min(sx, sy));
  if (p.headLength != null) p.headLength = Math.max(2, p.headLength * Math.min(sx, sy));
  if (p.start) p.start = { x: anchor.x + (p.start.x - anchor.x) * sx, y: anchor.y + (p.start.y - anchor.y) * sy };
  if (p.bend) p.bend = { x: anchor.x + (p.bend.x - anchor.x) * sx, y: anchor.y + (p.bend.y - anchor.y) * sy };
  return null;
}

export function rotateLayer(layer, doc, anchor, angle) {
  if (layer.type === 'text') {
    return;
  }
  const subs = getSubs(layer, doc);
  layer.type = 'path';
  layer.kind = 'custom';
  layer.subpaths = rotateSubpaths(subs, anchor.x, anchor.y, angle);
  layer.params = {};
}

/* ---------- pen path creation ---------- */

export function buildPenLayer(points, closed = false, style = {}) {
  return {
    id: null,
    type: 'path',
    kind: 'custom',
    name: '新路径',
    params: {},
    subpaths: [polylineSubpath(points.map((p) => [p.x, p.y]), closed)],
    fill: style.fill ?? PALETTE.white,
    stroke: style.stroke ?? null,
    strokeWidth: style.strokeWidth ?? 0,
    visible: true,
    locked: false,
  };
}

/* ---------- diff rings for version comparison ---------- */

export function diffRingsBetween(docA, docB) {
  // Changes are computed per layer: layers that appear in only one doc, or whose
  // geometry/style changed, are highlighted with their outline.
  const rings = [];
  const keyedA = docA.layers.map((l) => ({ layer: l, sig: layerSigFor(l, docA) }));
  const keyedB = docB.layers.map((l) => ({ layer: l, sig: layerSigFor(l, docB) }));
  const namesB = new Map(keyedB.map((k) => [k.layer.name, k]));
  const changedNames = new Set();
  for (const a of keyedA) {
    const b = namesB.get(a.layer.name);
    if (!b) { changedNames.add(a.layer.name); continue; }
    if (a.sig !== b.sig) changedNames.add(a.layer.name);
  }
  for (const b of keyedB) {
    if (!keyedA.find((a) => a.layer.name === b.layer.name)) changedNames.add(b.layer.name);
  }
  const seen = new Set();
  for (const a of keyedA) {
    if (!changedNames.has(a.layer.name)) continue;
    if (seen.has(a.layer.name)) continue;
    seen.add(a.layer.name);
    for (const s of changeOutline(a.layer, docA)) rings.push(s);
  }
  for (const b of keyedB) {
    if (!changedNames.has(b.layer.name)) continue;
    if (seen.has(b.layer.name)) continue;
    seen.add(b.layer.name);
    for (const s of changeOutline(b.layer, docB)) rings.push(s);
  }
  return { rings, changedNames: [...changedNames] };
}

function changeOutline(layer, doc) {
  if (layer.type === 'text') {
    const l = textLayoutFor(layer);
    const bb = layer.align === 'left'
      ? { x: layer.x, y: layer.y }
      : layer.align === 'right'
        ? { x: layer.x - l.width, y: layer.y }
        : { x: layer.x - l.width / 2, y: layer.y };
    const pad = 6;
    return [flattenSubpath(roundedRectSubpath(bb.x - pad, bb.y - pad, l.width + pad * 2, l.height + pad * 2, 4))];
  }
  const subs = getSubs(layer, { ...doc, layers: [] });
  const rings = [];
  const sw = layer.strokeWidth || 0;
  for (const s of subs) {
    let ring = flattenSubpath(s, 0.5);
    if (!s.closed) ring = thickPolylineRing(ring, sw || 20);
    rings.push(ring);
  }
  return rings;
}

function thickPolylineRing(ring, width) {
  const subs = strokeOutlineSubpaths([polylineSubpath(ring, false)], width, 1);
  if (!subs.length) return ring;
  return flattenSubpath(subs[0], 1);
}

function layerSigFor(layer, doc) {
  if (layer.type === 'text') return JSON.stringify([layer.text, layer.x, layer.y, layer.charHeight, layer.charWidth, layer.tracking, layer.lineHeight, layer.align, layer.fill]);
  const subs = getSubs(layer, doc);
  const bb = subpathsBBox(subs);
  return JSON.stringify([
    Math.round(bb.x * 10) / 10, Math.round(bb.y * 10) / 10, Math.round(bb.width * 10) / 10, Math.round(bb.height * 10) / 10,
    layer.fill, layer.stroke, layer.strokeWidth, layer.visible,
  ]);
}
