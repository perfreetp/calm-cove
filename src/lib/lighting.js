// 照度计算内核 —— 二维平面实时算多光源叠加，高程用于遮挡判定
//
// 坐标：世界单位 = 米，x 向右、y 向下（与 SVG 一致）。
//
// 单灯照度（余弦幂次配光 I(γ)=I0·cosⁿγ）：
//   E = I0·cosⁿγ·cosθ / d²
// 遮挡用解析阴影投影，避免逐格做三维线段求交：
//   · 低于灯高的实体（立柱、机柜、检修平台）→ 地板上的阴影 = 顶面矩形/圆
//     以灯点为中心的相似放大（放大系数 s = h / (h - z_top)），是轴对齐矩形/圆，
//     逐格只做一次包含测试；外扩 penumbra 即为半影区，透光比 0.55。
//   · 顶面高于灯高的实体（高柱）→ 阴影为灯点向 2D 轮廓张开的锥形，
//     等价于判断 灯点→格点 的 2D 线段是否穿过轮廓。
//   · 地沟：格点位于沟底时，用 灯→格点 连线与 z=0 沟口的交点判断是否被沟壁遮挡。
// 色温只影响色度不改变照度，按 CCT 权重累加得到每个格点的色调，用于热力图。

import { CAT, peakIntensity, beamExponent } from './catalog.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function gridOf(room, cell = 0.5) {
  const nx = Math.max(2, Math.round(room.w / cell) + 1);
  const ny = Math.max(2, Math.round(room.h / cell) + 1);
  return { nx, ny, cell };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInFootprint(x, y, f) {
  if (f.kind === 'circle' || f.kind === 'column') {
    const dx = x - f.cx, dy = y - f.cy;
    return dx * dx + dy * dy <= f.r * f.r;
  }
  if (f.kind === 'poly') return pointInPoly(x, y, f.points);
  return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
}

export function footprintBBox(f) {
  if (f.kind === 'circle' || f.kind === 'column') {
    return { x0: f.cx - f.r, x1: f.cx + f.r, y0: f.cy - f.r, y1: f.cy + f.r };
  }
  if (f.kind === 'poly') {
    const xs = f.points.map((p) => p.x), ys = f.points.map((p) => p.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  return { x0: f.x, x1: f.x + f.w, y0: f.y, y1: f.y + f.h };
}

export function topZ(f) {
  if (f.kind === 'platform') return (f.z ?? 1.1) + (f.thickness ?? 0.15);
  if (f.kind === 'trench' || f.kind === 'pit') return 0;
  return f.height ?? 9.5;
}

export function pitDepthAt(x, y, fixtures) {
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (f.kind !== 'trench' && f.kind !== 'pit') continue;
    if (x > f.x + 0.05 && x < f.x + f.w - 0.05 && y > f.y + 0.05 && y < f.y + f.h - 0.05) {
      return f.depth ?? 1.5;
    }
  }
  return 0;
}

function coveredBySolid(x, y, solids) {
  for (let i = 0; i < solids.length; i++) {
    const f = solids[i];
    if (f.kind === 'platform' && pointInFootprint(x, y, f)) return true;
    if (f.kind === 'cabinet' && pointInFootprint(x, y, f)) return true;
  }
  return false;
}

// 不可站立/不可布点区域：柱、机柜等全高实体占位的楼面
// 不可计入工作面统计的区域：柱、机柜占位，以及检修平台正下方（平台结构占用了该楼面）
export function isBlockedFloor(x, y, fixtures) {
  for (let i = 0; i < fixtures.length; i++) {
    const f = fixtures[i];
    if (f.kind === 'column' || f.kind === 'cabinet' || f.kind === 'platform') {
      if (pointInFootprint(x, y, f)) return true;
    }
  }
  return false;
}

// 2D 线段与轴对齐矩形是否相交
function segRect2D(ax, ay, bx, by, x0, x1, y0, y1) {
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < x0 || ax > x1) return false;
  } else {
    let ta = (x0 - ax) / dx, tb = (x1 - ax) / dx;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  if (Math.abs(dy) < 1e-9) {
    if (ay < y0 || ay > y1) return false;
  } else {
    let ta = (y0 - ay) / dy, tb = (y1 - ay) / dy;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

function segCircle2D(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return fx * fx + fy * fy <= r * r;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1;
}

/**
 * 为单盏灯预计算遮挡体投影。返回可直接测试的投影列表。
 * occluders 只包含实体类图元（地沟单独处理）。
 */
function buildProjections(lamp, occluders) {
  const h = lamp.h;
  const out = [];
  for (const f of occluders) {
    const tz = topZ(f);
    const pen = f.penumbra ?? 0.6;
    const bb = footprintBBox(f);
    if (tz < h - 0.02) {
      // 放大投影到地板
      const s = h / (h - tz);
      const shape =
        f.kind === 'circle' || f.kind === 'column'
          ? { t: 'c', cx: lamp.x + (f.cx - lamp.x) * s, cy: lamp.y + (f.cy - lamp.y) * s, r: f.r * s, r2: (f.r + pen) * s }
          : {
              t: 'r',
              x0: lamp.x + (f.x - lamp.x) * s,
              x1: lamp.x + (f.x + f.w - lamp.x) * s,
              y0: lamp.y + (f.y - lamp.y) * s,
              y1: lamp.y + (f.y + f.h - lamp.y) * s,
              p: pen * s,
            };
      if (shape.t === 'r' && shape.x0 > shape.x1) { const t = shape.x0; shape.x0 = shape.x1; shape.x1 = t; }
      if (shape.t === 'r' && shape.y0 > shape.y1) { const t = shape.y0; shape.y0 = shape.y1; shape.y1 = t; }
      const bx0 = shape.t === 'r' ? shape.x0 - shape.p : shape.cx - shape.r2;
      const bx1 = shape.t === 'r' ? shape.x1 + shape.p : shape.cx + shape.r2;
      const by0 = shape.t === 'r' ? shape.y0 - shape.p : shape.cy - shape.r2;
      const by1 = shape.t === 'r' ? shape.y1 + shape.p : shape.cy + shape.r2;
      out.push({ ...shape, tube: false, nz0: 0, nz1: tz, bx0, bx1, by0, by1, fixture: f });
    } else {
      // 顶面高于灯高（如直达屋面的结构柱）：2D 锥形阴影，外扩 penumbra 作半影
      out.push({
        t: 'cone',
        f,
        bx0: bb.x0 - pen,
        bx1: bb.x1 + pen,
        by0: bb.y0 - pen,
        by1: bb.y1 + pen,
        pen,
        fixture: f,
        nz0: 0,
        nz1: tz,
      });
    }
  }
  return out;
}

function shadeFactor(lamp, x, y, z, projs) {
  // 采样点自身位于平台面上时不受该平台遮挡（平台下方由 z 判断）
  let vis = 1;
  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if (x < p.bx0 || x > p.bx1 || y < p.by0 || y > p.by1) continue;
    const f = p.fixture;
    if (f.kind === 'platform' && z >= (f.z ?? 1.1) - 0.02 && pointInFootprint(x, y, f)) continue;
    if (z > p.nz1 + 0.02 && f.kind === 'platform' && pointInFootprint(x, y, f)) continue;
    if (p.t === 'r') {
      const inner = x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1;
      if (inner) { vis = 0; continue; }
      const outer = x > p.x0 - p.p && x < p.x1 + p.p && y > p.y0 - p.p && y < p.y1 + p.p;
      if (outer) vis *= 0.55;
    } else if (p.t === 'c') {
      const dx = x - p.cx, dy = y - p.cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < p.r * p.r) { vis = 0; continue; }
      if (d2 < p.r2 * p.r2) vis *= 0.55;
    } else {
      const f2 = p.f;
      const isRound = f2.kind === 'circle' || f2.kind === 'column';
      const hit = isRound
        ? segCircle2D(lamp.x, lamp.y, x, y, f2.cx, f2.cy, f2.r)
        : pointInFootprint(x, y, f2) || segRect2D(lamp.x, lamp.y, x, y, f2.x, f2.x + f2.w, f2.y, f2.y + f2.h);
      if (!hit) continue;
      const pen = p.pen ?? 0.6;
      const soft = isRound
        ? segCircle2D(lamp.x, lamp.y, x, y, f2.cx, f2.cy, f2.r + pen)
        : segRect2D(lamp.x, lamp.y, x, y, f2.x - pen, f2.x + f2.w + pen, f2.y - pen, f2.y + f2.h + pen);
      vis *= soft ? 0.55 : 0;
    }
    if (vis === 0) break;
  }
  return vis;
}

/**
 * 网格照度。opts:
 *   cell        网格步长（米，默认 0.5）
 *   ambient     环境光 lx（各时段天然光/余晖；平台/机柜下方与沟内自动衰减）
 *   powerScale  灯具功率系数
 *   lampFilter  参与计算的灯具过滤函数
 *   shade       是否计算遮挡（默认 true）
 *   zPlane      工作面高度（默认 0）
 */
export function computeGrid(doc, opts = {}) {
  const cell = opts.cell ?? doc.prefs?.cell ?? 0.5;
  const { nx, ny } = gridOf(doc.room, cell);
  // 沿墙留边：靠墙 0.75 m 属墙区，不计入工作面统计（照明设计惯例）
  const band = opts.wallBand ?? doc.prefs?.wallBand ?? 0.75;
  const ambient = opts.ambient ?? 0;
  const powerScale = opts.powerScale ?? 1;
  const shade = opts.shade !== false;
  const zPlane = opts.zPlane ?? 0;
  const lamps = opts.lampFilter ? doc.lamps.filter(opts.lampFilter) : doc.lamps;

  const solid = doc.fixtures.filter((f) => f.kind !== 'aisle' && f.kind !== 'zone' && f.kind !== 'trench' && f.kind !== 'pit');
  const trenches = doc.fixtures.filter((f) => f.kind === 'trench' || f.kind === 'pit');

  const size = nx * ny;
  const valid = new Uint8Array(size);
  const pitMask = new Uint8Array(size);
  const wantShadow = opts.shadowMap !== false && shade;
  const shadow = wantShadow ? new Float32Array(size) : null;
  const rawE = wantShadow ? new Float32Array(size) : null;
  const litE = wantShadow ? new Float32Array(size) : null;
  const lux = new Float32Array(size);
  const sr = new Float32Array(size), sg = new Float32Array(size), sb = new Float32Array(size);

  // 环境光
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * cell, y = j * cell;
      let base = ambient;
      const pit = pitDepthAt(x, y, trenches);
      if (pit) base *= 0.3;
      else if (coveredBySolid(x, y, solid)) base *= 0.2;
      const nearWall = x < band || y < band || x > doc.room.w - band || y > doc.room.h - band;
      valid[j * nx + i] = nearWall || isBlockedFloor(x, y, solid) ? 0 : 1;
      if (pit) pitMask[j * nx + i] = 1;
      lux[j * nx + i] = base;
      sr[j * nx + i] = base * 0.62; sg[j * nx + i] = base * 0.56; sb[j * nx + i] = base * 0.52;
    }
  }

  const projByLamp = lamps.map((l) => (shade ? buildProjections(l, solid) : null));

  for (let li = 0; li < lamps.length; li++) {
    const lamp = lamps[li];
    const model = CAT[lamp.model];
    if (!model) continue;
    const I0 = peakIntensity(model) * powerScale;
    const n = beamExponent(model.beam);
    const tilt = ((lamp.tilt ?? 0) * Math.PI) / 180;
    const dirY = -Math.sin(tilt), dirZ = -Math.cos(tilt);
    const lx = lamp.x, ly = lamp.y, h = lamp.h;
    const projs = projByLamp[li];
    const cw = cctWeights(lamp.cct ?? model.cct);
    const trenchInside = [];
    for (const t of trenches) {
      const bb = footprintBBox(t);
      trenchInside.push({ t, ...bb, depth: t.depth ?? 0 });
    }

    for (let j = 0; j < ny; j++) {
      const y = j * cell;
      const dy = y - ly;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = i * cell;
        const dx = x - lx;
        let z = zPlane;
        let pit = 0;
        for (let q = 0; q < trenchInside.length; q++) {
          const tr = trenchInside[q];
          if (x > tr.x0 + 0.05 && x < tr.x1 - 0.05 && y > tr.y0 + 0.05 && y < tr.y1 - 0.05) {
            pit = tr.depth;
            break;
          }
        }
        if (pit) z = -pit + 0.02;
        if (h <= z) continue;
        const dz = z - h;
        const dist2 = dx * dx + dy * dy + dz * dz;
        if (dist2 < 0.05) continue;
        const dist = Math.sqrt(dist2);
        const cosT = (dy * dirY + dz * dirZ) / dist;
        if (cosT <= 0.02) continue;
        let e = (I0 * Math.pow(cosT, n) * cosT) / dist2;
        if (e < 0.02) continue;
        if (pit && projs) {
          // 沟底：灯→格点连线与 z=0 沟口的交点是否落在沟口内
          const u = h / (h + pit - 0.02);
          const ex = lx + (x - lx) * u;
          const ey = ly + (y - ly) * u;
          let open = false;
          for (let q = 0; q < trenchInside.length; q++) {
            const tr = trenchInside[q];
            if (ex > tr.x0 + 0.03 && ex < tr.x1 - 0.03 && ey > tr.y0 + 0.03 && ey < tr.y1 - 0.03) { open = true; break; }
          }
          e *= open ? 0.72 : 0.06;
        }
        if (projs && projs.length) {
          const v = shadeFactor(lamp, x, y, z, projs);
          if (rawE) {
            rawE[k] += e;
            litE[k] += e * v;
          }
          if (v <= 0) continue;
          e *= v;
        }
        lux[k] += e;
        sr[k] += e * cw[0]; sg[k] += e * cw[1]; sb[k] += e * cw[2];
      }
    }
  }

  if (shadow) {
    for (let k = 0; k < size; k++) {
      // 阴影强度 = 被遮挡掉的那部分直射光占比（0 = 无遮挡，1 = 全遮）
      shadow[k] = rawE[k] > 1e-6 ? clamp(1 - litE[k] / rawE[k], 0, 1) : 0;
    }
  }

  const tr = new Float32Array(size), tg = new Float32Array(size), tb = new Float32Array(size);
  for (let k = 0; k < size; k++) {
    const e = sr[k] + sg[k] + sb[k];
    if (e > 1e-6) { tr[k] = sr[k] / e; tg[k] = sg[k] / e; tb[k] = sb[k] / e; }
    else { tr[k] = 0.5; tg[k] = 0.5; tb[k] = 0.5; }
  }

  return { nx, ny, cell, values: lux, valid, pit: pitMask, shadow, tint: { r: tr, g: tg, b: tb }, lampCount: lamps.length };
}

export function cctWeights(cct) {
  if (cct <= 3000) return [1.0, 0.56, 0.26];
  if (cct <= 4000) return [1.0, 0.76, 0.5];
  if (cct <= 5000) return [1.0, 0.9, 0.8];
  return [0.8, 0.9, 1.0];
}

/** 暗区连通块（4 邻域），返回坐标与包围盒 */
export function findDarkZones(r, threshold, minCells = 2, fixturesRef = null) {
  const { nx, ny, cell, values } = r;
  const seen = new Uint8Array(nx * ny);
  const zones = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (seen[k] || values[k] >= threshold || !(r.valid ? r.valid[k] : 1)) continue;
      seen[k] = 1;
      const stack = [k];
      const cellIdx = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, sum = 0, minV = Infinity, n = 0;
      let sx = 0, sy = 0;
      while (stack.length) {
        const cur = stack.pop();
        const ci = cur % nx, cj = (cur / nx) | 0;
        const cx = ci * cell, cy = cj * cell;
        cellIdx.push(cur);
        sx += cx; sy += cy;
        const v = values[cur];
        sum += v; n++;
        if (v < minV) minV = v;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const nb = [cur + 1, cur - 1, cur + nx, cur - nx];
        for (let q = 0; q < 4; q++) {
          const nk = nb[q];
          if (nk < 0 || nk >= nx * ny) continue;
          const ni = nk % nx;
          if ((q === 0 && ni === 0) || (q === 1 && ni === nx - 1)) continue;
          if (seen[nk] || values[nk] >= threshold) continue;
          if (r.valid && !r.valid[nk]) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
      if (n >= minCells) {
        // 按格点所属标高区分：沟内 / 平台下方 / 普通地面
        let pitCells = 0, shelfCells = 0;
        for (let q = 0; q < cellIdx.length; q += 3) {
          const ci = cellIdx[q] % nx, cj = (cellIdx[q] / nx) | 0;
          const cx2 = ci * cell, cy2 = cj * cell;
          if (r.pit && r.pit[cellIdx[q]]) pitCells++;
          else {
            for (let fi = 0; fi < (fixturesRef?.length ?? 0); fi++) {
              const f = fixturesRef[fi];
              if (f.kind === 'platform' && pointInFootprint(cx2, cy2, f)) { shelfCells++; break; }
            }
          }
        }
        zones.push({
          id: null,
          kind: pitCells * 3 > cellIdx.length ? 'trench' : shelfCells * 3 > cellIdx.length ? 'shelf' : 'floor',
          cells: n,
          area: n * cell * cell,
          minLux: minV,
          avgLux: sum / n,
          bbox: { x: minX - cell / 2, y: minY - cell / 2, w: maxX - minX + cell, h: maxY - minY + cell },
          center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
          centroid: { x: sx / n, y: sy / n },
          cells_idx: cellIdx,
          spread: (maxX - minX) * (maxY - minY) / Math.max(1, n * cell * cell),
          corners: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
          ],
        });
      }
    }
  }
  zones.sort((a, b) => a.minLux - b.minLux);
  zones.forEach((z, idx) => { z.id = `D${idx + 1}`; });
  return zones;
}

export function zoneSummary(r, threshold) {
  const zones = findDarkZones(r, threshold);
  let dark = 0, totalCells = 0;
  for (let k = 0; k < r.values.length; k++) {
    if (r.valid && !r.valid[k]) continue;
    totalCells++;
    if (r.values[k] < threshold) dark++;
  }
  return { zones, darkCells: dark, totalCells, darkRatio: dark / totalCells, coverage: 1 - dark / totalCells };
}

const okCell = (r, k, includePits) => {
  if (r.valid && !r.valid[k]) return false;
  if (!includePits && r.pit && r.pit[k]) return false;
  return true;
};

export function statsIn(r, rect, includePits = false) {
  let sum = 0, n = 0, min = Infinity, max = -Infinity;
  for (let j = 0; j < r.ny; j++) {
    const y = j * r.cell;
    if (y < rect.y || y > rect.y + rect.h) continue;
    for (let i = 0; i < r.nx; i++) {
      const x = i * r.cell;
      if (x < rect.x || x > rect.x + rect.w) continue;
      const kk = j * r.nx + i;
      if (!okCell(r, kk, includePits)) continue;
      const v = r.values[kk];
      sum += v; n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!n) return { avg: 0, min: 0, max: 0, uniformity: 0, n: 0 };
  const avg = sum / n;
  return { avg, min, max, uniformity: avg > 0 ? min / avg : 0, n };
}

export function statsAll(r, includePits = false) {
  let sum = 0, n = 0, min = Infinity, max = -Infinity;
  for (let k = 0; k < r.values.length; k++) {
    if (!okCell(r, k, includePits)) continue;
    const v = r.values[k];
    sum += v; n++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const avg = sum / n;
  return { avg, min, max, uniformity: avg > 0 ? min / avg : 0, n };
}

export function maskStats(r, maskFn, includePits = false) {
  let sum = 0, n = 0, min = Infinity, max = -Infinity;
  for (let j = 0; j < r.ny; j++) {
    for (let i = 0; i < r.nx; i++) {
      const x = i * r.cell, y = j * r.cell;
      const kk = j * r.nx + i;
      if (!okCell(r, kk, includePits)) continue;
      if (!maskFn(x, y)) continue;
      const v = r.values[kk];
      sum += v; n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!n) return { avg: 0, min: 0, max: 0, uniformity: 0, n: 0 };
  const avg = sum / n;
  return { avg, min, max, uniformity: avg > 0 ? min / avg : 0, n };
}

/**
 * 眩光指数 UGR（Guth 模型简化版）
 *   UGR = 8·lg( 0.25/Lb · Σ L²·Ω/p² )
 * L 为灯具视在亮度、Ω 为立体角、p 为位置指数（按仰角查表），Lb 为背景亮度。
 */
const GUTH_P = [
  [0, 1.0], [15, 1.05], [30, 1.2], [45, 1.6], [60, 2.6], [75, 5.0], [90, 12.0],
];

function guthP(deg) {
  const d = clamp(deg, 0, 90);
  for (let i = 1; i < GUTH_P.length; i++) {
    if (d <= GUTH_P[i][0]) {
      const a = GUTH_P[i - 1], b = GUTH_P[i];
      return a[1] + ((b[1] - a[1]) * (d - a[0])) / (b[0] - a[0]);
    }
  }
  return 12;
}

export function ugrAt(doc, point) {
  if (!doc.lamps.length) return 0;
  const eyeH = 1.2;
  const E = doc.lamps.reduce((acc, l) => {
    const m = CAT[l.model];
    if (!m) return acc;
    const dh = Math.max(0.4, Math.hypot(l.x - point.x, l.y - point.y));
    const dz = l.h - eyeH;
    const d2 = dh * dh + dz * dz;
    return acc + (peakIntensity(m) * Math.pow(dz / Math.sqrt(d2), 2)) / d2;
  }, 0);
  const Lb = Math.max(2, (0.3 * E) / Math.PI);
  let sum = 0;
  for (const l of doc.lamps) {
    const m = CAT[l.model];
    if (!m) continue;
    const dh = Math.hypot(l.x - point.x, l.y - point.y);
    const dz = l.h - eyeH;
    const r = Math.sqrt(dh * dh + dz * dz);
    const elev = (Math.atan2(dz, dh) * 180) / Math.PI;
    const gamma = ((90 - elev) * Math.PI) / 180;
    const I = peakIntensity(m) * Math.pow(Math.max(0, Math.cos(gamma)), beamExponent(m.beam));
    const A = m.area;
    const L = I / A;
    const OM = A / (r * r);
    const p = guthP(elev);
    sum += (L * L * OM) / (p * p);
  }
  const ugr = 8 * Math.log10((0.05 * 0.25 * sum) / Lb);
  return Math.round(clamp(ugr, 4, 40) * 10) / 10;
}

/** 灯具最近邻间距与阵列偏差 */
export function spacingReport(lamps) {
  const nn = lamps.map(() => Infinity);
  const pairs = [];
  for (let i = 0; i < lamps.length; i++) {
    for (let j = i + 1; j < lamps.length; j++) {
      const d = Math.hypot(lamps[i].x - lamps[j].x, lamps[i].y - lamps[j].y);
      pairs.push({ i, j, d });
      if (d < nn[i]) nn[i] = d;
      if (d < nn[j]) nn[j] = d;
    }
  }
  const finite = nn.filter((v) => Number.isFinite(v));
  if (!finite.length) return { nn, minNN: 0, maxNN: 0, ratio: 1, pairs };
  const minNN = Math.min(...finite), maxNN = Math.max(...finite);
  return { nn, minNN, maxNN, ratio: minNN > 0 ? maxNN / minNN : 1, pairs };
}

