// Automated QC checks run on submit and on demand.
// Findings are stable across runs (keyed by check type + section + element set),
// so a manager's waive/resolve decisions survive re-runs unless the defect changed.

import { db, nowIso, tx } from '../db.js';
import { LIMITS } from './generator.js';
import { ISSUE_TYPES, KIND_INDEX } from '../../shared/domain.js';
import { randomUUID } from 'node:crypto';

export function computeFindings(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) throw new Error('项目不存在');
  const elements = db.prepare(
    'SELECT id, section_id, kind, code, model, bore_index, chainage, offset, mounted FROM elements WHERE project_id = ?'
  ).all(projectId);
  const sections = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY bore_index, start_m').all(projectId);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const findings = [];

  // 1) Jet fan spacing: fans sharing a mounting line must be >= 6.0 m apart.
  const lines = new Map();
  for (const e of elements) {
    if (e.kind !== 'jet_fan') continue;
    const key = `${e.bore_index}:${Math.round(e.offset * 2) / 2}`;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push(e);
  }
  for (const [key, fans] of lines) {
    fans.sort((a, b) => a.chainage - b.chainage);
    for (let i = 1; i < fans.length; i++) {
      const a = fans[i - 1];
      const b = fans[i];
      const gap = b.chainage - a.chainage;
      if (gap < LIMITS.FAN_SPACING_MIN_M - 1e-6) {
        const sectionId = a.section_id ?? b.section_id ?? null;
        findings.push({
          check_type: 'fan_spacing',
          severity: 'error',
          section_id: sectionId,
          element_ids: [a.id, b.id],
          message: `${a.code} 与 ${b.code} 间距 ${gap.toFixed(2)} m，小于设计最小间距 ${LIMITS.FAN_SPACING_MIN_M.toFixed(1)} m` +
            (sectionId && sectionById.get(sectionId) ? `（区段 ${sectionById.get(sectionId).code}）` : ''),
          meta: { gap, line: key },
        });
      }
    }
  }

  // 2) Sensors must be mounted and attached to a section.
  for (const e of elements) {
    if (e.kind !== 'co_sensor' && e.kind !== 'vi_sensor') continue;
    if (e.mounted !== 1 || e.section_id == null) {
      findings.push({
        check_type: 'sensor_unmounted',
        severity: 'error',
        section_id: e.section_id,
        element_ids: [e.id],
        message: `${e.code}（${e.model || '检测器'}）${e.mounted !== 1 ? '未挂装' : '未挂接区段'}`,
        meta: { mounted: e.mounted },
      });
    }
  }

  // 3) Section codes must be unique within the project.
  const byCode = new Map();
  for (const s of sections) {
    if (!byCode.has(s.code)) byCode.set(s.code, []);
    byCode.get(s.code).push(s);
  }
  for (const [code, group] of byCode) {
    if (group.length > 1) {
      findings.push({
        check_type: 'duplicate_section',
        severity: 'error',
        section_id: group[0].id,
        element_ids: group.map((s) => s.id),
        message: `区段编号「${code}」重复 ${group.length} 次（第 ${group.map((s) => s.bore_index + 1).join('、')} 洞段）`,
        meta: { section_ids: group.map((s) => s.id), code },
      });
    }
  }

  return { findings, project, sections, elements };
}

export function findingKey(f) {
  const ids = [...(f.element_ids || [])].sort((a, b) => a - b).join(',');
  return `${f.check_type}|${f.section_id ?? 'null'}|${ids}`;
}

/**
 * Refresh issue rows for a project. Preserves waivers and resolved markings for
 * defects that still exist; supersedes issues whose defect no longer reproduces.
 */
export function runChecks(projectId, { actor = 'system', persist = true } = {}) {
  const { findings } = computeFindings(projectId);
  const runId = randomUUID();
  if (!persist) {
    return { run_id: runId, findings, stale: [], created: 0, kept: 0 };
  }

  return tx(() => {
    const existing = db.prepare(
      "SELECT * FROM issues WHERE project_id = ? AND status IN ('open','waived','resolved')"
    ).all(projectId);
    const existingByKey = new Map();
    for (const row of existing) {
      const f = { check_type: row.check_type, section_id: row.section_id, element_ids: JSON.parse(row.element_ids) };
      const k = findingKey(f);
      if (!existingByKey.has(k)) existingByKey.set(k, []);
      existingByKey.get(k).push(row);
    }

    const now = nowIso();
    const seen = new Set();
    const created = [];
    for (const f of findings) {
      const k = findingKey(f);
      seen.add(k);
      const hit = (existingByKey.get(k) || []).find((r) => !seen.has(`row:${r.id}`));
      if (hit) {
        seen.add(`row:${hit.id}`);
        db.prepare('UPDATE issues SET message = ?, run_id = ? WHERE id = ?').run(f.message, runId, hit.id);
        continue;
      }
      const info = db.prepare(
        `INSERT INTO issues (project_id, section_id, check_type, severity, message, element_ids, status, run_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`
      ).run(projectId, f.section_id ?? null, f.check_type, f.severity, f.message, JSON.stringify(f.element_ids), runId, now);
      created.push(info.lastInsertRowid);
    }

    let superseded = 0;
    for (const row of existing) {
      if (seen.has(`row:${row.id}`)) continue;
      db.prepare("UPDATE issues SET status = 'superseded', updated_at = ? WHERE id = ?").run(now, row.id);
      superseded++;
    }

    return {
      run_id: runId,
      findings,
      created: created.length,
      kept: findings.length - created.length,
      superseded,
    };
  });
}

export function listIssues(projectId, { status, sectionId, type } = {}) {
  const where = ['i.project_id = ?'];
  const args = [projectId];
  if (status && status !== 'all') {
    if (status === 'active') {
      where.push("i.status IN ('open','waived','resolved')");
    } else {
      where.push('i.status = ?');
      args.push(status);
    }
  }
  if (sectionId) { where.push('i.section_id = ?'); args.push(sectionId); }
  if (type) { where.push('i.check_type = ?'); args.push(type); }
  const rows = db.prepare(
    `SELECT i.*, s.code AS section_code, s.name AS section_name
     FROM issues i LEFT JOIN sections s ON s.id = i.section_id
     WHERE ${where.join(' AND ')}
     ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'waived' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
              i.check_type, i.id`
  ).all(...args);
  return rows.map((r) => ({
    ...r,
    element_ids: JSON.parse(r.element_ids || '[]'),
    type_label: ISSUE_TYPES[r.check_type]?.label || r.check_type,
    type_short: ISSUE_TYPES[r.check_type]?.short || '',
  }));
}

export function projectIssuesSummary(projectId) {
  const rows = db.prepare(
    `SELECT check_type, status, COUNT(*) AS n FROM issues
     WHERE project_id = ? GROUP BY check_type, status`
  ).all(projectId);
  const summary = { open: 0, waived: 0, resolved: 0, byType: {}, active: 0 };
  for (const r of rows) {
    if (r.status === 'superseded') continue;
    if (r.status in summary) summary[r.status] += r.n;
    summary.byType[r.check_type] = (summary.byType[r.check_type] || 0) + r.n;
  }
  summary.active = summary.open + summary.waived + summary.resolved;
  return summary;
}
