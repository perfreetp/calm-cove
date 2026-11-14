import {
  circleSubpath, roundedRectSubpath, ngonSubpath, polylineSubpath, thickSegment,
  arrowSubpath, booleanSubpaths, thickPolyline, translateSubpaths, subpathsBBox,
  subpathToSvgD, ringsFromSubpaths, groupRings, ringArea,
} from './geom.js';
import { textLayoutFor } from './font.js';

export { textLayoutFor, layoutText } from './font.js';

export const PALETTE = {
  red: '#c8102e',
  blue: '#0057a8',
  green: '#00693e',
  white: '#ffffff',
  black: '#141414',
  yellow: '#f2c200',
  aluminum: '#c9ced4',
};

export const CATEGORIES = {
  prohibition: { key: 'prohibition', label: '禁令标志', short: '禁', color: PALETTE.red },
  mandatory: { key: 'mandatory', label: '指示标志', short: '指', color: PALETTE.blue },
  guide: { key: 'guide', label: '指路标志', short: '路', color: PALETTE.green },
};

export const STATUS = {
  drafting: { key: 'drafting', label: '制版中', tone: 'slate' },
  reviewing: { key: 'reviewing', label: '待审核', tone: 'amber' },
  returned: { key: 'returned', label: '退回修改', tone: 'red' },
  closed: { key: 'closed', label: '已结项', tone: 'green' },
};

let seq = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, '0')}`;

/* ------------------------------------------------------------------ */
/* Layer model                                                        */
/* ------------------------------------------------------------------ */

export const DEFAULT_STYLE = {
  fill: PALETTE.white,
  stroke: null,
  strokeWidth: 0,
};

export function shapeLayer(kind, params, style = {}, extra = {}) {
  return {
    id: uid('L'),
    type: 'shape',
    kind,
    name: extra.name || kindLabel(kind),
    params: { ...params },
    fill: 'fill' in style ? style.fill : PALETTE.white,
    stroke: 'stroke' in style ? style.stroke : null,
    strokeWidth: style.strokeWidth ?? 0,
    visible: true,
    locked: false,
    ...extra,
  };
}

export function pathLayer(subpaths, style = {}, extra = {}) {
  return {
    id: uid('L'),
    type: 'path',
    kind: 'custom',
    name: extra.name || '路径',
    params: {},
    subpaths,
    fill: 'fill' in style ? style.fill : PALETTE.white,
    stroke: 'stroke' in style ? style.stroke : null,
    strokeWidth: style.strokeWidth ?? 0,
    visible: true,
    locked: false,
    ...extra,
  };
}

export function textLayer(text, opts = {}) {
  return {
    id: uid('L'),
    type: 'text',
    kind: 'text',
    name: opts.name || '文字',
    text,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    charHeight: opts.charHeight ?? 400,
    charWidth: opts.charWidth ?? opts.charHeight ?? 400,
    tracking: opts.tracking ?? 0,
    lineHeight: opts.lineHeight ?? (opts.charHeight ?? 400) * 1.35,
    align: opts.align ?? 'center',
    fill: opts.fill ?? PALETTE.white,
    stroke: null,
    strokeWidth: 0,
    visible: true,
    locked: false,
  };
}

export function kindLabel(kind) {
  return {
    plate: '底板', roundedRect: '圆角矩形', rect: '矩形', circle: '圆形', polygon: '多边形',
    triangle: '三角形', symbol: '图形', custom: '路径', text: '文字',
  }[kind] || kind;
}

export function shapeSubpaths(layer, doc) {
  const p = layer.params || {};
  switch (layer.kind) {
    case 'plate':
      return plateSubpaths(doc);
    case 'roundedRect':
      return [roundedRectSubpath(p.x, p.y, p.w, p.h, p.r ?? 0)];
    case 'rect':
      return [roundedRectSubpath(p.x, p.y, p.w, p.h, 0)];
    case 'circle':
      return [circleSubpath(p.cx, p.cy, p.r)];
    case 'polygon':
      return [ngonSubpath(p.cx ?? 0, p.cy ?? 0, p.r, p.sides ?? 6, p.rotation ?? -Math.PI / 2)];
    case 'triangle':
      return [ngonSubpath(p.cx ?? 0, p.cy ?? 0, p.r, 3, p.rotation ?? -Math.PI / 2)];
    case 'symbol':
      return symbolSubpaths(layer, doc);
    case 'custom':
      return layer.subpaths || [];
    default:
      return layer.subpaths || [];
  }
}

export function plateSubpaths(doc) {
  const plate = doc.plate || { shape: 'rect', radius: 0 };
  const w = doc.width, h = doc.height;
  if (plate.shape === 'circle') return [circleSubpath(w / 2, h / 2, Math.min(w, h) / 2)];
  if (plate.shape === 'triangle') return [ngonSubpath(w / 2, h / 2, Math.min(w, h) / 2, 3)];
  if (plate.shape === 'roundedRect') return [roundedRectSubpath(0, 0, w, h, plate.radius ?? 60)];
  return [roundedRectSubpath(0, 0, w, h, 0)];
}

function symbolSubpaths(layer, doc) {
  const p = layer.params || {};
  const cx = p.cx ?? 0, cy = p.cy ?? 0, size = p.size ?? 300;
  switch (p.symbol) {
    case 'x': {
      const w = p.width ?? size * 0.18;
      const a = thickSegment(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2, w);
      const b = thickSegment(cx - size / 2, cy + size / 2, cx + size / 2, cy - size / 2, w);
      return booleanSubpaths('union', [[a], [b]]);
    }
    case 'slash': {
      const w = p.width ?? size * 0.18;
      return [thickSegment(cx - size / 2, cy + size / 2, cx + size / 2, cy - size / 2, w)];
    }
    case 'arrow': {
      const dir = p.direction ?? 90; // degrees, 90 = up
      const len = p.length ?? size;
      const rad = (dir * Math.PI) / 180;
      const tip = { x: cx + Math.cos(rad) * len / 2, y: cy - Math.sin(rad) * len / 2 };
      const tail = { x: cx - Math.cos(rad) * len / 2, y: cy + Math.sin(rad) * len / 2 };
      return arrowSubpath([tail, tip], p.shaft ?? size * 0.24, p.headWidth ?? size * 0.52, p.headLength ?? size * 0.34);
    }
    case 'bentArrow': {
      // vertical shaft rising, then turning towards `turn` (degrees)
      const bend = p.bend ?? { x: cx - size * 0.3, y: cy - size * 0.15 };
      const start = p.start ?? { x: cx + size * 0.1, y: cy + size * 0.5 };
      return arrowSubpath(
        [start, { x: start.x, y: bend.y }, bend],
        p.shaft ?? size * 0.22,
        p.headWidth ?? size * 0.46,
        p.headLength ?? size * 0.28
      );
    }
    case 'pedestrian': {
      const s = size / 300;
      const head = circleSubpath(cx - 10 * s, cy - 120 * s, 26 * s);
      const parts = [
        head,
        [thickSegment(cx - 10 * s, cy - 90 * s, cx - 18 * s, cy + 6 * s, 34 * s)],
        [thickSegment(cx - 18 * s, cy + 4 * s, cx - 62 * s, cy + 104 * s, 24 * s)],
        [thickSegment(cx - 18 * s, cy + 4 * s, cx + 26 * s, cy + 98 * s, 24 * s)],
        [thickSegment(cx - 4 * s, cy - 66 * s, cx + 58 * s, cy - 26 * s, 22 * s)],
        [thickSegment(cx - 4 * s, cy - 60 * s, cx - 56 * s, cy - 4 * s, 22 * s)],
      ];
      return booleanSubpaths('union', parts.map((p2) => (Array.isArray(p2) ? p2 : [p2])));
    }
    case 'divider': {
      return [roundedRectSubpath(p.x ?? 0, p.y ?? 0, p.w ?? 20, p.h ?? 100, p.r ?? 0)];
    }
    default:
      return layer.subpaths || [];
  }
}

const subCache = new Map();
export function layerSubpaths(layer, doc) {
  if (!layer || layer.visible === false) return [];
  if (layer.type === 'text') return textLayoutFor(layer).subpaths.map((s) => shiftSub(s, layer.x, layer.y));
  const sig = JSON.stringify({ k: layer.kind, p: layer.params, s: layer.subpaths, w: doc.width, h: doc.height, pl: doc.plate });
  const hit = subCache.get(layer.id);
  if (hit && hit.sig === sig) return hit.subs;
  const subs = shapeSubpaths(layer, doc);
  if (subCache.size > 1200) subCache.clear();
  subCache.set(layer.id, { sig, subs });
  return subs;
}

function shiftSub(s, dx, dy) {
  if (!dx && !dy) return s;
  return {
    ...s,
    pts: s.pts.map((p) => ({
      x: p.x + dx, y: p.y + dy,
      cIn: p.cIn ? { x: p.cIn.x + dx, y: p.cIn.y + dy } : undefined,
      cOut: p.cOut ? { x: p.cOut.x + dx, y: p.cOut.y + dy } : undefined,
    })),
  };
}

export function layerBBox(layer, doc) {
  return subpathsBBox(layerSubpaths(layer, doc));
}

export function textBBox(layer) {
  const l = textLayoutFor(layer);
  return { x: layer.x - l.width / 2, y: layer.y, width: l.width, height: l.height, align: layer.align, layout: l };
}

export function layerStyleSig(layer) {
  return JSON.stringify([layer.fill, layer.stroke, layer.strokeWidth, layer.visible, layer.locked]);
}

export function layerSig(layer, doc) {
  return JSON.stringify({ id: layer.id, t: layer.type, k: layer.kind, p: layer.params, s: layer.subpaths,
    text: layer.text, x: layer.x, y: layer.y, ch: layer.charHeight, cw: layer.charWidth,
    tr: layer.tracking, lh: layer.lineHeight, al: layer.align, fill: layer.fill,
    stroke: layer.stroke, sw: layer.strokeWidth, v: layer.visible });
}

/* ------------------------------------------------------------------ */
/* Document / versions                                                */
/* ------------------------------------------------------------------ */

export function docClone(doc) {
  return JSON.parse(JSON.stringify(doc));
}

export function emptyDoc({ width, height, category, plate, fill }) {
  return {
    width, height,
    category,
    plate: plate || { shape: 'rect', radius: 60 },
    plateThickness: 2.0,
    filmGrade: '四级反光膜',
    safeMargin: 40,
    designSpeed: 80,
    targetDistance: 0,
    layers: [
      { ...shapeLayer('plate', {}, { fill }, { name: '底板', locked: true }) },
    ],
    meta: {},
  };
}

export function layerByName(doc, name) {
  return doc.layers.find((l) => l.name === name);
}

/* ------------------------------------------------------------------ */
/* Template library — 国标模板起稿                                     */
/* ------------------------------------------------------------------ */

function tplProhibitionNoEntry() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'prohibition', plate: { shape: 'circle' }, fill: PALETTE.red });
  doc.layers.push(shapeLayer('roundedRect', { x: 115, y: 255, w: 370, h: 90, r: 10 },
    { fill: PALETTE.white }, { name: '白横杠' }));
  doc.meta = { standard: 'GB 5768.2 禁令标志', symbol: '禁止驶入' };
  return doc;
}

function tplProhibitionNoThrough() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'prohibition', plate: { shape: 'circle' }, fill: PALETTE.white });
  doc.layers.push(shapeLayer('circle', { cx: 300, cy: 300, r: 272 },
    { fill: null, stroke: PALETTE.red, strokeWidth: 56 }, { name: '红圈边框' }));
  doc.meta = { standard: 'GB 5768.2 禁令标志', symbol: '禁止通行' };
  return doc;
}

function tplProhibitionSpeed() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'prohibition', plate: { shape: 'circle' }, fill: PALETTE.white });
  doc.layers.push(shapeLayer('circle', { cx: 300, cy: 300, r: 272 },
    { fill: null, stroke: PALETTE.red, strokeWidth: 54 }, { name: '红圈边框' }));
  doc.layers.push(textLayer('60', { x: 300, y: 140, charHeight: 300, charWidth: 260, fill: PALETTE.black, name: '限速数值' }));
  doc.meta = { standard: 'GB 5768.2 禁令标志', symbol: '限制速度' };
  return doc;
}

function tplProhibitionParking() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'prohibition', plate: { shape: 'circle' }, fill: PALETTE.blue });
  doc.layers.push(shapeLayer('circle', { cx: 300, cy: 300, r: 272 },
    { fill: null, stroke: PALETTE.red, strokeWidth: 54 }, { name: '红圈边框' }));
  doc.layers.push(shapeLayer('symbol', { symbol: 'x', cx: 300, cy: 300, size: 320, width: 62 },
    { fill: PALETTE.red }, { name: '红叉' }));
  doc.meta = { standard: 'GB 5768.2 禁令标志', symbol: '禁止停车' };
  return doc;
}

function tplMandatoryStraight() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'mandatory', plate: { shape: 'circle' }, fill: PALETTE.blue });
  doc.layers.push(shapeLayer('symbol', { symbol: 'arrow', cx: 300, cy: 310, size: 360, direction: 90, shaft: 84, headWidth: 210, headLength: 150 },
    { fill: PALETTE.white }, { name: '直行箭头' }));
  doc.meta = { standard: 'GB 5768.2 指示标志', symbol: '直行' };
  return doc;
}

function tplMandatoryLeft() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'mandatory', plate: { shape: 'circle' }, fill: PALETTE.blue });
  doc.layers.push(shapeLayer('symbol', {
    symbol: 'bentArrow', cx: 320, cy: 300, size: 340,
    start: { x: 400, y: 460 }, bend: { x: 190, y: 300 }, shaft: 78, headWidth: 200, headLength: 140,
  }, { fill: PALETTE.white }, { name: '左转箭头' }));
  doc.meta = { standard: 'GB 5768.2 指示标志', symbol: '向左转弯' };
  return doc;
}

function tplMandatoryKeepRight() {
  const doc = emptyDoc({ width: 600, height: 600, category: 'mandatory', plate: { shape: 'circle' }, fill: PALETTE.blue });
  doc.layers.push(shapeLayer('symbol', {
    symbol: 'bentArrow', cx: 300, cy: 300, size: 340,
    start: { x: 240, y: 465 }, bend: { x: 420, y: 225 }, shaft: 78, headWidth: 200, headLength: 140,
  }, { fill: PALETTE.white }, { name: '靠右箭头' }));
  doc.meta = { standard: 'GB 5768.2 指示标志', symbol: '靠右侧道路行驶' };
  return doc;
}

function tplMandatoryCrosswalk() {
  const doc = emptyDoc({ width: 700, height: 700, category: 'mandatory', plate: { shape: 'roundedRect', radius: 24 }, fill: PALETTE.blue });
  doc.layers.push(shapeLayer('triangle', { cx: 350, cy: 372, r: 258, rotation: -Math.PI / 2 },
    { fill: PALETTE.white }, { name: '白三角' }));
  doc.layers.push(shapeLayer('symbol', { symbol: 'pedestrian', cx: 350, cy: 372, size: 330 },
    { fill: PALETTE.black }, { name: '行人图形' }));
  doc.meta = { standard: 'GB 5768.2 指示标志', symbol: '人行横道' };
  return doc;
}

function tplGuideExit() {
  const doc = emptyDoc({ width: 3000, height: 2000, category: 'guide', plate: { shape: 'rect' }, fill: PALETTE.green });
  doc.safeMargin = 80;
  doc.designSpeed = 100;
  doc.layers.push(shapeLayer('roundedRect', { x: 50, y: 50, w: 2900, h: 1900, r: 50 },
    { fill: null, stroke: PALETTE.white, strokeWidth: 34 }, { name: '白色边框' }));
  doc.layers.push(textLayer('青 阳', { x: 790, y: 560, charHeight: 480, charWidth: 480, fill: PALETTE.white, name: '地名' }));
  doc.layers.push(textLayer('QINGYANG', { x: 790, y: 1180, charHeight: 150, charWidth: 132, tracking: 8, fill: PALETTE.white, name: '拼音' }));
  doc.layers.push(shapeLayer('rect', { x: 1960, y: 220, w: 16, h: 1560 },
    { fill: PALETTE.white }, { name: '分隔线' }));
  doc.layers.push(textLayer('出口', { x: 2470, y: 360, charHeight: 210, charWidth: 210, fill: PALETTE.white, name: '出口字' }));
  doc.layers.push(textLayer('12', { x: 2470, y: 630, charHeight: 340, charWidth: 300, fill: PALETTE.white, name: '出口编号' }));
  doc.layers.push(textLayer('500m', { x: 2470, y: 1280, charHeight: 220, charWidth: 200, fill: PALETTE.white, name: '距离' }));
  doc.meta = { standard: 'GB 5768.2 指路标志', symbol: '出口预告' };
  return doc;
}

function tplGuidePlace() {
  const doc = emptyDoc({ width: 2400, height: 1200, category: 'guide', plate: { shape: 'rect' }, fill: PALETTE.blue });
  doc.safeMargin = 70;
  doc.designSpeed = 60;
  doc.layers.push(shapeLayer('roundedRect', { x: 44, y: 44, w: 2312, h: 1112, r: 40 },
    { fill: null, stroke: PALETTE.white, strokeWidth: 28 }, { name: '白色边框' }));
  doc.layers.push(textLayer('合 肥', { x: 720, y: 300, charHeight: 380, charWidth: 380, fill: PALETTE.white, name: '地名' }));
  doc.layers.push(textLayer('HEFEI', { x: 720, y: 790, charHeight: 120, charWidth: 106, tracking: 6, fill: PALETTE.white, name: '拼音' }));
  doc.layers.push(textLayer('40km', { x: 1730, y: 350, charHeight: 260, charWidth: 230, fill: PALETTE.white, name: '距离' }));
  doc.layers.push(shapeLayer('symbol', { symbol: 'arrow', cx: 2070, cy: 620, size: 260, direction: 90, shaft: 66, headWidth: 150, headLength: 110 },
    { fill: PALETTE.white }, { name: '方向箭头' }));
  doc.meta = { standard: 'GB 5768.2 指路标志', symbol: '地名距离' };
  return doc;
}

function tplGuideService() {
  const doc = emptyDoc({ width: 2600, height: 1400, category: 'guide', plate: { shape: 'rect' }, fill: PALETTE.green });
  doc.safeMargin = 70;
  doc.designSpeed = 100;
  doc.layers.push(shapeLayer('roundedRect', { x: 44, y: 44, w: 2512, h: 1312, r: 40 },
    { fill: null, stroke: PALETTE.white, strokeWidth: 30 }, { name: '白色边框' }));
  doc.layers.push(textLayer('服务区', { x: 900, y: 330, charHeight: 400, charWidth: 400, fill: PALETTE.white, name: '名称' }));
  doc.layers.push(textLayer('2km', { x: 2000, y: 400, charHeight: 260, charWidth: 230, fill: PALETTE.white, name: '距离' }));
  doc.layers.push(textLayer('加油 · 餐饮 · 停车', { x: 900, y: 900, charHeight: 150, charWidth: 150, tracking: 20, fill: PALETTE.white, name: '服务项目' }));
  doc.meta = { standard: 'GB 5768.2 指路标志', symbol: '服务区预告' };
  return doc;
}

export const TEMPLATES = [
  { id: 'p-no-entry', category: 'prohibition', name: '禁止驶入', code: '禁-01', build: tplProhibitionNoEntry },
  { id: 'p-no-through', category: 'prohibition', name: '禁止通行', code: '禁-02', build: tplProhibitionNoThrough },
  { id: 'p-speed', category: 'prohibition', name: '限制速度', code: '禁-03', build: tplProhibitionSpeed },
  { id: 'p-parking', category: 'prohibition', name: '禁止停车', code: '禁-04', build: tplProhibitionParking },
  { id: 'm-straight', category: 'mandatory', name: '直行', code: '指-01', build: tplMandatoryStraight },
  { id: 'm-left', category: 'mandatory', name: '向左转弯', code: '指-02', build: tplMandatoryLeft },
  { id: 'm-right', category: 'mandatory', name: '靠右侧道路行驶', code: '指-03', build: tplMandatoryKeepRight },
  { id: 'm-crosswalk', category: 'mandatory', name: '人行横道', code: '指-04', build: tplMandatoryCrosswalk },
  { id: 'g-exit', category: 'guide', name: '出口预告', code: '路-01', build: tplGuideExit },
  { id: 'g-place', category: 'guide', name: '地名距离', code: '路-02', build: tplGuidePlace },
  { id: 'g-service', category: 'guide', name: '服务区预告', code: '路-03', build: tplGuideService },
];

export function buildTemplate(id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error('未知模板 ' + id);
  return { doc: t.build(), template: t };
}

/* ------------------------------------------------------------------ */
/* Basic primitives by category                                       */
/* ------------------------------------------------------------------ */

export const PRIMITIVES = {
  prohibition: [
    { id: 'circle-plate', label: '圆牌底板', make: (doc) => shapeLayer('circle', { cx: doc.width / 2, cy: doc.height / 2, r: Math.min(doc.width, doc.height) / 2 }, { fill: PALETTE.white }, { name: '圆牌' }) },
    { id: 'red-ring', label: '红圈', make: (doc) => shapeLayer('circle', { cx: doc.width / 2, cy: doc.height / 2, r: Math.min(doc.width, doc.height) / 2 - 28 }, { fill: null, stroke: PALETTE.red, strokeWidth: 56 }, { name: '红圈' }) },
    { id: 'slash', label: '禁止斜杠', make: (doc) => shapeLayer('symbol', { symbol: 'slash', cx: doc.width / 2, cy: doc.height / 2, size: Math.min(doc.width, doc.height) * 0.62, width: 62 }, { fill: PALETTE.red }, { name: '斜杠' }) },
    { id: 'num', label: '数字字块', make: (doc) => textLayer('60', { x: doc.width / 2, y: doc.height * 0.24, charHeight: 300, charWidth: 260, fill: PALETTE.black, name: '数字' }) },
  ],
  mandatory: [
    { id: 'blue-circle', label: '蓝底圆牌', make: (doc) => shapeLayer('circle', { cx: doc.width / 2, cy: doc.height / 2, r: Math.min(doc.width, doc.height) / 2 }, { fill: PALETTE.blue }, { name: '蓝底' }) },
    { id: 'blue-rect', label: '蓝底方牌', make: (doc) => shapeLayer('roundedRect', { x: 0, y: 0, w: doc.width, h: doc.height, r: 24 }, { fill: PALETTE.blue }, { name: '蓝底方牌' }) },
    { id: 'arrow', label: '白色直行箭头', make: (doc) => shapeLayer('symbol', { symbol: 'arrow', cx: doc.width / 2, cy: doc.height / 2, size: Math.min(doc.width, doc.height) * 0.6, direction: 90, shaft: 84, headWidth: 210, headLength: 150 }, { fill: PALETTE.white }, { name: '箭头' }) },
    { id: 'triangle', label: '白三角', make: (doc) => shapeLayer('triangle', { cx: doc.width / 2, cy: doc.height / 2 + 40, r: Math.min(doc.width, doc.height) * 0.38 }, { fill: PALETTE.white }, { name: '三角形' }) },
  ],
  guide: [
    { id: 'green-rect', label: '绿底方牌', make: (doc) => shapeLayer('roundedRect', { x: 0, y: 0, w: doc.width, h: doc.height, r: 40 }, { fill: PALETTE.green }, { name: '绿底方牌' }) },
    { id: 'white-border', label: '白边框', make: (doc) => shapeLayer('roundedRect', { x: 44, y: 44, w: doc.width - 88, h: doc.height - 88, r: 40 }, { fill: null, stroke: PALETTE.white, strokeWidth: 30 }, { name: '白边框' }) },
    { id: 'place-text', label: '地名文字', make: (doc) => textLayer('地名', { x: doc.width * 0.35, y: doc.height * 0.32, charHeight: 380, charWidth: 380, fill: PALETTE.white, name: '地名' }) },
    { id: 'big-arrow', label: '方向箭头', make: (doc) => shapeLayer('symbol', { symbol: 'arrow', cx: doc.width * 0.82, cy: doc.height * 0.55, size: 260, direction: 90, shaft: 66, headWidth: 150, headLength: 110 }, { fill: PALETTE.white }, { name: '方向箭头' }) },
    { id: 'divider', label: '分隔线', make: (doc) => shapeLayer('rect', { x: doc.width * 0.65, y: 100, w: 14, h: doc.height - 200 }, { fill: PALETTE.white }, { name: '分隔线' }) },
  ],
};

/* ------------------------------------------------------------------ */
/* Legibility reference                                               */
/* ------------------------------------------------------------------ */

/** Reference mm-of-char-height per metre of legibility distance (approx.). */
export const LEGIBILITY_K = 0.25;

/**
 * Reference 汉字字高 by design speed. Simplified from common practice on
 * guide signs; a project must still follow GB 5768.2 and its design file.
 */
export const SPEED_CHAR_HEIGHT = [
  { speed: 120, charHeight: 600 },
  { speed: 100, charHeight: 500 },
  { speed: 80, charHeight: 400 },
  { speed: 60, charHeight: 300 },
  { speed: 40, charHeight: 200 },
];

export function recommendedCharHeight(speed) {
  const row = SPEED_CHAR_HEIGHT.find((r) => r.speed === speed);
  return row ? row.charHeight : 300;
}

export function legibility(doc) {
  const textLayers = doc.layers.filter((l) => l.type === 'text' && l.visible !== false);
  const main = textLayers.reduce((a, b) => (!a || b.charHeight > a.charHeight ? b : a), null);
  const charHeight = main ? main.charHeight : 0;
  const minChar = textLayers.length ? Math.min(...textLayers.map((l) => l.charHeight)) : 0;
  const distance = charHeight * LEGIBILITY_K; // metres
  const recommended = recommendedCharHeight(doc.designSpeed);
  const target = doc.targetDistance > 0 ? doc.targetDistance : distance;
  const requiredHeight = doc.targetDistance > 0 ? doc.targetDistance / LEGIBILITY_K : recommended;
  return {
    charHeight, minChar, distance, recommended, target,
    requiredHeight,
    meetsSpeed: charHeight >= recommended,
    meetsTarget: doc.targetDistance > 0 ? charHeight >= requiredHeight : null,
    mainLayerId: main ? main.id : null,
  };
}

export function fmtMm(v) {
  return Math.round(v * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Bill of materials + process spec                                   */
/* ------------------------------------------------------------------ */

export function areaOfSubpaths(subs) {
  let area = 0;
  const rings = ringsFromSubpaths(subs, 0.4);
  const polys = groupRings(rings);
  for (const p of polys) {
    area += Math.abs(ringArea(p.outer));
    for (const h of p.holes) area -= Math.abs(ringArea(h));
  }
  return Math.max(0, area); // mm²
}

export function layerColors(layer) {
  const out = [];
  if (layer.fill) out.push({ color: layer.fill, role: 'fill', width: 0 });
  if (layer.stroke && layer.strokeWidth > 0) out.push({ color: layer.stroke, role: 'stroke', width: layer.strokeWidth });
  return out;
}

export function colorUsage(doc) {
  const map = new Map();
  for (const layer of doc.layers) {
    if (layer.visible === false) continue;
    const subs = layerSubpaths(layer, doc);
    if (!subs.length) continue;
    const fillArea = areaOfSubpaths(subs);
    if (layer.fill) {
      const rec = map.get(layer.fill) || { color: layer.fill, area: 0, roles: new Set() };
      rec.area += fillArea;
      rec.roles.add('填充');
      map.set(layer.fill, rec);
    }
    if (layer.stroke && layer.strokeWidth > 0) {
      const outer = areaOfSubpaths(subs);
      const inner = Math.max(0, outer - perimeterApprox(subs) * layer.strokeWidth);
      const rec = map.get(layer.stroke) || { color: layer.stroke, area: 0, roles: new Set() };
      rec.area += Math.max(0, outer - inner);
      rec.roles.add('描边');
      map.set(layer.stroke, rec);
    }
  }
  return [...map.values()].map((r) => ({ ...r, roles: [...r.roles] }));
}

function perimeterApprox(subs) {
  let len = 0;
  for (const s of subs) {
    const ring = ringsFromSubpaths([s], 0.5)[0] || [];
    for (let i = 1; i < ring.length; i++) len += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
  }
  return len;
}

export function computeBOM(doc) {
  const plateAreaM2 = (doc.width * doc.height) / 1e6;
  const colors = colorUsage(doc);
  const filmM2 = colors.reduce((s, c) => s + c.area / 1e6, 0) * 1.15;
  const plateWeight = plateAreaM2 * (doc.plateThickness / 1000) * 2700; // 铝 2700 kg/m³
  const rows = [
    { item: '铝板', spec: `δ${doc.plateThickness.toFixed(1)}mm 3003-H24`, unit: 'm²', qty: round2(plateAreaM2), note: `${doc.width}×${doc.height}mm` },
    { item: '反光膜', spec: doc.filmGrade, unit: 'm²', qty: round2(filmM2), note: '含 15% 损耗' },
    ...colors.map((c) => ({ item: `刻字膜 · ${colorName(c.color)}`, spec: c.color.toUpperCase(), unit: 'm²', qty: round2((c.area / 1e6) * 1.15), note: c.roles.join('/') })),
    { item: '铝合金滑槽', spec: '30×20mm', unit: 'm', qty: round2(((doc.width + doc.height) * 2) / 1000 * 0.8), note: '背衬' },
    { item: '紧固件', spec: 'M8 不锈钢', unit: '套', qty: Math.max(4, Math.ceil(doc.width / 800) * 2), note: '' },
  ];
  return {
    rows,
    totals: { plateAreaM2: round2(plateAreaM2), filmM2: round2(filmM2), plateWeight: round2(plateWeight), colors: colors.length },
    colors,
  };
}

export function colorName(hex) {
  const m = { '#c8102e': '交通红', '#0057a8': '交通蓝', '#00693e': '交通绿', '#ffffff': '白色', '#141414': '黑色', '#f2c200': '黄色' };
  return m[String(hex).toLowerCase()] || '专色';
}

const round2 = (v) => Math.round(v * 100) / 100;

export function buildProcessSpec(doc, sign, version) {
  const bom = computeBOM(doc);
  const lig = legibility(doc);
  return `# 工艺说明 · ${sign.code} ${sign.name} ${version.name}

## 1. 版面参数
- 成品尺寸：${doc.width} × ${doc.height} mm
- 板厚：${doc.plateThickness.toFixed(1)} mm
- 反光膜等级：${doc.filmGrade}
- 安全边距：${doc.safeMargin} mm
- 主视认字符字高：${lig.charHeight} mm（按 0.25 m 视距/1 mm 字高 折算，最小视认距离约 ${lig.distance.toFixed(0)} m）
- 设计速度：${doc.designSpeed} km/h
- 颜色数量：${bom.totals.colors}

## 2. 下料
1. 铝板按 1:1 版面外轮廓切割，${doc.plateThickness.toFixed(1)}mm 3003-H24，边缘去毛刺、倒角 R2。
2. 板面清洁除油，静置干燥 30 min 后方可贴膜。

## 3. 刻字与贴膜
1. 使用本包内 SVG（单位 mm，1:1，已转曲、无变换残留）导入刻字机。
2. 刻字机刀压按膜厚调整，走刀速度 ≤ 600 mm/s，半切深度只透膜层不伤底纸。
3. 分色刻绘后按色序由深到浅、由大到小套贴，套贴误差 ≤ 1.0 mm。
4. 大面积底色膜采用整幅贴覆，赶板排除气泡；气泡直径 > 3 mm 须返工。

## 4. 检验
- 版面内容与 V${version.no} 版本一致，字高偏差 ≤ ±2 mm。
- 色差 ΔE ≤ 3（与封样比对）。
- 反光膜逆反射系数符合 ${doc.filmGrade} 要求。
- 边缘包边平整，无翘边、划伤。

## 5. 包装与运输
- 板面相对放置，中间加软质隔层；四角护角。
- 随货附本工艺说明与材料清单。

> 本工艺卡由「标版通」按版面数据自动生成，投产前须由工艺员复核并签字。
`;
}

export function buildMaterialsCsv(doc, sign) {
  const bom = computeBOM(doc);
  const head = '序号,名称,规格,单位,数量,备注';
  const lines = bom.rows.map((r, i) => [i + 1, r.item, r.spec, r.unit, r.qty, r.note].join(','));
  return `﻿${['# 材料清单 ' + sign.code + ' ' + sign.name, head, ...lines].join('\n')}\n`;
}

/* ------------------------------------------------------------------ */
/* Serialisation helper for SVG (single-layer geometry)               */
/* ------------------------------------------------------------------ */

export function layerPathD(layer, doc) {
  return layerSubpaths(layer, doc).map((s) => subpathToSvgD(s)).join(' ');
}
