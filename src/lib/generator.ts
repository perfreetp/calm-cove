import {
  BOUNDARY_MARGIN,
  ELEMENT_KINDS,
  ELEMENT_SPREAD,
  GAP_RANGES,
  HEIGHT_BY_LEVEL,
  RELATED_DISTANCE,
  TAKE_OFF_LANDING,
  CANTER_STRIDE,
} from './constants';
import {
  add,
  dist,
  facingVectors,
  scale,
  v,
} from './geometry';
import { makeRng, pick, range, type Rng } from './rng';
import type { Vec2 } from './types';
import { computeConflicts } from './conflicts';
import { computeTiming, buildStrideMarks, buildArcsAndPath } from './timing';
import type {
  ArcSegment,
  GateLine,
  GenParams,
  Obstacle,
  ObstacleElement,
  RouteCourse,
  StrideMark,
} from './types';

let uid = 0;
const nextId = (p: string) => `${p}${++uid}`;

/**
 * 过程式路线生成。
 * 确定性保证:所有随机决策均经由 params.seed 派生的 PRNG,且调用顺序固定;
 * 同种子 + 同参数 => 完全一致的摆位与路线。
 *
 * @param previous 上一版本;其中 manual=true 的障碍保留原位(改参数重生成场景)
 */
export function generateCourse(params: GenParams, previous?: RouteCourse): RouteCourse {
  uid = 0;
  const rng = makeRng(params.seed);
  const { field, obstacleCount, distanceClass, difficulty } = params;

  const obstacles = layoutSerpentine(rng, params);
  applyCombinations(rng, obstacles, params);
  resolveOverlaps(obstacles, params);
  assignNumbers(obstacles);
  preserveManual(obstacles, previous);

  const gates = buildGates(obstacles, field.length, field.width);
  const { path, arcs } = buildArcsAndPath(obstacles, gates);
  const strides = buildStrideMarks(obstacles, path);
  const conflicts = computeConflicts(obstacles, path, arcs, strides, params);
  const timing = computeTiming(path, arcs, difficulty);

  return {
    params: structuredClone(params),
    obstacles,
    path,
    arcs,
    gates,
    strides,
    conflicts,
    ...timing,
    createdAt: Date.now(),
  };
}

/** 蛇形场站:按巷道布置,巷道内沿长轴排列,巷道间 180° 回转 */
function layoutSerpentine(rng: Rng, params: GenParams): Obstacle[] {
  const { field, obstacleCount } = params;
  const nLanes = chooseLaneCount(obstacleCount, field.width);
  const perLane = Math.ceil(obstacleCount / nLanes);
  const laneYs = lanePositions(nLanes, field.width);

  const obstacles: Obstacle[] = [];
  let remaining = obstacleCount;
  const gap = GAP_RANGES[params.distanceClass];

  for (let lane = 0; lane < nLanes; lane++) {
    const n = Math.min(remaining, perLane);
    remaining -= n;
    const goingRight = lane % 2 === 0;
    const angle = goingRight ? 0 : Math.PI;
    const xs = laneXs(rng, n, field.length, gap.min);
    if (!goingRight) xs.reverse();

    for (const x of xs) {
      const y = laneYs[lane] + range(rng, -1.2, 1.2);
      obstacles.push(makeObstacle(rng, v(x, y), angle, params.difficulty));
    }
  }
  return obstacles;
}

/** 巷道内 x 坐标:均匀基点 + 抖动,再做确定性最小间距/边界压缩,避免重叠 */
function laneXs(rng: Rng, n: number, fieldLength: number, minGap: number): number[] {
  const lo = BOUNDARY_MARGIN + 6;
  const hi = fieldLength - BOUNDARY_MARGIN - 6;
  const span = hi - lo;
  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const base = lo + (span * (i + 0.5)) / n;
    raw.push(base + range(rng, -2.0, 2.0));
  }
  raw.sort((a, b) => a - b);
  // 左界
  raw[0] = Math.max(raw[0], lo);
  // 正向扫:保证最小间距
  for (let i = 1; i < n; i++) {
    raw[i] = Math.max(raw[i], raw[i - 1] + minGap);
  }
  // 超出右界则整体等比压缩
  if (raw[n - 1] > hi) {
    const need = raw[n - 1] - raw[0];
    const factor = Math.min(1, span / (need || 1));
    const start = raw[0];
    for (let i = 0; i < n; i++) raw[i] = lo + (raw[i] - start) * factor;
  }
  return raw.map((x) => Math.round(x * 100) / 100);
}

/**
 * 组合障碍摆位后的确定性修复:非关联障碍中心距过小时沿连线推开,
 * 并约束在场地边界内。固定迭代顺序,无随机调用,保证可复现。
 */
function resolveOverlaps(obstacles: Obstacle[], params: GenParams): void {
  const MIN_CENTER = 7.0;
  const { length, width } = params.field;
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let i = 0; i < obstacles.length; i++) {
      for (let j = i + 1; j < obstacles.length; j++) {
        const a = obstacles[i];
        const b = obstacles[j];
        if (a.groupId === b.groupId) continue; // 关联距离是有意设计
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= MIN_CENTER) continue;
        const push = (MIN_CENTER - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.position = {
          x: clampNum(a.position.x - ux * push, BOUNDARY_MARGIN, length - BOUNDARY_MARGIN),
          y: clampNum(a.position.y - uy * push, BOUNDARY_MARGIN, width - BOUNDARY_MARGIN),
        };
        b.position = {
          x: clampNum(b.position.x + ux * push, BOUNDARY_MARGIN, length - BOUNDARY_MARGIN),
          y: clampNum(b.position.y + uy * push, BOUNDARY_MARGIN, width - BOUNDARY_MARGIN),
        };
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function clampNum(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function chooseLaneCount(count: number, width: number): number {
  if (count <= 6) return 1;
  if (width < 32) return 1;
  if (count <= 12) return 2;
  if (width >= 45) return 3;
  return 2;
}

function lanePositions(n: number, width: number): number[] {
  const top = BOUNDARY_MARGIN + 4;
  const bottom = width - BOUNDARY_MARGIN - 4;
  if (n === 1) return [width / 2];
  return Array.from({ length: n }, (_, i) => top + ((bottom - top) * i) / (n - 1));
}

function makeObstacle(rng: Rng, pos: Vec2, angle: number, difficulty: GenParams['difficulty']): Obstacle {
  const kind = pick(rng, ELEMENT_KINDS);
  const [hMin, hMax] = HEIGHT_BY_LEVEL[difficulty];
  const el: ObstacleElement = {
    id: nextId('e'),
    kind,
    height: Math.round(range(rng, hMin, hMax) * 100) / 100,
    spread: ELEMENT_SPREAD[kind],
  };
  return {
    id: nextId('o'),
    number: '',
    groupId: nextId('g'),
    position: pos,
    angle,
    width: Math.round(range(rng, 3.2, 4.0) * 10) / 10,
    elements: [el],
    manual: false,
  };
}

/**
 * 组合障碍:把同一巷道内相邻的单障碍合并为 A/B(难度越高组合越多)。
 * 第二道移动到第一道后方关联距离处;高难度偶发生 A/B/C 三联。
 */
function applyCombinations(rng: Rng, obstacles: Obstacle[], params: GenParams): void {
  const comboProb = [0, 0.18, 0.3, 0.42][params.difficulty - 1];
  const rel = RELATED_DISTANCE[params.distanceClass];
  let i = 0;
  while (i < obstacles.length - 1) {
    const a = obstacles[i];
    const b = obstacles[i + 1];
    const sameLane = Math.abs(a.angle - b.angle) < 0.01;
    if (sameLane && rng() < comboProb) {
      const { forward } = facingVectors(a.angle);
      const d = range(rng, rel.min, rel.max);
      b.position = add(a.position, scale(forward, d));
      b.angle = a.angle;
      b.groupId = a.groupId;
      // 三联组合
      if (params.difficulty >= 3 && i + 2 < obstacles.length && rng() < 0.3) {
        const c = obstacles[i + 2];
        if (Math.abs(c.angle - a.angle) < 0.01) {
          const d2 = range(rng, rel.min, rel.max);
          c.position = add(b.position, scale(forward, d2));
          c.angle = a.angle;
          c.groupId = a.groupId;
          i += 1;
        }
      }
      i += 2;
    } else {
      i += 1;
    }
  }
}

/** 按行进顺序写编号,组合障碍追加 A/B/C 后缀 */
function assignNumbers(obstacles: Obstacle[]): void {
  const groupNo = new Map<string, number>();
  let n = 1;
  for (const o of obstacles) {
    if (!groupNo.has(o.groupId)) groupNo.set(o.groupId, n++);
  }
  const suffix = new Map<string, number>();
  const groupSize = new Map<string, number>();
  for (const o of obstacles) groupSize.set(o.groupId, (groupSize.get(o.groupId) ?? 0) + 1);
  for (const o of obstacles) {
    const base = groupNo.get(o.groupId)!;
    const k = suffix.get(o.groupId) ?? 0;
    suffix.set(o.groupId, k + 1);
    o.number = groupSize.get(o.groupId) === 1 ? String(base) : `${base}${'ABC'[k]}`;
  }
}

/** 保留上一版本中手动挪动过的障碍(按 id 对应) */
function preserveManual(obstacles: Obstacle[], previous?: RouteCourse): void {
  if (!previous) return;
  const prevById = new Map(previous.obstacles.map((o) => [o.id, o]));
  for (const o of obstacles) {
    const old = prevById.get(o.id);
    if (old?.manual) {
      o.position = { ...old.position };
      o.angle = old.angle;
      o.manual = true;
    }
  }
}

function buildGates(obstacles: Obstacle[], length: number, width: number): GateLine[] {
  const first = obstacles[0];
  const last = obstacles[obstacles.length - 1];
  const gate = (o: Obstacle, behind: boolean): GateLine => {
    const { forward, side } = facingVectors(o.angle);
    const dir = behind ? scale(forward, -1) : forward;
    const mid = add(o.position, scale(dir, 6));
    const half = scale(side, 2);
    return {
      kind: behind ? 'start' : 'finish',
      a: add(mid, scale(half, -1)),
      b: add(mid, half),
    };
  };
  const gates = [gate(first, true), gate(last, false)];
  // 边界保护:确保门线在场内
  for (const g of gates) {
    g.a = v(Math.max(1, g.a.x), Math.max(1, g.a.y));
    g.b = v(Math.min(length - 1, g.b.x), Math.min(width - 1, g.b.y));
  }
  return gates;
}

/** 工具:由中心距推算关联步数 */
export function stridesForDistance(centerDistance: number): number {
  return Math.round((centerDistance - TAKE_OFF_LANDING) / CANTER_STRIDE);
}

export { buildGates };

export type { ArcSegment, StrideMark };
