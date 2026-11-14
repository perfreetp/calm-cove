import './components/dashboard.js';
import './components/rigging.js';
import './components/animator.js';
import './components/metrics.js';
import './components/qc.js';
import './components/coach.js';
import './components/exporter.js';
import { state, update, subscribe } from './store.js';
import { Role } from './types.js';

interface Route { path: string; label: string; tag: string; roles: Role[] }

const ROUTES: Route[] = [
  { path: 'dashboard', label: '总览', tag: 'x-dashboard', roles: ['animator', 'reviewer'] },
  { path: 'rigging', label: '绑骨', tag: 'x-rigging', roles: ['animator'] },
  { path: 'animator', label: '动画时间轴', tag: 'x-animator', roles: ['animator'] },
  { path: 'metrics', label: '数据对比', tag: 'x-metrics', roles: ['animator', 'reviewer'] },
  { path: 'qc', label: '批次质检', tag: 'x-qc', roles: ['animator', 'reviewer'] },
  { path: 'coach', label: '教练端', tag: 'x-coach', roles: ['animator', 'reviewer', 'coach'] },
  { path: 'export', label: '导出', tag: 'x-exporter', roles: ['animator', 'reviewer'] },
];

const outlet = document.getElementById('outlet')!;
const nav = document.getElementById('main-nav')!;
const roleSel = document.getElementById('role-select') as HTMLSelectElement;

function currentPath(): string {
  return (location.hash.replace(/^#\//, '') || 'dashboard').split('?')[0];
}

function allowed(r: Route): boolean {
  return r.roles.includes(state.ui.role);
}

function renderNav(): void {
  nav.innerHTML = ROUTES.filter(allowed).map(r =>
    `<a href="#/${r.path}" class="${currentPath() === r.path ? 'active' : ''}">${r.label}</a>`).join('');
}

function route(): void {
  let r = ROUTES.find(x => x.path === currentPath());
  if (!r || !allowed(r)) {
    r = ROUTES.find(allowed)!;
    history.replaceState(null, '', `#/${r.path}`);
  }
  renderNav();
  outlet.innerHTML = '';
  outlet.appendChild(document.createElement(r.tag));
}

roleSel.value = state.ui.role;
roleSel.addEventListener('change', () => {
  update(s => { s.ui.role = roleSel.value as Role; });
});

subscribe(() => {
  if (roleSel.value !== state.ui.role) roleSel.value = state.ui.role;
  renderNav();
});
window.addEventListener('hashchange', route);
route();
