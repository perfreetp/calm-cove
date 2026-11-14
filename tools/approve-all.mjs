// End-to-end: assign → submit → approve every section of a project over the HTTP
// API (the same calls the UI makes), then build and inspect a clean delivery.
const BASE = 'http://127.0.0.1:4173';
const ACTOR = encodeURIComponent('主管 周敏');

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-actor': ACTOR },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data?.error || ''}`);
  return data;
}

const projectId = Number(process.argv[2] || 3);
async function runChecks(pid) {
  return call('POST', `/api/projects/${pid}/checks`, {});
}
const meta = await call('GET', '/api/meta');
const maker = meta.users.find((u) => u.role === 'maker');
const sections = await call('GET', `/api/projects/${projectId}/sections`);

const todo = sections.filter((s) => s.status !== 'approved');
console.log(`project ${projectId}: ${sections.length} sections, ${todo.length} to approve`);

await call('POST', `/api/projects/${projectId}/sections/assign`, {
  sectionIds: todo.map((s) => s.id), makerId: maker.id,
});

// Sections cannot be approved while they still carry open findings, so clear
// the seeded defects first (a manager would mark them resolved or waived).
runChecks(projectId);
const issues = (await call('GET', `/api/projects/${projectId}/issues?status=open`)).issues;
console.log(`open issues before cleanup: ${issues.length}`);
for (const issue of issues) {
  await call('PATCH', `/api/projects/${projectId}/issues/${issue.id}`, {
    status: 'resolved', note: '已按设计复核整改',
  });
}

let approved = 0;
for (const s of todo) {
  await call('POST', `/api/projects/${projectId}/sections/${s.id}/submit`, { note: '最终送审' });
  const subs = await call('GET', `/api/projects/${projectId}/submissions`);
  const sub = subs.pending.find((x) => x.section_id === s.id);
  if (!sub) throw new Error(`no pending submission for ${s.code}`);
  await call('POST', `/api/projects/${projectId}/submissions/${sub.id}/review`, {
    decision: 'approve', reason: '图面完整，校验通过',
  });
  approved++;
}
console.log(`approved ${approved} sections`);

const built = await call('POST', `/api/projects/${projectId}/deliveries/build`, {});
console.log('package:', built.file_name, built.size_bytes, 'bytes');
console.log('verdict:', built.manifest.verdict, '| blocking:', built.manifest.blocking_issues);
console.log('files:', built.manifest.files.map((f) => `${f.name}(${f.size})`).join('\n       '));

const summary = (await call('GET', `/api/projects/${projectId}`)).summary;
console.log('summary:', JSON.stringify({
  approved: summary.approved_sections, total: summary.total_sections,
  progress: summary.progress, rework: summary.rework_count, risk: summary.risk,
  status: summary.status,
}));
