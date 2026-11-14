import {
  FLOOR_H, FLOOR_W, OBSTACLES, QC_STATIONS, SIM_H, SIM_W, WINDOWS, ZONES, newFixture,
} from '../factory.js';
import { LEGEND, cctToRgb, daylightCct, heatColor } from '../lighting.js';
import { store, uid } from '../store.js';
import type { Fixture, FixtureKind, LightingPlan } from '../types.js';
import { fmtLux } from '../domain.js';

const KIND_LABEL: Record<FixtureKind, string> = {
  ceiling: '顶灯',
  task: '工位灯',
  wallwash: '洗墙灯',
};

export class LightingStudio extends HTMLElement {
  private heatCanvas!: HTMLCanvasElement;
  private overlay!: HTMLCanvasElement;
  private octx!: CanvasRenderingContext2D;
  private scale = 26;
  private selectedId: string | null = null;
  private dragging = false;
  private hover: { x: number; y: number } | null = null;
  private showHeat = true;
  private unsubscribe = () => {};

  connectedCallback(): void {
    this.innerHTML = `
      <div class="studio-wrap">
        <div class="studio-left">
          <div class="plan-bar">
            <label>布光方案
              <select data-role="plan-select"></select>
            </label>
            <button data-act="add-plan" class="btn">另存新方案</button>
            <button data-act="del-plan" class="btn btn-danger">删除</button>
            <label class="chk"><input type="checkbox" data-role="heat-toggle" checked> 照度色阶</label>
            <span class="spacer"></span>
            <label>关联质检台
              <select data-role="qc-select"></select>
            </label>
          </div>
          <div class="canvas-stack" data-role="stack">
            <canvas class="heat-canvas" data-role="heat" width="${SIM_W}" height="${SIM_H}"></canvas>
            <canvas class="overlay-canvas" data-role="overlay"></canvas>
          </div>
          <div class="legend" data-role="legend"></div>
          <div class="time-bar">
            <span>🌅 08:00</span>
            <input type="range" min="8" max="20" step="1" value="${store.hour}" data-role="hour">
            <span>🌙 20:00</span>
            <strong data-role="hour-label"></strong>
            <span data-role="daylight" class="daylight-tag"></span>
          </div>
        </div>
        <div class="studio-right">
          <section class="panel">
            <h3>灯具库</h3>
            <div class="add-fixture">
              <button class="btn" data-add="ceiling">＋ 顶灯</button>
              <button class="btn" data-add="task">＋ 工位灯</button>
              <button class="btn" data-add="wallwash">＋ 洗墙灯</button>
            </div>
            <p class="hint">在平面图上拖动灯具实时重算；洗墙灯点击后可改指向。</p>
          </section>
          <section class="panel" data-role="fixture-panel"></section>
          <section class="panel dark-panel">
            <h3>暗区清单 <em data-role="dark-count"></em></h3>
            <ul data-role="dark-list" class="dark-list"></ul>
            <h3>区域照度</h3>
            <table class="zone-table" data-role="zone-table"></table>
          </section>
        </div>
      </div>
    `;

    this.heatCanvas = this.querySelector('[data-role="heat"]')!;
    this.overlay = this.querySelector('[data-role="overlay"]')!;
    this.octx = this.overlay.getContext('2d')!;

    this.bindEvents();
    this.unsubscribe = store.subscribe(() => this.render());
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.querySelector('[data-role="stack"]')!);
    store.scheduleCompute();
    this.render();
  }

  disconnectedCallback(): void {
    this.unsubscribe();
  }

  // ---------------- 事件 ----------------
  private bindEvents(): void {
    this.querySelector('[data-role="hour"]')!.addEventListener('input', (e) => {
      store.setHour(Number((e.target as HTMLInputElement).value));
    });

    this.querySelector('[data-role="heat-toggle"]')!.addEventListener('change', (e) => {
      this.showHeat = (e.target as HTMLInputElement).checked;
      this.drawOverlay();
    });

    this.querySelector('[data-role="plan-select"]')!.addEventListener('change', (e) => {
      store.selectPlan((e.target as HTMLSelectElement).value);
      this.selectedId = null;
    });

    this.querySelector('[data-act="add-plan"]')!.addEventListener('click', () => {
      const name = prompt('新布光方案名称', `方案 ${store.plans.length + 1}`);
      if (name) store.addPlan(name);
    });

    this.querySelector('[data-act="del-plan"]')!.addEventListener('click', () => {
      if (confirm(`删除方案「${store.activePlan.name}」？`)) {
        store.removePlan(store.activePlan.id);
        this.selectedId = null;
      }
    });

    this.querySelector('[data-role="qc-select"]')!.addEventListener('change', (e) => {
      store.updatePlan((p) => { p.qcStationId = (e.target as HTMLSelectElement).value; });
    });

    this.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = (btn as HTMLElement).dataset.add! as FixtureKind;
        const fx = newFixture(kind, FLOOR_W / 2, FLOOR_H / 2);
        if (kind === 'wallwash') fx.aim = { x: fx.x, y: fx.y - 3 };
        store.updatePlan((p) => p.fixtures.push(fx));
        this.selectedId = fx.id;
      });
    });

    // 画布交互（主线程只画交互层）
    this.overlay.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', () => { this.dragging = false; });
  }

  private eventPos(e: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = this.overlay.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / this.scale,
      y: (e.clientY - r.top) / this.scale,
    };
  }

  private hitFixture(x: number, y: number): Fixture | null {
    const fxs = store.activePlan.fixtures;
    for (let i = fxs.length - 1; i >= 0; i--) {
      const fx = fxs[i];
      if (Math.hypot(fx.x - x, fx.y - y) <= 0.7) return fx;
    }
    return null;
  }

  private onPointerDown(e: PointerEvent): void {
    const pos = this.eventPos(e);
    const fx = this.hitFixture(pos.x, pos.y);
    if (fx) {
      this.selectedId = fx.id;
      this.dragging = true;
      this.renderFixturePanel();
      this.drawOverlay();
    } else {
      // 点击空白：洗墙灯改指向
      const sel = this.selected();
      if (sel?.kind === 'wallwash') {
        store.updatePlan((p) => {
          const t = p.fixtures.find((q) => q.id === sel.id);
          if (t) t.aim = { x: pos.x, y: pos.y };
        });
      } else {
        this.selectedId = null;
        this.renderFixturePanel();
        this.drawOverlay();
      }
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const rect = this.overlay.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right
      && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside && !this.dragging) {
      if (this.hover) { this.hover = null; this.drawOverlay(); }
      return;
    }
    const pos = this.eventPos(e);
    this.hover = pos;
    if (this.dragging && this.selectedId) {
      const x = Math.max(0.3, Math.min(FLOOR_W - 0.3, pos.x));
      const y = Math.max(0.3, Math.min(FLOOR_H - 0.3, pos.y));
      store.updatePlan((p) => {
        const t = p.fixtures.find((q) => q.id === this.selectedId);
        if (t) { t.x = x; t.y = y; }
      });
    } else {
      this.overlay.style.cursor = this.hitFixture(pos.x, pos.y) ? 'grab' : 'crosshair';
      this.drawOverlay();
    }
  }

  private selected(): Fixture | null {
    return store.activePlan.fixtures.find((f) => f.id === this.selectedId) ?? null;
  }

  private resize(): void {
    const stack = this.querySelector('[data-role="stack"]')!;
    const w = stack.clientWidth;
    this.scale = w / FLOOR_W; // 容器由 CSS aspect-ratio 保证与厂房同比例
    const cw = Math.round(FLOOR_W * this.scale);
    const ch = Math.round(FLOOR_H * this.scale);
    this.overlay.width = cw;
    this.overlay.height = ch;
    this.heatCanvas.style.width = `${cw}px`;
    this.heatCanvas.style.height = `${ch}px`;
    this.drawOverlay();
  }

  // ---------------- 渲染 ----------------
  private render(): void {
    this.renderPlanBar();
    this.drawHeat();
    this.drawOverlay();
    this.renderFixturePanel();
    this.renderDark();
    this.renderTime();
  }

  private renderPlanBar(): void {
    const sel = this.querySelector('[data-role="plan-select"]') as HTMLSelectElement;
    sel.innerHTML = store.plans
      .map((p) => `<option value="${p.id}" ${p.id === store.activePlanId ? 'selected' : ''}>${p.name}</option>`)
      .join('');
    const qc = this.querySelector('[data-role="qc-select"]') as HTMLSelectElement;
    qc.innerHTML = '<option value="">（不关联）</option>' + QC_STATIONS
      .map((q) => `<option value="${q.id}" ${q.id === store.activePlan.qcStationId ? 'selected' : ''}>${q.name}</option>`)
      .join('');
  }

  private renderTime(): void {
    (this.querySelector('[data-role="hour-label"]')! as HTMLElement).textContent =
      `${String(store.hour).padStart(2, '0')}:00 · 自然光 ${daylightCct(store.hour)}K`;
    const dl = store.lastResult?.daylightLux ?? 0;
    (this.querySelector('[data-role="daylight"]')! as HTMLElement).textContent =
      `窗入射参考 ${fmtLux(dl)} lux`;
  }

  private drawHeat(): void {
    const ctx2 = this.heatCanvas.getContext('2d')!;
    ctx2.clearRect(0, 0, SIM_W, SIM_H);
    const r = store.lastResult;
    if (r && this.showHeat) {
      ctx2.drawImage(r.bitmap, 0, 0);
    }
  }

  private drawOverlay(): void {
    const c = this.octx;
    const s = this.scale;
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    c.lineWidth = 1;

    // 区域底色与边框
    for (const z of ZONES) {
      c.fillStyle = 'rgba(255,255,255,0.045)';
      c.fillRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.strokeRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.font = 'bold 12px system-ui';
      c.fillText(z.name, z.x * s + 6, z.y * s + 15);
      const stat = store.lastResult?.zones.find((q) => q.zoneId === z.id);
      if (stat) {
        c.font = '11px system-ui';
        c.fillStyle = stat.dark ? '#ff9b9b' : '#b9f6ca';
        c.fillText(`${fmtLux(stat.avgLux)} lux / 达标${(stat.compliance * 100).toFixed(0)}%`,
          z.x * s + 6, z.y * s + 30);
      }
    }

    // 暗区红色斜纹
    const darkIds = new Set(store.lastResult?.darkAreas.map((d) => d.zoneId) ?? []);
    c.save();
    c.strokeStyle = 'rgba(255,70,70,0.55)';
    c.lineWidth = 2;
    for (const z of ZONES.filter((q) => darkIds.has(q.id))) {
      for (let x = z.x * s; x < (z.x + z.w) * s; x += 12) {
        c.beginPath();
        c.moveTo(x, z.y * s);
        c.lineTo(x + (z.h * s), (z.y + z.h) * s);
        c.stroke();
      }
      c.strokeStyle = 'rgba(255,90,90,0.9)';
      c.strokeRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.strokeStyle = 'rgba(255,70,70,0.55)';
    }
    c.restore();

    // 窗户（北墙，青色双线）
    c.strokeStyle = '#80d8ff';
    c.lineWidth = 3;
    for (const w of WINDOWS) {
      c.beginPath();
      c.moveTo(w.x * s, w.y * s);
      c.lineTo((w.x + w.w) * s, w.y * s);
      c.stroke();
    }
    c.lineWidth = 1;

    // 遮挡物
    for (const ob of OBSTACLES) {
      c.fillStyle = 'rgba(120,130,150,0.55)';
      c.strokeStyle = 'rgba(220,225,235,0.8)';
      c.fillRect(ob.x * s, ob.y * s, ob.w * s, ob.h * s);
      c.strokeRect(ob.x * s, ob.y * s, ob.w * s, ob.h * s);
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = '10px system-ui';
      c.fillText(ob.name, ob.x * s + 3, ob.y * s + ob.h * s - 4);
    }

    // 灯具
    for (const fx of store.activePlan.fixtures) {
      this.drawFixture(fx, s, c);
    }

    // 光标处 lux
    if (this.hover && store.lastResult) {
      const ix = Math.max(0, Math.min(SIM_W - 1, Math.floor(this.hover.x * (SIM_W / FLOOR_W))));
      const iy = Math.max(0, Math.min(SIM_H - 1, Math.floor(this.hover.y * (SIM_H / FLOOR_H))));
      const v = store.lastResult.lux[iy * SIM_W + ix];
      c.fillStyle = 'rgba(0,0,0,0.72)';
      const tx = this.hover.x * s + 10;
      const ty = this.hover.y * s - 10;
      c.fillRect(tx - 4, ty - 14, 78, 18);
      c.fillStyle = '#fff';
      c.font = '11px system-ui';
      c.fillText(`${fmtLux(v)} lux`, tx, ty);
    }

    this.renderLegend();
  }

  private drawFixture(fx: Fixture, s: number, c: CanvasRenderingContext2D): void {
    const x = fx.x * s;
    const y = fx.y * s;
    const [r, g, b] = cctToRgb(fx.cct);
    const selected = fx.id === this.selectedId;
    const colors: Record<FixtureKind, string> = {
      ceiling: '#ffd54f',
      task: '#4fc3f7',
      wallwash: '#ce93d8',
    };
    c.save();
    if (!fx.on) c.globalAlpha = 0.35;

    // 洗墙灯指向线
    if (fx.kind === 'wallwash' && fx.aim) {
      c.strokeStyle = 'rgba(206,147,216,0.8)';
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(fx.aim.x * s, fx.aim.y * s);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#ce93d8';
      c.beginPath();
      c.arc(fx.aim.x * s, fx.aim.y * s, 3, 0, Math.PI * 2);
      c.fill();
    }

    // 光束角示意圆
    const reach = fx.height * Math.tan((fx.beam * Math.PI) / 360);
    c.strokeStyle = `rgba(${r},${g},${b},0.35)`;
    c.beginPath();
    c.arc(x, y, reach * s, 0, Math.PI * 2);
    c.stroke();

    // 灯体
    c.fillStyle = colors[fx.kind];
    c.strokeStyle = selected ? '#ff5252' : 'rgba(0,0,0,0.6)';
    c.lineWidth = selected ? 2.5 : 1;
    c.beginPath();
    if (fx.kind === 'ceiling') {
      c.arc(x, y, 7, 0, Math.PI * 2);
    } else if (fx.kind === 'task') {
      c.rect(x - 6, y - 6, 12, 12);
    } else {
      c.moveTo(x, y - 8);
      c.lineTo(x + 8, y + 6);
      c.lineTo(x - 8, y + 6);
      c.closePath();
    }
    c.fill();
    c.stroke();
    c.lineWidth = 1;
    c.restore();
  }

  private renderLegend(): void {
    const el = this.querySelector('[data-role="legend"]')!;
    el.innerHTML = LEGEND.map((lx) => {
      const [r, g, b] = heatColor(lx + 1);
      return `<span class="leg"><i style="background:rgb(${r},${g},${b})"></i>${lx === 0 ? '0' : fmtLux(lx)}lx</span>`;
    }).join('');
  }

  private renderFixturePanel(): void {
    const host = this.querySelector('[data-role="fixture-panel"]')!;
    const fx = this.selected();
    if (!fx) {
      host.innerHTML = '<h3>灯具参数</h3><p class="hint">点击平面图上的灯具查看并编辑参数（光通量 / 色温 / 光束角 / 高度）。</p>';
      return;
    }
    host.innerHTML = `
      <h3>${fx.name} <small>${KIND_LABEL[fx.kind]}</small></h3>
      <div class="fx-form">
        <label>名称 <input data-f="name" value="${fx.name}"></label>
        <label>光通量 <span class="val">${fx.flux} lm</span>
          <input type="range" min="500" max="20000" step="100" data-f="flux" value="${fx.flux}"></label>
        <label>色温 <span class="val">${fx.cct} K</span>
          <input type="range" min="2700" max="6500" step="100" data-f="cct" value="${fx.cct}"></label>
        <label>光束角 <span class="val">${fx.beam}°</span>
          <input type="range" min="10" max="150" step="1" data-f="beam" value="${fx.beam}"></label>
        <label>安装高度 <span class="val">${fx.height.toFixed(1)} m</span>
          <input type="range" min="1.8" max="8" step="0.1" data-f="height" value="${fx.height}"></label>
        <label class="chk"><input type="checkbox" data-f="on" ${fx.on ? 'checked' : ''}> 启用该灯</label>
        <div class="fx-actions">
          <button class="btn btn-danger" data-act="delete-fx">删除灯具</button>
          <button class="btn" data-act="dup-fx">复制</button>
        </div>
      </div>`;

    host.querySelectorAll<HTMLInputElement>('[data-f]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const key = inp.dataset.f! as keyof Fixture;
        store.updatePlan((p) => {
          const t = p.fixtures.find((q) => q.id === fx.id);
          if (!t) return;
          if (key === 'on') t.on = inp.checked;
          else if (key === 'name') t.name = inp.value;
          else (t[key] as number) = Number(inp.value);
        });
      });
    });
    host.querySelector('[data-act="delete-fx"]')!.addEventListener('click', () => {
      store.updatePlan((p) => {
        p.fixtures = p.fixtures.filter((q) => q.id !== fx.id);
      });
      this.selectedId = null;
      this.renderFixturePanel();
    });
    host.querySelector('[data-act="dup-fx"]')!.addEventListener('click', () => {
      const copy = structuredClone(fx);
      copy.id = uid('fx');
      copy.x += 1;
      copy.name = `${fx.name} 副本`;
      store.updatePlan((p) => p.fixtures.push(copy));
      this.selectedId = copy.id;
    });
  }

  private renderDark(): void {
    const r = store.lastResult;
    const list = this.querySelector('[data-role="dark-list"]')!;
    const count = this.querySelector('[data-role="dark-count"]')!;
    const dark = r?.darkAreas ?? [];
    count.textContent = dark.length ? `(${dark.length})` : '（无）';
    list.innerHTML = dark.length
      ? dark.map((d) => `<li class="dark-item">
          <b>${d.name}</b>（${d.kind === 'qc' ? '质检台' : '通道'}）
          平均 <strong>${fmtLux(d.avgLux)} lux</strong>
          <em>低于阈值 ${d.threshold} lux</em>
        </li>`).join('')
      : '<li class="ok-item">✓ 质检台 ≥300lux、通道 ≥150lux，无暗区</li>';

    const table = this.querySelector('[data-role="zone-table"]')!;
    table.innerHTML = `
      <thead><tr><th>区域</th><th>平均</th><th>最低</th><th>达标率</th></tr></thead>
      <tbody>${(r?.zones ?? []).map((z) => `
        <tr class="${z.dark ? 'row-dark' : ''}">
          <td>${z.name}</td>
          <td>${fmtLux(z.avgLux)}</td>
          <td>${fmtLux(z.minLux)}</td>
          <td>${(z.compliance * 100).toFixed(1)}%</td>
        </tr>`).join('')}</tbody>`;
  }
}

// 布光点位表 CSV
export function planCsvRows(plan: LightingPlan): (string | number)[][] {
  return plan.fixtures.map((fx) => [
    fx.id, fx.name, KIND_LABEL[fx.kind],
    fx.x.toFixed(2), fx.y.toFixed(2), fx.height.toFixed(2),
    fx.flux, fx.cct, fx.beam, fx.on ? '启用' : '关闭',
    fx.aim ? `${fx.aim.x.toFixed(2)},${fx.aim.y.toFixed(2)}` : '',
  ]);
}

export const FIXTURE_CSV_HEADER = [
  '灯具编号', '名称', '类型', 'X(m)', 'Y(m)', '高度(m)',
  '光通量(lm)', '色温(K)', '光束角(°)', '状态', '指向点',
];
