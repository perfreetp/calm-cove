import { createSignal, For, Show } from 'solid-js';
import { useAppStore } from '../store/app';
import { STATUS_LABEL, type SubmissionRecord } from '../types';
import { VIOLATION_TYPE_LABEL } from '../lib/rules';
import ReviewWorkbench from './ReviewWorkbench';
import CoursewareLibrary from './CoursewareLibrary';

type Tab = 'queue' | 'gradebook' | 'courseware' | 'students';

export default function TeacherView() {
  const store = useAppStore();
  const [tab, setTab] = createSignal<Tab>('queue');
  const [reviewing, setReviewing] = createSignal<SubmissionRecord | null>(null);
  const [libraryOpen, setLibraryOpen] = createSignal(false);
  const [newStu, setNewStu] = createSignal({ name: '', no: '', group: '' });

  const assignment = () => store.assignments()[0];

  const queue = () =>
    store
      .submissions()
      .filter((s) => s.assignmentId === assignment()?.id)
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0));

  const gradeBook = () => (assignment() ? store.gradeBook(assignment()!.id) : []);
  const topMistakes = () => (assignment() ? store.topMistakes(assignment()!.id) : []);

  const scoreClass = (v: number | null | undefined) =>
    v === null || v === undefined ? '' : v >= 85 ? 'high' : v >= 60 ? 'mid' : 'low';

  return (
    <div class="page">
      <div class="tabs">
        <button class={tab() === 'queue' ? 'active' : ''} onClick={() => setTab('queue')}>
          📥 待复核队列({store.submissions().filter((s) => s.status === 'reviewing').length})
        </button>
        <button class={tab() === 'gradebook' ? 'active' : ''} onClick={() => setTab('gradebook')}>
          📊 成绩单与错题分析
        </button>
        <button class={tab() === 'courseware' ? 'active' : ''} onClick={() => setTab('courseware')}>
          📚 标准课件库
        </button>
        <button class={tab() === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
          👥 学员名册
        </button>
      </div>

      {/* ---------- 复核队列 ---------- */}
      <Show when={tab() === 'queue'}>
        <div class="card">
          <h3>提交复核队列</h3>
          <table>
            <thead>
              <tr>
                <th>学员</th>
                <th>组别</th>
                <th>状态</th>
                <th>自动分</th>
                <th>最终分</th>
                <th>违规</th>
                <th>退回次数</th>
                <th>提交时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <For each={queue()} fallback={<tr><td colspan="9" class="empty-hint">暂无提交记录</td></tr>}>
                {(sub) => {
                  const stu = store.students().find((s) => s.id === sub.studentId);
                  return (
                    <tr>
                      <td>
                        {stu?.name} <span class="muted small">{stu?.no}</span>
                      </td>
                      <td>{stu?.group}</td>
                      <td>
                        <span class={`badge ${sub.status}`}>{STATUS_LABEL[sub.status]}</span>
                      </td>
                      <td>
                        <span class={`score-pill ${scoreClass(sub.autoScore?.total)}`}>{sub.autoScore?.total ?? '-'}</span>
                      </td>
                      <td>
                        <Show when={sub.finalScore !== null} fallback={<span class="muted">—</span>}>
                          <span class={`score-pill ${scoreClass(sub.finalScore)}`}>{sub.finalScore}</span>
                        </Show>
                      </td>
                      <td>
                        <Show when={sub.autoScore?.violations.length} fallback={<span class="muted">0</span>}>
                          <span class="badge v-danger">{sub.autoScore!.violations.length}</span>
                        </Show>
                      </td>
                      <td class="mono">{sub.revision}</td>
                      <td class="small muted mono">
                        {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString('zh-CN', { hour12: false }) : '-'}
                      </td>
                      <td>
                        <button class="primary" onClick={() => setReviewing(sub)}>
                          {sub.status === 'reviewing' ? '回放复核' : '查看回放'}
                        </button>
                      </td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      {/* ---------- 成绩单 ---------- */}
      <Show when={tab() === 'gradebook'}>
        <div class="grid cols-2" style={{ 'grid-template-columns': '2fr 1fr' }}>
          <div class="card">
            <h3>学员成绩单 — 各动作节点得分汇总</h3>
            <table>
              <thead>
                <tr>
                  <th>学员</th>
                  <For each={store.actionNodes}>
                    {(n) => (
                      <th>
                        {n.name}
                        <div class="muted small" style={{ 'font-weight': 400 }}>
                          ≥{n.minDuration}s
                        </div>
                      </th>
                    )}
                  </For>
                  <th>自动总分</th>
                  <th>最终成绩</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <For each={gradeBook()}>
                  {(row) => (
                    <tr>
                      <td>
                        {row.student.name}
                        <div class="muted small">{row.student.no}</div>
                      </td>
                      <For each={store.actionNodes}>
                        {(n) => {
                          const cell = row.nodeMap.get(n.id);
                          return (
                            <td>
                              <Show when={cell} fallback={<span class="muted">—</span>}>
                                <span class={`score-pill ${scoreClass(cell!.score)}`}>{cell!.score}</span>
                                <Show when={cell!.violations > 0}>
                                  <div class="small" style={{ color: 'var(--danger)' }}>
                                    {cell!.violations} 处违规
                                  </div>
                                </Show>
                              </Show>
                            </td>
                          );
                        }}
                      </For>
                      <td>
                        <Show when={row.autoTotal !== null} fallback={<span class="muted">未提交</span>}>
                          <span class={`score-pill ${scoreClass(row.autoTotal)}`}>{row.autoTotal}</span>
                        </Show>
                      </td>
                      <td>
                        <Show when={row.finalScore !== null} fallback={<span class="muted">—</span>}>
                          <span class={`score-pill ${scoreClass(row.finalScore)}`}>{row.finalScore}</span>
                        </Show>
                      </td>
                      <td>
                        <span class={`badge ${row.status}`}>{STATUS_LABEL[row.status]}</span>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>

          <div class="card">
            <h3>🏆 全班错得最多的三个动作</h3>
            <For each={topMistakes()} fallback={<div class="empty-hint">暂无足够提交数据</div>}>
              {(m, i) => (
                <div class="metric-box">
                  <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                    <b>
                      第 {i() + 1} 名 · {m.nodeName}
                    </b>
                    <span class="badge v-danger">{m.count} 人次出错</span>
                  </div>
                  <div class="small mt8">
                    <For each={Object.entries(m.breakdown)}>
                      {(entry) => (
                        <span style={{ 'margin-right': '10px' }}>
                          {VIOLATION_TYPE_LABEL[entry[0] as keyof typeof VIOLATION_TYPE_LABEL]} × {entry[1]}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
            <div class="spec-card mt16">
              统计口径:按提交作业的违规检测结果聚合,同一学员同一动作节点多次违规只计 1 人次,用于质控科定位教学薄弱环节。
            </div>
            <div class="mt16">
              <button class="ghost" onClick={() => {
                if (confirm('重置为初始演示数据?当前所有本地修改将被清除。')) store.resetDemoData();
              }}>
                ♻ 重置演示数据
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ---------- 课件库 ---------- */}
      <Show when={tab() === 'courseware'}>
        <div class="card">
          <h3>标准动作课件管理</h3>
          <p class="small muted">
            题库中的标准动作课件可被学员在编辑器中一键套用;学员也可将自己的合格作品另存为课件,形成可复用的教学资源。
          </p>
          <button class="primary" onClick={() => setLibraryOpen(true)}>
            打开课件库
          </button>
          <div class="grid cols-2 mt16">
            <For each={store.coursewares()}>
              {(cw) => (
                <div class="metric-box" style={{ display: 'block' }}>
                  <div class="row-flex" style={{ 'justify-content': 'space-between' }}>
                    <b>{cw.name}</b>
                    <Show when={cw.builtin}>
                      <span class="badge completed">内置</span>
                    </Show>
                  </div>
                  <div class="small muted mt8">{cw.description}</div>
                  <div class="small mono mt8">
                    时长 {cw.doc.duration}s · {cw.doc.keyframes.length} 关键帧
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* ---------- 学员名册 ---------- */}
      <Show when={tab() === 'students'}>
        <div class="card" style={{ 'max-width': '720px' }}>
          <h3>学员名册</h3>
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>学号</th>
                <th>组别</th>
              </tr>
            </thead>
            <tbody>
              <For each={store.students()}>
                {(s) => (
                  <tr>
                    <td>{s.name}</td>
                    <td class="mono">{s.no}</td>
                    <td>{s.group}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <h3 style={{ margin: '18px 0 8px', 'font-size': '14px' }}>新增学员</h3>
          <div class="row-flex">
            <input placeholder="姓名" value={newStu().name} onInput={(e) => setNewStu({ ...newStu(), name: e.currentTarget.value })} />
            <input placeholder="学号" value={newStu().no} onInput={(e) => setNewStu({ ...newStu(), no: e.currentTarget.value })} />
            <input placeholder="组别" value={newStu().group} onInput={(e) => setNewStu({ ...newStu(), group: e.currentTarget.value })} />
            <button
              class="primary"
              onClick={() => {
                if (!newStu().name || !newStu().no) return alert('姓名和学号必填');
                store.addStudent(newStu().name, newStu().no, newStu().group || '未分组');
                setNewStu({ name: '', no: '', group: '' });
              }}
            >
              添加
            </button>
          </div>
        </div>
      </Show>

      <Show when={reviewing()}>
        <ReviewWorkbench submission={reviewing()!} onClose={() => setReviewing(null)} />
      </Show>
      <Show when={libraryOpen()}>
        <CoursewareLibrary onClose={() => setLibraryOpen(false)} onApply={() => setLibraryOpen(false)} />
      </Show>
    </div>
  );
}
