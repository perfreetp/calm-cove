<script>
  // 复核员端：批次列表 -> 逐条问题定位到体素 -> 确认/驳回(填原因) -> 放行生成报告
  import { onMount } from 'svelte';
  import { api } from '../lib/api.js';
  import VoxelEditor from './VoxelEditor.svelte';
  import { SEVERITY_NAMES, CHECK_NAMES } from '../../shared/qc.js';

  let batches = [];
  let batch = null;          // 当前批次详情（含 models）
  let currentIssue = null;
  let focusVoxel = null;
  let rejectReason = '';
  let rejectTarget = null;
  let report = null;
  let error = '', info = '';

  const STATUS_NAMES = { has_fatal: '有致命问题', reviewing: '复核中', reviewed: '复核完成', released: '已放行', returned: '已退回外协' };
  const SEV_CLASS = { fatal: 'sev-fatal', warning: 'sev-warn', info: 'sev-info' };

  onMount(load);
  async function load() { batches = await api.listBatches(); }
  async function openBatch(b) {
    batch = await api.getBatch(b.id);
    currentIssue = null; focusVoxel = null; report = batch.report; rejectTarget = null;
    error = ''; info = '';
  }
  function locate(issue) {
    currentIssue = issue;
    focusVoxel = null;
    // 触发响应式：先置空再设置
    setTimeout(() => { focusVoxel = issue.location || { x: 16, y: 16, z: 16 }; }, 0);
  }
  function modelFor(issue) {
    return batch?.models?.find(m => m.position === issue.toothPosition) || null;
  }
  async function confirm(issue) {
    try {
      batch = await api.reviewIssue(batch.id, issue.id, 'confirm');
      info = `问题 #${issue.id} 已确认`;
      await load();
    } catch (err) { error = err.message; }
  }
  async function doReject() {
    if (!rejectReason.trim()) { error = '驳回必须填写原因'; return; }
    try {
      batch = await api.reviewIssue(batch.id, rejectTarget.id, 'reject', rejectReason);
      info = `问题 #${rejectTarget.id} 已驳回，批次退回外协设计`;
      rejectTarget = null; rejectReason = '';
      await load();
    } catch (err) { error = err.message; }
  }
  async function release() {
    try {
      report = await api.releaseBatch(batch.id);
      batch = await api.getBatch(batch.id);
      info = `批次 #${batch.id} 已放行，报告已生成`;
      await load();
    } catch (err) { error = err.message; }
  }
  $: openFatal = batch ? batch.issues.filter(i => i.severity === 'fatal' && i.status === 'open').length : 0;
  $: openAll = batch ? batch.issues.filter(i => i.status === 'open').length : 0;
</script>

<div class="layout">
  <aside>
    <h3>质检批次</h3>
    {#each batches as b}
      <div class="card" class:sel={batch && batch.id === b.id} on:click={() => openBatch(b)}>
        <div><b>批次 #{b.id}</b> · 订单 #{b.orderId} {b.patient}</div>
        <div class="muted">
          {STATUS_NAMES[b.status] || b.status} ·
          <span class="sev-fatal">致命 {b.issues.fatal}</span>
          <span class="sev-warn">警告 {b.issues.warning}</span>
          <span class="sev-info">提示 {b.issues.info}</span>
        </div>
      </div>
    {/each}
    {#if !batches.length}<p class="muted">暂无批次，技师提交质检后出现在这里。</p>{/if}
  </aside>

  <section>
    {#if batch}
      <div class="head">
        <h3>批次 #{batch.id} · {STATUS_NAMES[batch.status]}</h3>
        <div>
          {#if openFatal > 0}<span class="sev-fatal">致命未处理 {openFatal} 项，不能放行</span>{/if}
          <button class="primary" disabled={openAll > 0 || batch.status === 'released' || batch.status === 'returned'} on:click={release}>放行并生成报告</button>
        </div>
      </div>
      {#if info}<div class="banner ok">{info}</div>{/if}
      {#if error}<div class="banner err">{error}</div>{/if}

      <div class="cols">
        <div class="issues">
          <h4>问题清单（{batch.issues.length}）</h4>
          {#each batch.issues as issue}
            <div class="issue {SEV_CLASS[issue.severity]}" class:sel={currentIssue && currentIssue.id === issue.id} on:click={() => locate(issue)}>
              <div class="ihead">
                <span class="tag">{SEVERITY_NAMES[issue.severity]}</span>
                <b>牙位 {issue.toothPosition}</b> · {CHECK_NAMES[issue.checkType]}
                <span class="st st-{issue.status}">{ { open: '待复核', confirmed: '已确认', rejected: '已驳回' }[issue.status] }</span>
              </div>
              <div class="muted">{issue.message}</div>
              {#if issue.location}<div class="muted">体素位置 ({issue.location.x}, {issue.location.y}, {issue.location.z})</div>{/if}
              {#if issue.rejectReason}<div class="rej">驳回原因：{issue.rejectReason}</div>{/if}
              {#if issue.status === 'open' && batch.status !== 'released'}
                <div class="ops" on:click|stopPropagation>
                  <button class="ok-btn" on:click={() => confirm(issue)}>确认</button>
                  <button class="rej-btn" on:click={() => { rejectTarget = issue; rejectReason = ''; }}>驳回</button>
                </div>
              {/if}
            </div>
          {/each}
          {#if !batch.issues.length}<p class="muted">本批未发现问题。</p>{/if}
        </div>

        <div class="viewer">
          {#if currentIssue && modelFor(currentIssue)}
            <h4>定位：牙位 {currentIssue.toothPosition}</h4>
            {#key currentIssue.id}
              <VoxelEditor readOnly initialVoxelData={modelFor(currentIssue).voxelData} {focusVoxel} />
            {/key}
          {:else}
            <p class="muted">点击左侧问题，定位到具体体素位置。</p>
          {/if}
        </div>
      </div>

      {#if report}
        <div class="report">
          <h4>放行报告 · 批次 #{report.batchId}</h4>
          <div class="muted">生成时间 {new Date(report.generatedAt).toLocaleString()} · 医生 {report.doctor} · 患者 {report.patient}</div>
          <table>
            <tr><th>牙位</th><th>体素数</th><th>面数</th><th>问题数</th><th>致命数</th></tr>
            {#each report.teeth as t}
              <tr><td>{t.position}</td><td>{t.voxelCount}</td><td>{t.faceCount}</td><td>{t.issueCount}</td><td>{t.fatalCount}</td></tr>
            {/each}
          </table>
          <div class="muted">共 {report.totalIssues} 个问题：确认 {report.confirmed}，驳回 {report.rejected}</div>
        </div>
      {/if}
    {:else}
      <p class="muted">从左侧选择质检批次。</p>
    {/if}
  </section>
</div>

{#if rejectTarget}
  <div class="modal-bg" on:click={() => rejectTarget = null}>
    <div class="modal" on:click|stopPropagation>
      <h4>驳回问题 #{rejectTarget.id}（退回外协设计）</h4>
      <p class="muted">{rejectTarget.message}</p>
      <textarea bind:value={rejectReason} placeholder="必填：驳回原因" rows="3"></textarea>
      <div class="ops">
        <button class="rej-btn" on:click={doReject}>确认驳回</button>
        <button on:click={() => rejectTarget = null}>取消</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .layout { display: flex; gap: 16px; height: 100%; }
  aside { width: 280px; flex-shrink: 0; overflow: auto; }
  section { flex: 1; min-width: 0; }
  .card { background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: pointer; }
  .card.sel { border-color: #2f6fed; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  .cols { display: flex; gap: 14px; margin-top: 8px; }
  .issues { width: 380px; flex-shrink: 0; max-height: 70vh; overflow: auto; }
  .viewer { flex: 1; min-height: 420px; display: flex; flex-direction: column; }
  .issue { background: #1e2129; border: 1px solid #2c3038; border-left-width: 4px; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
  .issue.sel { outline: 1px solid #2f6fed; }
  .issue.sev-fatal { border-left-color: #e53935; }
  .issue.sev-warn { border-left-color: #fb8c00; }
  .issue.sev-info { border-left-color: #42a5f5; }
  .ihead { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .tag { font-size: 11px; padding: 1px 6px; border-radius: 3px; background: #333; }
  .sev-fatal { color: #ff8a80; } .sev-warn { color: #ffb74d; } .sev-info { color: #90caf9; }
  .st { margin-left: auto; font-size: 12px; }
  .st-open { color: #ffd54f; } .st-confirmed { color: #7ee2a8; } .st-rejected { color: #ff8a80; }
  .rej { color: #ff9a9a; font-size: 12px; margin-top: 4px; }
  .ops { display: flex; gap: 8px; margin-top: 6px; }
  .muted { color: #8a90a0; font-size: 12px; }
  button { background: #2e3340; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 5px 12px; cursor: pointer; }
  button.primary { background: #1f9d55; border-color: #1f9d55; color: #fff; }
  button:disabled { opacity: 0.4; cursor: default; }
  .ok-btn { background: #1f9d55; border-color: #1f9d55; color: #fff; }
  .rej-btn { background: #b33939; border-color: #b33939; color: #fff; }
  .banner { padding: 8px 12px; border-radius: 5px; margin: 6px 0; font-size: 13px; }
  .banner.ok { background: #1c3a2a; color: #7ee2a8; }
  .banner.err { background: #3a1c1c; color: #ff9a9a; }
  .report { margin-top: 14px; background: #1e2129; border: 1px solid #2c3038; border-radius: 6px; padding: 12px; }
  table { border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #3a4050; padding: 5px 14px; font-size: 13px; }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; }
  .modal { background: #23262e; border-radius: 8px; padding: 18px; width: 420px; }
  textarea { width: 100%; background: #1a1d24; color: #dfe3ec; border: 1px solid #3a4050; border-radius: 4px; padding: 8px; box-sizing: border-box; }
</style>
