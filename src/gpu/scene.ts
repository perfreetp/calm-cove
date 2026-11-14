// ---------- 由跨数据构建渲染场景 ----------
import type { PanelMaterial, Span, Violation } from "../types";
import type { Rect } from "../gpu/renderer";

const COL_W = 0.14; // 立柱截面宽(米)

const MATERIAL_COLORS: Record<PanelMaterial, [number, number, number, number]> = {
  "metal-absorb": [0.42, 0.56, 0.68, 1],
  "metal-perf": [0.5, 0.63, 0.42, 1],
  aluminum: [0.62, 0.66, 0.71, 1],
  "pc-board": [0.55, 0.78, 0.92, 0.55],
};
const COLUMN_COLOR: [number, number, number, number] = [0.25, 0.28, 0.33, 1];
const TRANSPARENT_COLOR: [number, number, number, number] = [0.56, 0.8, 0.94, 0.5];
const SEAM_COLOR: [number, number, number, number] = [0.13, 0.15, 0.2, 1];
const GROUND_COLOR: [number, number, number, number] = [0.55, 0.5, 0.45, 1];
const VIOLATION_COLOR: [number, number, number, number] = [0.9, 0.15, 0.15, 0.22];
const SELECT_COLOR: [number, number, number, number] = [0.1, 0.45, 0.9, 0.15];
const LOCK_COLOR: [number, number, number, number] = [0.95, 0.65, 0.1, 0.9];

export interface SceneLabel {
  x: number; // 世界坐标
  y: number;
  text: string;
  kind: "stake" | "height" | "violation" | "lock" | "span";
  spanIndex: number;
}

export interface Scene {
  rects: Rect[];
  labels: SceneLabel[];
  minX: number;
  maxX: number;
  maxY: number;
}

export function buildScene(
  spans: Span[],
  violations: Violation[],
  selectedSpan: number | null,
): Scene {
  const rects: Rect[] = [];
  const labels: SceneLabel[] = [];
  if (spans.length === 0) return { rects, labels, minX: 0, maxX: 1, maxY: 1 };

  const x0 = spans[0].startStake;
  const endX = spans[spans.length - 1].startStake + spans[spans.length - 1].width;
  const maxY = Math.max(...spans.map((s) => s.height + s.arcRise)) + 0.5;
  const violatedSpans = new Set(
    violations.filter((v) => v.spanIndex !== null).map((v) => v.spanIndex!),
  );

  // 地面
  rects.push({ x: x0 - 2, y: -0.3, w: endX - x0 + 4, h: 0.3, color: GROUND_COLOR });

  for (const s of spans) {
    const x = s.startStake;
    const col = MATERIAL_COLORS[s.material];
    const arcCol: [number, number, number, number] = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8, 1];

    // 选中/违规高亮衬底
    if (selectedSpan === s.index) {
      rects.push({ x: x - 0.05, y: 0, w: s.width + 0.1, h: s.height + s.arcRise + 0.15, color: SELECT_COLOR });
    }
    if (violatedSpans.has(s.index)) {
      rects.push({ x, y: 0, w: s.width, h: s.height + s.arcRise, color: VIOLATION_COLOR });
    }

    // 立柱(跨两端, 含手动偏移)
    const off = s.columnOffset;
    rects.push({ x: x + off - COL_W / 2, y: 0, w: COL_W, h: s.height + s.arcRise, color: COLUMN_COLOR });
    if (s.index === spans.length - 1) {
      rects.push({ x: x + s.width + off - COL_W / 2, y: 0, w: COL_W, h: s.height + s.arcRise, color: COLUMN_COLOR });
    }

    // 屏体：透明段 + 金属板段(按 panelCount 分块留缝)
    const tY0 = s.transparentY;
    const tY1 = s.transparentY + s.transparentHeight;
    const innerX = x + COL_W / 2;
    const innerW = s.width - COL_W;
    rects.push({ x: innerX, y: tY0, w: innerW, h: s.transparentHeight, color: TRANSPARENT_COLOR });

    const segments: Array<[number, number]> = [
      [0, tY0],
      [tY1, s.height],
    ];
    const panelH = Math.max(
      0.2,
      segments.reduce((a, [a0, a1]) => a + Math.max(0, a1 - a0), 0) / Math.max(1, s.panelCount),
    );
    for (const [a0, a1] of segments) {
      let y = a0;
      while (y < a1 - 0.01) {
        const h = Math.min(panelH - 0.03, a1 - y);
        if (h > 0.02) rects.push({ x: innerX, y, w: innerW, h, color: col });
        y += panelH;
      }
    }

    // 顶部弧形板：用叠层矩形逼近圆弧
    const SEG = 14;
    const R = (s.width * s.width) / (8 * s.arcRise) + s.arcRise / 2; // 圆弧半径
    for (let i = 0; i < SEG; i++) {
      const t0 = (i / SEG) * s.width;
      const t1 = ((i + 1) / SEG) * s.width;
      const mid = (t0 + t1) / 2 - s.width / 2;
      const rise = Math.sqrt(Math.max(0, R * R - mid * mid)) - (R - s.arcRise);
      rects.push({
        x: innerX + t0,
        y: s.height,
        w: t1 - t0 + 0.005,
        h: Math.max(0.02, rise),
        color: arcCol,
      });
    }

    // 装饰缝
    for (const sy of s.seams) {
      rects.push({ x: innerX, y: sy, w: innerW, h: 0.04, color: SEAM_COLOR });
    }

    // 锁定标记(顶部小旗)
    if (s.locked) {
      rects.push({ x: x + s.width / 2 - 0.09, y: s.height + s.arcRise + 0.12, w: 0.18, h: 0.18, color: LOCK_COLOR });
      labels.push({ x: x + s.width / 2, y: s.height + s.arcRise + 0.42, text: "🔒已锁定", kind: "lock", spanIndex: s.index });
    }

    // 标注
    labels.push({ x: x + s.width / 2, y: -0.55, text: `第${s.index + 1}跨`, kind: "span", spanIndex: s.index });
    labels.push({ x, y: -0.95, text: stakeText(x), kind: "stake", spanIndex: s.index });
    labels.push({
      x: x + s.width / 2,
      y: s.height + s.arcRise + (s.locked ? 0.72 : 0.18),
      text: `${s.height.toFixed(2)}m`,
      kind: "height",
      spanIndex: s.index,
    });
    if (violatedSpans.has(s.index)) {
      labels.push({ x: x + s.width / 2, y: s.height / 2, text: "⚠", kind: "violation", spanIndex: s.index });
    }
  }
  // 终点桩号
  labels.push({ x: endX, y: -0.95, text: stakeText(endX), kind: "stake", spanIndex: spans.length - 1 });

  return { rects, labels, minX: x0 - 2, maxX: endX + 2, maxY };
}

function stakeText(m: number): string {
  const km = Math.floor(m / 1000);
  const rest = m - km * 1000;
  return `K${km}+${rest.toFixed(0).padStart(3, "0")}`;
}
