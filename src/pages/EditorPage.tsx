import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { createStore, produce, unwrap } from 'solid-js/store';
import { Stage } from '../components/Stage';
import { Timeline } from '../components/Timeline';
import { RigTree } from '../components/RigTree';
import { Inspector } from '../components/Inspector';
import { Modal, toast } from '../components/ui';
import {
  countKeys,
  sampleTrack,
  setEasing as setEasingOnKeys,
  sortKeys,
  upsertKeyframe,
  type SampleValue,
} from '../core/animation';
import { outOfRangeBones } from '../core/scene';
import { validateShot, type ValidationIssue } from '../core/validation';
import type { Bone, Easing, Rig, Shot, TrackMap, Vec2 } from '../core/types';
import {
  actionById,
  appState,
  applyActionToShot,
  commitShotEdit,
  copyMotionToNextShot,
  projectById,
  shotsOf,
  shotById,
  submitShot,
} from '../store';
import { navigate, routes } from '../router';
import { STATUS_LABEL, deadlineInfo, lastRejection } from '../core/workflow';
import { ANCHOR_LABELS } from '../core/templates';

export interface EditorPageProps {
  shotId: string;
}

type DragMode = 'select' | 'rotate' | 'pivot';

const EMPTY_RIG: Rig = {
  id: '',
  name: '',
  templateId: '',
  rigWidth: 1600,
  rigHeight: 900,
  bones: [],
  groups: [],
  parts: [],
};

export function EditorPage(props: EditorPageProps) {
  const shot = createMemo(() => shotById(props.shotId));
  const project = createMemo(() => (shot() ? projectById(shot()!.projectId) : undefined));

  const [rig, setRig] = createStore<Rig>(structuredClone(EMPTY_RIG));
  const [tracks, setTracks] = createStore<TrackMap>({});
  const [duration, setDuration] = createSignal(6);
  const [fps, setFps] = createSignal(24);
  const [loadedShotId, setLoadedShotId] = createSignal('');
  const [time, setTime] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [loop, setLoop] = createSignal(true);
  const [selectedBoneId, setSelectedBoneId] = createSignal<string | null>(null);
  const [selectedPartId, setSelectedPartId] = createSignal<string | null>(null);
  const [selectedKeyId, setSelectedKeyId] = createSignal<string | null>(null);
  const [hoverBoneId, setHoverBoneId] = createSignal<string | null>(null);
  const [dragMode, setDragMode] = createSignal<DragMode>('rotate');
  const [autoKey, setAutoKey] = createSignal(true);
  const [showBones, setShowBones] = createSignal(true);
  const [boneAlpha, setBoneAlpha] = createSignal(0.85);
  const [showLabels, setShowLabels] = createSignal(true);
  const [overrides, setOverrides] = createSignal<Record<string, { rotation?: number; x?: number; y?: number }>>({});
  const [dirty, setDirty] = createSignal(false);
  const [savedAt, setSavedAt] = createSignal('');
  const [showActionPicker, setShowActionPicker] = createSignal(false);
  const [actionStart, setActionStart] = createSignal(0);
  const [actionFilter, setActionFilter] = createSignal('');

  let rafId = 0;
  let lastTick = 0;

  const loadShot = (s: Shot) => {
    const rigCopy = structuredClone(unwrap(s.rig));
    const trackCopy = structuredClone(unwrap(s.tracks));
    setRig(rigCopy);
    setTracks(trackCopy);
    setDuration(s.duration);
    setFps(project()?.fps ?? 24);
    setTime(0);
    setOverrides({});
    setSelectedBoneId(s.rig.bones[0]?.id ?? null);
    setSelectedPartId(s.rig.parts[0]?.id ?? null);
    setSelectedKeyId(null);
    setDirty(false);
    setLoadedShotId(s.id);
  };

  const ensureLoaded = () => {
    const s = shot();
    if (s && s.id !== loadedShotId()) loadShot(s);
    return s;
  };

  // The editor stays mounted while only the shot id in the route changes
  // (e.g. "复制到下一镜头"), so reload whenever the target shot changes.
  createEffect(() => {
    const target = props.shotId;
    const s = shot();
    if (!s) return;
    if (s.id !== loadedShotId()) loadShot(s);
    void target;
  });

  onMount(() => {
    ensureLoaded();
    const tick = (ts: number) => {
      if (playing()) {
        const dt = lastTick ? (ts - lastTick) / 1000 : 0;
        lastTick = ts;
        const next = time() + dt;
        if (next >= duration()) {
          if (loop()) {
            setTime(next % Math.max(0.001, duration()));
          } else {
            setTime(duration());
            setPlaying(false);
          }
        } else {
          setTime(next);
        }
      } else {
        lastTick = 0;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(rafId));
  });

  const stepFrame = (delta: number) => {
    setPlaying(false);
    const max = Math.round(duration() * fps());
    const frame = Math.max(0, Math.min(max, Math.round(time() * fps()) + delta));
    setTime(frame / fps());
  };

  const currentPoseOf = (boneId: string): SampleValue => {
    const keys = tracks[boneId];
    if (!keys || keys.length === 0) {
      const ov = overrides()[boneId];
      return { rotation: ov?.rotation ?? 0, x: ov?.x ?? 0, y: ov?.y ?? 0 };
    }
    return sampleTrack(keys, time());
  };

  const violating = createMemo(() => new Set(outOfRangeBones(rig as Rig, tracks as TrackMap)));

  const validation = createMemo(() => {
    const s = shot();
    if (!s) {
      return { issues: [], errors: [], warnings: [], canSave: false, canSubmit: false };
    }
    // Pass the live store proxies straight through: `unwrap` returns the raw
    // object without subscribing, which would freeze this memo on the state it
    // saw at mount and let invalid shots be saved.
    const draftShot: Shot = {
      ...s,
      rig: rig as Rig,
      tracks: tracks as TrackMap,
      duration: duration(),
    };
    return validateShot(draftShot, new Set(appState.actions.map((a) => a.id)));
  });

  const markDirty = () => setDirty(true);

  const handleSave = (): boolean => {
    const result = validation();
    if (!result.canSave) {
      toast(`存在 ${result.errors.length} 处关节超限，已阻止保存。`, 'error');
      return false;
    }
    const s = shot();
    if (!s) return false;
    commitShotEdit(s.id, {
      rig: structuredClone(unwrap(rig) as Rig),
      tracks: structuredClone(unwrap(tracks) as TrackMap),
      duration: duration(),
    });
    setDirty(false);
    setSavedAt(new Date().toLocaleTimeString());
    toast('镜头已保存。', 'ok');
    return true;
  };

  onMount(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepFrame(e.shiftKey ? -fps() : -1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepFrame(e.shiftKey ? fps() : 1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key.toLowerCase() === 'k' && !e.ctrlKey && !e.metaKey) {
        const id = selectedBoneId();
        if (id) {
          e.preventDefault();
          keyBone(id, currentPoseOf(id));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    onCleanup(() => window.removeEventListener('keydown', onKeyDown));
  });

  const keyBone = (boneId: string, value: SampleValue) => {
    setTracks(
      produce((t) => {
        t[boneId] = upsertKeyframe(t[boneId] ?? [], time(), value);
      }),
    );
    markDirty();
  };

  const onKeyValue = (boneId: string, at: number, value: SampleValue) => {
    if (Math.abs(at - time()) > 1e-6) setTime(at);
    setTracks(
      produce((t) => {
        t[boneId] = upsertKeyframe(t[boneId] ?? [], at, value);
      }),
    );
    markDirty();
  };

  const onRotateBone = (boneId: string, degrees: number, commit: boolean) => {
    if (!commit) {
      setOverrides((o) => ({ ...o, [boneId]: { ...(o[boneId] ?? {}), rotation: degrees } }));
      return;
    }
    const base = currentPoseOf(boneId);
    setOverrides((o) => {
      const copy = { ...o };
      delete copy[boneId];
      return copy;
    });
    if (autoKey()) keyBone(boneId, { ...base, rotation: degrees });
    const bone = rig.bones.find((b) => b.id === boneId);
    if (bone && (degrees < bone.minAngle - 1e-6 || degrees > bone.maxAngle + 1e-6)) {
      toast(`「${bone.name}」${degrees.toFixed(1)}° 超出 ${bone.minAngle}°~${bone.maxAngle}°，保存将被阻止。`, 'error');
    }
    markDirty();
  };

  const onMovePivot = (boneId: string, point: Vec2, commit: boolean) => {
    setRig(
      'bones',
      (b) => b.id === boneId,
      (b) => ({ ...b, pivot: point }),
    );
    if (commit) {
      markDirty();
      toast('旋转中心已更新。', 'info', 1600);
    }
  };

  const onMoveKeyOnTimeline = (boneId: string, keyId: string, at: number, commit: boolean) => {
    setTracks(
      produce((t) => {
        const keys = t[boneId] ?? [];
        const idx = keys.findIndex((k) => k.id === keyId);
        if (idx < 0) return;
        keys[idx].time = Math.max(0, Math.min(duration(), Math.round(at * fps()) / fps()));
        t[boneId] = sortKeys(keys);
      }),
    );
    if (commit) markDirty();
  };

  const onEasingChange = (boneId: string, keyId: string, easing: Easing) => {
    setTracks(
      produce((t) => {
        t[boneId] = setEasingOnKeys(t[boneId] ?? [], keyId, easing);
      }),
    );
    markDirty();
  };

  const onDeleteKey = (boneId: string, keyId: string) => {
    setTracks(
      produce((t) => {
        t[boneId] = (t[boneId] ?? []).filter((k) => k.id !== keyId);
      }),
    );
    if (selectedKeyId() === keyId) setSelectedKeyId(null);
    markDirty();
  };

  const onGoToIssue = (issue: ValidationIssue) => {
    if (issue.boneId) setSelectedBoneId(issue.boneId);
    if (issue.at !== undefined) setTime(issue.at);
  };

  const submit = () => {
    const result = validation();
    if (!result.canSubmit) {
      toast(`无法提交：${result.errors[0]?.message ?? '存在未解决的问题'}`, 'error');
      return;
    }
    if (!handleSave()) return;
    const s = shot();
    if (!s) return;
    const review = submitShot(s.id);
    if (review) {
      toast(`已提交第 ${review.round} 轮审核，等待主管查看。`, 'ok');
      navigate(routes.reviewShot(s.id));
    }
  };

  const copyToNext = () => {
    const s = shot();
    if (!s) return;
    if (dirty() && !handleSave()) return;
    const res = copyMotionToNextShot(s.id);
    if (!res.ok || !res.targetShotId) {
      toast(res.message, 'error');
      return;
    }
    toast(res.message, 'ok');
    navigate(routes.editor(res.targetShotId));
  };

  const applyLibraryAction = (actionId: string) => {
    const s = shot();
    const action = actionById(actionId);
    if (!s || !action) return;
    if (action.templateId !== s.rig.templateId) {
      toast('该动作使用了不同的骨骼模板，无法应用到当前镜头。', 'error');
      return;
    }
    if (dirty() && !handleSave()) return;
    if (!applyActionToShot(s.id, actionId, actionStart())) {
      toast('应用失败。', 'error');
      return;
    }
    const fresh = shotById(s.id);
    if (fresh) loadShot(fresh);
    setShowActionPicker(false);
    toast(`已应用动作「${action.name}」到 ${actionStart().toFixed(2)}s。`, 'ok');
  };

  const availableActions = createMemo(() => {
    const s = shot();
    if (!s) return [];
    const q = actionFilter().trim();
    return appState.actions
      .filter((a) => a.templateId === s.rig.templateId)
      .filter((a) => !q || a.name.includes(q) || a.category.includes(q));
  });

  const nextShot = createMemo(() => {
    const s = shot();
    if (!s) return undefined;
    const siblings = shotsOf(s.projectId);
    const idx = siblings.findIndex((x) => x.id === s.id);
    return siblings[idx + 1];
  });

  const rejection = createMemo(() => (shot() ? lastRejection(shot()!) : undefined));
  const deadline = createMemo(() => (project() ? deadlineInfo(project()!.dueDate) : undefined));

  return (
    <Show
      when={shot() && project()}
      fallback={
        <div class="page">
          <div class="empty">镜头不存在或已被删除。</div>
        </div>
      }
    >
      <div class="editor-wrap">
        <div class="editor-toolbar">
          <button class="small primary" onClick={submit} disabled={!validation().canSubmit}>
            提交审核
          </button>
          <button class="small" onClick={handleSave} disabled={!validation().canSave || !dirty()}>
            保存
          </button>
          <span class="mono small muted">{shot()!.code}</span>
          <span class={`badge tone-${shot()!.status}`}>{STATUS_LABEL[shot()!.status]}</span>
          <Show when={shot()!.reworkCount > 0}>
            <span class="badge danger">返工 {shot()!.reworkCount} 次</span>
          </Show>
          <Show when={deadline()?.tone !== 'ok'}>
            <span class={`badge ${deadline()!.overdue ? 'danger' : 'warn'}`}>{deadline()!.label}</span>
          </Show>
          <span class="toolbar-sep" />
          <label class="toggle">
            <input type="checkbox" checked={showBones()} onChange={(e) => setShowBones(e.currentTarget.checked)} />
            骨骼层
          </label>
          <Show when={showBones()}>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(boneAlpha() * 100)}
              onInput={(e) => setBoneAlpha(parseFloat(e.currentTarget.value) / 100)}
              title="骨骼层透明度"
              style={{ width: '70px' }}
            />
          </Show>
          <label class="toggle">
            <input type="checkbox" checked={showLabels()} onChange={(e) => setShowLabels(e.currentTarget.checked)} />
            标注
          </label>
          <label class="toggle">
            <input type="checkbox" checked={autoKey()} onChange={(e) => setAutoKey(e.currentTarget.checked)} />
            拖动自动打帧
          </label>
          <label class="toggle">
            <input type="checkbox" checked={loop()} onChange={(e) => setLoop(e.currentTarget.checked)} />
            循环
          </label>
          <div class="spacer" />
          <button class="small" onClick={() => navigate(routes.project(project()!.id))}>
            镜头清单
          </button>
          <button class="small" onClick={() => setShowActionPicker(true)}>
            从动作库插入
          </button>
          <button
            class="small"
            onClick={copyToNext}
            disabled={!nextShot()}
            title={nextShot() ? `把当前动作复制到 ${nextShot()!.code} 后微调` : '已是本片最后一个镜头'}
          >
            复制到下一镜头
          </button>
          <Show when={dirty()}>
            <span class="small warn-text">● 未保存</span>
          </Show>
          <Show when={savedAt()}>
            <span class="small muted">已保存 {savedAt()}</span>
          </Show>
        </div>

        <Show when={rejection()}>
          <div class="rework-banner">
            <div style={{ flex: 1 }}>
              <b>
                返工意见（第 {rejection()!.round} 轮 · {rejection()!.reviewer}）
              </b>{' '}
              {rejection()!
                .comments.slice(0, 3)
                .map((c) => `帧 ${c.frame}：${c.text}`)
                .join('　|　')}
              {rejection()!.comments.length > 3 ? ` …共 ${rejection()!.comments.length} 条` : ''}
            </div>
            <button class="small ghost" onClick={() => navigate(routes.reviewShot(shot()!.id))}>
              查看全部
            </button>
          </div>
        </Show>

        <div class="editor">
          <div class="panel left">
            <div class="panel-head">
              <span style={{ flex: 1 }}>部件 / 骨骼</span>
              <span class="badge">{rig.parts.length} 部件</span>
            </div>
            <div class="panel-body">
              <RigTree
                rig={rig as Rig}
                selectedPartId={selectedPartId()}
                selectedBoneId={selectedBoneId()}
                violatingBones={violating()}
                edited={dirty()}
                onSelectPart={(id) => {
                  setSelectedPartId(id);
                  const p = rig.parts.find((x) => x.id === id);
                  if (p) setSelectedBoneId(p.boneId);
                }}
                onSelectBone={(id) => {
                  setSelectedBoneId(id);
                  setSelectedKeyId(null);
                }}
                onToggleGroup={(gid) =>
                  setRig(
                    'groups',
                    (g) => g.id === gid,
                    (g) => ({ ...g, collapsed: !g.collapsed }),
                  )
                }
                onTogglePartVisible={(pid) =>
                  setRig(
                    'parts',
                    (p) => p.id === pid,
                    (p) => ({ ...p, visible: !p.visible }),
                  )
                }
                onRenamePart={(pid, name) =>
                  setRig(
                    'parts',
                    (p) => p.id === pid,
                    (p) => ({ ...p, name }),
                  )
                }
                onRenameBone={(bid, name) =>
                  setRig(
                    'bones',
                    (b) => b.id === bid,
                    (b) => ({ ...b, name }),
                  )
                }
              />
            </div>
          </div>

          <Stage
            labelBones={ANCHOR_LABELS[rig.templateId] ?? []}
            rig={rig as Rig}
            tracks={tracks as TrackMap}
            time={time()}
            selectedBoneId={selectedBoneId()}
            hoverBoneId={hoverBoneId()}
            showBones={showBones()}
            boneAlpha={boneAlpha()}
            showGuides={true}
            showLabels={showLabels()}
            poseOverrides={overrides()}
            interactive
            dragMode={dragMode()}
            onSelectBone={(id) => {
              setSelectedBoneId(id);
              if (!id) setSelectedPartId(null);
              else setSelectedPartId(rig.parts.find((x) => x.boneId === id)?.id ?? null);
            }}
            onHoverBone={setHoverBoneId}
            onRotateBone={onRotateBone}
            onMovePivot={onMovePivot}
          />

          <div class="panel right">
            <div class="panel-head">
              <span style={{ flex: 1 }}>检查器</span>
              <span class="badge">{Math.round(time() * fps())} 帧</span>
              <Show when={dirty()}>
                <span class="badge warn">未保存</span>
              </Show>
            </div>
            <div class="panel-body" style={{ padding: 0 }}>
              <Inspector
                rig={rig as Rig}
                tracks={tracks as TrackMap}
                time={time()}
                fps={fps()}
                duration={duration()}
                selectedBoneId={selectedBoneId()}
                selectedPartId={selectedPartId()}
                selectedKeyId={selectedKeyId()}
                issues={validation().issues}
                dirty={dirty()}
                canSave={validation().canSave}
                dragMode={dragMode()}
                onDragModeChange={setDragMode}
                onBoneChange={(id, patch) => {
                  setRig(
                    'bones',
                    (b) => b.id === id,
                    (b) => ({ ...b, ...patch }),
                  );
                  markDirty();
                }}
                onPartChange={(id, patch) => {
                  setRig(
                    'parts',
                    (p) => p.id === id,
                    (p) => ({ ...p, ...patch }),
                  );
                  markDirty();
                }}
                onPartPointsReplace={() => undefined}
                onKeyValue={(id, at, value) => onKeyValue(id, at, value)}
                onSetKeying={(id) => keyBone(id, currentPoseOf(id))}
                onDeleteKey={onDeleteKey}
                onEasingChange={onEasingChange}
                onGoToIssue={onGoToIssue}
                onSave={handleSave}
                onResetKey={(id) => keyBone(id, { rotation: 0, x: 0, y: 0 })}
                onDetachBone={() => undefined}
              />
            </div>
          </div>

          <Timeline
            bones={rig.bones as Bone[]}
            tracks={tracks as TrackMap}
            duration={duration()}
            fps={fps()}
            time={time()}
            playing={playing()}
            selectedBoneId={selectedBoneId()}
            selectedKeyId={selectedKeyId()}
            violatingBones={violating()}
            actionRanges={(shot()?.appliedActions ?? []).map((a) => ({
              start: a.startTime,
              end: a.startTime + a.duration,
              name: a.actionName,
            }))}
            onSeek={(t) => {
              setPlaying(false);
              setTime(t);
            }}
            onSelectBone={(id) => {
              setSelectedBoneId(id);
              setSelectedKeyId(null);
            }}
            onSelectKey={(boneId, keyId) => {
              setSelectedBoneId(boneId);
              setSelectedKeyId(keyId);
              if (keyId) {
                const k = (tracks[boneId] ?? []).find((x) => x.id === keyId);
                if (k) setTime(k.time);
              }
            }}
            onMoveKey={onMoveKeyOnTimeline}
            onTogglePlay={() => setPlaying((p) => !p)}
            onStepFrame={stepFrame}
            onSetFps={(f) => {
              setFps(f);
              markDirty();
            }}
          />
        </div>
      </div>

      <Show when={showActionPicker()}>
        <Modal
          title="从动作库插入动作"
          wide
          onClose={() => setShowActionPicker(false)}
          footer={<button onClick={() => setShowActionPicker(false)}>取消</button>}
        >
          <div class="row wrap">
            <input
              placeholder="搜索动作名称 / 分类"
              value={actionFilter()}
              onInput={(e) => setActionFilter(e.currentTarget.value)}
              style={{ flex: '1 1 220px' }}
            />
            <label class="small muted">起始时间</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={actionStart()}
              onInput={(e) => setActionStart(Math.max(0, parseFloat(e.currentTarget.value) || 0))}
              style={{ width: '86px' }}
            />
            <span class="small muted">s</span>
          </div>
          <div class="col" style={{ gap: '6px', 'max-height': '430px', overflow: 'auto' }}>
            <For each={availableActions()}>
              {(action) => (
                <div
                  class="card"
                  style={{ padding: '10px 12px', display: 'flex', gap: '12px', 'align-items': 'center' }}
                >
                  <div style={{ flex: 1 }}>
                    <div class="row wrap">
                      <b>{action.name}</b>
                      <span class="badge info">{action.category}</span>
                      <span class="muted small">{action.duration.toFixed(1)}s</span>
                      <span class="muted small">{countKeys(action.tracks)} 关键帧</span>
                    </div>
                    <div class="hint" style={{ 'margin-top': '4px' }}>
                      {action.description}
                    </div>
                  </div>
                  <button class="small primary" onClick={() => applyLibraryAction(action.id)}>
                    插入
                  </button>
                </div>
              )}
            </For>
            <Show when={availableActions().length === 0}>
              <div class="empty">没有适用于当前骨骼模板的动作。</div>
            </Show>
          </div>
          <div class="hint">
            动作插入后会成为该镜头的引用来源；动作库中的曲线被修改时，所有引用镜头都会被标记为需要同步。
          </div>
        </Modal>
      </Show>
    </Show>
  );
}
