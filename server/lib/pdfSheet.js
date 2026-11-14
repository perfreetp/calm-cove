// PDF sheet renderer for tunnel ventilation system drawings.
//
// An 8.5 km tunnel cannot be drawn legibly on one sheet, so the deliverable
// follows the convention of real ventilation drawing sets: the corridor is cut
// into bands, each page carries up to two stacked band strips at 1:500, and the
// remaining space carries the per-section schedule, the page's issue list, the
// legend, notes and the QC stamp. Both axes share one scale so symbols keep
// their true proportions.
//
// All geometry is in millimetres. PDFKit's `unit` option changes only the
// coordinate system (never the page size), so the page is set explicitly in
// points and the graphics context is scaled once; a millimetre is a millimetre.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { nowIso } from '../db.js';
import {
  LAYERS, LAYER_ORDER, KINDS, formatChainage, SHEET_SIZES_MM, STATUS_LABELS, ISSUE_TYPES,
} from '../../shared/domain.js';

// Resolve a CJK-capable font at runtime. A bundled font wins; otherwise fall
// back to a system font (Windows SimHei / Noto Sans SC, macOS PingFang).
// We deliberately do not commit a proprietary system font to the repository.
function resolveCjkFont() {
  const candidates = [
    process.env.PDF_CJK_FONT,
    path.resolve('server/assets/SimHei.ttf'),
    path.resolve('server/assets/NotoSansSC.ttf'),
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/NotoSansSC-VF.ttf',
    '/System/Library/Fonts/PingFang.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* keep looking */ }
  }
  throw new Error(
    '未找到可用的中文字体。请设置环境变量 PDF_CJK_FONT 指向一个中文 TTF/TTC 字体，' +
    '或将字体放到 server/assets/NotoSansSC.ttf。'
  );
}
const FONT = resolveCjkFont();
const PT_PER_MM = 72 / 25.4;
const ROOM_STRIP_M = 8;
const ROW_GAP_M = 3;
const MAX_STRIPS_PER_PAGE = 3;
const SCALE_DENOM = 500;
const MM_PER_M = 1000 / SCALE_DENOM;

// Typography in millimetres. Drawing annotations are ~2 mm; headings 3–6 mm.
const T = {
  tiny: 1.9, small: 2.15, body: 2.3, head: 3.0, title: 6.0,
  titleBlock: 2.4, stamp: 4.2,
};
const lineFor = (size, gap = 0.55) => size + gap;

export function collectPdfBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function buildRows(layout) {
  const rows = [];
  let cursor = 0;
  const roomDistance = layout.boreW / 2 + 19;
  for (let b = 0; b < layout.bores; b++) {
    const cy = layout.centers[b];
    const sign = cy >= 0 ? 1 : -1;
    rows.push({
      bore: b, kind: 'room', top: cursor, height: ROOM_STRIP_M,
      physCentre: cy + sign * roomDistance, label: `${layout.boreLabels[b]}风机房`,
    });
    cursor += ROOM_STRIP_M + ROW_GAP_M;
    rows.push({
      bore: b, kind: 'bore', top: cursor, height: layout.boreW,
      physCentre: cy, label: `${layout.boreLabels[b]}（${layout.boreNames[b]}洞）`,
    });
    cursor += layout.boreW + ROW_GAP_M * 1.5;
  }
  return { rows, stackHeight: cursor };
}

export function buildPdf({ project, sections, elements, layout, findings, spec, qcVerdict, qcId }) {
  const [pwmm, phmm] = SHEET_SIZES_MM[spec] || SHEET_SIZES_MM.A1;
  const landscape = pwmm > phmm;
  const W = landscape ? pwmm : phmm;
  const H = landscape ? phmm : pwmm;
  const pageSize = [W * PT_PER_MM, H * PT_PER_MM];

  const doc = new PDFDocument({
    size: pageSize,
    margin: 0,
    autoFirstPage: false,
    info: {
      Title: `${project.code} ${project.name} 通风系统图`,
      Author: '隧道机电图档交付平台',
      Subject: 'Tunnel ventilation schematic',
      Keywords: `tunnel;ventilation;${project.code}`,
    },
  });
  doc.registerFont('cn', FONT);

  const margin = 12;
  const frameX = margin;
  const frameW = W - margin * 2;
  const frameBottom = H - margin;
  const headerH = 26;
  const topY = margin + headerH;
  const leftGutter = 21;
  const stripW = frameW - leftGutter - 8;

  const { rows, stackHeight } = buildRows(layout);
  const len = project.length_m;
  const stripH = stackHeight * MM_PER_M;

  const stripLabelH = 5;
  const stripBlockH = stripLabelH + stripH + 6;
  const stripsTop = topY + 2;
  const titleBlockH = 19;
  // Reserve a band for the schedule/issue/legend panels, then give all the
  // remaining height to drawing strips (up to three per page).
  const panelMinH = 82;
  const availableH = frameBottom - titleBlockH - 4 - panelMinH - stripsTop;
  const stripsPerPage = Math.max(1, Math.min(MAX_STRIPS_PER_PAGE, Math.floor(availableH / stripBlockH)));
  const stripsBottom = stripsTop + stripsPerPage * stripBlockH;

  const panelTop = stripsBottom + 2;
  const panelBottom = frameBottom - titleBlockH - 4;
  const panelH = panelBottom - panelTop;
  const rightPanelW = Math.min(152, frameW * 0.22);
  const leftPanelW = frameW - rightPanelW - 5;

  // At 1:500 a strip of `stripW` mm spans stripW × 0.5 m.
  const bandM = Math.max(100, Math.floor((stripW * SCALE_DENOM / 1000) / 25) * 25);
  const bands = [];
  for (let x0 = 0; x0 < len - 1e-6; x0 += bandM) bands.push([x0, Math.min(len, x0 + bandM)]);
  if (!bands.length) bands.push([0, len]);
  const pages = [];
  for (let i = 0; i < bands.length; i += stripsPerPage) pages.push(bands.slice(i, i + stripsPerPage));

  const colorOf = (layer) => LAYERS[layer]?.color || '#333';

  const fanBySection = new Map();
  const elemBySection = new Map();
  for (const e of elements) {
    if (e.section_id == null) continue;
    elemBySection.set(e.section_id, (elemBySection.get(e.section_id) || 0) + 1);
    if (e.kind === 'jet_fan') fanBySection.set(e.section_id, (fanBySection.get(e.section_id) || 0) + 1);
  }
  const problemElems = new Set();
  const problemBySection = new Map();
  for (const f of findings) {
    for (const id of f.element_ids) problemElems.add(id);
    if (f.section_id != null) {
      problemBySection.set(f.section_id, (problemBySection.get(f.section_id) || 0) + 1);
    }
  }
  const sectionsByBore = new Map();
  for (const sec of sections) {
    if (!sectionsByBore.has(sec.bore_index)) sectionsByBore.set(sec.bore_index, []);
    sectionsByBore.get(sec.bore_index).push(sec);
  }
  const dupCode = new Map();
  for (const sec of sections) dupCode.set(sec.code, (dupCode.get(sec.code) || 0) + 1);
  const secById = new Map(sections.map((s) => [s.id, s]));

  const rowFor = (e) => rows.find(
    (r) => r.bore === e.bore_index && (e.kind === 'fan_equip' ? r.kind === 'room' : r.kind === 'bore')
  );

  /** Draw one band strip at (x, y); returns band statistics. */
  function drawStrip(bs, be, x, y) {
    const s = MM_PER_M;
    const tx = (m) => x + leftGutter + (m - bs) * s;
    const tyStack = (m) => y + stripLabelH + m * s;
    const tyPhys = (row, offset) => tyStack(row.top + row.height / 2 + (offset - row.physCentre));

    doc.save();
    doc.rect(x, y - 0.8, frameW - 2, stripBlockH + 1.4).clip();

    // Row footprints
    for (const row of rows) {
      const y0 = tyStack(row.top);
      const hgt = row.height * s;
      if (row.kind === 'bore') {
        doc.fillColor('#ffffff').rect(tx(bs), y0, (be - bs) * s, hgt).fill();
        doc.lineWidth(0.18).strokeColor('#cfdae3');
        for (const off of [-layout.roadW / 2, layout.roadW / 2]) {
          doc.moveTo(tx(bs), tyPhys(row, row.physCentre + off))
            .lineTo(tx(be), tyPhys(row, row.physCentre + off)).stroke();
        }
        doc.lineWidth(0.14).strokeColor('#a8b8c5');
        for (let m = bs; m <= be; m += 4) {
          for (const side of [-1, 1]) {
            const wy = tyPhys(row, row.physCentre + side * row.height / 2);
            doc.moveTo(tx(m), wy).lineTo(tx(m + 1.8), wy - side * 1.8).stroke();
          }
        }
        doc.lineWidth(0.5).strokeColor('#6f8596').rect(tx(bs), y0, (be - bs) * s, hgt).stroke();
        doc.lineWidth(0.14).strokeColor('#e2e9ef').dash(1.6, { space: 1.3 });
        doc.moveTo(tx(bs), tyPhys(row, row.physCentre)).lineTo(tx(be), tyPhys(row, row.physCentre)).stroke();
        doc.undash();
      } else {
        doc.fillColor('#fafcfe').rect(tx(bs), y0, (be - bs) * s, hgt).fill();
        doc.lineWidth(0.26).strokeColor('#c4d2de').rect(tx(bs), y0, (be - bs) * s, hgt).stroke();
        doc.moveTo(tx(bs), y0 + hgt / 2).lineTo(tx(be), y0 + hgt / 2).stroke();
      }
      doc.fillColor('#5f7283').fontSize(T.tiny)
        .text(row.label, x + 1, y0 + hgt / 2 - T.tiny * 0.6, {
          width: leftGutter - 4, align: 'right', lineBreak: false,
        });
    }

    // Section dividers, codes, per-section fan counts
    doc.font('cn');
    for (const row of rows) {
      if (row.kind !== 'bore') continue;
      for (const sec of sectionsByBore.get(row.bore) || []) {
        if (sec.end_m < bs - 1 || sec.start_m > be + 1) continue;
        const sx = tx(Math.max(sec.start_m, bs));
        const ex = tx(Math.min(sec.end_m, be));
        const top = tyStack(row.top);
        const bot = tyStack(row.top + row.height);
        doc.lineWidth(0.34).strokeColor('#a986e8').moveTo(sx, top).lineTo(sx, bot).stroke();
        doc.moveTo(sx, top).lineTo(sx + 1.8, top).stroke();
        doc.fillColor('#6d4fa8').fontSize(T.small).text(sec.code, sx + 0.6, top + 0.4, { lineBreak: false });
        if (ex - sx > 24) {
          const label = `${fanBySection.get(sec.id) || 0} 台射流风机`;
          doc.fontSize(T.tiny);
          const tw = doc.widthOfString(label) + 1.4;
          doc.fillColor('#ffffff').rect(sx + 1.6, bot - 3.0, tw, T.tiny + 1.0).fill();
          doc.fillColor('#2b6f9e').text(label, sx + 2.3, bot - 2.9, { lineBreak: false });
        }
      }
    }

    // Elements
    const shown = elements.filter(
      (e) => e.kind !== 'chainage_mark' && e.chainage >= bs - 10 && e.chainage <= be + 10
    );
    const groups = new Map();
    for (const e of shown) {
      const key = (e.kind === 'duct' || e.kind === 'cable_tray') ? `L${e.id}` : `E${e.id}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }

    for (const [, group] of groups) {
      const e = group[0];
      const k = KINDS[e.kind];
      const row = rowFor(e);
      if (!row) continue;
      const c = colorOf(e.layer);
      const px = tx(e.chainage);
      const py = tyPhys(row, e.offset);
      const wp = Math.max(0.4, k.w * s);
      const hp = Math.max(0.28, k.h * s);
      doc.lineWidth(0.16).strokeColor(c).fillColor(c);

      switch (e.kind) {
        case 'jet_fan': {
          doc.rect(px - wp / 2, py - hp / 2, wp, hp).stroke();
          if (wp > 2.2) {
            doc.moveTo(px - wp * 0.3, py + hp / 2).lineTo(px - wp * 0.06, py - hp / 2).stroke();
            doc.moveTo(px + wp * 0.3, py + hp / 2).lineTo(px + wp * 0.06, py - hp / 2).stroke();
          }
          const dir = e.angle_deg === 180 ? -1 : 1;
          doc.lineWidth(0.22).moveTo(px - dir * wp * 0.5, py).lineTo(px + dir * wp * 0.68, py).stroke();
          if (wp > 7 && e.chainage % 24 < 8) {
            doc.fontSize(T.tiny).fillColor(c)
              .text(e.code.slice(-4), px - wp / 2, py + hp / 2 + 0.25,
                { width: wp, align: 'center', lineBreak: false });
          }
          break;
        }
        case 'damper':
          doc.rect(px - wp / 2, py - hp / 2, wp, hp).stroke();
          doc.moveTo(px - wp / 2, py - hp / 2).lineTo(px + wp / 2, py + hp / 2).stroke();
          break;
        case 'duct':
        case 'cable_tray': {
          const lenM = e.length_override || k.w;
          doc.moveTo(tx(e.chainage - lenM / 2), py - hp / 2)
            .lineTo(tx(e.chainage + lenM / 2), py - hp / 2).stroke();
          doc.moveTo(tx(e.chainage - lenM / 2), py + hp / 2)
            .lineTo(tx(e.chainage + lenM / 2), py + hp / 2).stroke();
          break;
        }
        case 'co_sensor':
        case 'vi_sensor':
          doc.circle(px, py, Math.max(0.36, wp * 0.4)).stroke();
          if (wp > 2.2) {
            doc.fillColor(c).font('cn').fontSize(T.tiny)
              .text(e.kind === 'co_sensor' ? 'CO' : 'VI', px - wp / 2, py - T.tiny * 0.6,
                { width: wp, align: 'center', lineBreak: false });
          }
          if (!e.mounted) {
            doc.lineWidth(0.36).strokeColor('#e0563f')
              .moveTo(px - 1.0, py - 1.0).lineTo(px + 1.0, py + 1.0).stroke();
          }
          break;
        case 'fan_equip':
          doc.rect(px - wp / 2, py - hp / 2, wp, hp).stroke();
          doc.moveTo(px - wp / 2, py).lineTo(px + wp / 2, py).stroke();
          break;
        case 'civil_joint':
          doc.moveTo(px, py - hp / 2).lineTo(px, py + hp / 2).stroke();
          break;
        default:
          doc.circle(px, py, 0.32).stroke();
      }
    }

    // Problem markers
    let marked = 0;
    doc.lineWidth(0.38).strokeColor('#d9503a');
    for (const e of shown) {
      if (!problemElems.has(e.id)) continue;
      const row = rowFor(e);
      if (!row) continue;
      doc.circle(tx(e.chainage), tyPhys(row, e.offset),
        Math.max(1.0, (KINDS[e.kind]?.w || 2) * s * 0.6)).stroke();
      marked++;
    }

    doc.restore();

    // Band label
    doc.fillColor('#33506a').fontSize(T.small)
      .text(`${formatChainage(bs)} ~ ${formatChainage(be)}     比例 1:500     本段要素 ${shown.length} 项     问题标记 ${marked} 处`,
        x + leftGutter, y + 0.4, { lineBreak: false });
    if (bs > 0) {
      doc.fillColor('#7b8fa1').text(`◀ 接上段 ${formatChainage(bs)}`, x + frameW - 44, y + 0.4, { lineBreak: false });
    }
    if (be < len) {
      doc.fillColor('#7b8fa1').text('续下段 ▶', x + frameW - 16, y + 0.4, { lineBreak: false });
    }

    // Chainage ruler
    const rulerY = y + stripLabelH + stripH + 1.4;
    const tickStep = 25;
    doc.lineWidth(0.2).strokeColor('#8ea2b4').moveTo(tx(bs), rulerY).lineTo(tx(be), rulerY).stroke();
    for (let m = Math.ceil(bs / tickStep) * tickStep; m <= be; m += tickStep) {
      const X = tx(m);
      const major = m % 100 === 0;
      doc.lineWidth(0.2).moveTo(X, rulerY).lineTo(X, rulerY + (major ? 2.0 : 1.1)).stroke();
      if (major) {
        doc.fillColor('#56708a').fontSize(T.tiny)
          .text(formatChainage(m), X - 8, rulerY + 2.1, { width: 16, align: 'center', lineBreak: false });
      }
    }

    return { shown: shown.length, marked };
  }

  pages.forEach((pageBands, pageIdx) => {
    doc.addPage({ size: pageSize, margin: 0 });
    doc.scale(PT_PER_MM);

    // ---------- Frame ----------
    doc.lineWidth(0.35).strokeColor('#26333f').rect(margin, margin, frameW, H - margin * 2).stroke();

    // ---------- Header ----------
    doc.font('cn').fillColor('#5a7186').fontSize(T.small)
      .text(`${project.code}     第 ${pageIdx + 1} / ${pages.length} 页     通风系统图（系统展开示意 · 比例 1:500）`,
        margin + 5, margin + 2.8, { width: frameW - 10, lineBreak: false });
    doc.fillColor('#0b3d5c').fontSize(T.title)
      .text(project.name, margin + 5, margin + 6.6, { width: frameW - 10, lineBreak: false });
    doc.fillColor('#3c536b').fontSize(T.small)
      .text(`委托单位：${project.client_name}     里程：${project.segment || '—'}     全长：${project.length_m} m     ` +
        `车道：${project.lanes}     幅面：${spec}     本页范围：${pageBands.map(([bs, be]) => `${formatChainage(bs)}~${formatChainage(be)}`).join(' / ')}`,
        margin + 5, margin + 15.4, { width: frameW - 10, lineBreak: false });
    doc.lineWidth(0.25).strokeColor('#9fb0bd')
      .moveTo(margin + 4, margin + headerH - 1.2).lineTo(W - margin - 4, margin + headerH - 1.2).stroke();

    // ---------- Strips ----------
    const stats = [];
    pageBands.forEach(([bs, be], i) => {
      const y = stripsTop + i * stripBlockH;
      doc.lineWidth(0.2).strokeColor('#c9d6e1').rect(frameX + 1, y - 1.2, frameW - 2, stripBlockH).stroke();
      stats.push(drawStrip(bs, be, frameX + 1, y));
    });

    // ---------- Panels ----------
    doc.lineWidth(0.3).strokeColor('#9fb0bd').rect(frameX, panelTop, leftPanelW, panelH).stroke();
    doc.rect(frameX + leftPanelW + 5, panelTop, rightPanelW, panelH).stroke();

    const pageSections = sections.filter((sec) =>
      pageBands.some(([bs, be]) => sec.end_m >= bs && sec.start_m <= be));
    const pageSecIds = new Set(pageSections.map((s) => s.id));
    const pageIssues = findings.filter((f) => f.section_id != null && pageSecIds.has(f.section_id));

    // --- Left panel: schedule (left) and issue list (right) side by side ---
    const halfGap = 6;
    const colLW = (leftPanelW - halfGap) / 2;
    const colLX = frameX + 3.0;
    const colRX = frameX + colLW + halfGap + 1.0;
    const colBW = colLW - 4.0;

    // Schedule header
    let py = panelTop + 3.0;
    doc.fillColor('#22364a').fontSize(T.head)
      .text(`区段要素统计表（本页 ${pageSections.length} 个区段）`, colLX, py, { lineBreak: false, width: colBW });
    py += lineFor(T.head) + 1.4;

    const cols = [
      { label: '区段', w: 20, align: 'left' },
      { label: '范围 (m)', w: 34, align: 'left' },
      { label: '状态', w: 24, align: 'left' },
      { label: '要素', w: 18, align: 'right' },
      { label: '风机', w: 18, align: 'right' },
      { label: '重号', w: 15, align: 'right' },
      { label: '返工', w: 15, align: 'right' },
      { label: '问题', w: 15, align: 'right' },
    ];
    const colSum = cols.reduce((a, c) => a + c.w, 0);
    const colScale = colBW / colSum;
    const rowH = 3.6;

    const headY = py;
    doc.fillColor('#4d6274').fontSize(T.small);
    let cx = colLX;
    for (const c of cols) {
      doc.text(c.label, cx + 0.4, headY, { width: c.w * colScale - 0.8, align: c.align, lineBreak: false });
      cx += c.w * colScale;
    }
    doc.lineWidth(0.2).strokeColor('#c5d2dd')
      .moveTo(colLX, headY + lineFor(T.small)).lineTo(colLX + colBW, headY + lineFor(T.small)).stroke();
    py = headY + lineFor(T.small) + 1.4;

    const tableMaxRows = Math.max(1, Math.floor((panelBottom - 2.5 - py) / rowH));
    const shownRows = pageSections.slice(0, tableMaxRows);

    shownRows.forEach((sec, i) => {
      const y = py + i * rowH;
      if (i % 2 === 1) doc.fillColor('#f6f9fb').rect(colLX, y - 0.5, colBW, rowH).fill();
      const dup = dupCode.get(sec.code) || 0;
      const issues = problemBySection.get(sec.id) || 0;
      const vals = [
        sec.code,
        `${Math.round(sec.start_m)}–${Math.round(sec.end_m)}   ${formatChainage(sec.start_m)}–${formatChainage(sec.end_m)}`,
        STATUS_LABELS[sec.status] || sec.status,
        String(elemBySection.get(sec.id) || 0),
        String(fanBySection.get(sec.id) || 0),
        dup > 1 ? String(dup) : '—',
        String(sec.rework_count || 0),
        String(issues),
      ];
      let vx = colLX;
      vals.forEach((v, vi) => {
        const model = cols[vi];
        doc.fillColor(
          vi === 5 && dup > 1 ? '#c04532'
            : vi === 7 && issues > 0 ? '#c04532'
              : vi === 6 && Number(v) > 0 ? '#a8761b' : '#2f4459'
        ).fontSize(T.body).text(v, vx + 0.4, y, {
          width: model.w * colScale - 0.8, align: model.align, lineBreak: false,
        });
        vx += model.w * colScale;
      });
    });
    py += shownRows.length * rowH;
    if (pageSections.length > shownRows.length) {
      doc.fillColor('#7b8fa1').fontSize(T.tiny)
        .text(`…… 其余 ${pageSections.length - shownRows.length} 个区段见交付包内「区段要素清单」CSV`,
          colLX + 1, py + 0.7, { lineBreak: false, width: colBW });
      py += lineFor(T.tiny);
    }
    if (!pageSections.length) {
      doc.fillColor('#8a9cab').fontSize(T.small)
        .text('本页范围内无区段。', colLX + 1, py + 0.7, { lineBreak: false });
      py += lineFor(T.small);
    }

    // Vertical divider between the two columns
    doc.lineWidth(0.2).strokeColor('#d5e0e8')
      .moveTo(frameX + colLW + 2.4, panelTop + 2.6)
      .lineTo(frameX + colLW + 2.4, panelBottom - 2.6).stroke();

    // --- Issue list (right half of the left panel) ---
    let iy = panelTop + 3.0;
    doc.fillColor('#22364a').fontSize(T.head)
      .text(`本页问题清单（${pageIssues.length} 项）`, colRX, iy, { lineBreak: false, width: colBW });
    iy += lineFor(T.head) + 1.4;

    doc.fillColor('#4d6274').fontSize(T.small);
    doc.text('类型', colRX + 0.4, iy, { width: 12, lineBreak: false });
    doc.text('区段', colRX + 14, iy, { width: 12, lineBreak: false });
    doc.text('说明', colRX + 28, iy, { width: colBW - 28, lineBreak: false });
    doc.lineWidth(0.2).strokeColor('#e2cfc8')
      .moveTo(colRX, iy + lineFor(T.small)).lineTo(colRX + colBW, iy + lineFor(T.small)).stroke();
    iy += lineFor(T.small) + 1.4;

    const issueRowH = 3.5;
    const issueMaxRows = Math.max(1, Math.floor((panelBottom - 2.5 - iy) / issueRowH));
    if (!pageIssues.length) {
      doc.fillColor('#4d7a5b').fontSize(T.small)
        .text('本页无自动校验问题。', colRX + 1, iy, { lineBreak: false });
    }
    pageIssues.slice(0, issueMaxRows).forEach((f, i) => {
      const y = iy + i * issueRowH;
      const sec = secById.get(f.section_id);
      const tag = ISSUE_TYPES[f.check_type]?.short || '问题';
      doc.fillColor('#b2462e').fontSize(T.body).text(tag, colRX + 0.4, y, { width: 12, lineBreak: false });
      doc.fillColor('#7a5a50').text(sec ? sec.code : '—', colRX + 14, y, { width: 12, lineBreak: false });
      doc.fillColor('#3f5568').text(f.message, colRX + 28, y,
        { width: colBW - 28, lineBreak: false, ellipsis: true });
    });
    if (pageIssues.length > issueMaxRows) {
      doc.fillColor('#7b8fa1').fontSize(T.tiny)
        .text(`…… 其余 ${pageIssues.length - issueMaxRows} 项详见交付包内校验报告`,
          colRX + 28, iy + issueMaxRows * issueRowH + 0.5, { lineBreak: false });
    }

    // --- Signature block fills the space between schedule and ribbon ---
    {
      const signTop = Math.max(iy + Math.min(pageIssues.length, issueMaxRows) * issueRowH + 8.0, py + 5.0);
      const signBottom = panelBottom - 30;
      if (signBottom - signTop > 18) {
        const signH = signBottom - signTop;
        const signW = colBW;
        doc.lineWidth(0.3).strokeColor('#9fb0bd').rect(colLX, signTop, signW, signH).stroke();
        doc.fillColor('#22364a').fontSize(T.head)
          .text('会签栏', colLX + 1.6, signTop + 1.4, { lineBreak: false });
        const cols = ['专业', '签字', '日期', '备注'];
        const cw = [22, 30, 26, signW - 22 - 30 - 26];
        let sx = colLX;
        const rowHeaders = [
          ['设计', '陈昊/李雨桐'],
          ['校对', '王铎'],
          ['审核', '周敏'],
          ['批准', '院总工'],
        ];
        const gridTop = signTop + lineFor(T.head) + 1.6;
        const cellH = Math.min(7.2, Math.max(4.2, (signBottom - 2 - gridTop) / (rowHeaders.length + 1)));
        doc.fillColor('#4d6274').fontSize(T.small);
        cols.forEach((c, i) => {
          doc.text(c, sx + 0.8, gridTop, { width: cw[i] - 1.2, lineBreak: false });
          sx += cw[i];
        });
        doc.lineWidth(0.18).strokeColor('#c5d2dd')
          .moveTo(colLX, gridTop + cellH).lineTo(colLX + signW, gridTop + cellH).stroke();
        rowHeaders.forEach(([role], i) => {
          const y = gridTop + cellH * (i + 1);
          doc.fillColor('#22364a').fontSize(T.body)
            .text(role, colLX + 1.2, y + 0.7, { width: cw[0] - 2, lineBreak: false });
          doc.fillColor('#9aabba').fontSize(T.tiny)
            .text('（待签）', colLX + cw[0] + 1.2, y + 0.9, { width: cw[1] - 2, lineBreak: false });
        });
        // grid lines
        let gx = colLX;
        doc.lineWidth(0.18).strokeColor('#d5e0e8');
        for (let i = 1; i < cols.length; i++) {
          gx += cw[i - 1];
          doc.moveTo(gx, gridTop).lineTo(gx, gridTop + cellH).stroke();
        }
        for (let r = 1; r <= rowHeaders.length; r++) {
          const y = gridTop + cellH * r;
          doc.moveTo(colLX, y).lineTo(colLX + signW, y).stroke();
        }
      }
    }

    // --- Per-section element distribution (compact ribbon, bottom of left column) ---
    {
      const ribbonH = 26;
      const ribbonTop = panelBottom - ribbonH - 2.5;
      if (ribbonTop > iy + 4) {
        doc.fillColor('#22364a').fontSize(T.head)
          .text('本页区段要素量（按状态着色）', colLX, ribbonTop, { lineBreak: false });
        const chartTop = ribbonTop + lineFor(T.head) + 2.4;
        const chartH = Math.max(6, ribbonTop + ribbonH - chartTop - 4);
        const maxVal = Math.max(1, ...pageSections.map((sec) => elemBySection.get(sec.id) || 0));
        const segW = colBW / Math.max(1, pageSections.length);
        doc.fillColor('#eef4f9').rect(colLX, chartTop, colBW, chartH).fill();
        pageSections.forEach((sec, i) => {
          const val = elemBySection.get(sec.id) || 0;
          const h = Math.max(1.2, (val / maxVal) * chartH);
          const color = sec.status === 'approved' ? '#4aa87a'
            : sec.status === 'submitted' ? '#5b8fd6'
              : sec.status === 'rework' ? '#d99a3c' : '#8aa6bd';
          doc.fillColor(color).rect(colLX + i * segW + 0.3, chartTop + chartH - h, segW - 0.6, h).fill();
          doc.fillColor('#3b556d').fontSize(T.tiny)
            .text(sec.code, colLX + i * segW, chartTop + chartH + 0.9,
              { width: segW, align: 'center', lineBreak: false });
          if (segW > 7 && chartH > 14) {
            doc.fillColor('#55708a').fontSize(T.tiny)
              .text(String(val), colLX + i * segW, chartTop + chartH - h - 2.8,
                { width: segW, align: 'center', lineBreak: false });
          }
        });
        doc.fillColor('#7b8fa1').fontSize(T.tiny)
          .text(`纵轴上限 ${maxVal} 项 · 绿=已通过 蓝=待审核 橙=返工中 灰=待制作`, colLX, ribbonTop + lineFor(T.head) + 0.2,
            { lineBreak: false });
      }
    }

    // --- Element type breakdown for this page (right column of the left panel) ---
    {
      const breakdownTop = (function () {
        const lastRowY = iy + Math.min(pageIssues.length, issueMaxRows) * issueRowH;
        return Math.min(lastRowY + 6.0, panelBottom - 34);
      })();
      if (panelBottom - breakdownTop > 26) {
        doc.fillColor('#22364a').fontSize(T.head)
          .text('本页要素分类统计', colRX, breakdownTop, { lineBreak: false });
        let by = breakdownTop + lineFor(T.head) + 1.6;
        const pageElems = elements.filter((e) => e.chainage >= pageBands[0][0] - 10
          && e.chainage <= pageBands[pageBands.length - 1][1] + 10);
        const kindCount = new Map();
        for (const e of pageElems) kindCount.set(e.kind, (kindCount.get(e.kind) || 0) + 1);
        const ordered = [...kindCount.entries()].sort((a, b) => b[1] - a[1]);
        const maxCount = Math.max(1, ...ordered.map(([, n]) => n));
        doc.fillColor('#4d6274').fontSize(T.small);
        doc.text('类型', colRX + 0.4, by, { width: 14, lineBreak: false });
        doc.text('数量', colRX + 16, by, { width: 12, align: 'right', lineBreak: false });
        doc.text('占比', colRX + 30, by, { width: colBW - 30, lineBreak: false });
        by += lineFor(T.small) + 1.2;
        for (const [kind, n] of ordered) {
          if (by > panelBottom - 4) break;
          const label = KINDS[kind]?.label || kind;
          doc.fillColor('#2f4459').fontSize(T.body).text(label, colRX + 0.4, by, { width: 15, lineBreak: false });
          doc.text(String(n), colRX + 16, by, { width: 12, align: 'right', lineBreak: false });
          const bw = (n / maxCount) * (colBW - 32);
          doc.fillColor(colorOf(KINDS[kind].layer)).rect(colRX + 30, by + 0.5, Math.max(0.6, bw), T.body - 0.4).fill();
          by += lineFor(T.body) + 0.6;
          if (by > panelBottom - 4) break;
        }
      }
    }

    // ---------- Right panel ----------
    const rx = frameX + leftPanelW + 9;
    const rw = rightPanelW - 13;
    let ry = panelTop + 3.0;
    doc.fillColor('#22364a').fontSize(T.head).text('图例', rx, ry, { lineBreak: false });
    ry += lineFor(T.head) + 0.8;

    for (const l of LAYER_ORDER) {
      doc.lineWidth(0.7).strokeColor(LAYERS[l].color).rect(rx, ry + 0.5, 3.0, 1.2).stroke();
      doc.fillColor('#33475c').fontSize(T.small).text(`${LAYERS[l].name}图层`, rx + 4.2, ry, { lineBreak: false });
      ry += lineFor(T.small);
    }
    ry += 0.8;
    for (const [kind, label] of [
      ['jet_fan', '射流风机（箭头为气流向）'], ['damper', '风阀'], ['duct', '风管'],
      ['cable_tray', '电缆桥架'], ['fan_equip', '风机房设备'], ['co_sensor', 'CO/VI 检测器'],
      ['civil_joint', '变形缝 / 区段界线'],
    ]) {
      const c = colorOf(KINDS[kind].layer);
      doc.lineWidth(0.35).strokeColor(c);
      if (kind === 'co_sensor') doc.circle(rx + 1.5, ry + 1.1, 0.75).stroke();
      else doc.rect(rx, ry + 0.5, 3.0, 1.2).stroke();
      doc.fillColor('#33475c').fontSize(T.small).text(label, rx + 4.2, ry, { lineBreak: false, width: rw - 4 });
      ry += lineFor(T.small);
    }
    doc.lineWidth(0.35).strokeColor('#d9503a').circle(rx + 1.5, ry + 1.1, 0.9).stroke();
    doc.fillColor('#a4462f').fontSize(T.small).text('自动校验问题要素', rx + 4.2, ry, { lineBreak: false });
    ry += lineFor(T.small) + 2.4;

    doc.fillColor('#22364a').fontSize(T.head).text('校验摘要', rx, ry, { lineBreak: false });
    ry += lineFor(T.head) + 0.5;
    const pageMarked = stats.reduce((a, x) => a + x.marked, 0);
    for (const line of [
      `本页要素 ${stats.reduce((a, x) => a + x.shown, 0)} 项 / 问题标记 ${pageMarked} 处`,
      `项目问题合计 ${findings.length} 项`,
      `· 风机间距不足 ${findings.filter((f) => f.check_type === 'fan_spacing').length} 项`,
      `· 传感器漏挂 ${findings.filter((f) => f.check_type === 'sensor_unmounted').length} 项`,
      `· 区段编号重复 ${findings.filter((f) => f.check_type === 'duplicate_section').length} 项`,
    ]) {
      doc.fillColor('#3c536b').fontSize(T.small).text(line, rx, ry, { lineBreak: false, width: rw });
      ry += lineFor(T.small);
    }
    ry += 2.2;
    doc.fillColor('#22364a').fontSize(T.head).text('说明', rx, ry, { lineBreak: false });
    ry += lineFor(T.head) + 0.4;
    for (const note of [
      '1. 本图按系统展开绘制，各洞线分区段平铺，横轴为里程桩号。',
      '2. 红圈标示自动校验问题要素，详见交付包内校验报告。',
      '3. 编号规则：类型前缀-洞线-序号，可按区段检索要素清单。',
    ]) {
      doc.fillColor('#4a6076').fontSize(T.tiny).text(note, rx, ry, { width: rw, lineGap: 0.4 });
      ry += lineFor(T.tiny) * 2.4;
    }

    // ---------- Title block + QC stamp ----------
    const tbW = 102, tbH = titleBlockH - 1;
    const tbX = W - margin - tbW, tbY = H - margin - tbH - 2;
    doc.lineWidth(0.45).strokeColor('#26333f').rect(tbX, tbY, tbW, tbH).stroke();
    doc.moveTo(tbX, tbY + 5.2).lineTo(tbX + tbW, tbY + 5.2).stroke();
    doc.moveTo(tbX + 58, tbY + 5.2).lineTo(tbX + 58, tbY + tbH).stroke();
    doc.fillColor('#22364a').fontSize(T.small).text('隧道机电设计院 · 通风系统图档', tbX + 2, tbY + 1.3, { lineBreak: false });
    doc.fillColor('#43596f').fontSize(T.titleBlock);
    [
      `项目编号 ${project.code}`,
      '比例 1:500',
      `共 ${pages.length} 页 / ${bands.length} 段`,
    ].forEach((t, i) => doc.text(t, tbX + 2, tbY + 6.8 + i * lineFor(T.titleBlock), { width: 54, lineBreak: false }));
    [
      `图幅 ${spec}  第 ${pageIdx + 1} 页`,
      `出图 ${nowIso().slice(0, 10)}`,
      '审核 周敏   制作 陈昊',
    ].forEach((t, i) => doc.text(t, tbX + 60, tbY + 6.8 + i * lineFor(T.titleBlock), { width: 40, lineBreak: false }));

    const stampW = 38, stampH = 13;
    const stX = tbX - stampW - 6, stY = tbY + 2.6;
    const blocked = String(qcVerdict || '').startsWith('待整改');
    const ink = blocked ? '#c04532' : '#1f7a4d';
    doc.lineWidth(0.5).strokeColor(ink).rect(stX, stY, stampW, stampH).stroke();
    doc.fillColor(ink).fontSize(T.tiny).text('审 核 校 验', stX + 1.5, stY + 0.9, { lineBreak: false });
    doc.fontSize(T.stamp).text(qcVerdict || '已校验', stX + 1.5, stY + 3.0, { lineBreak: false });
    doc.fontSize(1.7).text(qcId || '—', stX + 1.5, stY + 7.8, { width: stampW - 3, lineBreak: false });
    doc.text(`本页 ${pageIdx + 1}/${pages.length} · ${nowIso().slice(0, 10)}`,
      stX + 1.5, stY + 9.7, { width: stampW - 3, lineBreak: false });
  });

  return doc;
}
