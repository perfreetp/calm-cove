// 端到端业务流程测试:localStorage 用内存 stub
import { vi } from './stub-dom.js'
globalThis.localStorage = vi.localStorage

const store = await import('../src/lib/store.js')
const { runRules } = await import('../src/lib/rules.js')
const { mergeVoxels } = await import('../src/lib/geometry.js')

let pass = 0, fail = 0
const ok = (n, c) => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✕ FAIL:', n)) }

store.resetAll()

// 1. 新建方案
const campuses = store.getCampuses()
const p = store.addProject(campuses[0].id, 'E2E测试药房')
ok('新方案为草稿态', p.status === 'draft')
const v1 = store.currentVersion(p)
ok('初始版本号 V1.0', v1.version === 'V1.0')

// 2. 药师布置:药斗 + 距离超标的调剂台
v1.voxels.push(
  { id: 'a1', x: 2, y: 2, z: 0, type: 'herb_cab', cells: 60, capacity: 2, commonSlot: true, herbName: '黄芪' },
  { id: 'b1', x: 14, y: 10, z: 0, type: 'bench' },
  { id: 's1', x: 15, y: 10, z: 0, type: 'scale' },
  { id: 'r1', x: 16, y: 10, z: 0, type: 'review' }
)
const issues = runRules(v1.voxels)
ok('校核发现距离与黄金区问题', issues.some(i => i.rule === 'distance') && issues.some(i => i.rule === 'gold'))

// 3. 药师提交 → 生成 V1.1,状态变审核中
const stats = mergeVoxels(v1.voxels)
const nv1 = store.submitVersion(p, v1.voxels, '初版提交', '张药师',
  { groups: stats.groups.length, beforeFaces: stats.beforeFaces, afterFaces: stats.afterFaces, reduction: stats.reduction })
ok('提交后版本号递增 V1.1', nv1.version === 'V1.1')
ok('方案进入审核中', p.status === 'reviewing')
ok('新版本记录 basedOn 链', nv1.basedOn === v1.id)
ok('版本携带减面统计', nv1.mergeStats && typeof nv1.mergeStats.reduction === 'number')

// 4. 药师长打点批注两条
const reloaded = store.getProject(p.id)
const cur = store.currentVersion(reloaded)
store.annotate(reloaded, cur.id, {
  id: 'an1', gx: 2, gy: 2, gz: 0, kind: 'distance',
  text: '药斗离调剂台超过2米', who: '李药师长', at: Date.now(), status: 'open', thread: []
})
store.annotate(reloaded, cur.id, {
  id: 'an2', gx: 2, gy: 2, gz: 0, kind: 'gold',
  text: '常用药位不在黄金区', who: '李药师长', at: Date.now(), status: 'open', thread: []
})
ok('批注后方案变待返工', store.getProject(p.id).status === 'rework')
ok('未闭环条数 = 2', store.openCount(store.currentVersion(store.getProject(p.id))) === 2)

// 5. 制作方逐条回复:一条已改,一条保留
const p2 = store.getProject(p.id)
const cur2 = store.currentVersion(p2)
store.replyAnno(p2, cur2.id, 'an1', { role: 'builder', who: '王工长', at: Date.now(), action: 'fixed', text: '已就近增设调剂台' })
store.replyAnno(p2, cur2.id, 'an2', { role: 'builder', who: '王工长', at: Date.now(), action: 'kept', text: '受立柱限制保留,已登记' })
const p3 = store.getProject(p.id)
const cur3 = store.currentVersion(p3)
ok('已改条目闭环', cur3.annotations.find(a => a.id === 'an1').status === 'closed')
ok('保留条目为 kept', cur3.annotations.find(a => a.id === 'an2').status === 'kept')
ok('未闭环清零', store.openCount(cur3) === 0)

// 6. 药师调整后提交新版本 V1.2
const fixedVoxels = JSON.parse(JSON.stringify(cur3.voxels))
fixedVoxels.push({ id: 'b2', x: 3, y: 3, z: 0, type: 'bench' })
const nv2 = store.submitVersion(store.getProject(p.id), fixedVoxels, '响应批注调整', '张药师', null)
ok('第二轮提交版本号 V1.2', nv2.version === 'V1.2')

// 7. 版本对比:V1.1 → V1.2 应识别出新增体素
const p4 = store.getProject(p.id)
const [newer, older] = p4.versions
const oldKeys = new Set(older.voxels.map(v => `${v.x},${v.y},${v.z}`))
const added = newer.voxels.filter(v => !oldKeys.has(`${v.x},${v.y},${v.z}`))
ok('对比识别出新增体素', added.length === 1 && added[0].type === 'bench')

// 8. 药师长审核通过 → 施工交付
store.approve(store.getProject(p.id))
ok('审核通过状态', store.getProject(p.id).status === 'approved')
store.deliver(store.getProject(p.id))
ok('进入施工交付', store.getProject(p.id).status === 'delivered')

// 9. 历史记录完整
const p5 = store.getProject(p.id)
ok('历史含 3 个版本', p5.versions.length === 3)
ok('历史可追溯每轮批注数量', p5.versions[2].annotations.length === 0 && p5.versions[1].annotations.length === 2)
ok('历史记录操作人与时间', p5.versions[1].operator === '张药师' && p5.versions[1].at > 0)

// 10. 看板统计
const dash = store.dashboardStats()
const row = dash.rows.find(r => r.campus === campuses[0].name)
ok('看板包含该院区行', !!row)
ok('看板待审量为数字', typeof row.pending === 'number')
ok('看板平均返工次数可计算', !Number.isNaN(Number(row.avgRework)))
ok('看板覆盖率 0-100', row.coverage >= 0 && row.coverage <= 100)

// 11. 持久化:重新加载(同一内存 localStorage)数据仍在
const fresh = store.listProjects()
ok('数据持久化后可重新读取', fresh.some(x => x.name === 'E2E测试药房'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
