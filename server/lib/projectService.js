import { db, nowIso, tx, audit } from '../db.js';
import { buildSections, buildElements, fanBanks } from './generator.js';
import { boreLayout, KIND_INDEX, LAYER_KEYS, KINDS } from '../../shared/domain.js';

export function nextProjectCode() {
  const row = db.prepare("SELECT code FROM projects WHERE code LIKE 'TU-%' ORDER BY id DESC LIMIT 1").get();
  const n = row ? parseInt(row.code.slice(3), 10) + 1 : 1001;
  return `TU-${n}`;
}

export function createProjectOrder(input, actor = '客户端') {
  const now = nowIso();
  return tx(() => {
    const code = input.code || nextProjectCode();
    const seed = input.seed ?? (Math.floor(Math.random() * 2147483646) + 1);
    const info = db.prepare(
      `INSERT INTO projects (code, name, client_name, segment, length_m, lanes, bores, delivery_date,
        drawing_spec, status, notes, seed, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?, ?)`
    ).run(
      code, input.name, input.client_name, input.segment || '', input.length_m, input.lanes,
      input.bores || (input.lanes >= 4 ? 2 : 1),
      input.delivery_date, input.drawing_spec || 'A1', input.notes || '', seed, now
    );
    const projectId = info.lastInsertRowid;
    // `clean` orders start from defect-free template geometry (used by demo and
    // QA projects that should not contain deliberately seeded defects).
    materializeProject(projectId, { clean: input.clean === true });
    audit(projectId, actor, 'create_project', `${code} ${input.name}`);
    return projectRow(projectId);
  });
}

/** Generate sections + elements for a project that has none yet. */
export function materializeProject(projectId, opts = {}) {
  const project = projectRow(projectId);
  if (!project) throw new Error('项目不存在');
  const existing = db.prepare('SELECT COUNT(*) AS n FROM elements WHERE project_id = ?').get(projectId).n;
  if (existing > 0) return 0;

  const sections = buildSections(project);
  const { elements } = buildElements(project, sections, opts);

  return tx(() => {
    const insSection = db.prepare(
      `INSERT INTO sections (project_id, code, name, bore_index, start_m, end_m)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const byCode = new Map();
    for (const s of sections) {
      const info = insSection.run(projectId, s.code, s.name, s.bore_index, s.start_m, s.end_m);
      byCode.set(s.code, info.lastInsertRowid);
    }
    const ins = db.prepare(
      `INSERT INTO elements (project_id, section_id, layer, kind, code, model, bore_index,
        chainage, offset, angle_deg, mounted, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    elements.forEach((e, i) => {
      const sectionId = e.section_code ? byCode.get(e.section_code) ?? null : null;
      ins.run(projectId, sectionId, e.layer, e.kind, e.code, e.model, e.bore_index,
        e.chainage, e.offset, e.angle_deg, e.mounted, i);
    });
    linkNeighbours(projectId);
    return sections.length;
  });
}

/**
 * Set upstream/downstream neighbours: consecutive elements of the same kind on
 * the same bore, ordered by chainage.
 */
export function linkNeighbours(projectId) {
  const rows = db.prepare(
    `SELECT id, kind, bore_index, chainage FROM elements
     WHERE project_id = ? AND layer != 'anno'
     ORDER BY kind, bore_index, chainage, id`
  ).all(projectId);
  const setUpstream = db.prepare('UPDATE elements SET upstream_id = ? WHERE id = ?');
  const setDownstream = db.prepare('UPDATE elements SET downstream_id = ? WHERE id = ?');
  let groupKey = null;
  let prev = null;
  for (const r of rows) {
    const key = `${r.kind}:${r.bore_index}`;
    if (key !== groupKey) { groupKey = key; prev = null; }
    if (prev) {
      setUpstream.run(prev, r.id);   // r's upstream is the previous element
      setDownstream.run(r.id, prev); // previous element's downstream is r
    }
    prev = r.id;
  }
}

export function projectRow(projectId) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
}

export function sectionsWithWork(projectId) {
  const sections = db.prepare(
    `SELECT s.*, u.name AS assignee_name, u.initials AS assignee_initials,
       (SELECT COUNT(*) FROM elements e WHERE e.section_id = s.id) AS element_count,
       (SELECT COUNT(*) FROM issues i WHERE i.section_id = s.id AND i.status = 'open') AS open_issues,
       (SELECT COUNT(*) FROM submissions sub WHERE sub.section_id = s.id) AS submission_count
     FROM sections s LEFT JOIN users u ON u.id = s.assignee_id
     WHERE s.project_id = ? ORDER BY s.bore_index, s.start_m`
  ).all(projectId);
  const counts = db.prepare(
    `SELECT section_id, kind, COUNT(*) AS n FROM elements WHERE project_id = ? AND section_id IS NOT NULL
     GROUP BY section_id, kind`
  ).all(projectId);
  const bySec = new Map();
  for (const c of counts) {
    if (!bySec.has(c.section_id)) bySec.set(c.section_id, {});
    bySec.get(c.section_id)[c.kind] = c.n;
  }
  return sections.map((s) => ({ ...s, kinds: bySec.get(s.id) || {} }));
}

export function loadGeometry(projectId, { layerFilter } = {}) {
  const project = projectRow(projectId);
  if (!project) throw new Error('项目不存在');
  const layout = boreLayout(project);
  const rows = db.prepare(
    `SELECT id, section_id, layer, kind, bore_index, chainage, offset, angle_deg, mounted
     FROM elements WHERE project_id = ? ORDER BY id`
  ).all(projectId);
  const sections = db.prepare(
    'SELECT id, code, name, bore_index, start_m, end_m FROM sections WHERE project_id = ? ORDER BY bore_index, start_m'
  ).all(projectId);
  const secIndex = new Map(sections.map((s, i) => [s.id, i]));

  const keep = rows.filter((r) => !layerFilter || layerFilter.includes(r.layer));
  const n = keep.length;
  const ids = new Int32Array(n);
  const sectionIdx = new Int32Array(n);
  const kind = new Uint8Array(n);
  const layer = new Uint8Array(n);
  const flags = new Uint8Array(n);
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const ang = new Float32Array(n);
  const w = new Float32Array(n);
  const h = new Float32Array(n);

  keep.forEach((r, i) => {
    const k = KINDS[r.kind];
    ids[i] = r.id;
    sectionIdx[i] = r.section_id != null && secIndex.has(r.section_id) ? secIndex.get(r.section_id) : -1;
    kind[i] = KIND_INDEX[r.kind] ?? 0;
    layer[i] = Math.max(0, LAYER_KEYS.indexOf(r.layer));
    flags[i] = (r.mounted ? 1 : 0) | (r.layer === 'anno' ? 2 : 0);
    x[i] = r.chainage;
    y[i] = r.offset;
    ang[i] = r.angle_deg;
    w[i] = k ? k.w : 1;
    h[i] = k ? k.h : 1;
  });

  return {
    project: {
      id: project.id, code: project.code, name: project.name,
      length_m: project.length_m, lanes: project.lanes, bores: project.bores,
      drawing_spec: project.drawing_spec, status: project.status,
      delivery_date: project.delivery_date, client_name: project.client_name,
      segment: project.segment,
    },
    layout,
    sections,
    banks: fanBanks(keep),
    elements: { count: n, ids, sectionIdx, kind, layer, flags, x, y, ang, w, h },
  };
}

export function elementDetail(projectId, elementId) {
  const e = db.prepare(
    `SELECT e.*, s.code AS section_code, s.name AS section_name, s.start_m, s.end_m
     FROM elements e LEFT JOIN sections s ON s.id = e.section_id
     WHERE e.project_id = ? AND e.id = ?`
  ).get(projectId, elementId);
  if (!e) return null;
  const up = e.upstream_id
    ? db.prepare('SELECT id, code, kind, chainage FROM elements WHERE id = ?').get(e.upstream_id) : null;
  const down = e.downstream_id
    ? db.prepare('SELECT id, code, kind, chainage FROM elements WHERE id = ?').get(e.downstream_id) : null;
  const openIssues = db.prepare(
    `SELECT id, check_type, message FROM issues
     WHERE project_id = ? AND status = 'open' AND (',' || trim(element_ids, '[]') || ',') LIKE ?
     LIMIT 5`
  ).all(projectId, `%,${e.id},%`);
  return {
    ...e,
    kind_label: KINDS[e.kind]?.label || e.kind,
    layer_label: KINDS[e.kind]?.layer || e.layer,
    upstream: up, downstream: down,
    open_issues: openIssues,
    section_range: e.start_m != null
      ? `${Math.round(e.start_m)}–${Math.round(e.end_m)} m` : '—',
  };
}

export function searchElements(projectId, { sectionCode, kind, layer, q, onlyIssue, limit = 500 } = {}) {
  const where = ['e.project_id = ?'];
  const args = [projectId];
  if (sectionCode) { where.push('s.code = ?'); args.push(sectionCode); }
  if (kind) { where.push('e.kind = ?'); args.push(kind); }
  if (layer) { where.push('e.layer = ?'); args.push(layer); }
  if (q) {
    where.push('(e.code LIKE ? OR e.model LIKE ? OR s.code LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (onlyIssue) {
    where.push(`EXISTS (SELECT 1 FROM issues i WHERE i.project_id = e.project_id AND i.status = 'open'
      AND (',' || trim(i.element_ids, '[]') || ',') LIKE ('%,' || e.id || ',%'))`);
  }
  return db.prepare(
    `SELECT e.id, e.code, e.kind, e.layer, e.model, e.chainage, e.offset, e.mounted,
            s.code AS section_code, s.start_m, s.end_m,
            pe.code AS upstream_code, ne.code AS downstream_code
     FROM elements e
     LEFT JOIN sections s ON s.id = e.section_id
     LEFT JOIN elements pe ON pe.id = e.upstream_id
     LEFT JOIN elements ne ON ne.id = e.downstream_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.layer, e.kind, e.chainage
     LIMIT ${Math.min(2000, Math.max(1, Number(limit) || 500))}`
  ).all(...args);
}

export function bulkAssignSection(projectId, elementIds, sectionCode, actor) {
  const ids = [...new Set((elementIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length) throw new Error('未选择要素');
  const section = sectionCode
    ? db.prepare('SELECT * FROM sections WHERE project_id = ? AND code = ?').get(projectId, sectionCode)
    : null;
  if (sectionCode && !section) throw new Error(`区段 ${sectionCode} 不存在`);
  // Approved sections are locked: hanging elements onto them would smuggle
  // unresolved findings into a signed-off drawing.
  if (section && section.status === 'approved') {
    throw Object.assign(
      new Error(`区段 ${section.code} 已审核通过，需主管退回后才能修改要素`),
      { status: 409 },
    );
  }
  const targets = db.prepare(`SELECT DISTINCT section_id FROM elements
    WHERE project_id = ? AND id IN (${ids.join(',')}) AND section_id IS NOT NULL`).all(projectId);
  for (const t of targets) {
    const sec = t.section_id == null ? null : db.prepare('SELECT code, status FROM sections WHERE id = ?').get(t.section_id);
    if (sec && sec.status === 'approved') {
      throw Object.assign(
        new Error(`选中要素属于已通过区段 ${sec.code}，需主管退回后才能调整`),
        { status: 409 },
      );
    }
  }
  return tx(() => {
    const upd = db.prepare(
      'UPDATE elements SET section_id = ?, dirty = 1, updated_at = ? WHERE id = ? AND project_id = ?'
    );
    const now = nowIso();
    let changed = 0;
    for (const id of ids) changed += upd.run(section ? section.id : null, now, id, projectId).changes;
    audit(projectId, actor, 'bulk_assign_section', `${changed} 个要素 → 区段 ${sectionCode || '未挂接'}`);
    return changed;
  });
}

export function elementUpdate(projectId, elementId, patch, actor) {
  const e = db.prepare('SELECT * FROM elements WHERE project_id = ? AND id = ?').get(projectId, elementId);
  if (!e) throw new Error('要素不存在');
  if (e.section_id != null) {
    const sec = db.prepare('SELECT code, status FROM sections WHERE id = ?').get(e.section_id);
    if (sec && sec.status === 'approved') {
      throw Object.assign(
        new Error(`要素属于已通过区段 ${sec.code}，需主管退回后才能修改`),
        { status: 409 },
      );
    }
  }
  const allowed = ['code', 'model', 'chainage', 'offset', 'angle_deg', 'mounted', 'layer'];
  const fields = [];
  const vals = [];
  for (const k of allowed) {
    if (patch[k] !== undefined) { fields.push(`${k} = ?`); vals.push(patch[k]); }
  }
  if (patch.section_code !== undefined) {
    const s = patch.section_code
      ? db.prepare('SELECT id FROM sections WHERE project_id = ? AND code = ?').get(projectId, patch.section_code)
      : null;
    fields.push('section_id = ?');
    vals.push(s ? s.id : null);
  }
  if (!fields.length) return e;
  return tx(() => {
    db.prepare(`UPDATE elements SET ${fields.join(', ')}, dirty = 1, updated_at = ? WHERE id = ?`)
      .run(...vals, nowIso(), elementId);
    linkNeighbours(projectId);
    audit(projectId, actor, 'element_update', `#${elementId} ${JSON.stringify(patch).slice(0, 200)}`);
    return db.prepare('SELECT * FROM elements WHERE id = ?').get(elementId);
  });
}

export function projectSummary(projectId) {
  const project = projectRow(projectId);
  if (!project) return null;
  const sections = sectionsWithWork(projectId);
  const total = sections.length;
  const approved = sections.filter((s) => s.status === 'approved').length;
  const submitted = sections.filter((s) => s.status === 'submitted').length;
  const active = sections.filter((s) => ['in_progress', 'rework', 'assigned'].includes(s.status)).length;
  const todo = sections.filter((s) => s.status === 'todo').length;
  const rework = sections.reduce((a, s) => a + (s.rework_count || 0), 0);
  const openIssues = db.prepare(
    "SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND status = 'open'"
  ).get(projectId).n;
  const elCount = db.prepare('SELECT COUNT(*) AS n FROM elements WHERE project_id = ?').get(projectId).n;
  const today = new Date();
  const due = new Date(`${project.delivery_date}T23:59:59`);
  const daysLeft = Math.ceil((due - today) / 86400000);

  // Throughput model: 4 sections reviewed per working day, each rework loop costs 0.5 day.
  const remaining = total - approved;
  const estDays = Math.round((remaining / 4 + rework * 0.5) * 10) / 10;
  let risk = 'low';
  if (project.status === 'delivered') risk = 'done';
  else if (daysLeft < 0) risk = 'overdue';
  else if (daysLeft <= 2 || estDays > daysLeft) risk = 'high';
  else if (estDays > daysLeft * 0.6) risk = 'medium';

  return {
    ...project,
    total_sections: total,
    approved_sections: approved,
    submitted_sections: submitted,
    active_sections: active,
    todo_sections: todo,
    rework_count: rework,
    open_issues: openIssues,
    element_count: elCount,
    progress: total ? Math.round((approved / total) * 100) : 0,
    days_left: daysLeft,
    est_days: estDays,
    risk,
  };
}

export function listProjectSummaries() {
  const rows = db.prepare('SELECT id FROM projects ORDER BY id DESC').all();
  return rows.map((r) => projectSummary(r.id));
}
