import {
  BOUNDARY_MARGIN,
  CANTER_STRIDE,
  LANDING_ZONE,
  STRIDE_TOLERANCE,
  TAKE_OFF_LANDING,
} from './constants';
import { dist, facingVectors, pointSegDist, scale, segIntersect, add } from './geometry';
import type { Vec2 } from './types';
import type {
  ArcSegment,
  Conflict,
  GenParams,
  Obstacle,
  StrideMark,
} from './types';

let cid = 0;

/**
 * 冲突检测引擎。三类冲突:
 *  1. stride   步距不足:关联障碍实际步数偏离设计步数超阈值,或净距过小
 *  2. crossing 线路交叉:行进线不同线段相交
 *  3. landing  落地区越界:障碍落地点超出场地边界(含安全余量)
 */
export function computeConflicts(
  obstacles: Obstacle[],
  path: Vec2[],
  arcs: ArcSegment[],
  strides: StrideMark[],
  params: GenParams,
): Conflict[] {
  cid = 0;
  const conflicts: Conflict[] = [];
  conflicts.push(...strideConflicts(obstacles, strides));
  conflicts.push(...crossingConflicts(obstacles, path));
  conflicts.push(...landingConflicts(obstacles, params));
  conflicts.push(...proximityConflicts(obstacles, arcs));
  return conflicts;
}

/** 1. 步距不足:关联段实际步数非整数偏差,或障碍净距小于半步 */
function strideConflicts(obstacles: Obstacle[], strides: StrideMark[]): Conflict[] {
  const out: Conflict[] = [];
  const byId = new Map(obstacles.map((o) => [o.id, o]));
  for (const m of strides) {
    if (!m.related) {
      // 非关联障碍也检查最小净距
      const a = byId.get(m.fromObstacle)!;
      const b = byId.get(m.toObstacle)!;
      if (m.distance < TAKE_OFF_LANDING + CANTER_STRIDE * 0.5) {
        out.push(mk('stride', [a.id, b.id],
          `步距不足:${a.number}→${b.number} 净距 ${m.distance}m 小于最小安全距离`,
          midpoint(a.position, b.position)));
      }
      continue;
    }
    const ideal = TAKE_OFF_LANDING + m.strides * CANTER_STRIDE;
    const deviation = Math.abs(m.distance - ideal) / CANTER_STRIDE;
    if (deviation > STRIDE_TOLERANCE) {
      const a = byId.get(m.fromObstacle)!;
      const b = byId.get(m.toObstacle)!;
      out.push(mk('stride', [a.id, b.id],
        `步距不足:${a.number}→${b.number} 设计 ${m.strides} 步,实际偏差 ${deviation.toFixed(2)} 步`,
        midpoint(a.position, b.position)));
    }
  }
  return out;
}

/** 2. 线路交叉:行进线非相邻线段相交 */
function crossingConflicts(obstacles: Obstacle[], path: Vec2[]): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = i + 2; j < path.length - 1; j++) {
      if (segIntersect(path[i], path[i + 1], path[j], path[j + 1])) {
        const key = `${i}-${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const at = segIntersectionPoint(path[i], path[i + 1], path[j], path[j + 1]);
        out.push(mk('crossing', [], `线路交叉:行进线第 ${i + 1} 段与第 ${j + 1} 段相交`, at));
      }
    }
  }
  void obstacles;
  return out;
}

/** 3. 落地区越界:障碍前后落地点超出边界(含安全余量) */
function landingConflicts(obstacles: Obstacle[], params: GenParams): Conflict[] {
  const out: Conflict[] = [];
  const { length, width } = params.field;
  for (const o of obstacles) {
    const { forward } = facingVectors(o.angle);
    for (const sign of [-1, 1]) {
      const landing = add(o.position, scale(forward, sign * LANDING_ZONE));
      const over =
        landing.x < BOUNDARY_MARGIN ||
        landing.x > length - BOUNDARY_MARGIN ||
        landing.y < BOUNDARY_MARGIN ||
        landing.y > width - BOUNDARY_MARGIN;
      if (over) {
        out.push(mk('landing', [o.id],
          `落地区越界:障碍 ${o.number} ${sign < 0 ? '起跳侧' : '落地侧'} 超出场地安全边界`,
          landing));
      }
    }
  }
  return out;
}

/** 附加:障碍与回转弧线距离过近(排除弧线端点自身的障碍) */
function proximityConflicts(obstacles: Obstacle[], arcs: ArcSegment[]): Conflict[] {
  const out: Conflict[] = [];
  const reported = new Set<string>();
  for (const arc of arcs) {
    for (const o of obstacles) {
      // 跳过以该障碍位置为起/终点的弧线(自身端点)
      const isEndpoint =
        (Math.abs(arc.from.x - o.position.x) < 0.05 && Math.abs(arc.from.y - o.position.y) < 0.05) ||
        (Math.abs(arc.to.x - o.position.x) < 0.05 && Math.abs(arc.to.y - o.position.y) < 0.05);
      if (isEndpoint) continue;
      const d = pointSegDist(o.position, arc.from, arc.to);
      const key = `${o.id}-${Math.round(d * 10)}`;
      if (d < 1.6 && d > 0.01 && !reported.has(key)) {
        reported.add(key);
        out.push(mk('stride', [o.id],
          `安全净距不足:回转线距障碍 ${o.number} 仅 ${d.toFixed(1)}m`,
          o.position));
      }
    }
  }
  return out;
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function segIntersectionPoint(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 {
  const ua =
    ((b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x)) /
    ((b2.y - b1.y) * (a2.x - a1.x) - (b2.x - b1.x) * (a2.y - a1.y));
  return { x: a1.x + ua * (a2.x - a1.x), y: a1.y + ua * (a2.y - a1.y) };
}

function mk(type: Conflict['type'], obstacleIds: string[], message: string, at: Vec2): Conflict {
  return { id: `c${++cid}`, type, obstacleIds, message, at };
}
