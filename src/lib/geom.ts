/**
 * Ear-shell surface engine.
 *
 * A control lattice of 6 (depth) x 8 (azimuth) points drives a smooth
 * Catmull-Rom surface built around a bent canal centreline. Every vertex keeps
 * first/second derivatives so the exact principal curvatures are available for
 * the risk view and for adaptive wall offsetting.
 */

export interface ControlPoint {
  u: number;
  phi: number;
  dr: number;
  dz: number;
  x: number;
  y: number;
  z: number;
}

export interface VersionMetrics {
  curvatureMax: number;
  curvatureP95: number;
  curvatureMean: number;
  overRatio: number;
  wallMin: number;
  wallMax: number;
  hotspots: number;
}

export interface Hotspot {
  u: number;
  phi: number;
  curv: number;
  x: number;
  y: number;
  z: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeoModel {
  nu: number;
  nv: number;
  pos: Float32Array;
  nrm: Float32Array;
  curv: Float32Array;
  inner: Float32Array;
  thick: Float32Array;
  handlePos: Float32Array;
  handleFrames: Float32Array; // normal xyz + tangent xyz per handle
  lattice: Float32Array; // line segment pairs for the control lattice
  metrics: VersionMetrics;
  threshold: number;
  wall: number;
  adaptive: boolean;
  hotspotDetail: Hotspot[];
  hotspotMask: Uint8Array; // per vertex
}

export const DEPTH_MM = 15.5;
export const CTRL_U = [0.015, 0.11, 0.225, 0.35, 0.475, 0.6, 0.735, 0.865, 1.0];
export const CTRL_V = 12;
export const CTRL_ROWS = CTRL_U.length;
export const NU_DEFAULT = 132;
export const NV_DEFAULT = 144;
export const CURV_THRESHOLD_DEFAULT = 0.67;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10); // quintic: C2 at both ends
};

/* ------------------------------------------------------------------ */
/* Base shape                                                          */
/* ------------------------------------------------------------------ */

export function centreline(u: number): Vec3 {
  const t = clamp(u, 0, 1);
  return {
    x: 1.85 * smooth(0.1, 1.0, t),
    y: 4.2 * t * t + 0.42 * Math.sin(Math.PI * t * 1.05),
    z: -DEPTH_MM * t,
  };
}

export function centrelineTangent(u: number): Vec3 {
  const e = 0.0025;
  const a = centreline(clamp(u - e, 0, 1));
  const b = centreline(clamp(u + e, 0, 1));
  return norm({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
}

export function localFrame(u: number): { X: Vec3; Y: Vec3; T: Vec3 } {
  const T = centrelineTangent(u);
  let X = cross({ x: 0, y: 1, z: 0 }, T);
  if (len(X) < 1e-5) X = { x: 1, y: 0, z: 0 };
  X = norm(X);
  const Y = norm(cross(T, X));
  return { X, Y, T };
}

function baseRadii(u: number, phi: number): { rx: number; ry: number } {
  const s = smooth(0.0, 0.72, u);
  const base = lerp(12.6, 4.2, s);
  const oval = 1 + 0.34 * (1 - s);
  const ripple = 1 + 0.045 * Math.cos(2 * phi + 0.8);
  return {
    rx: base * oval * ripple,
    ry: base * (1 - 0.1 * (1 - s)) * ripple,
  };
}

export function baseSurfacePoint(u: number, phi: number): Vec3 {
  const c = centreline(u);
  const { X, Y } = localFrame(u);
  const { rx, ry } = baseRadii(u, phi);
  return {
    x: c.x + X.x * rx * Math.cos(phi) + Y.x * ry * Math.sin(phi),
    y: c.y + X.y * rx * Math.cos(phi) + Y.y * ry * Math.sin(phi),
    z: c.z + X.z * rx * Math.cos(phi) + Y.z * ry * Math.sin(phi),
  };
}

/* ------------------------------------------------------------------ */
/* Small vector helpers                                                */
/* ------------------------------------------------------------------ */

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function len(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}
function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/* ------------------------------------------------------------------ */
/* Control points                                                      */
/* ------------------------------------------------------------------ */

export function makeControlPoints(
  fill?: (u: number, phi: number, i: number, j: number) => { dr: number; dz: number },
): ControlPoint[] {
  const out: ControlPoint[] = [];
  for (let i = 0; i < CTRL_ROWS; i++) {
    const u = CTRL_U[i];
    for (let j = 0; j < CTRL_V; j++) {
      const phi = (j / CTRL_V) * Math.PI * 2;
      const d = fill ? fill(u, phi, i, j) : { dr: 0, dz: 0 };
      const p = baseSurfacePoint(u, phi);
      out.push({
        u,
        phi,
        dr: clamp(d.dr, -4.5, 4.5),
        dz: clamp(d.dz, -2.5, 2.5),
        x: p.x,
        y: p.y,
        z: p.z,
      });
    }
  }
  return out;
}

export function defaultControlPoints(): ControlPoint[] {
  return makeControlPoints((u, phi) => {
    const dr = 0.42 * Math.sin(phi * 2 + 1.2) * (1 - u) + 0.16 * Math.sin(phi - 0.5);
    const dz = 0.3 * Math.sin(phi + 0.7) * (1 - u) * 0.7;
    return { dr, dz };
  });
}

export function cloneControlPoints(cps: ControlPoint[]): ControlPoint[] {
  return cps.map((c) => ({ ...c }));
}

/* ------------------------------------------------------------------ */
/* Interpolation weights                                               */
/* ------------------------------------------------------------------ */

interface Basis {
  nu: number;
  nv: number;
  Wu: Float32Array;
  Wv: Float32Array;
}
const basisCache = new Map<string, Basis>();

function catmull(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1,
    -1.5 * t3 + 2 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2,
  ];
}

function weightsFor(x: number, count: number, periodic: boolean, out: number[]): void {
  out.fill(0);
  if (periodic) {
    const pos = ((x % 1) + 1) % 1;
    const f = pos * count;
    const k = Math.floor(f);
    const t = f - k;
    const w = catmull(t);
    for (let m = 0; m < 4; m++) {
      const idx = ((k - 1 + m) % count + count) % count;
      out[idx] += w[m];
    }
    return;
  }
  const span = count - 1;
  const f = clamp(x, 0, 1) * span;
  let k = Math.floor(f);
  if (k >= span) k = span - 1;
  const t = f - k;
  const w = catmull(t);
  for (let m = 0; m < 4; m++) {
    const idx = clamp(k - 1 + m, 0, count - 1);
    out[idx] += w[m];
  }
}

function getBasis(nu: number, nv: number): Basis {
  const key = `${nu}x${nv}`;
  const hit = basisCache.get(key);
  if (hit) return hit;
  const Wu = new Float32Array(nu * CTRL_ROWS);
  const Wv = new Float32Array(nv * CTRL_V);
  const tmp = new Array(Math.max(CTRL_ROWS, CTRL_V)).fill(0);
  for (let i = 0; i < nu; i++) {
    weightsFor(i / (nu - 1), CTRL_ROWS, false, tmp);
    for (let a = 0; a < CTRL_ROWS; a++) Wu[i * CTRL_ROWS + a] = tmp[a];
  }
  for (let j = 0; j < nv; j++) {
    tmp.fill(0);
    weightsFor(j / (nv - 1), CTRL_V, true, tmp);
    for (let b = 0; b < CTRL_V; b++) Wv[j * CTRL_V + b] = tmp[b];
  }
  const basis = { nu, nv, Wu, Wv };
  basisCache.set(key, basis);
  if (basisCache.size > 6) {
    const first = basisCache.keys().next().value;
    if (first) basisCache.delete(first);
  }
  return basis;
}

function fieldAt(cps: ControlPoint[], u: number, phi: number): { dr: number; dz: number } {
  const wu = new Array(CTRL_ROWS).fill(0);
  const wv = new Array(CTRL_V).fill(0);
  weightsFor(u, CTRL_ROWS, false, wu);
  weightsFor(phi / (Math.PI * 2), CTRL_V, true, wv);
  let dr = 0;
  let dz = 0;
  for (let i = 0; i < CTRL_ROWS; i++) {
    if (!wu[i]) continue;
    for (let j = 0; j < CTRL_V; j++) {
      const w = wu[i] * wv[j];
      if (!w) continue;
      const c = cps[i * CTRL_V + j];
      dr += w * c.dr;
      dz += w * c.dz;
    }
  }
  return { dr, dz };
}

export function evalPoint(cps: ControlPoint[], u: number, phi: number): Vec3 {
  const { dr, dz } = fieldAt(cps, u, phi);
  const c = centreline(u);
  const { X, Y, T } = localFrame(u);
  const { rx, ry } = baseRadii(u, phi);
  const r = { rx: rx + dr, ry: ry + dr };
  return {
    x: c.x + X.x * r.rx * Math.cos(phi) + Y.x * r.ry * Math.sin(phi) + T.x * dz,
    y: c.y + X.y * r.rx * Math.cos(phi) + Y.y * r.ry * Math.sin(phi) + T.y * dz,
    z: c.z + X.z * r.rx * Math.cos(phi) + Y.z * r.ry * Math.sin(phi) + T.z * dz,
  };
}

export function evalNormal(cps: ControlPoint[], u: number, phi: number): Vec3 {
  const e = 0.004;
  const du = Math.max(0.0008, Math.min(e, Math.min(u, 1 - u) * 0.5));
  const a = evalPoint(cps, clamp(u - du, 0, 1), phi);
  const b = evalPoint(cps, clamp(u + du, 0, 1), phi);
  const c = evalPoint(cps, u, phi - e);
  const d = evalPoint(cps, u, phi + e);
  const n = norm(cross(
    { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    { x: d.x - c.x, y: d.y - c.y, z: d.z - c.z },
  ));
  const centre = centreline(u);
  const radial = { x: evalPoint(cps, u, phi).x - centre.x, y: 0, z: 0 };
  const p = evalPoint(cps, u, phi);
  const outward = { x: p.x - centre.x, y: p.y - centre.y, z: p.z - centre.z };
  return dot(n, outward) < 0 ? { x: -n.x, y: -n.y, z: -n.z } : n;
}

/** Update the stored x/y/z of each control point to the shaped surface. */
export function syncControlPoints(cps: ControlPoint[]): ControlPoint[] {
  return cps.map((c) => {
    const p = evalPoint(cps, c.u, c.phi);
    return { ...c, x: p.x, y: p.y, z: p.z };
  });
}

/* ------------------------------------------------------------------ */
/* Surface build                                                       */
/* ------------------------------------------------------------------ */

export interface BuildOptions {
  nu?: number;
  nv?: number;
  threshold?: number;
  wall?: number;
  adaptive?: boolean;
}

export function adaptiveThickness(
  curv: number,
  wall: number,
  threshold: number,
  adaptive: boolean,
): number {
  if (!adaptive) return wall;
  const stress = clamp((curv - threshold * 0.55) / (threshold * 1.6), 0, 1);
  const boosted = wall * (1 + stress * 0.55);
  const limit = curv > 1e-4 ? 0.78 / curv : 99;
  return clamp(Math.min(boosted, limit), wall * 0.55, 2.6);
}

export function buildSurface(
  cps: ControlPoint[],
  opts: BuildOptions = {},
): GeoModel {
  const nu = opts.nu ?? NU_DEFAULT;
  const nv = opts.nv ?? NV_DEFAULT;
  const threshold = opts.threshold ?? CURV_THRESHOLD_DEFAULT;
  const wall = opts.wall ?? 1.2;
  const adaptive = !!opts.adaptive;
  const basis = getBasis(nu, nv);
  const { Wu, Wv } = basis;
  const nVerts = nu * nv;

  const Gdr = new Float32Array(CTRL_ROWS * CTRL_V);
  const Gdz = new Float32Array(CTRL_ROWS * CTRL_V);
  for (let i = 0; i < CTRL_ROWS * CTRL_V; i++) {
    Gdr[i] = cps[i].dr;
    Gdz[i] = cps[i].dz;
  }

  const drField = new Float32Array(nVerts);
  const dzField = new Float32Array(nVerts);
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      let dr = 0;
      let dz = 0;
      for (let a = 0; a < CTRL_ROWS; a++) {
        const wa = Wu[i * CTRL_ROWS + a];
        if (!wa) continue;
        for (let b = 0; b < CTRL_V; b++) {
          const w = wa * Wv[j * CTRL_V + b];
          if (!w) continue;
          dr += w * Gdr[a * CTRL_V + b];
          dz += w * Gdz[a * CTRL_V + b];
        }
      }
      drField[i * nv + j] = dr;
      dzField[i * nv + j] = dz;
    }
  }

  const pos = new Float32Array(nVerts * 3);
  const centres = new Float32Array(nVerts * 3);
  const du = 1 / (nu - 1);
  const dv = (Math.PI * 2) / (nv - 1);

  for (let i = 0; i < nu; i++) {
    const u = i / (nu - 1);
    const c = centreline(u);
    const { X, Y, T } = localFrame(u);
    for (let j = 0; j < nv; j++) {
      const phi = (j / (nv - 1)) * Math.PI * 2;
      const { rx, ry } = baseRadii(u, phi);
      const rr = rx + drField[i * nv + j];
      const ry2 = ry + drField[i * nv + j];
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const dz = dzField[i * nv + j];
      const k = (i * nv + j) * 3;
      pos[k] = c.x + X.x * rr * cp + Y.x * ry2 * sp + T.x * dz;
      pos[k + 1] = c.y + X.y * rr * cp + Y.y * ry2 * sp + T.y * dz;
      pos[k + 2] = c.z + X.z * rr * cp + Y.z * ry2 * sp + T.z * dz;
      centres[k] = c.x;
      centres[k + 1] = c.y;
      centres[k + 2] = c.z;
    }
  }

  const nrm = new Float32Array(nVerts * 3);
  const curv = new Float32Array(nVerts);
  const thick = new Float32Array(nVerts);
  const inner = new Float32Array(nVerts * 3);

  const P = (i: number, j: number, axis: number) => {
    let ii = i;
    if (ii < 0) ii = 0;
    const jj = ((j % nv) + nv) % nv;
    let v: number;
    if (i >= 0 && i <= nu - 1) {
      v = pos[(ii * nv + jj) * 3 + axis];
    } else {
      // linear extrapolation of a ghost row keeps boundary curvature honest
      const edge = i < 0 ? 0 : nu - 1;
      const inner = i < 0 ? 1 : nu - 2;
      v = 2 * pos[(edge * nv + jj) * 3 + axis] - pos[(inner * nv + jj) * 3 + axis];
    }
    return v;
  };

  for (let i = 0; i < nu; i++) {
    const im = Math.max(0, i - 1);
    const ip = Math.min(nu - 1, i + 1);
    const duDen = (ip - im) * du;
    for (let j = 0; j < nv; j++) {
      const k3 = (i * nv + j) * 3;
      const jm = (j - 1 + nv) % nv;
      const jp = (j + 1) % nv;
      const Su = {
        x: (P(ip, j, 0) - P(im, j, 0)) / duDen,
        y: (P(ip, j, 1) - P(im, j, 1)) / duDen,
        z: (P(ip, j, 2) - P(im, j, 2)) / duDen,
      };
      const Sv = {
        x: (P(i, jp, 0) - P(i, jm, 0)) / (2 * dv),
        y: (P(i, jp, 1) - P(i, jm, 1)) / (2 * dv),
        z: (P(i, jp, 2) - P(i, jm, 2)) / (2 * dv),
      };
      let n = norm(cross(Su, Sv));
      const out = {
        x: pos[k3] - centres[k3],
        y: pos[k3 + 1] - centres[k3 + 1],
        z: pos[k3 + 2] - centres[k3 + 2],
      };
      if (dot(n, out) < 0) n = { x: -n.x, y: -n.y, z: -n.z };
      nrm[k3] = n.x;
      nrm[k3 + 1] = n.y;
      nrm[k3 + 2] = n.z;

      const Suu = {
        x: (P(ip, j, 0) - 2 * P(i, j, 0) + P(im, j, 0)) / (duDen * duDen),
        y: (P(ip, j, 1) - 2 * P(i, j, 1) + P(im, j, 1)) / (duDen * duDen),
        z: (P(ip, j, 2) - 2 * P(i, j, 2) + P(im, j, 2)) / (duDen * duDen),
      };
      const Svv = {
        x: (P(i, jp, 0) - 2 * P(i, j, 0) + P(i, jm, 0)) / (dv * dv),
        y: (P(i, jp, 1) - 2 * P(i, j, 1) + P(i, jm, 1)) / (dv * dv),
        z: (P(i, jp, 2) - 2 * P(i, j, 2) + P(i, jm, 2)) / (dv * dv),
      };
      const ipm = Math.min(nu - 1, i + 1);
      const imm = Math.max(0, i - 1);
      const duDen2 = ((ipm - imm) * du) * (2 * dv) || 1e-6;
      const Suv = {
        x: (P(ipm, jp, 0) - P(ipm, jm, 0) - P(imm, jp, 0) + P(imm, jm, 0)) / duDen2,
        y: (P(ipm, jp, 1) - P(ipm, jm, 1) - P(imm, jp, 1) + P(imm, jm, 1)) / duDen2,
        z: (P(ipm, jp, 2) - P(ipm, jm, 2) - P(imm, jp, 2) + P(imm, jm, 2)) / duDen2,
      };
      const E = dot(Su, Su);
      const F = dot(Su, Sv);
      const G = dot(Sv, Sv);
      const denom = E * G - F * F;
      let kMax = 0;
      if (Math.abs(denom) > 1e-9) {
        const e = dot(n, Suu);
        const f = dot(n, Suv);
        const g = dot(n, Svv);
        const K = (e * g - f * f) / denom;
        const H = (e * G - 2 * f * F + g * E) / (2 * denom);
        const disc = Math.max(0, H * H - K);
        const root = Math.sqrt(disc);
        kMax = Math.max(Math.abs(H + root), Math.abs(H - root));
      }
      if (!isFinite(kMax)) kMax = 0;
      curv[i * nv + j] = kMax;
    }
  }

  // light 3x3 relaxation of the curvature field: removes one-vertex sampling
  // noise while keeping the genuine stress patches intact.
  {
    const tmp = new Float32Array(nVerts);
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        let acc = curv[i * nv + j] * 4;
        let wsum = 4;
        for (let dj = -1; dj <= 1; dj += 2) {
          acc += curv[i * nv + ((j + dj + nv) % nv)] * 2;
          wsum += 2;
        }
        for (let di = -1; di <= 1; di += 2) {
          const ii = clamp(i + di, 0, nu - 1);
          acc += curv[ii * nv + j] * 2;
          wsum += 2;
          for (let dj = -1; dj <= 1; dj += 2) {
            acc += curv[ii * nv + ((j + dj + nv) % nv)];
            wsum += 1;
          }
        }
        tmp[i * nv + j] = acc / wsum;
      }
    }
    curv.set(tmp);
  }

  let wallMin = Infinity;
  let wallMax = 0;
  for (let v = 0; v < nVerts; v++) {
    const k3 = v * 3;
    const t = adaptiveThickness(curv[v], wall, threshold, adaptive);
    thick[v] = t;
    wallMin = Math.min(wallMin, t);
    wallMax = Math.max(wallMax, t);
    inner[k3] = pos[k3] - nrm[k3] * t;
    inner[k3 + 1] = pos[k3 + 1] - nrm[k3 + 1] * t;
    inner[k3 + 2] = pos[k3 + 2] - nrm[k3 + 2] * t;
  }

  // curvature statistics & hotspots
  const sorted = Float32Array.from(curv).sort();
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  let sum = 0;
  let over = 0;
  const mask = new Uint8Array(nVerts);
  for (let v = 0; v < nVerts; v++) {
    sum += curv[v];
    if (curv[v] > threshold) {
      over++;
      mask[v] = 1;
    }
  }

  // connected clusters over the periodic grid
  const visited = new Uint8Array(nVerts);
  const clusters: Hotspot[] = [];
  const stack: number[] = [];
  for (let idx = 0; idx < nVerts; idx++) {
    if (!mask[idx] || visited[idx]) continue;
    stack.length = 0;
    stack.push(idx);
    visited[idx] = 1;
    let best = idx;
    let bestC = curv[idx];
    while (stack.length) {
      const cur = stack.pop()!;
      const ci = Math.floor(cur / nv);
      const cj = cur % nv;
      if (curv[cur] > bestC) {
        bestC = curv[cur];
        best = cur;
      }
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          if (ni < 0 || ni >= nu) continue;
          const nj = ((cj + dj) % nv + nv) % nv;
          const nidx = ni * nv + nj;
          if (mask[nidx] && !visited[nidx]) {
            visited[nidx] = 1;
            stack.push(nidx);
          }
        }
      }
    }
    const bi = Math.floor(best / nv);
    const bj = best % nv;
    clusters.push({
      u: bi / (nu - 1),
      phi: (bj / (nv - 1)) * Math.PI * 2,
      curv: bestC,
      x: pos[best * 3],
      y: pos[best * 3 + 1],
      z: pos[best * 3 + 2],
    });
  }
  clusters.sort((a, b) => b.curv - a.curv);

  const handlePos = new Float32Array(CTRL_ROWS * CTRL_V * 3);
  const handleFrames = new Float32Array(CTRL_ROWS * CTRL_V * 6);
  cps.forEach((c, idx) => {
    const p = evalPoint(cps, c.u, c.phi);
    const n = evalNormal(cps, c.u, c.phi);
    const t = centrelineTangent(c.u);
    handlePos[idx * 3] = p.x;
    handlePos[idx * 3 + 1] = p.y;
    handlePos[idx * 3 + 2] = p.z;
    handleFrames[idx * 6] = n.x;
    handleFrames[idx * 6 + 1] = n.y;
    handleFrames[idx * 6 + 2] = n.z;
    handleFrames[idx * 6 + 3] = t.x;
    handleFrames[idx * 6 + 4] = t.y;
    handleFrames[idx * 6 + 5] = t.z;
  });

  const lattice: number[] = [];
  for (let i = 0; i < CTRL_ROWS; i++) {
    for (let j = 0; j < CTRL_V; j++) {
      const a = i * CTRL_V + j;
      const b = i * CTRL_V + ((j + 1) % CTRL_V);
      const c = (i + 1) * CTRL_V + j;
      lattice.push(
        handlePos[a * 3], handlePos[a * 3 + 1], handlePos[a * 3 + 2],
        handlePos[b * 3], handlePos[b * 3 + 1], handlePos[b * 3 + 2],
      );
      if (i + 1 < CTRL_ROWS) {
        lattice.push(
          handlePos[a * 3], handlePos[a * 3 + 1], handlePos[a * 3 + 2],
          handlePos[c * 3], handlePos[c * 3 + 1], handlePos[c * 3 + 2],
        );
      }
    }
  }

  const metrics: VersionMetrics = {
    curvatureMax: clusters.length ? clusters[0].curv : sorted[sorted.length - 1] || 0,
    curvatureP95: p95 || 0,
    curvatureMean: sum / nVerts,
    overRatio: over / nVerts,
    wallMin: isFinite(wallMin) ? wallMin : wall,
    wallMax,
    hotspots: clusters.length,
  };

  return {
    nu,
    nv,
    pos,
    nrm,
    curv,
    inner,
    thick,
    handlePos,
    handleFrames,
    lattice: new Float32Array(lattice),
    metrics,
    threshold,
    wall,
    adaptive,
    hotspotDetail: clusters.slice(0, 16),
    hotspotMask: mask,
  };
}

/* ------------------------------------------------------------------ */
/* Point-cloud fitting                                                 */
/* ------------------------------------------------------------------ */

function nearestU(x: number, y: number, z: number): { u: number; c: Vec3 } {
  let bestU = 0;
  let bestD = Infinity;
  let bestC = centreline(0);
  for (let s = 0; s <= 160; s++) {
    const u = s / 160;
    const c = centreline(u);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      bestU = u;
      bestC = c;
    }
  }
  return { u: bestU, c: bestC };
}

/**
 * Fit the control lattice to an imported ASCII point cloud (x,y,z per line).
 * Points are bucketed into the 6x8 control cells and averaged.
 */
export function fitControlPointsFromCloud(points: ArrayLike<number>): ControlPoint[] {
  const sumDr = new Float32Array(CTRL_ROWS * CTRL_V);
  const sumDz = new Float32Array(CTRL_ROWS * CTRL_V);
  const counts = new Float32Array(CTRL_ROWS * CTRL_V);
  const count = Math.floor(points.length / 3);
  const stride = Math.max(1, Math.floor(count / 7000));
  for (let p = 0; p < count; p += stride) {
    const x = points[p * 3];
    const y = points[p * 3 + 1];
    const z = points[p * 3 + 2];
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
    const { u, c } = nearestU(x, y, z);
    const { X, Y, T } = localFrame(u);
    const dx = x - c.x;
    const dy = y - c.y;
    const dz = z - c.z;
    const phi = Math.atan2(dot({ x: dx, y: dy, z: dz }, Y), dot({ x: dx, y: dy, z: dz }, X));
    const { rx, ry } = baseRadii(u, phi);
    const ex = dot({ x: dx, y: dy, z: dz }, X);
    const ey = dot({ x: dx, y: dy, z: dz }, Y);
    const radial = Math.hypot(ex / rx, ey / ry);
    const dr = (radial - 1) * ((rx + ry) / 2);
    const axial = dot({ x: dx, y: dy, z: dz }, T);
    const uu = ((phi / (Math.PI * 2)) % 1 + 1) % 1;
    let ci = 0;
    let best = 9;
    for (let i = 0; i < CTRL_ROWS; i++) {
      const d = Math.abs(CTRL_U[i] - u);
      if (d < best) {
        best = d;
        ci = i;
      }
    }
    const cj = Math.round(uu * CTRL_V) % CTRL_V;
    if (!isFinite(dr) || !isFinite(axial)) continue;
    const idx = ci * CTRL_V + cj;
    sumDr[idx] += clamp(dr, -4, 4);
    sumDz[idx] += clamp(axial, -2.2, 2.2);
    counts[idx]++;
  }
  const out: ControlPoint[] = [];
  for (let i = 0; i < CTRL_ROWS; i++) {
    for (let j = 0; j < CTRL_V; j++) {
      const idx = i * CTRL_V + j;
      const n = counts[idx];
      const dr = n ? sumDr[idx] / n : 0;
      const dz = n ? sumDz[idx] / n : 0;
      const u = CTRL_U[i];
      const phi = (j / CTRL_V) * Math.PI * 2;
      const p = baseSurfacePoint(u, phi);
      out.push({ u, phi, dr: clamp(dr, -3.2, 3.2), dz: clamp(dz, -1.8, 1.8), x: p.x, y: p.y, z: p.z });
    }
  }
  return syncControlPoints(out);
}

/** Deterministic synthetic scan for the "use sample scan" flow. */
export function syntheticScan(seed = 3): Float32Array {
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const target = makeControlPoints((u, phi) => {
    const dr =
      0.55 * Math.sin(phi * 2 + 0.6) * (1 - u) +
      0.34 * Math.cos(phi + 1.8) * smooth(0.2, 0.9, u) +
      0.22 * Math.sin(phi * 3) * u;
    const dz = 0.32 * Math.cos(phi * 2 - 0.4) * (1 - u);
    return { dr, dz };
  });
  const n = 9000;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.pow(rnd(), 0.75);
    const phi = rnd() * Math.PI * 2;
    const p = evalPoint(target, u, phi);
    pts[i * 3] = p.x + (rnd() - 0.5) * 0.22;
    pts[i * 3 + 1] = p.y + (rnd() - 0.5) * 0.22;
    pts[i * 3 + 2] = p.z + (rnd() - 0.5) * 0.22;
  }
  return pts;
}

export function parsePointCloudText(text: string): Float32Array {
  const out: number[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) continue;
    const parts = t.split(/[\s,;]+/).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((v) => isFinite(v))) {
      out.push(parts[0], parts[1], parts[2]);
    }
    if (out.length > 9000 * 3) break;
  }
  return new Float32Array(out);
}
