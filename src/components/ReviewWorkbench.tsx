import { createMemo, createSignal, For, Show } from 'solid-js';
import { useAppStore } from '../store/app';
import { createEditorStore, type EditorStore } from '../store/editor';
import { STATUS_LABEL, type ReviewNodeResult, type SubmissionRecord } from '../types';
import { VIOLATION_TYPE_LABEL } from '../lib/rules';
import Timeline from './Timeline';
import Viewport from './Viewport';

interface Props {
  submission: SubmissionRecord;
  onClose: () => void;
}

/** 老师回放复核工作台:看回放、逐段扣分写评语、完成/退回 */
export default function ReviewWorkbench(props: Props) {
  const store = useAppStore();
  const sub = () => props.submission;
  const editor = createMemo<EditorStore>(() => createEditorStore(sub().doc))();

  const [reviews, setReviews] = createSignal<ReviewNodeResult[]>(
    sub().review.length
      ? sub().review.map((r) => ({ ...r }))
      : store.actionNodes.map((n) => ({
          nodeId: n.id,
          teacherScore: null,
          comment: '',
          qualified: true,
        })),
  );
  const [general, setGeneral] = createSignal(sub().generalComment);
  const [activeNode, setActiveNode] = createSignal(store.actionNodes[0].id);

  const student = () => store.students().find((s) => s.id === sub().studentId);
  const autoNode = (nodeId: string) => sub().autoScore?.nodeScores.find((n) => n.nodeId === nodeId);

  function patch(nodeId: string, patch: Partial<ReviewNodeResult>) {
    setReviews(reviews().map((r) => (r.nodeId === nodeId ? { ...r, ...patch } : r)));
  }

  function finish(action: 'complete' | 'return') {
    const unqualified = reviews().filter((r) => !r.qualified);
    if (action === 'return' && unqualified.length === 0) {
      alert('退回操作至少需要将一个动作段标记为不合格,并写明原因。');
      return;
    }
    if (action === 'return' && unqualified.some((r) => !r.comment.trim())) {
      alert('每个不合格段都必须填写评语,学员需要知道具体哪里不合格。');
      return;
    }
    store.review(sub().id, reviews(), general(), action);
    alert(action === 'complete' ? '复核完成,成绩单已更新' : '已退回,学员端将看到逐段不合格明细');
    props.onClose();
  }

  return (
    <div class="modal-mask" onClick={props.onClose}>
      <div
        class="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ 'min-width': '92vw', width: '92vw', 'max-width': '92vw', height: '92vh', padding: '14px 18px' }}
      >
        <div class="row-flex">
          <h3 style={{ margin: 0 }}>
            🎬 回放复核 — {student()?.name}({student()?.no})
          </h3>
          <span class={`badge ${sub().status}`}>{STATUS_LABEL[sub().status]}</span>
          <span class="score-pill mid">自动评分 {sub().autoScore?.total ?? '-'}</span>
          <div style={{ flex: 1 }} />
          <button onClick={props.onClose}>关闭</button>
          <button class="danger" onClick={() => finish('return')}>
            退回整改
          </button>
          <button class="primary" onClick={() => finish('complete')}>
            完成复核
          </button>
        </div>

        <div style={{ display: 'grid', 'grid-template-columns': '1fr 320px', gap: '12px', 'margin-top': '10px', height: 'calc(92vh - 120px)' }}>
          <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'min-height': 0 }}>
            <div style={{ flex: 1, 'min-height': 0, display: 'flex' }}>
              <Viewport editor={editor} />
            </div>
            <Timeline editor={editor} readOnly />
          </div>

          <div style={{ overflow: 'auto', 'min-height': 0 }}>
            <div class="tabs">
              <button
                class={activeNode() !== '_general' ? 'active' : ''}
                onClick={() => setActiveNode(store.actionNodes[0].id)}
              >
                逐段评分
              </button>
              <button class={activeNode() === '_general' ? 'active' : ''} onClick={() => setActiveNode('_general')}>
                总评
              </button>
            </div>

            <Show when={activeNode() !== '_general'}>
              <For each={store.actionNodes}>
                {(node) => {
                  const r = () => reviews().find((x) => x.nodeId === node.id)!;
                  const detail = autoNode(node.id);
                  const range = () => sub().doc.nodeRanges[node.id];
                  return (
                    <div
                      class="metric-box"
                      style={{
                        'border-left': r().qualified ? '4px solid var(--success)' : '4px solid var(--danger)',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setActiveNode(node.id);
                        const rg = range();
                        if (rg) editor.seek(rg.start);
                      }}
                    >
                      <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                        <b>
                          {node.order}. {node.name}
                        </b>
                        <span class="small mono muted">
                          {range() ? `${range().start.toFixed(1)}~${range().end.toFixed(1)}s` : '未布置'}
                        </span>
                      </div>
                      <div class="small mt8">
                        自动分:时长 {detail?.durationScore ?? '-'}/40 · 指标 {detail?.metricScore ?? '-'}/35 ·
                        关节 {detail?.jointScore ?? '-'}/25 → <b>{detail?.score ?? '-'}</b>
                      </div>
                      <Show when={detail?.violations.length}>
                        <div class="mt8">
                          <For each={detail!.violations}>
                            {(v) => (
                              <div class="small" style={{ color: 'var(--danger)', 'line-height': 1.7 }}>
                                <span class={`badge v-${v.type}`}>{VIOLATION_TYPE_LABEL[v.type]}</span> {v.message}
                                <span class="muted mono">
                                  ({v.start.toFixed(1)}~{v.end.toFixed(1)}s)
                                </span>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <div class="field mt8" onClick={(e) => e.stopPropagation()}>
                        <label style={{ width: '64px' }}>教师给分</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          placeholder={String(detail?.score ?? 0)}
                          value={r().teacherScore ?? ''}
                          onInput={(e) =>
                            patch(node.id, {
                              teacherScore: e.currentTarget.value === '' ? null : Number(e.currentTarget.value),
                            })
                          }
                        />
                        <span class="small muted">/100(留空沿用自动分)</span>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <textarea
                          style={{ width: '100%', height: '56px', resize: 'vertical' }}
                          placeholder="逐段评语:指出问题与改进要求(退回时必填)"
                          value={r().comment}
                          onInput={(e) => patch(node.id, { comment: e.currentTarget.value })}
                        />
                      </div>
                      <div class="row-flex mt8" onClick={(e) => e.stopPropagation()}>
                        <label class="row-flex" style={{ cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={r().qualified}
                            onChange={(e) => patch(node.id, { qualified: e.currentTarget.checked })}
                          />
                          该段合格
                        </label>
                      </div>
                    </div>
                  );
                }}
              </For>
            </Show>

            <Show when={activeNode() === '_general'}>
              <h3 style={{ 'font-size': '14px' }}>总评意见</h3>
              <textarea
                style={{ width: '100%', height: '160px', resize: 'vertical' }}
                placeholder="对整份作业的总体评价…"
                value={general()}
                onInput={(e) => setGeneral(e.currentTarget.value)}
              />
              <div class="spec-card mt16">
                完成复核后:教师给分覆盖对应节点自动分,未给分节点沿用自动分,最终成绩为五节点均分;退回后学员可在作业卡片查看每段不合格原因与违规时间区间。
              </div>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
