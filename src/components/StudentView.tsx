import { createMemo, createSignal, For, Show } from 'solid-js';
import { useAppStore } from '../store/app';
import { createEditorStore, type EditorStore } from '../store/editor';
import { STATUS_LABEL, type SubmissionRecord } from '../types';
import BindingPanel from './BindingPanel';
import Viewport from './Viewport';
import Inspector from './Inspector';
import Timeline from './Timeline';
import ExportDialog from './ExportDialog';
import ReturnFeedback from './ReturnFeedback';
import CoursewareLibrary from './CoursewareLibrary';

export default function StudentView() {
  const store = useAppStore();
  const assignment = () => store.assignments()[0];

  const [editor, setEditor] = createSignal<EditorStore | null>(null);
  const [exportOpen, setExportOpen] = createSignal(false);
  const [returnOpen, setReturnOpen] = createSignal(false);
  const [libraryOpen, setLibraryOpen] = createSignal(false);
  const [saveAsCwOpen, setSaveAsCwOpen] = createSignal(false);
  const [cwName, setCwName] = createSignal('');

  const studentId = () => store.currentStudentId();
  const submission: () => SubmissionRecord | undefined = createMemo(() =>
    store.getSubmission(studentId(), assignment()?.id ?? ''),
  ) as unknown as () => SubmissionRecord | undefined;

  function openEditor(loadSubmission = false) {
    const asg = assignment();
    if (!asg) return;
    let doc;
    if (loadSubmission && submission()?.status === 'returned') {
      doc = structuredClone(submission()!.doc);
      store.resumeAfterReturn(studentId(), asg.id);
    } else {
      doc = store.getOrCreateDraft(studentId(), asg.id);
    }
    setEditor(createEditorStore(doc));
  }

  function handleSaveDraft() {
    const ed = editor();
    const asg = assignment();
    if (!ed || !asg) return;
    store.saveDraft(studentId(), asg.id, ed.doc);
    alert('草稿已保存到本地');
  }

  function handleSubmit() {
    const ed = editor();
    const asg = assignment();
    if (!ed || !asg) return;
    const s = ed.score();
    const missing = s.nodeScores.filter((n) => n.violations.some((v) => v.type === 'coverage'));
    const msg =
      `提交后系统将按关键帧时间、关节角度、动作总时长自动评分。\n\n` +
      `当前自动评分:${s.total} 分,违规 ${s.violations.length} 处。` +
      (missing.length ? `\n⚠ 仍有 ${missing.length} 个动作节点存在内容缺失,确定要提交吗?` : '\n确认提交给质控科老师复核?');
    if (!confirm(msg)) return;
    store.saveDraft(studentId(), asg.id, ed.doc);
    store.submit(studentId(), asg.id, ed.doc);
    alert('提交成功,状态已更新为「待复核」');
    setEditor(null);
  }

  function saveAsCourseware() {
    const ed = editor();
    if (!ed) return;
    const cw = store.saveCoursewareFromDoc(cwName() || '我的标准动作课件', '学员保存的可复用课件', ed.doc);
    setSaveAsCwOpen(false);
    setCwName('');
    alert(`已存入课件库:${cw.name}`);
  }

  /* ---------------- 编辑器全屏 ---------------- */
  const ed = () => editor();
  return (
    <Show
      when={!ed()}
      fallback={
        <div class="editor-layout">
          <div class="row-flex">
            <button onClick={() => setEditor(null)}>← 返回作业列表</button>
            <b>{assignment()?.title}</b>
            <span class="badge reviewing">学员编辑中</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setLibraryOpen(true)}>📚 课件库套用</button>
            <button onClick={() => setSaveAsCwOpen(true)}>💾 存为标准课件</button>
            <button onClick={handleSaveDraft}>保存草稿</button>
            <button onClick={() => setExportOpen(true)}>🖼 导出 PNG 序列帧</button>
            <button class="primary" onClick={handleSubmit}>
              提交考核
            </button>
          </div>

          <div class="editor-main">
            <BindingPanel editor={ed()!} />
            <Viewport
              editor={ed()!}
              onDropPart={(partId, boneId) => ed()!.bindPart(partId, boneId)}
            />
            <Inspector editor={ed()!} />
          </div>

          <Timeline editor={ed()!} />

          <Show when={exportOpen()}>
            <ExportDialog doc={ed()!.doc} onClose={() => setExportOpen(false)} />
          </Show>
          <Show when={saveAsCwOpen()}>
            <div class="modal-mask" onClick={() => setSaveAsCwOpen(false)}>
              <div class="modal" onClick={(e) => e.stopPropagation()}>
                <h3>存入标准课件库(可复用)</h3>
                <div class="field">
                  <label>课件名称</label>
                  <input style={{ flex: 1 }} value={cwName()} onInput={(e) => setCwName(e.currentTarget.value)} placeholder="例如:采血标准动作-我的版本" />
                </div>
                <div class="right mt16">
                  <button onClick={() => setSaveAsCwOpen(false)}>取消</button>
                  <button class="primary" onClick={saveAsCourseware}>
                    保存
                  </button>
                </div>
              </div>
            </div>
          </Show>
          <Show when={libraryOpen()}>
            <CoursewareLibrary
              onClose={() => setLibraryOpen(false)}
              onApply={(doc) => {
                ed()!.replaceDoc(doc);
                setLibraryOpen(false);
              }}
            />
          </Show>
        </div>
      }
    >
      {/* 作业列表 */}
      <div class="page">
        <div class="card">
          <h3>📋 我的考核作业</h3>
          <Show when={assignment()} fallback={<div class="empty-hint">教师暂未布置作业</div>}>
            {(asg) => (
              <div>
                <h2 style={{ margin: '4px 0 8px', 'font-size': '18px' }}>{asg().title}</h2>
                <p class="small" style={{ color: 'var(--text-2)', 'line-height': 1.8 }}>
                  {asg().description}
                </p>
                <div class="grid cols-3 mt8">
                  {store.actionNodes.map((n) => (
                    <div class="metric-box" style={{ margin: 0 }}>
                      <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                        <b>
                          {n.order}. {n.name}
                        </b>
                        <span class="mono small">
                          ≥{n.minDuration}s{n.maxDuration !== null ? ` ≤${n.maxDuration}s` : ''}
                        </span>
                      </div>
                      <div class="small muted mt8">{n.specText}</div>
                    </div>
                  ))}
                </div>

                <div class="row-flex mt16">
                  <Show
                    when={submission()}
                    fallback={
                      <button class="primary" onClick={() => openEditor()}>
                        开始制作动画
                      </button>
                    }
                  >
                    {(sub) => (
                      <>
                        <span class={`badge ${sub().status}`}>{STATUS_LABEL[sub().status]}</span>
                        <Show when={sub().status === 'reviewing'}>
                          <span class="small muted">已提交,等待老师复核回放</span>
                          <button onClick={() => openEditor()}>查看已提交内容</button>
                        </Show>
                        <Show when={sub().status === 'completed'}>
                          <span class="score-pill high">{sub().finalScore} 分</span>
                          <button onClick={() => openEditor()}>查看回放</button>
                        </Show>
                        <Show when={sub().status === 'returned'}>
                          <button class="danger" onClick={() => setReturnOpen(true)}>
                            查看退回原因(第 {sub().revision} 次退回)
                          </button>
                          <button class="primary" onClick={() => openEditor(true)}>
                            根据反馈整改重做
                          </button>
                        </Show>
                        <Show when={sub().status === 'pending'}>
                          <button class="primary" onClick={() => openEditor()}>
                            继续编辑
                          </button>
                        </Show>
                      </>
                    )}
                  </Show>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setLibraryOpen(true)}>📚 浏览标准课件库</button>
                </div>
              </div>
            )}
          </Show>
        </div>

        <Show when={submission()?.autoScore && submission()?.status !== 'pending'}>
          <div class="card mt16">
            <h3>📊 最近一次自动评分明细</h3>
            <table>
              <thead>
                <tr>
                  <th>动作节点</th>
                  <th>节点总分</th>
                  <th>时长分(40)</th>
                  <th>指标分(35)</th>
                  <th>关节分(25)</th>
                  <th>违规数</th>
                </tr>
              </thead>
              <tbody>
                <For each={submission()!.autoScore!.nodeScores}>
                  {(row) => {
                    const node = store.actionNodes.find((n) => n.id === row.nodeId)!;
                    return (
                      <tr>
                        <td>
                          {node.order}. {node.name}
                        </td>
                        <td>
                          <span class={`score-pill ${row.score >= 85 ? 'high' : row.score >= 60 ? 'mid' : 'low'}`}>
                            {row.score}
                          </span>
                        </td>
                        <td class="mono">{row.durationScore}</td>
                        <td class="mono">{row.metricScore}</td>
                        <td class="mono">{row.jointScore}</td>
                        <td>
                          <Show when={row.violations.length} fallback={<span class="muted">0</span>}>
                            <span class="badge v-danger">{row.violations.length}</span>
                          </Show>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>

      <Show when={returnOpen() && submission()}>
        <ReturnFeedback submission={submission()!} onClose={() => setReturnOpen(false)} />
      </Show>
      <Show when={libraryOpen()}>
        <CoursewareLibrary
          onClose={() => setLibraryOpen(false)}
          onApply={(doc) => {
            openEditor();
            setTimeout(() => editor()?.replaceDoc(doc), 0);
            setLibraryOpen(false);
          }}
        />
      </Show>
    </Show>
  );
}
