// 核心逻辑冒烟测试(Node 直跑 ESM)
import { mergeVoxels, iso, screenToGrid, painterSort } from '../src/lib/geometry.js'
import { buildGLB, buildSlotCSV } from '../src/lib/exporter.js'
import { runRules } from '../src/lib/rules.js'
import { VOXEL_TYPES } from '../src/lib/constants.js'

let pass = 0, fail = 0
const ok = (name, cond) => { cond ? (pass++, console.log('  ✓', name)) : (fail++, console.log('  ✕ FAIL:', name)) }

// 1. 投影往返:screenToGrid(iso(x,y)) ≈ (x,y)
let rtOk = true
for (const [x, y] of [[0, 0], [5, 3], [19, 13], [10, 7]]) {
  const p = iso(x, y)
  const g = screenToGrid(p.x, p.y)
  if (g.x !== x || g.y !== y) rtOk = false
}
ok('等轴测投影/反投影往返一致', rtOk)

// 2. 画家算法排序
const sorted = painterSort([{ x: 5, y: 5, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }])
ok('画家算法前序体素排前', sorted[0].x === 0 && sorted[0].y === 0 && sorted[0].z === 0)

// 3. 合并减面:5 个连续同材质体素应合成 1 组,且减面率 > 0
const row = []
for (let x = 0; x < 5; x++) row.push({ id: 'r' + x, x, y: 2, z: 0, type: 'herb_cab', cells: 60, capacity: 2, commonSlot: false })
const m = mergeVoxels(row)
ok('连续 5 体素合并为 1 个条块', m.groups.length === 1 && m.groups[0].count === 5)
ok('合并后面数下降', m.afterFaces < m.beforeFaces && m.reduction > 0)
console.log('    面数', m.beforeFaces, '→', m.afterFaces, `减面 ${m.reduction}%`)

// 不连续 → 两组
const split = [
  { id: 'a', x: 0, y: 0, z: 0, type: 'bench' },
  { id: 'b', x: 2, y: 0, z: 0, type: 'bench' }
]
ok('间隔体素不合并', mergeVoxels(split).groups.length === 2)
// 不同材质不合并
const mixed = [
  { id: 'a', x: 0, y: 0, z: 0, type: 'herb_cab' },
  { id: 'b', x: 1, y: 0, z: 0, type: 'poison_cab' }
]
ok('不同材质不合并', mergeVoxels(mixed).groups.length === 2)

// 4. GLB 结构合法
const voxels = [
  { id: 'g1', x: 0, y: 0, z: 0, type: 'herb_cab' },
  { id: 'g2', x: 1, y: 0, z: 0, type: 'herb_cab' },
  { id: 'p1', x: 3, y: 0, z: 0, type: 'poison_cab' },
  { id: 'b1', x: 5, y: 2, z: 0, type: 'bench' }
]
const blob = buildGLB(voxels)
const buf = await blob.arrayBuffer()
const dv = new DataView(buf)
ok('GLB 魔数 glTF', dv.getUint32(0, true) === 0x46546c67)
ok('GLB 版本为 2', dv.getUint32(4, true) === 2)
ok('GLB 总长字段与实际一致', dv.getUint32(8, true) === buf.byteLength)
const jsonLen = dv.getUint32(12, true)
ok('JSON chunk 类型标记', dv.getUint32(16, true) === 0x4e4f534a)
const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)))
ok('glTF 含 3 个材质(按材质合批)', gltf.materials.length === 3)
ok('glTF mesh 图元数 = 材质组数', gltf.meshes[0].primitives.length === 3)
ok('glTF buffer 长度字段与 BIN chunk 匹配',
  gltf.buffers[0].byteLength === dv.getUint32(20 + jsonLen, true))
ok('POSITION accessor 含 min/max 包围盒',
  Array.isArray(gltf.accessors.find(a => a.type === 'VEC3' && a.min)?.min))

// 5. CSV 药位清单(Blob.text() 会按规范剥除 BOM,故从字节校验)
const csvBlob = buildSlotCSV(voxels)
const csvBytes = new Uint8Array(await csvBlob.arrayBuffer())
ok('CSV 带 UTF-8 BOM(Excel 兼容)', csvBytes[0] === 0xEF && csvBytes[1] === 0xBB && csvBytes[2] === 0xBF)
const csv = new TextDecoder().decode(csvBytes)
ok('CSV 含表头与每行记录', csv.includes('药位编号') && csv.split('\r\n').length === 5)

// 6. 校核规则
// 6.1 距离超标:调剂台放在远处
const far = [
  { id: 'c', x: 0, y: 0, z: 0, type: 'herb_cab' },
  { id: 'b', x: 10, y: 0, z: 0, type: 'bench' } // 距离 10 格 = 5m
]
const issues1 = runRules(far)
ok('识别 >2m 距离违规', issues1.some(i => i.rule === 'distance' && i.message.includes('5.00m')))

// 6.2 黄金区
const gold = [
  { id: 'w', x: 1, y: 1, z: 0, type: 'herb_cab', commonSlot: true, herbName: '黄芪' },
  { id: 'b', x: 1, y: 2, z: 0, type: 'bench' }
]
ok('识别常用药位不在黄金区', runRules(gold).some(i => i.rule === 'gold'))
const inZone = [
  { id: 'w', x: 9, y: 6, z: 0, type: 'herb_cab', commonSlot: true, herbName: '当归' },
  { id: 'b', x: 9, y: 7, z: 0, type: 'bench' }
]
ok('黄金区内不产生 gold 违规', !runRules(inZone).some(i => i.rule === 'gold'))

// 6.3 毒麻柜不贴墙
const poison = [
  { id: 'p', x: 9, y: 6, z: 0, type: 'poison_cab' },
  { id: 'b', x: 9, y: 7, z: 0, type: 'bench' }
]
ok('识别毒麻柜未贴墙', runRules(poison).some(i => i.rule === 'poison'))

// 6.4 缺设施
ok('识别缺失称量区/复核台', runRules([{ id: 'b', x: 0, y: 0, z: 0, type: 'bench' }])
  .filter(i => i.rule === 'missing').length === 2)

// 6.5 合规布局无 error
const good = [
  { id: 'h', x: 9, y: 5, z: 0, type: 'herb_cab', commonSlot: true, herbName: '党参' },
  { id: 'b', x: 9, y: 6, z: 0, type: 'bench' },
  { id: 's', x: 10, y: 6, z: 0, type: 'scale' },
  { id: 'r', x: 11, y: 6, z: 0, type: 'review' },
  { id: 'p', x: 0, y: 3, z: 0, type: 'poison_cab' }
]
ok('合规布局无 error 级问题', !runRules(good).some(i => i.level === 'error'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
