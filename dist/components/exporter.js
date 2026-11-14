import { Screen } from './base.js';
import { state, update, resetState } from '../store.js';
import { figureSVGString, poseAt, CANVAS_W, CANVAS_H } from '../rig.js';
import { makeZip, svgToPng } from '../zip.js';
import { download, esc, today } from '../dom.js';
import { batchCounts, ISSUE_LABEL, SEVERITY_LABEL, ISSUE_STATUS_LABEL, BATCH_STATUS_LABEL } from '../seed.js';
export class Exporter extends Screen {
    constructor() {
        super(...arguments);
        this.progress = '';
    }
    render() {
        const selId = state.ui.selAnim ?? state.anims[0]?.id;
        this.innerHTML = `
      <h2>导出中心</h2>
      <div class="row">
        <div class="panel grow">
          <h3>序列帧压缩包</h3>
          <div class="toolbar">
            <label class="fl">动画工程
              <select id="ex-anim">${state.anims.map(a => `<option value="${a.id}" ${a.id === selId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
            </label>
            <label class="fl">帧率(fps)<input type="number" id="ex-fps" value="12" min="1" max="60"></label>
            <label class="fl">皮肤
              <select id="ex-skin">${(state.anims.find(a => a.id === selId)?.skins ?? []).map(s => `<option value="${s.id}">${esc(s.name)}（${esc(s.athlete)}）</option>`).join('')}</select>
            </label>
          </div>
          <button class="primary" id="ex-frames">导出序列帧 ZIP（PNG）</button>
          <span class="muted" id="ex-progress">${esc(this.progress)}</span>
        </div>
        <div class="panel grow">
          <h3>质检报告</h3>
          <p class="hint">汇总全部批次的自动检查结果与复核记录，含退回批次的问题清单。</p>
          <button id="ex-report">导出质检报告（HTML）</button>
        </div>
      </div>
      <div class="row">
        <div class="panel grow">
          <h3>工程备份</h3>
          <p class="hint">工程保存在浏览器本地（localStorage）。可导出 JSON 备份，或从备份恢复。</p>
          <div class="toolbar">
            <button id="ex-backup">导出工程 JSON</button>
            <label class="fl" style="flex-direction:row;align-items:center;gap:6px">恢复
              <input type="file" id="ex-restore" accept="application/json">
            </label>
            <button class="danger" id="ex-reset">清空并重置示例数据</button>
          </div>
        </div>
      </div>`;
        this.wire();
    }
    wire() {
        this.querySelector('#ex-anim')?.addEventListener('change', e => {
            update(s => { s.ui.selAnim = e.target.value; });
        });
        this.querySelector('#ex-frames')?.addEventListener('click', async () => {
            const anim = state.anims.find(a => a.id === this.querySelector('#ex-anim').value);
            if (!anim)
                return;
            const fps = Math.max(1, Math.min(60, +this.querySelector('#ex-fps').value || 12));
            const skinId = this.querySelector('#ex-skin').value;
            const n = Math.max(1, Math.round(anim.duration * fps));
            const files = [];
            const prog = this.querySelector('#ex-progress');
            try {
                for (let i = 0; i < n; i++) {
                    prog.textContent = `渲染第 ${i + 1}/${n} 帧…`;
                    const svg = figureSVGString(anim, poseAt(anim, i / fps), skinId);
                    const blob = await svgToPng(svg, CANVAS_W, CANVAS_H);
                    files.push({ name: `${anim.name}_frame_${String(i + 1).padStart(3, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
                }
                download(makeZip(files), `${anim.name}_序列帧_${fps}fps.zip`);
                this.progress = `已导出 ${n} 帧`;
                prog.textContent = this.progress;
            }
            catch (err) {
                prog.textContent = `导出失败：${err}`;
            }
        });
        this.querySelector('#ex-report')?.addEventListener('click', () => {
            download(new Blob([this.buildReport()], { type: 'text/html;charset=utf-8' }), `质检报告_${today()}.html`);
        });
        this.querySelector('#ex-backup')?.addEventListener('click', () => {
            download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `跑姿动画工程_${today()}.json`);
        });
        this.querySelector('#ex-restore')?.addEventListener('change', e => {
            const f = e.target.files?.[0];
            if (!f)
                return;
            const rd = new FileReader();
            rd.onload = () => {
                try {
                    const data = JSON.parse(String(rd.result));
                    if (!Array.isArray(data.anims) || !Array.isArray(data.batches))
                        throw new Error('格式不正确');
                    update(s => { s.anims = data.anims; s.batches = data.batches; s.ui = data.ui ?? s.ui; });
                    alert('恢复成功');
                }
                catch (err) {
                    alert(`恢复失败：${err}`);
                }
            };
            rd.readAsText(f);
        });
        this.querySelector('#ex-reset')?.addEventListener('click', () => {
            if (confirm('确定清空本地工程并恢复示例数据？'))
                resetState();
        });
    }
    buildReport() {
        const rows = state.batches.map(b => {
            const c = batchCounts(b);
            const issueRows = b.issues.map(i => `<tr>
        <td>${esc(i.itemName)}</td><td>${ISSUE_LABEL[i.type]}</td>
        <td>${SEVERITY_LABEL[i.severity]}</td><td>${esc(i.detail)}</td>
        <td>${ISSUE_STATUS_LABEL[i.status]}</td><td>${i.reviewedAt ?? '—'}</td></tr>`).join('');
            return `<h2>${esc(b.name)}（${BATCH_STATUS_LABEL[b.status]}）</h2>
        <p>供应方：${esc(b.supplier)} ｜ 提交：${b.submittedAt} ｜ 素材 ${b.items.length} 个 ｜
        问题 ${c.total}（待复核 ${c.open} / 确认 ${c.confirmed} / 驳回 ${c.rejected}）</p>
        ${b.issues.length ? `<table border="1" cellspacing="0" cellpadding="6">
          <tr><th>素材</th><th>问题</th><th>级别</th><th>说明</th><th>复核结论</th><th>复核日期</th></tr>${issueRows}</table>` : '<p>未发现问题。</p>'}
        ${b.status === 'returned' ? '<p><b>本批次已退回供应方，上表“已确认”问题即为退回问题清单。</b></p>' : ''}
        <details><summary>自动检查日志</summary><pre>${esc(b.checkLog.join('\n'))}</pre></details>`;
        }).join('\n');
        return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>质检报告 ${today()}</title>
      <style>body{font-family:"Microsoft YaHei",sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#1f2733}
      table{border-collapse:collapse;width:100%}th{background:#f0f3f8}pre{background:#0f172a;color:#a5f3c0;padding:10px;border-radius:8px;white-space:pre-wrap}</style>
      </head><body><h1>定向越野跑姿素材批次质检报告</h1><p>生成日期：${today()} ｜ 批次总数：${state.batches.length}</p>${rows}</body></html>`;
    }
}
customElements.define('x-exporter', Exporter);
//# sourceMappingURL=exporter.js.map