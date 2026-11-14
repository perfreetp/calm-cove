// 确定性随机数：同一 seed + salt 永远得到同一序列，且不依赖全局状态。
// 不使用 Math.random，保证跨会话、跨重新生成的结果完全一致。

export function hash32(str) {
  let h = 2166136261 >>> 0
  const s = String(str)
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // 雪崩混合，降低相邻 seed 的序列相关性
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

export function mulberry32(seedInt) {
  let a = seedInt >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 生成一个带便捷方法的随机源 */
export function rngFor(seed, salt = '') {
  const next = mulberry32(hash32(`${seed}|${salt}`))
  const rng = {
    next,
    range(min, max) {
      return min + (max - min) * next()
    },
    int(min, max) {
      return Math.floor(min + (max - min + 1) * next())
    },
    pick(arr) {
      return arr[Math.min(arr.length - 1, Math.floor(next() * arr.length))]
    },
    chance(p) {
      return next() < p
    },
    sign() {
      return next() < 0.5 ? -1 : 1
    }
  }
  return rng
}

export function round(n, digits = 2) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** 生成稳定指纹，用来肉眼核验“同种子同结果” */
export function fingerprint(value) {
  const s = JSON.stringify(value)
  return (hash32(s) >>> 0).toString(16).padStart(8, '0').toUpperCase()
}
