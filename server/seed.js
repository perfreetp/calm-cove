// Seeds a demo workspace: one large project with several thousand elements,
// a second mid-size project, users, assignments, and a review in flight.
import { db, initSchema, tx, nowIso } from './db.js';
import { createProjectOrder, materializeProject, projectRow } from './lib/projectService.js';
import { assignSections, submitSection, reviewSubmission } from './lib/workflow.js';
import { runChecks } from './lib/qc.js';

initSchema();

const reset = process.argv.includes('--reset');
if (reset) {
  tx(() => {
    for (const t of ['audit', 'deliveries', 'submissions', 'issues', 'elements', 'sections', 'projects', 'users']) {
      db.exec(`DELETE FROM ${t}`);
    }
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('audit','deliveries','submissions','issues','elements','sections','projects','users')");
  });
} else {
  const n = db.prepare('SELECT COUNT(*) AS n FROM projects').get().n;
  if (n > 0) { console.log('已有数据，跳过种子（使用 npm run seed 重置）'); process.exit(0); }
}

const USERS = [
  { name: '周敏', role: 'manager', initials: 'ZM' },
  { name: '陈昊', role: 'maker', initials: 'CH' },
  { name: '李雨桐', role: 'maker', initials: 'LY' },
  { name: '王铎', role: 'maker', initials: 'WD' },
  { name: '华南隧道建设集团', role: 'client', initials: 'CL' },
];

tx(() => {
  for (const u of USERS) {
    db.prepare('INSERT INTO users (name, role, initials) VALUES (?, ?, ?)').run(u.name, u.role, u.initials);
  }
});

const makers = db.prepare("SELECT * FROM users WHERE role='maker' ORDER BY id").all();
const today = new Date();
const plus = (d) => {
  const t = new Date(today);
  t.setDate(t.getDate() + d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

console.log('生成项目 A（长隧道，双洞）…');
const pA = createProjectOrder({
  code: 'TU-1001',
  name: '云岭特长隧道机电通风系统图档',
  client_name: '华南隧道建设集团',
  segment: 'K12+000 ~ K20+500',
  length_m: 8500,
  lanes: 4,
  bores: 2,
  delivery_date: plus(9),
  drawing_spec: 'A1',
  notes: '含射流风机纵向通风、风机房、CO/VI 检测与区段标注；图纸需按 A1 幅面出图。',
  seed: 20241114,
});

console.log('生成项目 B（中长隧道，单洞）…');
const pB = createProjectOrder({
  code: 'TU-1002',
  name: '凤凰山隧道通风系统图档',
  client_name: '省交通规划设计院',
  segment: 'K3+200 ~ K7+400',
  length_m: 4200,
  lanes: 2,
  bores: 1,
  delivery_date: plus(2),
  drawing_spec: 'A2',
  notes: '单洞双向，重点核对传感器挂接与区段编号。',
  seed: 777001,
});

console.log('生成项目 C（超期风险演示）…');
const pC = createProjectOrder({
  code: 'TU-1003',
  name: '城南快速路隧道通风系统图档',
  client_name: '市城建投资有限公司',
  segment: 'K0+000 ~ K2+600',
  length_m: 2600,
  lanes: 6,
  bores: 2,
  delivery_date: plus(-1),
  drawing_spec: 'A0',
  notes: '工期紧张，需重点跟踪返工。',
  seed: 424242,
});

function seedWorkflow(projectId, { assignRatio = 0.75, approveRatio = 0.35, submitRatio = 0.25, reworks = 3 } = {}) {
  const sections = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY bore_index, start_m').all(projectId);
  const n = sections.length;
  const assignCount = Math.floor(n * assignRatio);
  const assigned = sections.slice(0, assignCount);
  const groups = new Map();
  assigned.forEach((s, i) => {
    const m = makers[i % makers.length];
    if (!groups.has(m.id)) groups.set(m.id, []);
    groups.get(m.id).push(s.id);
  });
  for (const [makerId, ids] of groups) assignSections(projectId, ids, makerId, '主管 周敏');

  const submitted = assigned.slice(0, Math.floor(assignCount * submitRatio));
  for (const s of submitted) {
    submitSection(projectId, s.id, s.assignee_id, '初版送审');
  }
  // Approval is only allowed once a section has no open findings (the same rule
  // the manager follows in the UI), so sign off the clean ones and leave the
  // rest to rework — which is exactly the mix a live project shows.
  const approved = assigned.slice(0, Math.floor(assignCount * approveRatio));
  for (const s of approved) {
    const open = db.prepare(
      "SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND section_id = ? AND status = 'open'"
    ).get(projectId, s.id).n;
    if (open > 0) continue;
    const sub = db.prepare(
      "SELECT * FROM submissions WHERE section_id = ? AND status = 'submitted' ORDER BY id DESC LIMIT 1"
    ).get(s.id);
    if (sub) reviewSubmission(projectId, sub.id, 'approve', { reason: '图面完整，校验通过' });
  }
  // Reject a few to accumulate rework counts.
  const rest = submitted.filter((s) => !approved.find((a) => a.id === s.id));
  for (let i = 0; i < Math.min(reworks, rest.length); i++) {
    const s = rest[i];
    const sub = db.prepare(
      "SELECT * FROM submissions WHERE section_id = ? AND status = 'submitted' ORDER BY id DESC LIMIT 1"
    ).get(s.id);
    if (!sub) continue;
    reviewSubmission(projectId, sub.id, 'reject', {
      reason: i % 2 === 0
        ? '射流风机标注与土建断面不一致，请按最新断面复核并补充编号。'
        : 'CO 检测器漏挂区段，且区段桩号标注未更新，请整改后重新送审。',
    });
  }
}

// Seed a duplicate section code before the review round so the whole demo
// stays consistent with the rule "no approved section carries open findings".
const dupSections = db.prepare('SELECT * FROM sections WHERE project_id = ? ORDER BY id LIMIT 2').all(pB.id);
if (dupSections.length === 2) {
  db.prepare('UPDATE sections SET code = ? WHERE id = ?').run(dupSections[0].code, dupSections[1].id);
}

seedWorkflow(pA.id, { assignRatio: 0.8, approveRatio: 0.45, submitRatio: 0.55, reworks: 4 });
seedWorkflow(pB.id, { assignRatio: 0.9, approveRatio: 0.3, submitRatio: 0.4, reworks: 1 });

// Project C: mostly unassigned and overdue.
assignSections(pC.id, db.prepare('SELECT id FROM sections WHERE project_id = ? LIMIT 2').all(pC.id).map((r) => r.id),
  makers[0].id, '主管 周敏');

for (const p of [pA, pB, pC]) {
  const r = runChecks(p.id, { actor: '系统质检' });
  console.log(`  ${p.code}: 质检新增 ${r.created} 项，保留 ${r.kept} 项，失效 ${r.superseded} 项`);
}

const counts = db.prepare('SELECT project_id, COUNT(*) AS n FROM elements GROUP BY project_id').all();
console.log('要素数量:', counts.map((c) => `${c.project_id}=${c.n}`).join(' '));
console.log('种子完成。');
