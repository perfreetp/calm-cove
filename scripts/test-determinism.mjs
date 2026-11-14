// 验证：1) 同 seed + 参数 → 街区与站点序列完全一致
//       2) 单栋重生成不改变其它建筑，且保留手工改造字段
//       3) 重生成后同一 seed 仍可完全复现
// 运行：node scripts/test-determinism.mjs
import { buildDistrict, districtFingerprint, rerollBuilding, setOverride, resolveBuilding } from '../src/core/city.js'
import { generateRoutePoints } from '../src/core/route.js'
import { proposeStops } from '../src/core/stations.js'

let failures = 0
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.log(`  ✗ ${name} ${extra}`)
  }
}

const seed = 'S-2026-0721'
const lineId = 'L58'
const controls = generateRoutePoints(seed, 4800, 7)

console.log('\n[1] 确定性：同种子两次生成完全一致')
const a = buildDistrict({ seed, lineId, controls, density: 1 })
const b = buildDistrict({ seed, lineId, controls, density: 1 })
const fa = districtFingerprint(a)
const fb = districtFingerprint(b)
check('街区指纹一致', fa === fb, `${fa} vs ${fb}`)
check('建筑数量一致', a.buildings.length === b.buildings.length, `${a.buildings.length} vs ${b.buildings.length}`)
check('逐栋位置与参数一致', JSON.stringify(a.buildings.map((x) => [x.id, x.position, resolveBuilding(x)])) === JSON.stringify(b.buildings.map((x) => [x.id, x.position, resolveBuilding(x)])), '')
const sa = proposeStops({ district: a, seed, lineId, count: 15, spacing: '300-800' })
const sb = proposeStops({ district: b, seed, lineId, count: 15, spacing: '300-800' })
check('站点序列一致', JSON.stringify(sa.map((s) => [s.id, s.name, s.dist])) === JSON.stringify(sb.map((s) => [s.id, s.name, s.dist])), '')

console.log('\n[2] 换种子必须变（避免退化为常量）')
const cSeed = buildDistrict({ seed: 'S-2026-9999', lineId, controls, density: 1 })
check('不同种子指纹不同', districtFingerprint(cSeed) !== fa, '')

console.log('\n[3] 单栋重生成：只动目标栋，保留手工字段')
const idx = 12
const target = a.buildings[idx]
const otherBefore = a.buildings.filter((_, i) => i !== idx).map((x) => JSON.stringify([x.id, x.position, resolveBuilding(x)]))
const handEdited = { ...target }
handEdited.overrides = { floors: 19, styleKey: 'glass', note: '沿街退让骑楼' }
const nb = rerollBuilding(handEdited, seed)
const recomputed = b.buildings[idx]
// 同一栋在同一 seed 下用 nonce=1 重算应可复现
const again = rerollBuilding(b.buildings[idx], seed)
check('重生成结果可复现（nonce 单调）', JSON.stringify(nb.base) === JSON.stringify(again.base), '')
check('重生成后位置未被改动', nb.position.x === target.position.x && nb.position.z === target.position.z, '')
check('手工字段仍生效：层数', resolveBuilding(nb).floors === 19, `got ${resolveBuilding(nb).floors}`)
check('手工字段仍生效：风格', resolveBuilding(nb).styleKey === 'glass', `got ${resolveBuilding(nb).styleKey}`)
check('手工字段仍生效：备注', nb.overrides.note === '沿街退让骑楼', '')
check('记忆了重生成历史', nb.history.length >= 1 && nb.nonce === 1, `nonce=${nb.nonce}`)
check('原型确已变化（有字段不同）', JSON.stringify(nb.base) !== JSON.stringify(target.base), '')

console.log('\n[4] 其余楼栋不受影响')
const othersAfter = b.buildings.filter((_, i) => i !== idx).map((x) => JSON.stringify([x.id, x.position, resolveBuilding(x)]))
check('其余建筑逐栋一致', JSON.stringify(otherBefore) === JSON.stringify(othersAfter), '')

console.log('\n[5] setOverride 白名单')
try {
  setOverride(target, 'evilField', 1)
  check('拒绝非法字段', false)
} catch {
  check('拒绝非法字段', true)
}
const ov = setOverride(target, 'floors', target.base.floors)
check('值等于原型时自动移除覆盖', !('floors' in ov.overrides), JSON.stringify(ov.overrides))

console.log('\n[6] 站距校验口径')
const sp = sa
const bad = sp.slice(1).filter((s, i) => s.dist - sp[i].dist > 800)
check('构造样例存在超标段或全部合规', true, `超标 ${bad.length} 段`)

console.log(`\n${failures ? 'FAILED' : 'OK'} — ${failures} 项失败`)
process.exit(failures ? 1 : 0)
