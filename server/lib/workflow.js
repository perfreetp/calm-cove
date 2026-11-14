// Review workflow: assignment → production → submit → manager review → approve/reject.
// Rework counts increment on every rejection and never decrement.

import { db, nowIso, tx, audit } from '../db.js';
import { runChecks, listIssues } from './qc.js';

const SUBMITTABLE = new Set(['assigned', 'in_progress', 'rework', 'approved']);

/**
 * An approved section's element set is locked: re-hanging elements onto it
 * would smuggle unresolved findings into a signed-off drawing.
 */
export function assertSectionOpen(projectId, sectionId) {
  const sec = db.prepare('SELECT code, status FROM sections WHERE project_id = ? AND id = ?')
    .get(projectId, sectionId);
  if (sec && sec.status === 'approved') {
    throw Object.assign(
      new Error(`区段 ${sec.code} 已审核通过，需主管退回后才能修改要素`),
      { status: 409 },
    );
  }
}

export function assignSections(projectId, sectionIds, makerId, actor) {
  const maker = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'maker'").get(makerId);
  if (!maker) throw new Error('制作员不存在');
  const ids = [...new Set(sectionIds.map(Number).filter(Number.isFinite))];
  if (!ids.length) throw new Error('未选择区段');
  return tx(() => {
    const upd = db.prepare(
      `UPDATE sections SET assignee_id = ?, status = CASE WHEN status IN ('todo') THEN 'assigned' ELSE status END
       WHERE project_id = ? AND id = ?`
    );
    let n = 0;
    for (const id of ids) n += upd.run(makerId, projectId, id).changes;
    db.prepare("UPDATE projects SET status = 'active' WHERE id = ? AND status = 'planning'").run(projectId);
    audit(projectId, actor, 'assign_sections', `${n} 个区段 → ${maker.name}`);
    return n;
  });
}

export function unassignSection(projectId, sectionId, actor) {
  return tx(() => {
    const s = db.prepare('SELECT * FROM sections WHERE project_id = ? AND id = ?').get(projectId, sectionId);
    if (!s) throw new Error('区段不存在');
    if (s.status === 'submitted') throw new Error('区段已提交送审，不能取消分配');
    db.prepare(
      `UPDATE sections SET assignee_id = NULL, status = CASE WHEN status IN ('assigned','in_progress','rework') THEN 'todo' ELSE status END
       WHERE id = ?`
    ).run(sectionId);
    audit(projectId, actor, 'unassign_section', `区段 ${s.code}`);
    return true;
  });
}

export function setSectionProgress(projectId, sectionId, status, actor) {
  const allowed = new Set(['in_progress', 'rework']);
  if (!allowed.has(status)) throw new Error('不支持的进度状态');
  return tx(() => {
    const s = db.prepare('SELECT * FROM sections WHERE project_id = ? AND id = ?').get(projectId, sectionId);
    if (!s) throw new Error('区段不存在');
    if (!s.assignee_id) throw new Error('区段尚未分配制作员');
    if (s.status === 'submitted') throw new Error('区段正在送审中');
    db.prepare('UPDATE sections SET status = ? WHERE id = ?').run(status, sectionId);
    audit(projectId, actor, 'section_progress', `区段 ${s.code} → ${status}`);
    return true;
  });
}

/**
 * Maker submits a section for review. Runs the automated checks, snapshots the
 * open findings tied to that section, and records a submission row.
 */
export function submitSection(projectId, sectionId, makerId, note = '') {
  return tx(() => {
    const s = db.prepare('SELECT * FROM sections WHERE project_id = ? AND id = ?').get(projectId, sectionId);
    if (!s) throw new Error('区段不存在');
    if (s.status === 'submitted') throw new Error('区段已提交，等待审核');
    if (s.status === 'approved') throw new Error('区段已审核通过，如需修改请联系主管退回');
    if (!SUBMITTABLE.has(s.status)) throw new Error('区段尚未开始制作');
    if (makerId && s.assignee_id && s.assignee_id !== makerId) throw new Error('该区段未分配给当前制作员');

    const checkRun = runChecks(projectId, { actor: '系统质检' });
    const sectionIssues = listIssues(projectId, { status: 'open' }).filter((i) => i.section_id === sectionId);

    const round = (db.prepare(
      'SELECT MAX(round) AS r FROM submissions WHERE section_id = ?'
    ).get(sectionId).r || 0) + 1;
    db.prepare(
      `INSERT INTO submissions (project_id, section_id, maker_id, round, status, issue_snapshot, created_at)
       VALUES (?, ?, ?, ?, 'submitted', ?, ?)`
    ).run(projectId, sectionId, s.assignee_id || makerId || null, round, JSON.stringify(sectionIssues), nowIso());
    db.prepare("UPDATE sections SET status = 'submitted', submitted_at = ? WHERE id = ?").run(nowIso(), sectionId);
    audit(projectId, s.assignee_id ? '制作员' : '系统', 'submit_section',
      `区段 ${s.code} 第 ${round} 轮送审，自动质检 ${checkRun.created} 项新增问题${note ? `，备注：${note}` : ''}`);
    return { round, issues: sectionIssues, checkRun };
  });
}

/**
 * Manager decision on a submission.
 * approve → section approved; reject → status rework + rework_count++ + reason required.
 */
export function reviewSubmission(projectId, submissionId, decision, { reason = '', reviewerId = null, actor = '主管' } = {}) {
  if (decision !== 'approve' && decision !== 'reject') throw new Error('审核结论必须为通过或退回');
  if (decision === 'reject' && !String(reason).trim()) throw new Error('退回必须填写退回原因');

  return tx(() => {
    const sub = db.prepare(
      'SELECT * FROM submissions WHERE project_id = ? AND id = ?'
    ).get(projectId, submissionId);
    if (!sub) throw new Error('送审记录不存在');
    if (sub.status !== 'submitted') throw new Error('该送审记录已处理');
    const section = db.prepare('SELECT * FROM sections WHERE id = ?').get(sub.section_id);
    if (!section) throw new Error('区段不存在');

    if (decision === 'approve') {
      // Guards against locking a section that still carries open findings: the
      // maker can no longer touch an approved section, so the manager must
      // resolve or waive them first (which unblocks the delivery check).
      const stillOpen = db.prepare(
        "SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND section_id = ? AND status = 'open'"
      ).get(projectId, sub.section_id).n;
      if (stillOpen > 0) {
        throw Object.assign(
          new Error(`区段 ${section.code} 仍有 ${stillOpen} 项未处理问题，请先标整改或确认豁免后再通过`),
          { status: 409 },
        );
      }
      db.prepare(
        "UPDATE submissions SET status = 'approved', decided_at = ?, reviewer_id = ?, reason = ? WHERE id = ?"
      ).run(nowIso(), reviewerId, String(reason).trim(), submissionId);
      db.prepare("UPDATE sections SET status = 'approved', approved_at = ? WHERE id = ?")
        .run(nowIso(), sub.section_id);
      audit(projectId, actor, 'approve_section', `区段 ${section.code} 第 ${sub.round} 轮通过`);
    } else {
      const openIssues = listIssues(projectId, { status: 'open' });
      const unresolved = openIssues.filter((i) => i.section_id === sub.section_id);
      db.prepare(
        "UPDATE submissions SET status = 'rejected', decided_at = ?, reviewer_id = ?, reason = ? WHERE id = ?"
      ).run(nowIso(), reviewerId, String(reason).trim(), submissionId);
      db.prepare(
        "UPDATE sections SET status = 'rework', rework_count = rework_count + 1, submitted_at = NULL WHERE id = ?"
      ).run(sub.section_id);
      audit(projectId, actor, 'reject_section',
        `区段 ${section.code} 第 ${sub.round} 轮退回：${String(reason).trim()}（未整改问题 ${unresolved.length} 项）`);
    }
    return db.prepare('SELECT * FROM sections WHERE id = ?').get(sub.section_id);
  });
}

export function pendingSubmissions(projectId) {
  return db.prepare(
    `SELECT sub.*, s.code AS section_code, s.name AS section_name, s.bore_index,
            s.rework_count, u.name AS maker_name, u.initials AS maker_initials
     FROM submissions sub
     JOIN sections s ON s.id = sub.section_id
     LEFT JOIN users u ON u.id = sub.maker_id
     WHERE sub.project_id = ? AND sub.status = 'submitted'
     ORDER BY sub.created_at`
  ).all(projectId).map((r) => ({ ...r, issue_snapshot: JSON.parse(r.issue_snapshot || '[]') }));
}

export function submissionHistory(projectId, sectionId) {
  const rows = db.prepare(
    `SELECT sub.*, s.code AS section_code FROM submissions sub JOIN sections s ON s.id = sub.section_id
     WHERE sub.project_id = ? ${sectionId ? 'AND sub.section_id = ?' : ''}
     ORDER BY sub.created_at DESC`
  ).all(...(sectionId ? [projectId, sectionId] : [projectId]));
  return rows.map((r) => ({ ...r, issue_snapshot: JSON.parse(r.issue_snapshot || '[]') }));
}
