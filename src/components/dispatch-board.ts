import { SHIFT_LABEL, ZONES } from '../factory.js';
import { STATUS_LABEL, totalPieces, zoneName } from '../domain.js';
import { store } from '../store.js';
import type { ShiftId, WorkOrder } from '../types.js';

export class DispatchBoard extends HTMLElement {
  private filterZone = 'all';
  private filterShift: ShiftId | 'all' = 'all';

  connectedCallback(): void {
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const pending = store.orders.filter((o) => o.status === 'pending');
    const others = store.orders.filter((o) => o.status !== 'pending');
    this.innerHTML = `
      <div class="dispatch-wrap">
        <section class="panel">
          <h3>待分派工单（${pending.length}）</h3>
          <div class="filter-bar">
            <label>区域
              <select data-role="f-zone">
                <option value="all">全部</option>
                ${ZONES.map((z) => `<option value="${z.id}" ${this.filterZone === z.id ? 'selected' : ''}>${z.name}</option>`).join('')}
              </select>
            </label>
            <label>班次
              <select data-role="f-shift">
                <option value="all">全部</option>
                <option value="day" ${this.filterShift === 'day' ? 'selected' : ''}>白班</option>
                <option value="evening" ${this.filterShift === 'evening' ? 'selected' : ''}>晚班</option>
              </select>
            </label>
          </div>
          ${pending.length === 0 ? '<p class="hint">暂无待分派工单</p>' : pending.map((o) => this.orderCard(o)).join('')}
        </section>
        <section class="panel">
          <h3>师傅排班与在手工单</h3>
          <div class="worker-grid">
            ${store.workers.map((w) => {
              const mine = store.orders.filter((o) => o.workerId === w.id
                && ['assigned', 'washing', 'submitted', 'rejected'].includes(o.status));
              return `
                <div class="worker-card">
                  <header><b>${w.name}</b>
                    <span class="tag">${zoneName(w.zoneId)} · ${w.shift === 'day' ? '白班' : '晚班'}</span>
                  </header>
                  <p class="hint">在手 ${mine.length} 单 · ${mine.reduce((s, o) => s + totalPieces(o), 0)} 件</p>
                  <ul>${mine.map((o) => `<li>${o.id} <em>${STATUS_LABEL[o.status]}</em></li>`).join('') || '<li class="hint">空闲</li>'}</ul>
                </div>`;
            }).join('')}
          </div>
        </section>
        <section class="panel">
          <h3>已分派工单（${others.length}）</h3>
          <table class="order-table">
            <thead><tr><th>工单号</th><th>酒店</th><th>区域</th><th>班次</th><th>师傅</th><th>状态</th></tr></thead>
            <tbody>
              ${others.map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${zoneName(o.zoneId)}</td>
                  <td>${o.shift ? SHIFT_LABEL[o.shift].split(' ')[0] : '—'}</td>
                  <td>${store.workers.find((w) => w.id === o.workerId)?.name ?? '—'}</td>
                  <td><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>
      </div>`;

    (this.querySelector('[data-role="f-zone"]')!).addEventListener('change', (e) => {
      this.filterZone = (e.target as HTMLSelectElement).value;
      this.render();
    });
    (this.querySelector('[data-role="f-shift"]')!).addEventListener('change', (e) => {
      this.filterShift = (e.target as HTMLSelectElement).value as ShiftId | 'all';
      this.render();
    });
    this.querySelectorAll<HTMLSelectElement>('[data-role="assign"]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const order = store.orders.find((o) => o.id === sel.dataset.order);
        if (!order || !sel.value) return;
        const [zoneId, shift, workerId] = sel.value.split('|');
        order.zoneId = zoneId;
        order.shift = shift as ShiftId;
        order.workerId = workerId;
        order.status = 'assigned';
        store.upsertOrder(order);
      });
    });
  }

  private orderCard(o: WorkOrder): string {
    const candidates = store.workers.filter((w) =>
      (this.filterZone === 'all' || w.zoneId === this.filterZone)
      && (this.filterShift === 'all' || w.shift === this.filterShift));
    return `
      <div class="order-card">
        <div class="oc-head">
          <b>${o.id}</b> <span>${o.hotelName}</span>
          <em>取件 ${o.pickupTime.replace('T', ' ')}</em>
        </div>
        <div class="oc-items">
          ${o.items.map((i) => `<span class="linen-tag">${i.category} ×${i.count}（${i.stain}）</span>`).join('')}
          <span class="linen-tag total">共 ${totalPieces(o)} 件</span>
        </div>
        <div class="oc-assign">
          <label>分派给
            <select data-role="assign" data-order="${o.id}">
              <option value="">请选择区域/班次/师傅…</option>
              ${candidates.map((w) => `
                <option value="${w.zoneId}|${w.shift}|${w.id}">
                  ${zoneName(w.zoneId)} · ${w.shift === 'day' ? '白班' : '晚班'} · ${w.name}
                </option>`).join('')}
            </select>
          </label>
        </div>
      </div>`;
  }
}
