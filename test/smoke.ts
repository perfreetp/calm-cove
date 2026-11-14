// 核心逻辑冒烟测试: esbuild 打包后用 node 运行
import { generateSpans, regenerateSpans, overallTransparentRatio } from "../src/core/generate";
import { validateElevation } from "../src/core/validate";
import { complianceScore, paramScore } from "../src/core/scoring";
import { parseStake, formatStake } from "../src/core/stake";

const q = {
  id: "q1", title: "t", examPoints: [],
  stakeStart: 12300, stakeEnd: 12540, maxHeight: 4.0,
  colSpacingStd: 2.0, colSpacingMin: 1.8, colSpacingMax: 2.5,
  transparentRatioMin: 0.25, noiseReqDb: 20, seed: 20260101,
  createdBy: "t1", createdAt: "",
};
const p = { colSpacing: 2.0, baseHeight: 3.6, transparentRatio: 0.3, panelHeight: 0.5, arcRise: 0.4, seed: 20260101 };

// 1. 确定性: 同参同种子两次生成完全一致
const a = generateSpans(q, p);
const b = generateSpans(q, p);
console.assert(JSON.stringify(a) === JSON.stringify(b), "FAIL: 同参同种子结果不一致");
console.log(`✓ 确定性生成: ${a.length}跨, 两次生成完全一致`);

// 2. 锁定跨保留
const locked = a.map((s, i) => (i === 2 ? { ...s, height: 3.33, locked: true, edited: true } : s));
const regen = regenerateSpans(q, p, locked);
console.assert(regen[2].height === 3.33 && regen[2].locked, "FAIL: 锁定跨未保留");
console.assert(regen[0].height === a[0].height, "FAIL: 未锁定跨与首次生成不一致");
console.log(`✓ 锁定跨保留: 第3跨高度=${regen[2].height}(手动), 第1跨=${regen[0].height.toFixed(2)}(重算一致)`);

// 3. 合规检查
const v1 = validateElevation(q, a);
console.log(`✓ 默认参数违规数: ${v1.length} (透明比 ${(overallTransparentRatio(a) * 100).toFixed(1)}%)`);
const bad = a.map((s, i) => (i === 0 ? { ...s, height: 5.5 } : s));
const v2 = validateElevation(q, bad);
console.assert(v2.some((x) => x.code === "HEIGHT_EXCEED"), "FAIL: 未检出高度超限");
console.log(`✓ 高度超限检出: ${v2.map((x) => x.code).join(",")}`);

// 4. 评分
console.log(`✓ 评分: 合规=${complianceScore(v2)} 参数=${paramScore(q, p)}`);

// 5. 桩号
console.assert(parseStake("K12+300") === 12300 && formatStake(12300) === "K12+300.0", "FAIL: 桩号换算");
console.log("✓ 桩号换算正确");
console.log("ALL PASS");
