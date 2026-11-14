// 自动校核规则:距离 2m、黄金区、毒麻柜管理
import {
  VOXEL_TYPES, inGoldZone, DIST_LIMIT_CELLS, DIST_LIMIT_M, CELL_MM, GOLD_ZONE
} from './constants.js'

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * 返回规则校核结果
 * [{ rule, level, voxel, message, gx, gy }]
 */
export function runRules(voxels) {
  const issues = []
  const benches = voxels.filter(v => v.type === 'bench')
  const cabs = voxels.filter(v => v.type === 'herb_cab' || v.type === 'poison_cab')
  const works = voxels.filter(v => VOXEL_TYPES[v.type].category === 'work')

  // 规则 1:普通药斗离最近调剂台超过 2m(毒麻专柜走独立管理动线,不适用取药半径)
  for (const c of cabs.filter(c => c.type === 'herb_cab')) {
    if (!benches.length) {
      issues.push(mk('distance', c, `平面内尚无调剂台,无法满足 ${DIST_LIMIT_M}m 取药半径`))
      continue
    }
    const nearest = Math.min(...benches.map(b => dist(c, b)))
    const meters = nearest * CELL_MM / 1000
    if (nearest > DIST_LIMIT_CELLS) {
      issues.push(mk('distance', c,
        `该${VOXEL_TYPES[c.type].label}离最近调剂台 ${meters.toFixed(2)}m,超过 ${DIST_LIMIT_M}m 限值`))
    }
  }

  // 规则 2:常用药位不在黄金区
  for (const c of voxels.filter(v => v.commonSlot)) {
    if (!inGoldZone(c.x, c.y)) {
      issues.push(mk('gold', c,
        `常用药${c.herbName ? '「' + c.herbName + '」' : ''}药位 (${c.x},${c.y}) 不在黄金区` +
        ` [X${GOLD_ZONE.x0}-${GOLD_ZONE.x1}, Y${GOLD_ZONE.y0}-${GOLD_ZONE.y1}]`))
    }
  }

  // 规则 3:毒麻药柜应贴墙并远离普通药斗(至少隔 1 格通道)
  for (const p of voxels.filter(v => v.type === 'poison_cab')) {
    const againstWall = p.x === 0 || p.y === 0 || p.x === 19 || p.y === 13
    if (!againstWall) {
      issues.push(mk('poison', p, '毒麻药柜未贴墙设置,不符合专柜管理要求'))
    }
    const tooClose = cabs.some(c => c.type === 'herb_cab' && dist(c, p) < 1)
    if (tooClose) {
      issues.push(mk('poison', p, '毒麻药柜与普通药斗直接相邻,应保留至少 1 格独立管理通道'))
    }
  }

  // 规则 4:作业区之间不可重叠(落位时已拦截,这里兜底检查数据)
  const seen = new Map()
  for (const v of voxels) {
    const k = `${v.x},${v.y},${v.z}`
    if (seen.has(k)) {
      issues.push(mk('overlap', v, `位置 (${v.x},${v.y}) 第${v.z + 1}层存在重叠体素`))
    }
    seen.set(k, v)
  }

  // 工作台覆盖提示:称量区/复核台缺失
  if (!voxels.some(v => v.type === 'scale')) {
    issues.push({ rule: 'missing', level: 'warn', gx: 0, gy: 0, gz: 0, voxel: null,
      message: '平面缺少称量区' })
  }
  if (!voxels.some(v => v.type === 'review')) {
    issues.push({ rule: 'missing', level: 'warn', gx: 0, gy: 0, gz: 0, voxel: null,
      message: '平面缺少复核台' })
  }
  if (!works.length) {
    issues.push({ rule: 'missing', level: 'warn', gx: 0, gy: 0, gz: 0, voxel: null,
      message: '平面尚未布置任何调剂作业设施' })
  }
  return issues
}

function mk(rule, voxel, message) {
  return {
    rule, level: 'error',
    gx: voxel.x, gy: voxel.y, gz: voxel.z,
    voxel, message
  }
}

export const RULE_META = {
  distance: { label: '2米取药半径', kind: 'distance' },
  gold: { label: '常用药黄金区', kind: 'gold' },
  poison: { label: '毒麻柜管理', kind: 'other' },
  overlap: { label: '体素重叠', kind: 'other' },
  missing: { label: '设施完整性', kind: 'other' }
}
