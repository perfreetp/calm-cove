<script lang="ts">
  import { LAYER_DEFS, LAYER_GROUPS, LAYER_SHORT } from '../lib/ui';
  import type { LayerId, LayerState } from '../lib/types';
  import Icon from './Icon.svelte';

  interface Props {
    layers: LayerState;
    onchange?: (id: LayerId, on: boolean) => void;
    onSolo?: (id: LayerId) => void;
    compact?: boolean;
    counts?: Partial<Record<LayerId, number>>;
  }
  let { layers, onchange, onSolo, compact = false, counts = {} }: Props = $props();

  let collapsed = $state(false);
  const activeCount = $derived(Object.values(layers).filter(Boolean).length);
</script>

<div class="lp" class:compact>
  <button class="lp-head" onclick={() => (collapsed = !collapsed)} aria-expanded={!collapsed}>
    <span class="head-left">
      <Icon name="layers" size={13} />
      <span>图层</span>
    </span>
    <span class="head-right mono">{activeCount}/{LAYER_DEFS.length}</span>
    <svg class="chev" class:flip={collapsed} width="10" height="10" viewBox="0 0 10 10">
      <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2" />
    </svg>
  </button>

  {#if !collapsed}
    <div class="lp-body">
      {#each LAYER_GROUPS as g (g.key)}
        <div class="group">
          <div class="group-label eyebrow">{g.label}</div>
          {#each LAYER_DEFS.filter((d) => d.group === g.key) as def (def.id)}
            <div class="row" class:off={!layers[def.id]}>
              <button
                class="swatch"
                aria-pressed={layers[def.id]}
                aria-label={`切换${def.name}`}
                onclick={() => onchange?.(def.id, !layers[def.id])}
              >
                <span class="box" class:on={layers[def.id]}>
                  {#if layers[def.id]}
                    <Icon name="check" size={9} stroke={2.2} />
                  {/if}
                </span>
              </button>
              <button class="row-main" onclick={() => onchange?.(def.id, !layers[def.id])}>
                <span class="ho mono" aria-hidden="true">{LAYER_SHORT[def.id]}</span>
                <span class="nm">{def.name}</span>
                {#if counts[def.id] !== undefined}
                  <span class="ct mono">{counts[def.id]}</span>
                {/if}
                <span class="ds">{def.desc}</span>
              </button>
              <button class="solo" title="仅显示此图层" onclick={() => onSolo?.(def.id)}>
                <Icon name="target" size={11} stroke={1.3} />
              </button>
            </div>
          {/each}
        </div>
      {/each}
      <div class="legend">
        <span class="lg-item"><i style="background:var(--teal)"></i>有效</span>
        <span class="lg-item"><i style="background:var(--amber)"></i>待复核</span>
        <span class="lg-item"><i style="background:var(--red)"></i>作废</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .lp {
    background: rgba(6, 26, 31, 0.9);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.34);
    width: 236px;
    overflow: hidden;
  }
  .compact {
    width: 100%;
  }
  .lp-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 10px;
    color: var(--ink-2);
    font-size: 11.5px;
    border-bottom: 1px solid var(--line-soft);
  }
  .lp-head:hover {
    color: var(--ink);
  }
  .head-left {
    display: flex;
    align-items: center;
    gap: 7px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .head-right {
    margin-left: auto;
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .chev {
    color: var(--muted);
    transition: transform 0.16s;
  }
  .chev.flip {
    transform: rotate(-90deg);
  }
  .lp-body {
    padding: 6px 6px 8px;
  }
  .group + .group {
    margin-top: 7px;
    padding-top: 5px;
    border-top: 1px solid var(--line-soft);
  }
  .group-label {
    padding: 2px 6px 4px;
    font-size: 9px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 4px;
    border-radius: 2px;
    transition: opacity 0.16s, background 0.12s;
  }
  .row:hover {
    background: rgba(111, 211, 216, 0.06);
  }
  .row.off {
    opacity: 0.48;
  }
  .swatch {
    flex: none;
  }
  .box {
    width: 14px;
    height: 14px;
    border: 1px solid var(--line-bright);
    border-radius: 2px;
    display: grid;
    place-items: center;
    color: var(--amber);
    transition: background 0.14s, border-color 0.14s;
  }
  .box.on {
    background: rgba(233, 177, 84, 0.16);
    border-color: rgba(233, 177, 84, 0.6);
  }
  .row-main {
    flex: 1;
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    column-gap: 6px;
    text-align: left;
    color: var(--ink-2);
    min-width: 0;
  }
  .ho {
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    font-size: 9px;
    color: var(--teal);
    background: rgba(111, 211, 216, 0.08);
    border-radius: 2px;
  }
  .nm {
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ct {
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .ds {
    grid-column: 2 / 4;
    font-size: 9.5px;
    color: var(--muted-2);
    margin-top: -1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .solo {
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    color: var(--muted-2);
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.13s, color 0.13s;
  }
  .row:hover .solo {
    opacity: 1;
  }
  .solo:hover {
    color: var(--amber);
  }
  .legend {
    display: flex;
    gap: 10px;
    padding: 8px 6px 2px;
    margin-top: 6px;
    border-top: 1px solid var(--line-soft);
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .lg-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .lg-item i {
    width: 12px;
    height: 2px;
    display: block;
    border-radius: 1px;
  }
</style>
