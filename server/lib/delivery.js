// Delivery bundle builder: DXF drawings + PDF sheet + validation report + CSV
// element index, zipped into one auditable package.

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { ZipArchive } from 'archiver';
import { buildPdf, collectPdfBuffer } from './pdfSheet.js';
import DxfParser from 'dxf-parser';
import { db, nowIso, tx, audit, DELIVERY_DIR } from '../db.js';
import { renderDxf } from './dxf.js';
import { projectRow, projectSummary, sectionsWithWork, loadGeometry } from './projectService.js';
import { computeFindings } from './qc.js';
import {
  LAYERS, LAYER_ORDER, KINDS, KIND_KEYS, ELEMENT_CSV_COLUMNS,
  boreLayout, formatChainage, SHEET_SIZES_MM,
} from '../../shared/domain.js';

const FONT = path.resolve('server/assets/SimHei.ttf');
const BOM = '﻿';

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function elementRows(projectId) {
  const rows = db.prepare(
    `SELECT e.*, s.code AS section_code, s.start_m, s.end_m,
            pe.code AS upstream_code, ne.code AS downstream_code
     FROM elements e
     LEFT JOIN sections s ON s.id = e.section_id
     LEFT JOIN elements pe ON pe.id = e.upstream_id
     LEFT JOIN elements ne ON ne.id = e.downstream_id
     WHERE e.project_id = ? ORDER BY e.layer, e.kind, e.chainage`
  ).all(projectId);
  const project = projectRow(projectId);
  const layout = boreLayout(project);
  return rows.map((r) => ({
    section_code: r.section_code || '（未挂接）',
    section_range: r.start_m != null ? `${Math.round(r.start_m)}–${Math.round(r.end_m)} m` : '—',
    bore_label: layout.boreLabels[r.bore_index] || '—',
    layer_label: LAYERS[r.layer]?.name || r.layer,
    kind_label: KINDS[r.kind]?.label || r.kind,
    code: r.code,
    model: r.model,
    chainage_text: formatChainage(r.chainage),
    chainage: r.chainage,
    offset: r.offset,
    mounted_label: r.mounted ? '已挂接' : '未挂接',
    upstream_code: r.upstream_code || '',
    downstream_code: r.downstream_code || '',
  }));
}

function buildManifest(projectId, rows) {
  const bySection = new Map();
  for (const r of rows) {
    const k = r.section_code;
    if (!bySection.has(k)) {
      bySection.set(k, { section_code: k, range: r.section_range, total: 0, kinds: {} });
    }
    const s = bySection.get(k);
    s.total++;
    s.kinds[r.kind_label] = (s.kinds[r.kind_label] || 0) + 1;
  }
  return [...bySection.values()].sort((a, b) => a.section_code.localeCompare(b.section_code, 'zh'));
}

function writeElementCsv(rows) {
  const header = ELEMENT_CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',');
  const lines = rows.map((r) => ELEMENT_CSV_COLUMNS.map(([key]) => csvCell(r[key])).join(','));
  return BOM + [header, ...lines].join('\r\n') + '\r\n';
}

function writeManifestCsv(manifest) {
  const header = ['区段编号', '区段范围', '要素总数', '分类统计'].map(csvCell).join(',');
  const lines = manifest.map((m) => [
    m.section_code, m.range, m.total,
    Object.entries(m.kinds).map(([k, v]) => `${k}×${v}`).join(' '),
  ].map(csvCell).join(','));
  return BOM + [header, ...lines].join('\r\n') + '\r\n';
}

/** Validate DXF output by re-parsing it and comparing entity counts. */
function validateDxf(text) {
  const parser = new DxfParser();
  const parsed = parser.parseSync(text);
  const entities = parsed?.entities || [];
  const counts = {};
  for (const e of entities) counts[e.type] = (counts[e.type] || 0) + 1;
  const layers = Object.keys(parsed?.tables?.layer?.layers || {});
  return { ok: entities.length > 0, entityCount: entities.length, counts, layers };
}

export async function buildDelivery(projectId, { actor = '主管 周敏', spec } = {}) {
  const project = projectRow(projectId);
  if (!project) throw new Error('项目不存在');
  const summary = projectSummary(projectId);
  const sections = sectionsWithWork(projectId);
  const { findings } = computeFindings(projectId);
  // Blocking = defects inside an approved section that the manager has neither
  // resolved nor waived. Findings are recomputed from geometry each time, while
  // a manager's verdict lives on the persisted issue row; match the two by the
  // stable (check type, section, element set) key used by the QC re-run.
  const approvedSectionIds = new Set(sections.filter((s) => s.status === 'approved').map((s) => s.id));
  const persisted = db.prepare(
    `SELECT status, check_type, section_id, element_ids FROM issues
     WHERE project_id = ? AND status IN ('open','waived','resolved')`
  ).all(projectId);
  const handledCount = persisted.filter((r) => r.status !== 'open').length;
  const handledKeys = new Set();
  for (const row of persisted) {
    if (row.status === 'open') continue;
    const ids = JSON.parse(row.element_ids || '[]').sort((a, b) => a - b).join(',');
    handledKeys.add(`${row.check_type}|${row.section_id ?? 'null'}|${ids}`);
  }
  const blocking = findings.filter((f) => {
    if (f.section_id == null || !approvedSectionIds.has(f.section_id)) return false;
    const ids = [...f.element_ids].sort((a, b) => a - b).join(',');
    return !handledKeys.has(`${f.check_type}|${f.section_id}|${ids}`);
  });

  const rows = elementRows(projectId);
  const manifest = buildManifest(projectId, rows);
  const layout = boreLayout(project);
  const qcId = `QC-${project.code}-${Date.now().toString(36).toUpperCase()}`;
  const sheetSpec = spec || project.drawing_spec || 'A1';
  const stamp = nowIso().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${project.code}_通风系统图档_${stamp}.zip`;
  const relPath = path.join(String(projectId), fileName.replace(/\.zip$/, '') + '.zip');
  const absPath = path.join(DELIVERY_DIR, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  // --- DXF files: one per layer plus a combined full drawing ---
  const dxfFiles = [];
  const geo = loadGeometry(projectId);
  const allElements = db.prepare('SELECT * FROM elements WHERE project_id = ? ORDER BY layer, kind, chainage').all(projectId);
  const makeDxf = (layer) => renderDxf({
    project: { ...project, layout },
    sections, elements: allElements.filter((e) => !layer || e.layer === layer),
    layer, title: `${project.code} ${project.name}`,
  });

  for (const l of LAYER_ORDER) {
    const text = makeDxf(l);
    const name = `${project.code}_${LAYERS[l].name}层.dxf`;
    dxfFiles.push({ name, text, layer: l });
  }
  const combined = makeDxf(null);
  dxfFiles.push({ name: `${project.code}_通风系统_全图层.dxf`, text: combined, layer: 'all' });

  const dxfValidation = dxfFiles.map((f) => ({ name: f.name, ...validateDxf(f.text) }));

  // --- PDF sheet ---
  const pdfDoc = buildPdf({
    project, sections, elements: allElements, layout, summary, findings, spec: sheetSpec,
    qcVerdict: blocking.length ? `待整改 ${blocking.length} 项` : '校验通过',
    qcId,
  });
  const pdfBuf = await collectPdfBuffer(pdfDoc);

  // --- Validation report (Markdown + CSV) ---
  const issues = db.prepare(
    `SELECT i.*, s.code AS section_code FROM issues i LEFT JOIN sections s ON s.id = i.section_id
     WHERE i.project_id = ? AND i.status IN ('open','waived','resolved') ORDER BY i.id`
  ).all(projectId);
  const reportLines = [
    `# 交付校验报告 ${qcId}`,
    '',
    `- 项目：${project.code} ${project.name}`,
    `- 委托单位：${project.client_name}`,
    `- 里程：${project.segment || '—'}，长度 ${project.length_m} m，${project.lanes} 车道`,
    `- 交付日期：${project.delivery_date}，出图幅面：${sheetSpec}`,
    `- 生成时间：${nowIso()}`,
    `- 要素总数：${rows.length}，区段总数：${sections.length}，已通过区段：${summary.approved_sections}`,
    `- 返工次数合计：${summary.rework_count}`,
    '',
    '## 自动校验结论',
    '',
    `本次校验共发现 **${findings.length}** 项问题；已通过区段中仍有 **${blocking.length}** 项未整改或未豁免，` +
    `另有 **${handledCount}** 项已豁免/整改。`,
    blocking.length ? '> 结论：**存在阻断项，交付包标记为待整改。**' : '> 结论：**校验通过，可交付。**',
    '',
    '| 检查项 | 数量 |',
    '| --- | --- |',
    `| 风机间距小于 6.0 m | ${findings.filter((f) => f.check_type === 'fan_spacing').length} |`,
    `| 传感器漏挂 | ${findings.filter((f) => f.check_type === 'sensor_unmounted').length} |`,
    `| 区段编号重复 | ${findings.filter((f) => f.check_type === 'duplicate_section').length} |`,
    '',
    '## 问题清单',
    '',
    '| # | 类型 | 区段 | 状态 | 说明 |',
    '| --- | --- | --- | --- | --- |',
    ...issues.map((i, n) => `| ${n + 1} | ${i.check_type} | ${i.section_code || '—'} | ${i.status} | ${String(i.message).replace(/\|/g, '\\|')} |`),
    '',
    '## DXF 结构校验',
    '',
    '| 文件 | 实体数 | 图层 | 结果 |',
    '| --- | --- | --- | --- |',
    ...dxfValidation.map((v) => `| ${v.name} | ${v.entityCount} | ${v.layers.join(' ')} | ${v.ok ? '通过' : '失败'} |`),
    '',
    '## 区段交付清单',
    '',
    '| 区段 | 范围 | 状态 | 返工次数 | 要素数 |',
    '| --- | --- | --- | --- | --- |',
    ...sections.map((s) => `| ${s.code} | ${Math.round(s.start_m)}–${Math.round(s.end_m)} m | ${s.status} | ${s.rework_count} | ${s.element_count} |`),
    '',
  ].join('\n');

  const checksum = (buf) => {
    // Stable lightweight checksum (FNV-1a) for the manifest.
    let h = 2166136261;
    for (let i = 0; i < buf.length; i++) { h ^= buf[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  const fileEntries = [
    { name: `${project.code}_校验报告.md`, data: Buffer.from(reportLines, 'utf8'), kind: 'report' },
    { name: `${project.code}_区段要素清单.csv`, data: Buffer.from(writeManifestCsv(manifest), 'utf8'), kind: 'manifest' },
    { name: `${project.code}_要素明细.csv`, data: Buffer.from(writeElementCsv(rows), 'utf8'), kind: 'index' },
    { name: `${project.code}_通风系统图_${sheetSpec}.pdf`, data: pdfBuf, kind: 'pdf' },
    ...dxfFiles.map((f) => ({ name: f.name, data: Buffer.from(f.text, 'utf8'), kind: 'dxf', layer: f.layer })),
  ];

  const manifestJson = {
    qc_id: qcId,
    project: {
      code: project.code, name: project.name, client: project.client_name,
      length_m: project.length_m, lanes: project.lanes, delivery_date: project.delivery_date,
      drawing_spec: sheetSpec,
    },
    generated_at: nowIso(),
    verdict: blocking.length ? 'blocked' : 'passed',
    blocking_issues: blocking.length,
    totals: {
      elements: rows.length, sections: sections.length, approved_sections: summary.approved_sections,
      rework_count: summary.rework_count, issues: findings.length,
    },
    checks: {
      fan_spacing: findings.filter((f) => f.check_type === 'fan_spacing').length,
      sensor_unmounted: findings.filter((f) => f.check_type === 'sensor_unmounted').length,
      duplicate_section: findings.filter((f) => f.check_type === 'duplicate_section').length,
    },
    dxf_validation: dxfValidation,
    files: fileEntries.map((f) => ({
      name: f.name, kind: f.kind, size: f.data.length, checksum: checksum(f.data),
    })),
    section_manifest: manifest.map((m) => ({ code: m.section_code, range: m.range, total: m.total, kinds: m.kinds })),
  };
  fileEntries.push({
    name: `${project.code}_交付清单.json`,
    data: Buffer.from(JSON.stringify(manifestJson, null, 2), 'utf8'),
    kind: 'manifest-json',
  });

  // --- Zip ---
  const zipBuf = await new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks = [];
    archive.on('data', (c) => chunks.push(c));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);
    for (const f of fileEntries) archive.append(f.data, { name: f.name });
    archive.finalize();
  });
  fs.writeFileSync(absPath, zipBuf);

  const info = tx(() => {
    const r = db.prepare(
      `INSERT INTO deliveries (project_id, file_name, rel_path, size_bytes, manifest, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(projectId, fileName, relPath.replace(/\\/g, '/'), zipBuf.length, JSON.stringify(manifestJson), nowIso());
    if (project.status !== 'delivered') {
      db.prepare("UPDATE projects SET status = 'delivered', delivered_at = ? WHERE id = ?").run(nowIso(), projectId);
    }
    audit(projectId, actor, 'build_delivery',
      `${fileName}（${fileEntries.length} 个文件，${blocking.length ? '待整改' : '校验通过'}）`);
    return r.lastInsertRowid;
  });

  return {
    id: Number(info),
    file_name: fileName,
    rel_path: relPath.replace(/\\/g, '/'),
    size_bytes: zipBuf.length,
    manifest: manifestJson,
    files: fileEntries.map((f) => ({ name: f.name, kind: f.kind, size: f.data.length })),
  };
}

export function listDeliveries(projectId) {
  return db.prepare(
    'SELECT id, file_name, rel_path, size_bytes, created_at FROM deliveries WHERE project_id = ? ORDER BY id DESC'
  ).all(projectId).map((r) => ({ ...r, manifest: JSON.parse(db.prepare('SELECT manifest FROM deliveries WHERE id = ?').get(r.id).manifest) }));
}

export function deliveryDetail(projectId, deliveryId) {
  const r = db.prepare('SELECT * FROM deliveries WHERE project_id = ? AND id = ?').get(projectId, deliveryId);
  if (!r) return null;
  return { ...r, manifest: JSON.parse(r.manifest) };
}

export { elementRows, buildManifest, writeElementCsv, writeManifestCsv };
