// 初始数据：一个 4 线检修库、四套布灯方案、四个质检批次

export const HALL = {
  id: 'hall-hx',
  name: '3 号线车辆段 · 检修库',
  w: 84,
  h: 36,
  ceiling: 9.5,
  bays: 4,
};

export function baseFixtures() {
  const tracks = [7, 15, 23, 31];
  const fx = [];
  tracks.forEach((cy, idx) => {
    fx.push({
      id: `T${idx + 1}`,
      kind: 'trench',
      x: 6,
      y: cy - 0.65,
      w: 72,
      h: 1.3,
      depth: 1.5,
      label: `${idx + 1} 道检修地沟`,
    });
  });
  fx.push(
    { id: 'A1', kind: 'aisle', x: 6, y: 9.9, w: 72, h: 2.4, label: '1–2 道检修通道' },
    { id: 'A2', kind: 'aisle', x: 6, y: 17.9, w: 72, h: 2.4, label: '2–3 道检修通道' },
    { id: 'A3', kind: 'aisle', x: 6, y: 25.9, w: 72, h: 2.4, label: '3–4 道检修通道' },
    { id: 'A4', kind: 'aisle', x: 2.4, y: 2, w: 2.4, h: 32, label: '端头主通道' }
  );
  [16, 38, 60, 80].forEach((cx, i) => {
    [11.1, 19.1, 27.1].forEach((cy, j) => {
      fx.push({
        id: `C${i + 1}${j + 1}`,
        kind: 'column',
        cx,
        cy,
        r: 0.34,
        height: 9.5,
        label: `${i + 1}-${j + 1} 轴柱`,
      });
    });
  });
  fx.push(
    { id: 'P1', kind: 'platform', x: 14, y: 8.1, w: 30, h: 1.6, z: 1.1, thickness: 0.15, label: '1 道检修平台西段' },
    { id: 'P2', kind: 'platform', x: 48, y: 8.1, w: 26, h: 1.6, z: 1.1, thickness: 0.15, label: '1 道检修平台东段' },
    { id: 'P3', kind: 'platform', x: 26, y: 29.4, w: 34, h: 1.6, z: 1.1, thickness: 0.15, label: '4 道检修平台' },
    { id: 'P4', kind: 'platform', x: 64, y: 16.1, w: 6, h: 1.5, z: 3.2, thickness: 0.18, label: '车顶作业平台' },
    { id: 'B1', kind: 'cabinet', x: 2.4, y: 12.4, w: 2.2, h: 6.4, height: 2.2, label: '电气柜' },
    { id: 'B2', kind: 'cabinet', x: 79.4, y: 20, w: 2.4, h: 5, height: 2.2, label: '配电柜' }
  );
  return fx;
}

let seq = 0;
const mk = (o) => ({
  id: `L${String(++seq).padStart(2, '0')}`,
  model: 'HB150',
  h: 9,
  tilt: 0,
  cct: 4000,
  circuit: 'N1',
  emergency: false,
  battery: true,
  ...o,
});

function array({ rows, cols, x0, x1, y0, y1, base }) {
  seq = 0;
  const out = [];
  for (let r = 0; r < rows; r++) {
    const y = rows === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * r) / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const x = cols === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * c) / (cols - 1);
      out.push(mk({ ...base, x: +x.toFixed(2), y: +y.toFixed(2) }));
    }
  }
  return out;
}

const circ = (i, mod = 4) => ['N1', 'N2', 'N3', 'N4'][i % mod];

function designBase(over) {
  return {
    room: { ...HALL },
    fixtures: baseFixtures(),
    circuits: { normal: 4, emergency: 2 },
    prefs: { cell: 0.5, target: 150, maintTarget: 200, wallBand: 0.75 },
    ...over,
  };
}

const lampsA = array({ rows: 6, cols: 10, x0: 8, x1: 76, y0: 3.2, y1: 32, base: { model: 'HB150', h: 9, cct: 4000 } }).map(
  (l, i) => ({
    ...l,
    circuit: circ(i),
    emergency: [13, 34, 55].includes(i),
    cct: i % 5 === 0 ? 5000 : 4000,
  })
);

const lampsB = array({ rows: 6, cols: 12, x0: 2.5, x1: 81.5, y0: 1.6, y1: 34.4, base: { model: 'HB150', h: 8.6, cct: 5000 } }).map(
  (l, i) => ({
    ...l,
    circuit: circ(i),
    emergency: [0, 11, 23, 36, 47, 59, 70, 5, 17, 29, 42, 53, 65].includes(i),
    cct: i % 3 === 0 ? 4000 : 5000,
    model: i % 12 === 0 ? 'HB200' : 'HB150',
  })
);

const lampsC = array({ rows: 3, cols: 5, x0: 12, x1: 72, y0: 6, y1: 30, base: { model: 'HB200', h: 9, cct: 6500 } }).map(
  (l, i) => ({ ...l, circuit: circ(i, 2), emergency: i === 7 })
);

const lampsD = array({ rows: 8, cols: 12, x0: 6, x1: 78, y0: 2.4, y1: 33.6, base: { model: 'HB100N', h: 9.5, cct: 5000 } }).map(
  (l, i) => ({
    ...l,
    circuit: circ(i),
    emergency: [0, 12, 24, 36, 48, 60, 72, 84].includes(i),
  })
);

// C 的修订稿：保留大功率主阵列骨架，按通道补 12 盏补光灯，并按跨通道补 6 盏应急灯
const lampsE = [
  ...array({ rows: 4, cols: 6, x0: 8, x1: 76, y0: 5, y1: 31, base: { model: 'HB200', h: 9, cct: 5000 } }).map((l, i) => ({
    ...l,
    id: `M${String(i + 1).padStart(2, '0')}`,
    circuit: i % 2 === 0 ? 'N1' : 'N2',
  })),
  ...array({ rows: 2, cols: 6, x0: 8, x1: 76, y0: 9.9, y1: 25.9, base: { model: 'HB150', h: 8.2, cct: 5000 } }).map((l, i) => ({
    ...l,
    id: `F${String(i + 1).padStart(2, '0')}`,
    circuit: 'N2',
    emergency: i % 2 === 0,
  })),
];

export const SEED_DESIGNS = [
  designBase({
    id: 'DS-A',
    code: 'JX-2026-041-A',
    rev: 1,
    name: '4 线检修库 · 高天棚基线方案',
    designer: '林哲',
    note: '6×10 规则阵列，HB-150 4000K，兼顾造价与均匀度。',
    updatedAt: '2026-11-12T09:20:00+08:00',
    lamps: lampsA,
    circuits: { normal: 4, emergency: 1 },
  }),
  designBase({
    id: 'DS-B',
    code: 'JX-2026-042-A',
    rev: 1,
    name: '4 线检修库 · 复核修订版',
    designer: '许清和',
    note: '加密至 7×11 阵列并补设 6 盏应急灯，应急双回路供电，柱后增设斜向配光。',
    updatedAt: '2026-11-13T15:05:00+08:00',
    lamps: lampsB,
    circuits: { normal: 4, emergency: 2 },
  }),
  designBase({
    id: 'DS-C',
    code: 'JX-2026-043-A',
    rev: 1,
    name: '4 线检修库 · 降本试验稿',
    designer: '沈立',
    note: '3×5 大功率灯具压缩数量，验证降本可行性。',
    updatedAt: '2026-11-14T11:40:00+08:00',
    lamps: lampsC,
    circuits: { normal: 2, emergency: 1 },
  }),
  designBase({
    id: 'DS-E',
    code: 'JX-2026-043-B',
    rev: 2,
    name: '4 线检修库 · 降本修订稿',
    designer: '沈立',
    note: '针对 Q-2026-043 退回意见：保留大功率主阵列，按检修通道补 12 盏补光灯，并沿通道补 6 盏应急灯，应急回路增至 2 路。',
    updatedAt: '2026-11-14T12:05:00+08:00',
    lamps: lampsE,
    circuits: { normal: 2, emergency: 2 },
  }),
  designBase({
    id: 'DS-D',
    code: 'JX-2026-045-A',
    rev: 1,
    name: '4 线检修库 · 窄配光试验稿',
    designer: '林哲',
    note: '窄配光 HB-100N 高密度阵列，试验抑制眩光。',
    updatedAt: '2026-11-14T17:30:00+08:00',
    lamps: lampsD,
    circuits: { normal: 4, emergency: 2 },
  }),
];

export const SEED_BATCHES = [
  {
    id: 'BT-039',
    code: 'Q-2026-039',
    title: '4 线检修库照明施工图（初版出版）',
    hallId: 'hall-hx',
    createdAt: '2026-11-08T09:00:00+08:00',
    dueAt: '2026-11-11T18:00:00+08:00',
    submissions: [
      {
        id: 'SB-039-1',
        designId: 'DS-B',
        version: 1,
        designer: '许清和',
        reviewer: '周敏',
        submittedAt: '2026-11-08T10:20:00+08:00',
        returnCount: 1,
        decisions: {},
        note: '按 Q-2026-036 意见修订，请复核高天棚阵列与应急回路。',
        releasedAt: '2026-11-09T15:30:00+08:00',
        releasedBy: '周敏',
      },
    ],
  },
  {
    id: 'BT-040',
    code: 'Q-2026-040',
    title: '4 线检修库照明施工图（出版前复核）',
    hallId: 'hall-hx',
    createdAt: '2026-11-10T09:00:00+08:00',
    dueAt: '2026-11-13T18:00:00+08:00',
    submissions: [
      {
        id: 'SB-040-1',
        designId: 'DS-B',
        version: 2,
        designer: '许清和',
        reviewer: '周敏',
        submittedAt: '2026-11-10T09:30:00+08:00',
        returnCount: 0,
        decisions: {},
        note: '按上轮退回意见加密阵列并补齐应急回路，四项检查全部通过，申请出版。',
      },
    ],
  },
  {
    id: 'BT-041',
    code: 'Q-2026-041',
    title: '4 线检修库照明施工图（首轮）',
    hallId: 'hall-hx',
    createdAt: '2026-11-12T10:00:00+08:00',
    dueAt: '2026-11-16T18:00:00+08:00',
    submissions: [
      {
        id: 'SB-041-1',
        designId: 'DS-A',
        version: 1,
        designer: '林哲',
        reviewer: '周敏',
        submittedAt: '2026-11-12T10:05:00+08:00',
        returnCount: 1,
        decisions: {},
        note: '6×10 规则阵列，请复核应急回路与端部照度。',
        returnedAt: '2026-11-12T14:40:00+08:00',
        returnedBy: '周敏',
        returnReason: '应急回路仅 1 路、应急覆盖率 47%，两项严重问题确认属实，整批退回设计方修订。',
      },
    ],
  },
  {
    id: 'BT-042',
    code: 'Q-2026-042',
    title: '4 线检修库窄配光比照',
    hallId: 'hall-hx',
    createdAt: '2026-11-14T17:30:00+08:00',
    dueAt: '2026-11-18T18:00:00+08:00',
    submissions: [
      {
        id: 'SB-042-1',
        designId: 'DS-D',
        version: 1,
        designer: '林哲',
        reviewer: '罗建',
        submittedAt: '2026-11-14T17:45:00+08:00',
        returnCount: 0,
        decisions: {},
        note: '窄配光 HB-100N 高密度阵列，试验抑制眩光；应急灯按跨通道布置。',
      },
    ],
  },
  {
    id: 'BT-043',
    code: 'Q-2026-043',
    title: '4 线检修库降本试验稿',
    hallId: 'hall-hx',
    createdAt: '2026-11-13T11:00:00+08:00',
    dueAt: '2026-11-17T18:00:00+08:00',
    submissions: [
      {
        id: 'SB-043-1',
        designId: 'DS-C',
        version: 1,
        designer: '沈立',
        reviewer: '罗建',
        submittedAt: '2026-11-13T11:20:00+08:00',
        returnCount: 1,
        decisions: {},
        note: '3×5 大功率灯具压缩数量，验证降本可行性。',
        returnedAt: '2026-11-13T15:02:00+08:00',
        returnedBy: '罗建',
        returnReason: '三条检修通道平均照度低于 100 lx，降本幅度超出规范允许范围，整批退回。',
      },
      {
        id: 'SB-043-2',
        designId: 'DS-E',
        version: 2,
        designer: '沈立',
        reviewer: '罗建',
        submittedAt: '2026-11-14T12:12:00+08:00',
        returnCount: 0,
        decisions: {},
        note: '补充 4 盏端部补光灯与 6 盏沿通道应急灯，应急回路增至 2 路，请重点复核通道照度与地沟应急照度。',
      },
    ],
  },
];
