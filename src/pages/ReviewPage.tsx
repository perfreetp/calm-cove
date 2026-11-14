import { For, Show, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { Stage } from '../components/Stage';
import { toast, Modal } from '../components/ui';
import { appState, approveReview, projectById, rejectReview, shotById } from '../store';
import { navigate, routes } from '../router';
import { fmtDateTime, latestReview, STATUS_LABEL } from '../core/workflow';
import { validateShot } from '../core/validation';
import { ANCHOR_LABELS } from '../core/templates';
import { timeToFrame } from '../core/animation';

export interface ReviewPageProps {
  shotId?: string;
}

interface DraftComment {
  frame: number;
  time: number;
  text: string;
}

export function ReviewPage(props: ReviewPageProps) {
  const shot = createMemo(() => (props.shotId ? shotById(props.shotId) : undefined));
  const project = createMemo(() => (shot() ? projectById(shot()!.projectId) : undefined));

  return (
    <Show when={props.shotId} fallback={<QueueView />}>
      <Show
        when={shot() && project()}
        fallback={
          <div class="page">
            <div class="empty">镜头不存在。</div>
          </div>
        }
      >
        <ReviewWorkspace shotId={props.shotId!} />
      </Show>
    </Show>
  );
}

function QueueView() {
  const queue = createMemo(() =>
    appState.shots
      .filter((s) => s.status === 'in_review')
      .map((s) => ({ shot: s, project: projectById(s.projectId) }))
      .sort((a, b) => a.project?.dueDate.localeCompare(b.project?.dueDate ?? '') ?? 0),
  );

  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>审核队列</h1>
          <p>主管逐帧查看动画，逐条写退回意见或锁定版本。</p>
        </div>
      </div>
      <Show when={queue().length} fallback={<div class="empty">当前没有待审核的镜头。</div>}>
        <div class="col" style={{ gap: '10px' }}>
          <For each={queue()}>
            {(item) => {
              const pending = () => latestReview(item.shot);
              return (
                <div class="card clickable" onClick={() => navigate(routes.reviewShot(item.shot.id))}>
                  <div class="row">
                    <div style={{ flex: 1 }}>
                      <div class="row wrap">
                        <b>{item.project?.courseName}</b>
                        <span class="badge violet">{item.shot.code}</span>
                        <span class="muted">{item.shot.title}</span>
                        <Show when={item.shot.reworkCount > 0}>
                          <span class="badge danger">返工 {item.shot.reworkCount} 次</span>
                        </Show>
                      </div>
                      <div class="hint" style={{ 'margin-top': '4px' }}>
                        第 {pending()?.round} 轮 · {item.shot.assignee} 提交于{' '}
                        {fmtDateTime(pending()?.submittedAt ?? '')}
                      </div>
                    </div>
                    <div class="row">
                      <span class="badge">{item.shot.duration.toFixed(1)}s</span>
                      <span class="badge">{item.project?.resolution.label}</span>
                      <button class="small primary">开始审核</button>
                    </div>
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

function ReviewWorkspace(props: { shotId: string }) {
  // Derive from the store so switching shots in the queue remounts cleanly and
  // every save from the editor is reflected without a stale prop copy.
  const shot = createMemo(() => shotById(props.shotId) ?? appState.shots[0]);
  const project = () => projectById(shot().projectId);
  const fps = createMemo(() => project()?.fps ?? 24);
  const [time, setTime] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [showBones, setShowBones] = createSignal(true);
  const [boneAlpha, setBoneAlpha] = createSignal(0.62);
  const [comments, setComments] = createSignal<DraftComment[]>([]);
  const [commentText, setCommentText] = createSignal('');
  const [showConfirm, setShowConfirm] = createSignal<null | 'approve' | 'reject'>(null);

  let raf = 0;
  let last = 0;
  onMount(() => {
    const tick = (ts: number) => {
      if (playing()) {
        const dt = last ? (ts - last) / 1000 : 0;
        last = ts;
        const next = time() + dt;
        if (next >= shot().duration) {
          setTime(0);
        } else {
          setTime(next);
        }
      } else last = 0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));
  });

  const pending = createMemo(() => latestReview(shot()));
  const validation = createMemo(() => validateShot(shot(), new Set(appState.actions.map((a) => a.id))));
  const frameCount = createMemo(() => Math.max(1, Math.round(shot().duration * fps())));
  const currentFrame = createMemo(() => Math.min(frameCount(), timeToFrame(time(), fps())));

  const framedComments = createMemo(() => (pending()?.comments ?? []).filter((c) => c.frame === currentFrame()));

  const addComment = () => {
    const text = commentText().trim();
    if (!text) {
      toast('请先填写意见内容。', 'error');
      return;
    }
    const frame = currentFrame();
    setComments((list) => [...list.filter((c) => c.frame !== frame), { frame, time: frame / fps(), text }]);
    setCommentText('');
    toast(`已在第 ${frame} 帧记录意见。`, 'ok', 2000);
  };

  const removeComment = (frame: number) => {
    setComments((list) => list.filter((c) => c.frame !== frame));
  };

  const doReject = () => {
    if (comments().length === 0) {
      toast('退回前至少要写一条逐帧意见。', 'error');
      return;
    }
    if (!rejectReview(shot().id, comments())) {
      toast('退回失败。', 'error');
      return;
    }
    toast('已退回，返工次数 +1 并记录时间。', 'ok');
    setShowConfirm(null);
    navigate(routes.review());
  };

  const doApprove = () => {
    if (!approveReview(shot().id, comments())) {
      toast('通过失败。', 'error');
      return;
    }
    toast('审核通过，版本已锁定，可进入交付打包。', 'ok');
    setShowConfirm(null);
    navigate(routes.deliveries());
  };

  return (
    <div class="review-page">
      <div class="review-head">
        <div class="row" style={{ flex: 1, 'min-width': 0 }}>
          <button class="small ghost" onClick={() => navigate(routes.review())}>
            ← 审核队列
          </button>
          <div class="crumb-sep" />
          <b class="mono">{shot().code}</b>
          <span>{shot().title}</span>
          <span class="badge violet">第 {pending()?.round} 轮</span>
          <Show when={shot().reworkCount > 0}>
            <span class="badge danger">已返工 {shot().reworkCount} 次</span>
          </Show>
        </div>
        <div class="row">
          <label class="toggle">
            <input type="checkbox" checked={showBones()} onChange={(e) => setShowBones(e.currentTarget.checked)} />
            骨骼层
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(boneAlpha() * 100)}
            disabled={!showBones()}
            onInput={(e) => setBoneAlpha(parseFloat(e.currentTarget.value) / 100)}
            style={{ width: '70px' }}
          />
        </div>
      </div>

      <div class="review-grid">
        <div class="review-stage">
          <Stage
            labelBones={ANCHOR_LABELS[shot().rig.templateId] ?? []}
            rig={shot().rig}
            tracks={shot().tracks}
            time={time()}
            showBones={showBones()}
            boneAlpha={boneAlpha()}
            showGuides={false}
            showLabels={true}
            interactive={false}
          />
        </div>

        <div class="review-side">
          <div class="review-side-head">
            <span style={{ flex: 1 }}>逐帧意见</span>
            <span class="badge">{comments().length} 条待提交</span>
          </div>
          <div class="review-side-body scroll-y">
            <Show when={validation().errors.length > 0}>
              <div class="issue error">
                <span>
                  该镜头存在 {validation().errors.length} 处关节超限错误：{validation().errors[0].message}
                </span>
              </div>
            </Show>
            <Show when={framedComments()}>
              <For each={framedComments()}>
                {(c) => (
                  <div class="comment" style={{ 'border-color': 'rgba(251,191,36,0.4)' }}>
                    <div class="meta">
                      <span class="badge warn">上一轮意见 · 帧 {c.frame}</span>
                      <span style={{ 'margin-left': 'auto' }}>{c.author}</span>
                    </div>
                    <div>{c.text}</div>
                  </div>
                )}
              </For>
            </Show>
            <Show when={pending()?.comments.length}>
              <div class="divider" />
              <div class="hint">上一轮全部意见：</div>
              <For each={pending()!.comments}>
                {(c) => (
                  <div class="comment">
                    <div class="meta">
                      <span class="badge warn">帧 {c.frame}</span>
                      <span>{c.time.toFixed(2)}s</span>
                      <span style={{ 'margin-left': 'auto' }}>{c.author}</span>
                    </div>
                    <div>{c.text}</div>
                    <button class="small ghost" style={{ 'align-self': 'flex-start' }} onClick={() => setTime(c.time)}>
                      跳到该帧
                    </button>
                  </div>
                )}
              </For>
            </Show>

            <div class="divider" />
            <div class="row" style={{ 'align-items': 'flex-start' }}>
              <span class="badge info">帧 {currentFrame()}</span>
              <textarea
                placeholder="写下这一帧的问题，例如「胎头俯屈幅度不够，下颌未贴胸」"
                value={commentText()}
                onInput={(e) => setCommentText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addComment();
                }}
              />
            </div>
            <button class="small" onClick={addComment} style={{ 'align-self': 'flex-start' }}>
              ＋ 记录到第 {currentFrame()} 帧
            </button>

            <Show when={comments().length}>
              <div class="hint">本次退回意见（{comments().length} 条）：</div>
              <For each={comments()}>
                {(c) => (
                  <div class="comment">
                    <div class="meta">
                      <span class="badge danger">帧 {c.frame}</span>
                      <span>{c.time.toFixed(2)}s</span>
                      <button class="small ghost" style={{ 'margin-left': 'auto' }} onClick={() => setTime(c.time)}>
                        定位
                      </button>
                      <button class="icon small ghost" onClick={() => removeComment(c.frame)}>
                        ✕
                      </button>
                    </div>
                    <div>{c.text}</div>
                  </div>
                )}
              </For>
            </Show>
          </div>

          <div class="review-actions">
            <button class="danger" onClick={() => setShowConfirm('reject')} disabled={shot().status !== 'in_review'}>
              退回返工
            </button>
            <button class="primary" onClick={() => setShowConfirm('approve')} disabled={shot().status !== 'in_review'}>
              通过并锁版
            </button>
          </div>
        </div>
      </div>

      <div class="review-playback">
        <button class="small primary" onClick={() => setPlaying((p) => !p)} style={{ 'min-width': '58px' }}>
          {playing() ? '暂停' : '播放'}
        </button>
        <button class="small" onClick={() => setTime(Math.max(0, (currentFrame() - 1) / fps()))}>
          ◀|
        </button>
        <button class="small" onClick={() => setTime(Math.min(shot().duration, (currentFrame() + 1) / fps()))}>
          |▶
        </button>
        <span class="mono small">
          {time().toFixed(2)}s · 帧 {currentFrame()}/{frameCount()}
        </span>
        <input
          type="range"
          min="0"
          max={shot().duration}
          step={1 / fps()}
          value={time()}
          onInput={(e) => {
            setPlaying(false);
            setTime(parseFloat(e.currentTarget.value));
          }}
          style={{ flex: '1 1 160px' }}
        />
        <div class="frame-strip" style={{ 'max-width': '56%' }}>
          <For each={Array.from({ length: Math.min(frameCount(), 400) }, (_, i) => i)}>
            {(frame) => (
              <button
                class="frame-cell"
                classList={{
                  current: currentFrame() === frame,
                  'has-comment':
                    comments().some((c) => c.frame === frame) ||
                    (pending()?.comments ?? []).some((c) => c.frame === frame),
                }}
                onClick={() => {
                  setPlaying(false);
                  setTime(frame / fps());
                }}
              >
                {comments().some((c) => c.frame === frame) ? <span class="dot" /> : null}
                <span>{frame}</span>
                <span style={{ 'font-size': '9px', opacity: 0.6 }}>{(frame / fps()).toFixed(1)}s</span>
              </button>
            )}
          </For>
        </div>
        <div class="row">
          <span class="badge">{STATUS_LABEL[shot().status]}</span>
          <button class="small ghost" onClick={() => navigate(routes.editor(shot().id))}>
            打开编辑器
          </button>
        </div>
      </div>

      <Show when={showConfirm()}>
        <Modal
          title={showConfirm() === 'approve' ? '确认通过并锁定版本' : '确认退回返工'}
          onClose={() => setShowConfirm(null)}
          footer={
            <>
              <button onClick={() => setShowConfirm(null)}>取消</button>
              <button
                class={showConfirm() === 'approve' ? 'primary' : 'danger'}
                onClick={showConfirm() === 'approve' ? doApprove : doReject}
              >
                {showConfirm() === 'approve' ? '通过并锁版' : '退回返工'}
              </button>
            </>
          }
        >
          <Show
            when={showConfirm() === 'approve'}
            fallback={
              <div class="col" style={{ gap: '10px' }}>
                <p style={{ margin: 0, 'line-height': 1.7 }}>
                  退回后该镜头的返工次数将 +1（当前 {shot().reworkCount} 次 → {shot().reworkCount + 1} 次），
                  并记录本次退回时间。意见会随退回一并发送给制作员。
                </p>
                <div class="issue warning">
                  <span>已记录 {comments().length} 条逐帧意见。</span>
                </div>
              </div>
            }
          >
            <div class="col" style={{ gap: '10px' }}>
              <p style={{ margin: 0, 'line-height': 1.7 }}>
                通过后将锁定当前版本为 v{shot().versions.length + 1}，画面与动作数据冻结， 可打包成序列帧 +
                动作数据文件交付。
              </p>
              <Show when={validation().warnings.length}>
                <div class="issue warning">
                  <span>
                    仍有 {validation().warnings.length} 条提示：{validation().warnings[0].message}
                  </span>
                </div>
              </Show>
            </div>
          </Show>
        </Modal>
      </Show>
    </div>
  );
}
