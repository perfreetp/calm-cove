import { ACTION_NODES, getMetric, getNode } from '../data/constants';
import type {
  AnimationDoc,
  AutoScoreResult,
  NodeScoreDetail,
  Violation,
} from '../types';
import { sampleTrack, sampleTimes } from './animation';

let violationSeq = 0;
function v(
  nodeId: string,
  type: Violation['type'],
  message: string,
  start: number,
  end: number,
): Violation {
  violationSeq += 1;
  return { id: `v-${violationSeq}`, nodeId, type, message, start, end };
}

/** 把逐采样点的布尔判定合并成连续违规区间 */
function collectIntervals(
  times: number[],
  isBad: (t: number) => boolean,
  nodeId: string,
  type: Violation['type'],
  message: (a: number, b: number) => string,
): Violation[] {
  const out: Violation[] = [];
  let badStart: number | null = null;
  for (const t of times) {
    if (isBad(t)) {
      if (badStart === null) badStart = t;
    } else if (badStart !== null) {
      const end = t;
      out.push(v(nodeId, type, message(badStart, end), badStart, end));
      badStart = null;
    }
  }
  if (badStart !== null) {
    const end = times[times.length - 1];
    out.push(v(nodeId, type, message(badStart, end), badStart, end));
  }
  return out;
}

const STEP = 0.5;

/** 全量规范校验:返回用于时间轴标红与评分的违规区间 */
export function detectViolations(doc: AnimationDoc): Violation[] {
  const violations: Violation[] = [];
  const times = sampleTimes(doc, STEP);

  // 1. 节点完整性与顺序
  const present = ACTION_NODES.map((n) => {
    const r = doc.nodeRanges[n.id];
    return { node: n, range: r };
  });
  for (const { node, range } of present) {
    if (!range) {
      violations.push(
        v(node.id, 'coverage', `动作节点「${node.name}」未在时间轴上布置`, 0, 0),
      );
    }
  }
  const ordered = present
    .filter((x): x is { node: (typeof present)[number]['node']; range: { start: number; end: number } } => !!x.range)
    .sort((a, b) => a.range.start - b.range.start);
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (cur.range.start < prev.range.end - 1e-6) {
      violations.push(
        v(
          cur.node.id,
          'order',
          `「${cur.node.name}」与「${prev.node.name}」时间区间重叠,动作顺序不符合采血流程`,
          cur.range.start,
          Math.min(cur.range.end, prev.range.end),
        ),
      );
    }
    const expectedPrev = ACTION_NODES.find((n) => n.id === prev.node.id);
    const expectedCur = ACTION_NODES.find((n) => n.id === cur.node.id);
    if (expectedPrev && expectedCur && expectedCur.order < expectedPrev.order) {
      violations.push(
        v(cur.node.id, 'order', `「${cur.node.name}」出现在「${prev.node.name}」之前,流程顺序颠倒`, cur.range.start, cur.range.end),
      );
    }
  }

  // 2. 逐节点:时长 / 指标区间 / 关节限位 / 关键帧覆盖
  for (const node of ACTION_NODES) {
    const range = doc.nodeRanges[node.id];
    if (!range) continue;
    const dur = range.end - range.start;

    if (dur < node.minDuration) {
      violations.push(
        v(
          node.id,
          'duration',
          `「${node.name}」时长 ${dur.toFixed(1)}s,低于规范下限 ${node.minDuration}s`,
          range.start,
          range.end,
        ),
      );
    }
    if (node.maxDuration !== null && dur > node.maxDuration) {
      violations.push(
        v(
          node.id,
          'duration',
          `「${node.name}」时长 ${dur.toFixed(1)}s,超过规范上限 ${node.maxDuration}s`,
          range.start,
          range.end,
        ),
      );
    }

    const localTimes = times.filter((t) => t >= range.start - 1e-6 && t <= range.end + 1e-6);

    // 指标(进针角度 / 按压力度)
    for (const metricId of node.metrics) {
      const metric = getMetric(metricId);
      const hasFrames = doc.keyframes.some((f) => f.track === metricId);
      if (!hasFrames) {
        violations.push(
          v(
            node.id,
            'coverage',
            `「${node.name}」缺少${metric.name}关键帧,无法判定是否落在 ${metric.min}~${metric.max}${metric.unit} 规范区间`,
            range.start,
            range.end,
          ),
        );
        continue;
      }
      const bad = collectIntervals(
        localTimes,
        (t) => {
          const val = sampleTrack(doc.keyframes, metricId, t);
          return val === null || val < metric.min || val > metric.max;
        },
        node.id,
        'metric',
        () =>
          `${metric.name}超出规范区间 ${metric.min}~${metric.max}${metric.unit}`,
      );
      violations.push(...bad);
    }

    // 关节旋转范围
    for (const bone of doc.bones) {
      const boneTimes = localTimes;
      const bad = collectIntervals(
        boneTimes,
        (t) => {
          const sampled = sampleTrack(doc.keyframes, bone.id, t);
          const requested = sampled ?? bone.restAngle;
          return requested < bone.minAngle || requested > bone.maxAngle;
        },
        node.id,
        'joint',
        () => `「${bone.name}」关节旋转超出限位 ${bone.minAngle}°~${bone.maxAngle}°`,
      );
      violations.push(...bad);
    }

    // 动作覆盖:节点区间内至少有一条骨骼关键帧
    const hasMotion = doc.keyframes.some(
      (f) =>
        f.kind === 'bone' &&
        f.time >= range.start - 1e-6 &&
        f.time <= range.end + 1e-6,
    );
    if (!hasMotion) {
      violations.push(
        v(node.id, 'coverage', `「${node.name}」区间内没有任何骨骼关键帧,动作缺失`, range.start, range.end),
      );
    }
  }

  return violations.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** 自动评分:关键帧时间、关节角度、动作总时长三个维度 */
export function autoScore(doc: AnimationDoc): AutoScoreResult {
  const violations = detectViolations(doc);
  const times = sampleTimes(doc, STEP);
  const nodeScores: NodeScoreDetail[] = [];

  for (const node of ACTION_NODES) {
    const range = doc.nodeRanges[node.id];
    const nodeV = violations.filter((x) => x.nodeId === node.id);

    // 时长分(40%)
    let durationScore = 40;
    if (!range) {
      durationScore = 0;
    } else {
      const dur = range.end - range.start;
      if (dur < node.minDuration) {
        durationScore = Math.round((dur / node.minDuration) * 40);
      } else if (node.maxDuration !== null && dur > node.maxDuration) {
        durationScore = Math.round(Math.max(0, 40 - (dur - node.maxDuration) * 2));
      }
    }

    // 指标分(35%):按区间内合格采样时间占比
    let metricScore = 35;
    if (range) {
      const localTimes = times.filter((t) => t >= range.start - 1e-6 && t <= range.end + 1e-6);
      if (node.metrics.length > 0) {
        let good = 0;
        let total = 0;
        for (const metricId of node.metrics) {
          const metric = getMetric(metricId);
          const hasFrames = doc.keyframes.some((f) => f.track === metricId);
          for (const t of localTimes) {
            total += 1;
            const val = sampleTrack(doc.keyframes, metricId, t);
            if (hasFrames && val !== null && val >= metric.min && val <= metric.max) good += 1;
          }
        }
        metricScore = total === 0 ? 0 : Math.round((good / total) * 35);
      }
    } else {
      metricScore = 0;
    }

    // 关节分(25%):区间内各骨骼采样合格率
    let jointScore = 25;
    if (range) {
      const localTimes = times.filter((t) => t >= range.start - 1e-6 && t <= range.end + 1e-6);
      let good = 0;
      let total = 0;
      for (const bone of doc.bones) {
        for (const t of localTimes) {
          total += 1;
          const sampled = sampleTrack(doc.keyframes, bone.id, t);
          const requested = sampled ?? bone.restAngle;
          if (requested >= bone.minAngle && requested <= bone.maxAngle) good += 1;
        }
      }
      jointScore = total === 0 ? 0 : Math.round((good / total) * 25);
    } else {
      jointScore = 0;
    }

    // 动作缺失/顺序错误的节点直接封顶 60
    let score = durationScore + metricScore + jointScore;
    const fatal = nodeV.some((x) => x.type === 'coverage' || x.type === 'order');
    if (fatal) score = Math.min(score, 60);

    nodeScores.push({
      nodeId: node.id,
      score,
      durationScore,
      metricScore,
      jointScore,
      violations: nodeV,
    });
  }

  const total = Math.round(
    nodeScores.reduce((s, n) => s + n.score, 0) / Math.max(1, nodeScores.length),
  );

  return { total, nodeScores, violations };
}

/** 全班错得最多的三个动作(按违规人次聚合) */
export function classTopMistakes(
  docs: AnimationDoc[],
): { nodeId: string; nodeName: string; count: number; breakdown: Record<string, number> }[] {
  const counter = new Map<string, { count: number; breakdown: Record<string, number> }>();
  for (const doc of docs) {
    const vs = detectViolations(doc);
    const seenNodes = new Set<string>();
    for (const viol of vs) {
      const entry = counter.get(viol.nodeId) ?? { count: 0, breakdown: {} };
      if (!seenNodes.has(viol.nodeId)) {
        entry.count += 1;
        seenNodes.add(viol.nodeId);
      }
      entry.breakdown[viol.type] = (entry.breakdown[viol.type] ?? 0) + 1;
      counter.set(viol.nodeId, entry);
    }
  }
  return [...counter.entries()]
    .map(([nodeId, x]) => ({
      nodeId,
      nodeName: getNode(nodeId).name,
      count: x.count,
      breakdown: x.breakdown,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

export const VIOLATION_TYPE_LABEL: Record<Violation['type'], string> = {
  duration: '时长违规',
  metric: '指标越界',
  joint: '关节越限',
  order: '顺序错误',
  coverage: '内容缺失',
};
