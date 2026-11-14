<script>
  // 医生端：只能看自己单子的进度和放行结果
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';

  export let doctor = '张医生';

  let orders = [];
  let batches = [];
  let reports = {};        // batchId -> report
  let error = '';
  let showNew = false;
  let newPatient = '';
  let newTeeth = [{ position: '11', restorationType: 'crown', material: '氧化锆' }];

  async function createOrder() {
    if (!newPatient.trim()) { error = '请填写患者姓名'; return; }
    try {
      await api.createOrder({ doctor, patient: newPatient.trim(), teeth: newTeeth });
      showNew = false; newPatient = '';
      newTeeth = [{ position: '11', restorationType: 'crown', material: '氧化锆' }];
      await load();
    } catch (err) { error = err.message; }
  }

  const STATUS_NAMES = { modeling: '建模中', reviewing: '质检复核中', released: '已放行', returned: '已退回修改' };
  const TYPE_NAMES = { crown: '牙冠', bridge: '桥体', inlay: '嵌体', veneer: '贴面' };

  $: if (doctor) load();
  async function load() {
    try {
      [orders, batches] = await Promise.all([
        api.listOrders(doctor),
        api.listBatches({ role: 'doctor', doctor })
      ]);
      reports = {};
      for (const b of batches.filter(x => x.status === 'released')) {
        try { reports[b.id] = await api.getReport(b.id); } catch {}
      }
    } catch (err) { error = err.message; }
  }
  function batchesFor(orderId) { return batches.filter(b => b.orderId === orderId); }
</script>

<div>
  <div class="top">
    <h3>{doctor} 的口扫单</h3>
    <button on:click={() => showNew = !showNew}>{showNew ? '收起' : '开口扫单'}</button>
  </div>
  {#if showNew}
    <div class="card">
      <input bind:value={newPatient} placeholder="患者姓名" />
      {#each newTeeth as t, i}
        <div class="trow">
          <input bind:value={t.position} placeholder="牙位(FDI)" style="width:80px" />
          <select bind:value={t.restorationType}>
            <option value="crown">牙冠</option><option value="bridge">桥体</option>
            <option value="inlay">嵌体</option><option value="veneer">贴面</option>
          </select>
          <input bind:value={t.material} placeholder="材料" style="width:120px" />
          <button on:click={() => newTeeth = newTeeth.filter((_, j) => j !== i)}>删</button>
        </div>
      {/each}
      <button on:click={() => newTeeth = [...newTeeth, { position: '', restorationType: 'crown', material: '' }]}>+ 牙位</button>
      <button class="primary" on:click={createOrder}>提交</button>
    </div>
  {/if}
  {#if error}<div class="err">{error}</div>{/if}
  {#each orders as o}
    <div class="card">
      <div class="head">
        <b>订单 #{o.id} · {o.patient}</b>
        <span class="st st-{o.status}">{STATUS_NAMES[o.status] || o.status}</span>
      </div>
      <div class="teeth">
        {#each o.teeth as t}
          <span class="chip">{t.position} · {TYPE_NAMES[t.restorationType] || t.restorationType} · {t.material} {t.hasModel ? '✓已建模' : ''}</span>
        {/each}
      </div>
      {#each batchesFor(o.id) as b}
        <div class="batch">
          批次 #{b.id}：
          {#if b.status === 'released'}
            <span class="st st-released">已放行</span>
            {#if reports[b.id]}
              <table>
                <tr><th>牙位</th><th>体素数</th><th>问题数</th></tr>
                {#each reports[b.id].teeth as t}
                  <tr><td>{t.position}</td><td>{t.voxelCount}</td><td>{t.issueCount}</td></tr>
                {/each}
              </table>
            {/if}
          {:else if b.status === 'returned'}
            <span class="st st-returned">质检驳回，已退回外协设计</span>
          {:else}
            <span class="st">质检复核中（致命 {b.issues.fatal} / 警告 {b.issues.warning} / 提示 {b.issues.info}）</span>
          {/if}
        </div>
      {/each}
    </div>
  {/each}
  {#if !orders.length}<p class="muted">暂无订单。</p>{/if}
</div>

<style>
  .top { display: flex; justify-content: space-between; align-items: center; }
  .trow { display: flex; gap: 6px; margin: 6px 0; }
  input, select { background: #262a34; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 6px 8px; }
  button { background: #2e3340; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 6px 14px; cursor: pointer; }
  button.primary { background: #1f9d55; border-color: #1f9d55; color: #fff; }
  .card { background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 12px; margin-bottom: 12px; }
  .head { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .teeth { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .chip { background: #262a34; border-radius: 4px; padding: 3px 10px; font-size: 12px; color: #b8bdc9; }
  .batch { border-top: 1px solid #2c3038; padding-top: 8px; margin-top: 8px; font-size: 13px; }
  .st-released { color: #7ee2a8; } .st-returned { color: #ff8a80; }
  .muted { color: #8a90a0; }
  .err { color: #ff9a9a; }
  table { border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #3a4050; padding: 4px 14px; font-size: 13px; }
</style>
