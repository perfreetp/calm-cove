<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import { formatStamp } from '../lib/geo';
  import type { AuditKind } from '../lib/types';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  const kinds: { key: 'all' | AuditKind; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'session', label: '训练科目' },
    { key: 'review', label: '复核' },
    { key: 'race', label: '赛事' },
    { key: 'upload', label: '上传' },
    { key: 'system', label: '系统' }
  ];
  let kind = $state<'all' | AuditKind>('all');

  const events = $derived(
    app.data.audit.filter((e) => kind === 'all' || e.kind === kind)
  );

  const kindMeta: Record<AuditKind, { label: string; color: string }> = {
    session: { label: '科目', color: 'var(--teal)' },
    review: { label: '复核', color: 'var(--amber)' },
    race: { label: '赛事', color: 'var(--lilac)' },
    upload: { label: '上传', color: 'var(--green)' },
    system: { label: '系统', color: 'var(--muted)' }
  };

  function dayOf(at: number) {
    const d = new Date(at);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const grouped = $derived.by(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) {
      const k = dayOf(e.at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return [...m.entries()];
  });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <aside class="drawer">
    <header class="d-head">
      <div>
        <div class="eyebrow">操作记录</div>
        <h2>全部改动留痕</h2>
      </div>
      <button class="close" onclick={onClose} aria-label="关闭">
        <Icon name="close" size={15} />
      </button>
    </header>

    <div class="filters">
      {#each kinds as k (k.key)}
        <button class="fchip" class:on={kind === k.key} onclick={() => (kind = k.key)}>
          {#if k.key !== 'all'}
            <i style={`background:${kindMeta[k.key as AuditKind].color}`}></i>
          {/if}
          {k.label}
        </button>
      {/each}
    </div>

    <div class="list">
      {#each grouped as [day, items] (day)}
        <div class="day-label mono">{day}</div>
        {#each items as e (e.id)}
          <div class="ev">
            <div class="ev-rail">
              <span class="ev-dot" style={`background:${kindMeta[e.kind].color}`}></span>
              <span class="ev-line"></span>
            </div>
            <div class="ev-body">
              <div class="ev-top">
                <span class="ev-action">{e.action}</span>
                <span class="ev-target">{e.target}</span>
                <span class="ev-time mono">{formatStamp(e.at)}</span>
              </div>
              <div class="ev-detail">{e.detail}</div>
              <div class="ev-actor">
                <span class="actor-dot {e.actorRole}"></span>
                {e.actor}
                <span class="ev-kind mono">{kindMeta[e.kind].label}</span>
              </div>
            </div>
          </div>
        {/each}
      {/each}
      {#if !events.length}
        <div class="empty">暂无记录</div>
      {/if}
    </div>

    <footer class="d-foot mono">
      共 {app.data.audit.length} 条 · 记录操作人与时间 · 不可编辑
    </footer>
  </aside>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(2, 10, 12, 0.62);
    backdrop-filter: blur(3px);
    z-index: 150;
    display: flex;
    justify-content: flex-end;
    animation: scrimIn 0.18s ease both;
  }
  @keyframes scrimIn {
    from { opacity: 0; }
  }
  .drawer {
    width: 420px;
    max-width: 92vw;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #071e22;
    border-left: 1px solid var(--line);
    box-shadow: -20px 0 60px rgba(0, 0, 0, 0.5);
    animation: slideIn 0.26s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  @keyframes slideIn {
    from { transform: translateX(30px); opacity: 0; }
  }
  .d-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 16px 18px 13px;
    border-bottom: 1px solid var(--line-soft);
  }
  .d-head h2 {
    font-size: 15px;
    font-weight: 500;
    margin-top: 3px;
  }
  .close {
    color: var(--muted);
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 2px;
  }
  .close:hover {
    background: var(--panel-3);
    color: var(--ink);
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .fchip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px;
    border-radius: 2px;
    font-size: 10px;
    color: var(--muted);
    border: 1px solid transparent;
  }
  .fchip:hover {
    color: var(--ink-2);
  }
  .fchip.on {
    color: var(--ink);
    background: var(--panel-2);
    border-color: var(--line);
  }
  .fchip i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }
  .list {
    flex: 1;
    overflow-y: auto;
    padding: 10px 16px 20px;
  }
  .day-label {
    font-size: 9px;
    color: var(--muted-2);
    letter-spacing: 0.12em;
    padding: 10px 0 6px 22px;
  }
  .ev {
    display: flex;
    gap: 0;
  }
  .ev-rail {
    width: 22px;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 5px;
  }
  .ev-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
    box-shadow: 0 0 0 2.5px rgba(255, 255, 255, 0.04);
  }
  .ev-line {
    width: 1px;
    flex: 1;
    background: var(--line-soft);
    margin: 3px 0 0;
  }
  .ev:last-child .ev-line {
    background: linear-gradient(var(--line-soft), transparent);
  }
  .ev-body {
    flex: 1;
    padding: 0 0 12px 8px;
    min-width: 0;
  }
  .ev-top {
    display: flex;
    align-items: baseline;
    gap: 7px;
    flex-wrap: wrap;
  }
  .ev-action {
    font-size: 11.5px;
    color: var(--ink);
  }
  .ev-target {
    font-size: 11px;
    color: var(--teal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ev-time {
    font-size: 9px;
    color: var(--muted-2);
    margin-left: auto;
  }
  .ev-detail {
    font-size: 10.5px;
    color: var(--muted);
    line-height: 1.55;
    margin-top: 2px;
  }
  .ev-actor {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .actor-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--amber);
  }
  .actor-dot.system {
    background: var(--muted);
  }
  .actor-dot.athlete {
    background: var(--green);
  }
  .ev-kind {
    margin-left: 3px;
    padding: 0 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.03);
  }
  .empty {
    padding: 40px;
    text-align: center;
    color: var(--muted-2);
    font-size: 11px;
  }
  .d-foot {
    padding: 9px 18px;
    border-top: 1px solid var(--line-soft);
    font-size: 8.5px;
    color: var(--muted-2);
    letter-spacing: 0.05em;
    background: rgba(4, 16, 19, 0.6);
  }
  @media (max-width: 900px) {
    .drawer { width: 100%; }
  }
</style>
