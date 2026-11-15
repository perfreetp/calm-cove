import { createMemo, createSignal, For, Show } from 'solid-js';
import type { EditorStore } from '../store/editor';
import { ACTION_NODES, METRICS } from '../data/constants';
import type { EasingType, Keyframe, Violation } from '../types';
import { VIOLATION_TYPE_LABEL } from '../lib/rules';

interface Props {
  editor: EditorStore;
  readOnly?: boolean;
}

const NODE_COLORS: Record<string, string> = {
  disinfect: '#8e44ad',
  insert: '#c0392b',
  fix: '#2980b9',
  withdraw: '#d35400',
  press: '#27ae60',
};

const EASING_LABEL: Record<EasingType, string> = {
  linear: '线性',
  easeInOut: '缓入缓出',
  bezier: '贝塞尔',
};

export default function Timeline(props: Props) {
  const editor = props.editor;
  const [selectedKf, setSelectedKf] = createSignal<string | null>(null);

  const duration = () => editor.doc.duration;
  const pct = (t: number) => `${(t / duration()) * 100}%`;

  const tracks = createMemo(() => {
    const boneTracks = editor.doc.bones.map((b) => ({ id: b.id, name: b.name, kind: 'bone' as const }));
    const usedMetrics = new Set(
      editor.doc.keyframes.filter((k) => k.kind === 'metric').map((k) => k.track),
    );
    const metricTracks = METRICS.filter((m) => usedMetrics.has(m.id)).map((m) => ({
      id: m.id,
      name: m.name,
      kind: 'metric' as const,
    }));
    return [...boneTracks, ...metricTracks];
  });

  const rulerTicks = createMemo(() => {
    const step = duration() <= 120 ? 10 : 30;
    const out: number[] = [];
    for (let t = 0; t <= duration(); t += step) out.push(t);
    return out;
  });

  const selectedFrame = (): Keyframe | undefined =>
    editor.doc.keyframes.find((k) => k.id === selectedKf());

  function onRulerClick(e: MouseEvent) {
    if (props.readOnly) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * duration();
    editor.seek(t);
  }

  function startDragKf(e: MouseEvent, kf: Keyframe) {
    if (props.readOnly) return;
    e.stopPropagation();
    setSelectedKf(kf.id);
    const row = (e.currentTarget as HTMLElement).closest('.track-row') as HTMLElement;
    const rect = row.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const t = Math.min(duration(), Math.max(0, ((ev.clientX - rect.left) / rect.width) * duration()));
      editor.updateKeyframe(kf.id, { time: Number(t.toFixed(2)) });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startDragNodeEdge(nodeId: string, edge: 'start' | 'end', e: MouseEvent) {
    if (props.readOnly) return;
    e.stopPropagation();
    const band = (e.currentTarget as HTMLElement).closest('.timeline-ruler') as HTMLElement;
    const rect = band.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const t = Math.min(duration(), Math.max(0, ((ev.clientX - rect.left) / rect.width) * duration()));
      const r = editor.doc.nodeRanges[nodeId];
      if (edge === 'start') editor.setNodeRange(nodeId, Math.min(t, r.end - 0.5), r.end);
      else editor.setNodeRange(nodeId, r.start, Math.max(t, r.start + 0.5));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  return (
    <div class="timeline-panel">
      {/* 传输控制 */}
      <div class="transport">
        <button class="primary" onClick={() => editor.togglePlay()}>
          {editor.playing() ? '⏸ 暂停' : '▶ 播放'}
        </button>
        <button
          onClick={() => {
            editor.pause();
            editor.seek(Math.max(0, editor.time() - 1 / editor.fps()));
          }}
        >
          ⏮ 上一帧
        </button>
        <button
          onClick={() => {
            editor.pause();
            editor.seek(Math.min(duration(), editor.time() + 1 / editor.fps()));
          }}
        >
          下一帧 ⏭
        </button>
        <span class="time-readout mono">
          {editor.time().toFixed(2)} / {duration().toFixed(1)}s
        </span>
        <Show when={!props.readOnly}>
          <label>总时长(s)</label>
          <input
            type="number"
            style={{ width: '90px' }}
            value={duration()}
            onChange={(e) => editor.setDuration(Number(e.currentTarget.value))}
          />
        </Show>
        <div class="spacer" style={{ flex: 1 }} />
        <span class="small muted">
          违规区间 <b style={{ color: 'var(--danger)' }}>{editor.violations().length}</b> 处 ·
          自动评分 <b style={{ color: 'var(--primary-dark)' }}>{editor.score().total}</b> 分
        </span>
      </div>

      {/* 节点泳道 + 刻度尺 */}
      <div class="timeline-ruler" onClick={onRulerClick}>
        <For each={rulerTicks()}>
          {(t) => (
            <div class="tick" style={{ left: pct(t) }}>
              {t}s
            </div>
          )}
        </For>
        <For each={ACTION_NODES}>
          {(node) => {
            const r = editor.doc.nodeRanges[node.id];
            if (!r) return null;
            const nodeViolations = () => editor.violations().filter((v) => v.nodeId === node.id);
            return (
              <div
                class="node-band"
                style={{
                  left: pct(r.start),
                  width: pct(Math.max(0.1, r.end - r.start)),
                  background: NODE_COLORS[node.id],
                  opacity: nodeViolations().length ? 0.75 : 0.92,
                }}
                title={`${node.name} ${r.start.toFixed(1)}~${r.end.toFixed(1)}s(规范 ≥${node.minDuration}s${
                  node.maxDuration !== null ? `,≤${node.maxDuration}s` : ''
                })`}
              >
                {node.order}.{node.name}
                {nodeViolations().length > 0 && ` ⚠${nodeViolations().length}`}
                <Show when={!props.readOnly}>
                  <span
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', background: 'rgba(0,0,0,0.25)' }}
                    onMouseDown={(e) => startDragNodeEdge(node.id, 'start', e)}
                  />
                  <span
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '8px', cursor: 'ew-resize', background: 'rgba(0,0,0,0.25)' }}
                    onMouseDown={(e) => startDragNodeEdge(node.id, 'end', e)}
                  />
                </Show>
              </div>
            );
          }}
        </For>
        <div class="playhead" style={{ left: pct(editor.time()) }} />
      </div>

      {/* 违规汇总泳道 */}
      <div class="track-row" style={{ height: '26px', background: '#fbfcfd' }}>
        <span class="track-name">违规标红</span>
        <For each={editor.violations()}>
          {(v: Violation) => (
            <div
              class="violation-band"
              style={{ left: pct(v.start), width: pct(Math.max(0.2, v.end - v.start)) }}
              title={`${VIOLATION_TYPE_LABEL[v.type]}:${v.message}(${v.start.toFixed(1)}s~${v.end.toFixed(1)}s)`}
              onClick={() => editor.seek(v.start)}
            />
          )}
        </For>
      </div>

      {/* 轨道 */}
      <For each={tracks()}>
        {(track) => (
          <div class="track-row" onClick={onRulerClick}>
            <span class="track-name">{track.kind === 'metric' ? '📏 ' : '🦴 '}{track.name}</span>
            <For each={editor.doc.keyframes.filter((k) => k.track === track.id).sort((a, b) => a.time - b.time)}>
              {(kf) => (
                <div
                  class={`kf-diamond ${track.kind === 'metric' ? 'metric' : ''} ${selectedKf() === kf.id ? 'selected' : ''}`}
                  style={{ left: pct(kf.time) }}
                  title={`${kf.time.toFixed(2)}s · 值 ${kf.value.toFixed(1)} · ${EASING_LABEL[kf.easing]}`}
                  onMouseDown={(e) => startDragKf(e, kf)}
                />
              )}
            </For>
          </div>
        )}
      </For>

      {/* 选中关键帧编辑 */}
      <Show when={!props.readOnly && selectedFrame() !== undefined ? selectedFrame() : undefined}>
        {(kf) => (
          <div class="metric-box mt8">
            <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
              <b>关键帧编辑</b>
              <button class="danger" style={{ padding: '2px 10px' }} onClick={() => {
                editor.deleteKeyframe(kf().id);
                setSelectedKf(null);
              }}>
                删除
              </button>
            </div>
            <div class="row-flex mt8">
              <label style={{ width: '56px' }}>时间(s)</label>
              <input
                type="number"
                style={{ width: '90px' }}
                step={0.5}
                value={kf().time}
                onChange={(e) => editor.updateKeyframe(kf().id, { time: Number(e.currentTarget.value) })}
              />
              <label style={{ width: '40px' }}>数值</label>
              <input
                type="number"
                style={{ width: '90px' }}
                step={0.5}
                value={kf().value}
                onChange={(e) => editor.updateKeyframe(kf().id, { value: Number(e.currentTarget.value) })}
              />
            </div>
            <div class="row-flex mt8">
              <label style={{ width: '56px' }}>缓动</label>
              <div class="easing-seg" style={{ flex: 1 }}>
                <For each={(['linear', 'easeInOut', 'bezier'] as EasingType[])}>
                  {(ea) => (
                    <button
                      class={kf().easing === ea ? 'active' : ''}
                      onClick={() => editor.updateKeyframe(kf().id, { easing: ea })}
                    >
                      {EASING_LABEL[ea]}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <Show when={kf().easing === 'bezier'}>
              <div class="row-flex mt8 gap">
                {(['0', '1', '2', '3'] as const).map((i) => {
                  const idx = Number(i);
                  const labels = ['X1', 'Y1', 'X2', 'Y2'];
                  return (
                    <>
                      <label style={{ width: '30px' }}>{labels[idx]}</label>
                      <input
                        type="number"
                        style={{ width: '70px' }}
                        step={0.05}
                        value={(kf().bezier ?? [0.42, 0, 0.58, 1])[idx]}
                        onChange={(e) => {
                          const next = [...(kf().bezier ?? [0.42, 0, 0.58, 1])] as [number, number, number, number];
                          next[idx] = Number(e.currentTarget.value);
                          editor.updateKeyframe(kf().id, { bezier: next });
                        }}
                      />
                    </>
                  );
                })}
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
