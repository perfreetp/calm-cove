import { For, Match, Show, Switch } from 'solid-js';
import type { EditorStore } from '../store/editor';
import { METRICS } from '../data/constants';
import type { EasingType } from '../types';

interface Props {
  editor: EditorStore;
}

const EASINGS: { id: EasingType; label: string }[] = [
  { id: 'linear', label: '线性' },
  { id: 'easeInOut', label: '缓入缓出' },
  { id: 'bezier', label: '贝塞尔' },
];

export default function Inspector(props: Props) {
  const editor = props.editor;
  const sel = editor.selection;

  const bone = () => (sel().kind === 'bone' ? editor.doc.bones.find((b) => b.id === sel().id) : undefined);
  const part = () => (sel().kind === 'part' ? editor.doc.parts.find((p) => p.id === sel().id) : undefined);

  return (
    <div class="panel" style={{ height: '100%' }}>
      <div class="panel-header">🎛️ 属性检查器</div>
      <div class="panel-body">
        <Switch>
          <Match when={bone()}>
            {(b) => (
              <>
                <h3 style={{ margin: '4px 0 10px', 'font-size': '14px' }}>骨骼:{b().name}</h3>
                <div class="field">
                  <label>父骨骼</label>
                  <select
                    value={b().parentId ?? ''}
                    onChange={(e) => editor.setBoneParent(b().id, e.currentTarget.value || null)}
                  >
                    <option value="">(根骨骼)</option>
                    <For each={editor.doc.bones.filter((x) => x.id !== b().id)}>
                      {(x) => <option value={x.id}>{x.name}</option>}
                    </For>
                  </select>
                </div>
                <NumField label="原点 X" value={b().x} onChange={(v) => editor.updateBone(b().id, { x: v })} />
                <NumField label="原点 Y" value={b().y} onChange={(v) => editor.updateBone(b().id, { y: v })} />
                <NumField label="骨长" value={b().length} step={1} onChange={(v) => editor.updateBone(b().id, { length: Math.max(4, v) })} />
                <NumField label="静息角" value={b().restAngle} onChange={(v) => editor.updateBone(b().id, { restAngle: v })} />
                <NumField label="最小角" value={b().minAngle} onChange={(v) => editor.updateBone(b().id, { minAngle: v })} />
                <NumField label="最大角" value={b().maxAngle} onChange={(v) => editor.updateBone(b().id, { maxAngle: v })} />
                <div class="small muted mt8">
                  骨骼关键帧值 = 局部绝对角度(与最小/最大角同一坐标系)。超出限位的姿态在预览中标红并自动限位。
                </div>
                <KeyframeEditor editor={editor} trackId={b().id} kind="bone" />
              </>
            )}
          </Match>
          <Match when={part()}>
            {(p) => (
              <>
                <h3 style={{ margin: '4px 0 10px', 'font-size': '14px' }}>拆件:{p().name}</h3>
                <div class="field">
                  <label>绑定骨骼</label>
                  <select
                    value={p().boneId ?? ''}
                    onChange={(e) => editor.bindPart(p().id, e.currentTarget.value || null)}
                  >
                    <option value="">(未绑骨)</option>
                    <For each={editor.doc.bones}>
                      {(x) => <option value={x.id}>{x.name}</option>}
                    </For>
                  </select>
                </div>
                <NumField label="锚点 X" value={p().pivotX} onChange={(v) => editor.updatePart(p().id, { pivotX: v })} />
                <NumField label="锚点 Y" value={p().pivotY} onChange={(v) => editor.updatePart(p().id, { pivotY: v })} />
                <NumField label="宽" value={p().width} onChange={(v) => editor.updatePart(p().id, { width: Math.max(1, v) })} />
                <NumField label="高" value={p().height} onChange={(v) => editor.updatePart(p().id, { height: Math.max(1, v) })} />
                <NumField label="层级" value={p().zOrder} step={1} onChange={(v) => editor.updatePart(p().id, { zOrder: v })} />
                <div class="small muted mt8">锚点即关节对齐点,调整它让拆件绕正确位置旋转。</div>
                <div class="mt16">
                  <button class="danger" onClick={() => editor.removePart(p().id)}>
                    删除该拆件
                  </button>
                </div>
              </>
            )}
          </Match>
          <Match when={true}>
            <div class="empty-hint">在左侧或视口中选择骨骼 / 拆件进行编辑</div>
          </Match>
        </Switch>

        <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }} />
        <h3 style={{ margin: '4px 0 8px', 'font-size': '13px' }}>规范指标轨道</h3>
        <For each={METRICS}>
          {(m) => (
            <div class="metric-box">
              <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                <b>{m.name}</b>
                <span class="muted small">
                  区间 {m.min}~{m.max}
                  {m.unit}
                </span>
              </div>
              <div class="small muted" style={{ margin: '4px 0' }}>{m.description}</div>
              <button
                style={{ width: '100%' }}
                onClick={() => {
                  editor.setSelection({ kind: 'metric', id: m.id });
                }}
                classList={{ primary: sel().kind === 'metric' && sel().id === m.id }}
              >
                选中该指标轨道
              </button>
              <Show when={sel().kind === 'metric' && sel().id === m.id}>
                <div class="mt8">
                  <KeyframeEditor editor={editor} trackId={m.id} kind="metric" />
                </div>
              </Show>
            </div>
          )}
        </For>

        <Show when={editor.currentNodeSpec()}>
          {(n) => (
            <>
              <div style={{ height: '1px', background: 'var(--border)', margin: '14px 0' }} />
        <h3 style={{ margin: '4px 0 8px', 'font-size': '13px' }}>
          当前节点:{n().order}. {n().name}
        </h3>
              <div class="spec-card">{n().specText}</div>
            </>
          )}
        </Show>
      </div>
    </div>
  );
}

function NumField(props: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div class="field">
      <label>{props.label}</label>
      <input
        type="number"
        step={props.step ?? 0.5}
        value={props.value}
        onChange={(e) => {
          const v = Number(e.currentTarget.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
      />
    </div>
  );
}

function KeyframeEditor(props: {
  editor: EditorStore;
  trackId: string;
  kind: 'bone' | 'metric';
}) {
  const editor = props.editor;
  const frames = () =>
    editor.doc.keyframes
      .filter((f) => f.track === props.trackId)
      .sort((a, b) => a.time - b.time);
  const current = () => editor.selectedCurrentValue();
  const frameAtNow = () =>
    frames().find((f) => Math.abs(f.time - editor.time()) < 1e-6);

  return (
    <div class="mt16">
      <div class="field">
        <label>{props.kind === 'bone' ? '局部角度' : '指标值'}</label>
        <input
          type="number"
          step={0.5}
          value={Number(current().toFixed(2))}
          onChange={(e) => {
            const v = Number(e.currentTarget.value);
            if (Number.isFinite(v)) editor.addKeyframe(props.trackId, props.kind, v, frameAtNow()?.easing ?? 'easeInOut');
          }}
        />
      </div>
      <div class="field">
        <label>缓动</label>
        <div class="easing-seg" style={{ flex: 1 }}>
          <For each={EASINGS}>
            {(ea) => (
              <button
                class={frameAtNow()?.easing === ea.id ? 'active' : ''}
                onClick={() =>
                  editor.addKeyframe(props.trackId, props.kind, current(), ea.id)
                }
              >
                {ea.label}
              </button>
            )}
          </For>
        </div>
      </div>
      <Show when={frameAtNow()?.easing === 'bezier'}>
        <BezierEditor editor={editor} frameId={frameAtNow()!.id} bezier={frameAtNow()!.bezier} />
      </Show>
      <div class="row-flex mt8">
        <button class="primary" onClick={() => editor.addKeyframe(props.trackId, props.kind, current(), frameAtNow()?.easing ?? 'easeInOut')}>
          {frameAtNow() ? '更新当前帧' : '在播放头打关键帧'}
        </button>
        <Show when={frameAtNow()}>
          <button class="danger" onClick={() => editor.deleteKeyframe(frameAtNow()!.id)}>
            删除
          </button>
        </Show>
      </div>
      <div class="small muted mt8">该轨道共 {frames().length} 个关键帧</div>
    </div>
  );
}

function BezierEditor(props: {
  editor: EditorStore;
  frameId: string;
  bezier?: [number, number, number, number];
}) {
  const val = (): [number, number, number, number] => props.bezier ?? [0.42, 0, 0.58, 1];
  const labels = ['X1', 'Y1', 'X2', 'Y2'];
  return (
    <div class="metric-box mt8">
      <div class="small mb8">自定义 cubic-bezier 控制点</div>
      <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '6px' }}>
        {val().map((v, i) => (
          <div class="field" style={{ margin: 0 }}>
            <label style={{ width: '34px' }}>{labels[i]}</label>
            <input
              type="number"
              step={0.05}
              value={v}
              onChange={(e) => {
                const next = [...val()] as [number, number, number, number];
                next[i] = Number(e.currentTarget.value);
                props.editor.updateKeyframe(props.frameId, { bezier: next, easing: 'bezier' });
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
