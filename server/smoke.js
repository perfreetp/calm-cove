// 端到端冒烟测试：建模保存 -> 提交质检 -> 复核确认/驳回 -> 重新送检 -> 放行 -> 报告
import { VoxelGrid, generateInitialTooth } from '../shared/voxel.js';
import { mergeAndDecimate, exportSTL, checkWatertight, checkNormals } from '../shared/mesh.js';

const base = 'http://localhost:3001/api';
const req = async (m, u, b) => {
  const r = await fetch(base + u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json();
  if (!r.ok) throw new Error(`${m} ${u} -> ${r.status}: ${d.error}`);
  return d;
};
const assert = (cond, msg) => { if (!cond) { console.error('FAIL:', msg); process.exit(1); } console.log('ok -', msg); };

// 1. 生成牙位 11 的模型（含一个悬空块用于触发警告）
const g = generateInitialTooth(new VoxelGrid(32), 'crown');
g.brush('crown', 2, 28, 2, 1.5, true); // 悬空块
const merged = mergeAndDecimate(g);
assert(merged.withinLimit && merged.faceCountAfter <= 30000, `合并减面后面数 ${merged.faceCountAfter} <= 30000`);
assert(checkWatertight(merged.mesh).watertight, '体素网格封闭');
assert(checkNormals(merged.mesh).consistent, '法线朝向一致');
const stl = exportSTL(merged.mesh, 't11');
assert(stl.byteLength === 84 + merged.faceCountAfter * 50, 'STL 二进制大小正确');

await req('PUT', '/orders/1/teeth/11/model', { voxelData: g.serialize(), voxelCount: g.countSolid(), faceCount: merged.faceCountAfter });
console.log('ok - 模型已保存');

// 2. 牙位 21 也建模（测试镜像来源数据即可，直接生成）
const g2 = generateInitialTooth(new VoxelGrid(32), 'crown');
await req('PUT', '/orders/1/teeth/21/model', { voxelData: g2.serialize(), voxelCount: g2.countSolid(), faceCount: 1000 });

// 3. 提交质检
const batch = await req('POST', '/orders/1/submit-qc');
assert(batch.issues.length > 0, `质检发现 ${batch.issues.length} 个问题`);
assert(batch.issues.some(i => i.checkType === 'floating' && i.severity === 'warning'), '检出悬空体素块(警告)');
assert(batch.issues.some(i => i.checkType === 'wall_thickness' && i.severity === 'fatal'), '检出冠壁厚不足(致命)');
assert(batch.status === 'has_fatal', '有致命问题时批次状态为 has_fatal');

// 4. 致命未处理不能放行
let blocked = false;
try { await req('POST', `/batches/${batch.id}/release`); } catch { blocked = true; }
assert(blocked, '致命问题未处理时放行被拒绝');

// 5. 复核：确认全部非致命，驳回一条致命（退回外协）
const fatal = batch.issues.find(i => i.severity === 'fatal');
for (const i of batch.issues.filter(x => x.id !== fatal.id)) await req('POST', `/batches/${batch.id}/issues/${i.id}/review`, { action: 'confirm' });
let noReason = false;
try { await req('POST', `/batches/${batch.id}/issues/${fatal.id}/review`, { action: 'reject', reason: '' }); } catch { noReason = true; }
assert(noReason, '驳回不填原因被拒绝');
const afterReject = await req('POST', `/batches/${batch.id}/issues/${fatal.id}/review`, { action: 'reject', reason: '冠壁厚不足需重新设计' });
assert(afterReject.status === 'returned', '驳回后批次退回外协');

// 6. 外协只能看退回清单
const out = await req('GET', '/batches?role=outsourcer');
assert(out.every(b => b.status === 'returned'), '外协方仅见退回批次');
const outDetail = await req('GET', `/batches/${batch.id}?role=outsourcer`);
assert(outDetail.rejectedIssues.length === 1 && outDetail.rejectedIssues[0].rejectReason.includes('冠壁厚'), '外协可见驳回原因');
let forbidden = false;
try { await req('GET', '/batches/999?role=outsourcer'); } catch { forbidden = true; }
assert(forbidden, '外协访问非退回批次被拒绝');

// 7. 修复（加厚壁厚：实心填充牙冠层）后重新送检
const g3 = generateInitialTooth(new VoxelGrid(32), 'crown');
for (let z = 0; z < 32; z++) for (let y = 12; y < 32; y++) for (let x = 0; x < 32; x++) {
  // 实心化牙冠区域
  if (g3.get('crown', x, y, z) || (Math.hypot((x - 15.5) / 9, (z - 15.5) / 10) < 0.85 && y > 14)) g3.set('crown', x, y, z, 1);
}
await req('PUT', '/orders/1/teeth/11/model', { voxelData: g3.serialize(), voxelCount: g3.countSolid(), faceCount: 2000 });
const b2 = await req('POST', `/batches/${batch.id}/resubmit`);
assert(b2.status !== 'returned' && b2.report === null, '重新送检后状态重置');
console.log('   重新送检问题数:', b2.issues.length, '致命:', b2.issues.filter(i => i.severity === 'fatal').length);

// 8. 全部确认后放行
for (const i of b2.issues) await req('POST', `/batches/${b2.id}/issues/${i.id}/review`, { action: 'confirm' });
const report = await req('POST', `/batches/${b2.id}/release`);
assert(report.teeth.length === 2 && report.teeth.every(t => t.voxelCount > 0), '放行报告含每颗牙体素数与问题数');
console.log('   报告:', JSON.stringify(report.teeth));

// 9. 医生视角
const docBatches = await req('GET', '/batches?role=doctor&doctor=' + encodeURIComponent('张医生'));
assert(docBatches.some(b => b.status === 'released'), '医生可见放行结果');
const docOrders = await req('GET', '/orders?doctor=' + encodeURIComponent('张医生'));
assert(docOrders.every(o => o.doctor === '张医生'), '医生只见自己的单子');

console.log('\n全部冒烟测试通过 ✔');
process.exit(0);
