// ============ 核心算法冒烟测试（Node 环境，无 DOM 依赖） ============
// 运行：npx tsx scripts/smoke.ts
import { strict as assert } from 'node:assert'
import { easeValue, easeDerivative, sampleCurve } from '../src/lib/easing'
import { buildFormation, distance, minPairDistance, presetHeart, rebindSequential } from '../src/lib/geometry'
import { runSafetyCheck, sampleAt, totalDuration } from '../src/lib/script'
import type { MotionSegment, ShowScript } from '../src/types'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function seg(over: Partial<MotionSegment>): MotionSegment {
  return {
    id: 's', fromKeyframeId: 'k1', toKeyframeId: 'k2', easing: 'linear',
    cubicBezier: [{ x: 0, y: 0 }, { x: 1, y: 1 }], durationSec: 10, ...over
  }
}

function makeScript(opts: { distance: number; duration: number; easing?: MotionSegment['easing']; limits?: [number, number] }): ShowScript {
  // 两架无人机：D001 走 opts.distance 米，D002 静止
  const f1 = buildFormation('f1', '起点', [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  ])
  const f2 = buildFormation('f2', '终点', [
    { x: opts.distance, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 }
  ])
  return {
    id: 'script_test', projectId: 'ptest', name: '测试脚本', droneCount: 2,
    limits: { maxSpeed: opts.limits?.[0] ?? 8, maxAccel: opts.limits?.[1] ?? 4 },
    formations: [f1, f2],
    keyframes: [
      { id: 'k1', timeSec: 0, type: 'takeoff', formationId: 'f1', note: '' },
      { id: 'k2', timeSec: opts.duration, type: 'transform', formationId: 'f2', note: '' }
    ],
    segments: [seg({ durationSec: opts.duration, easing: opts.easing ?? 'linear' })],
    droneColors: { D001: '#ffffff', D002: '#ffffff' }
  }
}

console.log('1) 缓动曲线')
check('线性缓动 y≈t', () => {
  const s = seg({ easing: 'linear' })
  for (const t of [0, 0.25, 0.5, 0.75, 1]) assert.ok(Math.abs(easeValue(s, t) - t) < 1e-6)
})
check('缓入缓出端点为 0/1 且单调递增', () => {
  const s = seg({ easing: 'easeInOut' })
  assert.equal(easeValue(s, 0), 0)
  assert.equal(easeValue(s, 1), 1)
  const pts = sampleCurve(s, 50).map((p) => p.y)
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i] >= pts[i - 1] - 1e-9)
})
check('自定义贝塞尔控制点生效', () => {
  const s = seg({ easing: 'custom', cubicBezier: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }] })
  const mid = easeValue(s, 0.5)
  assert.ok(mid > 0.4 && mid < 0.6, `中点应接近 0.5，实际 ${mid}`)
  assert.ok(easeDerivative(s, 0.1) > 1, '前段应快速冲出')
})

console.log('2) 轨迹插值')
check('线性段中点位置 = 起点/终点中点', () => {
  const sc = makeScript({ distance: 100, duration: 10 })
  const st = sampleAt(sc, 5).find((s) => s.droneId === 'D001')!
  assert.ok(Math.abs(st.position.x - 50) < 0.5, `x=${st.position.x}`)
})
check('静止无人机速度为 0', () => {
  const sc = makeScript({ distance: 100, duration: 10 })
  const st = sampleAt(sc, 5).find((s) => s.droneId === 'D002')!
  assert.ok(st.speed < 0.01, `speed=${st.speed}`)
})
check('总时长取最后关键帧时刻', () => {
  const sc = makeScript({ distance: 100, duration: 12 })
  assert.equal(totalDuration(sc), 12)
})

console.log('3) 安全校验')
check('合规脚本通过校验', () => {
  const sc = makeScript({ distance: 40, duration: 10 }) // 峰值速度 4m/s
  const r = runSafetyCheck(sc)
  assert.ok(r.ok, '不应有超限')
  assert.equal(r.firstViolator, null)
})
check('超速时报告第一架超限且编号正确', () => {
  const sc = makeScript({ distance: 100, duration: 10, limits: [8, 40] }) // 10m/s > 8
  const r = runSafetyCheck(sc)
  assert.equal(r.ok, false)
  assert.equal(r.firstViolator?.droneId, 'D001', 'D001 应先超限')
  assert.equal(r.firstViolator?.kind, 'speed')
  assert.ok(r.firstViolator.value > 9.5, `峰值 ${r.firstViolator.value}`)
  assert.ok(!r.violations.some((v) => v.droneId === 'D002'), '静止的 D002 不应超限')
})
check('加速度超限可被检出（短时长急启）', () => {
  const sc = makeScript({ distance: 30, duration: 2, easing: 'easeIn', limits: [40, 4] })
  const r = runSafetyCheck(sc)
  assert.ok(r.violations.some((v) => v.kind === 'accel'), '应存在加速度超限')
  assert.equal(r.firstViolator?.droneId, 'D001')
})

console.log('4) 编队几何')
check('心形生成点数与绑定编号正确', () => {
  const pts = presetHeart(50, 3, 80)
  const f = buildFormation('fh', '心形', pts)
  assert.equal(f.nodes.length, 50)
  assert.equal(f.nodes[0].droneId, 'D001')
  assert.equal(f.nodes[49].droneId, 'D050')
})
check('重新顺序绑定不破坏节点数', () => {
  const f = buildFormation('fg', '阵列', [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }])
  f.nodes[0].droneId = 'D099'
  rebindSequential(f)
  assert.deepEqual(f.nodes.map((n) => n.droneId), ['D001', 'D002'])
})
check('最小机间距计算', () => {
  const f = buildFormation('fm', '密集', [
    { x: 0, y: 0, z: 0 }, { x: 2.5, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }
  ])
  const m = minPairDistance(f)!
  assert.ok(Math.abs(m.dist - 2.5) < 1e-9)
  assert.equal(distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }), 5)
})

console.log(`\n全部 ${passed} 项测试通过 ✔`)
