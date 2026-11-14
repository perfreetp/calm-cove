// 烧伤压力衣 · 几何与考核内核
// 所有长度单位为毫米，压力单位 mmHg。

export const EPS = 1e-9;
export const MMHG_PER_MEGAPASCAL = 7500.6; // 1 N/mm² = 1 MPa ≈ 7500.6 mmHg

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function round(v, d = 1) {
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

/** 自然三次样条，控制点按 x 升序；返回求值器（含一阶、二阶导数） */
export function buildSpline(points) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const n = xs.length;
  if (n === 0) throw new Error('样条至少需要一个控制点');

  // 消除重复 x，保证节点严格递增
  for (let i = 1; i < n; i++) {
    if (xs[i] - xs[i - 1] < 0.05) xs[i] = xs[i - 1] + 0.05;
  }

  const h = [];
  for (let i = 0; i < n - 1; i++) h.push(Math.max(xs[i + 1] - xs[i], 1e-6));
  const M = new Array(n).fill(0);

  if (n > 2) {
    const m = n - 2;
    const a = new Array(m);
    const b = new Array(m);
    const c = new Array(m);
    const d = new Array(m);
    for (let k = 0; k < m; k++) {
      const i = k + 1;
      a[k] = h[i - 1];
      b[k] = 2 * (h[i - 1] + h[i]);
      c[k] = h[i];
      d[k] = 6 * ((ys[i + 1] - ys[i]) / h[i] - (ys[i] - ys[i - 1]) / h[i - 1]);
    }
    const cp = new Array(m);
    const dp = new Array(m);
    cp[0] = c[0] / b[0];
    dp[0] = d[0] / b[0];
    for (let i = 1; i < m; i++) {
      const den = b[i] - a[i] * cp[i - 1];
      cp[i] = c[i] / den;
      dp[i] = (d[i] - a[i] * dp[i - 1]) / den;
    }
    // 回代
    M[m] = dp[m - 1];
    for (let i = m - 2; i >= 0; i--) M[i + 1] = dp[i] - cp[i] * M[i + 2];
    M[0] = 0;
    M[n - 1] = 0;
  }

  function evalAt(xv) {
    if (n === 1) return { y: ys[0], dy: 0, ddy: 0, k: 0 };
    // 区间外线性外推，避免样条末端发散
    if (xv <= xs[0]) {
      const k = 0;
      const slope = n > 1 ? (ys[1] - ys[0]) / h[0] : 0;
      return { y: ys[0] + slope * (xv - xs[0]), dy: slope, ddy: 0, k };
    }
    if (xv >= xs[n - 1]) {
      const k = n - 2;
      const slope = (ys[n - 1] - ys[n - 2]) / h[n - 2];
      return { y: ys[n - 1] + slope * (xv - xs[n - 1]), dy: slope, ddy: 0, k };
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= xv) lo = mid;
      else hi = mid;
    }
    const k = lo;
    const hk = h[k];
    const A = (xs[k + 1] - xv) / hk;
    const B = (xv - xs[k]) / hk;
    const y =
      A * ys[k] +
      B * ys[k + 1] +
      ((A ** 3 - A) * M[k] + (B ** 3 - B) * M[k + 1]) * ((hk * hk) / 6);
    const dy =
      (ys[k + 1] - ys[k]) / hk +
      (hk / 6) * (-(3 * A * A - 1) * M[k] + (3 * B * B - 1) * M[k + 1]);
    const ddy = A * M[k] + B * M[k + 1];
    return { y, dy, ddy, k };
  }

  return { xs, ys, h, M, eval: evalAt, x0: xs[0], x1: xs[n - 1], n };
}

/** 轴向均匀采样，带弧长 s 与曲率 κ */
export function sampleProfile(points, count = 240) {
  const spline = buildSpline(points);
  const x0 = spline.x0;
  const x1 = spline.x1;
  const N = Math.max(60, count);
  const out = [];
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const x = x0 + ((x1 - x0) * i) / N;
    const e = spline.eval(x);
    const kappa = Math.abs(e.ddy) / Math.pow(1 + e.dy * e.dy, 1.5);
    if (i > 0) {
      const prev = out[i - 1];
      s += Math.hypot(x - prev.x, e.y - prev.y);
    }
    out.push({ x, y: e.y, dy: e.dy, ddy: e.ddy, kappa, s });
  }
  return out;
}

/** 曲率突变：|dκ/ds| 超阈值的连续区段 */
export function findAbrupt(samples, threshold = 0.0009) {
  const flags = new Array(samples.length).fill(false);
  const slopes = new Array(samples.length).fill(0);
  for (let i = 1; i < samples.length; i++) {
    const ds = samples[i].s - samples[i - 1].s;
    if (ds <= EPS) continue;
    const slope = Math.abs(samples[i].kappa - samples[i - 1].kappa) / ds;
    slopes[i] = slope;
    if (slope > threshold) flags[i] = true;
  }
  const segments = [];
  let cur = null;
  for (let i = 1; i < samples.length; i++) {
    if (flags[i]) {
      if (!cur) {
        cur = {
          startMM: samples[i - 1].x,
          endMM: samples[i].x,
          peakSlope: slopes[i],
          peakKappa: samples[i].kappa,
        };
      }
      cur.endMM = samples[i].x;
      if (slopes[i] > cur.peakSlope) {
        cur.peakSlope = slopes[i];
        cur.peakKappa = samples[i].kappa;
      }
    } else if (cur) {
      segments.push(cur);
      cur = null;
    }
  }
  if (cur) segments.push(cur);
  return segments;
}

/** 沿法线等距偏移：d > 0 向体表外侧（半径增大） */
export function offsetSamples(samples, d) {
  return samples.map((p) => {
    const len = Math.hypot(p.dy, 1) || 1;
    const nx = -p.dy / len;
    const ny = 1 / len;
    return { x: p.x + d * nx, y: p.y + d * ny, s: p.s, from: p };
  });
}

function segIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-10) return null;
  const ex = p3.x - p1.x;
  const ey = p3.y - p1.y;
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4) {
    return { x: p1.x + t * d1x, y: p1.y + t * d1y, t, u };
  }
  return null;
}

/** 折线自交检测；相邻段跳过，交点按 dedupeMM 去重 */
export function detectSelfIntersections(poly, minGap = 5, dedupeMM = 1.5) {
  const hits = [];
  const n = poly.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + minGap; j < n - 1; j++) {
      const r = segIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1]);
      if (r) hits.push(r);
    }
  }
  const uniq = [];
  for (const h of hits) {
    if (!uniq.some((u) => Math.hypot(u.x - h.x, u.y - h.y) < dedupeMM)) uniq.push(h);
  }
  return uniq;
}

export function decimate(poly, step = 2) {
  const out = [];
  for (let i = 0; i < poly.length; i += step) out.push(poly[i]);
  if (out[out.length - 1] !== poly[poly.length - 1]) out.push(poly[poly.length - 1]);
  return out;
}

/**
 * 旋转体展开：沿经线弧长 s 为长度，周向 2πr 为宽度，
 * 两侧各加 offsetMM 缝份。返回下料轮廓与面积/周长。
 */
export function unfoldPattern(samples, offsetMM = 0) {
  const rows = samples.map((p) => {
    const circ = 2 * Math.PI * Math.max(p.y, 0);
    return {
      x: p.x,
      s: p.s,
      radius: p.y,
      circ,
      halfWidth: circ / 2 + offsetMM,
    };
  });
  let area = 0;
  let edgeLen = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const ds = b.s - a.s;
    area += ((2 * a.halfWidth + 2 * b.halfWidth) / 2) * ds;
    edgeLen += Math.hypot(ds, b.halfWidth - a.halfWidth);
  }
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const perimeter = edgeLen * 2 + top.halfWidth * 2 + bottom.halfWidth * 2;
  const widths = rows.map((r) => r.halfWidth * 2);
  // 轮廓多边形（沿左侧边向上、右侧边向下）
  const outline = [];
  for (const r of rows) outline.push({ x: r.s, y: r.halfWidth });
  for (let i = rows.length - 1; i >= 0; i--) outline.push({ x: rows[i].s, y: -rows[i].halfWidth });
  return {
    rows,
    outline,
    lengthMM: bottom.s - top.s,
    maxWidthMM: Math.max(...widths),
    minWidthMM: Math.min(...widths),
    areaMM2: area,
    areaCM2: area / 100,
    perimeterMM: perimeter,
    perimeterCM: perimeter / 10,
  };
}

/** 拉普拉斯定律估算压力：P(mmHg) = 7500.6 × T(N/mm) / r(mm) */
export function pressureProfile(samples, fabric) {
  const T = fabric.tensionNPerMM;
  const values = samples.map((p) => (MMHG_PER_MEGAPASCAL * T) / Math.max(p.y, 1));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    values,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    tension: T,
  };
}

/** 与参考轮廓比对，返回 RMS 与超过阈值的区段 */
export function compareContours(studentSamples, refPoints, threshold = 5) {
  const refSpline = buildSpline(refPoints);
  const devs = studentSamples.map((p) => {
    const x = clamp(p.x, refSpline.x0, refSpline.x1);
    const reference = refSpline.eval(x).y;
    return { x: p.x, student: p.y, reference, dev: p.y - reference };
  });
  const rms = Math.sqrt(devs.reduce((a, d) => a + d.dev * d.dev, 0) / devs.length);
  const meanSigned = devs.reduce((a, d) => a + d.dev, 0) / devs.length;
  const segments = [];
  let cur = null;
  for (const d of devs) {
    if (Math.abs(d.dev) > threshold) {
      if (!cur) {
        cur = { startMM: d.x, endMM: d.x, maxAbs: 0, signedAtMax: 0, peakX: d.x };
      }
      cur.endMM = d.x;
      if (Math.abs(d.dev) > cur.maxAbs) {
        cur.maxAbs = Math.abs(d.dev);
        cur.signedAtMax = d.dev;
        cur.peakX = d.x;
      }
    } else if (cur) {
      segments.push(cur);
      cur = null;
    }
  }
  if (cur) segments.push(cur);
  return {
    devs,
    rms,
    meanSigned,
    segments,
    maxAbs: Math.max(...devs.map((d) => Math.abs(d.dev))),
    threshold,
  };
}

export function recommendedOffset(fabric) {
  return round(fabric.baseSeamMM * (1 + fabric.elasticity), 1);
}

/** 测量数据与建模曲线的吻合度自检 */
export function checkMeasurements(samples, measurements) {
  return measurements.map((m) => {
    let best = samples[0];
    for (const p of samples) {
      if (Math.abs(p.x - m.pos) < Math.abs(best.x - m.pos)) best = p;
    }
    const predictedCirc = 2 * Math.PI * best.y;
    return {
      ...m,
      predictedCirc,
      delta: predictedCirc - m.circ,
    };
  });
}

/**
 * 综合自动评分（满分 100）
 * 轮廓偏差 60 + 曲率平滑 20 + 缝份 10 + 压力档位 10
 */
export function evaluateModel(points, task, offsetMM) {
  const samples = sampleProfile(points, 240);
  const abrupt = findAbrupt(samples, task.curvatureThreshold);
  const offsetPoly = decimate(offsetSamples(samples, offsetMM), 2);
  const selfIntersections = detectSelfIntersections(offsetPoly);
  const patternSamples = decimate(samples, 2);
  const pattern = unfoldPattern(patternSamples, Math.abs(offsetMM));
  const pressure = pressureProfile(samples, task.fabric);
  const deviation = compareContours(samples, task.reference, 5);
  const measurements = checkMeasurements(samples, task.measurements);

  const tier = task.pressureTier;
  const pressureInTier = pressure.mean >= tier.min && pressure.mean <= tier.max;
  const pressureNearTier =
    pressure.mean >= tier.min - 3 && pressure.mean <= tier.max + 3;

  const deviationPart = clamp(1 - deviation.rms / 8, 0, 1);
  const segmentPart = clamp(1 - deviation.segments.length / 6, 0, 1);
  const contourScore = round(60 * (0.6 * deviationPart + 0.4 * segmentPart), 1);
  const smoothScore = round(clamp(20 - abrupt.length * 2.5, 0, 20), 1);

  const rec = recommendedOffset(task.fabric);
  const offsetDelta = Math.abs(offsetMM - rec);
  let seamScore = offsetDelta <= 0.5 ? 10 : offsetDelta <= 1.5 ? 8 : offsetDelta <= 3 ? 6 : 3;
  if (selfIntersections.length > 0) seamScore = Math.min(seamScore, 3);
  const pressureScore = pressureInTier ? 10 : pressureNearTier ? 6 : 2;
  const autoScore = round(contourScore + smoothScore + seamScore + pressureScore, 1);

  const maxKappa = Math.max(...samples.map((p) => p.kappa));
  const maxMeasDelta = measurements.reduce((a, m) => Math.max(a, Math.abs(m.delta)), 0);

  const errors = [];
  if (deviation.segments.length) {
    errors.push({
      type: 'contour',
      label: '轮廓偏差超过 5 mm',
      count: deviation.segments.length,
    });
  }
  if (abrupt.length) {
    errors.push({ type: 'curvature', label: '曲率突变超阈值', count: abrupt.length });
  }
  if (selfIntersections.length) {
    errors.push({ type: 'seam', label: '缝份等距偏移自交', count: selfIntersections.length });
  }
  if (!pressureInTier) {
    errors.push({ type: 'pressure', label: '估算压力未落在档位区间', count: 1 });
  }

  return {
    autoScore,
    breakdown: {
      contour: contourScore,
      smooth: smoothScore,
      seam: seamScore,
      pressure: pressureScore,
    },
    rms: round(deviation.rms, 2),
    meanSigned: round(deviation.meanSigned, 2),
    maxAbsDeviation: round(deviation.maxAbs, 2),
    deviationSegments: deviation.segments.map((s) => ({
      startMM: round(s.startMM, 0),
      endMM: round(s.endMM, 0),
      maxAbs: round(s.maxAbs, 1),
      signed: round(s.signedAtMax, 1),
      peakX: round(s.peakX, 0),
    })),
    abruptSegments: abrupt.map((s) => ({
      startMM: round(s.startMM, 0),
      endMM: round(s.endMM, 0),
      peakSlope: round(s.peakSlope, 5),
      peakKappa: round(s.peakKappa, 4),
    })),
    selfIntersections: selfIntersections.map((h) => ({
      x: round(h.x, 1),
      y: round(h.y, 1),
    })),
    selfIntersectCount: selfIntersections.length,
    maxKappa: round(maxKappa, 5),
    minCurvatureRadius: maxKappa > 0 ? round(1 / maxKappa, 1) : null,
    pressure: {
      mean: round(pressure.mean, 2),
      min: round(pressure.min, 2),
      max: round(pressure.max, 2),
      inTier: pressureInTier,
      nearTier: pressureNearTier,
    },
    pattern: {
      areaCM2: round(pattern.areaCM2, 1),
      perimeterCM: round(pattern.perimeterCM, 1),
      lengthMM: round(pattern.lengthMM, 0),
      maxWidthMM: round(pattern.maxWidthMM, 1),
      minWidthMM: round(pattern.minWidthMM, 1),
    },
    measurements: measurements.map((m) => ({
      pos: m.pos,
      circ: m.circ,
      predictedCirc: round(m.predictedCirc, 1),
      delta: round(m.delta, 1),
    })),
    maxMeasDelta: round(maxMeasDelta, 1),
    offsetMM: round(offsetMM, 1),
    offsetRecommended: rec,
    curvatureThreshold: task.curvatureThreshold,
    errors,
  };
}

export function fmtMM(v, d = 1) {
  if (!Number.isFinite(v)) return '—';
  return `${round(v, d).toFixed(d)} mm`;
}
