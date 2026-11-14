import { For, Show, createMemo, createSignal } from 'solid-js';
import { appState, addShot, deleteShot, projectById, setShotMeta, shotsOf, deleteProject } from '../store';
import { deadlineInfo, STATUS_LABEL, STATUS_ORDER, projectProgress, fmtDateTime } from '../core/workflow';
import { navigate, routes } from '../router';
import { Modal, toast } from '../components/ui';
import type { Shot } from '../core/types';
import { countKeys } from '../core/animation';
import { validateShot } from '../core/validation';

export interface ProjectPageProps {
  projectId: string;
}

export function ProjectPage(props: ProjectPageProps) {
  const project = createMemo(() => projectById(props.projectId));
  const shots = createMemo(() => (project() ? shotsOf(project()!.id) : []));
  const info = createMemo(() => (project() ? deadlineInfo(project()!.dueDate) : undefined));
  const progress = createMemo(() => projectProgress(shots()));
  const [showAddShot, setShowAddShot] = createSignal(false);

  const actionIds = createMemo(() => new Set(appState.actions.map((a) => a.id)));
  const validationOf = (shot: Shot) => validateShot(shot, actionIds());

  const totals = createMemo(() => ({
    draft: shots().filter((s) => s.status === 'draft').length,
    review: shots().filter((s) => s.status === 'in_review').length,
    rework: shots().filter((s) => s.status === 'rework').length,
    approved: shots().filter((s) => s.status === 'approved').length,
    delivered: shots().filter((s) => s.status === 'delivered').length,
    reworkTotal: shots().reduce((n, s) => n + s.reworkCount, 0),
  }));

  return (
    <Show
      when={project()}
      fallback={
        <div class="page">
          <div class="empty">项目不存在或已被删除。</div>
        </div>
      }
    >
      <div class="page">
        <div class="page-head">
          <div style={{ flex: 1 }}>
            <div class="row" style={{ gap: '8px' }}>
              <h1>{project()!.courseName}</h1>
              <span class={`badge ${info()!.overdue ? 'danger' : info()!.warning ? 'warn' : 'ok'}`}>
                {info()!.label}
              </span>
            </div>
            <p>
              {project()!.client} · 交片 {project()!.dueDate} · {project()!.resolution.label} @ {project()!.fps}fps
            </p>
          </div>
          <button class="small" onClick={() => navigate(routes.library())}>
            动作库
          </button>
          <button
            class="small danger"
            onClick={() => {
              if (window.confirm(`确定删除《${project()!.courseName}》？`)) {
                deleteProject(project()!.id);
                navigate(routes.projects());
              }
            }}
          >
            删除项目
          </button>
          <button class="primary" onClick={() => setShowAddShot(true)}>
            ＋ 新增镜头
          </button>
        </div>

        <div
          class="grid-projects"
          style={{ 'grid-template-columns': 'repeat(auto-fit, minmax(160px, 1fr))', 'margin-bottom': '18px' }}
        >
          <div class="card" style={{ padding: '12px 14px' }}>
            <div class="muted small">制作进度</div>
            <div style={{ 'font-size': '22px', 'font-weight': 700 }}>
              {progress().approved}/{progress().total}
            </div>
            <div class="progress" style={{ 'margin-top': '8px' }}>
              <span style={{ width: `${progress().percent}%` }} />
            </div>
          </div>
          <div class="card" style={{ padding: '12px 14px' }}>
            <div class="muted small">剩余天数</div>
            <div
              style={{
                'font-size': '22px',
                'font-weight': 700,
                color: info()!.overdue ? 'var(--danger)' : info()!.warning ? 'var(--warn)' : 'var(--ok)',
              }}
            >
              {info()!.overdue ? `超期 ${Math.abs(info()!.daysLeft)} 天` : `${info()!.daysLeft} 天`}
            </div>
            <div class="hint">按交片日期自动计算并预警</div>
          </div>
          <div class="card" style={{ padding: '12px 14px' }}>
            <div class="muted small">待审核</div>
            <div style={{ 'font-size': '22px', 'font-weight': 700, color: 'var(--violet)' }}>{totals().review}</div>
            <div class="hint">提交后等待主管逐帧查看</div>
          </div>
          <div class="card" style={{ padding: '12px 14px' }}>
            <div class="muted small">返工中 / 累计</div>
            <div style={{ 'font-size': '22px', 'font-weight': 700, color: 'var(--danger)' }}>
              {totals().rework} <span class="small muted">/ {totals().reworkTotal}</span>
            </div>
            <div class="hint">退回一次即计数并记录时间</div>
          </div>
        </div>

        <Show when={project()!.notes}>
          <div class="section" style={{ 'margin-bottom': '16px' }}>
            <h4>立项备注</h4>
            <div class="small" style={{ color: 'var(--text-1)', 'white-space': 'pre-wrap' }}>
              {project()!.notes}
            </div>
          </div>
        </Show>

        <div class="row" style={{ 'margin-bottom': '8px' }}>
          <h2 style={{ flex: 1 }}>镜头清单</h2>
          <span class="muted small">
            {totals().draft} 制作中 · {totals().review} 待审 · {totals().rework} 返工 · {totals().approved} 通过 ·{' '}
            {totals().delivered} 已交付
          </span>
        </div>

        <Show
          when={shots().length}
          fallback={<div class="empty">该项目还没有镜头。点「＋ 新增镜头」录入镜头名与时长。</div>}
        >
          <div class="table-wrap">
            <table class="data">
              <thead>
                <tr>
                  <th>镜头</th>
                  <th>名称</th>
                  <th>时长</th>
                  <th>关键帧</th>
                  <th>负责人</th>
                  <th>状态</th>
                  <th>返工</th>
                  <th>更新时间</th>
                  <th>校验</th>
                  <th style={{ 'text-align': 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                <For each={shots()}>
                  {(shot) => {
                    const validation = () => validationOf(shot);
                    return (
                      <tr>
                        <td class="mono">{shot.code}</td>
                        <td>{shot.title}</td>
                        <td class="mono">{shot.duration.toFixed(1)}s</td>
                        <td class="mono">{countKeys(shot.tracks)}</td>
                        <td>
                          <input
                            value={shot.assignee}
                            style={{ width: '86px', padding: '2px 6px', 'font-size': '12px' }}
                            onInput={(e) => setShotMeta(shot.id, { assignee: e.currentTarget.value })}
                          />
                        </td>
                        <td>
                          <select value={shot.status} disabled style={{ padding: '2px 6px', 'font-size': '12px' }}>
                            <For each={STATUS_ORDER}>{(s) => <option value={s}>{STATUS_LABEL[s]}</option>}</For>
                          </select>
                        </td>
                        <td>
                          <Show when={shot.reworkCount > 0} fallback={<span class="muted">—</span>}>
                            <span class="badge danger">{shot.reworkCount}</span>
                          </Show>
                        </td>
                        <td class="muted small">{fmtDateTime(shot.updatedAt)}</td>
                        <td>
                          <Show
                            when={validation().errors.length === 0}
                            fallback={
                              <span class="badge danger" title={validation().errors[0]?.message}>
                                {validation().errors.length} 错误
                              </span>
                            }
                          >
                            <span class="badge ok">正常</span>
                          </Show>
                        </td>
                        <td style={{ 'text-align': 'right' }}>
                          <div class="row" style={{ 'justify-content': 'flex-end', gap: '4px' }}>
                            <button class="small primary" onClick={() => navigate(routes.editor(shot.id))}>
                              编辑器
                            </button>
                            <button class="small" onClick={() => navigate(routes.reviewShot(shot.id))}>
                              审核
                            </button>
                            <button
                              class="small ghost"
                              title="删除镜头"
                              onClick={() => {
                                if (window.confirm(`删除镜头 ${shot.code}《${shot.title}》？`)) {
                                  deleteShot(shot.id);
                                  toast('镜头已删除。', 'ok');
                                }
                              }}
                            >
                              ✕
                            </button>
                          </div>
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

      <Show when={showAddShot()}>
        <AddShotModal projectId={props.projectId} onClose={() => setShowAddShot(false)} />
      </Show>
    </Show>
  );
}

function AddShotModal(props: { projectId: string; onClose: () => void }) {
  const [code, setCode] = createSignal('');
  const [title, setTitle] = createSignal('');
  const [duration, setDuration] = createSignal(5);
  const project = createMemo(() => projectById(props.projectId));

  return (
    <Modal
      title="新增镜头"
      onClose={props.onClose}
      footer={
        <>
          <button onClick={props.onClose}>取消</button>
          <button
            class="primary"
            onClick={() => {
              if (!title().trim()) {
                toast('请填写镜头名称。', 'error');
                return;
              }
              const shot = addShot(props.projectId, {
                code: code().trim(),
                title: title().trim(),
                duration: duration(),
              });
              toast(`已新增镜头 ${shot.code}。`, 'ok');
              props.onClose();
              navigate(routes.editor(shot.id));
            }}
          >
            创建并进入编辑器
          </button>
        </>
      }
    >
      <div class="form-grid">
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">镜头号</label>
          <input placeholder="S05" value={code()} onInput={(e) => setCode(e.currentTarget.value)} />
        </div>
        <div class="col" style={{ gap: '4px' }}>
          <label class="small">时长（秒）</label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={duration()}
            onInput={(e) => setDuration(Math.max(0.5, parseFloat(e.currentTarget.value) || 0.5))}
          />
        </div>
        <div class="col full" style={{ gap: '4px' }}>
          <label class="small">镜头名称</label>
          <input placeholder="例：胎头娩出特写" value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </div>
      </div>
      <div class="hint">
        新镜头沿用项目的骨骼模板「{project()?.templateId === 'mechanism' ? '分娩机制全景' : project()?.templateId}」，
        可在编辑器里继续拆件、绑骨与打帧。
      </div>
    </Modal>
  );
}
