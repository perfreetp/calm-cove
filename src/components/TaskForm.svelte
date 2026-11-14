<script>
  import { FABRICS, createTask } from '../lib/store.js';
  import { round } from '../lib/geometry.js';

  let { db = $bindable(), onDone = () => {}, onCancel = () => {} } = $props();

  const now = new Date();
  const local = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  let title = $state('');
  let limb = $state('右前臂');
  let axisLabel = $state('距腕横纹距离');
  let brief = $state('');
  let fabricId = $state('mid-jersey');
  let tierMin = $state(24);
  let tierMax = $state(32);
  let tierLabel = $state('中压档');
  let threshold = $state(0.0016);
  let deadline = $state(local(new Date(now.getTime() + 7 * 86400000)));
  let measurements = $state([
    { pos: 60, circ: 162, label: '腕横纹上 1 cm' },
    { pos: 130, circ: 210, label: '前臂中段' },
    { pos: 200, circ: 248, label: '前臂最大围' },
    { pos: 280, circ: 238, label: '肘下 2 cm' },
  ]);
  let scars = $state([{ start: 120, end: 200, severity: '深 II 度', note: '充血期瘢痕' }]);
  let error = $state('');

  function addRow() {
    const last = measurements[measurements.length - 1];
    measurements = [...measurements, { pos: (last?.pos ?? 0) + 60, circ: last?.circ ?? 200, label: '' }];
  }
  function removeRow(i) {
    if (measurements.length <= 3) return;
    measurements = measurements.filter((_, k) => k !== i);
  }
  function addScar() {
    scars = [...scars, { start: 100, end: 160, severity: '深 II 度', note: '' }];
  }
  function removeScar(i) {
    scars = scars.filter((_, k) => k !== i);
  }

  function save() {
    error = '';
    if (!title.trim()) { error = '请填写任务名称'; return; }
    if (measurements.length < 3) { error = '至少需要 3 个测量点'; return; }
    const sorted = [...measurements].sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].pos - sorted[i - 1].pos < 5) { error = '测量点位置需间隔 ≥ 5 mm'; return; }
      if (sorted[i].circ <= 0) { error = '围度必须为正数'; return; }
    }
    if (tierMin >= tierMax) { error = '压力档位下限须小于上限'; return; }
    if (!deadline) { error = '请设置截止时间'; return; }

    const fabric = FABRICS.find((f) => f.id === fabricId) ?? FABRICS[0];
    const span = [sorted[0].pos, sorted.at(-1).pos];
    const reference = sorted.map((m) => ({ x: m.pos, y: round(m.circ / (2 * Math.PI), 2) }));
    const task = createTask(db, {
      title: title.trim(),
      limb: limb.trim() || '患肢',
      axisLabel: axisLabel.trim() || '距离 mm',
      span,
      brief: brief.trim() || `${limb} 压力衣制作任务，按测量表建模并配置 ${tierMin}–${tierMax} mmHg 压力。`,
      measurements: sorted.map((m) => ({ pos: +m.pos, circ: +m.circ, label: m.label || `${m.pos} mm` })),
      scars: scars
        .filter((s) => s.end > s.start)
        .map((s) => ({ start: +s.start, end: +s.end, severity: s.severity, note: s.note })),
      tier: { label: tierLabel, min: +tierMin, max: +tierMax },
      pressureTier: { label: tierLabel, min: +tierMin, max: +tierMax },
      fabricId: fabric.id,
      fabric,
      reference,
      curvatureThreshold: +threshold,
      deadline: new Date(deadline).toISOString(),
      publishedAt: new Date().toISOString(),
    });
    onDone(task);
  }
</script>

<div class="form card fade-in">
  <div class="row" style="justify-content:space-between;margin-bottom:12px">
    <div class="card-title" style="margin:0"><span class="dot"></span>新建考核任务</div>
    <button class="small ghost" onclick={onCancel}>取消</button>
  </div>

  <div class="grid2">
    <label class="field"><span class="muted small">任务名称</span>
      <input bind:value={title} placeholder="如：右前臂屈侧压力衣" /></label>
    <label class="field"><span class="muted small">肢体部位</span>
      <input bind:value={limb} placeholder="右前臂" /></label>
    <label class="field"><span class="muted small">轴向标注</span>
      <input bind:value={axisLabel} placeholder="距腕横纹距离" /></label>
    <label class="field"><span class="muted small">截止时间</span>
      <input type="datetime-local" class="mono" bind:value={deadline} /></label>
  </div>

  <label class="field"><span class="muted small">病情与要求说明</span>
    <textarea rows="2" bind:value={brief} placeholder="瘢痕状态、关节活动度、工艺注意事项…"></textarea></label>

  <div class="grid4">
    <label class="field"><span class="muted small">面料</span>
      <select bind:value={fabricId}>
        {#each FABRICS as f}<option value={f.id}>{f.name}</option>{/each}
      </select></label>
    <label class="field"><span class="muted small">压力档位名称</span>
      <input bind:value={tierLabel} /></label>
    <label class="field"><span class="muted small">档位下限 mmHg</span>
      <input class="mono" type="number" bind:value={tierMin} /></label>
    <label class="field"><span class="muted small">档位上限 mmHg</span>
      <input class="mono" type="number" bind:value={tierMax} /></label>
  </div>

  <hr class="sep" />

  <div class="row" style="justify-content:space-between">
    <span class="sub-title">肢体围度测量表</span>
    <button class="small" onclick={addRow}>＋ 添加测量点</button>
  </div>
  <table class="grid mt6">
    <thead><tr><th class="num">位置 mm</th><th class="num">围度 mm</th><th>标记点</th><th class="num">半径 mm</th><th></th></tr></thead>
    <tbody>
      {#each measurements as m, i}
        <tr>
          <td><input class="mono cell" type="number" step="5" bind:value={m.pos} /></td>
          <td><input class="mono cell" type="number" step="2" bind:value={m.circ} /></td>
          <td><input class="cell wide" bind:value={m.label} placeholder="标记点描述" /></td>
          <td class="num muted mono">{m.circ > 0 ? round(m.circ / (2 * Math.PI), 1) : '—'}</td>
          <td><button class="small ghost" onclick={() => removeRow(i)} disabled={measurements.length <= 3}>✕</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="row" style="justify-content:space-between;margin-top:14px">
    <span class="sub-title">瘢痕位置</span>
    <button class="small" onclick={addScar}>＋ 添加瘢痕</button>
  </div>
  <table class="grid mt6">
    <thead><tr><th class="num">起点 mm</th><th class="num">终点 mm</th><th>程度</th><th>说明</th><th></th></tr></thead>
    <tbody>
      {#each scars as s, i}
        <tr>
          <td><input class="mono cell" type="number" step="5" bind:value={s.start} /></td>
          <td><input class="mono cell" type="number" step="5" bind:value={s.end} /></td>
          <td><input class="cell" bind:value={s.severity} placeholder="深 II 度" /></td>
          <td><input class="cell wide" bind:value={s.note} placeholder="充血期 / 挛缩…" /></td>
          <td><button class="small ghost" onclick={() => removeScar(i)}>✕</button></td>
        </tr>
      {/each}
    </tbody>
  </table>

  <label class="field" style="max-width:280px">
    <span class="muted small">曲率突变阈值 |dκ/ds|</span>
    <input class="mono" type="number" step="0.0001" bind:value={threshold} />
  </label>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="row" style="justify-content:flex-end;margin-top:12px">
    <button class="ghost" onclick={onCancel}>取消</button>
    <button class="primary" onclick={save}>发布任务</button>
  </div>
</div>

<style>
  .form { display: flex; flex-direction: column; gap: 2px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .grid4 { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 10px; }
  @media (max-width: 900px) { .grid2, .grid4 { grid-template-columns: 1fr 1fr; } }
  .field { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
  .field input, .field select, .field textarea { width: 100%; }
  .sub-title { font-size: 12.5px; font-weight: 620; color: var(--text); }
  .mt6 { margin-top: 6px; }
  .cell { width: 90px; padding: 3px 6px; font-size: 11.5px; }
  .cell.wide { width: 100%; }
  .err { color: var(--danger); font-size: 12px; margin: 8px 0 0; }
</style>
