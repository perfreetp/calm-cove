import { FLOOR_H, FLOOR_W, QC_STATIONS } from '../factory.js';
import { STATUS_LABEL, fmtLux, sampleCount, totalPieces } from '../domain.js';
import { store } from '../store.js';
import type { WorkOrder } from '../types.js';

export class QcDesk extends HTMLElement {
  connectedCallback(): void {
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const queue = store.orders.filter((o) => o.status === 'submitted');
    const history = store.orders.filter((o) =>
      ['qc_passed', 'rejected', 'done'].includes(o.status)).slice(0, 10);

    this.innerHTML = `
      <div class="qc-wrap">
        <section class="panel">
          <h3>待质检工单（${queue.length}）</h3>
          <p class="hint">规则：按总件数 5% 抽查（小单 ≤20 件全检）；不合格打回并记录返洗原因。质检在关联布光方案的质检台上进行。</p>
          ${queue.length === 0 ? '<p class="hint">队列为空</p>' : queue.map((o) => this.qcCard(o)).join('')}
        </section>
        <section class="panel">
          <h3>质检记录</h3>
          <table class="order-table">
            <thead><tr><th>工单</th><th>酒店</th><th>抽查</th><th>质检台/方案</th><th>结果</th><th>返洗原因</th></tr></thead>
            <tbody>
              ${history.map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${o.qcSampled ? `${sampleCount(o)}/${totalPieces(o)}` : '—'}</td>
                  <td>${this.planText(o)}</td>
                  <td><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></td>
                  <td>${o.rewashes.at(-1)?.reason ?? '—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>
      </div>`;

    this.querySelectorAll<HTMLElement>('[data-act="pass"]').forEach((btn) => {
      btn.addEventListener('click', () => this.pass(btn.dataset.order!));
    });
    this.querySelectorAll<HTMLElement>('[data-act="reject"]').forEach((btn) => {
      btn.addEventListener('click', () => this.reject(btn.dataset.order!));
    });
  }

  private planText(o: WorkOrder): string {
    const plan = store.plans.find((p) => p.id === o.qcPlanId);
    const station = QC_STATIONS.find((q) => q.id === plan?.qcStationId);
    if (!plan) return '—';
    const lux = this.stationLux(plan.qcStationId);
    return `${plan.name} / ${station?.name ?? '未绑定'}${lux !== null ? `（${fmtLux(lux)}lux）` : ''}`;
  }

  private stationLux(stationId?: string): number | null {
    if (!stationId || !store.lastResult) return null;
    const st = QC_STATIONS.find((q) => q.id === stationId);
    if (!st) return null;
    // 取质检台中心像素 lux
    const cx = Math.floor((st.x + st.w / 2) * (store.lastResult.width / FLOOR_W));
    const cy = Math.floor((st.y + st.h / 2) * (store.lastResult.height / FLOOR_H));
    return store.lastResult.lux[cy * store.lastResult.width + cx] ?? null;
  }

  private qcCard(o: WorkOrder): string {
    const n = sampleCount(o);
    const darkWarn = store.lastResult?.darkAreas.some((d) => d.kind === 'qc') ?? false;
    return `
      <div class="qc-card">
        <header>
          <b>${o.id}</b> <span>${o.hotelName}</span>
          <span class="tag">应抽查 ${n} 件 / 共 ${totalPieces(o)} 件（5%）</span>
        </header>
        <div class="qc-photo">
          ${o.wash?.photoDataUrl
            ? `<img src="${o.wash.photoDataUrl}" alt="洗涤照片">`
            : '<span class="hint">无照片</span>'}
          <div class="wash-meta">
            <p>水温 <b>${o.wash?.waterTemp}℃</b> · 时长 <b>${o.wash?.duration}min</b> · 洗涤剂 <b>${o.wash?.detergentMl}ml</b></p>
            <p class="hint">提交于 ${o.wash?.submittedAt.replace('T', ' ')}</p>
          </div>
        </div>
        <div class="qc-form">
          <label>质检所用布光方案（关联质检台）
            <select data-role="plan" data-order="${o.id}">
              ${store.plans.map((p) => {
                const st = QC_STATIONS.find((q) => q.id === p.qcStationId);
                const lux = this.stationLux(p.qcStationId);
                return `<option value="${p.id}" ${p.id === store.activePlanId ? 'selected' : ''}>
                  ${p.name} — ${st?.name ?? '未绑定质检台'}${lux !== null ? ` · ${fmtLux(lux)}lux` : ''}
                </option>`;
              }).join('')}
            </select>
          </label>
          ${darkWarn ? '<p class="warn">⚠ 当前方案存在低于 300lux 的质检暗区，请注意补光后再检</p>' : ''}
          <div class="qc-buttons">
            <button class="btn btn-primary" data-act="pass" data-order="${o.id}">✓ 抽检合格</button>
            <button class="btn btn-danger" data-act="reject" data-order="${o.id}">✕ 不合格打回</button>
          </div>
        </div>
      </div>`;
  }

  private pass(orderId: string): void {
    const order = store.orders.find((o) => o.id === orderId)!;
    const planSel = this.querySelector<HTMLSelectElement>(`[data-role="plan"][data-order="${orderId}"]`);
    order.qcSampled = true;
    order.qcPlanId = planSel?.value;
    order.status = order.rewashes.length > 0 ? 'done' : 'qc_passed';
    store.upsertOrder(order);
  }

  private reject(orderId: string): void {
    const reason = prompt('请填写返洗原因（污渍残留 / 破损 / 异味 / 其他）', '污渍残留');
    if (!reason) return;
    const order = store.orders.find((o) => o.id === orderId)!;
    const planSel = this.querySelector<HTMLSelectElement>(`[data-role="plan"][data-order="${orderId}"]`);
    order.qcSampled = true;
    order.qcPlanId = planSel?.value;
    order.status = 'rejected';
    order.rewashes.push({ reason, at: new Date().toISOString().slice(0, 16) });
    store.upsertOrder(order);
  }
}
