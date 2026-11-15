import type { Buoy, Dock, Lane, Vec, World } from './types';
import { catmullRomPath, insetLoop } from './geo';

export const LANE_WIDTH = 14;
export const MARK_STEP = 250;
export const MARK_COUNT = 9;
export const START_X = 300;
export const WORLD_W = 2600;
export const WORLD_H = 1000;
export const COURSE_CY = 512;

export function laneCenterY(laneNo: number, count = 6): number {
  const total = count * LANE_WIDTH;
  return COURSE_CY - total / 2 + LANE_WIDTH * (laneNo - 0.5);
}

export function laneObjects(count = 6): Lane[] {
  return Array.from({ length: count }, (_, i) => {
    const no = i + 1;
    const cy = laneCenterY(no, count);
    return {
      no,
      centerY: cy,
      top: cy - LANE_WIDTH / 2,
      bottom: cy + LANE_WIDTH / 2,
      startX: START_X,
      finishX: START_X + (MARK_COUNT - 1) * MARK_STEP
    };
  });
}

/**
 * Closed shoreline loop, traced west bay → north shore → east dam → south shore.
 * The course band (y ≈ 470–555) stays clear of land at every x.
 */
const SHORE_CTRL: Vec[] = [
  // ---- north-west bay: a marina arm north of the course, opening at x≈340 ----
  { x: 212, y: 404 },
  { x: 176, y: 372 },
  { x: 160, y: 330 },
  { x: 172, y: 288 },
  { x: 210, y: 262 },
  { x: 258, y: 264 },
  { x: 296, y: 288 },
  { x: 314, y: 330 },
  { x: 330, y: 372 },
  { x: 352, y: 400 },
  // ---- north shore running east, always well north of the course ----
  { x: 420, y: 392 },
  { x: 512, y: 366 },
  { x: 604, y: 344 },
  { x: 700, y: 330 },
  { x: 796, y: 322 },
  { x: 892, y: 326 },
  { x: 986, y: 342 },
  { x: 1074, y: 348 },
  { x: 1160, y: 330 },
  { x: 1250, y: 310 },
  { x: 1344, y: 302 },
  { x: 1438, y: 314 },
  { x: 1528, y: 334 },
  { x: 1616, y: 344 },
  { x: 1702, y: 332 },
  { x: 1792, y: 310 },
  { x: 1882, y: 304 },
  { x: 1968, y: 320 },
  { x: 2050, y: 344 },
  { x: 2126, y: 360 },
  { x: 2192, y: 378 },
  // ---- east dam ----
  { x: 2258, y: 402 },
  { x: 2304, y: 448 },
  { x: 2320, y: 500 },
  { x: 2316, y: 556 },
  { x: 2298, y: 610 },
  { x: 2262, y: 652 },
  // ---- south shore running west, always south of the course ----
  { x: 2196, y: 682 },
  { x: 2112, y: 706 },
  { x: 2024, y: 730 },
  { x: 1934, y: 726 },
  { x: 1846, y: 748 },
  { x: 1758, y: 772 },
  { x: 1668, y: 786 },
  { x: 1576, y: 780 },
  { x: 1486, y: 798 },
  { x: 1394, y: 810 },
  { x: 1300, y: 804 },
  { x: 1206, y: 812 },
  { x: 1112, y: 798 },
  { x: 1018, y: 788 },
  { x: 926, y: 768 },
  { x: 836, y: 756 },
  { x: 748, y: 736 },
  { x: 664, y: 716 },
  { x: 586, y: 692 },
  { x: 514, y: 666 },
  { x: 446, y: 638 },
  { x: 392, y: 632 },
  { x: 336, y: 612 },
  { x: 290, y: 582 },
  { x: 254, y: 536 },
  { x: 230, y: 480 }
];

/** thalweg spine — the drowned river channel the depth bands follow */
const SPINE: Vec[] = [
  { x: 300, y: 512 },
  { x: 440, y: 512 },
  { x: 620, y: 514 },
  { x: 820, y: 516 },
  { x: 1040, y: 518 },
  { x: 1260, y: 520 },
  { x: 1480, y: 522 },
  { x: 1700, y: 524 },
  { x: 1900, y: 528 },
  { x: 2080, y: 534 },
  { x: 2230, y: 540 }
];

function nearestOnPolyline(p: Vec, line: Vec[]): Vec {
  let best = line[0];
  let bestD = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + vx * t, y: a.y + vy * t };
    const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

/** Pull a shoreline loop toward the thalweg by `f` — gives basin-shaped contours. */
function towardSpine(loop: Vec[], f: number, wobble = 0): Vec[] {
  return loop.map((p, i) => {
    const s = nearestOnPolyline(p, SPINE);
    const w = wobble ? 1 + Math.sin(i * 0.41 + f * 9) * wobble : 1;
    return { x: s.x + (p.x - s.x) * f * w, y: s.y + (p.y - s.y) * f * w };
  });
}

function shapeLoop(pts: Vec[], noiseSeed = 0): Vec[] {
  const out: Vec[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = (i / n) * Math.PI * 2;
    const jx = Math.sin(p * 7.3 + noiseSeed) * 3.2 + Math.sin(p * 3.1 + noiseSeed * 2) * 5.4;
    const jy = Math.cos(p * 5.7 + noiseSeed) * 2.6;
    out.push({ x: pts[i].x + jx, y: pts[i].y + jy });
  }
  return out;
}

export function buildWorld(): World {
  const shoreline = shapeLoop(SHORE_CTRL, 1.3);
  const cx = 1230;
  const cy = 530;

  const bands = [
    { depth: 3, factor: 0.94, wobble: 0.02, color: '#10525c' },
    { depth: 6, factor: 0.84, wobble: 0.035, color: '#0c424d' },
    { depth: 12, factor: 0.68, wobble: 0.05, color: '#08333f' },
    { depth: 20, factor: 0.5, wobble: 0.07, color: '#052730' }
  ].map((b) => ({
    depth: b.depth,
    color: b.color,
    points: towardSpine(shoreline, b.factor, b.wobble)
  }));

  // islands: small islets in the wider north / south margins, never on the course band
  const islands: Vec[][] = [
    [
      { x: 714, y: 366 },
      { x: 762, y: 352 },
      { x: 792, y: 374 },
      { x: 770, y: 398 },
      { x: 726, y: 392 }
    ],
    [
      { x: 1596, y: 654 },
      { x: 1652, y: 640 },
      { x: 1688, y: 664 },
      { x: 1660, y: 692 },
      { x: 1608, y: 684 }
    ],
    [
      { x: 2066, y: 620 },
      { x: 2104, y: 612 },
      { x: 2122, y: 632 },
      { x: 2094, y: 648 },
      { x: 2064, y: 640 }
    ]
  ];

  const lanes = laneObjects(6);
  const buoys: Buoy[] = [];
  for (const lane of lanes) {
    for (let m = 0; m < MARK_COUNT; m++) {
      const x = START_X + m * MARK_STEP;
      buoys.push({
        id: `b-${lane.no}-${m}`,
        lane: lane.no,
        mark: m,
        pos: { x, y: lane.centerY },
        kind: m === 0 || m === MARK_COUNT - 1 ? 'gate' : 'lane',
        label: `M${m}`
      });
    }
  }

  const docks: Dock[] = [
    {
      id: 'd-main',
      name: '训练浮码头',
      kind: 'pontoon',
      labelAt: { x: 336, y: 664 },
      points: [
        { x: 264, y: 622 },
        { x: 384, y: 612 },
        { x: 404, y: 638 },
        { x: 284, y: 648 }
      ]
    },
    {
      id: 'd-boat',
      name: '一号船库',
      kind: 'boathouse',
      labelAt: { x: 566, y: 300 },
      points: [
        { x: 500, y: 340 },
        { x: 556, y: 314 },
        { x: 636, y: 326 },
        { x: 634, y: 362 },
        { x: 506, y: 372 }
      ]
    },
    {
      id: 'd-jetty',
      name: '北岸栈桥',
      kind: 'pier',
      labelAt: { x: 1452, y: 306 },
      points: [
        { x: 1448, y: 326 },
        { x: 1462, y: 326 },
        { x: 1465, y: 390 },
        { x: 1451, y: 390 }
      ]
    },
    {
      id: 'd-dam',
      name: '青澜主坝',
      kind: 'dam',
      labelAt: { x: 2362, y: 528 },
      points: [
        { x: 2318, y: 404 },
        { x: 2346, y: 410 },
        { x: 2348, y: 648 },
        { x: 2320, y: 642 }
      ]
    },
    {
      id: 'd-spect',
      name: '终点观赛台',
      kind: 'pier',
      labelAt: { x: 2210, y: 694 },
      points: [
        { x: 2148, y: 690 },
        { x: 2266, y: 666 },
        { x: 2276, y: 694 },
        { x: 2158, y: 718 }
      ]
    },
    {
      id: 'd-start',
      name: '发令塔基座',
      kind: 'pier',
      labelAt: { x: 380, y: 344 },
      points: [
        { x: 360, y: 362 },
        { x: 392, y: 352 },
        { x: 396, y: 390 },
        { x: 364, y: 398 }
      ]
    }
  ];

  return {
    bounds: { w: WORLD_W, h: WORLD_H },
    shoreline,
    islands,
    depthBands: bands,
    lanes,
    buoys,
    docks,
    contours: bands.map((b) => b.points),
    graticule: { step: 100 },
    startX: START_X,
    finishX: START_X + (MARK_COUNT - 1) * MARK_STEP,
    markStep: MARK_STEP,
    markCount: MARK_COUNT,
    landmarks: [
      { name: '起点发令塔', at: { x: 378, y: 374 }, kind: 'tower' },
      { name: '终点计时塔', at: { x: 2212, y: 690 }, kind: 'tower' },
      { name: '训练浮码头', at: { x: 336, y: 664 }, kind: 'dock' },
      { name: '一号船库', at: { x: 566, y: 300 }, kind: "building" }
    ]
  };
}

export function outlinePath(pts: Vec[]): string {
  return catmullRomPath(pts, true, 0.42);
}
