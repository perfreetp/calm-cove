import { For, Show, createMemo, createSignal } from 'solid-js';
import { appState, actionById, deleteAction, shotsUsingAction, updateActionTracks } from '../store';
import { navigate, routes } from '../router';
import { Modal, toast } from '../components/ui';
import type { MotionAction, Shot } from '../core/types';
import { countKeys, sortKeys, setEasing, cloneTracks } from '../core/animation';
import { EasingSwatch } from '../components/BezierEditor';
import { EASING_PRESETS, easingLabel } from '../core/easing';
import { fmtDateTime, STATUS_LABEL } from '../core/workflow';
import { validateShot } from '../core/validation';

export function LibraryPage() {
  const [selectedId, setSelectedId] = createSignal<string | null>(appState.actions[0]?.id ?? null);
  const [filter, setFilter] = createSignal('');
  const [pendingDelete, setPendingDelete] = createSignal<MotionAction | null>(null);

  const actions = createMemo(() => {
    const q = filter().trim();
    return appState.actions.filter((a) => !q || a.name.includes(q) || a.category.includes(q));
  });

  const selected = createMemo(() => (selectedId() ? actionById(selectedId()!) : undefined));
  const usedBy = createMemo(() => (selected() ? shotsUsingAction(selected()!.id) : []));

  const categoryCount = createMemo(() => {
    const set = new Set(appState.actions.map((a) => a.category));
    return set.size;
  });

  const applyEasePreset = (action: MotionAction, preset: 'linear' | 'easeInOut' | 'bezier', boneId: string) => {
    const tracks = cloneTracks(action.tracks);
    const easing =
      preset === 'linear'
        ? { type: 'linear' as const }
        : preset === 'easeInOut'
          ? { type: 'easeInOut' as const }
          : EASING_PRESETS.bezier;
    for (const k of tracks[boneId] ?? []) {
      tracks[boneId] = setEasing(tracks[boneId] ?? [], k.id, { ...easing });
    }
    // Defer the actual write until the user confirms the impact list.
    setPendingChange({ action, tracks, boneId, label: `统一为${easingLabel(easing)}` });
  };

  const [pendingChange, setPendingChange] = createSignal<null | {
    action: MotionAction;
    tracks: ReturnType<typeof cloneTracks>;
    boneId?: string;
    label: string;
  }>(null);

  const commitChange = () => {
    const change = pendingChange();
    if (!change) return;
    const result = updateActionTracks(change.action.id, change.tracks);
    toast(
      `动作「${change.action.name}」已更新，同步影响 ${result.affected.length} 个镜头。`,
      result.affected.length ? 'ok' : 'info',
    );
    setPendingChange(null);
  };

  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>动作库</h1>
          <p>动作可被多个镜头引用；修改动作时会先列出受影响的镜头，确认后再同步。</p>
        </div>
      </div>

      <div class="row wrap" style={{ 'margin-bottom': '14px' }}>
        <input
          placeholder="搜索动作 / 分类"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
          style={{ width: '240px' }}
        />
        <span class="badge">{appState.actions.length} 个动作</span>
        <span class="badge">{categoryCount()} 个分类</span>
        <span class="badge">{appState.shots.filter((s) => s.appliedActions.length).length} 个镜头引用了动作</span>
      </div>

      <div
        style={{
          display: 'grid',
          'grid-template-columns': 'minmax(0, 1fr) 380px',
          gap: '16px',
          'align-items': 'start',
        }}
      >
        <div class="col" style={{ gap: '8px' }}>
          <For each={actions()}>
            {(action) => {
              const refs = () => shotsUsingAction(action.id);
              return (
                <div
                  class="card clickable"
                  style={{
                    padding: '12px 14px',
                    'border-color': selectedId() === action.id ? 'var(--accent-dim)' : undefined,
                  }}
                  onClick={() => setSelectedId(action.id)}
                >
                  <div class="row wrap">
                    <b>{action.name}</b>
                    <span class="badge info">{action.category}</span>
                    <span class="muted small">{action.duration.toFixed(1)}s</span>
                    <span class="muted small">{countKeys(action.tracks)} 关键帧</span>
                    <Show when={refs().length}>
                      <span class="badge violet">被 {refs().length} 个镜头引用</span>
                    </Show>
                    <div style={{ flex: 1 }} />
                    <Show when={selectedId() === action.id}>
                      <span class="badge">当前选中</span>
                    </Show>
                  </div>
                  <div class="hint" style={{ 'margin-top': '5px' }}>
                    {action.description}
                  </div>
                  <Show when={refs().length}>
                    <div class="chip-row" style={{ 'margin-top': '6px' }}>
                      <For each={refs().slice(0, 8)}>
                        {(shot) => (
                          <button
                            class="badge info"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(routes.editor(shot.id));
                            }}
                          >
                            {shot.code}
                          </button>
                        )}
                      </For>
                      <Show when={refs().length > 8}>
                        <span class="badge">+{refs().length - 8}</span>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
          <Show when={actions().length === 0}>
            <div class="empty">没有匹配的动作。</div>
          </Show>
        </div>

        <div
          class="panel"
          style={{ 'border-radius': 'var(--radius)', border: '1px solid var(--line)', overflow: 'invisible' }}
        >
          <Show
            when={selected()}
            fallback={
              <div class="panel-body">
                <div class="empty">选择左侧动作查看详情。</div>
              </div>
            }
          >
            {(action) => (
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px', padding: '14px' }}>
                <div>
                  <h2>{action().name}</h2>
                  <div class="hint" style={{ 'margin-top': '4px' }}>
                    {action().description}
                  </div>
                </div>
                <div class="kv">
                  <span>分类</span>
                  <span>{action().category}</span>
                </div>
                <div class="kv">
                  <span>骨骼模板</span>
                  <span class="mono">{action().templateId}</span>
                </div>
                <div class="kv">
                  <span>时长</span>
                  <span class="mono">{action().duration.toFixed(2)}s</span>
                </div>
                <div class="kv">
                  <span>更新时间</span>
                  <span class="mono">{fmtDateTime(action().updatedAt)}</span>
                </div>

                <div class="divider" />
                <div>
                  <h4 style={{ 'font-size': '12px', 'letter-spacing': '0.05em', color: 'var(--text-2)' }}>引用镜头</h4>
                  <Show
                    when={usedBy().length}
                    fallback={<div class="hint">此动作还没有被任何镜头引用，可安全编辑。</div>}
                  >
                    <div class="col" style={{ gap: '5px', 'margin-top': '6px' }}>
                      <For each={usedBy()}>
                        {(shot) => (
                          <div class="row" style={{ gap: '6px' }}>
                            <span class="badge info mono">{shot.code}</span>
                            <span class="small" style={{ flex: 1 }}>
                              {shot.title}
                            </span>
                            <span class={`badge tone-${shot.status}`}>{STATUS_LABEL[shot.status]}</span>
                            <button class="small ghost" onClick={() => navigate(routes.editor(shot.id))}>
                              打开
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                <div class="divider" />
                <div>
                  <h4 style={{ 'font-size': '12px', 'letter-spacing': '0.05em', color: 'var(--text-2)' }}>插值预设</h4>
                  <For each={Object.keys(action().tracks)}>
                    {(boneId) => (
                      <div style={{ 'margin-top': '8px' }}>
                        <div class="small muted" style={{ 'margin-bottom': '4px' }}>
                          {boneId}
                        </div>
                        <div class="easing-grid">
                          <button class="small" onClick={() => applyEasePreset(action(), 'linear', boneId)}>
                            线性
                          </button>
                          <button class="small" onClick={() => applyEasePreset(action(), 'easeInOut', boneId)}>
                            缓入缓出
                          </button>
                          <button
                            class="small"
                            onClick={() => {
                              const tracks = cloneTracks(action().tracks);
                              for (const k of action().tracks[boneId] ?? []) {
                                tracks[boneId] = setEasing(tracks[boneId] ?? [], k.id, EASING_PRESETS.bezier);
                              }
                              setPendingChange({ action: action(), tracks, boneId, label: '自定义贝塞尔曲线' });
                            }}
                          >
                            自定义贝塞尔
                          </button>
                        </div>
                        <div class="row" style={{ gap: '6px', 'margin-top': '6px', 'flex-wrap': 'wrap' }}>
                          <For each={sortKeys(action().tracks[boneId] ?? [])}>
                            {(k) => (
                              <span class="row badge" style={{ gap: '4px', padding: '2px 6px' }}>
                                <span class="mono">{k.time.toFixed(2)}s</span>
                                <EasingSwatch easing={k.easing} />
                                <span class="mono">{k.rotation.toFixed(0)}°</span>
                              </span>
                            )}
                          </For>
                        </div>
                      </div>
                    )}
                  </For>
                </div>

                <div class="divider" />
                <div class="row wrap">
                  <button
                    class="small danger"
                    disabled={usedBy().length > 0}
                    title={usedBy().length ? '仍被镜头引用，先解除引用再删除' : '删除动作'}
                    onClick={() => setPendingDelete(action())}
                  >
                    删除动作
                  </button>
                  <button class="small" onClick={() => toast('动作描述修改会立即生效。', 'info', 2000)}>
                    提示
                  </button>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>

      <Show when={pendingChange()}>
        <Modal
          title="确认修改动作并同步"
          onClose={() => setPendingChange(null)}
          footer={
            <>
              <button onClick={() => setPendingChange(null)}>取消</button>
              <button class="primary" onClick={commitChange}>
                确认修改并同步 {pendingChange()!.action.name}
              </button>
            </>
          }
        >
          <div class="issue warning">
            <span>此修改会影响 {usedBy().length} 个正在引用该动作的镜头，这些镜头的对应关键帧将被重新烘焙：</span>
          </div>
          <div class="col" style={{ gap: '6px' }}>
            <For each={usedBy()}>{(shot) => <ShotImpactRow shot={shot} />}</For>
            <Show when={usedBy().length === 0}>
              <div class="hint">目前没有镜头引用该动作，修改不会影响任何制作条目。</div>
            </Show>
          </div>
          <div class="hint">
            变更内容：{pendingChange()!.label}（{pendingChange()!.boneId}）。已通过审核的镜头会被标记为需要重新审核。
          </div>
        </Modal>
      </Show>

      <Show when={pendingDelete()}>
        <Modal
          title="删除动作"
          onClose={() => setPendingDelete(null)}
          footer={
            <>
              <button onClick={() => setPendingDelete(null)}>取消</button>
              <button
                class="danger"
                onClick={() => {
                  const result = deleteAction(pendingDelete()!.id);
                  toast(`动作已删除${result.affected.length ? `，影响 ${result.affected.length} 个镜头` : ''}。`, 'ok');
                  setPendingDelete(null);
                  setSelectedId(appState.actions[0]?.id ?? null);
                }}
              >
                删除
              </button>
            </>
          }
        >
          <p class="hint">
            确定删除「{pendingDelete()!.name}」？引用它的镜头会保留已烘焙的关键帧，但会失去与动作库的关联。
          </p>
        </Modal>
      </Show>
    </div>
  );
}

function ShotImpactRow(props: { shot: Shot }) {
  const errors = createMemo(() => validateShot(props.shot, new Set()).errors.length);
  return (
    <div class="row" style={{ gap: '6px', padding: '5px 0', 'border-bottom': '1px solid var(--line)' }}>
      <span class="badge info mono">{props.shot.code}</span>
      <span class="small" style={{ flex: 1 }}>
        {props.shot.title}
      </span>
      <span class={`badge tone-${props.shot.status}`}>{STATUS_LABEL[props.shot.status]}</span>
      <Show when={errors()}>
        <span class="badge danger">现有 {errors()} 处超限</span>
      </Show>
      <Show when={props.shot.status === 'approved'}>
        <span class="badge warn">已通过，需重新审核</span>
      </Show>
    </div>
  );
}
