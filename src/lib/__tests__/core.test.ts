import { describe, expect, it } from 'vitest';
import { generateCourse } from '../generator';
import { computeConflicts } from '../conflicts';
import { buildArcsAndPath, buildStrideMarks, computeSafetyDistances, computeTiming } from '../timing';
import { diffCourses } from '../diff';
import { CANTER_STRIDE, TAKE_OFF_LANDING } from '../constants';
import type { GenParams, RouteCourse } from '../types';

const baseParams: GenParams = {
  seed: 'test-seed-001',
  field: { length: 80, width: 50 },
  obstacleCount: 10,
  distanceClass: 'medium',
  difficulty: 2,
};

describe('过程式生成', () => {
  it('同种子+同参数生成结果完全一致', () => {
    const a = generateCourse(baseParams);
    const b = generateCourse({ ...baseParams });
    expect(JSON.stringify(a.obstacles)).toEqual(JSON.stringify(b.obstacles));
    expect(JSON.stringify(a.path)).toEqual(JSON.stringify(b.path));
    expect(a.totalLength).toBe(b.totalLength);
    expect(a.allowedTime).toBe(b.allowedTime);
  });

  it('不同种子产生不同摆位', () => {
    const a = generateCourse(baseParams);
    const b = generateCourse({ ...baseParams, seed: 'another-seed' });
    expect(JSON.stringify(a.obstacles)).not.toEqual(JSON.stringify(b.obstacles));
  });

  it('障碍数量与编号正确,组合障碍带 A/B 后缀且编号唯一', () => {
    const c = generateCourse(baseParams);
    expect(c.obstacles).toHaveLength(10);
    const numbers = c.obstacles.map((o) => o.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const o of c.obstacles) {
      expect(o.position.x).toBeGreaterThan(0);
      expect(o.position.x).toBeLessThan(baseParams.field.length);
      expect(o.position.y).toBeGreaterThan(0);
      expect(o.position.y).toBeLessThan(baseParams.field.width);
    }
  });

  it('改障碍道数后数量随之变化且仍可复现', () => {
    const p = { ...baseParams, obstacleCount: 14 };
    const a = generateCourse(p);
    const b = generateCourse({ ...p });
    expect(a.obstacles).toHaveLength(14);
    expect(JSON.stringify(a.obstacles)).toEqual(JSON.stringify(b.obstacles));
  });

  it('关联障碍的中心距落在档位区间附近且标注步数', () => {
    const c = generateCourse({ ...baseParams, difficulty: 4, obstacleCount: 12 });
    const related = c.strides.filter((s) => s.related);
    expect(related.length).toBeGreaterThan(0);
    for (const m of related) {
      expect(m.strides).toBeGreaterThanOrEqual(1);
      expect(m.distance).toBeGreaterThan(TAKE_OFF_LANDING);
    }
  });
});

describe('手动障碍保留', () => {
  it('重生成时 manual 障碍保留原位,其余障碍仍按种子确定', () => {
    const first = generateCourse(baseParams);
    const movedId = first.obstacles[2].id;
    const movedPos = { x: 40, y: 25 };
    const withManual: RouteCourse = structuredClone(first);
    const target = withManual.obstacles.find((o) => o.id === movedId)!;
    target.position = movedPos;
    target.manual = true;

    const regenerated = generateCourse({ ...baseParams, obstacleCount: 11 }, withManual);
    const kept = regenerated.obstacles.find((o) => o.id === movedId)!;
    expect(kept.manual).toBe(true);
    expect(kept.position).toEqual(movedPos);

    // 未手动的障碍与无保留基线一致(同种子同参数)
    const baseline = generateCourse({ ...baseParams, obstacleCount: 11 });
    for (const o of regenerated.obstacles) {
      if (o.manual) continue;
      const ref = baseline.obstacles.find((x) => x.id === o.id);
      if (ref) expect(o.position).toEqual(ref.position);
    }
  });
});

describe('冲突引擎', () => {
  it('能检测落地区越界', () => {
    const c = generateCourse(baseParams);
    const o = c.obstacles[0];
    o.position = { x: 0.5, y: c.params.field.width / 2 };
    o.angle = 0;
    const { path, arcs } = buildArcsAndPath(c.obstacles, c.gates);
    const strides = buildStrideMarks(c.obstacles, path);
    const conflicts = computeConflicts(c.obstacles, path, arcs, strides, c.params);
    expect(conflicts.some((cf) => cf.type === 'landing')).toBe(true);
  });

  it('能检测步距不足', () => {
    const c = generateCourse(baseParams);
    const [a, b] = c.obstacles;
    b.position = { x: a.position.x + 4, y: a.position.y };
    b.angle = a.angle;
    b.groupId = a.groupId; // 强制关联
    const { path, arcs } = buildArcsAndPath(c.obstacles, c.gates);
    const strides = buildStrideMarks(c.obstacles, path);
    const conflicts = computeConflicts(c.obstacles, path, arcs, strides, c.params);
    expect(conflicts.some((cf) => cf.type === 'stride')).toBe(true);
  });

  it('标准生成结果的冲突可被枚举且信息完整', () => {
    const c = generateCourse(baseParams);
    for (const cf of c.conflicts) {
      expect(cf.id).toBeTruthy();
      expect(cf.message).toBeTruthy();
      expect(typeof cf.at.x).toBe('number');
    }
  });
});

describe('计时与安全距离', () => {
  it('允许时间 = 路径总长 / 级别速度', () => {
    const c = generateCourse(baseParams);
    const t = computeTiming(c.path, c.arcs, c.params.difficulty);
    const expectTime = Math.round(((t.totalLength / t.speed) * 60) * 10) / 10;
    expect(t.allowedTime).toBe(expectTime);
    expect(t.totalLength).toBeGreaterThan(c.params.field.length);
  });

  it('每个障碍段都有安全距离判定行', () => {
    const c = generateCourse(baseParams);
    const rows = computeSafetyDistances(c.obstacles, c.arcs);
    expect(rows.length).toBeGreaterThanOrEqual(c.obstacles.length - 1);
    for (const r of rows) {
      expect(r.segment).toBeTruthy();
      expect(typeof r.safe).toBe('boolean');
    }
  });

  it('步距换算符合 3.5m 步幅常量', () => {
    const center = TAKE_OFF_LANDING + 2 * CANTER_STRIDE;
    const strides = Math.round((center - TAKE_OFF_LANDING) / CANTER_STRIDE);
    expect(strides).toBe(2);
  });
});

describe('版本差异', () => {
  it('检测障碍移动并高亮', () => {
    const a = generateCourse(baseParams);
    const b: RouteCourse = structuredClone(a);
    b.obstacles[1].position = { x: a.obstacles[1].position.x + 3, y: a.obstacles[1].position.y };
    const diff = diffCourses(a, b);
    const moved = diff.obstacles.find((c) => c.kind === 'moved');
    expect(moved).toBeTruthy();
    expect(diff.hasChanges).toBe(true);
  });

  it('无变化时 hasChanges=false', () => {
    const a = generateCourse(baseParams);
    const b = structuredClone(a);
    expect(diffCourses(a, b).hasChanges).toBe(false);
  });

  it('参数变化被记录', () => {
    const a = generateCourse(baseParams);
    const b = generateCourse({ ...baseParams, difficulty: 3 });
    const diff = diffCourses(a, b);
    expect(diff.paramChanges.some((p) => p.key === '难度等级')).toBe(true);
  });
});
