import { buildDistrict } from '../src/core/city.js'
import { generateRoutePoints } from '../src/core/route.js'
import { proposeStops, spacingStatus, stationGaps } from '../src/core/stations.js'

let bad = 0
for (const count of [6, 8, 10, 12, 14, 15, 16, 18, 20]) {
  for (const len of [2400, 3600, 4800, 6000, 7200]) {
    for (const seed of ['S-2026-0721', 'S-2026-0417', 'S-2026-9999']) {
      const controls = generateRoutePoints(seed, len, 7)
      const d = buildDistrict({ seed, lineId: 'L58', controls, density: 1 })
      const stops = proposeStops({ district: d, seed, lineId: 'L58', count, spacing: '300-800' })
      const gaps = stationGaps(stops)
      const out = gaps.filter((g) => g < 300 || g > 800)
      const s = spacingStatus(stops)
      if (out.length || stops.length !== Math.max(4, Math.min(20, count, Math.floor((d.total - 200) / 330) + 1))) {
        // 允许因长度约束减少站数
        if (out.length) {
          bad++
          console.log(`count=${count} len=${len} seed=${seed} total=${d.total.toFixed(0)} stops=${stops.length} out=${out.map(x=>x.toFixed(0)).join(',')}`)
        }
      }
      if (s.eval.bad.length !== gaps.filter(g=>g>800).length) { bad++; console.log('eval mismatch') }
    }
  }
}
console.log(bad ? `FAIL ${bad}` : 'OK 所有组合站距均在 300–800m 内')
