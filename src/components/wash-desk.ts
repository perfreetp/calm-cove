import { STATUS_LABEL, totalPieces } from '../domain.js';
import { store } from '../store.js';
import type { WorkOrder } from '../types.js';

export class WashDesk extends HTMLElement {
  private workerId = store.workers[0]?.id ?? '';
  private photo = '';
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;

  connectedCallback(): void {
    store.subscribe(() => this.render());
    this.render();
  }

  disconnectedCallback(): void {
    this.stopCamera();
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  private myOrders(): WorkOrder[] {
    return store.orders.filter((o) =>
      o.workerId === this.workerId
      && (o.status === 'assigned' || o.status === 'washing' || o.status === 'rejected'));
  }

  private render(): void {
    const list = this.myOrders();
    this.innerHTML = `
      <div class="wash-wrap">
        <section class="panel">
          <h3>师傅登录</h3>
          <label>选择师傅
            <select data-role="worker">
              ${store.workers.map((w) => `<option value="${w.id}" ${w.id === this.workerId ? 'selected' : ''}>${w.name}</option>`).join('')}
            </select>
          </label>
        </section>
        <section class="panel">
          <h3>我的洗涤任务（${list.length}）</h3>
          ${list.length === 0 ? '<p class="hint">当前没有待洗工单</p>' : list.map((o) => `
            <div class="wash-card" data-order="${o.id}">
              <header>
                <b>${o.id}</b> <span>${o.hotelName}</span>
                <span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span>
                ${o.rewashes.length ? `<span class="rewash-badge">返洗 ×${o.rewashes.length}</span>` : ''}
              </header>
              <p class="hint">${o.items.map((i) => `${i.category}×${i.count}（${i.stain}）`).join('，')} · 共 ${totalPieces(o)} 件</p>
              ${o.rewashes.length ? `<p class="rewash-reason">上次返洗原因：${o.rewashes[o.rewashes.length - 1].reason}</p>` : ''}
              <div class="wash-actions">
                ${o.status === 'assigned' || o.status === 'rejected'
                  ? '<button class="btn btn-primary" data-act="start">开始洗涤</button>'
                  : '<button class="btn btn-primary" data-act="submit-open">洗完提交</button>'}
              </div>
            </div>`).join('')}
        </section>
      </div>`;

    (this.querySelector('[data-role="worker"]')!).addEventListener('change', (e) => {
      this.workerId = (e.target as HTMLSelectElement).value;
      this.render();
    });

    this.querySelectorAll('[data-act="start"]').forEach((b) => {
      b.addEventListener('click', () => {
        const order = this.findOrder(b);
        order.status = 'washing';
        store.upsertOrder(order);
      });
    });
    this.querySelectorAll('[data-act="submit-open"]').forEach((b) => {
      b.addEventListener('click', () => this.openSubmit(this.findOrder(b)));
    });
  }

  private findOrder(b: Element): WorkOrder {
    const id = (b.closest('.wash-card') as HTMLElement).dataset.order!;
    return store.orders.find((o) => o.id === id)!;
  }

  private openSubmit(order: WorkOrder): void {
    const modal = document.createElement('div');
    modal.className = 'modal-mask';
    modal.innerHTML = `
      <div class="modal">
        <h3>洗涤提交 — ${order.id}</h3>
        <div class="camera-box">
          <video data-role="video" autoplay playsinline class="${this.photo ? 'hidden' : ''}"></video>
          <img data-role="preview" class="${this.photo ? '' : 'hidden'}" src="${this.photo}">
          <div class="camera-actions">
            <button class="btn" data-cam="on">开启摄像头</button>
            <button class="btn" data-cam="shot" disabled>拍照</button>
            <label class="btn">上传照片<input type="file" accept="image/*" data-cam="file" hidden></label>
          </div>
        </div>
        <div class="form-grid">
          <label>水温 (℃)
            <input type="number" min="20" max="100" value="70" data-role="temp">
          </label>
          <label>洗涤时长 (min)
            <input type="number" min="5" max="180" value="45" data-role="duration">
          </label>
          <label>洗涤剂用量 (ml)
            <input type="number" min="10" max="2000" value="150" data-role="detergent">
          </label>
        </div>
        <p class="hint" data-role="photo-hint">${this.photo ? '✓ 已拍摄/上传照片' : '请拍照或上传洗涤后照片'}</p>
        <div class="modal-actions">
          <button class="btn" data-act="cancel">取消</button>
          <button class="btn btn-primary" data-act="confirm">提交质检</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const video = modal.querySelector<HTMLVideoElement>('[data-role="video"]')!;
    const preview = modal.querySelector<HTMLImageElement>('[data-role="preview"]')!;
    this.videoEl = video;

    modal.querySelector('[data-cam="on"]')!.addEventListener('click', async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = this.stream;
        (modal.querySelector('[data-cam="shot"]') as HTMLButtonElement).disabled = false;
      } catch {
        alert('无法访问摄像头（可用「上传照片」代替）');
      }
    });

    modal.querySelector('[data-cam="shot"]')!.addEventListener('click', () => {
      const cv = document.createElement('canvas');
      const vw = video.videoWidth || 640;
      const scale = Math.min(1, 640 / vw);
      cv.width = vw * scale;
      cv.height = (video.videoHeight || 480) * scale;
      cv.getContext('2d')!.drawImage(video, 0, 0, cv.width, cv.height);
      this.photo = cv.toDataURL('image/jpeg', 0.7);
      preview.src = this.photo;
      preview.classList.remove('hidden');
      video.classList.add('hidden');
      (modal.querySelector('[data-role="photo-hint"]') as HTMLElement).textContent = '✓ 已拍照';
      this.stopCamera();
    });

    modal.querySelector<HTMLInputElement>('[data-cam="file"]')!.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        const scale = Math.min(1, 640 / img.width);
        cv.width = img.width * scale;
        cv.height = img.height * scale;
        cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
        this.photo = cv.toDataURL('image/jpeg', 0.7);
        preview.src = this.photo;
        preview.classList.remove('hidden');
        video.classList.add('hidden');
        (modal.querySelector('[data-role="photo-hint"]') as HTMLElement).textContent = '✓ 已上传照片';
      };
      img.src = URL.createObjectURL(file);
    });

    modal.querySelector('[data-act="cancel"]')!.addEventListener('click', () => {
      this.stopCamera();
      modal.remove();
    });
    modal.querySelector('[data-act="confirm"]')!.addEventListener('click', () => {
      if (!this.photo) return alert('请先拍照或上传照片');
      const temp = Number((modal.querySelector('[data-role="temp"]') as HTMLInputElement).value);
      const duration = Number((modal.querySelector('[data-role="duration"]') as HTMLInputElement).value);
      const detergentMl = Number((modal.querySelector('[data-role="detergent"]') as HTMLInputElement).value);
      if (!(temp >= 20 && duration >= 5 && detergentMl >= 10)) return alert('请检查洗涤参数');

      order.status = 'submitted';
      order.wash = {
        waterTemp: temp,
        duration,
        detergentMl,
        photoDataUrl: this.photo,
        submittedAt: new Date().toISOString().slice(0, 16),
      };
      store.upsertOrder(order);
      this.photo = '';
      this.stopCamera();
      modal.remove();
    });
  }
}
