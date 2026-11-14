// 后端：订单 / 体素模型 / 质检批次 / 复核 / 放行报告
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBatchChecks, hasOpenFatal } from '../shared/qc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- 简易 JSON 存储 ----------
let db;
function load() {
  if (fs.existsSync(DB_FILE)) {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    db = { orders: [], batches: [], seq: { order: 0, batch: 0, issue: 0 } };
    seed();
    save();
  }
}
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function seed() {
  const o1 = newOrder('张医生', '王小明', [
    { position: '11', restorationType: 'crown', material: '氧化锆' },
    { position: '21', restorationType: 'crown', material: '氧化锆' },
  ]);
  const o2 = newOrder('张医生', '李芳', [
    { position: '36', restorationType: 'bridge', material: '钴铬合金' },
    { position: '46', restorationType: 'inlay', material: '玻璃陶瓷' },
  ]);
  const o3 = newOrder('陈医生', '赵强', [
    { position: '16', restorationType: 'crown', material: '全瓷' },
  ]);
  db.orders.push(o1, o2, o3);
}
function newOrder(doctor, patient, teeth) {
  const id = ++db.seq.order;
  return {
    id, doctor, patient, teeth: teeth.map(t => ({ ...t, model: null })),
    status: 'modeling', // modeling -> qc -> reviewing -> released / returned
    createdAt: new Date().toISOString()
  };
}
load();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const findOrder = (id) => db.orders.find(o => o.id === Number(id));
const findBatch = (id) => db.batches.find(b => b.id === Number(id));

// ---------- 订单 ----------
// 医生端：?doctor=张医生 只看自己的；技师端不传看全部
app.get('/api/orders', (req, res) => {
  let list = db.orders;
  if (req.query.doctor) list = list.filter(o => o.doctor === req.query.doctor);
  res.json(list.map(o => ({ ...o, teeth: o.teeth.map(t => ({ ...t, hasModel: !!t.model, model: undefined })) })));
});

app.post('/api/orders', (req, res) => {
  const { doctor, patient, teeth } = req.body;
  if (!doctor || !patient || !Array.isArray(teeth) || !teeth.length)
    return res.status(400).json({ error: '缺少 doctor/patient/teeth' });
  const o = newOrder(doctor, patient, teeth);
  db.orders.push(o); save();
  res.status(201).json(o);
});

app.get('/api/orders/:id', (req, res) => {
  const o = findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  res.json(o);
});

// ---------- 模型保存（技师建模） ----------
app.put('/api/orders/:id/teeth/:pos/model', (req, res) => {
  const o = findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const tooth = o.teeth.find(t => t.position === req.params.pos);
  if (!tooth) return res.status(404).json({ error: '牙位不在订单中' });
  const { voxelData, voxelCount, faceCount } = req.body;
  if (!voxelData) return res.status(400).json({ error: '缺少 voxelData' });
  tooth.model = { voxelData, voxelCount, faceCount, updatedAt: new Date().toISOString() };
  save();
  res.json({ ok: true });
});

// ---------- 提交质检：一批模型自动跑检查 ----------
app.post('/api/orders/:id/submit-qc', (req, res) => {
  const o = findOrder(req.params.id);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const modeled = o.teeth.filter(t => t.model);
  if (!modeled.length) return res.status(400).json({ error: '没有已建模的牙位' });

  const results = runBatchChecks(modeled.map(t => ({
    toothPosition: t.position, voxelData: t.model.voxelData, restorationType: t.restorationType
  })));

  const issues = [];
  for (const r of results)
    for (const i of r.issues)
      issues.push({ id: ++db.seq.issue, ...i, status: 'open', rejectReason: null });

  const batch = {
    id: ++db.seq.batch,
    orderId: o.id,
    doctor: o.doctor,
    patient: o.patient,
    teeth: results.map(r => ({
      position: r.toothPosition, voxelCount: r.voxelCount, faceCount: r.faceCount,
      issueCount: r.issues.length
    })),
    issues,
    status: issues.some(i => i.severity === 'fatal') ? 'has_fatal' : 'reviewing',
    // has_fatal(有致命待复核) -> reviewing -> released / returned
    createdAt: new Date().toISOString(),
    report: null
  };
  db.batches.push(batch);
  o.status = 'reviewing';
  save();
  res.status(201).json(batch);
});

// ---------- 批次查询（按角色过滤） ----------
app.get('/api/batches', (req, res) => {
  const { role, doctor } = req.query;
  let list = db.batches;
  if (role === 'doctor' && doctor) list = list.filter(b => b.doctor === doctor);
  if (role === 'outsourcer') list = list.filter(b => b.status === 'returned');
  res.json(list.map(b => ({ ...b, issues: summarizeIssues(b.issues) })));
});
function summarizeIssues(issues) {
  const s = { fatal: 0, warning: 0, info: 0, open: 0, confirmed: 0, rejected: 0 };
  for (const i of issues) { s[i.severity]++; s[i.status === 'open' ? 'open' : i.status]++; }
  return s;
}

app.get('/api/batches/:id', (req, res) => {
  const b = findBatch(req.params.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  // 外协方只能看退回清单，不能看问题细节
  if (req.query.role === 'outsourcer') {
    if (b.status !== 'returned') return res.status(403).json({ error: '外协方仅可查看退回清单' });
    const o = findOrder(b.orderId);
    return res.json({
      id: b.id, orderId: b.orderId, patient: b.patient, status: b.status,
      teeth: b.teeth,
      rejectedIssues: b.issues.filter(i => i.status === 'rejected')
        .map(i => ({ toothPosition: i.toothPosition, checkType: i.checkType, message: i.message, rejectReason: i.rejectReason })),
      models: o ? o.teeth.filter(t => t.model).map(t => ({ position: t.position, voxelData: t.model.voxelData, restorationType: t.restorationType })) : []
    });
  }
  const o = findOrder(b.orderId);
  res.json({
    ...b,
    models: o ? o.teeth.filter(t => t.model).map(t => ({ position: t.position, voxelData: t.model.voxelData, restorationType: t.restorationType })) : []
  });
});

// ---------- 复核：确认 / 驳回 ----------
app.post('/api/batches/:id/issues/:issueId/review', (req, res) => {
  const b = findBatch(req.params.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const issue = b.issues.find(i => i.id === Number(req.params.issueId));
  if (!issue) return res.status(404).json({ error: '问题不存在' });
  const { action, reason } = req.body;
  if (action === 'confirm') {
    issue.status = 'confirmed';
  } else if (action === 'reject') {
    if (!reason || !reason.trim()) return res.status(400).json({ error: '驳回必须填写原因' });
    issue.status = 'rejected';
    issue.rejectReason = reason.trim();
    b.status = 'returned';
    const o = findOrder(b.orderId);
    if (o) o.status = 'returned';
  } else {
    return res.status(400).json({ error: 'action 须为 confirm 或 reject' });
  }
  // 全部问题处理完且没有驳回 -> 回到可放行状态
  if (b.issues.every(i => i.status !== 'open') && b.status !== 'returned') b.status = 'reviewed';
  save();
  res.json(b);
});

// ---------- 放行：致命问题未处理完不能放行 ----------
app.post('/api/batches/:id/release', (req, res) => {
  const b = findBatch(req.params.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  if (hasOpenFatal(b)) return res.status(400).json({ error: '存在未处理的致命问题，整批不能放行' });
  if (b.issues.some(i => i.status === 'open')) return res.status(400).json({ error: '仍有未复核的问题' });
  if (b.status === 'returned') return res.status(400).json({ error: '批次已退回外协，不能放行' });

  b.status = 'released';
  b.report = {
    generatedAt: new Date().toISOString(),
    batchId: b.id,
    orderId: b.orderId,
    doctor: b.doctor,
    patient: b.patient,
    teeth: b.teeth.map(t => ({
      position: t.position,
      voxelCount: t.voxelCount,
      faceCount: t.faceCount,
      issueCount: t.issueCount,
      fatalCount: b.issues.filter(i => i.toothPosition === t.position && i.severity === 'fatal').length
    })),
    totalIssues: b.issues.length,
    confirmed: b.issues.filter(i => i.status === 'confirmed').length,
    rejected: b.issues.filter(i => i.status === 'rejected').length
  };
  const o = findOrder(b.orderId);
  if (o) o.status = 'released';
  save();
  res.json(b.report);
});

app.get('/api/batches/:id/report', (req, res) => {
  const b = findBatch(req.params.id);
  if (!b || !b.report) return res.status(404).json({ error: '报告不存在（批次未放行）' });
  res.json(b.report);
});

// ---------- 外协/技师修复后重新提交 ----------
app.post('/api/batches/:id/resubmit', (req, res) => {
  const b = findBatch(req.params.id);
  if (!b) return res.status(404).json({ error: '批次不存在' });
  const o = findOrder(b.orderId);
  if (!o) return res.status(404).json({ error: '订单不存在' });
  const modeled = o.teeth.filter(t => t.model);
  const results = runBatchChecks(modeled.map(t => ({
    toothPosition: t.position, voxelData: t.model.voxelData, restorationType: t.restorationType
  })));
  b.teeth = results.map(r => ({
    position: r.toothPosition, voxelCount: r.voxelCount, faceCount: r.faceCount, issueCount: r.issues.length
  }));
  b.issues = [];
  for (const r of results)
    for (const i of r.issues)
      b.issues.push({ id: ++db.seq.issue, ...i, status: 'open', rejectReason: null });
  b.status = b.issues.some(i => i.severity === 'fatal') ? 'has_fatal' : 'reviewing';
  b.report = null;
  o.status = 'reviewing';
  save();
  res.json(b);
});

const PORT = 3001;
app.listen(PORT, () => console.log(`[dental-qc] API 服务已启动: http://localhost:${PORT}`));
