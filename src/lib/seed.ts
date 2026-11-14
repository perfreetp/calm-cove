import type { DB, Order, OrderEvent, PlanVersion, ReturnRecord } from '../types';
import {
  ControlPoint,
  CTRL_ROWS,
  CTRL_V,
  buildSurface,
  cloneControlPoints,
  defaultControlPoints,
  makeControlPoints,
  syncControlPoints,
  CURV_THRESHOLD_DEFAULT,
} from './geom';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RETURN_REASONS = [
  '耳甲腔第二转折处曲率超限（K ＞ 0.67 mm⁻¹），应力集中风险高，请降低隆起并复核壁厚。',
  '下料图泄压孔偏离耳道轴线 2.8mm，请重新定位后再提交。',
  '耳屏处控制点外扩过度，贴合边无法密封，请回缩 0.6mm 以内。',
  '该患者耳道狭小，0.8mm 壁厚不满足强度要求，请改用 1.2mm 及以上档位。',
  '耳道末端走向与扫描点云偏差过大，请用扫描点云重新拟合后再提交。',
  '下料图展开宽度与耳甲腔周长不符，请核对版本控制点是否漏保存。',
];

function variantPoints(seed: number, amount: number): ControlPoint[] {
  const rng = mulberry32(seed);
  return syncControlPoints(
    makeControlPoints((u, phi, i, j) => {
      const envelope = Math.sin(Math.PI * Math.min(1, u * 1.3)) * (1 - u * 0.2);
      let dr = amount * envelope * (0.14 * Math.sin(phi * 2 + rng() * 0.2) + 0.1 * Math.cos(phi * 3 + 0.4));
      const dz = amount * 0.05 * (rng() - 0.5) * envelope;
      // a few localised irregularities: these are what reviewers look for
      const bumps = 2 + Math.floor(rng() * 2);
      for (let b = 0; b < bumps; b++) {
        const row = 1 + Math.floor(rng() * (CTRL_ROWS - 2));
        const col = Math.floor(rng() * CTRL_V);
        const amp = amount * (0.35 + rng() * 0.75) * (rng() > 0.5 ? 1 : -1);
        const dp = Math.min(Math.abs(j - col), CTRL_V - Math.abs(j - col));
        const dd = i - row;
        dr += amp * Math.exp(-(dd * dd + dp * dp) / 2.2);
      }
      return { dr, dz };
    }),
  );
}

function bumpPoints(base: ControlPoint[], row: number, col: number, delta: number): ControlPoint[] {
  return base.map((c, i) => {
    if (i !== row * 12 + col) return { ...c };
    return { ...c, dr: Math.max(-3.4, Math.min(3.4, c.dr + delta)) };
  });
}

function metricsFor(cps: ControlPoint[], wall: number, adaptive: boolean, threshold: number) {
  const g = buildSurface(cps, { nu: 52, nv: 60, wall, adaptive, threshold });
  return {
    curvatureMax: g.metrics.curvatureMax,
    curvatureP95: g.metrics.curvatureP95,
    curvatureMean: g.metrics.curvatureMean,
    overRatio: g.metrics.overRatio,
    wallMin: g.metrics.wallMin,
    wallMax: g.metrics.wallMax,
  };
}

const iso = (t: number) => new Date(t).toISOString();

let evtSeq = 0;
function ev(
  at: number,
  actorId: string,
  type: OrderEvent['type'],
  label: string,
  note?: string,
): OrderEvent {
  evtSeq++;
  return { id: `ev-${evtSeq}`, at: iso(at), actorId, type, label, note };
}

export function buildSeed(nowMs: number): DB {
  evtSeq = 0;
  const rng = mulberry32(20261105);

  const stores = [
    { id: 'st-01', name: '上海静安旗舰店', code: 'SH-JA', city: '上海', address: '静安区南京西路 1266 号 3F', phone: '021-6288 9021', manager: '沈知远', openedAt: '2023-04-18', active: true },
    { id: 'st-02', name: '北京朝阳中心店', code: 'BJ-CY', city: '北京', address: '朝阳区建国路 88 号 SKP-S 5F', phone: '010-5928 6612', manager: '程可欣', openedAt: '2023-09-02', active: true },
    { id: 'st-03', name: '广州天河店', code: 'GZ-TH', city: '广州', address: '天河区天河路 208 号 2F', phone: '020-3801 7788', manager: '周启南', openedAt: '2024-01-15', active: true },
    { id: 'st-04', name: '成都春熙店', code: 'CD-CX', city: '成都', address: '锦江区红星路三段 1 号 IFS 4F', phone: '028-8665 3301', manager: '唐婉', openedAt: '2024-06-20', active: true },
    { id: 'st-05', name: '杭州西湖店', code: 'HZ-XH', city: '杭州', address: '西湖区文三路 90 号 1F', phone: '0571-8890 1122', manager: '柳承安', openedAt: '2024-11-08', active: true },
    { id: 'st-06', name: '深圳南山店', code: 'SZ-NS', city: '深圳', address: '南山区科苑南路 2666 号 2F', phone: '0755-8865 9900', manager: '何隽', openedAt: '2025-03-01', active: true },
  ];

  const users = [
    { id: 'u-00', name: '林致', role: 'admin' as const, storeId: 'st-01', email: 'linzhi@auris.audio', phone: '138 0011 2233', active: true, joinedAt: '2022-11-01', title: '运营总监' },
    { id: 'u-01', name: '许听澜', role: 'reviewer' as const, storeId: 'st-01', email: 'xutinglan@auris.audio', phone: '139 0022 4455', active: true, joinedAt: '2023-02-14', title: '首席审核' },
    { id: 'u-02', name: '顾远舟', role: 'reviewer' as const, storeId: 'st-02', email: 'guyuanzhou@auris.audio', phone: '137 0033 6688', active: true, joinedAt: '2023-07-05', title: '工艺审核员' },
    { id: 'u-03', name: '苏晚晴', role: 'fitter' as const, storeId: 'st-01', email: 'suwanqing@auris.audio', phone: '136 0044 1122', active: true, joinedAt: '2023-05-20', title: '高级验配师' },
    { id: 'u-04', name: '陆星野', role: 'fitter' as const, storeId: 'st-01', email: 'luxingye@auris.audio', phone: '135 0055 7788', active: true, joinedAt: '2024-03-11', title: '验配师' },
    { id: 'u-05', name: '江叙', role: 'fitter' as const, storeId: 'st-02', email: 'jiangxu@auris.audio', phone: '134 0066 9900', active: true, joinedAt: '2023-08-02', title: '高级验配师' },
    { id: 'u-06', name: '温砚', role: 'fitter' as const, storeId: 'st-02', email: 'wenyan@auris.audio', phone: '133 0077 2233', active: true, joinedAt: '2024-05-06', title: '验配师' },
    { id: 'u-07', name: '祁桓', role: 'fitter' as const, storeId: 'st-03', email: 'qihuan@auris.audio', phone: '132 0088 4455', active: true, joinedAt: '2024-02-19', title: '高级验配师' },
    { id: 'u-08', name: '宋知意', role: 'fitter' as const, storeId: 'st-03', email: 'songzhiyi@auris.audio', phone: '131 0099 6677', active: true, joinedAt: '2024-10-14', title: '验配师' },
    { id: 'u-09', name: '岑野', role: 'fitter' as const, storeId: 'st-04', email: 'cenye@auris.audio', phone: '130 1100 8899', active: true, joinedAt: '2024-07-01', title: '高级验配师' },
    { id: 'u-10', name: '白鹭', role: 'fitter' as const, storeId: 'st-04', email: 'bailu@auris.audio', phone: '189 2200 3344', active: true, joinedAt: '2025-02-10', title: '验配师' },
    { id: 'u-11', name: '聂澄', role: 'fitter' as const, storeId: 'st-05', email: 'niecheng@auris.audio', phone: '188 3300 5566', active: true, joinedAt: '2024-12-03', title: '高级验配师' },
    { id: 'u-12', name: '袁澜', role: 'fitter' as const, storeId: 'st-06', email: 'yuanlan@auris.audio', phone: '186 4400 7788', active: true, joinedAt: '2025-04-08', title: '验配师' },
    { id: 'u-13', name: '韩朔', role: 'fitter' as const, storeId: 'st-06', email: 'hanshuo@auris.audio', phone: '185 5500 9900', active: false, joinedAt: '2024-08-22', title: '验配师' },
  ];

  const materials = [
    { id: 'm-01', name: '医用光敏树脂 · 透明', code: 'RS-T90', spec: 'Ø 90 × 20 mm 板材', hardness: 'Shore D 82', color: '透明', leadDays: 4, stock: 812, minStock: 200, unitPrice: 46, active: true },
    { id: 'm-02', name: '医用光敏树脂 · 肤色', code: 'RS-S80', spec: 'Ø 90 × 18 mm 板材', hardness: 'Shore D 78', color: '浅肤色', leadDays: 4, stock: 476, minStock: 200, unitPrice: 48, active: true },
    { id: 'm-03', name: '加硬丙烯酸树脂', code: 'AC-HD', spec: 'Ø 95 × 25 mm 饼料', hardness: 'Shore D 88', color: '透明', leadDays: 6, stock: 358, minStock: 200, unitPrice: 62, active: true },
    { id: 'm-04', name: '医用硅胶 · 软质', code: 'SI-S40', spec: 'Ø 80 × 15 mm 板材', hardness: 'Shore A 42', color: '半透明', leadDays: 7, stock: 176, minStock: 200, unitPrice: 78, active: true },
    { id: 'm-05', name: '钛合金中空壳坯', code: 'TI-HL', spec: 'Ø 12 × 18 mm 坯料', hardness: 'Grade 5', color: '钛灰', leadDays: 12, stock: 84, minStock: 200, unitPrice: 210, active: true },
    { id: 'm-06', name: '抗菌光敏树脂 · 白', code: 'RS-A70', spec: 'Ø 88 × 18 mm 板材', hardness: 'Shore D 80', color: '象牙白', leadDays: 5, stock: 264, minStock: 200, unitPrice: 66, active: true },
  ];

  const patients = [
    '陈砚清', '方既明', '许南乔', '邵文川', '梁以宁', '孟青禾', '贺兰舟', '崔望舒',
    '罗知微', '蒋牧之', '钟毓秀', '席林', '余笙', '樊星野', '覃思远', '尹照',
    '金朝歌', '柏舟', '骆清和', '商序', '池映', '查叙白', '解语', '狄念',
    '关山月', '尉迟静', '薛照临', '韩青', '沈砚秋', '程既白',
  ];

  const fittersByStore: Record<string, string[]> = {
    'st-01': ['u-03', 'u-04'],
    'st-02': ['u-05', 'u-06'],
    'st-03': ['u-07', 'u-08'],
    'st-04': ['u-09', 'u-10'],
    'st-05': ['u-11'],
    'st-06': ['u-12'],
  };

  const reviewers = ['u-01', 'u-02'];
  const statusPlan: Array<Order['status']> = [
    'pending_model', 'pending_model', 'pending_model',
    'pending_review', 'pending_review', 'pending_review', 'pending_review', 'pending_review',
    'pending_review', 'pending_review',
    'returned', 'returned', 'returned',
    'ordered', 'ordered', 'ordered', 'ordered',
    'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
    'delivered', 'delivered', 'delivered', 'delivered', 'delivered', 'delivered',
  ];

  const orders: Order[] = [];
  let serial = 2400;
  const now = nowMs;

  statusPlan.forEach((status, k) => {
    const patient = patients[k % patients.length];
    const storeIdx = k % stores.length;
    const store = stores[storeIdx];
    const roster = fittersByStore[store.id];
    const fitterId = roster[Math.floor(k / stores.length) % roster.length];
    const ear: Order['ear'] = k % 2 === 0 ? 'right' : 'left';
    const material = materials[(k * 2) % materials.length];
    const reviewer = reviewers[k % reviewers.length];
    const seed = 700 + k * 31;
    const wall = [0.8, 1.2, 1.2, 1.6, 2.0][k % 5];
    const adaptive = k % 3 === 0;
    const threshold = CURV_THRESHOLD_DEFAULT;

    // schedule relative to now, distributed over 45 days
    const ageDays = status === 'pending_model' ? 0.2 + rng() * 1.2 : 0.5 + rng() * 3;
    let createdAt = now - ageDays * DAY - (status === 'pending_model' ? 0 : 0);
    let cursor = createdAt;
    const events: OrderEvent[] = [];
    const versions: PlanVersion[] = [];
    const returns: ReturnRecord[] = [];

    const base = variantPoints(seed, k === 11 ? 1.9 : 1.1);
    const vSeqBase = 1;
    let cps = syncControlPoints(base);
    let versionNote = '初次扫模取形，耳甲腔下缘保留 0.4mm 缓冲。';

    const pushVersion = (points: ControlPoint[], note: string, at: number, seat: number) => {
      const seq = versions.length + 1;
      const vwall = wall;
      const vadaptive = adaptive;
      const vthreshold = threshold;
      const version: PlanVersion = {
        id: `v-${k}-${seq}`,
        orderId: '',
        seq,
        createdAt: iso(at),
        authorId: fitterId,
        controlPoints: cloneControlPoints(points),
        wallThickness: vwall,
        adaptive: vadaptive,
        threshold: vthreshold,
        metrics: metricsFor(points, vwall, vadaptive, vthreshold),
        note,
      };
      versions.push(version);
      void seat;
      return version;
    };

    events.push(ev(createdAt, fitterId, 'created', '订单创建，耳印扫描已归档'));
    pushVersion(cps, versionNote, createdAt + 0.4 * HOUR, 0);

    if (status !== 'pending_model') {
      // first submission
      cursor = createdAt + (1.2 + rng() * 2.4) * HOUR;
      events.push(ev(cursor, fitterId, 'submitted', `提交方案 V1 审核`, `壁厚 ${wall}mm`));

      const returnsForStatus = status === 'returned' ? 1 : status === 'ordered' || status === 'delivered' ? (k % 4 === 0 ? 1 : 0) : 0;

      for (let r = 0; r < returnsForStatus; r++) {
        const at = cursor + (1.4 + rng() * 3.2) * HOUR;
        const reason = RETURN_REASONS[(k + r) % RETURN_REASONS.length];
        const ret: ReturnRecord = {
          id: `r-${k}-${r}`,
          at: iso(at),
          reviewerId: reviewer,
          reason,
          versionSeq: versions.length,
        };
        returns.push(ret);
        events.push(ev(at, reviewer, 'returned', `退回：${reason.slice(0, 18)}…`, reason));

        // fitter fixes: bump a hotspot and save new version
        const fixed = syncControlPoints(
          bumpPoints(versions[versions.length - 1].controlPoints, 2 + r, (k + 3) % 8, -0.45),
        );
        const fixedAt = at + (1.6 + rng() * 4) * HOUR;
        const note =
          r === 0
            ? '按退回复核意见降低第二转折隆起，壁厚上调至 1.2mm。'
            : '重新拟合耳道末端走向，泄压孔沿轴线复位。';
        pushVersion(fixed, note, fixedAt, r + 1);
        cursor = fixedAt + (0.5 + rng()) * HOUR;
        events.push(ev(cursor, fitterId, 'submitted', `提交方案 V${versions.length} 复审`, note));
        if (status === 'returned') break;
      }

      if (status === 'pending_review') {
        // nothing further
      } else if (status === 'ordered' || status === 'delivered') {
        const approveAt = cursor + (2 + rng() * 5) * HOUR;
        events.push(
          ev(approveAt, reviewer, 'approved', '审核通过，已下单生产', `材料 ${material.code} · 交期 ${material.leadDays} 天`),
        );
        cursor = approveAt;
        if (status === 'delivered') {
          const deliverAt = approveAt + (material.leadDays - 1 + rng() * 2) * DAY;
          events.push(ev(Math.min(deliverAt, now - 2 * HOUR), 'u-00', 'delivered', '门店签收，已交付患者'));
        }
      }
    }

    const currentVersion = versions[versions.length - 1];
    currentVersion.orderId = `o-${k}`;

    const updatedAt = events[events.length - 1].at;
    const dueAt = iso(
      (status === 'delivered' ? createdAt : now) + (material.leadDays + 3 + rng() * 3) * DAY,
    );

    orders.push({
      id: `o-${k}`,
      code: `AUR-${new Date(createdAt).toISOString().slice(0, 10).replace(/-/g, '')}-${serial + k}`,
      patient,
      ear,
      storeId: store.id,
      fitterId,
      materialId: material.id,
      status,
      createdAt: iso(createdAt),
      updatedAt,
      dueAt,
      currentVersionId: currentVersion.id,
      versions,
      events,
      returns,
      notes: k % 5 === 0 ? '患者主诉外耳道偏窄，佩戴时长 10h/天。' : '',
    });
  });

  // newest first
  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const db: DB = {
    stores,
    users,
    materials,
    orders,
    settings: { threshold: CURV_THRESHOLD_DEFAULT, currentUserId: 'u-03', seededAt: iso(now) },
    meta: { orderSerial: 2450 },
  };
  return db;
}

/* -------------------------------------------------------------- */

export function makeEmptyOrder(opts: {
  id: string;
  code: string;
  patient: string;
  ear: 'left' | 'right';
  storeId: string;
  fitterId: string;
  materialId: string;
  now: number;
  threshold: number;
}): Order {
  const cps = syncControlPoints(defaultControlPoints());
  const version: PlanVersion = {
    id: `${opts.id}-v1`,
    orderId: opts.id,
    seq: 1,
    createdAt: iso(opts.now),
    authorId: opts.fitterId,
    controlPoints: cloneControlPoints(cps),
    wallThickness: 1.2,
    adaptive: true,
    threshold: opts.threshold,
    metrics: metricsFor(cps, 1.2, true, opts.threshold),
    note: '新建方案，等待扫描或手动摆点。',
  };
  return {
    id: opts.id,
    code: opts.code,
    patient: opts.patient,
    ear: opts.ear,
    storeId: opts.storeId,
    fitterId: opts.fitterId,
    materialId: opts.materialId,
    status: 'pending_model',
    createdAt: iso(opts.now),
    updatedAt: iso(opts.now),
    dueAt: iso(opts.now + 10 * DAY),
    currentVersionId: version.id,
    versions: [version],
    events: [ev(opts.now, opts.fitterId, 'created', '订单创建，等待耳印扫描或手动建模')],
    returns: [],
    notes: '',
  };
}

export { variantPoints, metricsFor };
