import { CANVAS_H, CANVAS_W } from './rig.js';
import { seededRandom, today } from './dom.js';
export const EXPECTED_PARTS = 10; // 标准拆件数：头/躯干/上臂×2/前臂×2/大腿×2/小腿×2
export const MIN_FRAMES = 12; // 帧数下限
export const ISSUE_LABEL = {
    'missing-part': '缺件',
    'bind-out': '绑点飞出画布',
    'insufficient-frames': '帧数不足12帧',
};
export const SEVERITY_LABEL = { severe: '严重', normal: '一般' };
export const ISSUE_STATUS_LABEL = { open: '待复核', confirmed: '已确认', rejected: '已驳回' };
export const BATCH_STATUS_LABEL = { review: '待复核', released: '已放行', returned: '已退回' };
/** 批次自动检查：缺件 / 绑点飞出画布 / 帧数不足，按严重与一般分级 */
export function runChecks(items, uid) {
    const issues = [];
    const log = [];
    log.push(`[自动检查] 共 ${items.length} 个素材，标准拆件数 ${EXPECTED_PARTS}，帧数下限 ${MIN_FRAMES}，画布 ${CANVAS_W}×${CANVAS_H}`);
    for (const it of items) {
        log.push(`— 检查「${it.name}」：拆件 ${it.parts} 个，${it.frames} 帧，绑点 ${it.bindPoints.length} 个`);
        if (it.parts < EXPECTED_PARTS) {
            issues.push({
                id: uid(), itemName: it.name, type: 'missing-part', severity: 'severe',
                detail: `拆件 ${it.parts}/${EXPECTED_PARTS}，缺 ${EXPECTED_PARTS - it.parts} 件`, status: 'open',
            });
            log.push(`  ✗ [严重] 缺件：${it.parts}/${EXPECTED_PARTS}`);
        }
        const out = it.bindPoints.filter(p => p.x < 0 || p.x > CANVAS_W || p.y < 0 || p.y > CANVAS_H);
        if (out.length) {
            issues.push({
                id: uid(), itemName: it.name, type: 'bind-out', severity: 'severe',
                detail: `${out.length} 个绑点超出画布（如 ${out[0].x.toFixed(0)}, ${out[0].y.toFixed(0)}）`, status: 'open',
            });
            log.push(`  ✗ [严重] ${out.length} 个绑点飞出画布`);
        }
        if (it.frames < MIN_FRAMES) {
            issues.push({
                id: uid(), itemName: it.name, type: 'insufficient-frames', severity: 'normal',
                detail: `仅 ${it.frames} 帧，低于 ${MIN_FRAMES} 帧下限`, status: 'open',
            });
            log.push(`  ✗ [一般] 帧数不足：${it.frames}/${MIN_FRAMES}`);
        }
        if (it.parts >= EXPECTED_PARTS && !out.length && it.frames >= MIN_FRAMES)
            log.push('  ✓ 通过');
    }
    log.push(`[自动检查] 完成，发现 ${issues.length} 条问题（严重 ${issues.filter(i => i.severity === 'severe').length} / 一般 ${issues.filter(i => i.severity === 'normal').length}）`);
    return { issues, log };
}
export function batchCounts(b) {
    const open = b.issues.filter(i => i.status === 'open').length;
    const confirmed = b.issues.filter(i => i.status === 'confirmed').length;
    const rejected = b.issues.filter(i => i.status === 'rejected').length;
    return { open, confirmed, rejected, total: b.issues.length };
}
/* ---------------- 种子数据 ---------------- */
const STAND = {
    head: { x: 400, y: 78 }, neck: { x: 400, y: 118 }, pelvis: { x: 400, y: 238 },
    shoulderL: { x: 362, y: 128 }, elbowL: { x: 344, y: 180 }, handL: { x: 338, y: 230 },
    shoulderR: { x: 438, y: 128 }, elbowR: { x: 456, y: 180 }, handR: { x: 462, y: 230 },
    hipL: { x: 382, y: 244 }, kneeL: { x: 378, y: 330 }, ankleL: { x: 374, y: 416 },
    hipR: { x: 418, y: 244 }, kneeR: { x: 422, y: 330 }, ankleR: { x: 426, y: 416 },
};
const RUN_POSES = [
    {
        head: { x: 404, y: 66 }, neck: { x: 402, y: 104 }, pelvis: { x: 398, y: 222 },
        shoulderL: { x: 366, y: 112 }, elbowL: { x: 392, y: 150 }, handL: { x: 418, y: 136 },
        shoulderR: { x: 438, y: 110 }, elbowR: { x: 414, y: 152 }, handR: { x: 386, y: 140 },
        hipL: { x: 384, y: 226 }, kneeL: { x: 436, y: 296 }, ankleL: { x: 478, y: 392 },
        hipR: { x: 412, y: 226 }, kneeR: { x: 362, y: 306 }, ankleR: { x: 318, y: 388 },
    },
    {
        head: { x: 400, y: 58 }, neck: { x: 400, y: 96 }, pelvis: { x: 400, y: 212 },
        shoulderL: { x: 364, y: 104 }, elbowL: { x: 348, y: 152 }, handL: { x: 344, y: 198 },
        shoulderR: { x: 436, y: 104 }, elbowR: { x: 452, y: 152 }, handR: { x: 456, y: 198 },
        hipL: { x: 384, y: 216 }, kneeL: { x: 402, y: 298 }, ankleL: { x: 390, y: 384 },
        hipR: { x: 416, y: 216 }, kneeR: { x: 394, y: 300 }, ankleR: { x: 412, y: 382 },
    },
    {
        head: { x: 396, y: 66 }, neck: { x: 398, y: 104 }, pelvis: { x: 402, y: 222 },
        shoulderL: { x: 362, y: 110 }, elbowL: { x: 386, y: 152 }, handL: { x: 414, y: 140 },
        shoulderR: { x: 434, y: 112 }, elbowR: { x: 408, y: 150 }, handR: { x: 382, y: 136 },
        hipL: { x: 388, y: 226 }, kneeL: { x: 438, y: 306 }, ankleL: { x: 482, y: 388 },
        hipR: { x: 416, y: 226 }, kneeR: { x: 364, y: 296 }, ankleR: { x: 322, y: 392 },
    },
    {
        head: { x: 400, y: 58 }, neck: { x: 400, y: 96 }, pelvis: { x: 400, y: 212 },
        shoulderL: { x: 364, y: 104 }, elbowL: { x: 350, y: 150 }, handL: { x: 348, y: 196 },
        shoulderR: { x: 436, y: 104 }, elbowR: { x: 450, y: 150 }, handR: { x: 452, y: 196 },
        hipL: { x: 384, y: 216 }, kneeL: { x: 396, y: 300 }, ankleL: { x: 386, y: 382 },
        hipR: { x: 416, y: 216 }, kneeR: { x: 400, y: 298 }, ankleR: { x: 416, y: 384 },
    },
];
function makeParts(uid, colorA, colorB) {
    const defs = [
        ['头', ['neck', 'head'], 30, 34, colorB, 'ellipse'],
        ['躯干', ['neck', 'pelvis'], 30, 100, colorA, 'rect'],
        ['左上臂', ['shoulderL', 'elbowL'], 14, 52, colorA, 'rect'],
        ['左前臂', ['elbowL', 'handL'], 12, 50, colorB, 'rect'],
        ['右上臂', ['shoulderR', 'elbowR'], 14, 52, colorA, 'rect'],
        ['右前臂', ['elbowR', 'handR'], 12, 50, colorB, 'rect'],
        ['左大腿', ['hipL', 'kneeL'], 17, 84, colorA, 'rect'],
        ['左小腿', ['kneeL', 'ankleL'], 13, 84, colorB, 'rect'],
        ['右大腿', ['hipR', 'kneeR'], 17, 84, colorA, 'rect'],
        ['右小腿', ['kneeR', 'ankleR'], 13, 84, colorB, 'rect'],
    ];
    return defs.map(([name, bone, w, h, color, kind]) => ({
        id: uid(), name, bone, offset: { x: 0, y: 0 }, rot: 0, w, h, color, kind,
    }));
}
function makeMetrics(seed) {
    const rnd = seededRandom(seed);
    const pts = [];
    for (let i = 0; i < 24; i++) {
        const cadence = Math.round(188 + 13 * Math.sin(i / 3.1 + rnd() * 2) + (rnd() - 0.5) * 10);
        const contact = Math.round(305 - cadence * 0.55 + (rnd() - 0.5) * 24);
        pts.push({ t: i * 5, cadence, contact });
    }
    return pts;
}
function makeAnim(uid, name, skins, released) {
    const kfs = RUN_POSES.map((pose, i) => ({
        id: uid(), t: i * 0.25, pose: JSON.parse(JSON.stringify(pose)),
        outMode: i % 2 === 0 ? 'ease' : 'linear',
    }));
    const skinObjs = skins.map(([sname, athlete, cA, cB]) => ({
        id: uid(), name: sname, athlete, parts: makeParts(uid, cA, cB),
    }));
    return {
        id: uid(), name, duration: 1.0,
        skeleton: { joints: JSON.parse(JSON.stringify(STAND)) },
        keyframes: kfs, skins: skinObjs, activeSkinId: skinObjs[0].id,
        metrics: makeMetrics(name), released, createdAt: today(),
    };
}
export function seedState(uid) {
    const a1 = makeAnim(uid, '示范跑姿A', [['标准皮肤', '林晓峰', '#3b82f6', '#93c5fd'], ['备用皮肤', '林晓峰', '#6366f1', '#a5b4fc']], true);
    const a2 = makeAnim(uid, '示范跑姿B', [['标准皮肤', '陈志远', '#0d9e6e', '#6ee7b7']], false);
    const a3 = makeAnim(uid, '冲刺跑姿C', [['标准皮肤', '王可欣', '#d97706', '#fcd34d']], false);
    const b1items = [
        { name: '冲刺跑姿C_拆件包', parts: 8, frames: 24, bindPoints: [{ x: 100, y: 100 }, { x: 300, y: 200 }] },
        { name: '示范跑姿B_序列帧', parts: 10, frames: 9, bindPoints: [{ x: 120, y: 140 }, { x: 400, y: 300 }] },
        { name: '越野上坡_拆件包', parts: 10, frames: 16, bindPoints: [{ x: 80, y: 90 }, { x: 860, y: 120 }, { x: 200, y: 540 }] },
        { name: '越野下坡_拆件包', parts: 10, frames: 18, bindPoints: [{ x: 150, y: 160 }, { x: 500, y: 260 }] },
    ];
    const chk1 = runChecks(b1items, uid);
    const b1 = {
        id: uid(), name: 'B-2026-041', supplier: '疾风素材社', submittedAt: today(),
        items: b1items, issues: chk1.issues, status: 'review', checkLog: chk1.log,
        animNames: ['冲刺跑姿C', '示范跑姿B'],
    };
    const b2items = [
        { name: '示范跑姿A_拆件包', parts: 10, frames: 24, bindPoints: [{ x: 100, y: 120 }, { x: 350, y: 260 }] },
        { name: '示范跑姿A_序列帧', parts: 10, frames: 24, bindPoints: [{ x: 200, y: 200 }, { x: 420, y: 330 }] },
    ];
    const chk2 = runChecks(b2items, uid);
    const b2 = {
        id: uid(), name: 'B-2026-038', supplier: '山岭影像', submittedAt: '2026-11-08',
        items: b2items, issues: chk2.issues, status: 'released', checkLog: chk2.log,
        animNames: ['示范跑姿A'],
    };
    b2.checkLog.push('[复核] 全部检查通过，批次放行');
    const b3items = [
        { name: '长距离巡航_拆件包', parts: 7, frames: 10, bindPoints: [{ x: 60, y: 80 }, { x: 920, y: 400 }] },
    ];
    const chk3 = runChecks(b3items, uid);
    chk3.issues.forEach(i => { i.status = 'confirmed'; i.reviewedAt = '2026-10-30'; });
    const b3 = {
        id: uid(), name: 'B-2026-033', supplier: '疾风素材社', submittedAt: '2026-10-28',
        items: b3items, issues: chk3.issues, status: 'returned', checkLog: chk3.log,
        animNames: [],
    };
    b3.checkLog.push('[复核] 3 条问题全部确认，批次退回供应方并附问题清单');
    return {
        anims: [a1, a2, a3],
        batches: [b1, b2, b3],
        ui: { role: 'animator', selAnim: a1.id, selBatch: b1.id },
    };
}
//# sourceMappingURL=seed.js.map