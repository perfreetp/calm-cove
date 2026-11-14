import type {
  Fixture, FixtureKind, LightingPlan, Obstacle, WindowStrip, Worker, Zone,
} from './types.js';

/** 厂房尺寸（米） */
export const FLOOR_W = 30;
export const FLOOR_H = 18;

/** Worker 内部计算分辨率（OffscreenCanvas 逐像素） */
export const SIM_W = 480;
export const SIM_H = 288;
export const SIM_SCALE = SIM_W / FLOOR_W; // px/m，两轴等比（30:18 = 480:288）

/** 区域：分拣 / 主洗 / 烘干 / 熨平 / 质检 + 通道 */
export const ZONES: Zone[] = [
  { id: 'sort',   name: '分拣区', x: 0,  y: 0,  w: 9,  h: 8, kind: 'work', threshold: 200 },
  { id: 'wash',   name: '主洗区', x: 9,  y: 0,  w: 12, h: 8, kind: 'work', threshold: 200 },
  { id: 'dry',    name: '烘干区', x: 21, y: 0,  w: 9,  h: 8, kind: 'work', threshold: 200 },
  { id: 'iron',   name: '熨平区', x: 0,  y: 12, w: 21, h: 6, kind: 'work', threshold: 300 },
  { id: 'qc',     name: '质检区', x: 21, y: 12, w: 9,  h: 6, kind: 'qc',   threshold: 300 },
  { id: 'aisle',  name: '通道',   x: 0,  y: 8,  w: 30, h: 4, kind: 'aisle', threshold: 150 },
];

/** 遮挡物（产生软阴影）：分拣台、洗脱机、烘干机、熨平机、质检台、布草车 */
export const OBSTACLES: Obstacle[] = [
  { id: 'ob-sort-1', name: '分拣台 A', x: 1.2, y: 2.0, w: 3.2, h: 1.4 },
  { id: 'ob-sort-2', name: '分拣台 B', x: 5.0, y: 2.0, w: 3.2, h: 1.4 },
  { id: 'ob-cart-1', name: '布草车 1', x: 3.0, y: 5.6, w: 1.6, h: 1.2 },
  { id: 'ob-wm-1',   name: '洗脱机 1', x: 10.2, y: 1.4, w: 2.4, h: 2.2 },
  { id: 'ob-wm-2',   name: '洗脱机 2', x: 13.4, y: 1.4, w: 2.4, h: 2.2 },
  { id: 'ob-wm-3',   name: '洗脱机 3', x: 16.6, y: 1.4, w: 2.4, h: 2.2 },
  { id: 'ob-dry-1',  name: '烘干机 1', x: 22.2, y: 1.4, w: 2.6, h: 2.4 },
  { id: 'ob-dry-2',  name: '烘干机 2', x: 25.6, y: 1.4, w: 2.6, h: 2.4 },
  { id: 'ob-iron-1', name: '熨平机',   x: 2.0, y: 13.6, w: 9.0, h: 2.2 },
  { id: 'ob-iron-2', name: '折叠台',   x: 13.2, y: 13.8, w: 4.2, h: 1.8 },
  { id: 'ob-qc-1',   name: '质检台 1', x: 22.2, y: 13.4, w: 2.4, h: 1.3 },
  { id: 'ob-qc-2',   name: '质检台 2', x: 25.4, y: 13.4, w: 2.4, h: 1.3 },
  { id: 'ob-qc-3',   name: '质检台 3', x: 23.8, y: 15.8, w: 2.4, h: 1.3 },
];

export const QC_STATIONS = OBSTACLES.filter((o) => o.name.startsWith('质检台'));

/** 北墙高侧窗（y=0 一侧） */
export const WINDOWS: WindowStrip[] = [
  { id: 'win-1', x: 1.0,  y: 0.15, w: 6.0, h: 0.5 },
  { id: 'win-2', x: 10.0, y: 0.15, w: 8.0, h: 0.5 },
  { id: 'win-3', x: 22.0, y: 0.15, w: 6.0, h: 0.5 },
];

export const FIXTURE_DEFAULTS: Record<FixtureKind, Omit<Fixture, 'id' | 'name' | 'x' | 'y' | 'aim'>> = {
  ceiling:  { kind: 'ceiling',  height: 5.0, flux: 12000, cct: 5000, beam: 90,  on: true },
  task:     { kind: 'task',     height: 2.4, flux: 3500,  cct: 5700, beam: 60,  on: true },
  wallwash: { kind: 'wallwash', height: 3.2, flux: 4000,  cct: 4000, beam: 35,  on: true },
};

let seq = 0;
export function newFixture(kind: FixtureKind, x: number, y: number): Fixture {
  seq += 1;
  const label = { ceiling: '顶灯', task: '工位灯', wallwash: '洗墙灯' }[kind];
  return {
    ...structuredClone(FIXTURE_DEFAULTS[kind]),
    id: `fx-${Date.now().toString(36)}-${seq}`,
    name: `${label} ${seq}`,
    x, y,
  };
}

function f(
  id: string, name: string, kind: FixtureKind,
  x: number, y: number, h: number, flux: number, cct: number, beam: number,
  on = true, aim?: { x: number; y: number },
): Fixture {
  return { id, name, kind, x, y, height: h, flux, cct, beam, on, aim };
}

/** 初始布光：通道刻意只布 2 盏顶灯、质检台 3 先关掉工位灯，制造可识别暗区 */
export function seedFixtures(): Fixture[] {
  return [
    // 分拣区顶灯
    f('f-s1', '顶灯 分拣1', 'ceiling', 2.5, 2.2, 5, 11000, 5000, 90),
    f('f-s2', '顶灯 分拣2', 'ceiling', 6.8, 5.2, 5, 11000, 5000, 90),
    f('f-s3', '工位灯 分拣台A', 'task', 2.8, 2.0, 2.4, 3200, 5700, 60),
    f('f-s4', '工位灯 分拣台B', 'task', 6.6, 2.0, 2.4, 3200, 5700, 60),
    // 主洗区
    f('f-w1', '顶灯 主洗1', 'ceiling', 11.5, 2.2, 5, 12000, 5000, 90),
    f('f-w2', '顶灯 主洗2', 'ceiling', 15.5, 2.2, 5, 12000, 5000, 90),
    f('f-w3', '顶灯 主洗3', 'ceiling', 19.0, 5.6, 5, 12000, 5000, 90),
    // 烘干区
    f('f-d1', '顶灯 烘干1', 'ceiling', 23.5, 2.4, 5, 11000, 5000, 90),
    f('f-d2', '顶灯 烘干2', 'ceiling', 27.6, 5.6, 5, 11000, 5000, 90),
    f('f-d3', '工位灯 烘干', 'task', 24.0, 4.6, 2.4, 3200, 5700, 60),
    // 通道（刻意欠照 -> 暗区，加灯即可消除）
    f('f-a1', '顶灯 通道1', 'ceiling', 6.0, 10.0, 5, 5500, 4500, 90),
    f('f-a2', '顶灯 通道2', 'ceiling', 22.0, 10.0, 5, 5500, 4500, 90),
    // 熨平区
    f('f-i1', '顶灯 熨平1', 'ceiling', 4.0, 13.2, 5, 12000, 5000, 90),
    f('f-i2', '顶灯 熨平2', 'ceiling', 10.0, 15.8, 5, 12000, 5000, 90),
    f('f-i3', '顶灯 熨平3', 'ceiling', 16.5, 14.0, 5, 12000, 5000, 90),
    f('f-i4', '工位灯 熨平机', 'task', 6.5, 13.4, 2.4, 3500, 5700, 60),
    f('f-i5', '工位灯 折叠台', 'task', 15.3, 13.6, 2.4, 3500, 5700, 60),
    // 质检区：工位灯 3 关闭 -> 该台夜间/清晨低于 300lux，触发质检台暗区规则
    f('f-q1', '顶灯 质检', 'ceiling', 25.2, 13.0, 5, 8000, 5700, 80),
    f('f-q2', '工位灯 质检台1', 'task', 23.4, 13.2, 2.4, 3500, 5700, 60),
    f('f-q3', '工位灯 质检台2', 'task', 26.6, 13.2, 2.4, 3500, 5700, 60),
    f('f-q4', '工位灯 质检台3', 'task', 25.0, 15.6, 2.4, 3500, 5700, 60, false),
    // 洗墙灯（照北墙设备带）
    f('f-ww1', '洗墙灯 1', 'wallwash', 8.4, 7.4, 3.2, 4000, 4000, 35, true, { x: 8.4, y: 0.6 }),
    f('f-ww2', '洗墙灯 2', 'wallwash', 20.6, 7.4, 3.2, 4000, 4000, 35, true, { x: 20.6, y: 0.6 }),
  ];
}

export function seedPlan(): LightingPlan {
  return {
    id: 'plan-default',
    name: '默认布光方案',
    fixtures: seedFixtures(),
    qcStationId: 'ob-qc-1',
    updatedAt: new Date().toISOString(),
  };
}

export const SEED_WORKERS: Worker[] = [
  { id: 'w1', name: '张建国', zoneId: 'sort',  shift: 'day' },
  { id: 'w2', name: '李秀兰', zoneId: 'wash',  shift: 'day' },
  { id: 'w3', name: '王海涛', zoneId: 'dry',   shift: 'day' },
  { id: 'w4', name: '陈丽娟', zoneId: 'iron',  shift: 'evening' },
  { id: 'w5', name: '赵敏',   zoneId: 'qc',    shift: 'day' },
  { id: 'w6', name: '孙志强', zoneId: 'wash',  shift: 'evening' },
];

export const SHIFT_LABEL: Record<'day' | 'evening', string> = {
  day: '白班 08:00-14:00',
  evening: '晚班 14:00-20:00',
};
