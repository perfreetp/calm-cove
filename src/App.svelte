<script lang="ts">
  import { store } from './lib/store.svelte';
  import ArchiveView from './components/ArchiveView.svelte';
  import StudioView from './components/StudioView.svelte';
  import CompareView from './components/CompareView.svelte';
  import ReportsView from './components/ReportsView.svelte';
  import type { Role } from './lib/types';

  type Tab = 'archive' | 'studio' | 'compare' | 'reports';
  let tab = $state<Tab>('archive');

  const tabs: { id: Tab; label: string; roles: Role[] }[] = [
    { id: 'archive', label: '档案室', roles: ['designer', 'judge'] },
    { id: 'studio', label: '路线工作室', roles: ['designer', 'judge'] },
    { id: 'compare', label: '版本比对', roles: ['designer', 'judge'] },
    { id: 'reports', label: '季度报告', roles: ['designer', 'judge'] },
  ];

  function switchRole(r: Role) {
    store.setRole(r);
  }
</script>

<div class="app">
  <header>
    <div class="brand">🐎 马术场地障碍路线工作室</div>
    <nav>
      {#each tabs as t (t.id)}
        <button class={tab === t.id ? 'primary' : 'ghost'} onclick={() => (tab = t.id)}>{t.label}</button>
      {/each}
    </nav>
    <div class="role-switch">
      <span class="muted small">身份</span>
      <button class={store.session.role === 'designer' ? 'primary' : ''} onclick={() => switchRole('designer')}>
        路线设计师
      </button>
      <button class={store.session.role === 'judge' ? 'primary' : ''} onclick={() => switchRole('judge')}>
        裁判
      </button>
    </div>
  </header>

  <main>
    {#if tab === 'archive'}
      <ArchiveView onopen={() => (tab = 'studio')} />
    {:else if tab === 'studio'}
      <StudioView />
    {:else if tab === 'compare'}
      <CompareView />
    {:else}
      <ReportsView />
    {/if}
  </main>
</div>

<style>
  .app { display: flex; flex-direction: column; height: 100%; }
  header {
    display: flex; align-items: center; gap: 18px;
    padding: 10px 18px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .brand { font-weight: 700; font-size: 16px; white-space: nowrap; }
  nav { display: flex; gap: 8px; flex: 1; }
  .role-switch { display: flex; align-items: center; gap: 8px; }
  main { flex: 1; min-height: 0; padding: 16px; }
</style>
