import { Screen } from './base.js';
import { state, update, uid } from '../store.js';
import { runChecks, batchCounts, ISSUE_LABEL, SEVERITY_LABEL, ISSUE_STATUS_LABEL, BATCH_STATUS_LABEL } from '../seed.js';
import { esc, today } from '../dom.js';
import { Batch, BatchItem } from '../types.js';

export class Qc extends Screen {
  private showNew = false;

  render(): void {
    const role = state.ui.role;
    const sel = state.batches.find(b => b.id === state.ui.selBatch) ?? state.batches[0];

    this.innerHTML = `
      <h2>素材批次质检</h2>
      <div class="row">
        <div class="col" style="min-width:300px;flex:0.9">
          <div class="panel">
            <div class="toolbar" style="justify-content:space-between">
              <h3 style="margin:0">批次列表</h3>
              <button class="sm primary" id="toggle-new">＋ 新批次</button>
            </div>
            ${this.showNew ? this.newBatchForm() : ''}
            ${state.batches.map(b => {
              const c = batchCounts(b);
              const cls = b.status === 'released' ? 'ok' : b.status === 'returned' ? 'severe' : 'normal';
              return `<div class="list-item ${sel?.id === b.id ? 'sel' : ''}" data-batch="${b.id}">
                <b>${esc(b.name)}</b> <span class="chip ${cls}">${BATCH_STATUS_LABEL[b.status]}</span>
                <div class="muted">${esc(b.supplier)} · ${b.submittedAt} · 素材 ${b.items.length} ·
                  问题 ${c.total}（待复核 ${c.open} / 确认 ${c.confirmed} / 驳回 ${c.rejected}）</div>
              </div>`;
            }).join('')}
          </div>
        </div>
        <div class="col grow">${sel ? this.batchDetail(sel, role) : '<div class="panel">暂无批次</div>'}</div>
      </div>`;

    this.wire(sel);
  }

  private newBatchForm(): string {
    return `<div class="panel" style="background:#f8fafc">
      <h3>提交新批次（提交后自动跑检查）</h3>
      <div class="toolbar">
        <label class="fl">批次号<input id="nb-name" value="B-2026-${String(42 + state.batches.length).padStart(3, '0')}"></label>
        <label class="fl">供应方<input id="nb-supplier" value="疾风素材社"></label>
        <label class="fl">素材数量<input type="number" id="nb-count" value="4" min="1" max="10" style="width:60px"></label>
      </div>
      <div class="fl" style="font-size:12px;color:var(--muted);margin-bottom:6px">关联动画（放行后教练端可见）：</div>
      <div class="toolbar">
        ${state.anims.map(a => `<label style="font-size:12px"><input type="checkbox" class="nb-anim" value="${esc(a.name)}"> ${esc(a.name)}</label>`).join('')}
      </div>
      <button class="primary sm" id="nb-submit">提交并自动检查</button>
    </div>`;
  }

  private batchDetail(b: Batch, role: string): string {
    const c = batchCounts(b);
    const canRelease = b.status === 'review' && c.open === 0 && c.confirmed === 0;
    const canReturn = b.status === 'review' && c.open === 0 && c.confirmed > 0;
    const confirmed = b.issues.filter(i => i.status === 'confirmed');
    return `
      <div class="panel">
        <h3>${esc(b.name)} <span class="chip ${b.status === 'released' ? 'ok' : b.status === 'returned' ? 'severe' : 'normal'}">${BATCH_STATUS_LABEL[b.status]}</span></h3>
        <div class="kv">
          <b>供应方</b><span>${esc(b.supplier)}</span>
          <b>提交时间</b><span>${b.submittedAt}</span>
          <b>关联动画</b><span>${b.animNames.length ? b.animNames.map(esc).join('、') : '—'}</span>
          <b>问题统计</b><span>共 ${c.total} 条 · 待复核 ${c.open} · 已确认 ${c.confirmed} · 已驳回 ${c.rejected}</span>
        </div>
        <details style="margin-top:8px"><summary class="muted" style="cursor:pointer">自动检查日志</summary>
          <div class="log-box" style="margin-top:6px">${esc(b.checkLog.join('\n'))}</div>
        </details>
      </div>
      <div class="panel">
        <h3>素材清单</h3>
        <table>
          <tr><th>素材</th><th>拆件数</th><th>帧数</th><th>绑点数</th></tr>
          ${b.items.map(it => `<tr><td>${esc(it.name)}</td><td>${it.parts}</td><td>${it.frames}</td><td>${it.bindPoints.length}</td></tr>`).join('')}
        </table>
      </div>
      <div class="panel">
        <h3>问题复核 ${role !== 'reviewer' ? '<span class="chip gray">仅复核员可操作</span>' : ''}</h3>
        ${b.issues.length ? `<table>
          <tr><th>素材</th><th>问题</th><th>级别</th><th>说明</th><th>状态</th><th>操作</th></tr>
          ${b.issues.map(i => `<tr>
            <td>${esc(i.itemName)}</td>
            <td>${ISSUE_LABEL[i.type]}</td>
            <td><span class="chip ${i.severity}">${SEVERITY_LABEL[i.severity]}</span></td>
            <td class="muted">${esc(i.detail)}</td>
            <td><span class="chip ${i.status === 'open' ? 'normal' : i.status === 'confirmed' ? 'severe' : 'ok'}">${ISSUE_STATUS_LABEL[i.status]}</span></td>
            <td>${i.status === 'open'
              ? `<button class="sm" data-issue-ok="${i.id}" ${role !== 'reviewer' || b.status !== 'review' ? 'disabled' : ''}>确认</button>
                 <button class="sm" data-issue-no="${i.id}" ${role !== 'reviewer' || b.status !== 'review' ? 'disabled' : ''}>驳回</button>`
              : `<span class="muted">${i.reviewedAt ?? ''}</span>`}</td>
          </tr>`).join('')}
        </table>` : '<div class="hint">本批次未发现问题。</div>'}
        <hr class="sep">
        <div class="toolbar">
          <button class="good" id="btn-release" ${canRelease ? '' : 'disabled'}>✔ 放行批次</button>
          <button class="danger" id="btn-return" ${canReturn ? '' : 'disabled'}>↩ 退回供应方</button>
          <span class="hint">
            ${b.status === 'review'
              ? c.open > 0 ? `还有 ${c.open} 条问题待复核，清零后才能放行或退回`
              : c.confirmed > 0 ? `存在 ${c.confirmed} 条已确认问题，不能放行，应退回供应方`
              : '问题已全部处理且无确认问题，可以放行'
              : b.status === 'released' ? '批次已放行，关联动画对教练端可见' : '批次已退回供应方'}
          </span>
        </div>
        ${b.status === 'returned' && confirmed.length ? `
          <h3>退回问题清单</h3>
          <table>
            <tr><th>素材</th><th>问题</th><th>级别</th><th>说明</th></tr>
            ${confirmed.map(i => `<tr><td>${esc(i.itemName)}</td><td>${ISSUE_LABEL[i.type]}</td>
              <td><span class="chip ${i.severity}">${SEVERITY_LABEL[i.severity]}</span></td><td>${esc(i.detail)}</td></tr>`).join('')}
          </table>` : ''}
      </div>`;
  }

  private wire(sel: Batch | undefined): void {
    this.querySelector('#toggle-new')?.addEventListener('click', () => { this.showNew = !this.showNew; this.render(); });
    this.querySelectorAll('[data-batch]').forEach(el => el.addEventListener('click', () => {
      update(s => { s.ui.selBatch = (el as HTMLElement).dataset.batch!; });
    }));
    this.querySelector('#nb-submit')?.addEventListener('click', () => {
      const name = (this.querySelector('#nb-name') as HTMLInputElement).value.trim() || 'B-未命名';
      const supplier = (this.querySelector('#nb-supplier') as HTMLInputElement).value.trim() || '未知供应方';
      const count = Math.max(1, Math.min(10, +(this.querySelector('#nb-count') as HTMLInputElement).value || 3));
      const animNames = [...this.querySelectorAll<HTMLInputElement>('.nb-anim')].filter(c => c.checked).map(c => c.value);
      const items: BatchItem[] = [];
      for (let i = 0; i < count; i++) {
        const r = Math.random;
        const parts = r() < 0.3 ? 7 + Math.floor(r() * 3) : 10;
        const frames = r() < 0.25 ? 6 + Math.floor(r() * 6) : 12 + Math.floor(r() * 18);
        const bindPoints = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
          x: Math.round(r() < 0.25 ? 800 + r() * 200 : r() * 780),
          y: Math.round(r() < 0.2 ? 500 + r() * 120 : r() * 480),
        }));
        items.push({ name: `${supplier}_${i + 1}号素材`, parts, frames, bindPoints });
      }
      update(s => {
        const { issues, log } = runChecks(items, uid);
        const b: Batch = {
          id: uid(), name, supplier, submittedAt: today(),
          items, issues, status: 'review', checkLog: log, animNames,
        };
        s.batches.unshift(b);
        s.ui.selBatch = b.id;
      });
      this.showNew = false;
    });
    sel?.issues.forEach(i => {
      this.querySelector(`[data-issue-ok="${i.id}"]`)?.addEventListener('click', () => {
        update(s => {
          const iss = s.batches.find(b => b.id === sel.id)!.issues.find(x => x.id === i.id)!;
          iss.status = 'confirmed'; iss.reviewedAt = today();
        });
      });
      this.querySelector(`[data-issue-no="${i.id}"]`)?.addEventListener('click', () => {
        update(s => {
          const iss = s.batches.find(b => b.id === sel.id)!.issues.find(x => x.id === i.id)!;
          iss.status = 'rejected'; iss.reviewedAt = today();
        });
      });
    });
    this.querySelector('#btn-release')?.addEventListener('click', () => {
      update(s => {
        const b = s.batches.find(x => x.id === sel!.id)!;
        b.status = 'released';
        b.checkLog.push(`[复核] ${today()} 问题清零，批次放行`);
        for (const a of s.anims) if (b.animNames.includes(a.name)) a.released = true;
      });
    });
    this.querySelector('#btn-return')?.addEventListener('click', () => {
      update(s => {
        const b = s.batches.find(x => x.id === sel!.id)!;
        b.status = 'returned';
        b.checkLog.push(`[复核] ${today()} 存在已确认问题，批次退回供应方，附问题清单 ${b.issues.filter(i => i.status === 'confirmed').length} 条`);
      });
    });
  }
}
customElements.define('x-qc', Qc);
