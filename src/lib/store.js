// 应用状态：方案、批次、复核记录；本地持久化

import { SEED_DESIGNS, SEED_BATCHES, HALL } from './seed.js';
import { runChecks, batchDerived, STATUS_META } from './qc.js';
import { computeGrid } from './lighting.js';
import { MODE } from './modes.js';

const KEY = 'depot-light-qa-v4';

export const uid = (p) => `${p}${Math.random().toString(36).slice(2, 7)}`;
export const nowISO = () => {
  const d = new Date();
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(d.getTime() + tz * 60000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(tz / 60)}:${pad(tz % 60)}`;
};
export const fmtTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const REVIEWER = { name: '周敏', role: '复核员' };
export const DESIGNER = { name: '林哲', role: '设计员' };

/** 四项检查快照（去掉 Float32Array，只留可序列化结果） */
export function snapshotChecks(doc) {
  const r = runChecks(doc, { modeKey: 'night' });
  return {
    checks: r.checks.map((c) => ({
      key: c.key,
      title: c.title,
      standard: c.standard,
      pass: c.pass,
      severity: c.severity,
      findings: c.findings.map((f) => ({ ...f })),
    })),
    findings: r.findings.map((f) => ({ ...f })),
    metrics: {
      avgLux: r.metrics.avgLux,
      darkCells: r.metrics.darkNight.darkCells,
      darkRatio: r.metrics.darkNight.darkRatio,
      zones: r.metrics.darkNight.zones.length,
      ugr: r.metrics.glare.max,
      coverage: r.metrics.emergency.coverage,
      aisleAvg: r.metrics.aisleStats.map((a) => ({ id: a.id, label: a.label, avg: a.avg, min: a.min })),
      minNN: r.metrics.spacing.minNN,
    },
    modeKey: 'night',
  };
}

function seedState() {
  const designs = SEED_DESIGNS.map((d) => ({ ...d, lamps: d.lamps.map((l) => ({ ...l })) }));
  const batches = SEED_BATCHES.map((b) => ({
    ...b,
    submissions: b.submissions.map((s) => {
      const design = designs.find((d) => d.id === s.designId);
      const snap = snapshotChecks(design);
      return { ...s, ...snap };
    }),
  }));
  // 预置复核记录，引用真实生成的问题编号
  const review = (batchId, subIdx, handler) => {
    const sub = batches.find((b) => b.id === batchId)?.submissions[subIdx];
    if (sub) handler(sub);
  };

  // Q-040 已放行：全部问题驳回或已整改
  review('BT-040', 0, (sub) => {
    for (const f of sub.findings) {
      sub.decisions[f.id] = {
        decision: 'reject',
        by: '周敏',
        at: '2026-11-10T11:20:00+08:00',
        reason: '复核已现场核验：库房净高、地沟位置与图纸一致，该项判定依据不足，不列为整改项。',
      };
    }
  });

  // Q-041 已退回：严重问题确认属实，另有 1 项驳回
  review('BT-041', 0, (sub) => {
    let i = 0;
    for (const f of sub.findings) {
      if (f.severity === 'serious') {
        sub.decisions[f.id] = {
          decision: 'confirm',
          by: '周敏',
          at: `2026-11-12T14:${String(20 + i).padStart(2, '0')}:00+08:00`,
          reason: '',
        };
        i++;
      }
    }
    const aisle = sub.findings.find((f) => f.checkKey === 'aisle');
    if (aisle) {
      sub.decisions[aisle.id] = {
        decision: 'reject',
        by: '周敏',
        at: '2026-11-12T14:33:00+08:00',
        reason: '端头主通道仅作设备与料件搬运，非人员常驻检修通道，照明按 100 lx 执行即可，不予整改。',
      };
    }
  });

  // Q-043 / v1 已退回，v2 复核中：确认 2 项、驳回 1 项
  review('BT-043', 0, (sub) => {
    for (const f of sub.findings.filter((f) => f.severity === 'serious').slice(0, 3)) {
      sub.decisions[f.id] = {
        decision: 'confirm',
        by: '罗建',
        at: '2026-11-13T13:40:00+08:00',
        reason: '',
      };
    }
  });
  review('BT-043', 1, (sub) => {
    const glare = sub.findings.find((f) => f.checkKey === 'glare');
    if (glare) {
      sub.decisions[glare.id] = {
        decision: 'reject',
        by: '罗建',
        at: '2026-11-14T15:16:00+08:00',
        reason: '大功率灯具数量少、同视域光源数低于 3，UGR 计算余量充足，属正常设计取舍，不视为缺陷。',
      };
    }
    // 通道照度问题留待逐条复核，演示「复核中」状态
    const aisle = sub.findings.find((f) => f.checkKey === 'aisle' && f.severity === 'general');
    if (aisle && sub.findings.length > 2) {
      sub.decisions[aisle.id] = {
        decision: 'confirm',
        by: '罗建',
        at: '2026-11-14T15:24:00+08:00',
        reason: '',
        rectified: true,
      };
    }
  });

  // Q-042 待复核：空
  return {
    designs,
    batches,
    hall: HALL,
    ui: {
      tab: 'design',
      designId: 'DS-A',
      mode: 'night',
      selectedLampId: null,
      compareIds: ['DS-A', 'DS-B', 'DS-C'],
      batchId: 'BT-041',
      cell: 0.5,
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.designs?.length && s.batches?.length) return s;
    }
  } catch (e) {
    console.warn('状态读取失败，使用初始数据', e);
  }
  return seedState();
}

export function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('状态保存失败', e);
  }
}

export function resetState() {
  localStorage.removeItem(KEY);
}

// ───────── 派生 ─────────
export function designGrid(design, modeKey, cell = 0.5, opts = {}) {
  const m = MODE[modeKey] ?? MODE.night;
  return computeGrid(design, { cell, ambient: m.ambient, powerScale: m.powerScale, ...opts });
}

export function batchView(batch) {
  const subs = batch.submissions.map((s) => ({ sub: s, d: batchDerived(s) }));
  const latest = subs[subs.length - 1];
  // 批次状态以最新送审版本为准；历史版本的退回记录计入退回次数
  let status = latest ? latest.d.status : 'pending';
  if (status === 'ready' && !latest?.sub.returnCount) status = 'ready';
  if (subs.length && subs.every((s) => s.d.status === 'approved')) status = 'approved';
  else if (status === 'returned' && subs.length > 1) status = 'reviewing';

  const passRate = subs.length ? subs.reduce((a, s) => a + s.d.passRate, 0) / subs.length : 0;
  const returns = subs.reduce((a, s) => a + (s.sub.returnCount ?? 0), 0);
  const assignee =
    status === 'approved' ? '—' : latest?.d.status === 'returned' ? latest.sub.designer : latest ? latest.d.assignee : '—';
  const region = STATUS_META[status];
  return {
    subs,
    latest,
    latestSub: latest?.sub,
    status,
    region,
    passRate,
    returns,
    assignee,
    versions: subs.length,
    // 放行只看最新送审版本：历史版本的退回记录不阻塞新版本放行
    canRelease: !!latest && latest.d.status === 'ready',
    pendingCount: latest ? latest.d.pending.length : 0,
    confirmedSerious: latest ? latest.d.confirmedSerious.length : 0,
    totalFindings: latest ? latest.d.totalFindings : 0,
    latestStatus: latest?.d.status ?? 'pending',
  };
}

export function designsOfHall(state, hallId) {
  return state.designs.filter((d) => d.room.id === hallId);
}

export function openBatches(state) {
  return state.batches;
}


