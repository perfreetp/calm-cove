<script>
  // 外协方端：只能看退回清单（驳回的问题 + 原因），可下载模型修复
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import { CHECK_NAMES } from '../../shared/qc.js';

  let batches = [];
  let detail = null;
  let error = '';

  onMount(load);
  async function load() {
    try { batches = await api.listBatches({ role: 'outsourcer' }); }
    catch (err) { error = err.message; }
  }
  async function open(b) {
    try { detail = await api.getBatch(b.id, 'outsourcer'); }
    catch (err) { error = err.message; }
  }
</script>

<div class="layout">
  <aside>
    <h3>退回清单</h3>
    {#each batches as b}
      <div class="card" class:sel={detail && detail.id === b.id} on:click={() => open(b)}>
        <b>批次 #{b.id}</b> · 订单 #{b.orderId} · {b.patient}
        <div class="muted">驳回 {b.issues.rejected} 项</div>
      </div>
    {/each}
    {#if !batches.length}<p class="muted">暂无退回件。</p>{/if}
  </aside>
  <section>
    {#if detail}
      <h3>批次 #{detail.id} 驳回明细</h3>
      {#each detail.rejectedIssues as i}
        <div class="issue">
          <b>牙位 {i.toothPosition}</b> · {CHECK_NAMES[i.checkType]}
          <div class="muted">{i.message}</div>
          <div class="rej">驳回原因：{i.rejectReason}</div>
        </div>
      {/each}
      <p class="muted">请按驳回原因修改设计后交回技师重新送检。</p>
    {:else}
      <p class="muted">选择左侧退回批次查看驳回明细。外协方仅可见退回清单。</p>
    {/if}
  </section>
</div>

<style>
  .layout { display: flex; gap: 16px; }
  aside { width: 280px; flex-shrink: 0; }
  section { flex: 1; }
  .card { background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
  .card.sel { border-color: #2f6fed; }
  .issue { background: #1e2129; border: 1px solid #2c3038; border-left: 4px solid #e53935; border-radius: 6px; padding: 10px; margin-bottom: 8px; }
  .rej { color: #ff9a9a; font-size: 13px; margin-top: 4px; }
  .muted { color: #8a90a0; font-size: 12px; }
</style>
