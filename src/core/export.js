import {
  layerSubpaths, computeBOM, buildProcessSpec, plateSubpaths,
  colorName, legibility, areaOfSubpaths,
} from './model.js';

export { computeBOM, buildProcessSpec } from './model.js';
import { flattenSubpath, subpathToSvgD, polylineSubpath, strokeOutlineSubpaths, subpathsBBox } from './geom.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function signSvgFilename(sign, version) {
  return `${sign.code}_${version.name}_版面.svg`;
}

export function packageFilename(sign, version) {
  return `${sign.code}_${version.name}_投产包.zip`;
}

/**
 * Clean production SVG, 1:1 in millimetres.
 * - 一个图层一个 <g>，填充/描边全部转成路径，没有 transform、没有 clipPath
 * - 描边图层单独输出为描边轮廓路径（刻字机按切割线走刀）
 * - 白色/彩色文字已经转曲
 */
export function buildSvg(doc, { sign, version, includeMeta = true, cutterMode = 'offset-fill' } = {}) {
  const lines = [];
  const w = doc.width, h = doc.height;
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`);
  if (includeMeta) {
    lines.push('  <title>' + esc(`${sign ? sign.code + ' ' + sign.name : ''} ${version ? version.name : ''} 版面文件`) + '</title>');
    lines.push('  <desc>' + esc(`单位 mm，1:1，坐标原点在版面左上角。字体已转曲。生成于标版通。`) + '</desc>');
  }
  lines.push(`  <g id="plate-outline" fill="none" stroke="#000000" stroke-width="0.3">`);
  const plateD = plateSubpaths(doc).map((s) => subpathToSvgD(s)).join(' ');
  lines.push(`    <path d="${plateD}" />`);
  lines.push('  </g>');

  const layers = doc.layers.filter((l) => l.visible !== false);
  // cut order: largest area first (by fill colour), strokes after fills — keeps the
  // cutter from dragging small pieces through wet vinyl.
  const groups = new Map();
  for (const layer of layers) {
    const subs = layerSubpaths(layer, doc);
    if (!subs.length) continue;
    if (layer.stroke && layer.strokeWidth > 0) {
      const key = `stroke:${layer.stroke}`;
      const arr = groups.get(key) || { color: layer.stroke, mode: 'stroke', width: layer.strokeWidth, layers: [], area: 0, hasPlate: false };
      arr.layers.push(layer);
      arr.area += areaOfSubpaths(subs);
      groups.set(key, arr);
    }
    if (layer.fill) {
      const key = `fill:${layer.fill}`;
      const arr = groups.get(key) || { color: layer.fill, mode: 'fill', layers: [], area: 0, hasPlate: false };
      arr.layers.push(layer);
      arr.area += areaOfSubpaths(subs);
      if (layer.kind === 'plate') arr.hasPlate = true;
      groups.set(key, arr);
    }
  }

  // 应用顺序：先大后小 — 底板色铺底，小字与细线最后套贴；同时保证任何 SVG
  // 查看器里的叠放顺序与版面一致（按面积从大到小、底板优先）。
  const ordered = [...groups.values()].sort((a, b) => {
    if (a.hasPlate !== b.hasPlate) return a.hasPlate ? -1 : 1;
    return b.area - a.area;
  });

  let cutIndex = 0;
  for (const g of ordered) {
    const color = g.color;
    const id = `cut-${String(++cutIndex).padStart(2, '0')}-${colorName(color).replace(/\s/g, '')}`;
    // One <path> per layer keeps counters/holes attached to their outer ring
    // (fill-rule=evenodd). Separate paths would fill the holes solid.
    const layerDs = [];
    for (const layer of g.layers) {
      let subs;
      if (g.mode === 'fill') {
        subs = layerSubpaths(layer, doc);
      } else {
        subs = strokeOutlineSubpaths(layerSubpaths(layer, doc), g.width, 0.15).filter((s) => s.closed);
      }
      if (!subs.length) continue;
      layerDs.push(subs.map((s) => subpathToSvgD(s)).join(' '));
    }
    if (!layerDs.length) continue;
    const note = g.mode === 'stroke' ? ' data-note="描边已转轮廓，按填充切割"' : '';
    lines.push(`  <g id="${id}" fill="${color}" fill-rule="evenodd" stroke="none" data-color-name="${esc(colorName(color))}" data-cut-order="${cutIndex}"${note}>`);
    for (const d of layerDs) lines.push(`    <path d="${cleanD(d)}" />`);
    lines.push('  </g>');
  }
  lines.push('</svg>');
  return lines.join('\n') + '\n';
}

function cleanD(d) {
  return d.replace(/\s+/g, ' ').replace(/(\d)-/g, '$1 -').trim();
}

/** Diff overlay SVG for reviewers (not for production). */
export function buildDiffSvg(doc, rings, marks) {
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${doc.width}mm" height="${doc.height}mm" viewBox="0 0 ${doc.width} ${doc.height}">`);
  lines.push('  <rect width="100%" height="100%" fill="#ffffff"/>');
  lines.push('  <g fill="rgba(255,45,111,0.35)" stroke="#ff2d6f" stroke-width="3">');
  for (const ring of rings) lines.push(`    <path d="${subpathToSvgD(polylineSubpath(ring, true))}"/>`);
  lines.push('  </g>');
  lines.push('</svg>');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Package assembly                                                   */
/* ------------------------------------------------------------------ */

function bomCsv(bom, sign) {
  const head = '序号,名称,规格,单位,数量,备注';
  const rows = bom.rows.map((r, i) => [i + 1, r.item, r.spec, r.unit, r.qty, r.note].map(csvCell).join(','));
  return '﻿' + [`# 材料清单 ${sign.code} ${sign.name}`, head, ...rows].join('\r\n') + '\r\n';
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function buildPackage({ sign, version, diff }) {
  const { default: JSZip } = await import('jszip');
  const doc = version.doc;
  const zip = new JSZip();
  const base = `${sign.code}_${version.name}`;

  const svg = buildSvg(doc, { sign, version });
  zip.file(`${base}_版面.svg`, svg);

  // cutter-friendly single-colour summary of each cut layer
  zip.file(`${base}_开料说明.txt`, buildCutSheet(doc, sign, version));

  const bom = computeBOM(doc);
  zip.file(`${base}_材料清单.csv`, bomCsv(bom, sign));
  zip.file(`${base}_工艺说明.md`, buildProcessSpec(doc, sign, version));

  // version manifest + review trail
  zip.file(`${base}_版本清单.json`, JSON.stringify({
    sign: { code: sign.code, name: sign.name, category: sign.category, location: sign.location, owner: sign.owner },
    version: { name: version.name, no: version.no, approvedAt: version.approvedAt, author: version.author },
    doc: { width: doc.width, height: doc.height, plate: doc.plate, plateThickness: doc.plateThickness, filmGrade: doc.filmGrade, safeMargin: doc.safeMargin },
    totals: bom.totals,
    comments: sign.comments.map((c) => ({
      no: c.no, version: sign.versions.find((v) => v.id === c.versionId)?.name || '-',
      kind: c.kind, status: c.status, text: c.text, author: c.author,
      replies: c.replies.map((r) => ({ author: r.author, action: r.action, text: r.text, at: r.createdAt })),
      closedBy: c.closedBy, closedAt: c.closedAt,
    })),
  }, null, 2));

  zip.file(`${base}_审片记录.md`, buildReviewRecord(sign));

  if (diff) {
    zip.file(`${base}_与上一版差异.svg`, buildDiffSvg(doc, diff.rings, diff.changedNames));
    zip.file(`${base}_差异清单.md`, buildDiffList(sign, diff));
  } else {
    zip.file(`${base}_差异清单.md`, `# 差异清单\n\n${version.name} 为首版，无上一版可比对。\n`);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return { blob, filename: packageFilename(sign, version), svg };
}

function buildCutSheet(doc, sign, version) {
  const rows = [];
  let n = 0;
  for (const layer of doc.layers) {
    if (layer.visible === false) continue;
    const subs = layerSubpaths(layer, doc);
    if (!subs.length) continue;
    const bb = subpathsBBox(subs);
    if (layer.fill) {
      rows.push(`${String(++n).padStart(2, '0')}. ${layer.name} | 填充 ${colorName(layer.fill)} ${layer.fill} | 外接 ${fmt(bb.width)}×${fmt(bb.height)}mm @ (${fmt(bb.x)}, ${fmt(bb.y)})`);
    }
    if (layer.stroke && layer.strokeWidth > 0) {
      rows.push(`${String(++n).padStart(2, '0')}. ${layer.name} | 描边 ${colorName(layer.stroke)} ${layer.stroke} 线宽 ${fmt(layer.strokeWidth)}mm | 外接 ${fmt(bb.width)}×${fmt(bb.height)}mm`);
    }
  }
  const lig = legibility(doc);
  return `开料说明 · ${sign.code} ${sign.name} · ${version.name}

成品尺寸 ${doc.width} × ${doc.height} mm
板厚 ${doc.plateThickness.toFixed(1)} mm
主视认字高 ${lig.charHeight} mm（折算视认距离约 ${lig.distance.toFixed(0)} m）

刀路顺序（按面积由大到小、底板优先；小字与细线最后套贴）：
${rows.join('\n')}

注意：
- SVG 中所有文字已转曲，直接导入刻字机，无需再指定字体。
- 描边图层已在 SVG 中转为闭合轮廓，按填充切割即可，不要再加描边。
- 请勿整体缩放，文件为 1:1 实际尺寸。
`;
}

const fmt = (v) => Math.round(v * 10) / 10;

function buildReviewRecord(sign) {
  const lines = [`# 审片记录 · ${sign.code} ${sign.name}`, ''];
  const byVersion = new Map();
  for (const c of sign.comments) {
    const v = sign.versions.find((x) => x.id === c.versionId);
    const key = v ? v.name : '未关联';
    if (!byVersion.has(key)) byVersion.set(key, []);
    byVersion.get(key).push(c);
  }
  for (const v of sign.versions) {
    lines.push(`## ${v.name} · ${versionStatusLabel(v.status)} · 提交 ${v.submittedAt ? v.submittedAt.slice(0, 10) : '—'}${v.approvedAt ? ' · 通过 ' + v.approvedAt.slice(0, 10) : ''}`);
    const list = byVersion.get(v.name) || [];
    if (!list.length) { lines.push('无批注。', ''); continue; }
    for (const c of list) {
      lines.push(`- #${c.no} [${c.kind === 'layer' ? '元素批注' : '画面打点'}] ${c.text}`);
      lines.push(`  - 提出：${c.author} ${c.createdAt.slice(0, 10)}`);
      for (const r of c.replies) {
        lines.push(`  - 回复：${r.author}（${r.action === 'declined' ? '不修改' : '已处理'}）${r.text}`);
      }
      lines.push(`  - 状态：${c.status === 'closed' ? `已关闭（${c.closedBy} ${c.closedAt?.slice(0, 10)}）` : '未关闭'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function versionStatusLabel(s) {
  return { draft: '草稿', submitted: '审核中', returned: '已退回', approved: '已通过' }[s] || s;
}

function buildDiffList(sign, diff) {
  return `# 差异清单\n\n比对范围：${diff.baseName} → ${diff.targetName}\n\n发生变化的元素：\n${diff.changedNames.map((n) => `- ${n}`).join('\n') || '- 无'}\n`;
}
