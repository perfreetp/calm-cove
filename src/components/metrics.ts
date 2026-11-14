import { Screen } from './base.js';
import { state, update } from '../store.js';
import { esc } from '../dom.js';
import { Anim } from '../types.js';

declare const d3: any;

const CAD_MIN = 180, CAD_MAX = 200;

export class Metrics extends Screen {
  private checked = new Set<string>();
  private editId: string | null = null;

  render(): void {
    if (!state.anims.length) { this.innerHTML = '<p>暂无动画</p>'; return; }
    if (!this.checked.size) state.anims.slice(0, 2).forEach(a => this.checked.add(a.id));
    if (!this.editId || !state.anims.some(a => a.id === this.editId)) this.editId = state.anims[0].id;
    const sel = state.anims.filter(a => this.checked.has(a.id));
    const editAnim = state.anims.find(a => a.id === this.editId)!;

    this.innerHTML = `
      <h2>步频 / 触地时长对比</h2>
      <div class="row">
        <div class="panel" style="min-width:220px">
          <h3>对比对象</h3>
          ${state.anims.map(a => {
            const athlete = (a.skins.find(s => s.id === a.activeSkinId) ?? a.skins[0])?.athlete ?? '';
            const out = a.metrics.filter(m => m.cadence < CAD_MIN || m.cadence > CAD_MAX).length;
            return `<label style="display:block;margin-bottom:6px;cursor:pointer">
              <input type="checkbox" data-chk="${a.id}" ${this.checked.has(a.id) ? 'checked' : ''}>
              ${esc(a.name)} <span class="muted">${esc(athlete)}</span>
              ${out ? `<span class="chip severe">${out} 点超区间</span>` : '<span class="chip ok">步频正常</span>'}
            </label>`;
          }).join('')}
          <hr class="sep">
          <div class="hint">步频合格区间 <b>${CAD_MIN}–${CAD_MAX} 步/分</b>，超出区间的采样点会在图上以红色标出。</div>
        </div>
        <div class="col grow">
          <div class="panel"><h3>步频（步/分）</h3><div id="chart-cadence"></div></div>
          <div class="panel"><h3>触地时长（毫秒）</h3><div id="chart-contact"></div></div>
        </div>
      </div>
      <div class="panel">
        <h3>采样数据编辑 ·
          <select id="edit-sel">${state.anims.map(a => `<option value="${a.id}" ${a.id === this.editId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        </h3>
        <div style="max-height:260px;overflow:auto">
        <table>
          <tr><th>时间(s)</th><th>步频</th><th>触地时长(ms)</th><th>判定</th><th></th></tr>
          ${editAnim.metrics.map((m, i) => {
            const bad = m.cadence < CAD_MIN || m.cadence > CAD_MAX;
            return `<tr>
              <td><input type="number" data-m="t" data-i="${i}" value="${m.t}" step="1" style="width:70px"></td>
              <td><input type="number" data-m="cadence" data-i="${i}" value="${m.cadence}" style="width:70px"></td>
              <td><input type="number" data-m="contact" data-i="${i}" value="${m.contact}" style="width:70px"></td>
              <td>${bad ? '<span class="chip severe">超区间</span>' : '<span class="chip ok">正常</span>'}</td>
              <td><button class="sm danger" data-del="${i}">删</button></td>
            </tr>`;
          }).join('')}
        </table>
        </div>
        <div class="toolbar" style="margin-top:8px"><button class="sm" id="add-row">＋ 添加采样点</button></div>
      </div>`;

    this.drawCharts(sel);
    this.wire(editAnim);
  }

  private drawCharts(sel: Anim[]): void {
    this.drawChart('#chart-cadence', sel, 'cadence', '步频', true);
    this.drawChart('#chart-contact', sel, 'contact', '触地时长(ms)', false);
  }

  private drawChart(selector: string, anims: Anim[], key: 'cadence' | 'contact', label: string, withBand: boolean): void {
    const host = this.querySelector(selector) as HTMLElement;
    if (!host) return;
    host.innerHTML = '';
    const W = Math.max(420, host.clientWidth || 640), H = 240;
    const M = { t: 20, r: 130, b: 30, l: 44 };
    const svg = d3.select(host).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const all = anims.flatMap(a => a.metrics);
    if (!all.length) { svg.append('text').attr('x', 20).attr('y', 40).text('暂无数据'); return; }
    const x = d3.scaleLinear().domain([0, d3.max(all, (d: any) => d.t)]).range([M.l, W - M.r]).nice();
    const yMin = d3.min(all, (d: any) => d[key]);
    const yMax = d3.max(all, (d: any) => d[key]);
    const y = d3.scaleLinear()
      .domain([Math.min(yMin, withBand ? CAD_MIN : yMin) - 5, Math.max(yMax, withBand ? CAD_MAX : yMax) + 5])
      .range([H - M.b, M.t]).nice();

    if (withBand) {
      svg.append('rect')
        .attr('x', M.l).attr('width', W - M.r - M.l)
        .attr('y', y(CAD_MAX)).attr('height', y(CAD_MIN) - y(CAD_MAX))
        .attr('fill', '#dcfce7').attr('opacity', 0.7);
      svg.append('text').attr('x', M.l + 6).attr('y', y(CAD_MAX) + 14)
        .attr('font-size', 11).attr('fill', '#16a34a').text(`合格区间 ${CAD_MIN}–${CAD_MAX}`);
    }
    svg.append('g').attr('transform', `translate(0,${H - M.b})`).call(d3.axisBottom(x).ticks(8));
    svg.append('g').attr('transform', `translate(${M.l},0)`).call(d3.axisLeft(y).ticks(6));
    svg.append('text').attr('x', M.l).attr('y', 12).attr('font-size', 11).attr('fill', '#64748b').text(label);

    const colors = d3.scaleOrdinal(d3.schemeCategory10);
    const line = d3.line().x((d: any) => x(d.t)).y((d: any) => y(d[key]));
    anims.forEach((a, ai) => {
      const c = colors(ai);
      const pts = [...a.metrics].sort((p, q) => p.t - q.t);
      svg.append('path').datum(pts).attr('d', line)
        .attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2);
      svg.selectAll(null).data(pts).join('circle')
        .attr('cx', (d: any) => x(d.t)).attr('cy', (d: any) => y(d[key]))
        .attr('r', (d: any) => (withBand && (d.cadence < CAD_MIN || d.cadence > CAD_MAX)) ? 5 : 3)
        .attr('fill', (d: any) => (withBand && (d.cadence < CAD_MIN || d.cadence > CAD_MAX)) ? '#dc2626' : c)
        .attr('stroke', '#fff').attr('stroke-width', 1)
        .append('title').text((d: any) => `${a.name} t=${d.t}s ${label}=${d[key]}`);
      svg.append('rect').attr('x', W - M.r + 14).attr('y', M.t + ai * 20).attr('width', 10).attr('height', 10).attr('fill', c);
      svg.append('text').attr('x', W - M.r + 28).attr('y', M.t + ai * 20 + 9).attr('font-size', 11).text(a.name);
    });
  }

  private wire(editAnim: Anim): void {
    this.querySelectorAll('[data-chk]').forEach(c => c.addEventListener('change', () => {
      const id = (c as HTMLElement).dataset.chk!;
      if ((c as HTMLInputElement).checked) this.checked.add(id); else this.checked.delete(id);
      this.render();
    }));
    this.querySelector('#edit-sel')?.addEventListener('change', e => {
      this.editId = (e.target as HTMLSelectElement).value;
      this.render();
    });
    this.querySelectorAll('[data-m]').forEach(inp => inp.addEventListener('change', () => {
      const el = inp as HTMLInputElement;
      const i = +el.dataset.i!;
      const field = el.dataset.m as 't' | 'cadence' | 'contact';
      const v = +el.value || 0;
      update(s => {
        const a = s.anims.find(x => x.id === editAnim.id)!;
        a.metrics[i][field] = v;
        a.metrics.sort((p, q) => p.t - q.t);
      });
    }));
    this.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const i = +(b as HTMLElement).dataset.del!;
      update(s => { s.anims.find(x => x.id === editAnim.id)!.metrics.splice(i, 1); });
    }));
    this.querySelector('#add-row')?.addEventListener('click', () => {
      update(s => {
        const a = s.anims.find(x => x.id === editAnim.id)!;
        const lastT = a.metrics.length ? Math.max(...a.metrics.map(m => m.t)) : 0;
        a.metrics.push({ t: lastT + 5, cadence: 190, contact: 200 });
      });
    });
  }
}
customElements.define('x-metrics', Metrics);
