import { FIXTURE_CSV_HEADER, planCsvRows } from './lighting-studio.js';
import { boardStats, exportCsv, fmtLux, workerKpis } from '../domain.js';
import { store } from '../store.js';
import { ZONES } from '../factory.js';

export class Dashboard extends HTMLElement {
  connectedCallback(): void {
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const stats = boardStats(store.orders, store.lastResult);
    const kpis = workerKpis(store.orders, store.workers);
    const maxDone = Math.max(1, ...kpis.map((k) => k.completed));

    this.innerHTML = `
      <div class="board-wrap">
        <div class="kpi-row">
          ${this.kpi('工单总数', String(stats.totalOrders), '单')}
          ${this.kpi('在手工单', String(stats.activeOrders), '单')}
          ${this.kpi('今日合格', String(stats.passedToday), '单')}
          ${this.kpi('整体返洗率', (stats.rewashRateAll * 100).toFixed(1), '%', stats.rewashRateAll > 0.15)}
          ${this.kpi('暗区数量', String(stats.darkAreas.length), '处', stats.darkAreas.length > 0)}
          ${this.kpi('平均照度达标率', (stats.avgCompliance * 100).toFixed(1), '%', stats.avgCompliance < 0.85)}
        </div>

        <section class="panel">
          <h3>各师傅日完成量 / 返洗率</h3>
          <div class="bar-chart">
            ${kpis.map((k) => `
              <div class="bar-row">
                <span class="bar-name">${k.name}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${(k.completed / maxDone) * 100}%"></div>
                </div>
                <span class="bar-val">${k.completed} 单</span>
                <span class="bar-rate ${k.rewashRate > 0.15 ? 'bad' : ''}">
                  返洗率 ${(k.rewashRate * 100).toFixed(0)}%（${k.rewashed} 次）
                </span>
              </div>`).join('')}
          </div>
        </section>

        <section class="panel">
          <h3>区域照度达标率（当前时段 ${String(store.hour).padStart(2, '0')}:00）</h3>
          <table class="order-table">
            <thead><tr><th>区域</th><th>平均照度</th><th>阈值</th><th>达标率</th><th>状态</th></tr></thead>
            <tbody>
              ${stats.zoneCompliance.map((z) => `
                <tr>
                  <td>${z.name}</td>
                  <td>${fmtLux(z.avgLux)} lux</td>
                  <td>${z.threshold} lux</td>
                  <td>
                    <div class="mini-track"><div class="mini-fill ${z.compliance < 0.85 ? 'low' : ''}"
                      style="width:${(z.compliance * 100).toFixed(1)}%"></div></div>
                    ${(z.compliance * 100).toFixed(1)}%
                  </td>
                  <td>${stats.darkAreas.some((d) => d.name === z.name)
                    ? '<span class="status status-rejected">暗区</span>'
                    : '<span class="status status-qc_passed">达标</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h3>导出</h3>
          <div class="export-row">
            <button class="btn btn-primary" data-act="export-plan">导出布光点位表（CSV）</button>
            <button class="btn btn-primary" data-act="export-orders">导出工单明细（CSV）</button>
          </div>
          <p class="hint">布光方案与工单分开存储，工单通过「质检台布光方案 ID」与点位方案关联。</p>
        </section>
      </div>`;

    this.querySelector('[data-act="export-plan"]')!.addEventListener('click', () => {
      const plan = store.activePlan;
      exportCsv(`布光点位表_${plan.name}.csv`, FIXTURE_CSV_HEADER, planCsvRows(plan));
    });

    this.querySelector('[data-act="export-orders"]')!.addEventListener('click', () => {
      const header = [
        '工单号', '酒店', '布草明细', '总件数', '取件时间', '区域', '班次', '师傅',
        '状态', '水温(℃)', '时长(min)', '洗涤剂(ml)', '是否抽查', '质检方案ID', '返洗次数', '返洗原因',
      ];
      const rows = store.orders.map((o) => [
        o.id,
        o.hotelName,
        o.items.map((i) => `${i.category}x${i.count}(${i.stain})`).join(';'),
        o.items.reduce((s, i) => s + i.count, 0),
        o.pickupTime.replace('T', ' '),
        ZONES.find((z) => z.id === o.zoneId)?.name ?? '',
        o.shift === 'day' ? '白班' : o.shift === 'evening' ? '晚班' : '',
        store.workers.find((w) => w.id === o.workerId)?.name ?? '',
        o.status,
        o.wash?.waterTemp ?? '',
        o.wash?.duration ?? '',
        o.wash?.detergentMl ?? '',
        o.qcSampled ? '是' : '否',
        o.qcPlanId ?? '',
        o.rewashes.length,
        o.rewashes.map((r) => r.reason).join(';'),
      ]);
      exportCsv(`工单明细_${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
    });
  }

  private kpi(label: string, value: string, unit: string, warn = false): string {
    return `
      <div class="kpi-card ${warn ? 'warn' : ''}">
        <span class="kpi-label">${label}</span>
        <span class="kpi-value">${value}<small>${unit}</small></span>
      </div>`;
  }
}
