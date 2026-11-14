import { Dashboard } from './components/dashboard.js';
import { DispatchBoard } from './components/dispatch-board.js';
import { FrontDesk } from './components/front-desk.js';
import { LightingStudio } from './components/lighting-studio.js';
import { QcDesk } from './components/qc-desk.js';
import { WashDesk } from './components/wash-desk.js';
import { store } from './store.js';

customElements.define('lighting-studio', LightingStudio);
customElements.define('front-desk', FrontDesk);
customElements.define('dispatch-board', DispatchBoard);
customElements.define('wash-desk', WashDesk);
customElements.define('qc-desk', QcDesk);
customElements.define('app-dashboard', Dashboard);

const TABS: { id: string; label: string; tag: string }[] = [
  { id: 'studio', label: '照明布光', tag: 'lighting-studio' },
  { id: 'front', label: '前台接单', tag: 'front-desk' },
  { id: 'dispatch', label: '工单分派', tag: 'dispatch-board' },
  { id: 'wash', label: '洗涤工位', tag: 'wash-desk' },
  { id: 'qc', label: '质检台', tag: 'qc-desk' },
  { id: 'board', label: '看板统计', tag: 'app-dashboard' },
];

function mount(tabId: string): void {
  const tab = TABS.find((t) => t.id === tabId)!;
  const host = document.querySelector<HTMLElement>('[data-role="view"]')!;
  host.innerHTML = `<${tab.tag}></${tab.tag}>`;
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });
  localStorage.setItem('llw.tab', tabId);
}

function boot(): void {
  store.init();
  const nav = document.querySelector('[data-role="nav"]')!;
  nav.innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}">${t.label}</button>`).join('');
  nav.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-tab]') as HTMLElement | null;
    if (btn) mount(btn.dataset.tab!);
  });
  mount(localStorage.getItem('llw.tab') ?? 'studio');
}

boot();
