// ---------- 自动评分 ----------
import type { GenParams, Question, Violation } from "../types";

/**
 * 合规分：满分100，按违规类型扣分
 *  高度超限/间距越界 每处 -12；整体指标(透明屏/桩号/降噪) 每项 -20
 */
export function complianceScore(violations: Violation[]): number {
  let score = 100;
  for (const v of violations) {
    switch (v.code) {
      case "HEIGHT_EXCEED":
      case "SPACING_RANGE":
        score -= 12;
        break;
      case "TRANSPARENT_LOW":
      case "STAKE_MISMATCH":
      case "NOISE_LOW":
        score -= 20;
        break;
    }
  }
  return Math.max(0, score);
}

/**
 * 参数分：学员填写参数与题目条件的匹配程度
 *  间距(25) 基准高度(25) 透明屏目标比例(25) 吸声板规格+矢高(25)
 */
export function paramScore(q: Question, p: GenParams): number {
  let score = 0;
  // 立柱间距落在允许区间且贴近标准值
  if (p.colSpacing >= q.colSpacingMin && p.colSpacing <= q.colSpacingMax) {
    const dev = Math.abs(p.colSpacing - q.colSpacingStd) / q.colSpacingStd;
    score += Math.round(25 * Math.max(0, 1 - dev * 4));
  }
  // 基准高度不超过限值且不低于限值的60%(经济性/有效性区间)
  if (p.baseHeight <= q.maxHeight && p.baseHeight >= q.maxHeight * 0.6) {
    const dev = Math.abs(p.baseHeight - q.maxHeight * 0.9) / q.maxHeight;
    score += Math.round(25 * Math.max(0, 1 - dev * 2));
  }
  // 透明屏目标比例达到题目下限
  if (p.transparentRatio >= q.transparentRatioMin) {
    const over = p.transparentRatio - q.transparentRatioMin;
    score += over <= 0.15 ? 25 : Math.max(10, 25 - Math.round((over - 0.15) * 100));
  }
  // 构造参数合理性：板高 0.4~0.6m，矢高 0.2~0.6m
  let sub = 0;
  if (p.panelHeight >= 0.4 && p.panelHeight <= 0.6) sub += 12;
  else if (p.panelHeight >= 0.3 && p.panelHeight <= 0.8) sub += 6;
  if (p.arcRise >= 0.2 && p.arcRise <= 0.6) sub += 13;
  else if (p.arcRise > 0 && p.arcRise <= 0.9) sub += 6;
  score += sub;
  return Math.min(100, score);
}

/** 总成绩合成：合规40% + 参数30% + 主观30% */
export function totalScore(
  compliance: number,
  param: number,
  teacher: number | null,
): number | null {
  if (teacher === null) return null;
  return Math.round(compliance * 0.4 + param * 0.3 + teacher * 0.3);
}
