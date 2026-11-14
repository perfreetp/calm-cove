import type { Difficulty, DistanceClass, ElementType } from './types';

/** 马匹平均步幅(落地后到下一次起跳之间每步距离),单位 m */
export const CANTER_STRIDE = 3.5;

/** 起跳/落地余量:障碍中心到落地点约 1.8m,起跳点约 1.8m,合计 3.6m */
export const TAKE_OFF_LANDING = 3.6;

/** 关联障碍两元素之间最小/最大可布置中心距 */
export const RELATED_DISTANCE: Record<DistanceClass, { min: number; max: number; label: string }> = {
  short: { min: 7.1, max: 8.4, label: '近距(约1步)' },
  medium: { min: 10.6, max: 11.8, label: '中距(约2步)' },
  long: { min: 14.1, max: 15.4, label: '远距(约3步)' },
};

/** 非关联障碍间的推荐直行距离区间(落地后到起跳) */
export const GAP_RANGES: Record<DistanceClass, { min: number; max: number }> = {
  short: { min: 11, max: 15 },
  medium: { min: 15, max: 21 },
  long: { min: 21, max: 28 },
};

/** 各级别行进速度 m/min(FEI 风格,按难度1-4递增) */
export const SPEED_BY_LEVEL: Record<Difficulty, number> = {
  1: 325,
  2: 350,
  3: 375,
  4: 400,
};

/** 障碍高度区间 m,按难度 */
export const HEIGHT_BY_LEVEL: Record<Difficulty, [number, number]> = {
  1: [0.85, 1.0],
  2: [1.0, 1.15],
  3: [1.15, 1.3],
  4: [1.3, 1.45],
};

export const ELEMENT_KINDS: ElementType[] = ['vertical', 'oxer', 'wall', 'tripleBar'];

export const ELEMENT_LABEL: Record<ElementType, string> = {
  vertical: '单横木',
  oxer: '双横木',
  wall: '墙',
  tripleBar: '三横杆',
};

/** 各类型障碍的默认纵深 spread m */
export const ELEMENT_SPREAD: Record<ElementType, number> = {
  vertical: 0.15,
  oxer: 0.6,
  wall: 0.3,
  tripleBar: 1.2,
};

/** 落地区半径(障碍中心前后),m */
export const LANDING_ZONE = 2.2;

/** 障碍与场地边界最小安全距离 m */
export const BOUNDARY_MARGIN = 3.0;

/** 人马安全距离:回转弧线处推荐的侧向净距 m */
export const SAFETY_SIDE_CLEARANCE = 2.5;

/** 步距不足判定阈值:实际步数与设计步数偏差超过 0.5 步 */
export const STRIDE_TOLERANCE = 0.5;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  1: '入门级',
  2: '进阶级',
  3: '公开级',
  4: '大奖赛级',
};

export const DISTANCE_LABEL: Record<DistanceClass, string> = {
  short: '近距档',
  medium: '中距档',
  long: '远距档',
};
