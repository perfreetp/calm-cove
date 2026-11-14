import { For, Show, createMemo } from 'solid-js';
import type { Bone, Easing, Keyframe, Part, Rig, TrackMap, Vec2 } from '../core/types';
import { sampleTrack, sortKeys, type SampleValue } from '../core/animation';
import { easingLabel, bezierEasing, EASE_IN_OUT, LINEAR } from '../core/easing';
import { BezierEditor, EasingSwatch } from './BezierEditor';
import type { ValidationIssue } from '../core/validation';
import { boneDescendants, boneMap } from '../core/skeleton';

export interface InspectorProps {
  rig: Rig;
  tracks: TrackMap;
  time: number;
  fps: number;
  duration: number;
  selectedBoneId: string | null;
  selectedPartId: string | null;
  selectedKeyId: string | null;
  issues: ValidationIssue[];
  dirty: boolean;
  canSave: boolean;
  dragMode: 'select' | 'rotate' | 'pivot';
  onDragModeChange: (mode: 'select' | 'rotate' | 'pivot') => void;
  onBoneChange: (boneId: string, patch: Partial<Bone>) => void;
  onPartChange: (partId: string, patch: Partial<Part>) => void;
  onPartPointsReplace: (partId: string, points: Vec2[], pivot: Vec2) => void;
  onKeyValue: (boneId: string, time: number, value: SampleValue, commit: boolean) => void;
  onSetKeying: (boneId: string) => void;
  onDeleteKey: (boneId: string, keyId: string) => void;
  onEasingChange: (boneId: string, keyId: string, easing: Easing) => void;
  onGoToIssue: (issue: ValidationIssue) => void;
  onSave: () => void;
  onResetKey: (boneId: string) => void;
  onDetachBone: (boneId: string) => void;
}

export function Inspector(props: InspectorProps) {
  const bone = createMemo(() => props.rig.bones.find((b) => b.id === props.selectedBoneId) ?? null);
  const part = createMemo(() => props.rig.parts.find((p) => p.id === props.selectedPartId) ?? null);

  const keys = createMemo<Keyframe[]>(() =>
    props.selectedBoneId ? sortKeys(props.tracks[props.selectedBoneId] ?? []) : [],
  );
  const currentValue = createMemo<SampleValue>(() => {
    if (!props.selectedBoneId) return { rotation: 0, x: 0, y: 0 };
    const k = keys();
    return k.length ? sampleTrack(k, props.time) : { rotation: 0, x: 0, y: 0 };
  });
  const selectedKey = createMemo(() => keys().find((k) => k.id === props.selectedKeyId) ?? null);
  const exactKeyHere = createMemo(() => keys().find((k) => Math.abs(k.time - props.time) < 0.0006) ?? null);

  const boneIssues = createMemo(() =>
    props.issues.filter((i) => i.boneId === props.selectedBoneId || (!i.boneId && i.level === 'error')),
  );
  const errorCount = createMemo(() => props.issues.filter((i) => i.level === 'error').length);

  const parentOptions = createMemo(() => {
    const b = bone();
    if (!b) return [];
    const descendants = new Set(boneDescendants(boneMap(props.rig.bones), b.id));
    return props.rig.bones.filter((c) => c.id !== b.id && !descendants.has(c.id));
  });

  const boundParts = createMemo(() => props.rig.parts.filter((p) => p.boneId === props.selectedBoneId));

  const setKeyValue = (value: SampleValue, commit = false) => {
    if (!props.selectedBoneId) return;
    props.onKeyValue(props.selectedBoneId, props.time, value, commit);
  };

  const activeEasing = createMemo<Easing>(() => selectedKey()?.easing ?? EASE_IN_OUT);

  return (
    <div class="inspector">
      <Show
        when={bone()}
        fallback={
          <div class="empty" style={{ padding: '20px 14px' }}>
            在画布或左侧列表中选择骨骼以编辑关节参数。
          </div>
        }
      >
        {/* ---------------- Bone ---------------- */}
        <div class="section">
          <h4>骨骼</h4>
          <div class="field">
            <label>名称</label>
            <input
              value={bone()!.name}
              onInput={(e) => props.onBoneChange(bone()!.id, { name: e.currentTarget.value })}
            />
          </div>
          <div class="field">
            <label>父骨骼</label>
            <select
              value={bone()!.parentId ?? ''}
              onChange={(e) => props.onBoneChange(bone()!.id, { parentId: e.currentTarget.value || null })}
            >
              <option value="">（无，根骨骼）</option>
              <For each={parentOptions()}>{(b) => <option value={b.id}>{b.name}</option>}</For>
            </select>
          </div>
          <div class="field">
            <label>旋转中心</label>
            <div class="row" style={{ gap: '4px' }}>
              <input
                class="mono"
                type="number"
                step="0.5"
                value={bone()!.pivot.x}
                onInput={(e) =>
                  props.onBoneChange(bone()!.id, {
                    pivot: { ...bone()!.pivot, x: parseFloat(e.currentTarget.value) || 0 },
                  })
                }
              />
              <input
                class="mono"
                type="number"
                step="0.5"
                value={bone()!.pivot.y}
                onInput={(e) =>
                  props.onBoneChange(bone()!.id, {
                    pivot: { ...bone()!.pivot, y: parseFloat(e.currentTarget.value) || 0 },
                  })
                }
              />
            </div>
          </div>
          <div class="hint">画布拖动模式切换为「旋转中心」可直接拖拽关节位置。</div>
          <div class="field">
            <label>活动角度</label>
            <div class="row" style={{ gap: '4px' }}>
              <input
                class="mono"
                type="number"
                step="1"
                value={bone()!.minAngle}
                onInput={(e) => props.onBoneChange(bone()!.id, { minAngle: parseFloat(e.currentTarget.value) || 0 })}
              />
              <span class="muted">~</span>
              <input
                class="mono"
                type="number"
                step="1"
                value={bone()!.maxAngle}
                onInput={(e) => props.onBoneChange(bone()!.id, { maxAngle: parseFloat(e.currentTarget.value) || 0 })}
              />
            </div>
          </div>
          <div class="field">
            <label>辅助朝向</label>
            <div class="row" style={{ gap: '4px' }}>
              <input
                class="mono"
                type="number"
                step="5"
                value={bone()!.visualAngle}
                onInput={(e) => props.onBoneChange(bone()!.id, { visualAngle: parseFloat(e.currentTarget.value) || 0 })}
              />
              <input
                class="mono"
                type="number"
                step="2"
                title="辅助骨骼长度"
                value={bone()!.length}
                onInput={(e) =>
                  props.onBoneChange(bone()!.id, { length: Math.max(4, parseFloat(e.currentTarget.value) || 40) })
                }
              />
            </div>
          </div>
          <Show when={boundParts().length}>
            <div class="kv" style={{ 'margin-top': '4px' }}>
              <span>绑定部件</span>
              <span>
                {boundParts()
                  .map((p) => p.name)
                  .join('、')}
              </span>
            </div>
          </Show>
        </div>

        {/* ---------------- Pose & keying ---------------- */}
        <div class="section">
          <h4>当前帧姿态</h4>
          <div class="field">
            <label>旋转</label>
            <div class="row" style={{ gap: '4px' }}>
              <input
                class="mono"
                type="number"
                step="1"
                value={Math.round(currentValue().rotation * 10) / 10}
                onInput={(e) =>
                  setKeyValue({ ...currentValue(), rotation: parseFloat(e.currentTarget.value) || 0 }, false)
                }
              />
              <span class="muted small">°</span>
            </div>
          </div>
          <div class="field">
            <label>位移</label>
            <div class="row" style={{ gap: '4px' }}>
              <input
                class="mono"
                type="number"
                step="1"
                value={Math.round(currentValue().x * 10) / 10}
                onInput={(e) => setKeyValue({ ...currentValue(), x: parseFloat(e.currentTarget.value) || 0 }, false)}
              />
              <input
                class="mono"
                type="number"
                step="1"
                value={Math.round(currentValue().y * 10) / 10}
                onInput={(e) => setKeyValue({ ...currentValue(), y: parseFloat(e.currentTarget.value) || 0 }, false)}
              />
            </div>
          </div>
          <div class="row" style={{ 'margin-top': '8px' }}>
            <button class="primary small" onClick={() => props.onSetKeying(bone()!.id)}>
              {exactKeyHere() ? '更新关键帧' : '打关键帧'}
            </button>
            <button class="small ghost" onClick={() => props.onResetKey(bone()!.id)} title="复位到中立姿势">
              复位
            </button>
          </div>
          <Show when={exactKeyHere()}>
            <div class="hint" style={{ 'margin-top': '6px' }}>
              该时刻已有关键帧（{exactKeyHere()!.time.toFixed(2)}s）。
            </div>
          </Show>
          <div class="divider" style={{ margin: '10px 0' }} />
          <div class="row wrap">
            <label class="muted small">画布拖动</label>
            <div class="row" style={{ gap: '3px' }}>
              <button
                class="small"
                classList={{ primary: props.dragMode === 'rotate' }}
                onClick={() => props.onDragModeChange('rotate')}
              >
                旋转骨骼
              </button>
              <button
                class="small"
                classList={{ primary: props.dragMode === 'pivot' }}
                onClick={() => props.onDragModeChange('pivot')}
              >
                旋转中心
              </button>
            </div>
          </div>
        </div>

        {/* ---------------- Keys & easing ---------------- */}
        <div class="section">
          <h4>关键帧 · 插值</h4>
          <Show
            when={keys().length}
            fallback={<div class="hint">该骨骼还没有关键帧。拖动骨骼后会自动写入当前时刻的姿势。</div>}
          >
            <div style={{ 'max-height': '132px', overflow: 'auto', 'margin-bottom': '8px' }}>
              <For each={keys()}>
                {(k) => (
                  <div
                    class="row"
                    style={{
                      padding: '2px 4px',
                      'border-radius': '4px',
                      background: k.id === props.selectedKeyId ? 'rgba(79,209,255,0.12)' : 'transparent',
                      'font-size': '11.5px',
                    }}
                    onClick={() =>
                      props.onGoToIssue({
                        id: '',
                        level: 'warning',
                        code: 'no-keys',
                        message: '',
                        at: k.time,
                      } as ValidationIssue)
                    }
                  >
                    <span class="mono" style={{ width: '54px' }}>
                      {k.time.toFixed(2)}s
                    </span>
                    <span
                      class="mono"
                      style={{
                        width: '54px',
                        color:
                          k.rotation < bone()!.minAngle - 1e-6 || k.rotation > bone()!.maxAngle + 1e-6
                            ? 'var(--danger)'
                            : 'inherit',
                      }}
                    >
                      {k.rotation.toFixed(1)}°
                    </span>
                    <EasingSwatch easing={k.easing} />
                    <span
                      class="muted"
                      style={{
                        'font-size': '10.5px',
                        flex: 1,
                        overflow: 'hidden',
                        'text-overflow': 'ellipsis',
                        'white-space': 'nowrap',
                      }}
                    >
                      {easingLabel(k.easing)}
                    </span>
                    <button
                      class="icon small ghost"
                      title="删除关键帧"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onDeleteKey(bone()!.id, k.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </For>
            </div>
            <Show when={selectedKey()} fallback={<div class="hint">在时间轴上点选关键帧，可编辑它的插值曲线。</div>}>
              <div class="easing-grid" style={{ 'margin-bottom': '8px' }}>
                <button
                  classList={{ active: activeEasing().type === 'linear' }}
                  onClick={() => props.onEasingChange(bone()!.id, selectedKey()!.id, LINEAR)}
                >
                  线性
                </button>
                <button
                  classList={{ active: activeEasing().type === 'easeInOut' }}
                  onClick={() => props.onEasingChange(bone()!.id, selectedKey()!.id, EASE_IN_OUT)}
                >
                  缓入缓出
                </button>
                <button
                  classList={{ active: activeEasing().type === 'bezier' }}
                  onClick={() =>
                    props.onEasingChange(bone()!.id, selectedKey()!.id, bezierEasing(0.3, 0.05, 0.7, 0.95))
                  }
                >
                  自定义
                </button>
              </div>
              <Show when={activeEasing().type === 'bezier'}>
                <BezierEditor
                  easing={activeEasing()}
                  onChange={(easing) => props.onEasingChange(bone()!.id, selectedKey()!.id, easing)}
                />
                <div class="hint" style={{ 'margin-top': '4px' }}>
                  拖动手柄调整关键帧到下一帧之间的曲线。X 轴限制在 0~1，Y 轴可超出以做轻微过冲。
                </div>
              </Show>
            </Show>
          </Show>
        </div>

        <Show when={boneIssues().length}>
          <div class="section">
            <h4>骨骼检查</h4>
            <div class="issue-list">
              <For each={boneIssues().slice(0, 6)}>
                {(issue) => (
                  <div class={`issue ${issue.level}`}>
                    <span style={{ flex: 1 }}>{issue.message}</span>
                    <Show when={issue.at !== undefined}>
                      <button class="small ghost" onClick={() => props.onGoToIssue(issue)}>
                        定位
                      </button>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </Show>

      {/* ---------------- Part ---------------- */}
      <Show when={part()}>
        {(p) => (
          <div class="section">
            <h4>部件</h4>
            <div class="field">
              <label>名称</label>
              <input value={p().name} onInput={(e) => props.onPartChange(p().id, { name: e.currentTarget.value })} />
            </div>
            <div class="field">
              <label>绑定骨骼</label>
              <select
                value={p().boneId}
                onChange={(e) => props.onPartChange(p().id, { boneId: e.currentTarget.value })}
              >
                <For each={props.rig.bones}>{(b) => <option value={b.id}>{b.name}</option>}</For>
              </select>
            </div>
            <div class="field">
              <label>所属分组</label>
              <select
                value={p().groupId}
                onChange={(e) => props.onPartChange(p().id, { groupId: e.currentTarget.value })}
              >
                <For each={props.rig.groups}>{(g) => <option value={g.id}>{g.name}</option>}</For>
              </select>
            </div>
            <div class="field">
              <label>填充色</label>
              <input
                type="color"
                value={toHex(p().fill)}
                onInput={(e) => props.onPartChange(p().id, { fill: fromHex(e.currentTarget.value, p().fill[3]) })}
              />
            </div>
            <div class="field">
              <label>边线色</label>
              <input
                type="color"
                value={toHex(p().stroke)}
                onInput={(e) => props.onPartChange(p().id, { stroke: fromHex(e.currentTarget.value, p().stroke[3]) })}
              />
            </div>
            <div class="field">
              <label>不透明度</label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(p().fill[3] * 100)}
                onInput={(e) => {
                  const a = parseFloat(e.currentTarget.value) / 100;
                  props.onPartChange(p().id, {
                    fill: [p().fill[0], p().fill[1], p().fill[2], a],
                  });
                }}
              />
            </div>
            <div class="field">
              <label>层级</label>
              <input
                class="mono"
                type="number"
                value={p().z}
                onInput={(e) => props.onPartChange(p().id, { z: parseInt(e.currentTarget.value, 10) || 0 })}
              />
            </div>
            <div class="kv">
              <span>顶点数</span>
              <span class="mono">{p().points.length}</span>
            </div>
            <button
              class="small"
              style={{ 'margin-top': '6px', width: '100%' }}
              onClick={() => {
                const b = props.rig.bones.find((x) => x.id === p().boneId);
                if (!b) return;
                const dx = b.pivot.x;
                const dy = b.pivot.y;
                void dx;
                void dy;
                props.onPartPointsReplace(
                  p().id,
                  p().points.map((pt) => ({ x: pt.x, y: pt.y })),
                  { ...b.pivot },
                );
              }}
            >
              把绑定骨骼的旋转中心对齐到部件中心
            </button>
            <div class="hint" style={{ 'margin-top': '6px' }}>
              旋转中心决定部件绕哪一点旋转。胎儿/骨盆/产道已按解剖结构拆分为独立部件，可在此微调绑定。
            </div>
          </div>
        )}
      </Show>

      {/* ---------------- Validation ---------------- */}
      <div class="section">
        <h4>
          校验{' '}
          {errorCount() > 0 ? (
            <span class="danger-text">({errorCount()} 个错误)</span>
          ) : (
            <span class="ok-text">通过</span>
          )}
        </h4>
        <Show when={props.issues.length} fallback={<div class="hint">未发现关节超限与绑定问题，可以保存。</div>}>
          <div class="issue-list">
            <For each={props.issues.slice(0, 8)}>
              {(issue) => (
                <div class={`issue ${issue.level}`}>
                  <span style={{ flex: 1 }}>{issue.message}</span>
                  <Show when={issue.at !== undefined}>
                    <button class="small ghost" onClick={() => props.onGoToIssue(issue)}>
                      定位
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
        <button
          class="primary"
          style={{ width: '100%', 'margin-top': '10px' }}
          disabled={!props.canSave || !props.dirty}
          onClick={props.onSave}
          title={props.canSave ? '保存到本地存档' : '存在关节超限错误，无法保存'}
        >
          {props.canSave ? (props.dirty ? '保存镜头' : '已保存') : '存在超限，禁止保存'}
        </button>
        <Show when={!props.canSave}>
          <div class="hint danger-text" style={{ 'margin-top': '4px' }}>
            骨骼超出关节活动角度时会阻止保存，请先修正后再提交。
          </div>
        </Show>
      </div>
    </div>
  );
}

function toHex(c: [number, number, number, number]): string {
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${f(c[0])}${f(c[1])}${f(c[2])}`;
}

function fromHex(hex: string, alpha: number): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1, alpha];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export { boneMap };
