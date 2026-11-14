import express from 'express';
import cors from 'cors';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { db, initSchema, DB_PATH, DELIVERY_DIR, audit, nowIso } from './db.js';
import {
  createProjectOrder, materializeProject, projectRow, sectionsWithWork,
  loadGeometry, elementDetail, searchElements, bulkAssignSection, elementUpdate,
  projectSummary, listProjectSummaries, nextProjectCode,
} from './lib/projectService.js';
import { runChecks, listIssues, projectIssuesSummary } from './lib/qc.js';
import {
  assignSections, unassignSection, setSectionProgress, submitSection,
  reviewSubmission, pendingSubmissions, submissionHistory,
} from './lib/workflow.js';
import { buildDelivery, listDeliveries, deliveryDetail } from './lib/delivery.js';
import { LAYERS, LAYER_ORDER, KINDS, KIND_KEYS, ISSUE_TYPES, STATUS_LABELS, DRAWING_SPECS, ELEMENT_CSV_COLUMNS, boreLayout, formatChainage } from '../shared/domain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4173);
const STATIC_DIR = path.resolve(__dirname, '..', 'dist');

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '8mb' }));

initSchema();

// ---------- helpers ----------
const wrap = (fn) => (req, res) => {
  try {
    const out = fn(req, res);
    if (out && typeof out.then === 'function') out.catch((e) => sendError(res, e));
  } catch (e) { sendError(res, e); }
};
const sendError = (res, err) => {
  const status = err.status || 400;
  res.status(status).json({ error: err.message || String(err) });
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

const round2 = (v) => Math.round(v * 100) / 100;

const actorOf = (req) => {
  const raw = req.get('x-actor') || req.query.actor;
  if (!raw) return '系统';
  try { return decodeURIComponent(raw); } catch { return raw; }
};

function requireProject(req) {
  const id = Number(req.params.id);
  const p = projectRow(id);
  if (!p) throw httpError(404, '项目不存在');
  return p;
}

// ---------- meta ----------
app.get('/api/meta', wrap((req, res) => {
  res.json({
    layers: LAYERS,
    layerOrder: LAYER_ORDER,
    kinds: KINDS,
    kindKeys: KIND_KEYS,
    issueTypes: ISSUE_TYPES,
    statusLabels: STATUS_LABELS,
    drawingSpecs: DRAWING_SPECS,
    users: db.prepare('SELECT id, name, role, initials FROM users ORDER BY id').all(),
    nextProjectCode: nextProjectCode(),
  });
}));

app.get('/api/users', wrap((req, res) => {
  res.json(db.prepare('SELECT id, name, role, initials FROM users ORDER BY role, id').all());
}));

// ---------- projects ----------
app.get('/api/projects', wrap((req, res) => {
  res.json(listProjectSummaries());
}));

app.post('/api/projects', wrap((req, res) => {
  const b = req.body || {};
  const errors = [];
  if (!String(b.name || '').trim()) errors.push('项目名称必填');
  if (!String(b.client_name || '').trim()) errors.push('委托单位必填');
  const lengthOk = b.length_m !== '' && b.length_m != null && Number(b.length_m) > 0;
  if (!lengthOk) errors.push('隧道长度必须大于 0');
  if (lengthOk && (Number(b.length_m) < 100 || Number(b.length_m) > 40000)) {
    errors.push('隧道长度需在 100–40000 m 之间');
  }
  if (![2, 4, 6].includes(Number(b.lanes))) errors.push('车道数必须为 2 / 4 / 6');
  if (!b.delivery_date || Number.isNaN(Date.parse(b.delivery_date))) errors.push('交付日期无效');
  const spec = b.drawing_spec || 'A1';
  if (!DRAWING_SPECS.includes(spec)) errors.push('图纸规格无效');
  if (errors.length) throw httpError(422, errors.join('；'));

  const project = createProjectOrder({
    name: String(b.name).trim(),
    client_name: String(b.client_name).trim(),
    segment: String(b.segment || '').trim(),
    length_m: Number(b.length_m),
    lanes: Number(b.lanes),
    bores: Number(b.bores) || (Number(b.lanes) >= 4 ? 2 : 1),
    delivery_date: b.delivery_date,
    drawing_spec: spec,
    notes: String(b.notes || ''),
  }, actorOf(req));
  runChecks(project.id, { actor: '系统质检' });
  res.status(201).json(projectSummary(project.id));
}));

app.get('/api/projects/:id', wrap((req, res) => {
  requireProject(req);
  const id = Number(req.params.id);
  res.json({
    summary: projectSummary(id),
    makers: db.prepare("SELECT id, name, initials FROM users WHERE role = 'maker' ORDER BY id").all(),
    sections: sectionsWithWork(id),
    issues: listIssues(id, { status: 'active' }),
    issueSummary: projectIssuesSummary(id),
    pending: pendingSubmissions(id),
    deliveries: listDeliveries(id),
    submissions: submissionHistory(id),
  });
}));

app.get('/api/projects/:id/geometry', wrap((req, res) => {
  requireProject(req);
  const layerFilter = req.query.layers ? String(req.query.layers).split(',').filter(Boolean) : null;
  const geo = loadGeometry(Number(req.params.id), { layerFilter });
  const { count, ids, sectionIdx, kind, layer, flags, x, y, ang, w, h } = geo.elements;
  // JSON twin of the binary feed: arrays become plain lists and `count` is explicit.
  res.json({
    ...geo,
    elements: {
      count,
      ids: Array.from(ids),
      sectionIdx: Array.from(sectionIdx),
      kind: Array.from(kind),
      layer: Array.from(layer),
      flags: Array.from(flags),
      x: Array.from(x).map(round2),
      y: Array.from(y).map(round2),
      ang: Array.from(ang),
      w: Array.from(w),
      h: Array.from(h),
    },
  });
}));

// Binary geometry feed: one JSON header + typed arrays for very large projects.
// Each array is padded to a 4-byte boundary and its byte offset is published in
// the header, so typed-array views stay aligned regardless of element width.
app.get('/api/projects/:id/geometry.bin', wrap((req, res) => {
  requireProject(req);
  const layerFilter = req.query.layers ? String(req.query.layers).split(',').filter(Boolean) : null;
  const geo = loadGeometry(Number(req.params.id), { layerFilter });
  const e = geo.elements;
  const arrays = [
    ['ids', e.ids], ['sectionIdx', e.sectionIdx], ['kind', e.kind], ['layer', e.layer],
    ['flags', e.flags], ['x', e.x], ['y', e.y], ['ang', e.ang], ['w', e.w], ['h', e.h],
  ];
  const layout = {};
  let payloadBytes = 0;
  for (const [name, arr] of arrays) {
    const bytes = arr.byteLength;
    const pad = (4 - (payloadBytes % 4)) % 4;
    payloadBytes += pad;
    layout[name] = payloadBytes;
    payloadBytes += bytes;
  }
  const header = {
    count: e.count,
    layout: geo.layout,
    project: geo.project,
    sections: geo.sections,
    banks: geo.banks,
    offsets: layout,
    payloadBytes,
  };
  const headerJson = Buffer.from(JSON.stringify(header), 'utf8');
  const headerPadded = Math.ceil(headerJson.length / 4) * 4;
  const headerBuf = Buffer.alloc(headerPadded, 0x20);
  headerJson.copy(headerBuf);

  const head = Buffer.alloc(4);
  head.writeUInt32LE(headerPadded, 0);
  const payload = Buffer.alloc(payloadBytes);
  for (const [name, arr] of arrays) {
    Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength).copy(payload, layout[name]);
  }
  res.set({
    'Content-Type': 'application/octet-stream',
    'X-Geometry-Count': String(e.count),
    'X-Geometry-Header-Bytes': String(headerPadded),
    'Cache-Control': 'no-store',
  });
  res.end(Buffer.concat([head, headerBuf, payload]));
}));

app.get('/api/projects/:id/sections', wrap((req, res) => {
  requireProject(req);
  res.json(sectionsWithWork(Number(req.params.id)));
}));

app.get('/api/projects/:id/issues', wrap((req, res) => {
  requireProject(req);
  res.json({
    issues: listIssues(Number(req.params.id), {
      status: req.query.status || 'active',
      type: req.query.type || undefined,
      sectionId: req.query.sectionId ? Number(req.query.sectionId) : undefined,
    }),
    summary: projectIssuesSummary(Number(req.params.id)),
  });
}));

app.post('/api/projects/:id/checks', wrap((req, res) => {
  requireProject(req);
  const result = runChecks(Number(req.params.id), { actor: actorOf(req) });
  res.json({
    ...result,
    summary: projectIssuesSummary(Number(req.params.id)),
    issues: listIssues(Number(req.params.id), { status: 'active' }),
  });
}));

app.patch('/api/projects/:id/issues/:issueId', wrap((req, res) => {
  requireProject(req);
  const status = req.body?.status;
  if (!['waived', 'resolved', 'open'].includes(status)) throw httpError(422, '不支持的问题状态');
  if (status === 'waived' && !String(req.body?.note || '').trim()) {
    throw httpError(422, '确认豁免必须填写说明');
  }
  const issue = db.prepare('SELECT * FROM issues WHERE project_id = ? AND id = ?')
    .get(Number(req.params.id), Number(req.params.issueId));
  if (!issue) throw httpError(404, '问题不存在');
  db.prepare('UPDATE issues SET status = ?, note = ?, updated_at = ? WHERE id = ?')
    .run(status, String(req.body?.note || ''), nowIso(), issue.id);
  audit(Number(req.params.id), actorOf(req), 'issue_status', `#${issue.id} → ${status}`);
  res.json({ ok: true, issues: listIssues(Number(req.params.id), { status: 'active' }) });
}));

// ---------- elements ----------
app.get('/api/projects/:id/elements/search', wrap((req, res) => {
  requireProject(req);
  res.json(searchElements(Number(req.params.id), {
    sectionCode: req.query.section || undefined,
    kind: req.query.kind || undefined,
    layer: req.query.layer || undefined,
    q: req.query.q || undefined,
    onlyIssue: req.query.onlyIssue === '1',
    limit: req.query.limit || 500,
  }));
}));

app.get('/api/projects/:id/elements/:elementId', wrap((req, res) => {
  requireProject(req);
  const detail = elementDetail(Number(req.params.id), Number(req.params.elementId));
  if (!detail) throw httpError(404, '要素不存在');
  res.json(detail);
}));

app.patch('/api/projects/:id/elements/:elementId', wrap((req, res) => {
  requireProject(req);
  const updated = elementUpdate(
    Number(req.params.id), Number(req.params.elementId), req.body || {}, actorOf(req),
  );
  res.json(elementDetail(Number(req.params.id), updated.id));
}));

app.post('/api/projects/:id/elements/bulk-section', wrap((req, res) => {
  requireProject(req);
  const { elementIds, sectionCode } = req.body || {};
  if (!Array.isArray(elementIds) || !elementIds.length) throw httpError(422, '未选择要素');
  const n = bulkAssignSection(Number(req.params.id), elementIds, sectionCode ?? null, actorOf(req));
  res.json({ changed: n, sections: sectionsWithWork(Number(req.params.id)) });
}));

// ---------- sections / workflow ----------
app.post('/api/projects/:id/sections/assign', wrap((req, res) => {
  requireProject(req);
  const { sectionIds, makerId } = req.body || {};
  if (!Array.isArray(sectionIds) || !sectionIds.length) throw httpError(422, '未选择区段');
  const n = assignSections(Number(req.params.id), sectionIds, Number(makerId), actorOf(req));
  res.json({ assigned: n, sections: sectionsWithWork(Number(req.params.id)) });
}));

app.post('/api/projects/:id/sections/:sectionId/unassign', wrap((req, res) => {
  requireProject(req);
  unassignSection(Number(req.params.id), Number(req.params.sectionId), actorOf(req));
  res.json({ sections: sectionsWithWork(Number(req.params.id)) });
}));

app.post('/api/projects/:id/sections/:sectionId/progress', wrap((req, res) => {
  requireProject(req);
  setSectionProgress(Number(req.params.id), Number(req.params.sectionId), req.body?.status, actorOf(req));
  res.json({ sections: sectionsWithWork(Number(req.params.id)) });
}));

app.post('/api/projects/:id/sections/:sectionId/submit', wrap((req, res) => {
  requireProject(req);
  const out = submitSection(
    Number(req.params.id), Number(req.params.sectionId),
    req.body?.makerId ? Number(req.body.makerId) : null, String(req.body?.note || ''),
  );
  res.json({
    ...out,
    sections: sectionsWithWork(Number(req.params.id)),
    pending: pendingSubmissions(Number(req.params.id)),
    issues: listIssues(Number(req.params.id), { status: 'active' }),
  });
}));

app.post('/api/projects/:id/submissions/:submissionId/review', wrap((req, res) => {
  requireProject(req);
  const { decision, reason } = req.body || {};
  const section = reviewSubmission(Number(req.params.id), Number(req.params.submissionId), decision, {
    reason, reviewerId: req.body?.reviewerId ? Number(req.body.reviewerId) : null, actor: actorOf(req),
  });
  res.json({
    section,
    sections: sectionsWithWork(Number(req.params.id)),
    pending: pendingSubmissions(Number(req.params.id)),
    submissions: submissionHistory(Number(req.params.id)),
  });
}));

app.get('/api/projects/:id/submissions', wrap((req, res) => {
  requireProject(req);
  res.json({
    pending: pendingSubmissions(Number(req.params.id)),
    history: submissionHistory(Number(req.params.id), req.query.sectionId ? Number(req.query.sectionId) : undefined),
  });
}));

// ---------- deliveries ----------
app.post('/api/projects/:id/deliveries/build', wrap(async (req, res) => {
  requireProject(req);
  const out = await buildDelivery(Number(req.params.id), {
    actor: actorOf(req), spec: req.body?.spec,
  });
  res.status(201).json({ ...out, deliveries: listDeliveries(Number(req.params.id)) });
}));

app.get('/api/projects/:id/deliveries', wrap((req, res) => {
  requireProject(req);
  res.json(listDeliveries(Number(req.params.id)));
}));

app.get('/api/projects/:id/deliveries/:deliveryId', wrap((req, res) => {
  requireProject(req);
  const d = deliveryDetail(Number(req.params.id), Number(req.params.deliveryId));
  if (!d) throw httpError(404, '交付包不存在');
  res.json(d);
}));

app.get('/api/projects/:id/deliveries/:deliveryId/download', wrap((req, res) => {
  requireProject(req);
  const d = deliveryDetail(Number(req.params.id), Number(req.params.deliveryId));
  if (!d) throw httpError(404, '交付包不存在');
  const abs = path.join(DELIVERY_DIR, d.rel_path);
  if (!fs.existsSync(abs)) throw httpError(410, '交付包文件已丢失，请重新生成');
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(d.file_name)}`);
  fs.createReadStream(abs).pipe(res);
}));

// In-package search: query the element index of a delivery package directly.
app.get('/api/projects/:id/deliveries/:deliveryId/search', wrap((req, res) => {
  requireProject(req);
  const d = deliveryDetail(Number(req.params.id), Number(req.params.deliveryId));
  if (!d) throw httpError(404, '交付包不存在');
  const section = req.query.section || '';
  const q = req.query.q || '';
  const manifest = d.manifest;
  const rows = searchElements(Number(req.params.id), {
    sectionCode: section || undefined,
    q: q || undefined,
    limit: Number(req.query.limit) || 1000,
  });
  res.json({
    delivery: { id: d.id, file_name: d.file_name, created_at: d.created_at, qc_id: manifest.qc_id, verdict: manifest.verdict },
    sections: manifest.section_manifest.filter((m) => !section || m.code === section),
    elements: rows,
    total: rows.length,
  });
}));

// ---------- dashboard ----------
app.get('/api/dashboard', wrap((req, res) => {
  const summaries = listProjectSummaries();
  const totals = summaries.reduce((a, p) => ({
    projects: a.projects + 1,
    elements: a.elements + p.element_count,
    sections: a.sections + p.total_sections,
    approved: a.approved + p.approved_sections,
    rework: a.rework + p.rework_count,
    issues: a.issues + p.open_issues,
    atRisk: a.atRisk + (['high', 'overdue'].includes(p.risk) ? 1 : 0),
    overdue: a.overdue + (p.risk === 'overdue' ? 1 : 0),
  }), { projects: 0, elements: 0, sections: 0, approved: 0, rework: 0, issues: 0, atRisk: 0, overdue: 0 });
  const recentAudit = db.prepare(
    `SELECT a.*, p.code AS project_code FROM audit a LEFT JOIN projects p ON p.id = a.project_id
     ORDER BY a.id DESC LIMIT 12`
  ).all();
  res.json({ projects: summaries, totals, recentAudit });
}));

app.get('/api/audit', wrap((req, res) => {
  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const rows = projectId
    ? db.prepare('SELECT * FROM audit WHERE project_id = ? ORDER BY id DESC LIMIT 200').all(projectId)
    : db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 200').all();
  res.json(rows);
}));

// ---------- static build ----------
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: '接口不存在' }));

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT} (db: ${DB_PATH})`);
  });
}

export default app;
