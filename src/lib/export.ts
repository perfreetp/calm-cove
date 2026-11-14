import { CANTER_STRIDE } from './constants';
import { facingVectors } from './geometry';
import { computeSafetyDistances } from './timing';
import type { EventRecord, RouteCourse, RouteVersion } from './types';
import { DIFFICULTY_LABEL, DISTANCE_LABEL } from './constants';

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob(['﻿', content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(s: string | number): string {
  const t = String(s);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** 路线图 SVG 导出(俯视平面图,含障碍编号、行进线、起步/终点、冲突) */
export function exportCourseSvg(ev: EventRecord, ver: RouteVersion): void {
  const c = ver.course;
  const scale = 22; // px/m
  const pad = 60;
  const W = c.params.field.length * scale + pad * 2;
  const H = c.params.field.width * scale + pad * 2;
  const X = (x: number) => pad + x * scale;
  const Y = (y: number) => pad + y * scale;

  const obs = c.obstacles
    .map((o) => {
      const { side, forward } = facingVectors(o.angle);
      const ax = X(o.position.x + side.x * (o.width / 2));
      const ay = Y(o.position.y + side.y * (o.width / 2));
      const bx = X(o.position.x - side.x * (o.width / 2));
      const by = Y(o.position.y - side.y * (o.width / 2));
      const fx = X(o.position.x + forward.x * 2);
      const fy = Y(o.position.y + forward.y * 2);
      const color = c.conflicts.some((cf) => cf.obstacleIds.includes(o.id)) ? '#e23b3b' : '#c77b2a';
      const labelX = X(o.position.x - side.x * 2.4);
      const labelY = Y(o.position.y - side.y * 2.4) + 5;
      return `
    <g>
      <line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
      <line x1="${X(o.position.x)}" y1="${Y(o.position.y)}" x2="${fx}" y2="${fy}" stroke="#888" stroke-width="1.5" marker-end="url(#arr)"/>
      <text x="${labelX}" y="${labelY}" font-size="16" font-weight="bold" fill="#222" text-anchor="middle">${o.number}${o.manual ? ' ✋' : ''}</text>
    </g>`;
    })
    .join('');

  const pathD = c.path
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`)
    .join(' ');

  const gates = c.gates
    .map((g) => {
      const color = g.kind === 'start' ? '#2e9e44' : '#e0632e';
      return `<line x1="${X(g.a.x)}" y1="${Y(g.a.y)}" x2="${X(g.b.x)}" y2="${Y(g.b.y)}" stroke="${color}" stroke-width="4"/>
      <text x="${X((g.a.x + g.b.x) / 2)}" y="${Y((g.a.y + g.b.y) / 2) - 8}" font-size="14" fill="${color}" text-anchor="middle">${g.kind === 'start' ? '起步线' : '终点线'}</text>`;
    })
    .join('');

  const conflicts = c.conflicts
    .map((cf) => `<circle cx="${X(cf.at.x)}" cy="${Y(cf.at.y)}" r="8" fill="#e23b3b" opacity="0.85"/>
      <text x="${X(cf.at.x) + 12}" y="${Y(cf.at.y) + 4}" font-size="11" fill="#e23b3b">${cf.type}</text>`)
    .join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="sans-serif">
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#888"/></marker></defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="#f7f5ee"/>
  <text x="${pad}" y="30" font-size="20" font-weight="bold" fill="#222">${csvCell(ev.code)} · ${csvCell(ev.level)} · ${ev.date} · ${ver.label}</text>
  <rect x="${pad}" y="${pad}" width="${c.params.field.length * scale}" height="${c.params.field.width * scale}" fill="#dcefd9" stroke="#333" stroke-width="2"/>
  ${gates}
  <path d="${pathD}" fill="none" stroke="#2b8fd4" stroke-width="2.5" stroke-dasharray="7 5"/>
  ${obs}
  ${conflicts}
  <text x="${pad}" y="${H - 18}" font-size="12" fill="#555">总长 ${c.totalLength}m · 允许时间 ${c.allowedTime}s · 速度 ${c.speed}m/min · 种子 ${c.params.seed} · ${DISTANCE_LABEL[c.params.distanceClass]} · ${DIFFICULTY_LABEL[c.params.difficulty]}</text>
</svg>`;
  download(`${ev.code}_v${ver.versionNo}_路线图.svg`, svg, 'image/svg+xml');
}

/** 步距表 CSV:各障碍段距离、步数、安全净距、冲突 */
export function exportStrideTableCsv(ev: EventRecord, ver: RouteVersion): void {
  const c = ver.course;
  const safety = computeSafetyDistances(c.obstacles, c.arcs);
  const rows: string[] = [];
  rows.push(`赛事编号,${csvCell(ev.code)}`);
  rows.push(`级别,${csvCell(ev.level)},日期,${ev.date},设计师,${csvCell(ev.designer)}`);
  rows.push(`版本,${csvCell(ver.label)},状态,${ver.status}`);
  rows.push('');
  rows.push('段次,起点障碍,终点障碍,中心距(m),关联,设计步数,步幅(m),安全净距(m),要求净距(m),判定');
  const byId = new Map(c.obstacles.map((o) => [o.id, o]));
  c.strides.forEach((m, i) => {
    const a = byId.get(m.fromObstacle)!;
    const b = byId.get(m.toObstacle)!;
    const s = safety[i];
    rows.push([
      i + 1, a.number, b.number, m.distance,
      m.related ? '是' : '否',
      m.related ? m.strides : '-',
      CANTER_STRIDE,
      s?.clearance ?? '-',
      s?.required ?? '-',
      s?.safe ? '合格' : '不足',
    ].map(csvCell).join(','));
  });
  rows.push('');
  rows.push(`全程总长(m),${c.totalLength},规定速度(m/min),${c.speed},允许时间(s),${c.allowedTime}`);
  if (c.conflicts.length) {
    rows.push('');
    rows.push('冲突类型,位置,说明');
    for (const cf of c.conflicts) rows.push([cf.type, `(${cf.at.x.toFixed(1)},${cf.at.y.toFixed(1)})`, cf.message].map(csvCell).join(','));
  }
  download(`${ev.code}_v${ver.versionNo}_步距表.csv`, rows.join('\n'), 'text/csv');
}

/** 季度赛事报告 CSV */
export function exportQuarterlyReportCsv(year: number, rows: { quarter: string; events: number; versions: number; approved: number; returned: number }[], reasons: { category: string; count: number }[]): void {
  const lines: string[] = [];
  lines.push(`${year} 年度季度赛事报告`);
  lines.push('季度,赛事数,路线版本数,通过数,退回数,通过率');
  for (const r of rows) {
    const rate = r.versions ? `${Math.round((r.approved / r.versions) * 100)}%` : '-';
    lines.push([r.quarter, r.events, r.versions, r.approved, r.returned, rate].map(csvCell).join(','));
  }
  lines.push('');
  lines.push('退回原因分类,次数');
  for (const r of reasons) lines.push([r.category, r.count].map(csvCell).join(','));
  download(`${year}_季度赛事报告.csv`, lines.join('\n'), 'text/csv');
}
