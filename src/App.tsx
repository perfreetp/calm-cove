import { For, Match, Show, Switch, createMemo } from 'solid-js';
import { appState, setRole } from './store';
import { route, routes, navigate } from './router';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { EditorPage } from './pages/EditorPage';
import { ReviewPage } from './pages/ReviewPage';
import { LibraryPage } from './pages/LibraryPage';
import { LearnerPage } from './pages/LearnerPage';
import { DeliveriesPage } from './pages/DeliveriesPage';
import { ActivityPage } from './pages/ActivityPage';
import { ToastHost } from './components/ui';
import { loadWarning, storageError } from './store';
import type { Role } from './core/types';

interface NavItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  roles: Role[];
  match: (name: string) => boolean;
}

const NAV: NavItem[] = [
  {
    key: 'projects',
    label: '项目',
    icon: '▤',
    path: routes.projects(),
    roles: ['animator', 'supervisor'],
    match: (n) => n === 'projects' || n === 'project',
  },
  {
    key: 'editor',
    label: '动画编辑器',
    icon: '✎',
    path: routes.projects(),
    roles: ['animator'],
    match: (n) => n === 'editor',
  },
  {
    key: 'review',
    label: '审核',
    icon: '◎',
    path: routes.review(),
    roles: ['supervisor', 'animator'],
    match: (n) => n === 'review' || n === 'review-shot',
  },
  {
    key: 'library',
    label: '动作库',
    icon: '❏',
    path: routes.library(),
    roles: ['animator', 'supervisor'],
    match: (n) => n === 'library',
  },
  {
    key: 'deliveries',
    label: '交付打包',
    icon: '⇩',
    path: routes.deliveries(),
    roles: ['animator', 'supervisor'],
    match: (n) => n === 'deliveries',
  },
  {
    key: 'learner',
    label: '学员端回放',
    icon: '▶',
    path: routes.learner(),
    roles: ['animator', 'supervisor', 'learner'],
    match: (n) => n === 'learner' || n === 'learner-shot',
  },
  {
    key: 'activity',
    label: '活动记录',
    icon: '☰',
    path: routes.activity(),
    roles: ['animator', 'supervisor'],
    match: (n) => n === 'activity',
  },
];

const ROLE_LABEL: Record<Role, string> = {
  animator: '制作员',
  supervisor: '主管',
  learner: '学员',
};

export function App() {
  const currentRole = () => appState.currentUser.role;
  const visibleNav = createMemo(() => NAV.filter((n) => n.roles.includes(currentRole())));

  const activeKey = createMemo(() => {
    const name = route().name;
    return NAV.find((n) => n.match(name))?.key ?? 'projects';
  });

  const crumb = createMemo(() => {
    const r = route();
    switch (r.name) {
      case 'projects':
        return ['项目'];
      case 'project': {
        const p = appState.projects.find((x) => x.id === r.params.id);
        return ['项目', p?.courseName ?? '未知项目'];
      }
      case 'editor': {
        const s = appState.shots.find((x) => x.id === r.params.shotId);
        const p = s ? appState.projects.find((x) => x.id === s.projectId) : undefined;
        return ['项目', p?.courseName ?? '', `${s?.code ?? ''} ${s?.title ?? ''}`];
      }
      case 'review':
        return ['审核', '队列'];
      case 'review-shot': {
        const s = appState.shots.find((x) => x.id === r.params.shotId);
        return ['审核', `${s?.code ?? ''} ${s?.title ?? ''}`];
      }
      case 'library':
        return ['动作库'];
      case 'learner':
        return ['学员端'];
      case 'learner-shot': {
        const s = appState.shots.find((x) => x.id === r.params.shotId);
        return ['学员端', `${s?.code ?? ''} ${s?.title ?? ''}`];
      }
      case 'deliveries':
        return ['交付打包'];
      case 'activity':
        return ['活动记录'];
      default:
        return ['项目'];
    }
  });

  return (
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">助</div>
          <div class="brand-text">
            <div class="brand-title">助产动画工坊</div>
            <div class="brand-sub">MMS · SolidJS + WebGPU</div>
          </div>
        </div>

        <For each={visibleNav()}>
          {(item) => (
            <button
              class="nav-item"
              classList={{ active: activeKey() === item.key }}
              onClick={() => navigate(item.path)}
            >
              <span class="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          )}
        </For>

        <div class="sidebar-footer">
          <div class="small muted">当前身份</div>
          <div class="role-switch">
            <For each={['animator', 'supervisor', 'learner'] as Role[]}>
              {(role) => (
                <button classList={{ active: currentRole() === role }} onClick={() => setRole(role)}>
                  {ROLE_LABEL[role]}
                </button>
              )}
            </For>
          </div>
          <div class="small" style={{ color: 'var(--text-1)' }}>
            {appState.currentUser.name}
          </div>
        </div>
      </aside>

      <main class="main">
        <div class="topbar">
          <div class="crumbs">
            <For each={crumb()}>
              {(c, i) => (
                <>
                  <Show when={i() > 0}>
                    <span>/</span>
                  </Show>
                  <Show when={i() === crumb().length - 1} fallback={<span>{c}</span>}>
                    <span class="current">{c}</span>
                  </Show>
                </>
              )}
            </For>
          </div>
          <div class="spacer" />
          <Show when={loadWarning()}>
            <span class="badge warn">{loadWarning()}</span>
          </Show>
          <Show when={storageError()}>
            <span class="badge danger">{storageError()}</span>
          </Show>
          <span class="badge">{ROLE_LABEL[currentRole()]}</span>
          <button class="small ghost" onClick={() => navigate(routes.projects())}>
            项目总览
          </button>
        </div>

        <Switch>
          <Match when={route().name === 'projects'}>
            <ProjectsPage />
          </Match>
          <Match when={route().name === 'project'}>
            <ProjectPage projectId={route().params.id} />
          </Match>
          <Match when={route().name === 'editor'}>
            <EditorPage shotId={route().params.shotId} />
          </Match>
          <Match when={route().name === 'review' || route().name === 'review-shot'}>
            <ReviewPage shotId={route().params.shotId} />
          </Match>
          <Match when={route().name === 'library'}>
            <LibraryPage />
          </Match>
          <Match when={route().name === 'learner' || route().name === 'learner-shot'}>
            <LearnerPage shotId={route().params.shotId} />
          </Match>
          <Match when={route().name === 'deliveries'}>
            <DeliveriesPage />
          </Match>
          <Match when={route().name === 'activity'}>
            <ActivityPage />
          </Match>
        </Switch>
      </main>

      <ToastHost />
    </div>
  );
}
