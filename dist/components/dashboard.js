import { Screen } from './base.js';
import { state, update } from '../store.js';
import { batchCounts, BATCH_STATUS_LABEL } from '../seed.js';
import { esc } from '../dom.js';
export class Dashboard extends Screen {
    render() {
        const s = state;
        const openIssues = s.batches.reduce((n, b) => n + batchCounts(b).open, 0);
        const released = s.batches.filter(b => b.status === 'released').length;
        const returned = s.batches.filter(b => b.status === 'returned').length;
        const reviewing = s.batches.filter(b => b.status === 'review').length;
        const skins = s.anims.reduce((n, a) => a.skins.length + n, 0);
        this.innerHTML = `
      <h2>总览</h2>
      <div class="stat-grid">
        <div class="stat-card"><div class="lbl">动画工程</div><div class="num">${s.anims.length}</div></div>
        <div class="stat-card"><div class="lbl">选手皮肤</div><div class="num">${skins}</div></div>
        <div class="stat-card"><div class="lbl">待复核批次</div><div class="num">${reviewing}</div></div>
        <div class="stat-card"><div class="lbl">待处理问题</div><div class="num" style="color:${openIssues ? 'var(--bad)' : 'var(--accent2)'}">${openIssues}</div></div>
        <div class="stat-card"><div class="lbl">已放行 / 已退回</div><div class="num">${released} / ${returned}</div></div>
      </div>
      <div class="row">
        <div class="panel grow">
          <h3>动画工程</h3>
          ${s.anims.map(a => `
            <div class="list-item" data-anim="${a.id}">
              <b>${esc(a.name)}</b>
              ${a.released ? '<span class="chip ok">已放行</span>' : '<span class="chip gray">未放行</span>'}
              <span class="muted">关键帧 ${a.keyframes.length} · 时长 ${a.duration}s · 皮肤 ${a.skins.length} 套</span>
            </div>`).join('')}
          <div class="hint">点击进入绑骨 / 动画编辑。只有质检批次放行后，动画才对教练端可见。</div>
        </div>
        <div class="panel grow">
          <h3>素材批次</h3>
          ${s.batches.map(b => {
            const c = batchCounts(b);
            const cls = b.status === 'released' ? 'ok' : b.status === 'returned' ? 'severe' : 'normal';
            return `<div class="list-item" data-batch="${b.id}">
              <b>${esc(b.name)}</b> <span class="chip ${cls}">${BATCH_STATUS_LABEL[b.status]}</span>
              <div class="muted">${esc(b.supplier)} · ${b.items.length} 个素材 · 问题 ${c.total}（待复核 ${c.open}）</div>
            </div>`;
        }).join('')}
          <div class="hint">点击进入批次质检界面复核问题。</div>
        </div>
      </div>
      <div class="panel">
        <h3>快捷入口</h3>
        <div class="toolbar">
          <a href="#/rigging"><button>🦴 绑骨</button></a>
          <a href="#/animator"><button>🎞 动画时间轴</button></a>
          <a href="#/metrics"><button>📈 步频对比</button></a>
          <a href="#/qc"><button>🧪 批次质检</button></a>
          <a href="#/coach"><button>🎓 教练端</button></a>
          <a href="#/export"><button>📦 导出</button></a>
        </div>
      </div>`;
        this.querySelectorAll('[data-anim]').forEach(el => el.addEventListener('click', () => {
            update(s2 => { s2.ui.selAnim = el.dataset.anim; });
            location.hash = '#/animator';
        }));
        this.querySelectorAll('[data-batch]').forEach(el => el.addEventListener('click', () => {
            update(s2 => { s2.ui.selBatch = el.dataset.batch; });
            location.hash = '#/qc';
        }));
    }
}
customElements.define('x-dashboard', Dashboard);
//# sourceMappingURL=dashboard.js.map