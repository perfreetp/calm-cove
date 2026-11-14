import { rngFor } from './rng.js'

const A = [
  '云栖', '望江', '槐荫', '北塘', '青石', '柳岸', '南浦', '白鹭', '松风', '锦绣',
  '长乐', '安平', '广济', '清河', '梅溪', '枫桥', '玉兰', '金沙', '望舒', '栖霞',
  '梧桐', '合欢', '汀兰', '竹溪', '砚池', '春晖', '秋浦', '新塘', '石桥', '稻香'
]
const B = ['路', '街', '大道', '桥', '浜路', '巷', '环路']
const C = ['', '东', '西', '南', '北', '口', '新村', '枢纽', '公园', '里']

export function makeStationName(seed, index, used = new Set()) {
  const rng = rngFor(seed, `station-name:${index}`)
  for (let attempt = 0; attempt < 40; attempt++) {
    const name =
      rng.pick(A) +
      rng.pick(B) +
      (attempt > 4 ? ['东', '西', '南', '北', '口', '里'][attempt % 6] : rng.pick(C))
    if (!used.has(name)) return name
  }
  return `${rng.pick(A)}${rng.pick(B)}${index + 1}号站`
}

export function makeLineCode(seed) {
  const rng = rngFor(seed, 'line-code')
  return `${rng.int(2, 9)}${rng.int(0, 9)}路`
}

export function districtName(x, z) {
  if (Math.abs(z) > 600) return z > 0 ? '城北片区' : '城南片区'
  return x < 1600 ? '城西片区' : x < 3400 ? '城东片区' : '城东拓展区'
}

export function personHue(id) {
  return rngFor(id, 'hue').int(0, 360)
}
