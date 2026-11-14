import opentype from 'opentype.js';
import { polylineSubpath, translateSubpaths, subpathsBBox } from './geom.js';

const FONT_URL = '/fonts/sign-font.otf';
let font = null;
let loading = null;

/** Reference drawn height of a typical CJK glyph, in font units (em = 1000). */
let REF_H = 860;
const CJK_RE = /[㐀-鿿豈-﫿　-〿＀-￯]/;

export function loadFont() {
  if (font) return Promise.resolve(font);
  if (loading) return loading;
  loading = fetch(FONT_URL)
    .then((r) => {
      if (!r.ok) throw new Error('字体加载失败 ' + r.status);
      return r.arrayBuffer();
    })
    .then((buf) => {
      font = opentype.parse(buf);
      const g = font.charToGlyph('国');
      const bb = g.path.getBoundingBox();
      if (bb && bb.y2 - bb.y1 > 0) REF_H = bb.y2 - bb.y1;
      return font;
    });
  return loading;
}

export function getFont() {
  return font;
}

const glyphCache = new Map();

function commandsToSubpaths(cmds, sx, sy, dx, dy) {
  const subs = [];
  let cur = null;
  const add = (p) => cur.pts.push(p);
  const start = (x, y) => {
    cur = { closed: false, pts: [{ x: x * sx + dx, y: -y * sy + dy }] };
    subs.push(cur);
  };
  for (const c of cmds) {
    if (c.type === 'M') start(c.x, c.y);
    else if (c.type === 'L') add({ x: c.x * sx + dx, y: -c.y * sy + dy });
    else if (c.type === 'C') {
      const p0 = cur.pts[cur.pts.length - 1];
      p0.cOut = { x: c.x1 * sx + dx, y: -c.y1 * sy + dy };
      add({ x: c.x * sx + dx, y: -c.y * sy + dy, cIn: { x: c.x2 * sx + dx, y: -c.y2 * sy + dy } });
    } else if (c.type === 'Q') {
      // quadratic → cubic
      const p0 = cur.pts[cur.pts.length - 1];
      const qx = c.x1 * sx + dx, qy = -c.y1 * sy + dy;
      p0.cOut = { x: p0.x + (2 / 3) * (qx - p0.x), y: p0.y + (2 / 3) * (qy - p0.y) };
      const end = { x: c.x * sx + dx, y: -c.y * sy + dy };
      end.cIn = { x: end.x + (2 / 3) * (qx - end.x), y: end.y + (2 / 3) * (qy - end.y) };
      add(end);
    } else if (c.type === 'Z') {
      if (cur) {
        cur.closed = true;
        const a = cur.pts[0], b = cur.pts[cur.pts.length - 1];
        if (cur.pts.length > 1 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) {
          if (b.cIn) a.cIn = b.cIn;
          cur.pts.pop();
        }
        cur = null;
      }
    }
  }
  return subs.filter((s) => s.pts.length >= 2);
}

function glyphSubpaths(ch, sx, sy) {
  const key = ch + '|' + sx.toFixed(5) + '|' + sy.toFixed(5);
  const hit = glyphCache.get(key);
  if (hit) return hit;
  let subs = [];
  const g = font.charToGlyph(ch);
  if (g && g.path && g.path.commands.length) {
    subs = commandsToSubpaths(g.path.commands, sx, sy, 0, 0);
  }
  if (glyphCache.size > 4000) glyphCache.clear();
  glyphCache.set(key, subs);
  return subs;
}

export function isCjk(ch) {
  return CJK_RE.test(ch);
}

/** Advance width of a character in mm for the given scale. Latin uses em advance too. */
function advanceOf(ch, sx) {
  const g = font.charToGlyph(ch);
  return ((g.advanceWidth || font.unitsPerEm) * sx);
}

const layoutCache = new Map();

/**
 * Lay out a text block into vector subpaths.
 * charHeight (mm) = drawn height of a typical 汉字; charWidth (mm) = per-character advance box;
 * tracking (mm) = extra gap between characters; lineHeight (mm) = baseline-to-baseline.
 * Returns { subpaths, width, height, lines, lineWidths, bbox }
 */
export function layoutText(text, opts = {}) {
  if (!font) return { subpaths: [], width: 0, height: 0, lines: [], lineWidths: [], bbox: null };
  const {
    charHeight = 400,
    charWidth = 400,
    tracking = 0,
    lineHeight,
    align = 'center',
  } = opts;
  const key = [text, charHeight, charWidth, tracking, lineHeight, align].join('\u0001');
  if (layoutCache.has(key)) return layoutCache.get(key);

  const lines = String(text ?? '').split('\n');
  const sx = charWidth / font.unitsPerEm;
  const sy = charHeight / REF_H;
  const lh = lineHeight && lineHeight > 0 ? lineHeight : charHeight * 1.35;
  const lineWidths = lines.map((line) => {
    const chars = Array.from(line);
    if (!chars.length) return 0;
    let w = 0;
    chars.forEach((ch, i) => {
      w += advanceOf(ch, sx) + (i > 0 ? tracking : 0);
    });
    return w;
  });
  const width = Math.max(0, ...lineWidths);
  const height = (lines.length - 1) * lh + charHeight;

  const subpaths = [];
  const baseline0 = charHeight * 0.86;
  lines.forEach((line, li) => {
    const chars = Array.from(line);
    let penX = 0;
    if (align === 'center') penX = (width - lineWidths[li]) / 2;
    else if (align === 'right') penX = width - lineWidths[li];
    const baselineY = li * lh + baseline0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch !== ' ') {
        const gsubs = glyphSubpaths(ch, sx, sy);
        for (const s of gsubs) subpaths.push(translateSubpaths([s], penX, baselineY)[0]);
      }
      penX += advanceOf(ch, sx) + (i < chars.length - 1 ? tracking : 0);
    }
  });

  const anchorOffset = align === 'center' ? -width / 2 : align === 'right' ? -width : 0;
  const res = {
    subpaths: anchorOffset ? translateSubpaths(subpaths, anchorOffset, 0) : subpaths,
    width,
    height,
    lines,
    lineWidths,
    bbox: { x: 0, y: 0, width, height },
  };
  if (layoutCache.size > 400) layoutCache.clear();
  layoutCache.set(key, res);
  return res;
}

/** Measure the drawn bbox of a laid out text block. */
export function measuredBBox(layout) {
  return subpathsBBox(layout.subpaths);
}

export function textLayerSubpaths(layer) {
  if (layer.type !== 'text') return [];
  const layout = layoutText(layer.text, {
    charHeight: layer.charHeight,
    charWidth: layer.charWidth,
    tracking: layer.tracking,
    lineHeight: layer.lineHeight,
    align: layer.align,
  });
  return translateSubpaths(layout.subpaths, layer.x, layer.y);
}

export function textLayoutFor(layer) {
  return layoutText(layer.text, {
    charHeight: layer.charHeight,
    charWidth: layer.charWidth,
    tracking: layer.tracking,
    lineHeight: layer.lineHeight,
    align: layer.align,
  });
}
