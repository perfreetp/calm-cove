<script lang="ts" generics="T extends string">
  interface Props {
    options: { value: T; label: string; count?: number }[];
    value: T;
    onchange?: (v: T) => void;
    dense?: boolean;
  }
  let { options, value, onchange, dense = false }: Props = $props();
</script>

<div class="seg" class:dense role="tablist">
  {#each options as o (o.value)}
    <button
      role="tab"
      aria-selected={value === o.value}
      class:on={value === o.value}
      onclick={() => onchange?.(o.value)}
    >
      {o.label}
      {#if o.count !== undefined}
        <span class="count mono">{o.count}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: inline-flex;
    padding: 2px;
    background: var(--bg-deep);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    gap: 2px;
  }
  button {
    height: 26px;
    padding: 0 10px;
    border-radius: 2px;
    color: var(--muted);
    font-size: 11.5px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    transition: background 0.13s, color 0.13s;
    white-space: nowrap;
  }
  button:hover {
    color: var(--ink-2);
  }
  button.on {
    background: var(--panel-3);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .dense button {
    height: 23px;
    font-size: 11px;
    padding: 0 8px;
  }
  .count {
    font-size: 9.5px;
    color: var(--muted-2);
  }
  button.on .count {
    color: var(--amber);
  }
</style>
