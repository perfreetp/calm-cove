// ---------- 实时合规检查 ----------
import type { Question, Span, Violation } from "../types";
import { estimateNoiseReduction, overallTransparentRatio, round2 } from "./generate";
import { formatStake } from "./stake";

const EPS = 0.005; // 5mm 容差

export function validateElevation(q: Question, spans: Span[]): Violation[] {
  const out: Violation[] = [];

  // 1. 高度超限(逐跨)
  for (const s of spans) {
    if (s.height > q.maxHeight + EPS) {
      out.push({
        code: "HEIGHT_EXCEED",
        spanIndex: s.index,
        message: `第${s.index + 1}跨屏体总高 ${s.height.toFixed(2)}m 超过限值 ${q.maxHeight}m`,
        examPoint: "高度控制",
      });
    }
  }

  // 2. 立柱间距(逐跨, 含手动调立柱后的实际间距)
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    const prevOff = i > 0 ? spans[i - 1].columnOffset : 0;
    const actual = s.width - prevOff + s.columnOffset;
    if (actual < q.colSpacingMin - EPS || actual > q.colSpacingMax + EPS) {
      out.push({
        code: "SPACING_RANGE",
        spanIndex: s.index,
        message: `第${i + 1}跨实际立柱间距 ${round2(actual)}m 超出允许区间 [${q.colSpacingMin}, ${q.colSpacingMax}]m`,
        examPoint: "立柱间距",
      });
    }
  }

  // 3. 透明屏占比(整体)
  const ratio = overallTransparentRatio(spans);
  if (ratio < q.transparentRatioMin - 1e-6) {
    out.push({
      code: "TRANSPARENT_LOW",
      spanIndex: null,
      message: `整体透明屏占比 ${(ratio * 100).toFixed(1)}% 低于要求 ${(q.transparentRatioMin * 100).toFixed(0)}%`,
      examPoint: "透明屏配比",
    });
  }

  // 4. 跨数与桩号核算：累计里程须等于桩号范围
  const total = spans.reduce((a, s) => a + s.width, 0);
  const expect = q.stakeEnd - q.stakeStart;
  if (Math.abs(total - expect) > 0.01) {
    out.push({
      code: "STAKE_MISMATCH",
      spanIndex: null,
      message: `${spans.length}跨累计 ${total.toFixed(2)}m 与桩号范围 ${formatStake(q.stakeStart)}~${formatStake(q.stakeEnd)} (${expect.toFixed(2)}m) 不符`,
      examPoint: "桩号核算",
    });
  }

  // 5. 降噪量估算
  const nr = estimateNoiseReduction(spans);
  if (nr < q.noiseReqDb) {
    out.push({
      code: "NOISE_LOW",
      spanIndex: null,
      message: `估算插入损失 ${nr}dB 低于降噪要求 ${q.noiseReqDb}dB`,
      examPoint: "降噪设计",
    });
  }

  return out;
}
