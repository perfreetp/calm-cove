import { store, uid } from '../store.js';
import type { LinenCategory, LinenItem, StainType, WorkOrder } from '../types.js';

const CATEGORIES: LinenCategory[] = ['床单', '被套', '枕套', '毛巾', '浴巾', '台布', '工服'];
const STAINS: StainType[] = ['一般', '血渍', '油渍', '茶渍', '食物', '霉斑'];

export class FrontDesk extends HTMLElement {
  private items: LinenItem[] = [{ category: '床单', count: 50, stain: '一般' }];

  connectedCallback(): void {
    this.render();
  }

  private render(): void {
    this.innerHTML = `
      <div class="fd-wrap">
        <section class="panel form-panel">
          <h3>酒店送洗单录入</h3>
          <div class="form-grid">
            <label>酒店名称
              <input data-role="hotel" placeholder="如：锦江国际大酒店" list="hotel-list">
              <datalist id="hotel-list">
                ${[...new Set(store.orders.map((o) => o.hotelName))].map((h) => `<option value="${h}">`).join('')}
              </datalist>
            </label>
            <label>取件时间
              <input type="datetime-local" data-role="pickup">
            </label>
          </div>
          <h4>布草明细</h4>
          <table class="item-table" data-role="items"></table>
          <div class="row-actions">
            <button class="btn" data-act="add-item">＋ 添加品类</button>
            <span class="hint">支持多品类：床单/被套/枕套/毛巾/浴巾/台布/工服</span>
          </div>
          <div class="submit-row">
            <strong>合计 <span data-role="total">0</span> 件</strong>
            <button class="btn btn-primary" data-act="submit">生成工单</button>
          </div>
        </section>
        <section class="panel">
          <h3>最近录入（${store.orders.length}）</h3>
          <table class="order-table">
            <thead><tr><th>工单号</th><th>酒店</th><th>件数</th><th>取件</th><th>状态</th></tr></thead>
            <tbody>
              ${store.orders.slice(0, 8).map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${o.items.reduce((s, i) => s + i.count, 0)}</td>
                  <td>${o.pickupTime.replace('T', ' ')}</td>
                  <td><span class="status status-${o.status}">${statusText(o.status)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </section>
      </div>`;

    const defaultPickup = new Date();
    defaultPickup.setHours(18, 0, 0, 0);
    (this.querySelector('[data-role="pickup"]') as HTMLInputElement).value =
      defaultPickup.toISOString().slice(0, 16);

    this.drawItems();
    this.querySelector('[data-act="add-item"]')!.addEventListener('click', () => {
      this.items.push({ category: '毛巾', count: 10, stain: '一般' });
      this.drawItems();
    });
    this.querySelector('[data-act="submit"]')!.addEventListener('click', () => this.submit());
  }

  private drawItems(): void {
    const t = this.querySelector('[data-role="items"]')!;
    t.innerHTML = `
      <thead><tr><th>品类</th><th>数量</th><th>污渍类型</th><th></th></tr></thead>
      <tbody>
        ${this.items.map((it, i) => `
          <tr>
            <td><select data-i="${i}" data-f="category">
              ${CATEGORIES.map((c) => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}
            </select></td>
            <td><input type="number" min="1" value="${it.count}" data-i="${i}" data-f="count"></td>
            <td><select data-i="${i}" data-f="stain">
              ${STAINS.map((s) => `<option ${s === it.stain ? 'selected' : ''}>${s}</option>`).join('')}
            </select></td>
            <td><button class="btn btn-danger btn-sm" data-act="del" data-i="${i}">删</button></td>
          </tr>`).join('')}
      </tbody>`;
    t.querySelectorAll<HTMLInputElement>('[data-f]').forEach((el) => {
      el.addEventListener('input', () => {
        const i = Number(el.dataset.i);
        const f = el.dataset.f! as keyof LinenItem;
        if (f === 'count') this.items[i].count = Math.max(1, Number(el.value) || 1);
        else if (f === 'category') this.items[i].category = el.value as LinenCategory;
        else this.items[i].stain = el.value as StainType;
        this.updateTotal();
      });
    });
    t.querySelectorAll('[data-act="del"]').forEach((b) => {
      b.addEventListener('click', () => {
        this.items.splice(Number((b as HTMLElement).dataset.i), 1);
        if (this.items.length === 0) this.items.push({ category: '床单', count: 1, stain: '一般' });
        this.drawItems();
      });
    });
    this.updateTotal();
  }

  private updateTotal(): void {
    const el = this.querySelector('[data-role="total"]');
    if (el) el.textContent = String(this.items.reduce((s, i) => s + i.count, 0));
  }

  private submit(): void {
    const hotel = (this.querySelector('[data-role="hotel"]') as HTMLInputElement).value.trim();
    const pickup = (this.querySelector('[data-role="pickup"]') as HTMLInputElement).value;
    if (!hotel) return alert('请填写酒店名称');
    if (!pickup) return alert('请选择取件时间');
    if (this.items.some((i) => i.count <= 0)) return alert('数量必须大于 0');

    const now = new Date().toISOString().slice(0, 16);
    const order: WorkOrder = {
      id: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(store.orders.length + 1).padStart(3, '0')}`,
      hotelName: hotel,
      items: structuredClone(this.items),
      pickupTime: pickup,
      status: 'pending',
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now,
    };
    store.upsertOrder(order);
    this.items = [{ category: '床单', count: 50, stain: '一般' }];
    this.render();
    alert(`工单 ${order.id} 已创建，请到「工单分派」按区域和班次派给师傅`);
  }
}

function statusText(s: WorkOrder['status']): string {
  return {
    pending: '待分派', assigned: '已分派', washing: '洗涤中', submitted: '待质检',
    qc_passed: '合格', rejected: '返洗', done: '完成',
  }[s];
}
