// ---------- 过程式立面生成引擎 ----------
// 规则：桩号范围 -> 按立柱间距分跨 -> 每跨自下而上排布
//   金属吸声板(若干块) + 透明屏(中部) + 金属板 + 顶部弧形板
// 同一套参数 + 同一个种子 => 结果完全一致。
// 重新生成时 locked 的跨原样保留，其余跨按种子重算。

import type { GenParams, PanelMaterial, Question, Span } from "../types";
import { deriveSeed, makeRng } from "./prng";

const MATERIALS: PanelMaterial[] = ["metal-absorb", "metal-perf", "aluminum"];

/** 根据桩号长度与目标间距求跨数：使实际间距落在 [min,max] 内且最接近标准值 */
export function planSpanCount(
  length: number,
  std: number,
  min: number,
  max: number,
): { count: number; spacing: number; fits: boolean } {
  let best = { count: 0, spacing: 0, fits: false, err: Infinity };
  for (let n = 1; n <= 500; n++) {
    const s = length / n;
    const inRange = s >= min - 1e-9 && s <= max + 1e-9;
    const err = Math.abs(s - std) + (inRange ? 0 : 1000);
    if (err < best.err) best = { count: n, spacing: s, fits: inRange, err };
  }
  return { count: best.count, spacing: best.spacing, fits: best.fits };
}

/** 生成一整套跨(全新生成) */
export function generateSpans(q: Question, p: GenParams): Span[] {
  const length = q.stakeEnd - q.stakeStart;
  const { count, spacing } = planSpanCount(
    length,
    p.colSpacing,
    q.colSpacingMin,
    q.colSpacingMax,
  );
  const rng = makeRng(deriveSeed("gen", q.id, p));
  const spans: Span[] = [];
  for (let i = 0; i < count; i++) {
    spans.push(buildSpan(i, q.stakeStart + i * spacing, spacing, q, p, rng));
  }
  return spans;
}

function buildSpan(
  index: number,
  startStake: number,
  width: number,
  q: Question,
  p: GenParams,
  rng: ReturnType<typeof makeRng>,
): Span {
  // 高度：基准值 ±8% 的确定性波动，顶部弧形板矢高计入总高
  const height = round2(p.baseHeight * rng.range(0.94, 1.06));
  // 透明屏：目标比例 ±6%，布置在屏体中部偏上(0.45~0.7 倍高度处)
  const tH = round2(
    Math.min(height * rng.range(p.transparentRatio - 0.06, p.transparentRatio + 0.06), height * 0.8),
  );
  const tY = round2(rng.range(height * 0.35, Math.max(height * 0.35 + 0.01, height - tH - 0.3)));
  const opaque = height - tH;
  const panelCount = Math.max(1, Math.round(opaque / Math.max(p.panelHeight, 0.2)));
  return {
    index,
    startStake: round2(startStake),
    width: round2(width),
    height,
    transparentHeight: Math.max(0, tH),
    transparentY: Math.max(0, tY),
    material: rng.pick(MATERIALS),
    panelCount,
    arcRise: round2(p.arcRise * rng.range(0.9, 1.1)),
    seams: [],
    columnOffset: 0,
    locked: false,
    edited: false,
  };
}

/**
 * 重新生成：locked 跨原样保留，其余跨按同一种子重算。
 * 注意：重算使用与全新生成相同的 RNG 序列，因此未锁定跨的结果
 * 与"首次生成"完全一致 —— 同参同种子 => 结果一致。
 */
export function regenerateSpans(q: Question, p: GenParams, prev: Span[]): Span[] {
  const fresh = generateSpans(q, p);
  const byIndex = new Map(prev.map((s) => [s.index, s]));
  return fresh.map((f) => {
    const old = byIndex.get(f.index);
    if (old && old.locked) {
      // 保留手动跨，但里程/跨宽跟随新的分跨方案对齐
      return { ...old, startStake: f.startStake, width: old.width };
    }
    return f;
  });
}

/** 估算插入损失(简化教学模型)：高度 + 吸声构造 -> dB */
export function estimateNoiseReduction(spans: Span[]): number {
  if (spans.length === 0) return 0;
  const avgH = spans.reduce((a, s) => a + s.height, 0) / spans.length;
  const absorbRatio =
    spans.filter((s) => s.material !== "pc-board").length / spans.length;
  // 教学简化公式：基础 8dB + 每米高度 3.2dB + 吸声构造加成
  return round1(8 + avgH * 3.2 + absorbRatio * 4);
}

/** 整体透明屏占比(按面积) */
export function overallTransparentRatio(spans: Span[]): number {
  let t = 0;
  let all = 0;
  for (const s of spans) {
    t += s.transparentHeight * s.width;
    all += s.height * s.width;
  }
  return all > 0 ? t / all : 0;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
