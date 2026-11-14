<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { exportQuarterlyReportCsv } from '../lib/export';

  let year = $state(new Date().getFullYear());
  const rows = $derived(store.quarterlyReport(year));
  const reasons = $derived(store.returnReasonStats(year));
  const maxReason = $derived(Math.max(1, ...reasons.map((r) => r.count)));
  const totals = $derived(rows.reduce(
    (acc, r) => ({ events: acc.events + r.events, versions: acc.versions + r.versions, approved: acc.approved + r.approved, returned: acc.returned + r.returned }),
    { events: 0, versions: 0, approved: 0, returned: 0 },
  ));

  function doExport() {
    exportQuarterlyReportCsv(year, rows, reasons);
  }
</script>

<div class="reports">
  <section class="panel">
    <h2>季度赛事报告</h2>
    <div class="toolbar">
      <div class="field year"><label>年度</label><input type="number" bind:value={year} min="2000" max="2100" /></div>
      <button class="primary" onclick={doExport}>导出季度报告 CSV</button>
      <span class="muted small">含季度统计与退回原因分布</span>
    </div>

    <table style="margin-top:10px">
      <thead>
        <tr><th>季度</th><th>赛事数</th><th>路线版本数</th><th>通过数</th><th>退回数</th><th>通过率</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.quarter)}
          <tr>
            <td><b>{r.quarter}</b></td>
            <td>{r.events}</td>
            <td>{r.versions}</td>
            <td style="color:var(--ok)">{r.approved}</td>
            <td style="color:var(--danger)">{r.returned}</td>
            <td>{r.versions ? Math.round((r.approved / r.versions) * 100) : 0}%</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td><b>全年合计</b></td>
          <td><b>{totals.events}</b></td>
          <td><b>{totals.versions}</b></td>
          <td><b>{totals.approved}</b></td>
          <td><b>{totals.returned}</b></td>
          <td><b>{totals.versions ? Math.round((totals.approved / totals.versions) * 100) : 0}%</b></td>
        </tr>
      </tfoot>
    </table>
  </section>

  <section class="panel" style="margin-top:14px">
    <h2>退回原因分布({year})</h2>
    <div class="bars">
      {#each reasons as r (r.category)}
        <div class="bar-row">
          <div class="cat">{r.category}</div>
          <div class="track">
            <div class="fill" style={`width:${(r.count / maxReason) * 100}%`}></div>
          </div>
          <div class="count">{r.count}</div>
        </div>
      {/each}
    </div>
    {#if totals.returned === 0}
      <p class="small muted" style="margin-top:10px">该年度暂无退回记录。</p>
    {/if}
    <p class="small muted" style="margin-top:12px">
      说明:退回原因按裁判填写意见中的关键词归类(步距 / 交叉 / 越界 / 其他),数据来自所有「已退回」版本。
    </p>
  </section>
</div>

<style>
  .toolbar { display: flex; align-items: flex-end; gap: 14px; }
  .year { width: 130px; margin-bottom: 0; }
  .bars { margin-top: 10px; display: flex; flex-direction: column; gap: 10px; }
  .bar-row { display: flex; align-items: center; gap: 12px; }
  .cat { width: 110px; font-size: 13px; }
  .track { flex: 1; height: 22px; background: var(--panel-2); border-radius: 6px; overflow: hidden; }
  .fill { height: 100%; background: linear-gradient(90deg, var(--danger), #ff8f7a); border-radius: 6px; min-width: 2px; }
  .count { width: 40px; text-align: right; font-weight: 700; }
  tfoot td { border-top: 2px solid var(--border); }
</style>
