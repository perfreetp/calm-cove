// 导出：成绩单 CSV、下料图 PNG/SVG、报告 HTML；打印时按真实比例
import { round } from './geometry.js';

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportGradebookCSV(db, { title = '成绩单' } = {}) {
  const lines = [];
  const now = new Date();
  lines.push(`# ${title}`);
  lines.push(`# 导出时间,${now.toLocaleString('zh-CN')}`);
  lines.push(`# 教师,${db.teacher?.name ?? ''}`);
  lines.push('');
  lines.push(
    [
      '学号', '姓名', '任务编号', '任务名称', '作答次数', '提交时间', '是否补交',
      '自动分', '教师扣分', '最终分', '状态', '轮廓RMS(mm)', '最大偏差(mm)',
      '超限区段数', '曲率突变区段', '缝份自交', '估算压力(mmHg)',
      '下料面积(cm²)', '下料周长(cm)', '缝份量(mm)', '教师评语',
    ].map(csvCell).join(',')
  );

  const rows = [...db.submissions].sort((a, b) => {
    const sa = db.students.findIndex((s) => s.id === a.studentId);
    const sb = db.students.findIndex((s) => s.id === b.studentId);
    if (sa !== sb) return sa - sb;
    if (a.taskId !== b.taskId) return a.taskId.localeCompare(b.taskId);
    return a.attempt - b.attempt;
  });

  for (const s of rows) {
    const st = db.students.find((x) => x.id === s.studentId);
    const task = db.tasks.find((t) => t.id === s.taskId);
    const ev = s.evaluation;
    lines.push([
      st?.id, st?.name, s.taskId, task?.title, `第 ${s.attempt} 次`,
      new Date(s.submittedAt).toLocaleString('zh-CN'),
      s.late ? '补交' : '按时',
      ev.autoScore, s.teacherDeduction ?? '', s.finalScore ?? '',
      s.status === 'graded' ? '已批阅' : '待批阅',
      ev.rms, ev.maxAbsDeviation, ev.deviationSegments.length,
      ev.abruptSegments.length, ev.selfIntersectCount, ev.pressure.mean,
      ev.pattern.areaCM2, ev.pattern.perimeterCM, ev.offsetMM,
      s.teacherComment ?? '',
    ].map(csvCell).join(','));
  }

  // 班级汇总
  lines.push('');
  lines.push(
    ['学号', '姓名', '提交次数', '已批阅', '待批阅', '平均分', '补交次数'].map(csvCell).join(',')
  );
  for (const st of db.students) {
    const subs = db.submissions.filter((x) => x.studentId === st.id);
    const graded = subs.filter((x) => x.status === 'graded');
    const scored = subs.map((x) => x.finalScore ?? x.autoScore);
    lines.push([
      st.id, st.name, subs.length, graded.length, subs.length - graded.length,
      scored.length ? round(scored.reduce((a, b) => a + b, 0) / scored.length, 1) : '',
      subs.filter((x) => x.late).length,
    ].map(csvCell).join(','));
  }

  const content = lines.join('\r\n');
  // BOM 便于 Excel 正确识别中文
  downloadBlob(new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' }), `成绩单_${fmtDate(now)}.csv`);
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * 导出下料图为 1:1 SVG：width/height 直接使用毫米，打印 100% 即实物尺寸。
 */
export function exportPatternSVG(pattern, opts = {}) {
  const {
    taskTitle = '压力衣', studentName = '', offsetMM = 0, showSeam = true,
    limbName = '', dateLabel = null,
  } = opts;
  const rows = pattern.rows;
  const lenMM = pattern.lengthMM;
  const maxHalf = Math.max(...rows.map((r) => r.halfWidth));
  const padL = 20;
  const padTop = 30;
  const padBottom = 34;
  const padR = 24;
  const wMM = lenMM + padL + padR;
  const hMM = maxHalf * 2 + padTop + padBottom;
  const n2 = (v) => Number(v.toFixed(2));
  const mapX = (s) => padL + (s - rows[0].s);
  const mapY = (half) => padTop + maxHalf - half;

  const outerPts = rows.map((r) => `${n2(mapX(r.s))},${n2(mapY(r.halfWidth))}`);
  for (let i = rows.length - 1; i >= 0; i--) {
    outerPts.push(`${n2(mapX(rows[i].s))},${n2(mapY(-rows[i].halfWidth))}`);
  }
  const innerPts = rows.map((r) => `${n2(mapX(r.s))},${n2(mapY(r.circ / 2))}`);
  for (let i = rows.length - 1; i >= 0; i--) {
    innerPts.push(`${n2(mapX(rows[i].s))},${n2(mapY(-rows[i].circ / 2))}`);
  }

  // 对位标记（四分位）
  const ticks = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const idx = Math.round(f * (rows.length - 1));
      const r = rows[idx];
      const x = mapX(r.s);
      return `<line x1="${n2(x)}" y1="${n2(mapY(r.halfWidth))}" x2="${n2(x)}" y2="${n2(mapY(-r.halfWidth))}" stroke="#9aa6b2" stroke-width="0.15" stroke-dasharray="1.2 1.2"/>`;
    })
    .join('\n  ');

  const dimY = mapY(-maxHalf) + 14;
  const dimX = mapX(rows[rows.length - 1].s) + 12;
  const today = dateLabel ?? new Date().toLocaleDateString('zh-CN');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${n2(wMM)}mm" height="${n2(hMM)}mm" viewBox="0 0 ${n2(wMM)} ${n2(hMM)}">
  <title>${esc(taskTitle)} · 下料图（1:1）</title>
  <desc>缝份 ${offsetMM} mm，面积 ${pattern.areaCM2.toFixed(0)} cm²，周长 ${pattern.perimeterCM.toFixed(1)} cm。打印时请选择 100% / 实际大小。</desc>
  <rect width="100%" height="100%" fill="#ffffff"/>

  <!-- 10 mm 方格（浅） -->
  <g stroke="#dfe6ee" stroke-width="0.1">
    ${Array.from({ length: Math.floor(lenMM / 10) + 1 }, (_, i) => {
      const x = mapX(rows[0].s + i * 10);
      return `<line x1="${n2(x)}" y1="${n2(padTop)}" x2="${n2(x)}" y2="${n2(padTop + maxHalf * 2)}"/>`;
    }).join('')}
    ${Array.from({ length: Math.floor((maxHalf * 2) / 10) + 1 }, (_, i) => {
      const y = padTop + i * 10;
      return `<line x1="${n2(padL)}" y1="${n2(y)}" x2="${n2(mapX(rows[rows.length - 1].s))}" y2="${n2(y)}"/>`;
    }).join('')}
  </g>

  <!-- 缝份外轮廓（裁剪线） -->
  <polygon points="${outerPts.join(' ')}" fill="#eef5fb" fill-opacity="0.85" stroke="#2a6fa0" stroke-width="0.5"/>
  ${showSeam ? `<!-- 净样线（虚线） -->
  <polygon points="${innerPts.join(' ')}" fill="none" stroke="#8a8272" stroke-width="0.25" stroke-dasharray="2.2 1.6"/>` : ''}

  ${ticks}

  <!-- 尺寸标注 · 长度 -->
  <g stroke="#2a6fa0" stroke-width="0.2" fill="none">
    <line x1="${n2(mapX(rows[0].s))}" y1="${n2(dimY)}" x2="${n2(mapX(rows[rows.length - 1].s))}" y2="${n2(dimY)}"/>
    <line x1="${n2(mapX(rows[0].s))}" y1="${n2(dimY - 2)}" x2="${n2(mapX(rows[0].s))}" y2="${n2(dimY + 2)}"/>
    <line x1="${n2(mapX(rows[rows.length - 1].s))}" y1="${n2(dimY - 2)}" x2="${n2(mapX(rows[rows.length - 1].s))}" y2="${n2(dimY + 2)}"/>
  </g>
  <text x="${n2((mapX(rows[0].s) + mapX(rows[rows.length - 1].s)) / 2)}" y="${n2(dimY - 2)}" font-family="monospace" font-size="3.4" fill="#2a6fa0" text-anchor="middle">${lenMM.toFixed(0)} mm</text>

  <!-- 尺寸标注 · 宽度 -->
  <g stroke="#2a6fa0" stroke-width="0.2" fill="none">
    <line x1="${n2(dimX)}" y1="${n2(mapY(maxHalf))}" x2="${n2(dimX)}" y2="${n2(mapY(-maxHalf))}"/>
    <line x1="${n2(dimX - 2)}" y1="${n2(mapY(maxHalf))}" x2="${n2(dimX + 2)}" y2="${n2(mapY(maxHalf))}"/>
    <line x1="${n2(dimX - 2)}" y1="${n2(mapY(-maxHalf))}" x2="${n2(dimX + 2)}" y2="${n2(mapY(-maxHalf))}"/>
  </g>
  <text x="${n2(dimX + 2.6)}" y="${n2((mapY(maxHalf) + mapY(-maxHalf)) / 2)}" font-family="monospace" font-size="3.4" fill="#2a6fa0" transform="rotate(90 ${n2(dimX + 2.6)} ${n2((mapY(maxHalf) + mapY(-maxHalf)) / 2)})" text-anchor="middle">${(maxHalf * 2).toFixed(0)} mm</text>

  <!-- 标题与工艺信息 -->
  <g font-family="sans-serif" fill="#1f2a36">
    <text x="${n2(padL)}" y="8.5" font-size="4.6" font-weight="700">下料图 · ${esc(taskTitle)}</text>
    <text x="${n2(padL)}" y="14.2" font-size="2.9" fill="#4a5766">${esc(studentName)}${limbName ? ' · ' + esc(limbName) : ''} · 缝份 ${offsetMM} mm（两侧）· 面积 ${pattern.areaCM2.toFixed(0)} cm² · 周长 ${pattern.perimeterCM.toFixed(1)} cm</text>
    <text x="${n2(padL)}" y="19.4" font-size="2.9" fill="#4a5766">净样长度 ${lenMM.toFixed(0)} mm · 最大宽 ${(maxHalf * 2).toFixed(0)} mm · 最小宽 ${pattern.minWidthMM.toFixed(0)} mm · 生成 ${esc(today)}</text>
  </g>
  <g font-family="monospace" fill="#8b5e1f" font-size="3">
    <text x="${n2(padL)}" y="${n2(hMM - 7)}">打印设置：100% / 实际大小，勿选「适应页面」。虚线为净样（灰），实线为裁剪线（蓝）。</text>
    <text x="${n2(padL)}" y="${n2(hMM - 3.2)}">${wMM > 276 ? '⚠ 图幅超过 A4 横向可打印宽度（约 276 mm），需分幅拼接或改用 A3 / 卷筒纸。' : '图幅 ' + n2(wMM) + ' × ' + n2(hMM) + ' mm，A4 横向可 1:1 打印。'}</text>
  </g>
  <g stroke="#1f2a36" stroke-width="0.35" fill="none">
    <path d="M4 4 h6 M4 4 v6"/>
    <path d="M${n2(wMM - 4)} 4 h-6 M${n2(wMM - 4)} 4 v6"/>
    <path d="M4 ${n2(hMM - 4)} h6 M4 ${n2(hMM - 4)} v-6"/>
    <path d="M${n2(wMM - 4)} ${n2(hMM - 4)} h-6 M${n2(wMM - 4)} ${n2(hMM - 4)} v-6"/>
  </g>
</svg>`;
  downloadBlob(
    new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
    `下料图_${taskTitle}_${studentName}_${fmtDate(new Date())}.svg`
  );
  return { widthMM: wMM, heightMM: hMM };
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 从画布导出 PNG（带比例标尺说明） */
export function exportCanvasPNG(canvas, filename, dpiLabel = '') {
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}

/** 打印用：打开新窗口并写入按真实比例嵌入的图片 */
export function printPattern(canvas, meta = {}) {
  if (!canvas) return;
  const url = canvas.toDataURL('image/png');
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>下料图 · 1:1 打印</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .hdr { padding: 6mm 0 3mm; font-size: 10pt; color: #222; }
  .hdr b { font-size: 12pt; }
  .hdr small { color: #666; }
  img { width: ${meta.printWidthMM ?? 270}mm; height: auto; display: block; border: 0.2mm solid #aaa; }
  .foot { margin-top: 3mm; font-size: 8.5pt; color: #666; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="hdr noprint"><b>下料图打印 · 按 1:1 比例</b><br/><small>${esc(meta.taskTitle ?? '')} · ${esc(meta.studentName ?? '')} · 缝份 ${meta.offsetMM ?? 0} mm。打印时请选择「实际大小 / 100%」，勿选「适应页面尺寸」。</small></div>
<img src="${url}" alt="下料图"/>
<div class="foot">图上打印宽度 ${meta.printWidthMM ?? 270} mm；${esc(meta.note ?? '')}<br/>面积 ${meta.areaCM2 ?? ''} cm² · 周长 ${meta.perimeterCM ?? ''} cm · 生成 ${new Date().toLocaleString('zh-CN')}
${meta.oversize ? '<br/><b style="color:#b45309">⚠ 图幅 ' + esc(meta.oversize) + ' 超出 A4 横向可打印范围，请分幅打印后拼接，或换用 A3 / 卷筒纸。</b>' : ''}</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),350)}</script>
</body></html>`);
  w.document.close();
}

/** 单份考核报告（学员可看区段与评语） */
export function exportReportHTML(db, sub, opts = {}) {
  const st = db.students.find((s) => s.id === sub.studentId);
  const task = db.tasks.find((t) => t.id === sub.taskId);
  const ev = sub.evaluation;
  const segRows = ev.deviationSegments
    .map(
      (s) => `<tr><td>${s.startMM} – ${s.endMM} mm</td><td class="num">${s.maxAbs.toFixed(1)} mm</td>
      <td>${s.signed >= 0 ? '偏外（过松）' : '偏内（过紧）'}</td><td class="num">${s.peakX} mm</td></tr>`
    )
    .join('');
  const abRows = ev.abruptSegments
    .map((s) => `<tr><td>${s.startMM} – ${s.endMM} mm</td><td class="num">${s.peakKappa}</td></tr>`)
    .join('');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
<title>考核报告 · ${st.name} · ${task.title}</title>
<style>
 body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1a2433;max-width:820px;margin:32px auto;padding:0 20px;line-height:1.65;font-size:13px}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:14px;margin:22px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;color:#334155}
 .muted{color:#7a8699;font-size:12px}
 .score{display:flex;gap:16px;margin:16px 0;align-items:stretch;flex-wrap:wrap}
 .box{flex:1;min-width:130px;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;background:#fbfcfe}
 .box b{display:block;font-size:26px;font-variant-numeric:tabular-nums}
 table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
 th{background:#f4f7fb;text-align:left;padding:7px 9px;color:#475569;font-weight:600}
 td{padding:6px 9px;border-bottom:1px solid #eef2f7}
 .num{font-variant-numeric:tabular-nums;text-align:right}
 .tag{display:inline-block;padding:1px 8px;border-radius:999px;font-size:11px;background:#eef2f7;color:#475569;margin-right:6px}
 .tag.red{background:#fee;color:#c53030}.tag.amber{background:#fff6e5;color:#a16207}.tag.green{background:#ecfdf3;color:#15803d}
 .comment{background:#f8fafc;border-left:3px solid #46d3c5;padding:10px 14px;border-radius:6px;margin-top:8px}
</style></head><body>
<h1>压力衣曲面建模 · 考核报告</h1>
<div class="muted">${st.name}（${st.id}） · ${task.title} · 第 ${sub.attempt} 次提交
 · ${new Date(sub.submittedAt).toLocaleString('zh-CN')} ${sub.late ? '· <span class="tag amber">补交</span>' : '<span class="tag green">按时提交</span>'}</div>

<div class="score">
  <div class="box"><span class="muted">${sub.status === 'graded' ? '最终得分' : '自动评分（待复核）'}</span><b>${sub.finalScore ?? ev.autoScore}<span style="font-size:13px;color:#94a3b8"> / 100</span></b></div>
  <div class="box"><span class="muted">自动分</span><b>${ev.autoScore.toFixed(1)}</b><span class="muted">${sub.status === 'graded' ? '教师扣分 ' + (sub.teacherDeduction ?? 0) : '教师尚未复核'}</span></div>
  <div class="box"><span class="muted">轮廓 RMS</span><b>${ev.rms.toFixed(2)}<span style="font-size:13px;color:#94a3b8"> mm</span></b><span class="muted">最大偏差 ${ev.maxAbsDeviation.toFixed(1)} mm</span></div>
  <div class="box"><span class="muted">估算压力</span><b>${ev.pressure.mean.toFixed(1)}</b><span class="muted">目标 ${task.pressureTier.min}–${task.pressureTier.max} mmHg</span></div>
</div>

<h2>自动评分构成</h2>
<table><tr><th>项目</th><th class="num">得分</th><th>说明</th></tr>
<tr><td>轮廓贴合</td><td class="num">${ev.breakdown.contour.toFixed(1)} / 60</td><td>RMS ${ev.rms.toFixed(2)} mm，超 5 mm 区段 ${ev.deviationSegments.length} 处</td></tr>
<tr><td>曲率平滑</td><td class="num">${ev.breakdown.smooth.toFixed(1)} / 20</td><td>曲率突变 ${ev.abruptSegments.length} 处（阈值 ${task.curvatureThreshold}）</td></tr>
<tr><td>缝份与展开</td><td class="num">${ev.breakdown.seam.toFixed(1)} / 10</td><td>缝份 ${ev.offsetMM} mm，推荐 ${ev.offsetRecommended} mm，自交 ${ev.selfIntersectCount} 处</td></tr>
<tr><td>压力档位</td><td class="num">${ev.breakdown.pressure.toFixed(1)} / 10</td><td>估算 ${ev.pressure.mean.toFixed(1)} mmHg，档位 ${task.pressureTier.label}</td></tr>
</table>

<h2>错题区段 · 偏差 &gt; 5 mm</h2>
${segRows ? `<table><tr><th>区段</th><th class="num">最大偏差</th><th>方向</th><th class="num">峰值位置</th></tr>${segRows}</table>` : '<p class="muted">无超过 5 mm 的区段。</p>'}

<h2>曲率突变标黄区段</h2>
${abRows ? `<table><tr><th>区段</th><th class="num">峰值曲率 κ (1/mm)</th></tr>${abRows}</table>` : '<p class="muted">未检出曲率突变。</p>'}

<h2>展开下料</h2>
<table>
<tr><th>面积</th><td class="num">${ev.pattern.areaCM2} cm²</td><th>周长</th><td class="num">${ev.pattern.perimeterCM} cm</td></tr>
<tr><th>长度</th><td class="num">${ev.pattern.lengthMM} mm</td><th>最大宽度</th><td class="num">${ev.pattern.maxWidthMM} mm</td></tr>
</table>

${sub.teacherComment ? `<h2>教师评语</h2><div class="comment">${esc(sub.teacherComment)}</div>` : ''}
<p class="muted" style="margin-top:28px">生成于 ${new Date().toLocaleString('zh-CN')} · 压力衣曲面建模与考核系统</p>
</body></html>`;
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `考核报告_${st.name}_${task.title}.html`);
}
