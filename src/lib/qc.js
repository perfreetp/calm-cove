// 图纸批次质检 —— 灯具间距 / 检修通道照度 / 应急回路覆盖 / 眩光指数

import {
  computeGrid,
  statsAll,
  maskStats,
  pointInFootprint,
  spacingReport,
  statsIn,
  ugrAt,
  zoneSummary,
  pitDepthAt,
} from './lighting.js';
import { MODE } from './modes.js';

export const SEVERITY = {
  serious: { label: '严重', order: 0, tone: 'danger' },
  general: { label: '一般', order: 1, tone: 'warn' },
  suggestion: { label: '建议', order: 2, tone: 'info' },
};

export const CHECK_META = {
  spacing: { key: 'spacing', title: '灯具间距', standard: '间距 ≤ 1.6H；阵列最近邻偏差 ≤ 1.8' },
  aisle: { key: 'aisle', title: '检修通道照度', standard: '检修通道平均 ≥ 150 lx，均匀度 U₀ ≥ 0.40' },
  emergency: { key: 'emergency', title: '应急回路覆盖', standard: '疏散路径 ≥ 3 lx，覆盖率 ≥ 95%，双回路' },
  glare: { key: 'glare', title: '眩光指数', standard: '检修作业 UGR ≤ 22，通道 UGR ≤ 25' },
};

function trenchStats(grid) {
  let sum = 0, n = 0, min = Infinity;
  for (let k = 0; k < grid.values.length; k++) {
    if (!grid.pit || !grid.pit[k]) continue;
    const v = grid.values[k];
    sum += v; n++;
    if (v < min) min = v;
  }
  return n ? { avg: sum / n, min, cells: n } : { avg: 0, min: 0, cells: 0 };
}

export function gridFor(doc, modeKey, extra = {}) {
  const m = MODE[modeKey] ?? MODE.night;
  return computeGrid(doc, {
    cell: 0.5,
    ambient: m.ambient,
    powerScale: m.powerScale,
    ...extra,
  });
}

/**
 * 运行四项检查。默认在夜间工况下判定（人工照明承担全部负荷，最不利）。
 */
export function runChecks(doc, opts = {}) {
  const modeKey = opts.modeKey ?? 'night';
  const lamps = doc.lamps;
  const fixtures = doc.fixtures;
  const room = doc.room;
  const cell = 0.5;
  const gridNight = gridFor(doc, modeKey, { cell });
  const aisles = fixtures.filter((f) => f.kind === 'aisle');
  const findings = [];
  const byCheck = (k) => findings.filter((f) => f.checkKey === k).length;
  const push = (checkKey, severity, title, detail, extra = {}) =>
    findings.push({
      id: `${checkKey}-${byCheck(checkKey) + 1}`,
      checkKey,
      severity,
      title,
      detail,
      locus: extra.locus ?? null,
      refs: extra.refs ?? {},
    });

  // ── 1. 灯具间距 ──
  const sp = spacingReport(lamps);
  if (lamps.length < 4) {
    push('spacing', 'serious', `灯具数量仅 ${lamps.length} 盏，无法构成有效照明阵列`, `全库 ${(room.w * room.h).toFixed(0)} m² 仅布置 ${lamps.length} 盏灯具，阵列规则性与维护间距均无法满足。`);
  } else {
    const overs = [];
    lamps.forEach((l, i) => {
      const d = sp.nn[i];
      if (Number.isFinite(d) && d / l.h > 1.6) overs.push({ lamp: l, d, ratio: d / l.h });
    });
    if (overs.length) {
      const worst = overs.reduce((a, b) => (b.ratio > a.ratio ? b : a));
      push(
        'spacing',
        'serious',
        `${overs.length} 处灯具间距超过 1.6 倍安装高度`,
        `最不利处：${worst.lamp.id} 最近邻 ${worst.d.toFixed(2)} m ÷ 安装高度 ${worst.lamp.h.toFixed(1)} m = ${worst.ratio.toFixed(2)}H，超过 1.6H 限值，照度谷低于设计值。`,
        { locus: { x: worst.lamp.x, y: worst.lamp.y }, refs: { lamps: overs.map((o) => o.lamp.id) } }
      );
    }
    if (sp.ratio > 1.8) {
      push(
        'spacing',
        'general',
        '灯具阵列间距偏差过大',
        `最近邻最大/最小 = ${sp.maxNN.toFixed(2)} / ${sp.minNN.toFixed(2)} m = ${sp.ratio.toFixed(2)}，超过 1.8，阵列不均会在通道形成明暗条纹。`,
        { refs: { minNN: sp.minNN, maxNN: sp.maxNN } }
      );
    }
    if (sp.minNN < 1.4) {
      push(
        'spacing',
        'suggestion',
        `局部灯具间距 ${sp.minNN.toFixed(2)} m 小于 1.4 m`,
        '高天棚灯具间距过小会相互遮挡散热气流，检修时登高作业空间不足，建议复核。',
      );
    }
    const overCeiling = lamps.filter((l) => l.h > room.ceiling - 0.3);
    if (overCeiling.length) {
      push('spacing', 'general', `${overCeiling.length} 盏灯具安装高度触及屋面结构`, `安装高度 ${Math.max(...overCeiling.map((l) => l.h)).toFixed(2)} m，库房净高 ${room.ceiling} m，需预留桥架与检修空间。`, { refs: { lamps: overCeiling.map((l) => l.id) } });
    }
  }

  // ── 2. 检修通道照度 ──
  const aisleStats = [];
  for (const a of aisles) {
    const st = statsIn(gridNight, a);
    aisleStats.push({ id: a.id, label: a.label, ...st, threshold: 150 });
    if (!st.n) continue;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    if (st.avg < 100) {
      push(
        'aisle',
        'serious',
        `检修通道「${a.label}」平均照度严重不足`,
        `平均 ${st.avg.toFixed(0)} lx、最小 ${st.min.toFixed(0)} lx，低于 150 lx 限值；通道中心 (${cx.toFixed(1)} m, ${cy.toFixed(1)} m) 附近作业面不满足检修要求。`,
        { locus: { x: cx, y: cy } }
      );
    } else if (st.avg < 150) {
      push(
        'aisle',
        'general',
        `检修通道「${a.label}」平均照度低于 150 lx`,
        `平均 ${st.avg.toFixed(0)} lx，最小 ${st.min.toFixed(0)} lx，均匀度 ${st.uniformity.toFixed(2)}，未达检修通道限值。`,
        { locus: { x: cx, y: cy } }
      );
    }
    if (st.uniformity < 0.4 && st.avg >= 100) {
      push(
        'aisle',
        'general',
        `检修通道「${a.label}」均匀度 ${st.uniformity.toFixed(2)} 不足`,
        `最小/平均 = ${st.min.toFixed(0)} / ${st.avg.toFixed(0)} = ${st.uniformity.toFixed(2)}，低于 0.40，人员通行时明暗适应负担大。`,
        { locus: { x: cx, y: cy } }
      );
    }
  }

  // ── 3. 应急回路覆盖 ──
  const emergencyLamps = lamps.filter((l) => l.emergency && l.battery !== false);
  const inAisle = (x, y) => aisles.some((a) => pointInFootprint(x, y, a));
  let emoGrid = null;
  let coverage = 0;
  let uncovered = [];
  let iso = { min: 0, avg: 0 };
  if (emergencyLamps.length) {
    emoGrid = computeGrid(doc, {
      cell,
      lampFilter: (l) => l.emergency && l.battery !== false,
      ambient: 0,
    });
    iso = maskStats(emoGrid, inAisle);
    let aisleCells = 0, litCells = 0;
    for (let j = 0; j < emoGrid.ny; j++) {
      for (let i = 0; i < emoGrid.nx; i++) {
        const x = i * emoGrid.cell, y = j * emoGrid.cell;
        if (!inAisle(x, y)) continue;
        aisleCells++;
        if (emoGrid.values[j * emoGrid.nx + i] >= 3) litCells++;
        else uncovered.push([x, y]);
      }
    }
    coverage = aisleCells ? litCells / aisleCells : 0;
  }
  const emergency = {
    coverage,
    lampCount: emergencyLamps.length,
    circuits: doc.circuits?.emergency ?? 0,
    minLux: iso.min,
    avgLux: iso.avg,
    uncovered: uncovered.length,
    trenchLux: 0,
  };
  // 地沟内应急照度
  {
    let sum = 0, n = 0;
    for (let j = 0; j < gridNight.ny; j++) {
      for (let i = 0; i < gridNight.nx; i++) {
        const x = i * cell, y = j * cell;
        if (!pitDepthAt(x, y, fixtures)) continue;
        sum += emoGrid ? emoGrid.values[j * emoGrid.nx + i] : 0;
        n++;
      }
    }
    emergency.trenchLux = n ? sum / n : 0;
  }

  if (emergencyLamps.length === 0) {
    push('emergency', 'serious', '未设置应急灯具', '方案中应急属性灯具为 0，检修通道与地沟在失电后无应急照明。');
  } else {
    if ((doc.circuits?.emergency ?? 0) < 2) {
      push(
        'emergency',
        'serious',
        `应急照明回路仅 ${doc.circuits?.emergency ?? 0} 路`,
        '应急照明应由两个回路交叉供电并在末端自动切换，当前应急回路数不足，单回路故障即全库失去应急照明。'
      );
    }
    if (coverage < 0.85) {
      push(
        'emergency',
        'serious',
        `应急照度覆盖率仅 ${(coverage * 100).toFixed(1)}%`,
        `检修通道内 ${(coverage * 100).toFixed(1)}% 网格点达到 3 lx（要求 ≥95%），${uncovered.length} 个网格点低于限值，集中于通道端部与柱后。`,
        { locus: uncovered[0] ? { x: uncovered[0][0], y: uncovered[0][1] } : null }
      );
    } else if (coverage < 0.95) {
      push(
        'emergency',
        'general',
        `应急照度覆盖率 ${(coverage * 100).toFixed(1)}%，未达 95%`,
        `${uncovered.length} 个通道网格点应急照度低于 3 lx，建议在端部增设应急灯具。`,
        { locus: uncovered[0] ? { x: uncovered[0][0], y: uncovered[0][1] } : null }
      );
    }
    if (emergency.trenchLux < 3) {
      push(
        'emergency',
        'general',
        `地沟内应急照度仅 ${emergency.trenchLux.toFixed(1)} lx`,
        '地沟属于检修作业面，失电时需维持不低于 3 lx 的人员疏散照明，当前沟内应急照度不足。'
      );
    }
  }

  // ── 4. 眩光指数 ──
  const glarePoints = [];
  for (const a of aisles) glarePoints.push({ x: a.x + a.w / 2, y: a.y + a.h / 2, label: a.label });
  glarePoints.push({ x: room.w / 2, y: room.h / 2, label: '库房中心' });
  let worst = null;
  for (const p of glarePoints) {
    const v = ugrAt(doc, p);
    if (!worst || v > worst.v) worst = { ...p, v };
  }
  const glare = { max: worst?.v ?? 0, point: worst, samples: glarePoints.map((p) => ({ ...p, v: ugrAt(doc, p) })) };
  if (worst && worst.v > 25) {
    push(
      'glare',
      'serious',
      `眩光指数 UGR ${worst.v.toFixed(1)} 超限`,
      `「${worst.label}」观察点 (${worst.x.toFixed(1)} m, ${worst.y.toFixed(1)} m) UGR = ${worst.v.toFixed(1)}，高于 25，高天棚灯具下视亮度比过大。`,
      { locus: { x: worst.x, y: worst.y } }
    );
  } else if (worst && worst.v > 22) {
    push(
      'glare',
      'general',
      `眩光指数 UGR ${worst.v.toFixed(1)} 偏高`,
      `「${worst.label}」处 UGR = ${worst.v.toFixed(1)}，超过 22 的检修作业限值，建议加大遮光角或减少同视域灯具数量。`,
      { locus: { x: worst.x, y: worst.y } }
    );
  } else if (worst && worst.v > 19) {
    push(
      'glare',
      'suggestion',
      `眩光指数 UGR ${worst.v.toFixed(1)} 接近限值`,
      `最高观察点 UGR = ${worst.v.toFixed(1)}，距 22 的限值余量不足 3，建议保留设计余量。`,
      { locus: { x: worst.x, y: worst.y } }
    );
  }

  // ── 汇总 ──
  const checks = Object.keys(CHECK_META).map((key) => {
    const list = findings.filter((f) => f.checkKey === key);
    const worstSev = list.reduce((acc, f) => (SEVERITY[f.severity].order < SEVERITY[acc].order ? f.severity : acc), 'suggestion');
    return { ...CHECK_META[key], findings: list, pass: list.length === 0, severity: list.length ? worstSev : null };
  });

  const dark = zoneSummary(gridNight, 150);
  const gridMaint = gridFor(doc, 'maint', { cell });
  const darkMaint = zoneSummary(gridMaint, 200);

  return {
    checks,
    findings,
    metrics: {
      spacing: { minNN: sp.minNN, maxNN: sp.maxNN, ratio: sp.ratio },
      aisleStats,
      emergency,
      glare,
      avgLux: statsAll(gridNight).avg,
      workPlane: statsAll(gridNight),
      trench: trenchStats(gridNight),
      darkNight: dark,
      darkMaint,
    },
    modeKey,
  };
}

/**
 * 复核状态推导：
 *  - 任一「严重」问题被确认为属实 → 整批退回设计方
 *  - 全部问题均有结论、无确认的严重问题、且确认的一般/建议问题已整改 → 可放行出版
 */
export function batchDerived(sub) {
  const findings = sub.findings ?? [];
  const decisions = sub.decisions ?? {};
  const confirmed = findings.filter((f) => decisions[f.id]?.decision === 'confirm');
  const rejected = findings.filter((f) => decisions[f.id]?.decision === 'reject');
  const pending = findings.filter((f) => !decisions[f.id]);
  const confirmedSerious = confirmed.filter((f) => f.severity === 'serious');
  const checksPassed = (sub.checks ?? []).filter((c) => c.pass).length;
  const checkTotal = (sub.checks ?? []).length || 4;

  // 状态优先级：已放行 > 已退回 > 待放行 > 复核中 > 待复核
  let status;
  let assignee;
  if (sub.releasedAt) {
    status = 'approved';
    assignee = '—';
  } else if (sub.returnedAt) {
    status = 'returned';
    assignee = sub.designer;
  } else if (findings.length === 0 || pending.length === 0) {
    status = 'ready';
    assignee = '档案员';
  } else if (confirmed.length || rejected.length) {
    status = 'reviewing';
    assignee = sub.reviewer;
  } else {
    status = 'pending';
    assignee = sub.reviewer;
  }

  return {
    status,
    assignee,
    confirmed,
    rejected,
    pending,
    confirmedSerious,
    checksPassed,
    checkTotal,
    passRate: checksPassed / checkTotal,
    decidedCount: confirmed.length + rejected.length,
    totalFindings: findings.length,
    canRelease: status === 'ready',
    locked: !!(sub.returnedAt || sub.releasedAt),
  };
}

export const STATUS_META = {
  pending: { label: '待复核', tone: 'neutral' },
  reviewing: { label: '复核中', tone: 'accent' },
  returned: { label: '已退回', tone: 'danger' },
  ready: { label: '待放行', tone: 'ok' },
  approved: { label: '已放行', tone: 'ok' },
};

export function batchStats(batch) {
  const subs = batch.submissions.map((s) => ({ sub: s, d: batchDerived(s) }));
  const latest = subs[subs.length - 1];
  const decided = newestStatus(subs);
  const passRate = subs.length
    ? subs.reduce((a, s) => a + s.d.passRate, 0) / subs.length
    : 0;
  const returns = subs.reduce((a, s) => a + (s.sub.returnCount ?? 0), 0);
  return {
    latest,
    status: decided,
    passRate,
    returns,
    assignee: latest ? latest.d.assignee : '—',
    versions: subs.length,
    openFindings: latest ? latest.d.pending.length : 0,
  };
}

export function newestStatus(subs) {
  if (!subs.length) return { status: 'pending', assignee: '—' };
  return subs[subs.length - 1].d;
}
