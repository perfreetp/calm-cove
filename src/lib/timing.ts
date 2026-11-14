import {
  CANTER_STRIDE,
  SAFETY_SIDE_CLEARANCE,
  SPEED_BY_LEVEL,
  TAKE_OFF_LANDING,
} from './constants';
import { add, arcPath, dist, facingVectors, scale, v } from './geometry';
import type { Vec2 } from './types';
import type {
  ArcSegment,
  Difficulty,
  GateLine,
  Obstacle,
  StrideMark,
} from './types';

/** 障碍前后的路径锚点(起跳点 / 落地点) */
export function jumpAnchors(o: Obstacle): { takeoff: Vec2; landing: Vec2 } {
  const { forward } = facingVectors(o.angle);
  return {
    takeoff: add(o.position, scale(forward, -TAKE_OFF_LANDING / 2)),
    landing: add(o.position, scale(forward, TAKE_OFF_LANDING / 2)),
  };
}

/**
 * 构建完整行进线:起步门 → 各障碍(起跳/落地锚点)→ 终点门,
 * 相邻锚点之间用相切回转弧线连接。
 */
export function buildArcsAndPath(
  obstacles: Obstacle[],
  gates: GateLine[],
): { path: Vec2[]; arcs: ArcSegment[] } {
  const start = gates.find((g) => g.kind === 'start')!;
  const finish = gates.find((g) => g.kind === 'finish')!;
  const startMid = scale(add(start.a, start.b), 0.5);
  const finishMid = scale(add(finish.a, finish.b), 0.5);

  interface Anchor {
    p: Vec2;
    dir: Vec2;
  }
  const anchors: Anchor[] = [{ p: startMid, dir: facingVectors(obstacles[0].angle).forward }];
  for (const o of obstacles) {
    const { takeoff, landing } = jumpAnchors(o);
    const f = facingVectors(o.angle).forward;
    anchors.push({ p: takeoff, dir: f });
    anchors.push({ p: landing, dir: f });
  }
  anchors.push({
    p: finishMid,
    dir: facingVectors(obstacles[obstacles.length - 1].angle).forward,
  });

  const path: Vec2[] = [];
  const arcs: ArcSegment[] = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i];
    const b = anchors[i + 1];
    const { points, arcLen, circle } = arcPath(a.p, a.dir, b.p, b.dir);
    if (i === 0) path.push(...points);
    else path.push(...points.slice(1));
    arcs.push({ from: a.p, to: b.p, circle, length: arcLen });
  }
  return { path, arcs };
}

/** 步距标注:关联障碍(同 groupId)给出步数,其余标注实际距离 */
export function buildStrideMarks(obstacles: Obstacle[], _path: Vec2[]): StrideMark[] {
  const marks: StrideMark[] = [];
  for (let i = 0; i < obstacles.length - 1; i++) {
    const a = obstacles[i];
    const b = obstacles[i + 1];
    const related = a.groupId === b.groupId;
    const centerDistance = dist(a.position, b.position);
    marks.push({
      fromObstacle: a.id,
      toObstacle: b.id,
      distance: Math.round(centerDistance * 10) / 10,
      strides: related ? Math.max(1, Math.round((centerDistance - TAKE_OFF_LANDING) / CANTER_STRIDE)) : 0,
      related,
    });
  }
  return marks;
}

export interface TimingResult {
  totalLength: number;
  speed: number;
  allowedTime: number;
}

/** 全程预计时间:路径总长 / 级别规定速度 */
export function computeTiming(
  path: Vec2[],
  _arcs: ArcSegment[],
  difficulty: Difficulty,
): TimingResult {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) total += dist(path[i], path[i + 1]);
  const speed = SPEED_BY_LEVEL[difficulty];
  const allowedTime = Math.round(((total / speed) * 60) * 10) / 10;
  return { totalLength: Math.round(total * 10) / 10, speed, allowedTime };
}

/**
 * 各障碍段的人马安全距离:
 * - 关联段:障碍中心距(需满足关联距离档位)
 * - 回转段:弧线处与其他障碍的最近净距,并给出推荐侧向净距
 */
export interface SafetyRow {
  segment: string;
  clearance: number; // 实际净距 m
  required: number; // 要求 m
  safe: boolean;
}

export function computeSafetyDistances(obstacles: Obstacle[], arcs: ArcSegment[]): SafetyRow[] {
  const rows: SafetyRow[] = [];
  for (let i = 0; i < obstacles.length - 1; i++) {
    const a = obstacles[i];
    const b = obstacles[i + 1];
    const related = a.groupId === b.groupId;
    const d = dist(a.position, b.position);
    rows.push({
      segment: `${a.number} → ${b.number}`,
      clearance: Math.round(d * 10) / 10,
      required: related ? TAKE_OFF_LANDING + CANTER_STRIDE * 0.5 : SAFETY_SIDE_CLEARANCE,
      safe: related ? d >= TAKE_OFF_LANDING + CANTER_STRIDE * 0.5 : d >= SAFETY_SIDE_CLEARANCE,
    });
  }
  // 回转弧线与非路径障碍的净距
  for (const arc of arcs) {
    if (!arc.circle) continue;
    for (const o of obstacles) {
      const d = dist(o.position, v(arc.circle.cx, arc.circle.cy)) - arc.circle.r;
      if (d > 0 && d < SAFETY_SIDE_CLEARANCE) {
        rows.push({
          segment: `回转弧 近 ${o.number}`,
          clearance: Math.round(d * 10) / 10,
          required: SAFETY_SIDE_CLEARANCE,
          safe: false,
        });
      }
    }
  }
  return rows;
}
