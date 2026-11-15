<script lang="ts">
  import { app } from '../lib/store.svelte';
  import Icon from '../components/Icon.svelte';
  import { coaches } from '../lib/seed';

  interface Props {
    onClose: () => void;
  }
  let { onClose }: Props = $props();

  function pick(id: string) {
    app.setActor(id);
    onClose();
  }
</script>

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onClose()}>
  <div class="pop card">
    <div class="p-head">
      <span class="eyebrow">切换操作人</span>
      <button class="x" onclick={onClose} aria-label="关闭"><Icon name="close" size={12} /></button>
    </div>
    <p class="p-note">演示环境：切换操作人后，新的复核与编排记录将以此人署名。</p>
    {#each coaches as c (c.id)}
      <button class="who-row" class:on={app.actorId === c.id} onclick={() => pick(c.id)}>
        <span class="av">{c.initials}</span>
        <span class="wt">
          <span class="wn">{c.name}</span>
          <span class="wr">{c.role}</span>
        </span>
        {#if app.actorId === c.id}
          <Icon name="check" size={12} />
        {/if}
      </button>
    {/each}
    <hr class="hairline" />
    <button class="reset" onclick={() => { app.resetDemo(); onClose(); }}>
      <Icon name="refresh" size={12} />
      恢复演示数据
    </button>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 160;
    background: rgba(2, 10, 12, 0.4);
  }
  .pop {
    position: absolute;
    top: 50px;
    right: 16px;
    width: 246px;
    padding: 12px;
    background: #08232a;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.55);
    animation: popIn 0.16s ease both;
  }
  @keyframes popIn {
    from { opacity: 0; transform: translateY(-4px); }
  }
  .p-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }
  .x {
    color: var(--muted);
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
  }
  .p-note {
    font-size: 9.5px;
    color: var(--muted-2);
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .who-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 7px;
    border-radius: 2px;
    color: var(--ink-2);
    text-align: left;
  }
  .who-row:hover {
    background: rgba(111, 211, 216, 0.06);
  }
  .who-row.on {
    background: rgba(233, 177, 84, 0.08);
    color: var(--amber);
  }
  .av {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 10px;
    background: var(--panel-3);
    border: 1px solid var(--line);
    color: var(--teal);
  }
  .wt {
    display: flex;
    flex-direction: column;
    flex: 1;
    line-height: 1.25;
  }
  .wn {
    font-size: 11.5px;
  }
  .wr {
    font-size: 9px;
    color: var(--muted-2);
  }
  .reset {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 8px;
    padding: 6px 7px;
    border-radius: 2px;
    font-size: 10.5px;
    color: var(--muted);
  }
  .reset:hover {
    background: rgba(234, 125, 109, 0.08);
    color: var(--red);
  }
</style>
