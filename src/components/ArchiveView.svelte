<script lang="ts">
  import { store, type SearchFilter } from '../lib/store.svelte';
  import type { EventRecord } from '../lib/types';

  let { onopen } = $props<{ onopen: () => void }>();

  const today = new Date().toISOString().slice(0, 10);
  let form = $state({
    code: `EQ-${new Date().getFullYear()}-${String(store.events.length + 1).padStart(3, '0')}`,
    level: '1.10m 公开级',
    date: today,
    judges: '',
    designer: '',
    length: 70,
    width: 50,
  });

  const levels = ['0.90m 入门级', '1.05m 进阶级', '1.10m 公开级', '1.20m 公开级', '1.30m 大奖赛级', '1.40m 大奖赛级'];

  let filter = $state<SearchFilter>({
    level: '', designer: '', dateFrom: '', dateTo: '', minObstacles: null, maxObstacles: null,
  });

  let results = $derived(store.searchEvents(filter));
  let showCreate = $state(true);

  function createEvent() {
    if (!form.code || !form.judges || !form.designer) {
      alert('请完整填写编号、裁判与设计师');
      return;
    }
    store.createEvent({
      code: form.code,
      level: form.level,
      date: form.date,
      judges: form.judges,
      designer: form.designer,
      field: { length: Number(form.length), width: Number(form.width) },
    });
    showCreate = false;
    onopen();
  }

  function open(ev: EventRecord) {
    store.selectEvent(ev.id);
    onopen();
  }

  function remove(ev: EventRecord, e: MouseEvent) {
    e.stopPropagation();
    if (confirm(`确认删除赛事 ${ev.code} 及其全部路线版本?`)) store.deleteEvent(ev.id);
  }

  function versionCount(ev: EventRecord) {
    return store.versionsOf(ev.id).length;
  }
</script>

<div class="archive">
  <section class="panel">
    <h2 onclick={() => (showCreate = !showCreate)} class="clickable">赛事建档 {showCreate ? '▾' : '▸'}</h2>
    {#if showCreate}
      <div class="row">
        <div class="field"><label>建档编号</label><input bind:value={form.code} /></div>
        <div class="field"><label>级别</label>
          <select bind:value={form.level}>{#each levels as l (l)}<option>{l}</option>{/each}</select>
        </div>
        <div class="field"><label>日期</label><input type="date" bind:value={form.date} /></div>
      </div>
      <div class="row">
        <div class="field"><label>裁判</label><input bind:value={form.judges} placeholder="裁判姓名" /></div>
        <div class="field"><label>路线设计师</label><input bind:value={form.designer} placeholder="设计师姓名" /></div>
      </div>
      <div class="row">
        <div class="field"><label>场地长 (m)</label><input type="number" bind:value={form.length} min="30" max="120" /></div>
        <div class="field"><label>场地宽 (m)</label><input type="number" bind:value={form.width} min="20" max="100" /></div>
        <div class="field" style="align-self:end"><button class="primary" onclick={createEvent}>建档并进入工作室</button></div>
      </div>
    {/if}
  </section>

  <section class="panel" style="margin-top:14px">
    <h2>档案检索(多条件)</h2>
    <div class="row">
      <div class="field"><label>级别</label>
        <select bind:value={filter.level}>
          <option value="">全部</option>
          {#each levels as l (l)}<option>{l}</option>{/each}
        </select>
      </div>
      <div class="field"><label>设计师(包含)</label><input bind:value={filter.designer} /></div>
      <div class="field"><label>日期起</label><input type="date" bind:value={filter.dateFrom} /></div>
      <div class="field"><label>日期止</label><input type="date" bind:value={filter.dateTo} /></div>
    </div>
    <div class="row">
      <div class="field"><label>障碍数 ≥</label><input type="number" bind:value={filter.minObstacles} min="0" /></div>
      <div class="field"><label>障碍数 ≤</label><input type="number" bind:value={filter.maxObstacles} min="0" /></div>
      <div class="field" style="align-self:end">
        <button onclick={() => (filter = { level: '', designer: '', dateFrom: '', dateTo: '', minObstacles: null, maxObstacles: null })}>
          清空条件
        </button>
      </div>
    </div>

    <h3>检索结果({results.length})</h3>
    <div class="scroll" style="max-height:340px">
      <table>
        <thead><tr><th>编号</th><th>级别</th><th>日期</th><th>裁判</th><th>设计师</th><th>场地(m)</th><th>版本数</th><th></th></tr></thead>
        <tbody>
          {#each results as ev (ev.id)}
            <tr class="clickable" onclick={() => open(ev)}>
              <td>{ev.code}</td>
              <td>{ev.level}</td>
              <td>{ev.date}</td>
              <td>{ev.judges}</td>
              <td>{ev.designer}</td>
              <td>{ev.field.length} × {ev.field.width}</td>
              <td>{versionCount(ev)}</td>
              <td><button class="danger small" onclick={(e) => remove(ev, e)}>删除</button></td>
            </tr>
          {/each}
          {#if results.length === 0}
            <tr><td colspan="8" class="muted" style="text-align:center;padding:18px">暂无符合条件的赛事档案</td></tr>
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</div>
