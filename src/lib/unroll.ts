/**
 * Development (flattening) of the shell into a 2D cutting sheet.
 *
 * Each ring is unfolded preserving its arc length, meridians preserve their
 * slant length, so the resulting sheet is a true-length development of the
 * canal tube — the shape a technician places on the mould blank.
 */

import { ControlPoint, evalPoint } from './geom';

export interface SurfaceLike {
  nu: number;
  nv: number;
  pos: Float32Array;
  curv: Float32Array;
  thick: Float32Array;
}

/**
 * Unroll straight from the tessellated shell: ring arc length gives the
 * developed width, meridian arc length gives the developed length.
 */
export function developFromModel(
  model: SurfaceLike,
  opts: { wall: number; adaptive: boolean; threshold: number },
): DevelopSheet {
  const { nu, nv, pos, curv, thick } = model;
  const merArc = new Float64Array(nu);
  const ringArc = new Float64Array(nu);
  const rMean = new Float64Array(nu);
  for (let i = 0; i < nu; i++) {
    let ra = 0;
    for (let j = 0; j < nv - 1; j++) {
      const a = (i * nv + j) * 3;
      const b = (i * nv + j + 1) * 3;
      ra += Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    }
    ringArc[i] = ra;
    rMean[i] = Math.max(1.6, ra / (Math.PI * 2));
  }
  for (let i = 1; i < nu; i++) {
    let d = 0;
    for (let j = 0; j < nv; j += 2) {
      const a = (i * nv + j) * 3;
      const b = ((i - 1) * nv + j) * 3;
      d += Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
    }
    merArc[i] = merArc[i - 1] + d / Math.ceil(nv / 2);
  }
  const length = merArc[nu - 1];

  const X = new Float32Array(nu * nv);
  const Y = new Float32Array(nu * nv);
  for (let i = 0; i < nu; i++) {
    const y = merArc[i];
    for (let j = 0; j < nv; j++) {
      const phi = (j / (nv - 1)) * Math.PI * 2;
      const k = i * nv + j;
      X[k] = (phi - Math.PI) * rMean[i];
      Y[k] = y;
    }
  }

  const outline: Array<[number, number]> = [];
  for (let j = 0; j < nv; j++) outline.push([X[j], Y[j]]);
  for (let i = 1; i < nu; i++) outline.push([X[i * nv + (nv - 1)], Y[i * nv + (nv - 1)]]);
  for (let j = nv - 2; j >= 0; j--) outline.push([X[(nu - 1) * nv + j], Y[(nu - 1) * nv + j]]);
  for (let i = nu - 2; i > 0; i--) outline.push([X[i * nv], Y[i * nv]]);

  const vi = Math.round(0.9 * (nu - 1));
  const vj = Math.round((Math.PI * 0.56 / (Math.PI * 2)) * (nv - 1));
  const vent: SheetHole = {
    x: X[vi * nv + vj],
    y: Y[vi * nv + vj],
    r: 0.65,
    label: '泄压孔 Ø1.3',
  };
  const bore = {
    x: 0,
    y: length,
    w: ringArc[nu - 1] * 0.3,
    h: 2.6,
  };

  const spots: SheetHotspot[] = [];
  const step = Math.max(2, Math.floor(nu / 26));
  for (let i = 1; i < nu - 1; i += step) {
    for (let j = 0; j < nv - 1; j += 2) {
      const k = i * nv + j;
      if (curv[k] > opts.threshold) {
        spots.push({ x: X[k], y: Y[k], r: 2.6, curv: curv[k], label: '' });
      }
    }
  }
  spots.sort((a, b) => b.curv - a.curv);
  const picked: SheetHotspot[] = [];
  const sep = 6.5;
  for (const s of spots) {
    if (picked.every((p) => Math.hypot(p.x - s.x, p.y - s.y) > sep)) {
      picked.push({ ...s, label: `K=${s.curv.toFixed(2)} 超限` });
    }
    if (picked.length >= 4) break;
  }

  let tMin = Infinity;
  let tMax = 0;
  for (let i = 0; i < thick.length; i++) {
    tMin = Math.min(tMin, thick[i]);
    tMax = Math.max(tMax, thick[i]);
  }
  const wallLabel = opts.adaptive
    ? `自适应偏置 t=${tMin.toFixed(2)}–${tMax.toFixed(2)} mm`
    : `等距偏置 t=${opts.wall.toFixed(1)} mm`;

  return {
    sample: {
      u: Float32Array.from({ length: nu }, (_, i) => i / (nu - 1)),
      phi: Float32Array.from({ length: nv }, (_, j) => (j / (nv - 1)) * Math.PI * 2),
      X,
      Y,
      curv,
      thick,
      nu,
      nv,
      length,
      widthTop: ringArc[0],
      widthBottom: ringArc[nu - 1],
    },
    outline,
    vent,
    bore,
    hotspots: picked,
    wallLabel,
    widthTop: ringArc[0],
    widthBottom: ringArc[nu - 1],
    length,
  };
}

export interface DevSample {
  u: Float32Array;
  phi: Float32Array;
  X: Float32Array;
  Y: Float32Array;
  curv: Float32Array;
  thick: Float32Array;
  nu: number;
  nv: number;
  length: number;
  widthTop: number;
  widthBottom: number;
}

export interface SheetHole {
  x: number;
  y: number;
  r: number;
  label: string;
}

export interface SheetHotspot {
  x: number;
  y: number;
  r: number;
  curv: number;
  label: string;
}

export type SheetLike = DevelopSheet;
export type SheetHotspotIn = SheetHotspot;

export interface DevelopSheet {
  sample: DevSample;
  outline: Array<[number, number]>;
  vent: SheetHole;
  bore: { x: number; y: number; w: number; h: number };
  hotspots: SheetHotspot[];
  wallLabel: string;
  widthTop: number;
  widthBottom: number;
  length: number;
}

export function curvatureAt(cps: ControlPoint[], u: number, phi: number): number {
  const epsU = 0.004;
  const epsP = 0.006;
  const p0 = evalPoint(cps, u, phi);
  const pm = evalPoint(cps, Math.max(0, u - epsU), phi);
  const pp = evalPoint(cps, Math.min(1, u + epsU), phi);
  const qm = evalPoint(cps, u, phi - epsP);
  const qp = evalPoint(cps, u, phi + epsP);
  const du = Math.max(0.0008, (Math.min(1, u + epsU) - Math.max(0, u - epsU))) * 1;
  const Su = {
    x: (pp.x - pm.x) / du,
    y: (pp.y - pm.y) / du,
    z: (pp.z - pm.z) / du,
  };
  const Sv = {
    x: (qp.x - qm.x) / (2 * epsP),
    y: (qp.y - qm.y) / (2 * epsP),
    z: (qp.z - qm.z) / (2 * epsP),
  };
  const Suu = {
    x: (pp.x - 2 * p0.x + pm.x) / (du * du),
    y: (pp.y - 2 * p0.y + pm.y) / (du * du),
    z: (pp.z - 2 * p0.z + pm.z) / (du * du),
  };
  const Svv = {
    x: (qp.x - 2 * p0.x + qm.x) / (epsP * epsP),
    y: (qp.y - 2 * p0.y + qm.y) / (epsP * epsP),
    z: (qp.z - 2 * p0.z + qm.z) / (epsP * epsP),
  };
  const a = 0.006;
  const dm = evalPoint(cps, Math.min(1, u + a), phi + epsP);
  const dn = evalPoint(cps, Math.min(1, u + a), phi - epsP);
  const em = evalPoint(cps, Math.max(0, u - a), phi + epsP);
  const en = evalPoint(cps, Math.max(0, u - a), phi - epsP);
  const ddu = Math.min(1, u + a) - Math.max(0, u - a) || 1e-6;
  const Suv = {
    x: (dm.x - dn.x - em.x + en.x) / (ddu * 2 * epsP),
    y: (dm.y - dn.y - em.y + en.y) / (ddu * 2 * epsP),
    z: (dm.z - dn.z - em.z + en.z) / (ddu * 2 * epsP),
  };
  const cross = (A: any, B: any) => ({
    x: A.y * B.z - A.z * B.y,
    y: A.z * B.x - A.x * B.z,
    z: A.x * B.y - A.y * B.x,
  });
  const dot = (A: any, B: any) => A.x * B.x + A.y * B.y + A.z * B.z;
  const n0 = cross(Su, Sv);
  const nl = Math.hypot(n0.x, n0.y, n0.z) || 1;
  const n = { x: n0.x / nl, y: n0.y / nl, z: n0.z / nl };
  const E = dot(Su, Su);
  const F = dot(Su, Sv);
  const G = dot(Sv, Sv);
  const den = E * G - F * F;
  if (Math.abs(den) < 1e-9) return 0;
  const e = dot(n, Suu);
  const f = dot(n, Suv);
  const g = dot(n, Svv);
  const K = (e * g - f * f) / den;
  const H = (e * G - 2 * f * F + g * E) / (2 * den);
  const disc = Math.max(0, H * H - K);
  const root = Math.sqrt(disc);
  return Math.max(Math.abs(H + root), Math.abs(H - root));
}

export function meridianLength(cps: ControlPoint[], u: number): number {
  // averaged over four meridians; enough to keep the sheet within 0.1 mm
  const phis = [0.3, 1.9, 3.6, 5.2];
  let acc = 0;
  for (const phi of phis) {
    let L = 0;
    let prev = evalPoint(cps, 0, phi);
    const steps = 48;
    for (let s = 1; s <= steps; s++) {
      const uu = (s / steps) * u;
      const p = evalPoint(cps, uu, phi);
      L += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      prev = p;
    }
    acc += L;
  }
  return acc / phis.length;
}

export function meanRadius(cps: ControlPoint[], u: number): number {
  let total = 0;
  const n = 48;
  for (let j = 0; j < n; j++) {
    const phi = (j / n) * Math.PI * 2;
    const a = evalPoint(cps, u, phi - 0.004);
    const b = evalPoint(cps, u, phi + 0.004);
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.008;
  }
  return total / n;
}

export interface DevelopOptions {
  nu?: number;
  nv?: number;
  wall?: number;
  adaptive?: boolean;
  threshold?: number;
}

export function developSheet(
  cps: ControlPoint[],
  opts: DevelopOptions = {},
  metrics?: { wallMin: number; wallMax: number },
): DevelopSheet {
  const nu = opts.nu ?? 41;
  const nv = opts.nv ?? 73;
  const wall = opts.wall ?? 1.2;
  const threshold = opts.threshold ?? 0.67;
  const adaptive = !!opts.adaptive;

  const arc: number[] = [];
  for (let i = 0; i < nu; i++) arc.push(meridianLength(cps, i / (nu - 1)));
  const rMean: number[] = [];
  for (let i = 0; i < nu; i++) rMean.push(Math.max(1.4, meanRadius(cps, i / (nu - 1))));

  const uArr = new Float32Array(nu);
  const phiArr = new Float32Array(nv);
  const X = new Float32Array(nu * nv);
  const Y = new Float32Array(nu * nv);
  const curv = new Float32Array(nu * nv);
  const thick = new Float32Array(nu * nv);
  const length = arc[nu - 1];

  for (let i = 0; i < nu; i++) {
    uArr[i] = i / (nu - 1);
  }
  for (let j = 0; j < nv; j++) {
    phiArr[j] = (j / (nv - 1)) * Math.PI * 2;
  }

  for (let i = 0; i < nu; i++) {
    const y = arc[i]; // rim at y=0, canal tip at y=+length
    for (let j = 0; j < nv; j++) {
      const phi = phiArr[j];
      const k = i * nv + j;
      X[k] = (phi - Math.PI) * rMean[i];
      Y[k] = y;
      const c = curvatureAt(cps, uArr[i], phi);
      curv[k] = c;
      let t = wall;
      if (adaptive) {
        const stress = Math.min(1, Math.max(0, (c - threshold * 0.55) / (threshold * 1.6)));
        t = Math.min(wall * (1 + stress * 0.55), c > 1e-4 ? 0.78 / c : 99);
        t = Math.min(2.6, Math.max(wall * 0.55, t));
      }
      thick[k] = t;
    }
  }

  const widthTop = 2 * Math.PI * rMean[0];
  const widthBottom = 2 * Math.PI * rMean[nu - 1];
  const sample: DevSample = {
    u: uArr,
    phi: phiArr,
    X,
    Y,
    curv,
    thick,
    nu,
    nv,
    length,
    widthTop,
    widthBottom,
  };

  // outline: top rim (left→right), right seam, tip (right→left), left seam
  const outline: Array<[number, number]> = [];
  for (let j = 0; j < nv; j++) outline.push([X[j], Y[j]]);
  for (let i = 1; i < nu; i++) outline.push([X[i * nv + (nv - 1)], Y[i * nv + (nv - 1)]]);
  for (let j = nv - 2; j >= 0; j--) outline.push([X[(nu - 1) * nv + j], Y[(nu - 1) * nv + j]]);
  for (let i = nu - 2; i > 0; i--) outline.push([X[i * nv], Y[i * nv]]);

  // vent plastered onto the canal section, offset from the seam
  const vi = Math.round(0.9 * (nu - 1));
  const vj = Math.round((Math.PI * 0.56 / (Math.PI * 2)) * (nv - 1));
  const vent: SheetHole = {
    x: X[vi * nv + vj],
    y: Y[vi * nv + vj],
    r: 0.65,
    label: '泄压孔 Ø1.3',
  };

  const bi = nu - 1;
  const bx = X[bi * nv + Math.floor(nv / 2)];  const bore = {
    x: bx,
    y: length,
    w: widthBottom * 0.72,
    h: 2.6,
  };

  const spots: SheetHotspot[] = [];
  for (let i = 1; i < nu - 1; i += 2) {
    for (let j = 0; j < nv - 1; j += 2) {
      const k = i * nv + j;
      if (curv[k] > threshold) spots.push({ x: X[k], y: Y[k], r: 0, curv: curv[k], label: '' });
    }
  }
  spots.sort((a, b) => b.curv - a.curv);
  const picked: SheetHotspot[] = [];
  for (const s of spots) {
    if (picked.every((p) => Math.hypot(p.x - s.x, p.y - s.y) > 7)) {
      picked.push({
        ...s,
        r: 2.6,
        label: `K=${s.curv.toFixed(2)} 超限`,
      });
    }
    if (picked.length >= 3) break;
  }

  const wallLabel = adaptive
    ? `自适应 t=${(metrics?.wallMin ?? wall).toFixed(2)}–${(metrics?.wallMax ?? wall).toFixed(2)} mm`
    : `等壁厚 t=${wall.toFixed(1)} mm`;

  return {
    sample,
    outline,
    vent,
    bore,
    hotspots: picked,
    wallLabel,
    widthTop,
    widthBottom,
    length,
  };
}

export function mapToSheet(
  sheet: DevelopSheet,
  u: number,
  phi: number,
): { x: number; y: number; curv: number; thick: number } {
  const { sample } = sheet;
  const fi = Math.min(sample.nu - 1, Math.max(0, u * (sample.nu - 1)));
  const fj = ((phi / (Math.PI * 2)) * (sample.nv - 1) + sample.nv - 1) % (sample.nv - 1);
  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const ti = fi - i0;
  const tj = fj - j0;
  const s = sample;
  const k00 = i0 * s.nv + j0;
  const k10 = Math.min(s.nu - 1, i0 + 1) * s.nv + j0;
  const k01 = i0 * s.nv + ((j0 + 1) % s.nv);
  const k11 = Math.min(s.nu - 1, i0 + 1) * s.nv + ((j0 + 1) % s.nv);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x = lerp(lerp(s.X[k00], s.X[k01], tj), lerp(s.X[k10], s.X[k11], tj), ti);
  const y = lerp(lerp(s.Y[k00], s.Y[k01], tj), lerp(s.Y[k10], s.Y[k11], tj), ti);
  const c = lerp(lerp(s.curv[k00], s.curv[k01], tj), lerp(s.curv[k10], s.curv[k11], tj), ti);
  const t = lerp(lerp(s.thick[k00], s.thick[k01], tj), lerp(s.thick[k10], s.thick[k11], tj), ti);
  return { x, y, curv: c, thick: t };
}

export interface SheetNote {
  label: string;
  value: string;
}

export function sheetNotes(sheet: DevelopSheet): SheetNote[] {
  return [
    { label: '展开长度', value: `${sheet.length.toFixed(1)} mm` },
    { label: '上缘展开宽', value: `${sheet.widthTop.toFixed(1)} mm` },
    { label: '末端展开宽', value: `${sheet.widthBottom.toFixed(1)} mm` },
    { label: '贴合边止口', value: '2.0 mm 倒角' },
  ];
}
