import { Screen } from './base.js';
import { state, update, uid } from '../store.js';
import { figureInnerHTML, poseAt, CANVAS_W, CANVAS_H } from '../rig.js';
import { esc } from '../dom.js';
import { Anim, Keyframe } from '../types.js';

const TL_W = 800, TL_H = 96, TL_L = 20, TL_R = 20;

export class Animator extends Screen {
  private time = 0;
  private playing = false;
  private raf = 0;
  private lastTs = 0;
  private selKf: string | null = null;
  private dragJoint: string | null = null;
  private dragKf: string | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cancelAnimationFrame(this.raf);
    this.playing = false;
  }

  private anim(): Anim {
    return state.anims.find(a => a.id === state.ui.selAnim) ?? state.anims[0];
  }
  private x(t: number, D: number): number { return TL_L + (t / D) * (TL_W - TL_L - TL_R); }
  private tAt(px: number, D: number): number { return Math.min(D, Math.max(0, (px - TL_L) / (TL_W - TL_L - TL_R) * D)); }

  render(): void {
    const anim = this.anim();
    if (!anim) { this.innerHTML = '<p>暂无动画工程</p>'; return; }
    const D = anim.duration;
    const frames = Math.round(D * 12);

    this.innerHTML = `
      <h2>动画时间轴 · ${esc(anim.name)}</h2>
      <div class="toolbar">
        <label class="fl">动画工程
          <select id="anim-sel">${state.anims.map(a => `<option value="${a.id}" ${a.id === anim.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
        </label>
        <label class="fl">预览皮肤
          <select id="skin-sel">${anim.skins.map(s => `<option value="${s.id}" ${s.id === anim.activeSkinId ? 'selected' : ''}>${esc(s.name)}（${esc(s.athlete)}）</option>`).join('')}</select>
        </label>
        <label class="fl">循环时长(秒)
          <input type="number" id="dur" step="0.02" min="0.1" value="${D}">
        </label>
        <span class="chip info">按 12fps 导出约 ${frames} 帧${frames < 12 ? '（不足12帧，质检会记一般问题）' : ''}</span>
      </div>
      <div class="row">
        <div class="col" style="flex:1.3;min-width:420px">
          <svg class="stage" id="preview" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" style="width:100%"></svg>
          <div class="hint">拖动关节直接改当前时间所在关键帧的姿态；若当前时间没有关键帧会自动打一个。</div>
        </div>
        <div class="col grow">
          <div class="panel">
            <h3>回放</h3>
            <div class="toolbar">
              <button id="play" class="primary">${this.playing ? '⏸ 暂停' : '▶ 播放'}</button>
              <button id="rewind">⏮</button>
              <span class="chip" id="time-lbl">${this.time.toFixed(2)}s / ${D}s</span>
            </div>
          </div>
          <div class="panel">
            <h3>关键帧</h3>
            <div class="toolbar">
              <button class="sm" id="add-kf">＋ 在当前时间打关键帧</button>
              <button class="sm danger" id="del-kf" ${this.selKf ? '' : 'disabled'}>删除选中</button>
              <button class="sm" id="mode-kf" ${this.selKf ? '' : 'disabled'}>切换选中段的插值</button>
            </div>
            <div class="hint">时间轴上：<b style="color:#16a34a">绿色段=缓入缓出</b>，<b style="color:#2563eb">蓝色段=线性</b>，点击段即可切换；菱形可左右拖动改变时刻。</div>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>时间轴</h3>
        <svg class="stage" id="timeline" viewBox="0 0 ${TL_W} ${TL_H}" style="width:100%"></svg>
      </div>`;

    this.drawPreview();
    this.drawTimeline();
    this.wire(anim);
    if (this.playing) { this.lastTs = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }

  private drawPreview(): void {
    const anim = this.anim();
    const svg = this.querySelector<SVGSVGElement>('#preview');
    if (!svg || !anim) return;
    svg.innerHTML = figureInnerHTML(anim, poseAt(anim, this.time), anim.activeSkinId, true);
    svg.querySelectorAll<SVGCircleElement>('.joint').forEach(c => {
      c.addEventListener('pointerdown', e => {
        this.dragJoint = c.dataset.joint!;
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
        this.ensureKfAtTime();
      });
    });
    svg.onpointermove = e => {
      if (!this.dragJoint) return;
      const r = svg.getBoundingClientRect();
      const pt = { x: (e.clientX - r.left) / r.width * CANVAS_W, y: (e.clientY - r.top) / r.height * CANVAS_H };
      const j = this.dragJoint;
      const kfId = this.selKf;
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        const kf = a.keyframes.find(k => k.id === kfId);
        if (kf) kf.pose[j] = { x: Math.round(pt.x), y: Math.round(pt.y) };
      }, { silent: true });
      this.drawPreviewPoseOnly();
    };
    svg.onpointerup = () => { if (this.dragJoint) { this.dragJoint = null; update(() => {}); } };
  }

  /** 只重画预览人物（拖动过程中，避免重建事件） */
  private drawPreviewPoseOnly(): void {
    const anim = this.anim();
    const svg = this.querySelector<SVGSVGElement>('#preview');
    if (!svg || !anim) return;
    const kf = anim.keyframes.find(k => k.id === this.selKf);
    svg.innerHTML = figureInnerHTML(anim, kf ? kf.pose : poseAt(anim, this.time), anim.activeSkinId, true);
    svg.querySelectorAll<SVGCircleElement>('.joint').forEach(c => {
      c.addEventListener('pointerdown', e => {
        this.dragJoint = c.dataset.joint!;
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
      });
    });
  }

  /** 当前时间没有关键帧时自动打一个，并选中 */
  private ensureKfAtTime(): void {
    const anim = this.anim();
    const near = anim.keyframes.find(k => Math.abs(k.t - this.time) < 0.02);
    if (near) { this.selKf = near.id; return; }
    const pose = JSON.parse(JSON.stringify(poseAt(anim, this.time)));
    const kf: Keyframe = { id: uid(), t: +this.time.toFixed(3), pose, outMode: 'ease' };
    update(s => {
      const a = s.anims.find(x => x.id === anim.id)!;
      a.keyframes.push(kf);
      a.keyframes.sort((p, q) => p.t - q.t);
    }, { silent: true });
    this.selKf = kf.id;
  }

  private drawTimeline(): void {
    const anim = this.anim();
    const svg = this.querySelector<SVGSVGElement>('#timeline');
    if (!svg || !anim) return;
    const D = anim.duration;
    const kfs = anim.keyframes;
    let s = '';
    // 刻度
    const step = D > 1.5 ? 0.5 : 0.1;
    for (let t = 0; t <= D + 1e-6; t += step) {
      const x = this.x(t, D);
      s += `<line x1="${x}" y1="72" x2="${x}" y2="80" stroke="#94a3b8"/><text x="${x}" y="92" font-size="10" fill="#64748b" text-anchor="middle">${t.toFixed(1)}</text>`;
    }
    s += `<line x1="${TL_L}" y1="44" x2="${TL_W - TL_R}" y2="44" stroke="#cbd5e1" stroke-width="2"/>`;
    // 插值段（含末帧到循环点的回绕段）
    if (kfs.length) {
      for (let i = 0; i < kfs.length; i++) {
        const x1 = this.x(kfs[i].t, D);
        const x2 = i < kfs.length - 1 ? this.x(kfs[i + 1].t, D) : this.x(D, D);
        const ease = kfs[i].outMode === 'ease';
        s += `<rect class="tl-seg" data-seg="${i}" x="${x1}" y="36" width="${Math.max(2, x2 - x1)}" height="16" rx="4"
          fill="${ease ? '#86efac' : '#93c5fd'}" stroke="${ease ? '#16a34a' : '#2563eb'}"><title>${ease ? '缓入缓出' : '线性'}（点击切换）</title></rect>`;
      }
      if (kfs[0].t > 0.001) {
        const ease = kfs[kfs.length - 1].outMode === 'ease';
        s += `<rect class="tl-seg" data-seg="${kfs.length - 1}" x="${this.x(0, D)}" y="36" width="${this.x(kfs[0].t, D) - this.x(0, D)}" height="16" rx="4"
          fill="${ease ? '#86efac' : '#93c5fd'}" stroke="${ease ? '#16a34a' : '#2563eb'}" opacity="0.55"><title>回绕段（${ease ? '缓入缓出' : '线性'}）</title></rect>`;
      }
    }
    // 关键帧菱形
    kfs.forEach((k, i) => {
      const x = this.x(k.t, D);
      const sel = k.id === this.selKf;
      s += `<polygon class="tl-kf" data-kf="${k.id}" points="${x},32 ${x + 9},44 ${x},56 ${x - 9},44"
        fill="${sel ? '#f59e0b' : '#334155'}" stroke="${sel ? '#92400e' : '#0f172a'}" stroke-width="1.5"><title>关键帧 ${i + 1} · t=${k.t.toFixed(2)}s</title></polygon>`;
    });
    // 播放头
    const px = this.x(this.time, D);
    s += `<line id="playhead" x1="${px}" y1="18" x2="${px}" y2="80" stroke="#dc2626" stroke-width="2"/>`;
    svg.innerHTML = s;

    svg.querySelectorAll('.tl-seg').forEach(seg => seg.addEventListener('click', e => {
      e.stopPropagation();
      const i = +(seg as HTMLElement).dataset.seg!;
      update(st => {
        const a = st.anims.find(x => x.id === anim.id)!;
        a.keyframes[i].outMode = a.keyframes[i].outMode === 'ease' ? 'linear' : 'ease';
      });
    }));
    svg.querySelectorAll('.tl-kf').forEach(kf => kf.addEventListener('pointerdown', e => {
      e.stopPropagation();
      this.selKf = (kf as HTMLElement).dataset.kf!;
      this.dragKf = this.selKf;
      (e.target as Element).setPointerCapture((e as PointerEvent).pointerId);
      const k = this.anim().keyframes.find(x => x.id === this.selKf);
      if (k) this.time = k.t;
      update(() => {});
    }));
    svg.onpointermove = e => {
      if (!this.dragKf) return;
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * TL_W;
      const t = +this.tAt(px, anim.duration).toFixed(3);
      const id = this.dragKf;
      update(st => {
        const a = st.anims.find(x => x.id === anim.id)!;
        const k = a.keyframes.find(x => x.id === id);
        if (k) k.t = t;
      }, { silent: true });
      this.time = t;
      this.drawTimeline();
      this.drawPreview();
      this.updateTimeLabel();
    };
    svg.onpointerup = () => {
      if (this.dragKf) {
        this.dragKf = null;
        update(st => { st.anims.find(x => x.id === anim.id)!.keyframes.sort((p, q) => p.t - q.t); });
      }
    };
    svg.onclick = e => {
      if ((e.target as Element).closest('.tl-kf') || (e.target as Element).closest('.tl-seg')) return;
      const r = svg.getBoundingClientRect();
      this.time = this.tAt((e.clientX - r.left) / r.width * TL_W, anim.duration);
      this.drawTimeline();
      this.drawPreview();
      this.updateTimeLabel();
    };
  }

  private updateTimeLabel(): void {
    const lbl = this.querySelector('#time-lbl');
    if (lbl) lbl.textContent = `${this.time.toFixed(2)}s / ${this.anim().duration}s`;
  }

  private tick = (ts: number): void => {
    if (!this.playing) return;
    const dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    const D = this.anim().duration;
    this.time = (this.time + dt) % D;
    const svg = this.querySelector<SVGSVGElement>('#preview');
    if (svg) svg.innerHTML = figureInnerHTML(this.anim(), poseAt(this.anim(), this.time), this.anim().activeSkinId, true);
    const ph = this.querySelector('#playhead');
    if (ph) { ph.setAttribute('x1', String(this.x(this.time, D))); ph.setAttribute('x2', String(this.x(this.time, D))); }
    this.updateTimeLabel();
    this.raf = requestAnimationFrame(this.tick);
  };

  private wire(anim: Anim): void {
    this.querySelector('#anim-sel')?.addEventListener('change', e => {
      this.time = 0; this.selKf = null;
      update(s => { s.ui.selAnim = (e.target as HTMLSelectElement).value; });
    });
    this.querySelector('#skin-sel')?.addEventListener('change', e => {
      update(s => { s.anims.find(a => a.id === anim.id)!.activeSkinId = (e.target as HTMLSelectElement).value; });
    });
    this.querySelector('#dur')?.addEventListener('change', e => {
      const v = Math.max(0.1, +(e.target as HTMLInputElement).value || 0.72);
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        a.duration = v;
        a.keyframes = a.keyframes.filter(k => k.t < v);
      });
    });
    this.querySelector('#play')?.addEventListener('click', () => {
      this.playing = !this.playing;
      (this.querySelector('#play') as HTMLButtonElement).textContent = this.playing ? '⏸ 暂停' : '▶ 播放';
      if (this.playing) { this.lastTs = performance.now(); this.raf = requestAnimationFrame(this.tick); }
      else cancelAnimationFrame(this.raf);
    });
    this.querySelector('#rewind')?.addEventListener('click', () => {
      this.time = 0; this.drawPreview(); this.drawTimeline(); this.updateTimeLabel();
    });
    this.querySelector('#add-kf')?.addEventListener('click', () => {
      this.ensureKfAtTime();
      update(() => {});
    });
    this.querySelector('#del-kf')?.addEventListener('click', () => {
      if (!this.selKf) return;
      const id = this.selKf;
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        if (a.keyframes.length > 1) a.keyframes = a.keyframes.filter(k => k.id !== id);
      });
      this.selKf = null;
    });
    this.querySelector('#mode-kf')?.addEventListener('click', () => {
      if (!this.selKf) return;
      const id = this.selKf;
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        const k = a.keyframes.find(x => x.id === id);
        if (k) k.outMode = k.outMode === 'ease' ? 'linear' : 'ease';
      });
    });
  }
}
customElements.define('x-animator', Animator);
