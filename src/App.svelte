<script lang="ts">
  import { app } from './lib/store.svelte';
  import { view } from './lib/viewStore.svelte';
  import Icon from './components/Icon.svelte';
  import Overview from './pages/Overview.svelte';
  import Schedule from './pages/Schedule.svelte';
  import RaceDay from './pages/RaceDay.svelte';
  import Sessions from './pages/Sessions.svelte';
  import Review from './pages/Review.svelte';
  import LanePlan from './pages/LanePlan.svelte';
  import Stats from './pages/Stats.svelte';
  import AuditDrawer from './components/AuditDrawer.svelte';
  import SettingsPopover from './components/SettingsPopover.svelte';

  const viewerNav = [
    { key: 'overview', label: '水域总览', icon: 'overview', hint: '分层平面图 · 轨迹' },
    { key: 'schedule', label: '训练日程', icon: 'sessions', hint: '教练发布的科目' },
    { key: 'raceday', label: '赛事日', icon: 'laneplan', hint: '分组名单 · 赛道' }
  ];
  const coachNav = [
    { key: 'sessions', label: '训练编排', icon: 'sessions', hint: '科目 · 航道 · 风向' },
    { key: 'review', label: '判读复核', icon: 'review', hint: '异常趟次逐条处理' },
    { key: 'races', label: '赛事编排', icon: 'laneplan', hint: '分组 · 赛道 · 冲突' },
    { key: 'stats', label: '统计报告', icon: 'stats', hint: '分段 · 偏航 · 出勤' }
  ];

  const routes = new Set(['overview', 'schedule', 'raceday', 'sessions', 'review', 'races', 'stats']);
  const coachRoutes = new Set(['sessions', 'review', 'races', 'stats']);

  function routeFromHash(): { role: 'viewer' | 'coach'; page: string } {
    const raw = location.hash.replace(/^#\/?/, '');
    const [role, page] = raw.split('/');
    if (role === 'coach') {
      return { role: 'coach', page: coachRoutes.has(page) ? page : 'review' };
    }
    return { role: 'viewer', page: routes.has(page) && !coachRoutes.has(page) ? page : 'overview' };
  }

  const initial = routeFromHash();
  view.role = initial.role;
  view.page = initial.page;

  function pushHash() {
    const h = `#/${view.role}/${view.page}`;
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  $effect(() => {
    const role = view.role;
    const page = view.page;
    pushHash();
    document.title = `青澜 · ${role === 'coach' ? '教练端' : '观众端'} — ${
      (role === 'coach' ? coachNav : viewerNav).find((n) => n.key === page)?.label ?? ''
    }`;
  });

  $effect(() => {
    function onHash() {
      const r = routeFromHash();
      if (r.role !== view.role || r.page !== view.page) {
        view.role = r.role;
        view.page = r.page;
        view.clearSelection();
        view.playback = null;
      }
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  });

  function go(page: string) {
    view.page = page;
    view.clearSelection();
    view.playback = null;
    if (view.auditOpen) view.auditOpen = false;
  }

  function setRole(role: 'viewer' | 'coach') {
    if (role === view.role) return;
    view.role = role;
    go(role === 'coach' ? 'review' : 'overview');
  }

  const nav = $derived(view.role === 'coach' ? coachNav : viewerNav);
  const pageLabel = $derived(nav.find((n) => n.key === view.page)?.label ?? '');
  const pendingCount = $derived(app.data.runs.filter((r) => r.status === 'pending').length);
  const publishedSessions = $derived(app.data.sessions.filter((s) => s.status === 'published').length);
  const liveRuns = $derived(app.data.runs.filter((r) => r.uploadedAt > Date.now() - 6 * 3600_000).length);
  let settingsOpen = $state(false);

  function isActive(key: string) {
    return view.page === key;
  }

  /* ---- keyboard shortcuts ---- */
  const COACH_ORDER = ['sessions', 'review', 'races', 'stats'];
  const VIEWER_ORDER = ['overview', 'schedule', 'raceday'];

  function onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'l') {
      view.auditOpen = !view.auditOpen;
      e.preventDefault();
      return;
    }
    if (k === 'escape') {
      if (view.auditOpen) view.auditOpen = false;
      else if (settingsOpen) settingsOpen = false;
      else if (view.selected.length) view.clearSelection();
      return;
    }
    const order = view.role === 'coach' ? COACH_ORDER : VIEWER_ORDER;
    const n = Number(k);
    if (n >= 1 && n <= order.length) {
      go(order[n - 1]);
      e.preventDefault();
      return;
    }
    if (k === 'r') {
      setRole(view.role === 'coach' ? 'viewer' : 'coach');
      e.preventDefault();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell">
  <!-- ============ RAIL ============ -->
  <aside class="rail">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0b2a28" stroke="#1d4a47" />
        <path d="M6 21c3 0 4-1.7 7-1.7S17 21 20 21s4-1.7 6-1.7" stroke="#e9b154" stroke-width="2.1" fill="none" stroke-linecap="round" />
        <path d="M9 14.5l8-5 8 5" stroke="#6fd3d8" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <div class="brand-txt">
        <div class="brand-name">青澜</div>
        <div class="brand-sub mono">ROWING OPS</div>
      </div>
    </div>

    <div class="role">
      <div class="role-label eyebrow">当前视角</div>
      <div class="role-switch">
        <button class:on={view.role === 'viewer'} onclick={() => setRole('viewer')}>
          <Icon name="eye" size={13} />
          观众端
        </button>
        <button class:on={view.role === 'coach'} onclick={() => setRole('coach')}>
          <Icon name="anchor" size={13} />
          教练端
        </button>
      </div>
      {#if view.role === 'viewer'}
        <p class="role-note">只读视图 · 同步教练端已发布内容</p>
      {:else}
        <p class="role-note coach">可编辑 · 所有改动留痕</p>
      {/if}
    </div>

    <nav class="nav">
      {#each nav as item (item.key)}
        <button class="nav-item" class:on={isActive(item.key)} onclick={() => go(item.key)}>
          <span class="ni-icon"><Icon name={item.icon} size={15} /></span>
          <span class="ni-txt">
            <span class="ni-label">{item.label}</span>
            <span class="ni-hint">{item.hint}</span>
          </span>
          {#if item.key === 'review' && pendingCount > 0}
            <span class="ni-count mono">{pendingCount}</span>
          {/if}
          {#if item.key === 'schedule'}
            <span class="ni-count mono soft">{publishedSessions}</span>
          {/if}
        </button>
      {/each}
    </nav>

    <div class="rail-foot">
      <button class="log-btn" onclick={() => (view.auditOpen = true)}>
        <Icon name="audit" size={13} />
        <span>操作记录</span>
        <span class="kbd">L</span>
      </button>
      <div class="status-inline">
        <span class="live-dot"></span>
        <span class="mono">实时同步 · {liveRuns} 趟</span>
      </div>
      <div class="version mono">v1.4.2 · 青澜水库</div>
      <div class="keyhints mono">
        <span><b>1–4</b> 页面</span>
        <span><b>R</b> 视角</span>
        <span><b>L</b> 记录</span>
      </div>
    </div>
  </aside>

  <!-- ============ MAIN ============ -->
  <div class="main">
    <header class="topbar">
      <div class="crumb">
        <span class="crumb-root">{view.role === 'coach' ? '教练端' : '观众端'}</span>
        <span class="sep">/</span>
        <span class="crumb-cur">{pageLabel}</span>
        {#if view.role === 'coach'}
          <span class="edit-flag"><span class="dot"></span>编辑模式</span>
        {:else}
          <span class="read-flag"><Icon name="eye" size={11} />只读</span>
        {/if}
      </div>

      <div class="topbar-right">
        <div class="clock mono">
          <Icon name="clock" size={12} />
          <span>2026-11-15 09:24</span>
          <span class="clock-sep">·</span>
          <span class="wind">西南风 2.8 m/s</span>
        </div>
        <div class="divider"></div>
        <button class="avatar-btn" onclick={() => (settingsOpen = !settingsOpen)} title="切换操作人">
          <span class="avatar">{app.actor.initials}</span>
          <span class="who">
            <span class="who-name">{app.actor.name}</span>
            <span class="who-role">{view.role === 'coach' ? app.actor.role : '赛事观众'}</span>
          </span>
          <svg width="9" height="9" viewBox="0 0 10 10" class="caret"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
        </button>
      </div>
    </header>

    <main class="stage">
      {#if view.role === 'viewer' && view.page === 'overview'}
        <Overview />
      {:else if view.role === 'viewer' && view.page === 'schedule'}
        <Schedule />
      {:else if view.role === 'viewer' && view.page === 'raceday'}
        <RaceDay />
      {:else if view.role === 'coach' && view.page === 'sessions'}
        <Sessions />
      {:else if view.role === 'coach' && view.page === 'review'}
        <Review />
      {:else if view.role === 'coach' && view.page === 'races'}
        <LanePlan />
      {:else if view.role === 'coach' && view.page === 'stats'}
        <Stats />
      {/if}
    </main>
  </div>

  {#if settingsOpen}
    <SettingsPopover onClose={() => (settingsOpen = false)} />
  {/if}

  {#if view.auditOpen}
    <AuditDrawer onClose={() => (view.auditOpen = false)} />
  {/if}

  {#if app.toast}
    <div class="toast" class:warn={app.toast.tone === 'warn'}>
      <Icon name={app.toast.tone === 'warn' ? 'warn' : 'check'} size={13} />
      <span>{app.toast.text}</span>
    </div>
  {/if}
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* -------- rail -------- */
  .rail {
    width: 218px;
    flex: none;
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #08201f 0%, #061817 100%);
    border-right: 1px solid var(--line-soft);
    position: relative;
  }
  .rail::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(120% 60% at 0% 0%, rgba(111, 211, 216, 0.05), transparent 60%);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 16px 14px;
    border-bottom: 1px solid var(--line-soft);
  }
  .brand-txt {
    line-height: 1.1;
  }
  .brand-name {
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.14em;
    color: var(--ink);
  }
  .brand-sub {
    font-size: 8px;
    letter-spacing: 0.2em;
    color: var(--muted-2);
  }

  .role {
    padding: 13px 14px 12px;
    border-bottom: 1px solid var(--line-soft);
  }
  .role-label {
    margin-bottom: 7px;
    font-size: 8.5px;
  }
  .role-switch {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    padding: 3px;
    background: var(--bg-deep);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
  }
  .role-switch button {
    height: 27px;
    border-radius: 2px;
    font-size: 11px;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: all 0.15s;
  }
  .role-switch button:hover {
    color: var(--ink-2);
  }
  .role-switch button.on {
    background: var(--panel-3);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .role-switch button.on:first-child {
    color: var(--teal);
  }
  .role-switch button.on:last-child {
    color: var(--amber);
  }
  .role-note {
    font-size: 9.5px;
    color: var(--muted-2);
    margin-top: 8px;
    line-height: 1.4;
  }
  .role-note.coach {
    color: rgba(233, 177, 84, 0.7);
  }

  .nav {
    flex: 1;
    padding: 10px 9px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 9px;
    border-radius: var(--radius);
    color: var(--muted);
    text-align: left;
    transition: background 0.14s, color 0.14s;
    position: relative;
  }
  .nav-item:hover {
    background: rgba(111, 211, 216, 0.05);
    color: var(--ink-2);
  }
  .nav-item.on {
    background: rgba(111, 211, 216, 0.09);
    color: var(--ink);
  }
  .nav-item.on::before {
    content: '';
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: var(--amber);
    border-radius: 2px;
  }
  .ni-icon {
    width: 17px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .nav-item.on .ni-icon {
    color: var(--teal);
  }
  .ni-txt {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.3;
  }
  .ni-label {
    font-size: 12.5px;
    font-weight: 450;
  }
  .ni-hint {
    font-size: 9px;
    color: var(--muted-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ni-count {
    margin-left: auto;
    font-size: 9.5px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    display: grid;
    place-items: center;
    border-radius: 2px;
    background: var(--amber-bg);
    color: var(--amber);
    flex: none;
  }
  .ni-count.soft {
    background: rgba(111, 211, 216, 0.1);
    color: var(--muted);
  }

  .rail-foot {
    padding: 10px 12px 12px;
    border-top: 1px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .log-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 8px;
    border-radius: var(--radius);
    border: 1px solid var(--line-soft);
    background: rgba(255, 255, 255, 0.015);
    color: var(--muted);
    font-size: 11px;
  }
  .log-btn:hover {
    color: var(--ink-2);
    border-color: var(--line);
  }
  .log-btn .kbd {
    margin-left: auto;
  }
  .status-inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 9px;
    color: var(--muted-2);
    padding-left: 2px;
  }
  .live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--green);
    box-shadow: 0 0 0 0 rgba(130, 217, 171, 0.5);
    animation: pulse 2.4s infinite;
  }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 rgba(130, 217, 171, 0.4); }
    70% { box-shadow: 0 0 0 5px rgba(130, 217, 171, 0); }
    100% { box-shadow: 0 0 0 0 rgba(130, 217, 171, 0); }
  }
  .version {
    font-size: 8.5px;
    color: #41636a;
    letter-spacing: 0.05em;
    padding-left: 2px;
  }
  .keyhints {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 8px;
    font-size: 8px;
    color: #3b5a60;
  }
  .keyhints b {
    color: #4f757b;
    font-weight: 500;
  }

  /* -------- main -------- */
  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--bg);
  }
  .topbar {
    height: 47px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px 0 18px;
    border-bottom: 1px solid var(--line-soft);
    background: rgba(6, 23, 26, 0.7);
    backdrop-filter: blur(6px);
    z-index: 20;
  }
  .crumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .crumb-root {
    color: var(--muted-2);
  }
  .sep {
    color: #34565b;
  }
  .crumb-cur {
    color: var(--ink);
    font-weight: 500;
  }
  .edit-flag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 6px;
    font-size: 9.5px;
    color: var(--amber);
    padding: 2px 7px;
    border-radius: 2px;
    background: var(--amber-bg);
    border: 1px solid rgba(233, 177, 84, 0.22);
  }
  .edit-flag .dot {
    width: 4px;
    height: 4px;
  }
  .read-flag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 6px;
    font-size: 9.5px;
    color: var(--muted-2);
    padding: 2px 7px;
    border-radius: 2px;
    border: 1px solid var(--line-soft);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .clock {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.02em;
  }
  .clock-sep {
    color: #34565b;
  }
  .wind {
    color: var(--teal);
    opacity: 0.85;
  }
  .divider {
    width: 1px;
    height: 18px;
    background: var(--line-soft);
  }
  .avatar-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px 3px 3px;
    border-radius: var(--radius);
    border: 1px solid transparent;
  }
  .avatar-btn:hover {
    background: var(--panel);
    border-color: var(--line-soft);
  }
  .avatar {
    width: 25px;
    height: 25px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: linear-gradient(145deg, #1d5558, #14393d);
    border: 1px solid #2c666b;
    font-size: 11px;
    color: var(--teal);
    font-weight: 500;
  }
  .who {
    display: flex;
    flex-direction: column;
    line-height: 1.25;
    text-align: left;
  }
  .who-name {
    font-size: 11.5px;
    color: var(--ink-2);
  }
  .who-role {
    font-size: 8.5px;
    color: var(--muted-2);
  }
  .caret {
    color: var(--muted-2);
  }

  .stage {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 26px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 16px;
    border-radius: var(--radius);
    background: rgba(10, 38, 40, 0.97);
    border: 1px solid rgba(111, 211, 216, 0.34);
    color: var(--teal);
    font-size: 12px;
    box-shadow: 0 10px 34px rgba(0, 0, 0, 0.5);
    z-index: 200;
    animation: toastIn 0.26s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  .toast.warn {
    border-color: rgba(233, 177, 84, 0.4);
    color: var(--amber);
    background: rgba(38, 30, 14, 0.97);
  }
  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 1080px) {
    .rail {
      width: 62px;
    }
    .brand-txt,
    .role,
    .ni-txt,
    .ni-count,
    .rail-foot :not(.log-btn),
    .log-btn span:not(.kbd) {
      display: none;
    }
    .brand {
      justify-content: center;
      padding: 14px 0;
    }
    .nav {
      padding: 10px 6px;
    }
    .nav-item {
      justify-content: center;
      padding: 10px 0;
    }
    .log-btn {
      justify-content: center;
      padding: 0;
    }
    .log-btn .kbd {
      display: none;
    }
    .clock {
      display: none;
    }
  }
</style>
