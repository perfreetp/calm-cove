import pc from 'polygon-clipping';

/* ------------------------------------------------------------------
 * Geometry core — all coordinates are millimetres, y grows downwards.
 * A path layer is a list of subpaths; a subpath is a closed/open list
 * of points with optional cubic Bézier handles (cIn = incoming,
 * cOut = outgoing, both absolute coordinates).
 * ------------------------------------------------------------------ */

export const EPS = 1e-7;

export const pt = (x, y) => ({ x, y });

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/* ---------- builders ---------- */

export function polylineSubpath(points, closed = true) {
  return {
    closed,
    pts: points.map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x, y: p.y })),
  };
}

export function circleSubpath(cx, cy, r, k = 0.55228475) {
  const h = r * k;
  return {
    closed: true,
    pts: [
      { x: cx + r, y: cy, cIn: { x: cx + r, y: cy - h }, cOut: { x: cx + r, y: cy + h } },
      { x: cx, y: cy + r, cIn: { x: cx + h, y: cy + r }, cOut: { x: cx - h, y: cy + r } },
      { x: cx - r, y: cy, cIn: { x: cx - r, y: cy + h }, cOut: { x: cx - r, y: cy - h } },
      { x: cx, y: cy - r, cIn: { x: cx - h, y: cy - r }, cOut: { x: cx + h, y: cy - r } },
    ],
  };
}

export function roundedRectSubpath(x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r < EPS) {
    return polylineSubpath([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  }
  const k = 0.55228475 * r;
  return {
    closed: true,
    pts: [
      { x: x + r, y, cIn: { x: x + r - k, y } },
      { x: x + w - r, y, cOut: { x: x + w - r + k, y } },
      { x: x + w, y: y + r, cIn: { x: x + w, y: y + r - k } },
      { x: x + w, y: y + h - r, cOut: { x: x + w, y: y + h - r + k } },
      { x: x + w - r, y: y + h, cIn: { x: x + w - r + k, y: y + h } },
      { x: x + r, y: y + h, cOut: { x: x + r - k, y: y + h } },
      { x, y: y + h - r, cIn: { x, y: y + h - r + k } },
      { x, y: y + r, cOut: { x, y: y + r - k } },
    ],
  };
}

/** Regular polygon (r = circumradius), rotation in radians. */
export function ngonSubpath(cx, cy, r, sides, rotation = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * Math.PI * 2) / sides;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polylineSubpath(pts, true);
}

/** Stadium / capsule from (x1,y1) to (x2,y2) with given width. */
export function thickSegment(x1, y1, x2, y2, width) {
  const a = pt(x1, y1), b = pt(x2, y2);
  const len = dist(a, b);
  const r = width / 2;
  if (len < EPS) return circleSubpath(x1, y1, r);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const nx = -uy * r, ny = ux * r;
  const k = 0.55228475 * r;
  const P1 = { x: a.x + nx, y: a.y + ny };
  const P2 = { x: b.x + nx, y: b.y + ny };
  const P3 = { x: b.x - nx, y: b.y - ny };
  const P4 = { x: a.x - nx, y: a.y - ny };
  P1.cOut = { x: P1.x + ux * k, y: P1.y + uy * k };
  P1.cIn = { x: P1.x - ux * k, y: P1.y - uy * k };
  P2.cIn = { x: P2.x - ux * k, y: P2.y - uy * k };
  P3.cIn = { x: P3.x + ux * k, y: P3.y + uy * k };
  P4.cOut = { x: P4.x - ux * k, y: P4.y - uy * k };
  return { closed: true, pts: [P1, P2, P3, P4] };
}

/** Arrow along a sampled centreline, with an arrow head at the end. */
export function arrowSubpath(points, shaftWidth, headWidth, headLength) {
  const pts = points.map((p) => (Array.isArray(p) ? pt(p[0], p[1]) : pt(p.x, p.y)));
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2] || tip;
  let ux = tip.x - prev.x, uy = tip.y - prev.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len; uy /= len;
  const base = pt(tip.x - ux * headLength, tip.y - uy * headLength);
  const shaftPts = pts.slice(0, -1).concat([base]);
  const shaft = thickPolyline(shaftPts, shaftWidth);
  const nx = -uy, ny = ux;
  const head = polylineSubpath([
    [tip.x, tip.y],
    [base.x + nx * headWidth / 2, base.y + ny * headWidth / 2],
    [base.x - nx * headWidth / 2, base.y - ny * headWidth / 2],
  ], true);
  return booleanSubpaths('union', [shaft, [head]]);
}

/** Offset a polyline into a thick outline (round joins). Returns subpaths. */
export function thickPolyline(points, width) {
  const pts = points.map((p) => (Array.isArray(p) ? pt(p[0], p[1]) : pt(p.x, p.y)));
  const polys = [];
  const r = width / 2;
  for (let i = 0; i < pts.length; i++) {
    // joint disc keeps joins round
    const n = 10;
    const ring = [];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      ring.push([pts[i].x + Math.cos(a) * r, pts[i].y + Math.sin(a) * r]);
    }
    polys.push([ring]);
    if (i < pts.length - 1) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const l = Math.hypot(dx, dy);
      if (l < EPS) continue;
      const nx = -dy / l * r, ny = dx / l * r;
      polys.push([[
        [a.x + nx, a.y + ny], [b.x + nx, b.y + ny],
        [b.x - nx, b.y - ny], [a.x - nx, a.y - ny],
      ]]);
    }
  }
  const merged = pc.union(...polys);
  return multiPolygonToSubpaths(merged);
}

/* ---------- flattening ---------- */

export function segmentsOf(sub) {
  const n = sub.pts.length;
  const segs = [];
  for (let i = 0; i < (sub.closed ? n : n - 1); i++) {
    const p0 = sub.pts[i];
    const p3 = sub.pts[(i + 1) % n];
    segs.push({ p0, c1: p0.cOut || null, c2: p3.cIn || null, p3 });
  }
  return segs;
}

function flattenCubic(p0, c1, c2, p3, tol, out) {
  function rec(a, b, c, d, depth) {
    if (depth > 12) { out.push([d.x, d.y]); return; }
    // simple flatness test based on control-point deviation
    const d1 = Math.abs((b.x + c.x) / 2 - (a.x + d.x) / 2);
    const d2 = Math.abs((b.y + c.y) / 2 - (a.y + d.y) / 2);
    if (d1 + d2 <= tol * 2) { out.push([d.x, d.y]); return; }
    const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d);
    const abc = mid(ab, bc), bcd = mid(bc, cd), abcd = mid(abc, bcd);
    rec(a, ab, abc, abcd, depth + 1);
    rec(abcd, bcd, cd, d, depth + 1);
  }
  rec(p0, c1, c2, p3, 0);
}

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function flattenSubpath(sub, tol = 0.18) {
  const segs = segmentsOf(sub);
  if (!segs.length) return sub.pts.map((p) => [p.x, p.y]);
  const out = [[segs[0].p0.x, segs[0].p0.y]];
  for (const s of segs) {
    if (!s.c1 && !s.c2) out.push([s.p3.x, s.p3.y]);
    else flattenCubic(s.p0, s.c1 || s.p0, s.c2 || s.p3, s.p3, tol, out);
  }
  if (sub.closed) {
    const first = out[0], last = out[out.length - 1];
    if (Math.abs(first[0] - last[0]) < EPS && Math.abs(first[1] - last[1]) < EPS) out.pop();
  }
  return out;
}

export function ringsFromSubpaths(subs, tol = 0.18) {
  return subs.map((s) => {
    let ring = flattenSubpath(s, tol);
    if (s.closed && ring.length > 1) {
      const a = ring[0], b = ring[ring.length - 1];
      if (Math.abs(a[0] - b[0]) > EPS || Math.abs(a[1] - b[1]) > EPS) ring.push([a[0], a[1]]);
    }
    return ring;
  });
}

/* ---------- areas / containment ---------- */

export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + EPS) + xi) inside = !inside;
  }
  return inside;
}

/** Group rings into polygons [{outer, holes}] using containment. */
export function groupRings(rings) {
  const infos = rings
    .filter((r) => r.length >= 3)
    .map((r, i) => ({ ring: r, idx: i, area: Math.abs(ringArea(r)), depth: 0, parent: -1 }));
  infos.sort((a, b) => b.area - a.area);
  for (let i = 0; i < infos.length; i++) {
    for (let j = 0; j < i; j++) {
      const inner = infos[i], outer = infos[j];
      if (outer.area <= inner.area + EPS) continue;
      const v = inner.ring[0];
      if (pointInRing(v[0], v[1], outer.ring)) {
        inner.parent = j;
        inner.depth = outer.depth + 1;
        break;
      }
    }
  }
  const polys = [];
  const owners = [];
  infos.forEach((info, i) => {
    if (info.depth % 2 === 0) {
      polys.push({ outer: info.ring, holes: [], area: info.area });
      owners.push(i);
    } else {
      let p = info.parent;
      while (p >= 0 && infos[p].depth % 2 === 1) p = infos[p].parent;
      if (p < 0) p = 0;
      const ownerIdx = owners.indexOf(p);
      if (ownerIdx >= 0) polys[ownerIdx].holes.push(info.ring);
    }
  });
  return polys;
}

export function ringsToMultiPolygon(rings) {
  return groupRings(rings).map((p) => [p.outer, ...p.holes]);
}

export function multiPolygonToSubpaths(mp) {
  const subs = [];
  for (const poly of mp) {
    for (const ring of poly) {
      if (ring.length < 3) continue;
      const pts = ring.map((p) => [p[0], p[1]]);
      if (pts.length > 1) {
        const a = pts[0], b = pts[pts.length - 1];
        if (Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4) pts.pop();
      }
      subs.push(polylineSubpath(pts, true));
    }
  }
  return subs;
}

export function booleanSubpaths(op, subpathLists) {
  const polys = subpathLists.map((subs) => ringsToMultiPolygon(ringsFromSubpaths(subs)));
  let result;
  switch (op) {
    case 'union': result = pc.union(...polys); break;
    case 'intersection':
      result = polys[0];
      for (let i = 1; i < polys.length; i++) result = pc.intersection(result, polys[i]);
      break;
    case 'difference':
      result = polys[0];
      for (let i = 1; i < polys.length; i++) result = pc.difference(result, polys[i]);
      break;
    case 'xor':
      result = polys[0];
      for (let i = 1; i < polys.length; i++) result = pc.xor(result, polys[i]);
      break;
    default: throw new Error('unknown boolean op ' + op);
  }
  return multiPolygonToSubpaths(result);
}

export function intersectionRings(ringsA, ringsB) {
  const mp = pc.intersection(ringsToMultiPolygon(ringsA), ringsToMultiPolygon(ringsB));
  return multiPolygonToSubpaths(mp);
}

export function unionRings(ringsA, ringsB) {
  return multiPolygonToSubpaths(pc.union(ringsToMultiPolygon(ringsA), ringsToMultiPolygon(ringsB)));
}

/* ---------- transforms ---------- */

export function translateSubpaths(subs, dx, dy) {
  const t = (p) => p && { x: p.x + dx, y: p.y + dy };
  return subs.map((s) => ({
    ...s,
    pts: s.pts.map((p) => ({ x: p.x + dx, y: p.y + dy, cIn: t(p.cIn), cOut: t(p.cOut) })),
  }));
}

export function transformSubpaths(subs, fn) {
  const t = (p) => (p ? fn(p) : null);
  return subs.map((s) => ({
    ...s,
    pts: s.pts.map((p) => {
      const m = fn(p);
      return { x: m.x, y: m.y, cIn: t(p.cIn), cOut: t(p.cOut) };
    }),
  }));
}

export function subpathsBBox(subs) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const s of subs) {
    for (const ring of ringsFromSubpaths([s], 0.05)) {
      for (const p of ring) {
        if (p[0] < x1) x1 = p[0];
        if (p[1] < y1) y1 = p[1];
        if (p[0] > x2) x2 = p[0];
        if (p[1] > y2) y2 = p[1];
      }
    }
  }
  if (!isFinite(x1)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function path2dFromSubpaths(subs, Ctor = Path2D) {
  const p = new Ctor();
  for (const s of subs) {
    if (!s.pts.length) continue;
    p.moveTo(s.pts[0].x, s.pts[0].y);
    for (const seg of segmentsOf(s)) {
      if (seg.c1 || seg.c2) {
        const c1 = seg.c1 || seg.p0, c2 = seg.c2 || seg.p3;
        p.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, seg.p3.x, seg.p3.y);
      } else {
        p.lineTo(seg.p3.x, seg.p3.y);
      }
    }
    if (s.closed) p.closePath();
  }
  return p;
}

export function subpathToSvgD(sub) {
  let d = '';
  const n = sub.pts.length;
  if (!n) return d;
  d += `M${fmt(sub.pts[0].x)} ${fmt(sub.pts[0].y)}`;
  for (const seg of segmentsOf(sub)) {
    if (seg.c1 || seg.c2) {
      const c1 = seg.c1 || seg.p0, c2 = seg.c2 || seg.p3;
      d += ` C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(seg.p3.x)} ${fmt(seg.p3.y)}`;
    } else {
      d += ` L${fmt(seg.p3.x)} ${fmt(seg.p3.y)}`;
    }
  }
  if (sub.closed) d += ' Z';
  return d;
}

export const fmt = (v) => (Math.round(v * 1000) / 1000).toString();

export function rotateSubpaths(subs, cx, cy, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return transformSubpaths(subs, (p) => ({
    x: cx + (p.x - cx) * c - (p.y - cy) * s,
    y: cy + (p.x - cx) * s + (p.y - cy) * c,
  }));
}

export function scaleSubpaths(subs, cx, cy, sx, sy) {
  return transformSubpaths(subs, (p) => ({ x: cx + (p.x - cx) * sx, y: cy + (p.y - cy) * sy }));
}

/** Stroke band outline for a set of subpaths (used by the cutter export). */
export function strokeOutlineSubpaths(subs, width, tol = 0.18) {
  const out = [];
  for (const sub of subs) {
    const ring = flattenSubpath(sub, tol);
    const pts = ring.map((p) => pt(p[0], p[1]));
    let polyPts = pts;
    if (sub.closed && pts.length > 2) polyPts = pts.concat([pts[0], pts[1]]); // wrap joins
    const thick = thickPolyline(polyPts, width);
    out.push(...thick);
  }
  return out;
}

/** Simple point-on-any-vertex test helper list for snapping. */
export function subpathVertices(subs) {
  const out = [];
  for (const s of subs) {
    s.pts.forEach((p, i) => out.push({ x: p.x, y: p.y }));
  }
  return out;
}
