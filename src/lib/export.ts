import type { SheetLike, SheetHotspotIn } from './unroll';

export interface SvgMeta {
  orderCode: string;
  patient: string;
  ear: string;
  fitter: string;
  store: string;
  date: string;
  material: string;
  version: number;
  threshold: number;
}

const n = (v: number) => (Math.round(v * 1000) / 1000).toFixed(3);

/**
 * Cutting-sheet SVG drawn in millimetres (1 user unit = 1 mm) so the file
 * can be printed at 100% or sent straight to a plotter.
 */
export function sheetSvg(sheet: SheetLike, meta: SvgMeta): string {
  const padX = 13;
  const headerH = 17;
  const footerH = 31;
  const xs = sheet.outline.map((p) => p[0]);
  const ys = sheet.outline.map((p) => p[1]);
  const sx = Math.min(...xs);
  const ex = Math.max(...xs);
  const sy = Math.min(...ys);
  const ey = Math.max(...ys);
  const minX = sx - padX;
  const maxX = ex + padX;
  const minY = sy - headerH - 8;
  const maxY = ey + footerH;
  const w = maxX - minX;
  const h = maxY - minY;

  const path =
    sheet.outline.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p[0])},${n(p[1])}`).join(' ') + ' Z';

  const stitches = sheet.outline
    .filter((_, i) => i > 1 && i % 5 === 0 && i < sheet.outline.length - 5)
    .slice(0, 14)
    .map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="0.55" fill="#7f8ea3"/>`)
    .join('');

  const spots = sheet.hotspots
    .map(
      (s: SheetHotspotIn, i) => `
    <circle cx="${n(s.x)}" cy="${n(s.y)}" r="${n(s.r + 0.8)}" fill="none" stroke="#e0523f" stroke-width="0.24" stroke-dasharray="0.9 0.7"/>
    <line x1="${n(s.x + 1.6)}" y1="${n(s.y - 1.6)}" x2="${n(s.x + 5.6)}" y2="${n(s.y - 5.6)}" stroke="#e0523f" stroke-width="0.2"/>
    <text x="${n(s.x + 6)}" y="${n(s.y - 5.9)}" font-size="3.3" fill="#ff8a78" font-family="Helvetica, Arial">K=${s.curv.toFixed(2)} 超限 #${i + 1}</text>`,
    )
    .join('');

  const dimW = `
  <g stroke="#8fa3b8" stroke-width="0.2" fill="none">
    <line x1="${n(sx)}" y1="${n(sy)}" x2="${n(sx)}" y2="${n(sy - 5.6)}"/>
    <line x1="${n(ex)}" y1="${n(sy)}" x2="${n(ex)}" y2="${n(sy - 5.6)}"/>
    <line x1="${n(sx)}" y1="${n(sy - 4.2)}" x2="${n(ex)}" y2="${n(sy - 4.2)}"/>
    <path d="M${n(sx + 1.2)},${n(sy - 5.2)} L${n(sx)},${n(sy - 4.2)} L${n(sx + 1.2)},${n(sy - 3.2)}"/>
    <path d="M${n(ex - 1.2)},${n(sy - 5.2)} L${n(ex)},${n(sy - 4.2)} L${n(ex - 1.2)},${n(sy - 3.2)}"/>
  </g>
  <text x="${n((sx + ex) / 2)}" y="${n(sy - 5)}" font-size="3.4" fill="#9fb3c6" text-anchor="middle" font-family="Helvetica, Arial">${sheet.widthTop.toFixed(1)} mm 上缘展开宽</text>`;

  const dimH = `
  <g stroke="#8fa3b8" stroke-width="0.2" fill="none">
    <line x1="${n(ex)}" y1="${n(sy)}" x2="${n(ex + 6)}" y2="${n(sy)}"/>
    <line x1="${n(ex)}" y1="${n(ey)}" x2="${n(ex + 6)}" y2="${n(ey)}"/>
    <line x1="${n(ex + 3.6)}" y1="${n(sy)}" x2="${n(ex + 3.6)}" y2="${n(ey)}"/>
  </g>
  <text x="${n(ex + 7.4)}" y="${n((sy + ey) / 2)}" font-size="3.4" fill="#9fb3c6" text-anchor="middle" font-family="Helvetica, Arial" transform="rotate(90 ${n(ex + 7.4)} ${n((sy + ey) / 2)})">${sheet.length.toFixed(1)} mm 展开长度</text>`;

  const vbY = maxY - 17;
  const cellW = (w - 4) / 3;
  const footCells: Array<[string, string]> = [
    ['订单号', meta.orderCode],
    ['壁厚 / 偏置', sheet.wallLabel],
    ['材料 / 展开', `${meta.material} · ${sheet.length.toFixed(1)}×${sheet.widthTop.toFixed(1)}`],
  ];


  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}mm" height="${n(h)}mm" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}">
  <title>${meta.orderCode} ${meta.patient} V${meta.version}</title>
  <desc>${meta.ear}耳 · 版本 V${meta.version} · ${sheet.wallLabel} · 曲率阈值 ${meta.threshold.toFixed(2)} mm⁻¹ · 1:1 mm</desc>
  <defs>
    <pattern id="hatch" width="1.8" height="1.8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <line x1="0" y1="0" x2="0" y2="1.8" stroke="#24394f" stroke-width="0.32"/>
    </pattern>
    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M10 0H0V10" fill="none" stroke="#101d2b" stroke-width="0.15"/>
    </pattern>
  </defs>

  <rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="#0a121c"/>
  <rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="url(#grid)"/>
  <rect x="${n(minX + 0.5)}" y="${n(minY + 0.5)}" width="${n(w - 1)}" height="${n(h - 1)}" fill="none" stroke="#1d2c3a" stroke-width="0.25"/>

  <g font-family="Helvetica, Arial" fill="#b9c6d6">
    <text x="${n(minX + 3)}" y="${n(minY + 5.6)}" font-size="4.6" fill="#e7eef6" letter-spacing="0.35">AURIS · 耳模下料展开图</text>
    <text x="${n(minX + 3)}" y="${n(minY + 10.2)}" font-size="3.1" fill="#8fa3b8">${meta.orderCode} · ${meta.patient} · ${meta.ear}耳 · V${meta.version} · 1:1 mm</text>
    <text x="${n(maxX - 3)}" y="${n(minY + 5.6)}" font-size="3.1" text-anchor="end" fill="#8fa3b8">${meta.store}</text>
    <text x="${n(maxX - 3)}" y="${n(minY + 10.2)}" font-size="3.1" text-anchor="end" fill="#8fa3b8">验配师 ${meta.fitter} · ${meta.date}</text>
  </g>
  <line x1="${n(minX + 2.5)}" y1="${n(minY + 12.6)}" x2="${n(maxX - 2.5)}" y2="${n(minY + 12.6)}" stroke="#1d2c3a" stroke-width="0.25"/>

  ${dimW}
  ${dimH}

  <path d="${path}" fill="url(#hatch)" stroke="#62d6c4" stroke-width="0.34"/>
  ${stitches}

  <rect x="${n(sheet.bore.x - sheet.bore.w / 2)}" y="${n(sheet.bore.y - sheet.bore.h / 2)}" width="${n(sheet.bore.w)}" height="${n(sheet.bore.h)}" rx="0.8" fill="none" stroke="#5b7189" stroke-width="0.2" stroke-dasharray="1.3 1"/>
  <text x="${n(sheet.bore.x)}" y="${n(sheet.bore.y + 4.2)}" font-size="3" fill="#7a8ea3" text-anchor="middle" font-family="Helvetica, Arial">耳道接口</text>

  <circle cx="${n(sheet.vent.x)}" cy="${n(sheet.vent.y)}" r="${n(sheet.vent.r)}" fill="#0a121c" stroke="#8ad6c0" stroke-width="0.24"/>
  <text x="${n(sheet.vent.x)}" y="${n(sheet.vent.y + 0.75)}" font-size="1.9" fill="#8ad6c0" text-anchor="middle" font-family="Helvetica, Arial">Ø1.3</text>
  <line x1="${n(sheet.vent.x + 2)}" y1="${n(sheet.vent.y - 1.8)}" x2="${n(sheet.vent.x + 7)}" y2="${n(sheet.vent.y - 5.4)}" stroke="#8ad6c0" stroke-width="0.18"/>
  <text x="${n(sheet.vent.x + 7.6)}" y="${n(sheet.vent.y - 5.6)}" font-size="3" fill="#8ad6c0" font-family="Helvetica, Arial">泄压孔 Ø1.3</text>
  ${spots}

  <g font-family="Helvetica, Arial">
    <rect x="${n(minX + 2)}" y="${n(vbY)}" width="${n(w - 4)}" height="13.4" rx="0.8" fill="#0c1721" stroke="#1d2c3a" stroke-width="0.25"/>
    ${footCells
      .map((row, i) => {
        const cx = minX + 3.4 + i * cellW;
        const sep = i > 0
          ? `<line x1="${n(cx - 1.4)}" y1="${n(vbY + 1.8)}" x2="${n(cx - 1.4)}" y2="${n(vbY + 11.6)}" stroke="#1d2c3a" stroke-width="0.2"/>`
          : '';
        return `${sep}
        <text x="${n(cx)}" y="${n(vbY + 5.1)}" font-size="2.4" fill="#5f7389">${row[0]}</text>
        <text x="${n(cx)}" y="${n(vbY + 9.7)}" font-size="2.75" fill="#9fb3c6">${row[1]}</text>`;
      })
      .join('')}
    <line x1="${n(minX + 4)}" y1="${n(maxY - 2.2)}" x2="${n(minX + 14)}" y2="${n(maxY - 2.2)}" stroke="#8fa3b8" stroke-width="0.5"/>
    <line x1="${n(minX + 4)}" y1="${n(maxY - 3.2)}" x2="${n(minX + 4)}" y2="${n(maxY - 1.2)}" stroke="#8fa3b8" stroke-width="0.28"/>
    <line x1="${n(minX + 14)}" y1="${n(maxY - 3.2)}" x2="${n(minX + 14)}" y2="${n(maxY - 1.2)}" stroke="#8fa3b8" stroke-width="0.28"/>
    <text x="${n(minX + 16)}" y="${n(maxY - 1.4)}" font-size="2.5" fill="#6f8399">10 mm 校准标尺 · 打印按 100% 核对</text>
    <text x="${n(maxX - 3)}" y="${n(maxY - 1.4)}" font-size="2.5" fill="#5f7389" text-anchor="end">贴合边沿接缝缝合 · 虚线圈内手工修形</text>
  </g>
</svg>`;
}

export function downloadText(name: string, text: string, mime = 'image/svg+xml') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

export function downloadSvg(name: string, svg: string) {
  downloadText(name, svg, 'image/svg+xml');
}

export function toCsv(rows: Array<Record<string, unknown>>, headers: Array<[string, string]>): string {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h[1])).join(',');
  const body = rows.map((r) => headers.map(([k]) => esc(r[k])).join(',')).join('\n');
  return `﻿${head}\n${body}\n`;
}
