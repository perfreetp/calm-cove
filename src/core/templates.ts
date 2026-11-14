import { worldTransforms } from './skeleton';
import type { Bone, Part, PartGroup, RGBA, Rig, Vec2 } from './types';

export interface RigTemplate {
  id: string;
  name: string;
  description: string;
  defaultDuration: number;
  build: () => Rig;
}

interface EllipseOpts {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  segments?: number;
  rotation?: number;
}

function ellipsePoints({ cx, cy, rx, ry, segments = 40, rotation = 0 }: EllipseOpts): Vec2[] {
  const out: Vec2[] = [];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  }
  return out;
}

/** Rounded capsule of width w and height h, anchored at its top centre. */
function capsule(w: number, h: number, segments = 12): Vec2[] {
  const out: Vec2[] = [];
  const r = w / 2;
  const straight = Math.max(0, h - w);
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI + (i / segments) * Math.PI;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI;
    out.push({ x: Math.cos(a) * r, y: straight + Math.sin(a) * r });
  }
  return out;
}

/**
 * A filled elliptical band. Drawn as one simple polygon (outer arc forward,
 * inner arc back) with a small slit so ear-clipping stays robust; a stroked
 * ring would show seams and double-blend at every joint.
 */
/**
 * A filled elliptical band segment. Drawn as one simple polygon (outer arc
 * forward, inner arc back) so it triangulates cleanly with no stroked seams.
 * `startDeg` is measured clockwise from +x, which matches the rig's y-down axis.
 */
function bandArc(rx: number, ry: number, thickness: number, startDeg: number, arcDeg: number, segments = 24): Vec2[] {
  const outer: Vec2[] = [];
  const inner: Vec2[] = [];
  const irx = Math.max(2, rx - thickness);
  const iry = Math.max(2, ry - thickness * (ry / Math.max(1, rx)));
  const start = (startDeg * Math.PI) / 180;
  const sweep = (arcDeg * Math.PI) / 180;
  for (let i = 0; i <= segments; i++) {
    const a = start + (sweep * i) / segments;
    outer.push({ x: Math.cos(a) * rx, y: Math.sin(a) * ry });
  }
  for (let i = segments; i >= 0; i--) {
    const a = start + (sweep * i) / segments;
    inner.push({ x: Math.cos(a) * irx, y: Math.sin(a) * iry });
  }
  return [...outer, ...inner];
}

/** Point on the band's centre line, used to anchor each bone's pivot. */
function bandPoint(rx: number, ry: number, thickness: number, deg: number): Vec2 {
  const a = (deg * Math.PI) / 180;
  const mid = 1 - thickness / 2 / Math.max(1, rx);
  return { x: Math.cos(a) * rx * mid, y: Math.sin(a) * ry * mid };
}

function shifted(points: Vec2[], dx: number, dy: number): Vec2[] {
  return points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

const SKIN: RGBA = [0.99, 0.8, 0.74, 0.96];
const SKIN_LINE: RGBA = [0.58, 0.33, 0.32, 0.85];
const SKIN_SOFT: RGBA = [1, 0.9, 0.85, 0.62];
const BONE_FILL: RGBA = [0.93, 0.88, 0.73, 0.94];
const BONE_LINE: RGBA = [0.48, 0.41, 0.28, 0.95];
const UTERUS: RGBA = [0.79, 0.51, 0.62, 0.3];
const UTERUS_LINE: RGBA = [0.86, 0.57, 0.66, 0.6];
const CAVITY: RGBA = [1, 0.87, 0.9, 0.3];
const CERVIX: RGBA = [0.93, 0.68, 0.55, 0.68];
const CERVIX_LINE: RGBA = [0.57, 0.32, 0.28, 0.9];
const INLET: RGBA = [0.4, 0.78, 0.96, 0.08];
const INLET_LINE: RGBA = [0.45, 0.82, 0.98, 0.62];

function bone(
  id: string,
  name: string,
  parentId: string | null,
  pivot: Vec2,
  visualAngle: number,
  length: number,
  minAngle: number,
  maxAngle: number,
): Bone {
  return { id, name, parentId, pivot, visualAngle, length, minAngle, maxAngle };
}

function part(
  id: string,
  name: string,
  groupId: string,
  boneId: string,
  points: Vec2[],
  fill: RGBA,
  stroke: RGBA,
  z: number,
  strokeWidth = 2,
): Part {
  return { id, name, groupId, boneId, points, fill, stroke, strokeWidth, visible: true, z };
}

function group(id: string, name: string, color: RGBA, rootBoneId: string): PartGroup {
  return { id, name, color, rootBoneId, collapsed: false, silhouette: [] };
}

function baseRig(id: string, name: string, templateId: string): Rig {
  return { id, name, templateId, rigWidth: 1600, rigHeight: 900, bones: [], groups: [], parts: [] };
}

/* ------------------------------------------------------------------ */
/* 胎儿 — authored upright with the head down, anterior to the left     */
/* ------------------------------------------------------------------ */

function buildFetusRig(): Rig {
  const rig = baseRig('rig-fetus', '胎儿', 'fetus');

  rig.bones = [
    bone('fetal_root', '胎儿根', null, { x: 0, y: 0 }, 90, 90, -180, 180),
    bone('fetal_body', '躯干', 'fetal_root', { x: 0, y: 80 }, 90, 110, -22, 22),
    bone('fetal_neck', '颈部', 'fetal_body', { x: 0, y: 120 }, 90, 26, -18, 18),
    bone('fetal_head', '胎头', 'fetal_neck', { x: 0, y: 26 }, 90, 70, -58, 52),
    bone('fetal_arm_l', '左上肢', 'fetal_body', { x: -52, y: 26 }, 118, 80, -30, 95),
    bone('fetal_arm_r', '右上肢', 'fetal_body', { x: 52, y: 26 }, 62, 80, -95, 30),
    bone('fetal_leg_l', '左下肢', 'fetal_body', { x: -54, y: 84 }, 122, 78, -30, 85),
    bone('fetal_leg_r', '右下肢', 'fetal_body', { x: 54, y: 84 }, 58, 78, -85, 30),
  ];

  rig.groups = [
    group('g-fetal-head', '胎儿头部', [0.95, 0.68, 0.62, 0.8], 'fetal_head'),
    group('g-fetal-body', '胎儿躯干', [0.96, 0.74, 0.66, 0.8], 'fetal_body'),
    group('g-fetal-limbs', '胎儿四肢', [0.92, 0.62, 0.58, 0.8], 'fetal_root'),
  ];

  // The fetal head: occiput bulges posteriorly (right in this view); the face
  // is turned anteriorly (left), hinting at the flexion axis.
  const headShape: Vec2[] = [
    ...ellipsePoints({ cx: 0, cy: 62, rx: 56, ry: 60, segments: 40 }),
    { x: 64, y: 40 },
    { x: 60, y: 92 },
  ];

  rig.parts = [
    part('p-head', '胎头', 'g-fetal-head', 'fetal_head', headShape, SKIN, [0.45, 0.22, 0.22, 0.95], 30, 2.2),
    part(
      'p-face',
      '面部',
      'g-fetal-head',
      'fetal_head',
      ellipsePoints({ cx: -6, cy: 88, rx: 30, ry: 30 }),
      SKIN_SOFT,
      [0.6, 0.32, 0.3, 0.3],
      31,
      1.2,
    ),
    part('p-body', '躯干', 'g-fetal-body', 'fetal_body', shifted(capsule(116, 148, 14), 0, 42), SKIN, SKIN_LINE, 26),
    part(
      'p-belly',
      '腹部',
      'g-fetal-body',
      'fetal_body',
      ellipsePoints({ cx: 0, cy: 62, rx: 42, ry: 44 }),
      SKIN_SOFT,
      [0.6, 0.32, 0.3, 0.2],
      27,
      1,
    ),
    part('p-neck', '颈', 'g-fetal-body', 'fetal_neck', capsule(42, 32, 9), SKIN, SKIN_LINE, 27),
    part('p-arm-l', '左上肢', 'g-fetal-limbs', 'fetal_arm_l', capsule(26, 84, 9), SKIN, SKIN_LINE, 28),
    part('p-arm-r', '右上肢', 'g-fetal-limbs', 'fetal_arm_r', capsule(26, 84, 9), SKIN, SKIN_LINE, 28),
    part('p-leg-l', '左下肢', 'g-fetal-limbs', 'fetal_leg_l', capsule(28, 82, 9), SKIN, SKIN_LINE, 29),
    part('p-leg-r', '右下肢', 'g-fetal-limbs', 'fetal_leg_r', capsule(28, 82, 9), SKIN, SKIN_LINE, 29),
  ];

  return rig;
}

/* ------------------------------------------------------------------ */
/* 骨盆 — sagittal ring, anterior (pubis) on the left                   */
/* ------------------------------------------------------------------ */

function buildPelvisRig(): Rig {
  const rig = baseRig('rig-pelvis', '骨盆', 'pelvis');

  // Bone masses are thicker arcs laid over the brim, so the ring reads as one
  // continuous structure whose three parts can still rotate independently.
  const BRIM = { rx: 138, ry: 64, thickness: 18 };
  const SACRUM = { rx: 156, ry: 78, thickness: 30, start: -46, sweep: 92 };
  const PUBIS = { rx: 154, ry: 76, thickness: 28, start: 196, sweep: 56 };
  const ISCHIUM = { rx: 150, ry: 74, thickness: 28, start: 104, sweep: 62 };

  const sacrumPivot = bandPoint(SACRUM.rx, SACRUM.ry, SACRUM.thickness, SACRUM.start + SACRUM.sweep / 2);
  const pubisPivot = bandPoint(PUBIS.rx, PUBIS.ry, PUBIS.thickness, PUBIS.start + PUBIS.sweep / 2);
  const ischiumPivot = bandPoint(ISCHIUM.rx, ISCHIUM.ry, ISCHIUM.thickness, ISCHIUM.start + ISCHIUM.sweep / 2);

  rig.bones = [
    bone('pelvis', '骨盆根', null, { x: 0, y: 0 }, 90, 200, -180, 180),
    bone('sacrum', '骶骨', 'pelvis', sacrumPivot, 105, 120, -6, 6),
    bone('pubis', '耻骨', 'pelvis', pubisPivot, 245, 84, -4, 4),
    bone('ischium', '坐骨', 'pelvis', ischiumPivot, 135, 84, -6, 6),
    bone('birth_inlet', '骨盆入口', 'pelvis', { x: 0, y: 0 }, 0, 150, -180, 180),
  ];

  rig.groups = [
    group('g-pelvis', '骨盆环', [0.72, 0.6, 0.44, 0.8], 'pelvis'),
    group('g-inlet', '骨盆入口', [0.45, 0.8, 0.95, 0.8], 'birth_inlet'),
  ];
  rig.groups[1].silhouette = ellipsePoints({
    cx: 0,
    cy: 0,
    rx: BRIM.rx - BRIM.thickness / 2,
    ry: BRIM.ry - BRIM.thickness / 2,
  });

  const local = (shape: Vec2[], pivot: Vec2): Vec2[] => shape.map((p) => ({ x: p.x - pivot.x, y: p.y - pivot.y }));

  const sacrumShape = bandArc(SACRUM.rx, SACRUM.ry, SACRUM.thickness, SACRUM.start, SACRUM.sweep);
  const pubisShape = bandArc(PUBIS.rx, PUBIS.ry, PUBIS.thickness, PUBIS.start, PUBIS.sweep);
  const ischiumShape = bandArc(ISCHIUM.rx, ISCHIUM.ry, ISCHIUM.thickness, ISCHIUM.start, ISCHIUM.sweep);

  rig.parts = [
    part(
      'p-pelvis-ring',
      '骨盆环骨质',
      'g-pelvis',
      'pelvis',
      bandArc(BRIM.rx, BRIM.ry, BRIM.thickness, 0, 360, 80),
      BONE_FILL,
      BONE_LINE,
      3,
      1.1,
    ),
    part('p-sacrum', '骶骨', 'g-pelvis', 'sacrum', local(sacrumShape, sacrumPivot), BONE_FILL, BONE_LINE, 4),
    part('p-pubis', '耻骨', 'g-pelvis', 'pubis', local(pubisShape, pubisPivot), BONE_FILL, BONE_LINE, 4),
    part('p-ischium', '坐骨', 'g-pelvis', 'ischium', local(ischiumShape, ischiumPivot), BONE_FILL, BONE_LINE, 4),
    part(
      'p-inlet-ring',
      '骨盆入口',
      'g-inlet',
      'birth_inlet',
      ellipsePoints({ cx: 0, cy: 0, rx: BRIM.rx - BRIM.thickness, ry: BRIM.ry - BRIM.thickness }),
      INLET,
      INLET_LINE,
      5,
      1.7,
    ),
  ];

  return rig;
}

/* ------------------------------------------------------------------ */
/* 产道 — uterus body above, cervix at the lower pole                   */
/* ------------------------------------------------------------------ */

function buildCanalRig(): Rig {
  const rig = baseRig('rig-canal', '产道', 'canal');

  rig.bones = [
    bone('canal_root', '产道根', null, { x: 0, y: 0 }, 90, 340, -180, 180),
    bone('uterus', '子宫体', 'canal_root', { x: 0, y: 30 }, 90, 280, -8, 8),
    bone('cervix', '宫颈', 'uterus', { x: 0, y: 300 }, 90, 60, -26, 26),
  ];

  rig.groups = [
    group('g-uterus', '子宫', [0.85, 0.55, 0.68, 0.6], 'uterus'),
    group('g-cervix', '宫颈', [0.9, 0.62, 0.4, 0.7], 'cervix'),
  ];

  rig.parts = [
    part(
      'p-uterus',
      '子宫体',
      'g-uterus',
      'uterus',
      ellipsePoints({ cx: 0, cy: 152, rx: 156, ry: 150, segments: 48 }),
      UTERUS,
      UTERUS_LINE,
      1,
      2,
    ),
    part(
      'p-uterus-inner',
      '宫腔',
      'g-uterus',
      'uterus',
      ellipsePoints({ cx: 0, cy: 148, rx: 112, ry: 116, segments: 40 }),
      CAVITY,
      [0.95, 0.75, 0.8, 0.4],
      2,
      1.3,
    ),
    part(
      'p-cervix',
      '宫颈',
      'g-cervix',
      'cervix',
      [
        { x: -38, y: -24 },
        { x: -20, y: -42 },
        { x: 20, y: -42 },
        { x: 38, y: -24 },
        { x: 32, y: 34 },
        { x: -32, y: 34 },
      ],
      CERVIX,
      CERVIX_LINE,
      3,
    ),
    part(
      'p-cervix-os',
      '宫颈口',
      'g-cervix',
      'cervix',
      ellipsePoints({ cx: 0, cy: 4, rx: 22, ry: 10 }),
      [0.5, 0.18, 0.24, 0.7],
      [0.4, 0.14, 0.18, 0.95],
      4,
      1.2,
    ),
  ];

  return rig;
}

/* ------------------------------------------------------------------ */
/* 分娩机制全景 — compose with explicit anatomical offsets              */
/* ------------------------------------------------------------------ */

/** Uterus spans roughly -422..-78 in root space; cervix sits near -70. */
const CANAL_ROOT_Y = -386;
/** Fetal head centres on the pelvic inlet when the root is here. */
const FETUS_ROOT_Y = -250;

function translateRig(rig: Rig, dx: number, dy: number, scale = 1): Rig {
  // Child pivots are local offsets and lengths are local too, so both scale;
  // only the root takes the world-space translation.
  return {
    ...rig,
    bones: rig.bones.map((b) =>
      b.parentId
        ? { ...b, pivot: { x: b.pivot.x * scale, y: b.pivot.y * scale }, length: b.length * scale }
        : { ...b, pivot: { x: b.pivot.x * scale + dx, y: b.pivot.y * scale + dy }, length: b.length * scale },
    ),
    parts: rig.parts.map((p) => ({ ...p, points: p.points.map((pt) => ({ x: pt.x * scale, y: pt.y * scale })) })),
  };
}

function buildMechanismRig(): Rig {
  const pelvis = buildPelvisRig();
  const fetus = translateRig(buildFetusRig(), 0, FETUS_ROOT_Y, 0.76);
  const canal = translateRig(buildCanalRig(), 0, CANAL_ROOT_Y);

  const rig = baseRig('rig-mechanism', '分娩机制全景', 'mechanism');
  rig.groups = [...canal.groups, ...pelvis.groups, ...fetus.groups];
  // Draw order follows each part's z: canal < pelvis < fetus.
  rig.parts = [...canal.parts, ...pelvis.parts, ...fetus.parts];
  rig.bones = [...canal.bones, ...pelvis.bones, ...fetus.bones];
  return rig;
}

/* ------------------------------------------------------------------ */
/* Framing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Centre and scale the artwork so standalone templates read as well as the
 * combined scene. Authored coordinates are local; framing runs once at build
 * time so every shot saved from a template shares the same view.
 */
export function fitRig(rig: Rig, pad = 0.86, maxScale = 2.8): Rig {
  const zero: Record<string, { rotation: number; x: number; y: number }> = {};
  for (const b of rig.bones) zero[b.id] = { rotation: 0, x: 0, y: 0 };
  const worlds = worldTransforms(rig.bones, zero);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of rig.parts) {
    if (!p.visible) continue;
    const world = worlds.get(p.boneId);
    if (!world) continue;
    for (const pt of p.points) {
      const cos = Math.cos(world.rotation);
      const sin = Math.sin(world.rotation);
      const x = world.x + cos * pt.x - sin * pt.y;
      const y = world.y + sin * pt.x + cos * pt.y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return rig;

  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const scale = Math.min((rig.rigWidth * pad) / bw, (rig.rigHeight * pad) / bh, maxScale);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const dx = rig.rigWidth / 2 - scale * centerX;
  const dy = rig.rigHeight / 2 - scale * centerY;

  return {
    ...rig,
    bones: rig.bones.map((b) => ({
      ...b,
      // Child pivots are offsets inside their parent's local space, so they
      // scale but must not take the root's translation.
      pivot: {
        x: b.pivot.x * scale + (b.parentId ? 0 : dx),
        y: b.pivot.y * scale + (b.parentId ? 0 : dy),
      },
      length: Math.max(4, b.length * scale),
    })),
    parts: rig.parts.map((p) => ({
      ...p,
      points: p.points.map((pt) => ({ x: pt.x * scale, y: pt.y * scale })),
      strokeWidth: Math.max(0.7, p.strokeWidth * scale),
    })),
    groups: rig.groups.map((g) => ({
      ...g,
      silhouette: g.silhouette.map((pt) => ({ x: pt.x * scale, y: pt.y * scale })),
    })),
  };
}

export const TEMPLATES: RigTemplate[] = [
  {
    id: 'mechanism',
    name: '分娩机制全景',
    description: '子宫、骨盆与胎儿的完整侧视图，用于俯屈、内旋转、仰伸、复位的连贯演示。',
    defaultDuration: 8,
    build: buildMechanismRig,
  },
  {
    id: 'fetus',
    name: '胎儿',
    description: '胎儿独立骨骼：躯干、颈、胎头与四肢，头先露姿势，适合特写镜头。',
    defaultDuration: 6,
    build: buildFetusRig,
  },
  {
    id: 'pelvis',
    name: '骨盆',
    description: '骶骨、耻骨、坐骨与骨盆入口，适合讲解骨性产道。',
    defaultDuration: 5,
    build: buildPelvisRig,
  },
  {
    id: 'canal',
    name: '产道',
    description: '子宫体、宫颈与宫腔，适合软产道变化镜头。',
    defaultDuration: 5,
    build: buildCanalRig,
  },
];

export function getTemplate(id: string): RigTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function buildRig(templateId: string): Rig {
  const t = getTemplate(templateId);
  const rig = t.build();
  return fitRig(rig, templateId === 'mechanism' ? 0.9 : 0.8, templateId === 'mechanism' ? 1.3 : 2.8);
}

export function templateBoneNames(templateId: string): Record<string, string> {
  const rig = buildRig(templateId);
  const out: Record<string, string> = {};
  for (const b of rig.bones) out[b.id] = b.name;
  return out;
}

/** Bones that deserve a permanent label in read-only playback. */
export const ANCHOR_LABELS: Record<string, string[]> = {
  mechanism: ['fetal_head', 'birth_inlet', 'cervix', 'sacrum'],
  fetus: ['fetal_head', 'fetal_body'],
  pelvis: ['birth_inlet', 'sacrum', 'pubis'],
  canal: ['uterus', 'cervix'],
};
