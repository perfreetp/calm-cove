export const CANVAS_W = 800;
export const CANVAS_H = 500;
export const JOINT_LABELS = {
    head: '头', neck: '颈', pelvis: '骨盆',
    shoulderL: '左肩', elbowL: '左肘', handL: '左手',
    shoulderR: '右肩', elbowR: '右肘', handR: '右手',
    hipL: '左髋', kneeL: '左膝', ankleL: '左踝',
    hipR: '右髋', kneeR: '右膝', ankleR: '右踝',
};
/** 需求点名的可拖拽关键关节：肩 / 肘 / 髋 / 膝 / 踝 */
export const KEY_JOINTS = [
    'shoulderL', 'elbowL', 'hipL', 'kneeL', 'ankleL',
    'shoulderR', 'elbowR', 'hipR', 'kneeR', 'ankleR',
];
export const BONES = [
    ['neck', 'head'], ['neck', 'shoulderL'], ['neck', 'shoulderR'], ['neck', 'pelvis'],
    ['shoulderL', 'elbowL'], ['elbowL', 'handL'],
    ['shoulderR', 'elbowR'], ['elbowR', 'handR'],
    ['pelvis', 'hipL'], ['pelvis', 'hipR'],
    ['hipL', 'kneeL'], ['kneeL', 'ankleL'],
    ['hipR', 'kneeR'], ['kneeR', 'ankleR'],
];
export function easeInOut(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}
/** 求 t 时刻的插值姿态（循环播放，段插值方式取左端关键帧的 outMode） */
export function poseAt(anim, t) {
    const kfs = anim.keyframes;
    if (!kfs.length)
        return anim.skeleton.joints;
    if (kfs.length === 1)
        return kfs[0].pose;
    const D = anim.duration || 1;
    const tt = ((t % D) + D) % D;
    let i = kfs.length - 1;
    for (let k = 0; k < kfs.length; k++) {
        const a = kfs[k];
        const b = kfs[(k + 1) % kfs.length];
        const end = k === kfs.length - 1 ? D : b.t;
        if (tt >= a.t && tt < end) {
            i = k;
            break;
        }
    }
    const a = kfs[i];
    const b = kfs[(i + 1) % kfs.length];
    const span = (i === kfs.length - 1 ? D : b.t) - a.t;
    let u = span > 0 ? (tt - a.t) / span : 0;
    if (a.outMode === 'ease')
        u = easeInOut(u);
    const out = {};
    for (const j of Object.keys(anim.skeleton.joints)) {
        const pa = a.pose[j] ?? anim.skeleton.joints[j];
        const pb = b.pose[j] ?? anim.skeleton.joints[j];
        out[j] = { x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u };
    }
    return out;
}
/** 挂件在某一姿态下的位置与旋转（骨骼向量对齐，长轴沿骨骼方向） */
export function partTransform(part, bind, pose) {
    const [a, b] = part.bone;
    const ba = bind[a], bb = bind[b];
    const ca = pose[a] ?? ba, cb = pose[b] ?? bb;
    const angB = Math.atan2(bb.y - ba.y, bb.x - ba.x);
    const angC = Math.atan2(cb.y - ca.y, cb.x - ca.x);
    const midCx = (ca.x + cb.x) / 2, midCy = (ca.y + cb.y) / 2;
    const d = angC - angB;
    const ox = part.offset.x * Math.cos(d) - part.offset.y * Math.sin(d);
    const oy = part.offset.x * Math.sin(d) + part.offset.y * Math.cos(d);
    return { x: midCx + ox, y: midCy + oy, angle: angC * 180 / Math.PI + 90 + part.rot };
}
function partInner(part) {
    if (part.kind === 'image' && part.src) {
        return `<image href="${part.src}" x="${-part.w / 2}" y="${-part.h / 2}" width="${part.w}" height="${part.h}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    if (part.kind === 'ellipse') {
        return `<ellipse rx="${part.w / 2}" ry="${part.h / 2}" fill="${part.color}" stroke="#334155" stroke-width="1.5"/>`;
    }
    const r = Math.min(part.w, part.h) / 3;
    return `<rect x="${-part.w / 2}" y="${-part.h / 2}" width="${part.w}" height="${part.h}" rx="${r}" fill="${part.color}" stroke="#334155" stroke-width="1.5"/>`;
}
/** 生成人物内部 SVG 片段（供交互画布与序列帧导出共用） */
export function figureInnerHTML(anim, pose, skinId, withJoints) {
    const skin = anim.skins.find(s => s.id === skinId) ?? anim.skins[0];
    let s = '';
    if (skin) {
        for (const p of skin.parts) {
            const tr = partTransform(p, anim.skeleton.joints, pose);
            s += `<g transform="translate(${tr.x.toFixed(1)} ${tr.y.toFixed(1)}) rotate(${tr.angle.toFixed(1)})">${partInner(p)}</g>`;
        }
    }
    for (const [a, b] of BONES) {
        const pa = pose[a], pb = pose[b];
        if (!pa || !pb)
            continue;
        s += `<line class="bone" x1="${pa.x}" y1="${pa.y}" x2="${pb.x}" y2="${pb.y}"/>`;
    }
    if (withJoints) {
        for (const j of Object.keys(anim.skeleton.joints)) {
            const p = pose[j];
            if (!p)
                continue;
            const key = KEY_JOINTS.includes(j);
            s += `<circle class="joint ${key ? 'key' : 'oth'}" data-joint="${j}" cx="${p.x}" cy="${p.y}" r="${key ? 8 : 5}"><title>${JOINT_LABELS[j] ?? j}</title></circle>`;
        }
    }
    return s;
}
/** 独立完整 SVG 文档（序列帧导出用） */
export function figureSVGString(anim, pose, skinId) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="${CANVAS_W}" height="${CANVAS_H}">`
        + `<rect width="${CANVAS_W}" height="${CANVAS_H}" fill="#ffffff"/>`
        + `<rect x="0.5" y="0.5" width="${CANVAS_W - 1}" height="${CANVAS_H - 1}" fill="none" stroke="#cbd5e1"/>`
        + figureInnerHTML(anim, pose, skinId, false)
        + `</svg>`;
}
//# sourceMappingURL=rig.js.map