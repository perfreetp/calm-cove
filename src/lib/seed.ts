import type {
  AppData,
  AuditEvent,
  Boat,
  Coach,
  Race,
  Run,
  Session,
  Squad,
  TrackPoint
} from './types';
import { buildWorld, LANE_WIDTH, MARK_COUNT, MARK_STEP, START_X, laneCenterY } from './world';
import { synthRun } from './sim';
import { mulberry32 } from './geo';

const DAY = 86400000;
const T = (iso: string) => Date.parse(iso);
const hhmm = (day: string, time: string) => T(`${day}T${time}:00`);

export const ANCHOR = '2026-11-15';
export const RACE_DAY = '2026-11-16';
export const TRAINING_DAYS = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];

export const squads: Squad[] = [
  { id: 'M2x', name: '男子双人双桨', short: '男双', color: '#63c3ce' },
  { id: 'W2x', name: '女子双人双桨', short: '女双', color: '#e8b04b' },
  { id: 'M1x', name: '男子单人双桨', short: '男单', color: '#7fd8a8' },
  { id: 'W1x', name: '女子单人双桨', short: '女单', color: '#d99adf' },
  { id: 'LM2x', name: '轻量级双人双桨', short: '轻双', color: '#e98d6b' }
];

export const coaches: Coach[] = [
  { id: 'c-shen', name: '沈砚', role: '主教练', initials: '沈' },
  { id: 'c-tang', name: '唐野', role: '助理教练', initials: '唐' },
  { id: 'c-lin', name: '林澜', role: '技术教练', initials: '林' },
  { id: 'c-yu', name: '郁松', role: '体能教练', initials: '郁' }
];

const athletes = [
  '陆知遥', '程野', '柳青禾', '谢岸', '苏晚', '沈既明', '温故', '江砚秋',
  '齐霜', '顾星阑', '叶照', '何枝', '骆川', '白露', '岑迟', '韩屿',
  '季沉', '闻笛', '许渡', '孟樾', '卫汐', '宁远', '闻洲', '宗月',
  '宿白', '柏舟', '易今', '常青', '师絮', '郑芦苇'
];

const hullNames = [
  '青澜', '白鹭', '松风', '苍岩', '澄江', '雁行', '涪星', '归舟',
  '岫云', '断浪', '轻舟', '远帆', '鹤汀', '川岚', '雪线', '南浦'
];

function buildBoats(): Boat[] {
  const cfg: { id: Squad['id']; count: number; seats: number }[] = [
    { id: 'M2x', count: 4, seats: 2 },
    { id: 'W2x', count: 4, seats: 2 },
    { id: 'M1x', count: 3, seats: 1 },
    { id: 'W1x', count: 3, seats: 1 },
    { id: 'LM2x', count: 2, seats: 2 }
  ];
  const boats: Boat[] = [];
  let n = 0;
  let ai = 0;
  for (const s of cfg) {
    const sq = squads.find((q) => q.id === s.id)!;
    for (let i = 0; i < s.count; i++) {
      const crew = Array.from({ length: s.seats }, () => athletes[ai++ % athletes.length]);
      boats.push({
        id: `boat-${String(n + 1).padStart(2, '0')}`,
        code: `${s.id}-${String(i + 1).padStart(2, '0')}`,
        name: `${hullNames[n % hullNames.length]}号`,
        squad: s.id,
        athletes: crew,
        color: sq.color
      });
      n++;
    }
  }
  return boats;
}

/* Every session is authored with explicit per-lane assignments so the schedule stays coherent. */

interface Assignment {
  boat: number;
  lane: number;
  /** deviation gaussian amplitude */
  devAmp?: number;
  devAt?: number;
  devWidth?: number;
  missAtMark?: number;
  missAmp?: number;
  falseStartSec?: number;
  wobbly?: boolean;
  secPer500?: number;
}

interface SessionSpec {
  code: string;
  subject: string;
  focus: string;
  coachId: string;
  day: string;
  startTime: string;
  durationMin: number;
  lanes: number[];
  startMark: number;
  endMark: number;
  windFrom: number;
  windTo: number;
  windMin: number;
  windMax: number;
  planned: number;
  timeLimit: number;
  status: Session['status'];
  note: string;
  publishedBy?: string;
  publishedAt?: string;
  /** crews on the roster that did not upload (drives realistic attendance gaps) */
  noShow?: number[];
  assignments: Assignment[];
}

const sessionSpecs: SessionSpec[] = [
  {
    code: 'TR-1012-A',
    subject: '2000 m 稳定配速 · 双人艇',
    focus: '每 500 m 配速差 ≤ 2 s，中段节奏稳定',
    coachId: 'c-shen',
    day: '2026-11-10',
    startTime: '06:30',
    durationMin: 80,
    lanes: [2, 3, 4, 5],
    startMark: 0,
    endMark: 8,
    windFrom: 300,
    windTo: 355,
    windMin: 1.5,
    windMax: 4.5,
    planned: 4,
    timeLimit: 7,
    status: 'closed',
    publishedBy: '沈砚',
    publishedAt: '2026-11-09T19:40:00',
    note: '早课，水温 17 ℃。第 3 道中途避让浮标。',
    noShow: [14],
    assignments: [
      { boat: 1, lane: 2 },
      { boat: 5, lane: 3, devAmp: 4.9, devAt: 0.62 },
      { boat: 2, lane: 4 },
      { boat: 6, lane: 5, wobbly: true }
    ]
  },
  {
    code: 'TR-1111-B',
    subject: '500 m 起航爆发 × 6 组',
    focus: '反应时间 ≤ 0.38 s，前三桨桨频 ≥ 42',
    coachId: 'c-lin',
    day: '2026-11-11',
    startTime: '07:10',
    durationMin: 55,
    lanes: [1, 2, 3, 4],
    startMark: 0,
    endMark: 2,
    windFrom: 210,
    windTo: 245,
    windMin: 2,
    windMax: 5.5,
    planned: 4,
    timeLimit: 3,
    status: 'closed',
    publishedBy: '林澜',
    publishedAt: '2026-11-10T21:15:00',
    note: '横风偏大，起航段风摆明显。',
    assignments: [
      { boat: 9, lane: 1, falseStartSec: -0.44 },
      { boat: 10, lane: 2 },
      { boat: 11, lane: 3, falseStartSec: -0.19 },
      { boat: 12, lane: 4 }
    ]
  },
  {
    code: 'TR-1112-C',
    subject: '技术划 2×1000 m · 低桨频 18–20',
    focus: '艇身走直线，控制入水角度',
    coachId: 'c-tang',
    day: '2026-11-12',
    startTime: '16:40',
    durationMin: 70,
    lanes: [3, 4, 5, 6],
    startMark: 0,
    endMark: 4,
    windFrom: 30,
    windTo: 65,
    windMin: 0.5,
    windMax: 2.5,
    planned: 4,
    timeLimit: 8,
    status: 'published',
    publishedBy: '唐野',
    publishedAt: '2026-11-12T14:20:00',
    note: '风小，适合直线技术课。',
    noShow: [16],
    assignments: [
      { boat: 12, lane: 3 },
      { boat: 13, lane: 4, devAmp: 4.5, devAt: 0.55 },
      { boat: 14, lane: 5 },
      { boat: 15, lane: 6, wobbly: true, devAmp: -4.4, devAt: 0.35 }
    ]
  },
  {
    code: 'TR-1113-D',
    subject: '1500 m 计时 · 女子组',
    focus: '负分段，最后 500 m 提速',
    coachId: 'c-shen',
    day: '2026-11-13',
    startTime: '06:20',
    durationMin: 60,
    lanes: [1, 2, 3, 4, 5],
    startMark: 0,
    endMark: 6,
    windFrom: 340,
    windTo: 20,
    windMin: 1,
    windMax: 3.5,
    planned: 5,
    timeLimit: 6,
    status: 'published',
    publishedBy: '沈砚',
    publishedAt: '2026-11-12T19:20:00',
    note: '顺风侧，终点段浮标有轻雾。',
    noShow: [4, 7],
    assignments: [
      { boat: 5, lane: 1 },
      { boat: 6, lane: 2, devAmp: 5.4, devAt: 0.68 },
      { boat: 7, lane: 3 },
      { boat: 8, lane: 4, missAtMark: 3, missAmp: 7.9 },
      { boat: 12, lane: 5, falseStartSec: -0.27 }
    ]
  },
  {
    code: 'TR-1114-E',
    subject: '2000 m 分段控制 · 男女混编',
    focus: '每 500 m 分段时间落在目标区间',
    coachId: 'c-yu',
    day: '2026-11-14',
    startTime: '06:45',
    durationMin: 85,
    lanes: [1, 2, 3, 4, 5, 6],
    startMark: 0,
    endMark: 8,
    windFrom: 260,
    windTo: 300,
    windMin: 2,
    windMax: 5,
    planned: 6,
    timeLimit: 7,
    status: 'published',
    publishedBy: '郁松',
    publishedAt: '2026-11-13T20:05:00',
    note: '赛前最后一次长距离。',
    noShow: [3, 11],
    assignments: [
      { boat: 1, lane: 1 },
      { boat: 2, lane: 2, devAmp: 6.0, devAt: 0.44 },
      { boat: 5, lane: 3 },
      { boat: 6, lane: 4, wobbly: true },
      { boat: 9, lane: 5, falseStartSec: -0.36 },
      { boat: 15, lane: 6, missAtMark: 5, missAmp: 7.5 }
    ]
  },
  {
    code: 'TR-1113-E',
    subject: '500 m 冲刺重复 · 男子组',
    focus: '后 250 m 桨频提升至 40+，保持艇身稳定',
    coachId: 'c-lin',
    day: '2026-11-13',
    startTime: '16:10',
    durationMin: 50,
    lanes: [2, 3, 4],
    startMark: 0,
    endMark: 2,
    windFrom: 320,
    windTo: 10,
    windMin: 1,
    windMax: 3,
    planned: 3,
    timeLimit: 4,
    status: 'published',
    publishedBy: '林澜',
    publishedAt: '2026-11-13T09:30:00',
    note: '短距离重复，注意起航反应。',
    noShow: [4],
    assignments: [
      { boat: 1, lane: 2, secPer500: 92 },
      { boat: 2, lane: 3, secPer500: 94, devAmp: 4.2, devAt: 0.6 },
      { boat: 3, lane: 4, secPer500: 96 }
    ]
  },
  {
    code: 'TR-1114-F',
    subject: '技术划 4×500 m · 女子单人',
    focus: '入水角度与回桨节奏，每 500 m 休息 2 min',
    coachId: 'c-tang',
    day: '2026-11-14',
    startTime: '16:20',
    durationMin: 65,
    lanes: [1, 2, 3],
    startMark: 0,
    endMark: 2,
    windFrom: 240,
    windTo: 275,
    windMin: 0.5,
    windMax: 2,
    planned: 3,
    timeLimit: 5,
    status: 'published',
    publishedBy: '唐野',
    publishedAt: '2026-11-14T11:10:00',
    note: '风平，适合抠技术细节。',
    assignments: [
      { boat: 12, lane: 1, secPer500: 112 },
      { boat: 13, lane: 2, secPer500: 110, missAtMark: 1, missAmp: 8.2 },
      { boat: 14, lane: 3, secPer500: 114, wobbly: true }
    ]
  },
  {
    code: 'TR-1112-A',
    subject: '2000 m 有氧耐力 · 双人艇',
    focus: '低强度长距离，心率控制在 150 以内',
    coachId: 'c-yu',
    day: '2026-11-12',
    startTime: '07:00',
    durationMin: 90,
    lanes: [1, 2, 3, 4, 5, 6],
    startMark: 0,
    endMark: 8,
    windFrom: 40,
    windTo: 70,
    windMin: 1,
    windMax: 3,
    planned: 6,
    timeLimit: 8,
    status: 'closed',
    publishedBy: '郁松',
    publishedAt: '2026-11-11T20:15:00',
    note: '有氧课，全部艇只参与。',
    noShow: [9, 16],
    assignments: [
      { boat: 1, lane: 1, secPer500: 116 },
      { boat: 5, lane: 2, secPer500: 118 },
      { boat: 9, lane: 3, secPer500: 122 },
      { boat: 12, lane: 4, secPer500: 120, devAmp: 3.9, devAt: 0.5 },
      { boat: 15, lane: 5, secPer500: 119 },
      { boat: 10, lane: 6, secPer500: 121 }
    ]
  },
  {
    code: 'TR-1115-F',
    subject: '预赛前 1000 m 唤醒',
    focus: '起航 + 冲刺，保持低心率',
    coachId: 'c-shen',
    day: '2026-11-15',
    startTime: '07:20',
    durationMin: 40,
    lanes: [2, 3, 4],
    startMark: 0,
    endMark: 4,
    windFrom: 250,
    windTo: 285,
    windMin: 1.5,
    windMax: 4,
    planned: 3,
    timeLimit: 5,
    status: 'published',
    publishedBy: '沈砚',
    publishedAt: '2026-11-14T06:40:00',
    note: '赛前唤醒，第 4 道留空。',
    assignments: [
      { boat: 3, lane: 2, secPer500: 96 },
      { boat: 4, lane: 3, secPer500: 94, devAmp: 4.4, devAt: 0.71 },
      { boat: 7, lane: 4, secPer500: 98 }
    ]
  },
  {
    code: 'TR-1115-G',
    subject: '赛前技术复核 · 轻量级',
    focus: '检查起航姿态与转向浮标',
    coachId: 'c-tang',
    day: '2026-11-15',
    startTime: '09:00',
    durationMin: 45,
    lanes: [5, 6],
    startMark: 4,
    endMark: 8,
    windFrom: 200,
    windTo: 240,
    windMin: 1,
    windMax: 3,
    planned: 2,
    timeLimit: 4,
    status: 'draft',
    note: '只跑后 1000 m 段，名单待定。',
    assignments: []
  }
];

function makeSessions(): Session[] {
  return sessionSpecs.map((spec, i) => ({
    id: `ses-${String(i + 1).padStart(2, '0')}`,
    code: spec.code,
    subject: spec.subject,
    focus: spec.focus,
    coachId: spec.coachId,
    day: spec.day,
    startTime: spec.startTime,
    durationMin: spec.durationMin,
    lanes: spec.lanes,
    startMark: spec.startMark,
    endMark: spec.endMark,
    wind: { fromDeg: spec.windFrom, toDeg: spec.windTo, minMs: spec.windMin, maxMs: spec.windMax },
    plannedBoats: spec.planned,
    // roster = crews that ran plus any who were called but did not upload
    assigned: [...new Set([
      ...spec.assignments.map((a) => `boat-${String(a.boat).padStart(2, '0')}`),
      ...(spec.noShow ?? []).map((n) => `boat-${String(n).padStart(2, '0')}`)
    ])],
    timeLimitMin: spec.timeLimit,
    status: spec.status,
    version: spec.status === 'draft' ? 1 : 2,
    note: spec.note,
    createdAt: hhmm(spec.day, spec.startTime) - DAY * 2,
    publishedAt: spec.publishedAt ? T(spec.publishedAt) : null
  }));
}

function makeRuns(sessions: Session[], boats: Boat[]): { runs: Run[]; lastRun: Run | null } {
  const runs: Run[] = [];
  let seq = 0;
  for (const spec of sessionSpecs) {
    const session = sessions.find((s) => s.code === spec.code);
    if (!session) continue;
    const dayStart = hhmm(spec.day, spec.startTime);
    let offsetMin = 0;
    for (const a of spec.assignments) {
      const boat = boats[a.boat - 1];
      if (!boat) continue;
      seq++;
      const seed = 900 + seq * 137;
      const rnd = mulberry32(seed);
      const laneCenter = laneCenterY(a.lane);
      const total = (spec.endMark - spec.startMark) * MARK_STEP;
      const secPer500 = a.secPer500 ?? 101 + (6 - a.lane) * 1.6 + rnd() * 5.5;
      const startOffsetSec = a.falseStartSec ?? 0.14 + rnd() * 0.32;
      const result = synthRun({
        seed,
        laneCenterY: laneCenter,
        startX: START_X,
        startMark: spec.startMark,
        endMark: spec.endMark,
        markStep: MARK_STEP,
        laneWidth: LANE_WIDTH,
        lane: a.lane,
        boatId: boat.code,
        startOffsetSec,
        secPer500,
        baseBias: (rnd() - 0.5) * 1.2,
        deviationAmp: a.devAmp,
        deviationAt: a.devAt,
        deviationWidth: a.devWidth,
        missAtMark: a.missAtMark,
        missAmp: a.missAmp,
        wobbly: a.wobbly
      });
      const gunAt = dayStart + Math.round(offsetMin) * 60000;
      offsetMin += 1.8 + rnd() * 3.4 + result.durationSec / 60;
      const flagged = result.detections.length > 0;
      const id = `run-${String(seq).padStart(3, '0')}`;
      const uploadedAt = gunAt + result.durationSec * 1000 + 150000;
      let status: Run['status'] = 'valid';
      let review: Run['review'] = null;
      if (flagged) status = 'pending';
      // earlier sessions have largely been reviewed
      if (flagged && spec.day <= '2026-11-12' && seq % 4 !== 0) {
        const resolved: Run['status'] = seq % 5 === 0 ? 'invalid' : 'valid';
        status = resolved;
        review = {
          by: spec.coachId === 'c-tang' ? '唐野' : '沈砚',
          at: uploadedAt + 2 * 3600000,
          verdict: resolved,
          reason:
            resolved === 'invalid'
              ? '判定成立，本趟不计入统计'
              : '比对艇载记录与水上裁判后确认属设备漂移，成绩有效',
          reasonCode:
            resolved === 'invalid'
              ? result.detections.every((d) => d.kind === 'deviation')
                ? '判定成立 · 偏航超限'
                : result.detections[0].kind === 'falseStart'
                  ? '判定成立 · 抢航'
                  : '判定成立 · 漏标'
              : '设备漂移，轨迹失真'
        };
      }
      runs.push({
        id,
        sessionId: session.id,
        boatId: boat.id,
        lane: a.lane,
        startMark: spec.startMark,
        endMark: spec.endMark,
        gunAt,
        durationSec: result.durationSec,
        distanceM: total,
        splits: result.splits,
        track: result.track,
        maxDeviation: result.maxDeviation,
        meanDeviation: result.meanDeviation,
        startOffsetSec,
        detections: result.detections,
        snapshot: result.snapshot,
        status,
        review,
        uploadedAt
      });
    }
  }
  // "live" = newest run of today's published session, resolved by day not by id
  const todayIds = new Set(
    sessions.filter((x) => x.day === ANCHOR && x.status === 'published').map((x) => x.id)
  );
  const sorted = [...runs].sort((a, b) => b.uploadedAt - a.uploadedAt);
  return { runs, lastRun: sorted.find((r) => todayIds.has(r.sessionId)) ?? sorted[0] ?? null };
}

function makeRaces(): Race[] {
  const lanes6 = (ids: (string | null)[]): Race['lanes'] =>
    ids.map((boatId, i) => ({ lane: i + 1, boatId }));
  return [
    {
      id: 'race-01',
      name: '女子双人双桨 预赛 A 组',
      phase: 'heat',
      group: 'A',
      day: RACE_DAY,
      time: '09:00',
      lanes: lanes6(['boat-05', 'boat-06', 'boat-07', 'boat-08', null, null]),
      status: 'published',
      version: 3,
      updatedAt: hhmm('2026-11-14', '20:10'),
      updatedBy: '沈砚'
    },
    {
      id: 'race-02',
      name: '女子双人双桨 预赛 B 组',
      phase: 'heat',
      group: 'B',
      day: RACE_DAY,
      time: '09:00',
      lanes: lanes6(['boat-07', 'boat-05', null, 'boat-06', null, null]),
      status: 'draft',
      version: 1,
      updatedAt: hhmm('2026-11-15', '08:36'),
      updatedBy: '唐野'
    },
    {
      id: 'race-03',
      name: '男子双人双桨 预赛 A 组',
      phase: 'heat',
      group: 'A',
      day: RACE_DAY,
      time: '10:00',
      lanes: lanes6(['boat-01', 'boat-02', 'boat-03', 'boat-04', null, null]),
      status: 'published',
      version: 2,
      updatedAt: hhmm('2026-11-14', '20:22'),
      updatedBy: '沈砚'
    },
    {
      id: 'race-04',
      name: '男子单人双桨 预赛 A 组',
      phase: 'heat',
      group: 'A',
      day: RACE_DAY,
      time: '10:40',
      lanes: lanes6(['boat-09', 'boat-10', 'boat-11', null, null, null]),
      status: 'published',
      version: 2,
      updatedAt: hhmm('2026-11-15', '09:20'),
      updatedBy: '林澜'
    },
    {
      id: 'race-05',
      name: '女子双人双桨 决赛',
      phase: 'final',
      group: 'F',
      day: RACE_DAY,
      time: '15:30',
      lanes: lanes6([null, 'boat-05', null, 'boat-06', null, null]),
      status: 'draft',
      version: 1,
      updatedAt: hhmm('2026-11-15', '07:52'),
      updatedBy: '沈砚'
    },
    {
      id: 'race-06',
      name: '男子双人双桨 决赛',
      phase: 'final',
      group: 'F',
      day: RACE_DAY,
      time: '16:10',
      lanes: lanes6(['boat-02', null, 'boat-01', 'boat-03', 'boat-04', null]),
      status: 'published',
      version: 3,
      updatedAt: hhmm('2026-11-15', '09:30'),
      updatedBy: '唐野'
    }
  ];
}

function makeAudit(runs: Run[]): AuditEvent[] {
  const ev: AuditEvent[] = [];
  let n = 0;
  const add = (
    iso: string,
    actor: string,
    role: AuditEvent['actorRole'],
    kind: AuditEvent['kind'],
    action: string,
    target: string,
    detail: string
  ) => {
    ev.push({
      id: `aud-${String(++n).padStart(3, '0')}`,
      at: T(iso),
      actor,
      actorRole: role,
      kind,
      action,
      target,
      detail
    });
  };
  add('2026-11-09T18:00:00', '系统', 'system', 'system', '初始化', '青澜水库', '载入水域底图、6 条航道基准线与 54 枚浮标台账');
  add('2026-11-09T19:40:00', '沈砚', 'coach', 'session', '发布', 'TR-1012-A', '4 条航道 · 2000 m · 计划 4 艇');
  add('2026-11-10T21:15:00', '林澜', 'coach', 'session', '发布', 'TR-1111-B', '500 m 起航 ×6 组 · 风向区间 210°–245°');
  add('2026-11-12T14:20:00', '唐野', 'coach', 'session', '发布', 'TR-1112-C', '技术划 2×1000 m · 4 艇');
  add('2026-11-12T19:20:00', '沈砚', 'coach', 'session', '发布', 'TR-1113-D', '女子组 1500 m 计时 · 5 艇');
  add('2026-11-12T22:06:00', '唐野', 'coach', 'review', '复核', 'TR-1112-C 第 3 趟', '偏航判定 → 有效（设备漂移）');
  add('2026-11-13T20:05:00', '郁松', 'coach', 'session', '发布', 'TR-1114-E', '赛前长距离 · 6 道 6 艇');
  add('2026-11-14T19:31:00', '沈砚', 'coach', 'race', '发布', '女双 预赛 A 组', '赛道 1–4 分配完成');
  add('2026-11-14T19:44:00', '沈砚', 'coach', 'race', '发布', '男双 预赛 A 组', '赛道 1–4 分配完成');
  add('2026-11-14T20:10:00', '沈砚', 'coach', 'race', '编辑', '女双 预赛 A 组', '调整 4 道艇只 → W2x-04');
  add('2026-11-15T07:52:00', '沈砚', 'coach', 'race', '编辑', '女双 决赛', '草稿：登记 2 艇，待预赛结果');
  add('2026-11-15T08:36:00', '唐野', 'coach', 'race', '编辑', '女双 预赛 B 组', '草稿：登记 3 艇，存在赛道重复');
  add('2026-11-15T09:05:00', '林澜', 'coach', 'race', '编辑', '男单 预赛 A 组', '草稿：3 艇入列');
  add(
    '2026-11-15T09:14:00',
    '系统',
    'system',
    'system',
    '自动判读',
    '上传队列',
    `已解析 ${runs.length} 趟轨迹 · ${runs.filter((r) => r.detections.length).length} 趟标记异常`
  );
  return ev.sort((a, b) => b.at - a.at);
}

export function buildSeed(): AppData {
  const world = buildWorld();
  const boats = buildBoats();
  const sessions = makeSessions();
  const { runs, lastRun } = makeRuns(sessions, boats);
  const races = makeRaces();
  const audit = makeAudit(runs);
  return {
    world,
    lanes: world.lanes,
    boats,
    squads,
    coaches,
    sessions,
    runs,
    races,
    audit,
    liveRunId: lastRun?.id ?? ''
  };
}
