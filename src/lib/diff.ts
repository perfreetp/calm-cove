import { dist } from './geometry';
import type { Obstacle, RouteCourse } from './types';

export type ChangeKind = 'added' | 'removed' | 'moved' | 'rotated' | 'unchanged';

export interface ObstacleChange {
  id: string;
  number: string;
  kind: ChangeKind;
  detail: string;
  at: { x: number; y: number };
}

export interface CourseDiff {
  obstacles: ObstacleChange[];
  paramChanges: { key: string; before: string; after: string }[];
  conflictDelta: number;
  lengthDelta: number;
  hasChanges: boolean;
}

const MOVE_EPS = 0.15; // m
const ROT_EPS = 0.05; // rad

export function diffCourses(before: RouteCourse | undefined, after: RouteCourse): CourseDiff {
  if (!before) {
    return {
      obstacles: after.obstacles.map((o) => ({
        id: o.id, number: o.number, kind: 'added', detail: '新增障碍', at: o.position,
      })),
      paramChanges: [],
      conflictDelta: after.conflicts.length,
      lengthDelta: after.totalLength,
      hasChanges: true,
    };
  }

  const oldById = new Map(before.obstacles.map((o) => [o.id, o]));
  const newById = new Map(after.obstacles.map((o) => [o.id, o]));
  const changes: ObstacleChange[] = [];

  for (const o of after.obstacles) {
    const old = oldById.get(o.id);
    if (!old) {
      changes.push({ id: o.id, number: o.number, kind: 'added', detail: '新增障碍', at: o.position });
      continue;
    }
    const moved = dist(old.position, o.position);
    const rot = Math.abs(normalizeAngle(o.angle - old.angle));
    if (moved > MOVE_EPS) {
      changes.push({
        id: o.id, number: o.number, kind: 'moved',
        detail: `移动 ${moved.toFixed(1)}m`, at: o.position,
      });
    } else if (rot > ROT_EPS) {
      changes.push({
        id: o.id, number: o.number, kind: 'rotated',
        detail: `旋转 ${Math.round((rot * 180) / Math.PI)}°`, at: o.position,
      });
    } else {
      changes.push({ id: o.id, number: o.number, kind: 'unchanged', detail: '', at: o.position });
    }
  }
  for (const old of before.obstacles) {
    if (!newById.has(old.id)) {
      changes.push({ id: old.id, number: old.number, kind: 'removed', detail: '删除障碍', at: old.position });
    }
  }

  const paramChanges = diffParams(before, after);
  return {
    obstacles: changes,
    paramChanges,
    conflictDelta: after.conflicts.length - before.conflicts.length,
    lengthDelta: Math.round((after.totalLength - before.totalLength) * 10) / 10,
    hasChanges:
      changes.some((c) => c.kind !== 'unchanged') ||
      paramChanges.length > 0,
  };
}

function diffParams(before: RouteCourse, after: RouteCourse) {
  const out: { key: string; before: string; after: string }[] = [];
  const p1 = before.params;
  const p2 = after.params;
  const rows: [string, string, string][] = [
    ['障碍道数', String(p1.obstacleCount), String(p2.obstacleCount)],
    ['场地长', `${p1.field.length}m`, `${p2.field.length}m`],
    ['场地宽', `${p1.field.width}m`, `${p2.field.width}m`],
    ['距离档位', p1.distanceClass, p2.distanceClass],
    ['难度等级', String(p1.difficulty), String(p2.difficulty)],
    ['种子', p1.seed, p2.seed],
  ];
  for (const [key, b, a] of rows) if (b !== a) out.push({ key, before: b, after: a });
  return out;
}

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function changedObstacleIds(diff: CourseDiff): Set<string> {
  return new Set(diff.obstacles.filter((c) => c.kind !== 'unchanged').map((c) => c.id));
}

export type { Obstacle };
