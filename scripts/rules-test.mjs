// 规则引擎单元测试:通过 vite 的 SSR 模块加载直接跑 TS
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const vite = await createServer({
  root: path.resolve(root, '..'),
  server: { middlewareMode: true },
  logLevel: 'silent',
});
const s = vite.ssrLoadModule.bind(vite);

const { createTemplateDoc } = await s(path.resolve(root, '..', 'src/data/constants.ts'));
const { autoScore, detectViolations, classTopMistakes } = await s(path.resolve(root, '..', 'src/lib/rules.ts'));
const { evaluatePose, sampleTrack, cubicBezier } = await s(path.resolve(root, '..', 'src/lib/animation.ts'));

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
};

// 1. 标准课件零违规、满分
const doc = createTemplateDoc();
const violations = detectViolations(doc);
ok('标准课件零违规', violations.length === 0, `${violations.length} 处: ${violations.map((v) => v.message).join(' / ')}`);
const scored = autoScore(doc);
ok('标准课件总分 100', scored.total === 100, `实际 ${scored.total}`);
ok('五节点各自满分', scored.nodeScores.every((n) => n.score === 100), scored.nodeScores.map((n) => `${n.nodeId}=${n.score}`).join(','));

// 2. 消毒不足 30 秒 → 时长违规
const shortDisinfect = structuredClone(doc);
shortDisinfect.nodeRanges.disinfect = { start: 0, end: 20 };
const v1 = detectViolations(shortDisinfect).filter((x) => x.nodeId === 'disinfect' && x.type === 'duration');
ok('消毒 20s 触发时长违规', v1.length > 0 && v1[0].message.includes('30'));

// 3. 进针角度越界
const badAngle = structuredClone(doc);
badAngle.keyframes = badAngle.keyframes.map((k) =>
  k.track === 'needleAngle' ? { ...k, value: 40 } : k,
);
const v2 = detectViolations(badAngle).filter((x) => x.type === 'metric');
ok('进针角度 40° 触发指标越界', v2.length > 0);
ok('指标违规区间落在进针段', v2.every((x) => x.nodeId === 'insert'));

// 4. 按压不足 180 秒
const shortPress = structuredClone(doc);
shortPress.nodeRanges.press = { start: 64, end: 200 };
const v3 = detectViolations(shortPress).filter((x) => x.nodeId === 'press' && x.type === 'duration');
ok('按压 136s 触发时长违规(要求 180s)', v3.length > 0);

// 5. 关节越限(前臂限位上限 100)
const badJoint = structuredClone(doc);
badJoint.keyframes.push({ id: 'x1', time: 50, track: 'forearm', kind: 'bone', value: 128, easing: 'linear' });
const v4 = detectViolations(badJoint).filter((x) => x.type === 'joint');
ok('前臂 128° 触发关节越限', v4.length > 0);

// 6. 节点顺序颠倒
const wrongOrder = structuredClone(doc);
wrongOrder.nodeRanges.press = { start: 10, end: 30 };
const v5 = detectViolations(wrongOrder).filter((x) => x.type === 'order' || x.type === 'duration');
ok('区间重叠/顺序异常被检出', v5.length > 0);

// 7. 缺失关键帧 → coverage
const empty = structuredClone(doc);
empty.keyframes = empty.keyframes.filter((k) => k.track !== 'needleAngle');
const v6 = detectViolations(empty).filter((x) => x.nodeId === 'insert');
ok('缺进针角度关键帧被检出', v6.some((x) => x.type === 'coverage'));

// 8. 缓动:线性 vs 缓入缓出在 1/4 处的进度差异(中点处二者都为 0.5)
const lin = sampleTrack(
  [
    { id: 'a', time: 0, track: 't', kind: 'bone', value: 0, easing: 'linear' },
    { id: 'b', time: 10, track: 't', kind: 'bone', value: 10, easing: 'linear' },
  ],
  't',
  2.5,
);
const ease = sampleTrack(
  [
    { id: 'a', time: 0, track: 't', kind: 'bone', value: 0, easing: 'easeInOut' },
    { id: 'b', time: 10, track: 't', kind: 'bone', value: 10, easing: 'easeInOut' },
  ],
  't',
  2.5,
);
ok('线性 1/4 处=2.5、缓入缓出起步更慢(<2.5)', lin === 2.5 && ease < 2.5 && ease > 0, `${lin}/${ease.toFixed(3)}`);

// 9. 自定义贝塞尔
const bez = cubicBezier(0.25, 0.1, 0.25, 1);
ok('贝塞尔端点正确', bez(0) === 0 && bez(1) === 1 && bez(0.5) > 0 && bez(0.5) < 1);

// 10. 正运动学:根骨骼世界坐标与层级传递
const pose0 = evaluatePose(doc, 0);
ok('躯干根骨骼世界坐标正确', pose0.get('torso').wx === 380 && pose0.get('torso').wy === 430);
const forearmPose = pose0.get('forearm');
ok('子骨骼世界位姿已计算', Number.isFinite(forearmPose.wx) && Number.isFinite(forearmPose.worldAngle));

// 11. TOP3 错题聚合
const top = classTopMistakes([shortDisinfect, badAngle, shortPress]);
ok('错题聚合返回最多三项', top.length <= 3 && top.length >= 1);
ok('错题榜首可定位节点名', typeof top[0].nodeName === 'string' && top[0].count >= 1);

// 12. 自动评分维度权重:时长/指标/关节
ok('评分维度齐全(40+35+25)', scored.nodeScores[0].durationScore === 40 && scored.nodeScores[0].metricScore === 35 && scored.nodeScores[0].jointScore === 25);

await vite.close();
console.log(failures === 0 ? '\n🎉 规则引擎全部测试通过' : `\n💥 ${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
