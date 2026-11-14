import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = path.resolve('data', '_test_api');
process.env.DB_PATH = path.join(process.env.DATA_DIR, 'api.db');
process.env.NODE_ENV = 'test';
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });

const { default: app } = await import('../index.js');
const { db } = await import('../db.js');

let server;
let base;

before(async () => {
  db.prepare("INSERT INTO users (name, role, initials) VALUES ('主管 周敏','manager','ZM')").run();
  db.prepare("INSERT INTO users (name, role, initials) VALUES ('制作员 陈昊','maker','CH')").run();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server?.close());

const req = async (method, url, body, headers = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) data = await res.json();
  return { status: res.status, data, res };
};

test('meta exposes layers, kinds and drawing specs', async () => {
  const { status, data } = await req('GET', '/api/meta');
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(data.layers).sort(), ['anno', 'civil', 'elec', 'hvac']);
  assert.ok(data.kindKeys.includes('jet_fan'));
  assert.deepEqual(data.drawingSpecs, ['A0', 'A1', 'A2', 'A3']);
  assert.equal(data.users.length, 2);
});

test('project creation validates every required field', async () => {
  const bad = [
    [{}, /项目名称/],
    [{ name: 'x', client_name: 'y', length_m: 0, lanes: 4, delivery_date: '2026-12-01' }, /长度/],
    [{ name: 'x', client_name: 'y', length_m: 500, lanes: 3, delivery_date: '2026-12-01' }, /车道数/],
    [{ name: 'x', client_name: 'y', length_m: 500, lanes: 4, delivery_date: 'not-a-date' }, /交付日期/],
    [{ name: 'x', client_name: 'y', length_m: 500, lanes: 4, delivery_date: '2026-12-01', drawing_spec: 'B9' }, /图纸规格/],
  ];
  for (const [body, pattern] of bad) {
    const r = await req('POST', '/api/projects', body);
    assert.equal(r.status, 422, JSON.stringify(body));
    assert.match(r.data.error, pattern);
  }
});

test('creating an order materializes sections and elements, and geometry is coherent', async () => {
  const { status, data: project } = await req('POST', '/api/projects', {
    name: '接口测试隧道', client_name: '测试单位', segment: 'K0+000 ~ K1+500',
    length_m: 1500, lanes: 4, delivery_date: '2026-12-20', drawing_spec: 'A2', seed: 5150,
  });
  assert.equal(status, 201);
  assert.match(project.code, /^TU-\d+$/);
  assert.ok(project.total_sections >= 12);
  assert.ok(project.element_count > 1000);

  const geo = await req('GET', `/api/projects/${project.id}/geometry`);
  assert.equal(geo.status, 200);
  const g = geo.data;
  assert.equal(g.elements.count, project.element_count);
  assert.equal(g.elements.x.length, g.elements.count);
  assert.equal(new Set(g.sections.map((s) => s.code)).size, g.sections.length, 'section codes unique');
  assert.ok(g.banks.length > 0, 'fan banks reported');
  // Every element lies inside the tunnel envelope.
  for (let i = 0; i < g.elements.count; i++) {
    assert.ok(g.elements.x[i] >= 0 && g.elements.x[i] <= 1500);
  }
});

test('binary geometry feed round-trips the same element count with aligned arrays', async () => {
  const projects = await req('GET', '/api/projects');
  const p = projects.data.find((x) => x.name === '接口测试隧道');
  const res = await fetch(`${base}/api/projects/${p.id}/geometry.bin`);
  assert.equal(res.status, 200);
  const buf = await res.arrayBuffer();
  const headerLen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headerLen)).trim());
  assert.equal(header.count, p.element_count);
  const base0 = 4 + headerLen;
  const F32 = ['x', 'y', 'ang', 'w', 'h'];
  for (const [name, off] of Object.entries(header.offsets)) {
    assert.equal((base0 + off) % 4, 0, `${name} must start 4-byte aligned`);
  }
  const xs = new Float32Array(buf, base0 + header.offsets.x, header.count);
  assert.equal(xs.length, header.count);
  assert.ok(xs.every((v) => Number.isFinite(v)));
});

test('element detail reports section, neighbours and issue links', async () => {
  const projects = await req('GET', '/api/projects');
  const p = projects.data.find((x) => x.name === '接口测试隧道');
  const search = await req('GET', `/api/projects/${p.id}/elements/search?kind=jet_fan&limit=5`);
  assert.equal(search.status, 200);
  assert.equal(search.data.length, 5);
  // The first fan on each bore line has no upstream, so scan for a mid-chain one.
  const details = [];
  for (const row of search.data) {
    const { data } = await req('GET', `/api/projects/${p.id}/elements/${row.id}`);
    details.push(data);
  }
  const detail = details.find((d) => d.upstream && d.downstream) || details[0];
  assert.equal(detail.kind, 'jet_fan');
  assert.ok(detail.section_code, 'fan should belong to a section');
  assert.ok(detail.upstream || detail.downstream, 'adjacency should be linked');
  for (const d of details) {
    if (d.upstream) assert.notEqual(d.upstream.id, d.id, 'no self-reference upstream');
    if (d.downstream) assert.notEqual(d.downstream.id, d.id, 'no self-reference downstream');
  }
  const withBoth = details.find((d) => d.upstream && d.downstream);
  assert.ok(withBoth, 'at least one sampled fan should have both neighbours');
  assert.ok(withBoth.downstream.chainage >= withBoth.chainage, 'downstream follows chainage');
  assert.ok(withBoth.upstream.chainage <= withBoth.chainage, 'upstream precedes chainage');
});

test('bulk section reassignment changes only the named elements', async () => {
  const projects = await req('GET', '/api/projects');
  const p = projects.data.find((x) => x.name === '接口测试隧道');
  const secs = (await req('GET', `/api/projects/${p.id}/sections`)).data;
  const targetSec = secs.find((s) => s.code === 'Y01');
  const ids = (await req('GET', `/api/projects/${p.id}/elements/search?section=Z02&limit=6`)).data.map((e) => e.id);
  assert.ok(ids.length > 0);

  const { status, data } = await req('POST', `/api/projects/${p.id}/elements/bulk-section`, {
    elementIds: ids, sectionCode: targetSec.code,
  });
  assert.equal(status, 200);
  assert.equal(data.changed, ids.length);
  for (const id of ids) {
    const row = db.prepare('SELECT section_id FROM elements WHERE id = ?').get(id);
    assert.equal(row.section_id, targetSec.id);
  }
});

test('checks endpoint returns issues grouped by the three rule types', async () => {
  const projects = await req('GET', '/api/projects');
  const p = projects.data.find((x) => x.name === '接口测试隧道');
  const { status, data } = await req('POST', `/api/projects/${p.id}/checks`, {});
  assert.equal(status, 200);
  assert.ok(Array.isArray(data.issues));
  const types = new Set(data.issues.map((i) => i.check_type));
  for (const t of types) assert.ok(['fan_spacing', 'sensor_unmounted', 'duplicate_section'].includes(t));
  // Waiving requires a note.
  const issue = data.issues[0];
  if (issue) {
    const noNote = await req('PATCH', `/api/projects/${p.id}/issues/${issue.id}`, { status: 'waived' });
    assert.equal(noNote.status, 422);
    const ok = await req('PATCH', `/api/projects/${p.id}/issues/${issue.id}`, {
      status: 'waived', note: '现场复核确认',
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.data.issues.find((i) => i.id === issue.id).status === 'waived');
  }
});

test('full review cycle drives the dashboard risk and rework counters', async () => {
  const { data: created } = await req('POST', '/api/projects', {
    name: '流转测试隧道', client_name: '测试单位', length_m: 900, lanes: 2,
    delivery_date: '2026-12-01', drawing_spec: 'A3', seed: 909,
  }, { 'x-actor': encodeURIComponent('主管 周敏') });

  const sections = (await req('GET', `/api/projects/${created.id}/sections`)).data;
  const makers = (await req('GET', '/api/meta')).data.users.filter((u) => u.role === 'maker');
  const target = sections[0];

  const assign = await req('POST', `/api/projects/${created.id}/sections/assign`, {
    sectionIds: [target.id], makerId: makers[0].id,
  });
  assert.equal(assign.status, 200);
  assert.equal(assign.data.assigned, 1);

  const submit = await req('POST', `/api/projects/${created.id}/sections/${target.id}/submit`, { note: '送审' });
  assert.equal(submit.status, 200);
  const pending = submit.data.pending;
  assert.equal(pending.length, 1);

  const rejected = await req('POST', `/api/projects/${created.id}/submissions/${pending[0].id}/review`, {
    decision: 'reject', reason: '标注与断面不符',
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.section.rework_count, 1);

  const summary = (await req('GET', `/api/projects/${created.id}`)).data.summary;
  assert.equal(summary.rework_count, 1);

  const dash = (await req('GET', '/api/dashboard')).data;
  const row = dash.projects.find((p) => p.id === created.id);
  assert.ok(row);
  assert.equal(row.rework_count, 1);
  assert.ok(['low', 'medium', 'high', 'overdue'].includes(row.risk));
});

test('unknown project and element return 404', async () => {
  assert.equal((await req('GET', '/api/projects/99999')).status, 404);
  assert.equal((await req('GET', '/api/projects/99999/elements/1')).status, 404);
  assert.equal((await req('GET', '/api/nope')).status, 404);
});

test('delivery build + in-package search returns the section index', async () => {
  const projects = await req('GET', '/api/projects');
  const p = projects.data.find((x) => x.name === '接口测试隧道');
  const build = await req('POST', `/api/projects/${p.id}/deliveries/build`, {});
  assert.equal(build.status, 201);
  assert.ok(build.data.files.length >= 6);

  const found = await req('GET', `/api/projects/${p.id}/deliveries/${build.data.id}/search?section=Y01`);
  assert.equal(found.status, 200);
  assert.ok(found.data.sections.length === 1);
  assert.equal(found.data.sections[0].code, 'Y01');
  assert.ok(found.data.elements.every((e) => e.section_code === 'Y01'));

  const download = await fetch(`${base}/api/projects/${p.id}/deliveries/${build.data.id}/download`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/zip');
  const zipBuf = Buffer.from(await download.arrayBuffer());
  assert.equal(zipBuf.subarray(0, 2).toString('latin1'), 'PK');
  assert.ok(zipBuf.length > 10_000);
});
