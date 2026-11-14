// 导出工具：照度网格 CSV、暗区清单 CSV、质检报告 Markdown

import { findDarkZones } from './lighting.js';
import { batchDerived } from './qc.js';

const NL = String.fromCharCode(10);

const download = (name, text, type = 'text/plain;charset=utf-8') => {
  const blob = new Blob([String.fromCharCode(65279) + text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

export function exportGridCsv(design, grid, modeLabel) {
  const xs = [];
  for (let i = 0; i < grid.nx; i++) xs.push((i * grid.cell).toFixed(2));
  const lines = [`# ${design.code} ${design.name} | ${modeLabel}工况 | 网格 ${grid.cell} m | 照度 lx`];
  lines.push(['y/x', ...xs].join(','));
  for (let j = 0; j < grid.ny; j++) {
    const row = [(j * grid.cell).toFixed(2)];
    for (let i = 0; i < grid.nx; i++) {
      const k = j * grid.nx + i;
      row.push(grid.valid && !grid.valid[k] ? '' : Math.round(grid.values[k]));
    }
    lines.push(row.join(','));
  }
  download(`${design.code}-照度网格-${modeLabel}.csv`, lines.join(NL), 'text/csv;charset=utf-8');
}

export function exportZoneCsv(design, grid, threshold = 150) {
  const zones = findDarkZones(grid, threshold, 2, design.fixtures);
  const KIND = { floor: '地面', trench: '地沟', shelf: '平台下' };
  const lines = [`# ${design.code} 暗区清单 | 阈值 ${threshold} lx | 网格 ${grid.cell} m`];
  lines.push('编号,区域类型,网格数,面积(m2),最小照度(lx),平均照度(lx),质心x(m),质心y(m),包围盒宽(m),包围盒高(m),四角坐标');
  for (const z of zones) {
    lines.push(
      [
        z.id,
        KIND[z.kind] ?? '地面',
        z.cells,
        (z.cells * grid.cell * grid.cell).toFixed(2),
        Math.round(z.minLux),
        Math.round(z.avgLux),
        z.centroid.x.toFixed(2),
        z.centroid.y.toFixed(2),
        z.bbox.w.toFixed(2),
        z.bbox.h.toFixed(2),
        `"${z.corners.map((c) => `(${c.x.toFixed(1)},${c.y.toFixed(1)})`).join(' ')}"`,
      ].join(',')
    );
  }
  download(`${design.code}-暗区清单.csv`, lines.join(NL), 'text/csv;charset=utf-8');
}

export function exportQcReport(batch, sub, design) {
  const d = batchDerived(sub);
  const L = [];
  L.push('# 照明图纸质检报告');
  L.push('');
  L.push(`- 批次：${batch.code} ${batch.title}`);
  L.push(`- 图号：${design?.code} ${design?.name}`);
  L.push(`- 版本：v${sub.version} · 设计员 ${sub.designer} · 复核员 ${sub.reviewer}`);
  L.push(`- 提交时间：${sub.submittedAt}`);
  const statusText =
    d.status === 'approved' ? '已放行出版' : d.status === 'ready' ? '待放行' : d.status === 'returned' ? '已退回设计方' : d.status === 'reviewing' ? '复核中' : '待复核';
  L.push(`- 结论：${statusText}`);
  L.push(`- 检查通过率：${d.checksPassed}/${d.checkTotal}（${(d.passRate * 100).toFixed(0)}%）`);
  L.push('');
  L.push('## 四项检查');
  L.push('');
  for (const c of sub.checks ?? []) {
    L.push(`### ${c.title}（${c.pass ? '通过' : '不通过'}）`);
    L.push(`规范依据：${c.standard}`);
    L.push('');
    for (const f of c.findings) {
      const dec = sub.decisions?.[f.id];
      const verdict = !dec ? '待判定' : dec.decision === 'confirm' ? '确认属实' : '驳回';
      const sev = f.severity === 'serious' ? '严重' : f.severity === 'general' ? '一般' : '建议';
      L.push(`- **${sev}** ${f.title}`);
      L.push(`  - 说明：${f.detail}`);
      if (f.locus) L.push(`  - 位置：(${f.locus.x.toFixed(1)}, ${f.locus.y.toFixed(1)}) m`);
      L.push(`  - 复核：${verdict}${dec?.by ? ` · ${dec.by}` : ''}${dec?.reason ? ` · 理由：${dec.reason}` : ''}`);
    }
    L.push('');
  }
  L.push('## 复核结论');
  L.push('');
  if (d.confirmedSerious.length) L.push(`确认 ${d.confirmedSerious.length} 项严重问题，整批退回设计方。`);
  else if (d.canRelease) L.push('全部问题已闭环，无确认的严重问题，同意放行出版。');
  else L.push(`尚有 ${d.pending.length} 项问题未判定。`);
  download(`${batch.code}-质检报告.md`, L.join(NL), 'text/markdown;charset=utf-8');
}
