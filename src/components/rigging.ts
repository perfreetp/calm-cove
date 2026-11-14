import { Screen } from './base.js';
import { state, update, uid } from '../store.js';
import { figureInnerHTML, CANVAS_W, CANVAS_H, BONES, JOINT_LABELS } from '../rig.js';
import { esc } from '../dom.js';
import { Anim, Part } from '../types.js';

function boneLabel(b: [string, string]): string {
  return `${JOINT_LABELS[b[0]] ?? b[0]} → ${JOINT_LABELS[b[1]] ?? b[1]}`;
}

export class Rigging extends Screen {
  private dragJoint: string | null = null;

  private anim(): Anim {
    return state.anims.find(a => a.id === state.ui.selAnim) ?? state.anims[0];
  }

  render(): void {
    const anim = this.anim();
    if (!anim) { this.innerHTML = '<p>暂无动画工程</p>'; return; }
    const skin = anim.skins.find(s => s.id === anim.activeSkinId) ?? anim.skins[0];

    this.innerHTML = `
      <h2>绑骨 · ${esc(anim.name)}</h2>
      <div class="row">
        <div class="col" style="flex:1.4;min-width:420px">
          <div class="toolbar">
            <label class="fl">动画工程
              <select id="anim-sel">${state.anims.map(a => `<option value="${a.id}" ${a.id === anim.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
            </label>
            <label class="fl">当前皮肤
              <select id="skin-sel">${anim.skins.map(s => `<option value="${s.id}" ${s.id === skin?.id ? 'selected' : ''}>${esc(s.name)}（${esc(s.athlete)}）</option>`).join('')}</select>
            </label>
          </div>
          <svg class="stage" id="stage" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" style="width:100%"></svg>
          <div class="hint">拖动关节圆点调整绑定姿态（橙色为肩/肘/髋/膝/踝关键关节）。调整只影响挂件绑定，不改写已有关键帧。</div>
        </div>
        <div class="col grow">
          <div class="panel">
            <h3>皮肤（一套骨骼多选手共用动作）</h3>
            <div class="tabs" id="skin-tabs">
              ${anim.skins.map(s => `<button class="${s.id === skin?.id ? 'on' : ''}" data-skin="${s.id}">${esc(s.name)}</button>`).join('')}
            </div>
            <div class="toolbar">
              <input id="new-skin-name" placeholder="皮肤名" style="width:90px">
              <input id="new-skin-athlete" placeholder="选手姓名" style="width:90px">
              <button class="sm" id="add-skin">＋ 新增皮肤</button>
              ${anim.skins.length > 1 ? '<button class="sm danger" id="del-skin">删除当前皮肤</button>' : ''}
            </div>
          </div>
          <div class="panel">
            <h3>导入拆件图</h3>
            <div class="toolbar">
              <label class="fl">绑定骨骼
                <select id="part-bone">${BONES.map((b, i) => `<option value="${i}">${boneLabel(b)}</option>`).join('')}</select>
              </label>
              <label class="fl">图片文件
                <input type="file" id="part-file" accept="image/*">
              </label>
            </div>
            <div class="toolbar">
              <button class="sm" id="add-rect">＋ 矩形件</button>
              <button class="sm" id="add-ellipse">＋ 椭圆件</button>
              <span class="muted">无拆件图时可用占位件</span>
            </div>
          </div>
          <div class="panel">
            <h3>挂件列表（${skin?.parts.length ?? 0}）</h3>
            <div style="max-height:300px;overflow:auto">
            <table>
              <tr><th>名称</th><th>绑定骨骼</th><th>宽/高</th><th></th></tr>
              ${(skin?.parts ?? []).map(p => `
                <tr>
                  <td>${esc(p.name)}${p.kind === 'image' ? ' 🖼' : ''}</td>
                  <td><select data-part-bone="${p.id}">
                    ${BONES.map((b, i) => `<option value="${i}" ${b[0] === p.bone[0] && b[1] === p.bone[1] ? 'selected' : ''}>${boneLabel(b)}</option>`).join('')}
                  </select></td>
                  <td class="muted">${Math.round(p.w)}×${Math.round(p.h)}</td>
                  <td><button class="sm danger" data-part-del="${p.id}">删</button></td>
                </tr>`).join('')}
            </table>
            </div>
          </div>
        </div>
      </div>`;

    this.drawStage();
    this.wire();
  }

  private drawStage(): void {
    const anim = this.anim();
    const svg = this.querySelector<SVGSVGElement>('#stage');
    if (!svg || !anim) return;
    svg.innerHTML = figureInnerHTML(anim, anim.skeleton.joints, anim.activeSkinId, true);
    svg.querySelectorAll<SVGCircleElement>('.joint').forEach(c => {
      c.addEventListener('pointerdown', e => {
        this.dragJoint = c.dataset.joint!;
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
      });
    });
    svg.onpointermove = e => {
      if (!this.dragJoint) return;
      const pt = this.toSVG(svg, e);
      const j = this.dragJoint;
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        a.skeleton.joints[j] = { x: Math.round(pt.x), y: Math.round(pt.y) };
      }, { silent: true });
      this.drawStage();
    };
    svg.onpointerup = () => {
      if (this.dragJoint) { this.dragJoint = null; update(() => {}); }
    };
  }

  private toSVG(svg: SVGSVGElement, e: PointerEvent): { x: number; y: number } {
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * CANVAS_W, y: (e.clientY - r.top) / r.height * CANVAS_H };
  }

  private wire(): void {
    const anim = this.anim();
    this.querySelector('#anim-sel')?.addEventListener('change', e => {
      update(s => { s.ui.selAnim = (e.target as HTMLSelectElement).value; });
    });
    this.querySelector('#skin-sel')?.addEventListener('change', e => {
      update(s => { s.anims.find(a => a.id === anim.id)!.activeSkinId = (e.target as HTMLSelectElement).value; });
    });
    this.querySelectorAll('#skin-tabs [data-skin]').forEach(b => b.addEventListener('click', () => {
      update(s => { s.anims.find(a => a.id === anim.id)!.activeSkinId = (b as HTMLElement).dataset.skin!; });
    }));
    this.querySelector('#add-skin')?.addEventListener('click', () => {
      const name = (this.querySelector('#new-skin-name') as HTMLInputElement).value.trim() || '新皮肤';
      const athlete = (this.querySelector('#new-skin-athlete') as HTMLInputElement).value.trim() || '未命名选手';
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        const tpl = a.skins[0];
        const parts: Part[] = tpl.parts.map(p => ({ ...p, id: uid(), offset: { ...p.offset }, bone: [...p.bone] as [string, string], kind: p.kind === 'image' ? 'rect' : p.kind, src: undefined }));
        const ns = { id: uid(), name, athlete, parts };
        a.skins.push(ns);
        a.activeSkinId = ns.id;
      });
    });
    this.querySelector('#del-skin')?.addEventListener('click', () => {
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        a.skins = a.skins.filter(x => x.id !== a.activeSkinId);
        a.activeSkinId = a.skins[0].id;
      });
    });
    const addPart = (part: Part) => update(s => {
      const a = s.anims.find(x => x.id === anim.id)!;
      const sk = a.skins.find(x => x.id === a.activeSkinId)!;
      sk.parts.push(part);
    });
    const selBone = (): [string, string] => BONES[+(this.querySelector('#part-bone') as HTMLSelectElement).value];
    this.querySelector('#add-rect')?.addEventListener('click', () => {
      addPart({ id: uid(), name: '矩形件', bone: selBone(), offset: { x: 0, y: 0 }, rot: 0, w: 20, h: 60, color: '#94a3b8', kind: 'rect' });
    });
    this.querySelector('#add-ellipse')?.addEventListener('click', () => {
      addPart({ id: uid(), name: '椭圆件', bone: selBone(), offset: { x: 0, y: 0 }, rot: 0, w: 30, h: 30, color: '#cbd5e1', kind: 'ellipse' });
    });
    this.querySelector('#part-file')?.addEventListener('change', e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 120 / Math.max(img.width, img.height));
          addPart({
            id: uid(), name: f.name.replace(/\.\w+$/, ''), bone: selBone(),
            offset: { x: 0, y: 0 }, rot: 0,
            w: img.width * scale, h: img.height * scale,
            color: '#94a3b8', kind: 'image', src: String(rd.result),
          });
        };
        img.src = String(rd.result);
      };
      rd.readAsDataURL(f);
    });
    this.querySelectorAll('[data-part-bone]').forEach(sel => sel.addEventListener('change', () => {
      const pid = (sel as HTMLElement).dataset.partBone!;
      const bone = BONES[+(sel as HTMLSelectElement).value];
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        const sk = a.skins.find(x => x.id === a.activeSkinId)!;
        const p = sk.parts.find(x => x.id === pid);
        if (p) p.bone = [...bone] as [string, string];
      });
    }));
    this.querySelectorAll('[data-part-del]').forEach(btn => btn.addEventListener('click', () => {
      const pid = (btn as HTMLElement).dataset.partDel!;
      update(s => {
        const a = s.anims.find(x => x.id === anim.id)!;
        const sk = a.skins.find(x => x.id === a.activeSkinId)!;
        sk.parts = sk.parts.filter(x => x.id !== pid);
      });
    }));
  }
}
customElements.define('x-rigging', Rigging);
