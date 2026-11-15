import type { Detection, Run, TrackPoint, Vec } from './types';

export interface JudgeInput {
  track: TrackPoint[];
  laneCenterY: number;
  laneWidth: number;
  startX: number;
  markStep: number;
  startMark: number;
  endMark: number;
  startOffsetSec: number;
  splits: { mark: number; t: number; distance: number }[];
}

export const DEVIATION_WARN_M = 3;
export const DEVIATION_SERIOUS_M = 5;
export const MISSED_MARK_M = 6.75;

/** Perpendicular offset from the lane centre line for a track point. */
export const offsetOf = (p: TrackPoint, laneCenterY: number) => p.y - laneCenterY;

export function analyseTrack(input: JudgeInput): {
  detections: Detection[];
  maxDeviation: number;
  meanDeviation: number;
  deviations: number[];
} {
  const { track, laneCenterY, startX, markStep, startMark, endMark, startOffsetSec } = input;
  const detections: Detection[] = [];
  const deviations = track.map((p) => offsetOf(p, laneCenterY));
  let maxDeviation = 0;
  let absSum = 0;
  for (const d of deviations) {
    maxDeviation = Math.max(maxDeviation, Math.abs(d));
    absSum += Math.abs(d);
  }
  const meanDeviation = track.length ? absSum / track.length : 0;

  // --- 偏航：连续超过 3 m 即判偏航，附最远点 ---
  let runStart = -1;
  let runPeak = 0;
  let peakIdx = -1;
  let worstRun: { start: number; peak: number; peakIdx: number } | null = null;
  for (let i = 0; i < deviations.length; i++) {
    const over = Math.abs(deviations[i]) > DEVIATION_WARN_M;
    if (over) {
      if (runStart < 0) {
        runStart = i;
        runPeak = 0;
        peakIdx = i;
      }
      if (Math.abs(deviations[i]) > runPeak) {
        runPeak = Math.abs(deviations[i]);
        peakIdx = i;
      }
    } else if (runStart >= 0) {
      if (!worstRun || runPeak > worstRun.peak) {
        worstRun = { start: runStart, peak: runPeak, peakIdx };
      }
      runStart = -1;
    }
  }
  if (runStart >= 0) {
    if (!worstRun || runPeak > worstRun.peak) worstRun = { start: runStart, peak: runPeak, peakIdx };
  }
  if (worstRun) {
    const p = track[worstRun.peakIdx];
    detections.push({
      kind: 'deviation',
      severity: worstRun.peak >= DEVIATION_SERIOUS_M ? 'serious' : 'warn',
      detail: `偏离航道中线最远 ${worstRun.peak.toFixed(2)} m（阈值 3.00 m），位于 ${
        p ? Math.round((p.x - startX) / 1) : 0
      } m 处`,
      at: p ? { x: p.x, y: p.y } : undefined,
      atT: p?.t,
      value: worstRun.peak
    });
  }

  // --- 抢航：过起航线时刻早于发令 ---
  if (startOffsetSec < 0) {
    detections.push({
      kind: 'falseStart',
      severity: startOffsetSec < -0.5 ? 'serious' : 'warn',
      detail: `起航信号前 ${Math.abs(startOffsetSec).toFixed(2)} s 越过起航线`,
      value: startOffsetSec
    });
  }

  // --- 漏标：经过每个 250 m 标志线时偏离超过半个航道 ---
  for (let mark = startMark + 1; mark < endMark; mark++) {
    const mx = startX + (mark - startMark) * markStep;
    // find crossing point of x == mx
    let cross: TrackPoint | null = null;
    for (let i = 1; i < track.length; i++) {
      const a = track[i - 1];
      const b = track[i];
      if ((a.x - mx) * (b.x - mx) <= 0) {
        const f = b.x === a.x ? 0 : (mx - a.x) / (b.x - a.x);
        cross = { x: mx, y: a.y + (b.y - a.y) * f, t: a.t + (b.t - a.t) * f };
        break;
      }
    }
    if (!cross) {
      detections.push({
        kind: 'missedBuoy',
        severity: 'serious',
        detail: `未经过 M${mark} 号标志线（轨迹缺失该段）`,
        mark
      });
      continue;
    }
    const off = Math.abs(cross.y - laneCenterY);
    if (off > MISSED_MARK_M) {
      detections.push({
        kind: 'missedBuoy',
        severity: 'serious',
        detail: `通过 M${mark} 浮标时偏离 ${off.toFixed(2)} m，已划过相邻航道`,
        at: cross,
        atT: cross.t,
        value: off,
        mark
      });
    }
  }

  return { detections, maxDeviation, meanDeviation, deviations };
}

export const flagLabel: Record<Detection['kind'], string> = {
  deviation: '偏航',
  falseStart: '抢航',
  missedBuoy: '漏标'
};

export const statusLabel: Record<Run['status'], string> = {
  pending: '待复核',
  valid: '有效',
  invalid: '作废'
};

export const reasonCodes = [
  '判定成立 · 偏航超限',
  '判定成立 · 抢航',
  '判定成立 · 漏标',
  '设备漂移，轨迹失真',
  '避让其他艇只',
  '发令计时误差',
  '教练指令调整航道'
];

/**
 * Renders a deterministic SVG "screenshot" of the incident for the review card.
 * Kept as a data URI so it can be attached to any run (seed or uploaded).
 */
export function buildSnapshot(run: {
  id: string;
  boatId: string;
  lane: number;
  laneCenterY: number;
  laneWidth: number;
  startX: number;
  track: TrackPoint[];
  detections: Detection[];
  startMark: number;
  endMark: number;
  markStep: number;
  durationSec: number;
}): string {
  const W = 460;
  const H = 258;
  const padL = 26;
  const padR = 12;
  const padT = 24;
  const padB = 24;
  const x0 = run.startX;
  const x1 = run.startX + (run.endMark - run.startMark) * run.markStep;
  // vertical window: the own lane plus a slice of both neighbours — tight enough
  // that a 3 m deviation is plainly visible against the lane band.
  const halfSpan = Math.max(run.laneWidth * 1.05, 6.5);
  const y0 = run.laneCenterY - halfSpan;
  const y1 = run.laneCenterY + halfSpan;
  const sx = (x: number) => padL + ((x - x0) / (x1 - x0)) * (W - padL - padR);
  const sy = (y: number) => padT + ((y - y0) / (y1 - y0)) * (H - padT - padB);
  const incident = run.detections.find((d) => d.at);
  const pts = run.track.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const incIdx = incident?.atT != null
    ? Math.max(0, run.track.findIndex((p) => p.t >= incident.atT!))
    : -1;
  const highlight =
    incIdx >= 0
      ? run.track
          .slice(Math.max(0, incIdx - 6), Math.min(run.track.length, incIdx + 7))
          .map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
          .join(' ')
      : '';
  const laneTop = sy(run.laneCenterY - run.laneWidth / 2);
  const laneBot = sy(run.laneCenterY + run.laneWidth / 2);
  const maxOff = halfSpan;
  const warnTop = sy(run.laneCenterY - 3);
  const warnBot = sy(run.laneCenterY + 3);
  const label = incident ? flagLabel[incident.kind] : '正常';
  const tint = incident ? '#e8b04b' : '#4ec9b0';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d2f33"/><stop offset="1" stop-color="#082227"/>
    </linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" fill="none" stroke="#1d4a4f" stroke-width="0.6"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#grid)" opacity="0.55"/>
  <rect x="${padL}" y="${padT}" width="${W - padL - padR}" height="${H - padT - padB}" fill="#0a2a2f" opacity="0.6"/>
  <rect x="${padL}" y="${laneTop}" width="${W - padL - padR}" height="${laneBot - laneTop}" fill="#155055" opacity="0.5"/>
  <line x1="${padL}" y1="${sy(run.laneCenterY)}" x2="${W - padR}" y2="${sy(
    run.laneCenterY
  )}" stroke="#2c7d84" stroke-width="1" stroke-dasharray="6 4"/>
  <line x1="${padL}" y1="${warnTop}" x2="${W - padR}" y2="${warnTop}" stroke="#e8b04b" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="2 5"/>
  <line x1="${padL}" y1="${warnBot}" x2="${W - padR}" y2="${warnBot}" stroke="#e8b04b" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="2 5"/>
  <polyline points="${pts}" fill="none" stroke="#8fd6db" stroke-width="1.4" stroke-linejoin="round" opacity="0.9"/>
  ${highlight ? `<polyline points="${highlight}" fill="none" stroke="${tint}" stroke-width="4.5" stroke-linecap="round" opacity="0.85"/>` : ''}
  ${
    incident?.at
      ? `<circle cx="${sx(incident.at.x)}" cy="${sy(incident.at.y)}" r="5" fill="none" stroke="${tint}" stroke-width="1.5"/><circle cx="${sx(
          incident.at.x
        )}" cy="${sy(incident.at.y)}" r="1.8" fill="${tint}"/>`
      : ''
  }
  <text x="${padL}" y="15" fill="#d8e8e6" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.6">${run.boatId} · 第 ${run.lane} 道 · ${run.durationSec.toFixed(
    1
  )}s</text>
  <text x="${W - padR}" y="15" fill="${tint}" font-family="IBM Plex Mono, monospace" font-size="10" text-anchor="end">${label}</text>
  <text x="${padL}" y="${H - 8}" fill="#6f9a9c" font-family="IBM Plex Mono, monospace" font-size="8">M${
    run.startMark
  }</text>
  <text x="${W - padR}" y="${H - 8}" fill="#6f9a9c" font-family="IBM Plex Mono, monospace" font-size="8" text-anchor="end">M${
    run.endMark
  }</text>
  <g opacity="0.85">
    <rect x="${padL}" y="${padT}" width="34" height="3" fill="#c7e4e2"/>
    <rect x="${padL + 34}" y="${padT}" width="34" height="3" fill="#0b262a" stroke="#6f9aa0" stroke-width="0.5"/>
    <text x="${padL}" y="${padT - 5}" fill="#7fa5a7" font-family="IBM Plex Mono, monospace" font-size="7">100 m</text>
  </g>
  <text x="${W / 2}" y="${H - 4}" fill="#6f9a9c" font-family="IBM Plex Mono, monospace" font-size="7" text-anchor="middle">纵向窗口 ±${maxOff.toFixed(1)} m</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
