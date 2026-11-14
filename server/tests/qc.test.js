import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = path.resolve('data', '_test');
process.env.DB_PATH = path.join(process.env.DATA_DIR, 'test.db');
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const { initSchema, db, tx } = await import('../db.js');
initSchema();
const { createProjectOrder, elementUpdate, bulkAssignSection } = await import('../lib/projectService.js');
const { runChecks, computeFindings } = await import('../lib/qc.js');
const { assignSections, submitSection, reviewSubmission } = await import('../lib/workflow.js');
const { buildDelivery } = await import('../lib/delivery.js');

/** Clear a section's open findings the way a manager would before signing off. */
function clearSectionIssues(projectId, sectionId) {
  db.prepare("UPDATE issues SET status='resolved', note='已整改' WHERE project_id=? AND section_id=? AND status='open'")
    .run(projectId, sectionId);
}

tx(() => {
  for (const u of [
    { name: '主管', role: 'manager', initials: 'ZG' },
    { name: '制作员甲', role: 'maker', initials: 'JIA' },
  ]) db.prepare('INSERT INTO users (name, role, initials) VALUES (?, ?, ?)').run(u.name, u.role, u.initials);
});

let codeSeq = 0;
function makeProject(seed = 42, opts = {}) {
  codeSeq++;
  return createProjectOrder({
    code: `TU-T${seed}-${codeSeq}`,
    name: `测试隧道 ${seed}`,
    client_name: '测试委托方',
    length_m: opts.length_m ?? 1200,
    lanes: 4,
    bores: 2,
    delivery_date: '2026-12-31',
    drawing_spec: 'A2',
    seed,
  });
}

test('fan spacing check flags pairs closer than 6.0 m and nothing else', () => {
  const p = makeProject(1001);
  const el = db.prepare(
    "SELECT id, chainage, offset, bore_index FROM elements WHERE project_id=? AND kind='jet_fan' ORDER BY bore_index, offset, chainage"
  ).all(p.id);
  const byLine = new Map();
  for (const e of el) {
    const k = `${e.bore_index}:${e.offset}`;
    if (!byLine.has(k)) byLine.set(k, []);
    byLine.get(k).push(e);
  }
  const { findings } = computeFindings(p.id);
  const spacing = findings.filter((f) => f.check_type === 'fan_spacing');
  assert.ok(spacing.length > 0, 'seed should include deliberately tight fan pairs');

  const byId = new Map(el.map((e) => [e.id, e]));
  for (const f of spacing) {
    const [a, b] = f.element_ids.map((id) => byId.get(id));
    const gap = Math.abs(b.chainage - a.chainage);
    assert.ok(gap < 6.0, `flagged pair must be under 6 m, got ${gap}`);
  }

  const flaggedPairs = new Set(spacing.map((f) => [...f.element_ids].sort((x, y) => x - y).join('-')));
  for (const list of byLine.values()) {
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].chainage - list[i - 1].chainage;
      const key = [list[i].id, list[i - 1].id].sort((x, y) => x - y).join('-');
      assert.equal(flaggedPairs.has(key), gap < 6.0,
        `pair at ${gap.toFixed(2)} m should ${gap < 6 ? '' : 'not '}be flagged`);
    }
  }
});

test('sensor check flags unmounted and unattached detectors', () => {
  const p = makeProject(1002);
  // Inject both defect variants explicitly: unmounted, and mounted but unattached.
  const pick = db.prepare(
    "SELECT id FROM elements WHERE project_id=? AND kind='co_sensor' ORDER BY id LIMIT 2"
  ).all(p.id);
  assert.equal(pick.length, 2, 'project should have at least two CO detectors');
  db.prepare('UPDATE elements SET mounted = 0 WHERE id = ?').run(pick[0].id);
  db.prepare('UPDATE elements SET section_id = NULL WHERE id = ?').run(pick[1].id);

  const { findings } = computeFindings(p.id);
  const sensor = findings.filter((f) => f.check_type === 'sensor_unmounted');
  assert.ok(sensor.length >= 2);
  const flagged = new Set(sensor.map((f) => f.element_ids[0]));
  assert.ok(flagged.has(pick[0].id), 'unmounted detector flagged');
  assert.ok(flagged.has(pick[1].id), 'unattached detector flagged');
  for (const f of sensor) {
    const row = db.prepare('SELECT mounted, section_id FROM elements WHERE id = ?').get(f.element_ids[0]);
    assert.ok(row.mounted !== 1 || row.section_id == null);
  }
  // Mounting a flagged detector clears its finding on the next run.
  // Fix every flagged detector; the check must then report none.
  for (const f of sensor) {
    db.prepare('UPDATE elements SET mounted = 1, section_id = COALESCE(section_id, 1) WHERE id = ?')
      .run(f.element_ids[0]);
  }
  const remaining = computeFindings(p.id).findings.filter((f) => f.check_type === 'sensor_unmounted');
  assert.equal(remaining.length, 0, 'findings should clear once mounted and attached');
});

test('duplicate section codes are detected, including 3+ duplicates', () => {
  const p = makeProject(1003);
  const secs = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY id LIMIT 3').all(p.id);
  db.prepare('UPDATE sections SET code = ? WHERE id = ?').run(secs[0].code, secs[1].id);
  db.prepare('UPDATE sections SET code = ? WHERE id = ?').run(secs[0].code, secs[2].id);
  const dup = computeFindings(p.id).findings.filter((f) => f.check_type === 'duplicate_section');
  assert.equal(dup.length, 1, 'one issue row per duplicated code');
  assert.equal(dup[0].element_ids.length, 3);
  assert.match(dup[0].message, /重复 3 次/);
});

test('check re-runs preserve waivers and supersede fixed defects', () => {
  const p = makeProject(1004);
  const first = runChecks(p.id, { actor: 'test' });
  assert.ok(first.created > 0);

  const open = db.prepare("SELECT * FROM issues WHERE project_id=? AND status='open' LIMIT 1").get(p.id);
  db.prepare("UPDATE issues SET status='waived', note='经复核豁免' WHERE id=?").run(open.id);

  const second = runChecks(p.id, { actor: 'test' });
  assert.equal(second.created, 0, 'identical defect set must not create new issues');
  const still = db.prepare('SELECT status, note FROM issues WHERE id = ?').get(open.id);
  assert.equal(still.status, 'waived', 'waiver must survive a re-run');
  assert.equal(still.note, '经复核豁免');

  const other = db.prepare(
    "SELECT * FROM issues WHERE project_id=? AND status='open' AND check_type='sensor_unmounted' LIMIT 1"
  ).get(p.id) || db.prepare(
    "SELECT * FROM issues WHERE project_id=? AND status='open' AND check_type='fan_spacing' LIMIT 1"
  ).get(p.id);
  assert.ok(other, 'project should have an issue to fix');
  if (other.check_type === 'sensor_unmounted') {
    const elementId = JSON.parse(other.element_ids)[0];
    db.prepare('UPDATE elements SET mounted = 1, section_id = COALESCE(section_id, 1) WHERE id = ?').run(elementId);
  } else {
    // Separate a too-close pair by moving the downstream fan well clear.
    const [a, b] = JSON.parse(other.element_ids);
    const down = db.prepare('SELECT chainage FROM elements WHERE id = ?').get(b);
    db.prepare('UPDATE elements SET chainage = chainage + 12 WHERE id = ?').run(b);
  }
  const third = runChecks(p.id, { actor: 'test' });
  assert.equal(db.prepare('SELECT status FROM issues WHERE id = ?').get(other.id).status, 'superseded');
  assert.ok(third.superseded >= 1);
});

test('submit → reject increments rework exactly once per rejection', async () => {
  const p = makeProject(1005);
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const sec = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id LIMIT 1').get(p.id);
  assignSections(p.id, [sec.id], maker.id, 'test');

  await submitSection(p.id, sec.id, maker.id, '首轮');
  let sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted'").get(sec.id);
  assert.ok(sub, 'submission row should be created');
  reviewSubmission(p.id, sub.id, 'reject', { reason: '标注不符' });
  let s = db.prepare('SELECT status, rework_count FROM sections WHERE id=?').get(sec.id);
  assert.equal(s.status, 'rework');
  assert.equal(s.rework_count, 1);

  await submitSection(p.id, sec.id, maker.id, '二轮');
  sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted' ORDER BY id DESC").get(sec.id);
  reviewSubmission(p.id, sub.id, 'reject', { reason: '仍有遗漏' });
  s = db.prepare('SELECT status, rework_count FROM sections WHERE id=?').get(sec.id);
  assert.equal(s.rework_count, 2);

  await submitSection(p.id, sec.id, maker.id, '三轮');
  sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted' ORDER BY id DESC").get(sec.id);
  clearSectionIssues(p.id, sec.id);
  reviewSubmission(p.id, sub.id, 'approve', { reason: '通过' });
  s = db.prepare('SELECT status, rework_count FROM sections WHERE id=?').get(sec.id);
  assert.equal(s.status, 'approved');
  assert.equal(s.rework_count, 2, 'approval must not change the rework counter');
});

test('a submission cannot be reviewed twice', async () => {
  const p = makeProject(1008);
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const sec = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id LIMIT 1').get(p.id);
  assignSections(p.id, [sec.id], maker.id, 'test');
  runChecks(p.id, { actor: 'test' });
  clearSectionIssues(p.id, sec.id);
  await submitSection(p.id, sec.id, maker.id, '');
  const sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted'").get(sec.id);
  reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' });
  assert.throws(() => reviewSubmission(p.id, sub.id, 'reject', { reason: 'x' }), /已处理/);
});

test('rejecting without a reason is refused', async () => {
  const p = makeProject(1006);
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const sec = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id LIMIT 1').get(p.id);
  assignSections(p.id, [sec.id], maker.id, 'test');
  await submitSection(p.id, sec.id, maker.id, '');
  const sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted'").get(sec.id);
  assert.throws(() => reviewSubmission(p.id, sub.id, 'reject', { reason: '   ' }), /必须填写退回原因/);
});

test('delivery package contains every promised artefact and is internally consistent', async () => {
  const p = makeProject(1007, { length_m: 900 });
  // Approve-all only yields a clean package when the template has no defects.
  db.prepare("UPDATE elements SET mounted = 1, section_id = COALESCE(section_id, (SELECT id FROM sections WHERE project_id = ? LIMIT 1)) WHERE project_id = ? AND kind IN ('co_sensor','vi_sensor')").run(p.id, p.id);
  const fanIds = db.prepare("SELECT id FROM elements WHERE project_id=? AND kind='jet_fan' ORDER BY bore_index, offset, chainage").all(p.id);
  // nudge every fan onto a 12 m grid so no pair is closer than 6 m
  const fixFan = db.prepare('UPDATE elements SET chainage = ? WHERE id = ?');
  fanIds.forEach((row, i) => fixFan.run(18 + i * 12.5, row.id));
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const secs = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id').all(p.id);
  assignSections(p.id, secs.map((s) => s.id), maker.id, 'test');
  for (const s of secs) {
    await submitSection(p.id, s.id, maker.id, '');
    const sub = db.prepare(
      "SELECT * FROM submissions WHERE section_id=? AND status='submitted' ORDER BY id DESC"
    ).get(s.id);
    clearSectionIssues(p.id, s.id);
    reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' });
  }

  const out = await buildDelivery(p.id, {});
  assert.ok(out.size_bytes > 1000);
  const names = out.files.map((f) => f.name);
  assert.ok(names.some((n) => n.endsWith('.dxf')), 'DXF present');
  assert.ok(names.some((n) => n.endsWith('.pdf')), 'PDF present');
  assert.ok(names.some((n) => n.includes('校验报告')), 'validation report present');
  assert.ok(names.some((n) => n.includes('区段要素清单')), 'section manifest present');
  assert.ok(names.some((n) => n.endsWith('.json')), 'delivery manifest present');

  const manifest = out.manifest;
  assert.equal(manifest.verdict, 'passed', 'all sections approved => clean package');
  for (const f of manifest.files) assert.match(f.checksum, /^[0-9a-f]{8}$/);
  assert.ok(manifest.section_manifest.length >= 2);

  // Re-open the ZIP and verify the DXF re-parses with the expected layers.
  const AdmZip = (await import('adm-zip')).default;
  const DxfParser = (await import('dxf-parser')).default;
  const zip = new AdmZip(path.join(process.env.DATA_DIR, 'deliveries', out.rel_path));
  const dxfEntry = zip.getEntries().find((e) => e.entryName.endsWith('全图层.dxf'));
  assert.ok(dxfEntry, 'combined DXF should be in the package');
  const parsed = new DxfParser().parseSync(dxfEntry.getData().toString('utf8'));
  assert.ok(parsed.entities.length > 10);
  const layers = Object.keys(parsed.tables.layer.layers);
  for (const l of ['HVAC', 'ELEC', 'CIVIL', 'ANNO']) assert.ok(layers.includes(l), `layer ${l}`);
  // Every element should appear as an entity or a block insert.
  assert.ok(parsed.entities.length >= 100);

  const pdfEntry = zip.getEntries().find((e) => e.entryName.endsWith('.pdf'));
  const pdf = pdfEntry.getData();
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.length > 5000);
});

test('delivery marks packages with unresolved defects in approved sections as blocked', async () => {
  const p = makeProject(1009, { length_m: 600 });
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const secs = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id').all(p.id);
  assignSections(p.id, secs.map((s) => s.id), maker.id, 'test');
  for (const s of secs) {
    await submitSection(p.id, s.id, maker.id, '');
    const sub = db.prepare(
      "SELECT * FROM submissions WHERE section_id=? AND status='submitted' ORDER BY id DESC"
    ).get(s.id);
    clearSectionIssues(p.id, s.id);
    reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' });
  }
  // Inject a defect after approval: an unmounted detector inside an approved section.
  const sensor = db.prepare(
    `SELECT e.id FROM elements e JOIN sections s ON s.id = e.section_id
     WHERE e.project_id = ? AND e.kind = 'co_sensor' AND s.status = 'approved' LIMIT 1`
  ).get(p.id);
  assert.ok(sensor, 'expected an approved section with a detector');
  db.prepare('UPDATE elements SET mounted = 0 WHERE id = ?').run(sensor.id);

  const out = await buildDelivery(p.id, {});
  assert.equal(out.manifest.verdict, 'blocked', 'unhandled defect in an approved section must block');
  assert.ok(out.manifest.blocking_issues >= 1);

  // Manager resolves the defect; the next package must pass. Persist the
  // findings first (the package itself compares live findings to issue rows).
  const check = runChecks(p.id, { actor: 'test' });
  assert.ok(check.findings.length > 0);
  const issue = db.prepare("SELECT * FROM issues WHERE project_id=? AND status='open' LIMIT 1").get(p.id);
  assert.ok(issue);
  db.prepare("UPDATE issues SET status='resolved', note='已整改' WHERE id=?").run(issue.id);
  const second = await buildDelivery(p.id, {});
  assert.equal(second.manifest.verdict, 'passed', 'resolved issues must not block');
  assert.equal(second.manifest.blocking_issues, 0);
});

test('a waiver recorded by the manager unblocks delivery', async () => {
  const p = makeProject(1010, { length_m: 400 });
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const secs = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id').all(p.id);
  assignSections(p.id, secs.map((s) => s.id), maker.id, 'test');
  for (const s of secs) {
    await submitSection(p.id, s.id, maker.id, '');
    const sub = db.prepare(
      "SELECT * FROM submissions WHERE section_id=? AND status='submitted' ORDER BY id DESC"
    ).get(s.id);
    clearSectionIssues(p.id, s.id);
    reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' });
  }
  // Inject a defect into an approved section so the first package must block.
  const sensor = db.prepare(
    `SELECT e.id FROM elements e JOIN sections s ON s.id = e.section_id
     WHERE e.project_id = ? AND e.kind = 'co_sensor' AND s.status = 'approved' LIMIT 1`
  ).get(p.id);
  assert.ok(sensor);
  db.prepare('UPDATE elements SET mounted = 0 WHERE id = ?').run(sensor.id);

  runChecks(p.id, { actor: 'test' });
  const first = await buildDelivery(p.id, {});
  assert.equal(first.manifest.verdict, 'blocked');
  const openIssues = db.prepare("SELECT * FROM issues WHERE project_id=? AND status='open'").all(p.id);
  assert.ok(openIssues.length > 0, 'expected seeded defects to be open');
  for (const issue of openIssues) {
    db.prepare("UPDATE issues SET status='waived', note='经现勘确认豁免' WHERE id=?").run(issue.id);
  }
  const second = await buildDelivery(p.id, {});
  assert.equal(second.manifest.verdict, 'passed');
  assert.equal(second.manifest.blocking_issues, 0);
});

test('approval is refused while the section still has open findings', async () => {
  const p = makeProject(1011);
  const maker = db.prepare("SELECT id FROM users WHERE role='maker'").get();
  const secs = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id').all(p.id);
  assignSections(p.id, [secs[0].id], maker.id, 'test');
  await submitSection(p.id, secs[0].id, maker.id, '');
  runChecks(p.id, { actor: 'test' });
  const sub = db.prepare("SELECT * FROM submissions WHERE section_id=? AND status='submitted'").get(secs[0].id);

  const open = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE project_id=? AND section_id=? AND status='open'")
    .get(p.id, secs[0].id).n;
  if (open > 0) {
    assert.throws(() => reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' }), /仍有 \d+ 项未处理问题/);
    clearSectionIssues(p.id, secs[0].id);
  }
  reviewSubmission(p.id, sub.id, 'approve', { reason: 'ok' });
  assert.equal(db.prepare('SELECT status FROM sections WHERE id=?').get(secs[0].id).status, 'approved');
});

test('approved sections are locked against element edits and re-hanging', async () => {
  const p = makeProject(1012);
  const sec = db.prepare('SELECT * FROM sections WHERE project_id=? ORDER BY id LIMIT 1').get(p.id);
  db.prepare("UPDATE sections SET status='approved' WHERE id=?").run(sec.id);
  const el = db.prepare('SELECT id, code FROM elements WHERE section_id=? LIMIT 1').get(sec.id);
  assert.ok(el);
  assert.throws(() => elementUpdate(p.id, el.id, { code: 'X-1' }, 'test'), /已审核通过|已通过区段/);
  const other = db.prepare('SELECT id FROM elements WHERE project_id=? AND section_id IS NULL LIMIT 1').get(p.id);
  if (other) {
    assert.throws(() => bulkAssignSection(p.id, [other.id], sec.code, 'test'), /已审核通过/);
  }
  // A non-approved section still accepts edits.
  const openSec = db.prepare("SELECT * FROM sections WHERE project_id=? AND status!='approved' ORDER BY id LIMIT 1").get(p.id);
  const openEl = db.prepare('SELECT id FROM elements WHERE section_id=? LIMIT 1').get(openSec.id);
  if (openEl) elementUpdate(p.id, openEl.id, { code: 'OK-1' }, 'test');
});
