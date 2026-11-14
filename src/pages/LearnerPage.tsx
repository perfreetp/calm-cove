import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Stage } from '../components/Stage';
import { appState, projectById, shotById } from '../store';
import { navigate, routes } from '../router';
import type { Shot } from '../core/types';
import { assetUrl } from '../core/standalone';
import { ANCHOR_LABELS } from '../core/templates';

export interface LearnerPageProps {
  shotId?: string;
}

/** Read-only playback: only approved / delivered shots are visible. */
function playbackShots(): Shot[] {
  return appState.shots.filter((s) => s.status === 'approved' || s.status === 'delivered');
}

export function LearnerPage(props: LearnerPageProps) {
  const shot = createMemo(() => (props.shotId ? shotById(props.shotId) : undefined));
  const playable = createMemo(() => {
    const s = shot();
    return s && (s.status === 'approved' || s.status === 'delivered') ? s : undefined;
  });

  return (
    <Show when={props.shotId} fallback={<LearnerList />}>
      <Show
        when={playable()}
        fallback={
          <div class="page">
            <div class="empty">
              该镜头尚未通过审核，学员端不可回放。
              <div style={{ 'margin-top': '10px' }}>
                <button class="small" onClick={() => navigate(routes.learner())}>
                  返回列表
                </button>
              </div>
            </div>
          </div>
        }
      >
        <Playback shot={playable()!} />
      </Show>
    </Show>
  );
}

function LearnerList() {
  const list = createMemo(() => playbackShots());
  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>学员端回放</h1>
          <p>只读浏览已通过审核的镜头，可切换半透明骨骼层与正常画面。</p>
        </div>
      </div>
      <Show when={list().length} fallback={<div class="empty">暂无可回放的镜头。</div>}>
        <div class="grid-projects">
          <For each={list()}>
            {(item) => {
              const project = () => projectById(item.projectId);
              return (
                <div class="card clickable" onClick={() => navigate(routes.learnerShot(item.id))}>
                  <div class="row">
                    <span class="badge info mono">{item.code}</span>
                    <b style={{ flex: 1 }}>{item.title}</b>
                    <span class="badge ok">已通过</span>
                  </div>
                  <div class="hint" style={{ 'margin-top': '6px' }}>
                    {project()?.courseName} · {item.duration.toFixed(1)}s · {project()?.resolution.label}
                  </div>
                  <div class="row" style={{ 'margin-top': '10px' }}>
                    <Show when={item.appliedActions.length}>
                      <span class="badge violet">{item.appliedActions.map((a) => a.actionName).join('、')}</span>
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function Playback(props: { shot: Shot }) {
  const project = () => projectById(props.shot.projectId);
  const fps = createMemo(() => project()?.fps ?? 24);
  const [time, setTime] = createSignal(0);
  const [playing, setPlaying] = createSignal(true);
  const [showBones, setShowBones] = createSignal(false);
  const [boneAlpha, setBoneAlpha] = createSignal(0.55);
  const [showLabels, setShowLabels] = createSignal(true);
  const [speed, setSpeed] = createSignal(1);

  let raf = 0;
  let last = 0;
  onMount(() => {
    const tick = (ts: number) => {
      if (playing()) {
        const dt = last ? (ts - last) / 1000 : 0;
        last = ts;
        const next = time() + dt * speed();
        setTime(next >= props.shot.duration ? next % Math.max(0.001, props.shot.duration) : next);
      } else last = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  const frameCount = createMemo(() => Math.max(1, Math.round(props.shot.duration * fps())));
  const currentFrame = createMemo(() => Math.min(frameCount(), Math.round(time() * fps())));

  return (
    <div class="learner-page">
      <div class="learner-info">
        <button class="small ghost" onClick={() => navigate(routes.learner())}>
          ← 回放列表
        </button>
        <span class="crumb-sep" />
        <span class="mono small">{props.shot.code}</span>
        <b>{props.shot.title}</b>
        <span class="muted small">{project()?.courseName}</span>
        <span class="badge ok">只读</span>
        <div style={{ flex: 1 }} />
        <label class="toggle">
          <input type="checkbox" checked={showBones()} onChange={(e) => setShowBones(e.currentTarget.checked)} />
          半透明骨骼层
        </label>
        <Show when={showBones()}>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(boneAlpha() * 100)}
            onInput={(e) => setBoneAlpha(parseFloat(e.currentTarget.value) / 100)}
            style={{ width: '80px' }}
          />
        </Show>
        <label class="toggle">
          <input type="checkbox" checked={showLabels()} onChange={(e) => setShowLabels(e.currentTarget.checked)} />
          解剖标注
        </label>
      </div>

      <div class="learner-stage">
        <Stage
          labelBones={ANCHOR_LABELS[props.shot.rig.templateId] ?? []}
          rig={props.shot.rig}
          tracks={props.shot.tracks}
          time={time()}
          showBones={showBones()}
          boneAlpha={boneAlpha()}
          showGuides={false}
          showLabels={showLabels()}
          interactive={false}
        />
      </div>

      <div class="playback-bar">
        <button class="primary small" onClick={() => setPlaying((p) => !p)} style={{ 'min-width': '62px' }}>
          {playing() ? '暂停' : '播放'}
        </button>
        <button class="small" onClick={() => setTime(Math.max(0, (currentFrame() - 1) / fps()))}>
          ◀Prev
        </button>
        <button class="small" onClick={() => setTime(Math.min(props.shot.duration, (currentFrame() + 1) / fps()))}>
          Next▶
        </button>
        <span class="mono small" style={{ 'min-width': '132px' }}>
          {time().toFixed(2)}s · 帧 {currentFrame()}/{frameCount()}
        </span>
        <input
          type="range"
          min="0"
          max={props.shot.duration}
          step={1 / fps()}
          value={time()}
          onInput={(e) => {
            setPlaying(false);
            setTime(parseFloat(e.currentTarget.value));
          }}
          style={{ flex: 1 }}
        />
        <label class="small muted">速度</label>
        <select
          value={speed()}
          onChange={(e) => setSpeed(parseFloat(e.currentTarget.value))}
          style={{ padding: '2px 6px' }}
        >
          <For each={[0.25, 0.5, 1, 1.5, 2]}>{(s) => <option value={s}>{s}×</option>}</For>
        </select>
        <Show when={props.shot.appliedActions.length}>
          <span class="badge violet">{props.shot.appliedActions.map((a) => a.actionName).join('、')}</span>
        </Show>
      </div>

      <Show when={assetUrl()}>
        <div class="hint" style={{ padding: '0 16px 10px' }}>
          序列帧资源：{assetUrl()}
        </div>
      </Show>
    </div>
  );
}
