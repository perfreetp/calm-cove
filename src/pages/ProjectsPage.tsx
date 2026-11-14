import { For, Show, createMemo, createSignal } from 'solid-js';
import { createProject, appState, deleteProject } from '../store';
import type { Project, ProjectDraft, Resolution, ShotListEntry } from '../core/types';
import { deadlineInfo, projectProgress } from '../core/workflow';
import { navigate, routes } from '../router';
import { Modal, toast } from '../components/ui';
import { TEMPLATES } from '../core/templates';
import { daysFromNow } from '../data/seed';

const RESOLUTIONS: Resolution[] = [
  { width: 1920, height: 1080, label: '1920×1080' },
  { width: 1280, height: 720, label: '1280×720' },
  { width: 1080, height: 1080, label: '1080×1080' },
  { width: 3840, height: 2160, label: '3840×2160' },
];

const SHOT_TEMPLATE_LINES = [
  { title: '俯屈起始', duration: 6 },
  { title: '内旋转全程', duration: 8 },
  { title: '仰伸与娩出', duration: 7 },
  { title: '复位与外旋转', duration: 5 },
];

export function ProjectsPage() {
  const [showCreate, setShowCreate] = createSignal(false);

  const sorted = createMemo(() =>
    [...appState.projects].sort((a, b) => {
      const da = deadlineInfo(a.dueDate);
      const db = deadlineInfo(b.dueDate);
      if (da.overdue !== db.overdue) return da.overdue ? -1 : 1;
      return da.daysLeft - db.daysLeft;
    }),
  );

  const shotsOf = (id: string) => appState.shots.filter((s) => s.projectId === id);

  const totals = createMemo(() => {
    const overdue = appState.projects.filter((p) => deadlineInfo(p.dueDate).overdue).length;
    const soon = appState.projects.filter((p) => {
      const d = deadlineInfo(p.dueDate);
      return !d.overdue && d.daysLeft <= 3;
    }).length;
    const pendingReview = appState.shots.filter((s) => s.status === 'in_review').length;
    const rework = appState.shots.filter((s) => s.status === 'rework').length;
    return { overdue, soon, pendingReview, rework };
  });

  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>项目</h1>
          <p>客户立项后按镜头清单生成制作条目，交片日期与超期状态实时汇总。</p>
        </div>
        <button class="primary" onClick={() => setShowCreate(true)}>
          ＋ 新建立项
        </button>
      </div>

      <div class="chip-row" style={{ 'margin-bottom': '16px' }}>
        <span class={`badge ${totals().overdue ? 'danger' : 'ok'}`}>超期 {totals().overdue}</span>
        <span class={`badge ${totals().soon ? 'warn' : ''}`}>3 天内到期 {totals().soon}</span>
        <span class="badge info">待审核 {totals().pendingReview}</span>
        <span class={`badge ${totals().rework ? 'danger' : ''}`}>返工中 {totals().rework}</span>
        <span class="badge">{appState.shots.length} 个镜头</span>
      </div>

      <Show
        when={sorted().length}
        fallback={<div class="empty">还没有项目。点右上角「新建立项」，录入课程名与镜头清单。</div>}
      >
        <div class="grid-projects">
          <For each={sorted()}>
            {(project) => {
              const info = () => deadlineInfo(project.dueDate);
              const shots = () => shotsOf(project.id);
              const progress = () => projectProgress(shots());
              const reworkCount = () => shots().reduce((n, s) => n + s.reworkCount, 0);
              return (
                <div class="card clickable" onClick={() => navigate(routes.project(project.id))}>
                  <div class="row" style={{ 'align-items': 'flex-start' }}>
                    <div style={{ flex: 1, 'min-width': 0 }}>
                      <h2 style={{ 'font-size': '15px', 'line-height': 1.4 }}>{project.courseName}</h2>
                      <div class="muted small" style={{ 'margin-top': '2px' }}>
                        {project.client}
                      </div>
                    </div>
                    <span class={`badge ${info().overdue ? 'danger' : info().warning ? 'warn' : 'ok'}`}>
                      {info().overdue ? '超期预警' : info().warning ? '临期' : '正常'}
                    </span>
                  </div>

                  <div class="row" style={{ 'margin-top': '14px', gap: '10px' }}>
                    <div
                      class="mono"
                      style={{
                        'font-size': '22px',
                        'font-weight': 700,
                        color: info().overdue ? 'var(--danger)' : info().warning ? 'var(--warn)' : 'var(--text-0)',
                      }}
                    >
                      {info().overdue ? `超 ${Math.abs(info().daysLeft)}` : info().daysLeft}
                    </div>
                    <div class="small muted" style={{ 'line-height': 1.35 }}>
                      {info().overdue ? '天已逾期' : '天后交片'}
                      <br />
                      {project.dueDate}
                    </div>
                  </div>

                  <div style={{ 'margin-top': '12px' }}>
                    <div class="row small muted" style={{ 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
                      <span>
                        {progress().approved}/{progress().total} 镜头通过
                      </span>
                      <span>{progress().percent}%</span>
                    </div>
                    <div class="progress">
                      <span style={{ width: `${progress().percent}%` }} />
                    </div>
                  </div>

                  <div class="row wrap" style={{ 'margin-top': '12px' }}>
                    <span class="badge">{project.resolution.label}</span>
                    <span class="badge">{shots().length} 镜头</span>
                    <Show when={reworkCount() > 0}>
                      <span class="badge danger">返工 {reworkCount()} 次</span>
                    </Show>
                    <span class="badge violet">
                      {TEMPLATES.find((t) => t.id === project.templateId)?.name ?? '自定义'}
                    </span>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={showCreate()}>
        <CreateProjectModal onClose={() => setShowCreate(false)} />
      </Show>
    </div>
  );
}

export function CreateProjectModal(props: { onClose: () => void }) {
  const [courseName, setCourseName] = createSignal('');
  const [client, setClient] = createSignal('');
  const [dueDate, setDueDate] = createSignal(daysFromNow(14));
  const [resolution, setResolution] = createSignal<Resolution>(RESOLUTIONS[0]);
  const [fps, setFps] = createSignal(24);
  const [templateId, setTemplateId] = createSignal('mechanism');
  const [notes, setNotes] = createSignal('');
  const [rows, setRows] = createSignal<ShotListEntry[]>(
    SHOT_TEMPLATE_LINES.map((line, i) => ({
      code: `S${String(i + 1).padStart(2, '0')}`,
      title: line.title,
      duration: line.duration,
    })),
  );
  const [error, setError] = createSignal('');

  const updateRow = (index: number, patch: Partial<ShotListEntry>) => {
    setRows((list) => list.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((list) => [
      ...list,
      {
        code: `S${String(list.length + 1).padStart(2, '0')}`,
        title: `镜头 ${list.length + 1}`,
        duration: 5,
      },
    ]);
  };

  const removeRow = (index: number) => setRows((list) => list.filter((_, i) => i !== index));

  const estimate = createMemo(() => rows().reduce((n, r) => n + Math.max(0, r.duration), 0));

  const submit = () => {
    if (!courseName().trim()) {
      setError('请填写课程名。');
      return;
    }
    if (!client().trim()) {
      setError('请填写客户 / 机构名称。');
      return;
    }
    if (!dueDate()) {
      setError('请选择交片日期。');
      return;
    }
    if (rows().length === 0) {
      setError('至少需要一条镜头。');
      return;
    }
    if (rows().some((r) => !r.title.trim())) {
      setError('镜头名称不能为空。');
      return;
    }
    const draft: ProjectDraft = {
      courseName: courseName(),
      client: client(),
      dueDate: dueDate(),
      resolution: resolution(),
      fps: fps(),
      templateId: templateId(),
      notes: notes(),
      shots: rows(),
    };
    const created = createProject(draft);
    toast(`已生成 ${created.shots.length} 条镜头制作条目。`, 'ok');
    props.onClose();
    navigate(routes.project(created.project.id));
  };

  return (
    <Modal
      title="新建立项"
      wide
      onClose={props.onClose}
      footer={
        <>
          <button onClick={props.onClose}>取消</button>
          <button class="primary" onClick={submit}>
            立项目并生成镜头条目
          </button>
        </>
      }
    >
      <div class="form-grid">
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">课程名</label>
          <input
            placeholder="例：正常分娩机制三维化培训"
            value={courseName()}
            onInput={(e) => setCourseName(e.currentTarget.value)}
            autofocus
          />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">客户 / 培训机构</label>
          <input
            placeholder="例：安馨母婴护理学院"
            value={client()}
            onInput={(e) => setClient(e.currentTarget.value)}
          />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">交片日期</label>
          <input type="date" value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">分辨率要求</label>
          <select
            value={resolution().label}
            onChange={(e) =>
              setResolution(RESOLUTIONS.find((r) => r.label === e.currentTarget.value) ?? RESOLUTIONS[0])
            }
          >
            <For each={RESOLUTIONS}>{(r) => <option value={r.label}>{r.label}</option>}</For>
          </select>
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">帧率</label>
          <select value={fps()} onChange={(e) => setFps(parseInt(e.currentTarget.value, 10))}>
            <For each={[12, 24, 25, 30]}>{(f) => <option value={f}>{f} fps</option>}</For>
          </select>
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">骨骼模板</label>
          <select value={templateId()} onChange={(e) => setTemplateId(e.currentTarget.value)}>
            <For each={TEMPLATES}>{(t) => <option value={t.id}>{t.name}</option>}</For>
          </select>
        </div>
        <div class="col full" style={{ gap: '4px' }}>
          <label class="small">备注</label>
          <textarea
            rows={2}
            placeholder="交付说明、讲解重点等"
            value={notes()}
            onInput={(e) => setNotes(e.currentTarget.value)}
          />
        </div>
      </div>

      <div class="section">
        <div class="row" style={{ 'margin-bottom': '8px' }}>
          <h4 style={{ flex: 1, margin: 0 }}>镜头清单</h4>
          <span class="muted small">
            共 {rows().length} 条 · 总时长 {estimate().toFixed(1)}s
          </span>
          <button class="small" onClick={addRow}>
            ＋ 加一条
          </button>
        </div>
        <div class="shot-rows">
          <div class="shot-row" style={{ 'font-size': '11px', color: 'var(--text-2)' }}>
            <span>镜头号</span>
            <span>镜头名称</span>
            <span>时长(s)</span>
            <span />
          </div>
          <For each={rows()}>
            {(row, index) => (
              <div class="shot-row">
                <input value={row.code} onInput={(e) => updateRow(index(), { code: e.currentTarget.value })} />
                <input value={row.title} onInput={(e) => updateRow(index(), { title: e.currentTarget.value })} />
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={row.duration}
                  onInput={(e) =>
                    updateRow(index(), { duration: Math.max(0.5, parseFloat(e.currentTarget.value) || 0.5) })
                  }
                />
                <button
                  class="icon small ghost"
                  title="删除"
                  onClick={() => removeRow(index())}
                  disabled={rows().length <= 1}
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </div>
        <div class="hint" style={{ 'margin-top': '8px' }}>
          保存后会按镜头清单生成制作条目，每个镜头独立拆件绑骨、打关键帧、提交审核与交付。
        </div>
      </div>

      <Show when={error()}>
        <div class="issue error">
          <span>{error()}</span>
        </div>
      </Show>
    </Modal>
  );
}

export function deleteProjectWithConfirm(project: Project, onDone: () => void): void {
  if (window.confirm(`确定删除《${project.courseName}》及其全部镜头与交付记录？此操作不可撤销。`)) {
    deleteProject(project.id);
    toast('项目已删除。', 'ok');
    onDone();
  }
}
