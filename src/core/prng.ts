// ---------- 确定性随机数内核 ----------
// 同一套参数 + 同一个种子 => 每次生成结果完全一致

/** 字符串 -> 32位种子 (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG：快速、可复现 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 由任意可序列化对象派生确定性种子 */
export function deriveSeed(...parts: unknown[]): number {
  return hashString(parts.map((p) => JSON.stringify(p)).join("|"));
}

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: number): Rng {
  const f = mulberry32(seed);
  return {
    next: f,
    range: (min, max) => min + f() * (max - min),
    int: (min, max) => Math.floor(min + f() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(f() * arr.length)],
  };
}
