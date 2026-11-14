import { For, Show, createMemo } from 'solid-js';
import { appState, projectById, shotById } from '../store';
import { navigate, routes } from '../router';
import { fmtDateTime } from '../core/workflow';
import type { ActivityEvent } from '../core/types';

const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  submit: '提交审核',
  reject: '退回返工',
  approve: '通过锁版',
  deliver: '打包交付',
  create: '立项建组',
  sync: '动作同步',
  save: '保存',
};

const KIND_TONE: Record<ActivityEvent['kind'], string> = {
  submit: 'violet',
  reject: 'danger',
  approve: 'ok',
  deliver: 'info',
  create: '',
  sync: 'warn',
  save: '',
};

export function ActivityPage() {
  const events = createMemo(() => appState.events);

  return (
    <div class="page">
      <div class="page-head">
        <div style={{ flex: 1 }}>
          <h1>活动记录</h1>
          <p>提交、退回、通过、交付与动作同步的时间线，用于追溯返工次数与流转时间。</p>
        </div>
        <span class="badge">{events().length} 条</span>
      </div>

      <Show when={events().length} fallback={<div class="empty">暂无活动记录。</div>}>
        <div class="col" style={{ gap: '6px' }}>
          <For each={events()}>
            {(event) => {
              const shot = () => (event.shotId ? shotById(event.shotId) : undefined);
              const project = () => (event.projectId ? projectById(event.projectId) : undefined);
              return (
                <div class="card" style={{ padding: '9px 13px' }}>
                  <div class="row wrap">
                    <span class={`badge ${KIND_TONE[event.kind]}`}>{KIND_LABEL[event.kind]}</span>
                    <span class="small" style={{ flex: 1 }}>
                      {event.detail}
                    </span>
                    <span class="muted small mono">{fmtDateTime(event.at)}</span>
                    <span class="muted small">{event.actor}</span>
                    <Show when={shot()}>
                      <button class="small ghost" onClick={() => navigate(routes.editor(shot()!.id))}>
                        打开镜头
                      </button>
                    </Show>
                    <Show when={!shot() && project()}>
                      <button class="small ghost" onClick={() => navigate(routes.project(project()!.id))}>
                        打开项目
                      </button>
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
