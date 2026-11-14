<script lang="ts">
  import { store } from '../lib/store.svelte';
  import {
    DIFFICULTY_LABEL,
    DISTANCE_LABEL,
    ELEMENT_LABEL,
  } from '../lib/constants';
  import { computeSafetyDistances } from '../lib/timing';
  import { exportCourseSvg, exportStrideTableCsv } from '../lib/export';
  import CourseCanvas from './CourseCanvas.svelte';
  import type { DistanceClass, Difficulty, GenParams, Vec2 } from '../lib/types';

  const ev = $derived(store.getEvent(store.session.currentEventId));
  const list = $derived(ev ? store.versionsOf(ev.id) : []);
  const ver = $derived(store.currentVersion());
  const isDesigner = $derived(store.session.role === 'designer');
  const editable = $derived(!!ver && isDesigner && (ver.status === 'draft' || ver.status === 'returned'));

  let params = $state<GenParams>({
    seed: 'ride-2026',
    field: { length: 70, width: 50 },
    obstacleCount: 10,
    distanceClass: 'medium',
    difficulty: 2,
  });
  let label = $state('');
  let selectedId = $state<string | null>(null);
  let showConflicts = $state(true);
  let showStrides = $state(true);
  let reviewReason = $state('');
  let approveMode = $state(true);

  // 切换赛事时同步场地尺寸
  $effect(() => {
    if (ev) params.field = { ...ev.field };
  });

  const safetyRows = $derived(ver ? computeSafetyDistances(ver.course.obstacles, ver.course.arcs) : []);
  const selectedObstacle = $derived(ver?.course.obstacles.find((o) => o.id === selectedId));

  function generate() {
    if (!ev) return;
    store.generateVersion(ev.id, { ...params, field: { ...params.field } }, label);
    label = '';
  }

  function regenerate() {
    if (!ver) return;
    store.regenerate(ver.id, { ...params, field: { ...params.field } });
  }

  function onMove(id: string, pos: Vec2) {
    if (!ver) return;
    store.moveObstacle(ver.id, id, pos);
  }

  function submit() {
    if (!ver) return;
    if (ver.course.conflicts.length > 0) {
      if (!confirm('当前路线仍存在冲突,确认提交裁判审查?')) return;
    }
    store.submitVersion(ver.id);
  }

  function review(approve: boolean) {
    if (!ver) return;
    if (!approve && !reviewReason.trim()) {
      alert('退回时必须写明原因');
      return;
    }
    store.reviewVersion(ver.id, approve, reviewReason.trim());
    reviewReason = '';
  }

  function fork() {
    if (ver) store.forkVersion(ver.id);
  }

  function doExportSvg() {
    if (ev && ver) exportCourseSvg(ev, ver);
  }
  function doExportCsv() {
    if (ev && ver) exportStrideTableCsv(ev, ver);
  }

  const statusLabel: Record<string, string> = {
    draft: '草稿', submitted: '待审查', approved: '已通过', returned: '已退回',
  };
</script>

{#if !ev}
  <div class="panel empty">
    <p class="muted">尚未选择赛事。请先到「档案室」建档或点击一条赛事档案。</p>
  </div>
{:else}
  <div class="studio">
    <!-- 左栏:参数 + 版本 -->
    <aside class="panel scroll sidebar">
      <h2>{ev.code} · {ev.level}</h2>
      <p class="small muted">{ev.date} · 裁判 {ev.judges} · 设计师 {ev.designer} · 场地 {ev.field.length}×{ev.field.width}m</p>

      <h3>生成参数</h3>
      <div class="field"><label>随机种子(同种子+同参数结果完全一致)</label>
        <input bind:value={params.seed} disabled={!editable} />
      </div>
      <div class="row">
        <div class="field"><label>障碍道数</label>
          <input type="number" min="4" max="18" bind:value={params.obstacleCount} disabled={!editable} />
        </div>
        <div class="field"><label>难度等级</label>
          <select bind:value={params.difficulty} disabled={!editable}>
            {#each [1, 2, 3, 4] as d (d)}
              <option value={d}>{d} · {DIFFICULTY_LABEL[d as Difficulty]}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="field"><label>关联距离档位</label>
        <select bind:value={params.distanceClass} disabled={!editable}>
          {#each (['short', 'medium', 'long'] as DistanceClass[]) as dc (dc)}
            <option value={dc}>{DISTANCE_LABEL[dc]}</option>
          {/each}
        </select>
      </div>
      <div class="field"><label>版本备注</label><input bind:value={label} placeholder="如:首轮资格赛" /></div>

      {#if isDesigner}
        <div class="row">
          <button class="primary" onclick={generate}>{list.length ? '生成新版本' : '生成路线'}</button>
          <button onclick={regenerate} disabled={!ver || !editable}>按新参数重生成</button>
        </div>
        <p class="small muted" style="margin-top:6px">重生成时,手动挪动过(✋)的障碍保留原位,并在旁标注冲突。</p>
      {/if}

      <h3>版本列表({list.length})</h3>
      <div class="scroll versions">
        {#each list as v (v.id)}
          <div class="ver-item" class:active={ver?.id === v.id} onclick={() => store.selectVersion(v.id)}>
            <div><b>v{v.versionNo}</b> <span class={`tag ${v.status}`}>{statusLabel[v.status]}</span></div>
            <div class="small muted">{v.label}</div>
            {#if v.status === 'returned'}
              <div class="small reason">退回:{v.reviewReason}</div>
            {/if}
          </div>
        {/each}
        {#if list.length === 0}<p class="small muted">暂无版本</p>{/if}
      </div>

      {#if ver && isDesigner}
        <div class="row" style="margin-top:10px">
          <button onclick={fork} disabled={!editable}>复制为新版本</button>
          <button class="success" onclick={submit} disabled={!editable || ver.status === 'submitted'}>
            {ver.status === 'submitted' ? '已提交待审' : '提交审查'}
          </button>
        </div>
      {/if}
    </aside>

    <!-- 中栏:画布 -->
    <section class="center">
      {#if ver}
        <CourseCanvas
          bind:course={ver.course}
          {showConflicts}
          {showStrides}
          {editable}
          bind:selectedId
          {onMove}
        />
        <div class="canvas-actions panel">
          <label class="check"><input type="checkbox" bind:checked={showConflicts} /> 冲突标注</label>
          <label class="check"><input type="checkbox" bind:checked={showStrides} /> 步距标注</label>
          <span class="small muted">俯视:拖拽障碍挪动(自动标记手动)· 滚轮缩放 · 空白处平移</span>
          {#if selectedObstacle}
            <span class="small">选中 {selectedObstacle.number}:
              {ELEMENT_LABEL[selectedObstacle.elements[0].kind]} · 高 {selectedObstacle.elements[0].height}m
              {selectedObstacle.manual ? ' · 手动位置' : ''}
            </span>
          {/if}
        </div>
      {:else}
        <div class="panel empty"><p class="muted">设置左侧参数后点击「生成路线」。</p></div>
      {/if}
    </section>

    <!-- 右栏:分析 + 工作流 + 导出 -->
    <aside class="panel scroll sidebar">
      {#if ver}
        <h2>路线分析</h2>
        <div class="stat-grid">
          <div><b>{ver.course.totalLength}</b><span>总长 m</span></div>
          <div><b>{ver.course.speed}</b><span>速度 m/min</span></div>
          <div><b>{ver.course.allowedTime}s</b><span>预计允许时间</span></div>
          <div><b class={ver.course.conflicts.length ? 'danger-text' : ''}>{ver.course.conflicts.length}</b><span>冲突数</span></div>
        </div>

        <h3>冲突清单</h3>
        {#each ver.course.conflicts as cf (cf.id)}
          <div class="conflict-item">
            <b>{cf.type === 'stride' ? '步距不足' : cf.type === 'crossing' ? '线路交叉' : '落地区越界'}</b>
            <div>{cf.message}</div>
          </div>
        {/each}
        {#if ver.course.conflicts.length === 0}<p class="small muted">无冲突 ✓</p>{/if}

        <h3>步距与安全距离</h3>
        <div class="scroll" style="max-height:220px">
          <table>
            <thead><tr><th>段</th><th>距离m</th><th>步数</th><th>净距m</th><th>判定</th></tr></thead>
            <tbody>
              {#each ver.course.strides as m, i (m.fromObstacle + m.toObstacle)}
                {@const s = safetyRows[i]}
                <tr>
                  <td>{ver.course.obstacles.find((o) => o.id === m.fromObstacle)?.number}
                    → {ver.course.obstacles.find((o) => o.id === m.toObstacle)?.number}</td>
                  <td>{m.distance}</td>
                  <td>{m.related ? m.strides : '—'}</td>
                  <td class={s?.safe ? '' : 'danger-text'}>{s?.clearance ?? '—'}</td>
                  <td>{s?.safe ? '✓' : '✗'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <h3>审查工作流</h3>
        <p class="small">当前状态:<span class={`tag ${ver.status}`}>{statusLabel[ver.status]}</span></p>
        {#if !isDesigner && ver.status === 'submitted'}
          <div class="field">
            <label>审查意见(退回必填原因)</label>
            <textarea bind:value={reviewReason} placeholder="如:4A→4B 步距不足,落地区靠近边界"></textarea>
          </div>
          <div class="row">
            <button class="success" onclick={() => review(true)}>审查通过</button>
            <button class="danger" onclick={() => review(false)}>退回修改</button>
          </div>
        {/if}
        {#if ver.status === 'approved'}
          <p class="small" style="color:var(--ok)">裁判已通过 · 可导出交付物</p>
        {/if}
        {#if ver.status === 'returned'}
          <p class="small reason">退回原因:{ver.reviewReason}</p>
        {/if}

        <h3>导出(通过后可用)</h3>
        <div class="row">
          <button onclick={doExportSvg} disabled={ver.status !== 'approved'}>路线图 SVG</button>
          <button onclick={doExportCsv} disabled={ver.status !== 'approved'}>步距表 CSV</button>
        </div>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .studio { display: grid; grid-template-columns: 290px 1fr 320px; gap: 14px; height: 100%; min-height: 0; }
  .sidebar { min-height: 0; }
  .center { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .empty { display: flex; align-items: center; justify-content: center; height: 100%; }
  .versions { max-height: 200px; display: flex; flex-direction: column; gap: 6px; }
  .ver-item { padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; cursor: pointer; }
  .ver-item.active { border-color: var(--accent); background: rgba(59,157,245,0.12); }
  .reason { color: var(--danger); margin-top: 3px; }
  .canvas-actions { display: flex; align-items: center; gap: 16px; padding: 8px 12px; flex-wrap: wrap; }
  .check { display: flex; align-items: center; gap: 5px; margin: 0; color: var(--text); font-size: 13px; }
  .check input { width: auto; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .stat-grid > div { background: var(--panel-2); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; }
  .stat-grid b { font-size: 18px; }
  .stat-grid span { font-size: 11px; color: var(--muted); }
  .danger-text { color: var(--danger); }
</style>
