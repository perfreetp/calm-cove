import { Screen } from './base.js';
import { state } from '../store.js';
import { figureInnerHTML, poseAt, CANVAS_W, CANVAS_H } from '../rig.js';
import { esc } from '../dom.js';
const CAD_MIN = 180, CAD_MAX = 200;
function summary(a) {
    const n = a.metrics.length || 1;
    const avgCad = a.metrics.reduce((s, m) => s + m.cadence, 0) / n;
    const avgCon = a.metrics.reduce((s, m) => s + m.contact, 0) / n;
    const inRange = a.metrics.filter(m => m.cadence >= CAD_MIN && m.cadence <= CAD_MAX).length;
    return { avgCad, avgCon, rate: inRange / n, out: n - inRange };
}
export class Coach extends Screen {
    constructor() {
        super(...arguments);
        this.raf = 0;
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        cancelAnimationFrame(this.raf);
    }
    render() {
        const released = state.anims.filter(a => a.released);
        this.innerHTML = `
      <h2>教练端 <span class="chip info">只读 · 仅显示已放行内容</span></h2>
      <div class="panel">
        <h3>已放行动画（${released.length}）</h3>
        ${released.length ? '<div class="grid-cards">' + released.map(a => {
            const skin = a.skins.find(s => s.id === a.activeSkinId) ?? a.skins[0];
            const sm = summary(a);
            return `<div class="player-card">
            <svg class="mini" data-anim="${a.id}" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}"></svg>
            <div style="margin-top:6px"><b>${esc(a.name)}</b> · ${esc(skin?.athlete ?? '')}</div>
            <div class="muted">平均步频 ${sm.avgCad.toFixed(0)} · 平均触地 ${sm.avgCon.toFixed(0)}ms · 达标率 ${(sm.rate * 100).toFixed(0)}%</div>
          </div>`;
        }).join('') + '</div>'
            : '<div class="hint">暂无已放行动画。批次在质检界面放行后，关联动画会出现在这里。</div>'}
      </div>
      <div class="panel">
        <h3>成绩汇总</h3>
        ${released.length ? `<table>
          <tr><th>动画</th><th>选手</th><th>平均步频</th><th>平均触地时长</th><th>步频达标率(${CAD_MIN}–${CAD_MAX})</th><th>评价</th></tr>
          ${released.map(a => {
            const skin = a.skins.find(s => s.id === a.activeSkinId) ?? a.skins[0];
            const sm = summary(a);
            const grade = sm.rate >= 0.85 ? '<span class="chip ok">优</span>' : sm.rate >= 0.6 ? '<span class="chip normal">待改进</span>' : '<span class="chip severe">需重点纠正</span>';
            return `<tr><td>${esc(a.name)}</td><td>${esc(skin?.athlete ?? '')}</td>
              <td>${sm.avgCad.toFixed(1)}</td><td>${sm.avgCon.toFixed(0)} ms</td>
              <td>${(sm.rate * 100).toFixed(0)}%（${sm.out} 点超区间）</td><td>${grade}</td></tr>`;
        }).join('')}
        </table>` : '<div class="hint">暂无数据。</div>'}
      </div>`;
        this.startLoop();
    }
    startLoop() {
        cancelAnimationFrame(this.raf);
        const t0 = performance.now();
        const step = () => {
            const t = (performance.now() - t0) / 1000;
            this.querySelectorAll('svg.mini').forEach(svg => {
                const a = state.anims.find(x => x.id === svg.dataset.anim);
                if (a)
                    svg.innerHTML = figureInnerHTML(a, poseAt(a, t), a.activeSkinId, false);
            });
            this.raf = requestAnimationFrame(step);
        };
        this.raf = requestAnimationFrame(step);
    }
}
customElements.define('x-coach', Coach);
//# sourceMappingURL=coach.js.map