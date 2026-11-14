import { For, Show, createMemo, createSignal, onMount, onCleanup } from 'solid-js';
import type { Bone, Keyframe, TrackMap } from '../core/types';
import { sortKeys } from '../core/animation';
import { topoSortBones } from '../core/skeleton';

export interface TimelineProps {
  bones: Bone[];
  tracks: TrackMap;
  duration: number;
  fps: number;
  time: number;
  playing: boolean;
  selectedBoneId: string | null;
  selectedKeyId: string | null;
  violatingBones: Set<string>;
  /** Ghost ranges showing applied library actions. */
  actionRanges?: Array<{ start: number; end: number; name: string }>;
  onSeek: (time: number) => void;
  onSelectBone: (boneId: string) => void;
  onSelectKey: (boneId: string, keyId: string | null) => void;
  onMoveKey: (boneId: string, keyId: string, time: number, commit: boolean) => void;
  onTogglePlay: () => void;
  onStepFrame: (delta: number) => void;
  onSetFps?: (fps: number) => void;
}

const LABEL_WIDTH = 168;

export function Timeline(props: TimelineProps) {
  let scrollRef: HTMLDivElement | undefined;
  const [laneWidth, setLaneWidth] = createSignal(640);
  const [dragKey, setDragKey] = createSignal<{ boneId: string; keyId: string } | null>(null);

  onMount(() => {
    const measure = () => {
      if (!scrollRef) return;
      const w = scrollRef.clientWidth - LABEL_WIDTH - 2;
      setLaneWidth(Math.max(240, w));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (scrollRef) ro.observe(scrollRef);
    onCleanup(() => ro.disconnect());
  });

  const orderedBones = createMemo(() => topoSortBones(props.bones));
  const visibleBones = createMemo(() => {
    const withTracks = new Set(Object.keys(props.tracks).filter((id) => (props.tracks[id] ?? []).length > 0));
    return orderedBones().filter((b) => withTracks.has(b.id) || b.id === props.selectedBoneId);
  });

  const timeToX = (time: number) => (time / Math.max(0.001, props.duration)) * laneWidth();
  const xToTime = (x: number) => Math.max(0, Math.min(props.duration, (x / Math.max(1, laneWidth())) * props.duration));

  const tickStep = createMemo(() => {
    const raw = props.duration / Math.max(4, Math.floor(laneWidth() / 74));
    const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20];
    return candidates.find((c) => c >= raw) ?? 20;
  });

  const ticks = createMemo(() => {
    const step = tickStep();
    const out: number[] = [];
    for (let t = 0; t <= props.duration + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000);
    return out;
  });

  const frameCount = createMemo(() => Math.max(1, Math.round(props.duration * props.fps)));
  const currentFrame = createMemo(() => Math.min(frameCount(), Math.round(props.time * props.fps)));

  const seekFromClientX = (clientX: number) => {
    const laneRect = scrollRef?.querySelector<HTMLElement>('.tl-ruler-inner');
    if (!laneRect) return;
    const rect = laneRect.getBoundingClientRect();
    props.onSeek(xToTime(clientX - rect.left));
  };

  const segmentStyle = (from: Keyframe, to: Keyframe) => ({
    left: `${timeToX(from.time)}px`,
    width: `${Math.max(1, timeToX(to.time) - timeToX(from.time))}px`,
    background:
      from.easing.type === 'linear'
        ? 'rgba(120,160,190,0.5)'
        : from.easing.type === 'easeInOut'
          ? 'rgba(90,220,170,0.55)'
          : 'rgba(167,139,250,0.75)',
  });

  return (
    <div class="timeline">
      <div class="transport">
        <button class="primary small" onClick={props.onTogglePlay} style={{ 'min-width': '64px' }}>
          {props.playing ? '暂停' : '播放'}
        </button>
        <button class="small" title="上一帧 (←)" onClick={() => props.onStepFrame(-1)}>
          ◀|
        </button>
        <button class="small" title="下一帧 (→)" onClick={() => props.onStepFrame(1)}>
          |▶
        </button>
        <span class="time mono">
          {props.time.toFixed(2)}s / {props.duration.toFixed(2)}s
          <span class="muted">
            {' '}
            · 帧 {currentFrame()}/{frameCount()}
          </span>
        </span>
        <input
          type="range"
          min={0}
          max={props.duration}
          step={1 / Math.max(1, props.fps)}
          value={props.time}
          onInput={(e) => props.onSeek(parseFloat(e.currentTarget.value))}
          style={{ flex: '1 1 120px' }}
        />
        <Show when={props.onSetFps}>
          <label class="small muted">FPS</label>
          <select
            value={props.fps}
            onChange={(e) => props.onSetFps?.(parseInt(e.currentTarget.value, 10))}
            style={{ padding: '2px 6px' }}
          >
            <For each={[12, 24, 25, 30]}>{(f) => <option value={f}>{f}</option>}</For>
          </select>
        </Show>
      </div>

      <div class="track-scroll" ref={scrollRef}>
        <div class="tl-inner" style={{ width: `${LABEL_WIDTH + laneWidth()}px` }}>
          <div class="tl-ruler">
            <div class="tl-label tl-corner">骨骼 / 轨道</div>
            <div
              class="tl-ruler-inner"
              style={{ width: `${laneWidth()}px` }}
              onPointerDown={(e) => seekFromClientX(e.clientX)}
            >
              <For each={ticks()}>
                {(t) => (
                  <div class="tick" style={{ left: `${timeToX(t)}px` }}>
                    {t.toFixed(tickStep() < 1 ? 1 : 0)}s
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class="tl-rows" style={{ width: `${LABEL_WIDTH + laneWidth()}px` }}>
            <For each={visibleBones()}>
              {(bone) => {
                const keys = createMemo(() => sortKeys(props.tracks[bone.id] ?? []));
                return (
                  <div class="tl-row">
                    <div
                      class="tl-label"
                      classList={{ selected: props.selectedBoneId === bone.id }}
                      onClick={() => props.onSelectBone(bone.id)}
                      title={`${bone.name} · 关节范围 ${bone.minAngle}°~${bone.maxAngle}°`}
                    >
                      <span class="tl-name">{bone.name}</span>
                      <Show when={props.violatingBones.has(bone.id)}>
                        <span class="violating">●</span>
                      </Show>
                      <span class="meta">{keys().length}</span>
                    </div>
                    <div
                      class="tl-lane"
                      style={{ width: `${laneWidth()}px` }}
                      onPointerDown={(e) => {
                        seekFromClientX(e.clientX);
                        props.onSelectBone(bone.id);
                      }}
                    >
                      <For each={keys().slice(0, -1)}>
                        {(from, i) => <div class="tl-segment" style={segmentStyle(from, keys()[i() + 1])} />}
                      </For>
                      <For each={keys()}>
                        {(k) => (
                          <div
                            class="tl-key"
                            classList={{
                              selected: props.selectedKeyId === k.id,
                              violating: k.rotation < bone.minAngle - 1e-6 || k.rotation > bone.maxAngle + 1e-6,
                            }}
                            style={{ left: `${timeToX(k.time)}px` }}
                            title={`${k.time.toFixed(2)}s · ${k.rotation.toFixed(1)}° · ${k.easing.type}`}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              props.onSelectBone(bone.id);
                              props.onSelectKey(bone.id, k.id);
                              setDragKey({ boneId: bone.id, keyId: k.id });
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                              const d = dragKey();
                              if (!d || d.keyId !== k.id) return;
                              const laneEl = (e.currentTarget as HTMLElement).parentElement!;
                              const rect = laneEl.getBoundingClientRect();
                              const snapped = Math.round(xToTime(e.clientX - rect.left) * props.fps) / props.fps;
                              props.onMoveKey(bone.id, k.id, snapped, false);
                            }}
                            onPointerUp={(e) => {
                              const d = dragKey();
                              if (d && d.keyId === k.id) {
                                const laneEl = (e.currentTarget as HTMLElement).parentElement!;
                                const rect = laneEl.getBoundingClientRect();
                                const snapped = Math.round(xToTime(e.clientX - rect.left) * props.fps) / props.fps;
                                props.onMoveKey(bone.id, k.id, snapped, true);
                                setDragKey(null);
                                try {
                                  (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                                } catch {
                                  /* ignore */
                                }
                              }
                            }}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={visibleBones().length === 0}>
              <div class="tl-empty">
                当前镜头还没有关键帧。选中骨骼后在画布上拖动，或按 <kbd>K</kbd> 打关键帧。
              </div>
            </Show>
            <For each={props.actionRanges ?? []}>
              {(range) => (
                <div
                  class="tl-ghost"
                  style={{
                    left: `${LABEL_WIDTH + timeToX(range.start)}px`,
                    width: `${Math.max(2, timeToX(range.end) - timeToX(range.start))}px`,
                  }}
                  title={`动作库：${range.name}`}
                />
              )}
            </For>
            <div class="tl-playhead" style={{ left: `${LABEL_WIDTH + timeToX(props.time)}px` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
