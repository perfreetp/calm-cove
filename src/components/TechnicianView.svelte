<script>
  // 技师端：接口扫单 -> 按牙位建模 -> 保存 -> 提交质检
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import VoxelEditor from './VoxelEditor.svelte';
  import { LAYER_NAMES } from '../../shared/voxel.js';

  let orders = [];
  let order = null;          // 当前订单（含模型数据）
  let tooth = null;          // 当前牙位
  let clipboard = null;      // 跨牙位剪贴板
  let error = '';
  let info = '';
  let editorKey = 0;         // 切换牙位时重建编辑器

  const STATUS_NAMES = { modeling: '建模中', reviewing: '质检复核中', released: '已放行', returned: '已退回' };
  const TYPE_NAMES = { crown: '牙冠', bridge: '桥体', inlay: '嵌体', veneer: '贴面' };

  onMount(load);
  async function load() {
    orders = await api.listOrders();
  }
  async function openOrder(o) {
    order = await api.getOrder(o.id);
    tooth = null;
    info = ''; error = '';
  }
  function openTooth(t) {
    tooth = t;
    editorKey++;
    info = ''; error = '';
  }
  async function onSave(e) {
    try {
      await api.saveModel(order.id, tooth.position, e.detail);
      order = await api.getOrder(order.id);
      await load();
      info = `牙位 ${tooth.position} 模型已保存（体素 ${e.detail.voxelCount}，面数 ${e.detail.faceCount}）`;
    } catch (err) { error = err.message; }
  }
  async function submitQc() {
    try {
      const batch = await api.submitQc(order.id);
      info = `已提交质检，批次 #${batch.id}，发现 ${batch.issues.length} 个问题（致命 ${batch.issues.filter(i => i.severity === 'fatal').length}）`;
      await load();
      order = await api.getOrder(order.id);
    } catch (err) { error = err.message; }
  }
  async function resubmit() {
    // 退回件修复后重新提交：找到该订单最近退回的批次
    try {
      const batches = await api.listBatches();
      const b = batches.filter(x => x.orderId === order.id && x.status === 'returned').pop();
      if (!b) return submitQc();
      await api.resubmitBatch(b.id);
      info = `批次 #${b.id} 已重新送检`;
      await load();
      order = await api.getOrder(order.id);
    } catch (err) { error = err.message; }
  }
</script>

<div class="layout">
  <aside>
    <h3>口扫单</h3>
    {#each orders as o}
      <div class="card" class:sel={order && order.id === o.id} on:click={() => openOrder(o)}>
        <div><b>#{o.id}</b> {o.patient} <span class="muted">({o.doctor})</span></div>
        <div class="muted">{o.teeth.length} 个牙位 · {STATUS_NAMES[o.status] || o.status}</div>
      </div>
    {/each}
  </aside>

  <section>
    {#if order}
      <div class="head">
        <h3>订单 #{order.id} · {order.patient}</h3>
        <div>
          <button class="primary" on:click={submitQc}>提交质检</button>
          {#if order.status === 'returned'}<button on:click={resubmit}>修复后重新送检</button>{/if}
        </div>
      </div>
      {#if info}<div class="banner ok">{info}</div>{/if}
      {#if error}<div class="banner err">{error}</div>{/if}
      <div class="teeth">
        {#each order.teeth as t}
          <button class="tooth" class:sel={tooth && tooth.position === t.position} on:click={() => openTooth(t)}>
            <b>{t.position}</b>
            <span>{TYPE_NAMES[t.restorationType] || t.restorationType} · {t.material}</span>
            <span class="muted">{t.model ? '已建模' : '未建模'}</span>
          </button>
        {/each}
      </div>
      {#if tooth}
        <div class="editor-box">
          {#key editorKey}
            <VoxelEditor
              restorationType={tooth.restorationType}
              initialVoxelData={tooth.model ? tooth.model.voxelData : null}
              bind:clipboard
              on:save={onSave}
              on:clipboard={(e) => clipboard = e.detail}
            />
          {/key}
        </div>
      {:else}
        <p class="muted">选择上方牙位开始建模。框选复制后可切换到其他牙位粘贴。</p>
      {/if}
    {:else}
      <p class="muted">从左侧选择口扫单。</p>
    {/if}
  </section>
</div>

<style>
  .layout { display: flex; gap: 16px; height: 100%; }
  aside { width: 240px; flex-shrink: 0; overflow: auto; }
  section { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  h3 { margin: 6px 0; }
  .card { background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
  .card.sel { border-color: #2f6fed; }
  .muted { color: #8a90a0; font-size: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; }
  .teeth { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  .tooth { display: flex; flex-direction: column; align-items: flex-start; background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 8px 12px; color: #dfe3ec; cursor: pointer; min-width: 110px; }
  .tooth.sel { border-color: #2f6fed; background: #232a3d; }
  .editor-box { flex: 1; min-height: 480px; display: flex; flex-direction: column; }
  .banner { padding: 8px 12px; border-radius: 5px; margin: 6px 0; font-size: 13px; }
  .banner.ok { background: #1c3a2a; color: #7ee2a8; }
  .banner.err { background: #3a1c1c; color: #ff9a9a; }
  button { background: #2e3340; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 6px 14px; cursor: pointer; }
  button.primary { background: #1f9d55; border-color: #1f9d55; color: #fff; }
</style>
