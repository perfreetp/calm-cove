<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { diffCourses, type CourseDiff } from '../lib/diff';
  import CourseCanvas from './CourseCanvas.svelte';
  import type { RouteVersion } from '../lib/types';

  const ev = $derived(store.getEvent(store.session.currentEventId));
  const list = $derived(ev ? store.versionsOf(ev.id) : []);

  let leftId = $state<string | null>(null);
  let rightId = $state<string | null>(null);

  // 默认选最后两版
  $effect(() => {
    if (list.length >= 2 && !rightId) {
      leftId = list[list.length - 2].id;
      rightId = list[list.length - 1].id;
    } else if (list.length === 1 && !rightId) {
      rightId = list[0].id;
    }
  });

  const left = $derived(list.find((v) => v.id === leftId));
  const right = $derived(list.find((v) => v.id === rightId));
  const diff: CourseDiff | undefined = $derived(right ? diffCourses(left?.course, right.course) : undefined);

  const leftHl = $derived(new Set(diff?.obstacles.filter((c) => c.kind === 'removed' || c.kind === 'moved' || c.kind === 'rotated').map((c) => c.id) ?? []));
  const rightHl = $derived(new Set(diff?.obstacles.filter((c) => c.kind === 'added' || c.kind === 'moved' || c.kind === 'rotated').map((c) => c.id) ?? []));

  const kindLabel: Record<string, string> = {
    added: '新增', removed: '删除', moved: '移动', rotated: '旋转', unchanged: '未变',
  };
</script>

{#if !ev}
  <div class="panel"><p class="muted">请先在档案室选择一场赛事。</p></div>
{:else if list.length < 1}
  <div class="panel"><p class="muted">该赛事还没有路线版本,先到工作室生成。</p></div>
{:else}
  <div class="compare">
    <div class="panel selectors">
      <div class="field">
        <label>基准版本(A)</label>
        <select bind:value={leftId}>
          <option value={null}>— 空(全部视为新增)—</option>
          {#each list as v (v.id)}<option value={v.id}>v{v.versionNo} · {v.label} · {v.status}</option>{/each}
        </select>
      </div>
      <div class="vs">⇄</div>
      <div class="field">
        <label>比对版本(B)</label>
        <select bind:value={rightId}>
          {#each list as v (v.id)}<option value={v.id}>v{v.versionNo} · {v.label} · {v.status}</option>{/each}
        </select>
      </div>
    </div>

    <div class="sidebyside">
      <div class="panel canvas-panel">
        <h2>A:{left ? `v${left.versionNo} ${left.label}` : '空'}</h2>
        {#if left}
          <CourseCanvas course={left.course} highlightIds={leftHl} editable={false} showConflicts={true} showStrides={false} />
        {/if}
      </div>
      <div class="panel canvas-panel">
        <h2>B:{right ? `v${right.versionNo} ${right.label}` : '未选择'}</h2>
        {#if right}
          <CourseCanvas course={right.course} highlightIds={rightHl} editable={false} showConflicts={true} showStrides={false} />
        {/if}
      </div>
    </div>

    {#if diff && right}
      <div class="panel detail">
        <h2>改动明细 {diff.hasChanges ? '' : '(两版完全一致)'}</h2>
        <div class="row stats">
          <div>冲突数变化:<b class={diff.conflictDelta > 0 ? 'danger-text' : 'ok-text'}>{diff.conflictDelta > 0 ? '+' : ''}{diff.conflictDelta}</b></div>
          <div>路线长度变化:<b>{diff.lengthDelta > 0 ? '+' : ''}{diff.lengthDelta} m</b></div>
        </div>

        {#if diff.paramChanges.length}
          <h3>参数变化</h3>
          <table>
            <thead><tr><th>参数</th><th>A</th><th>B</th></tr></thead>
            <tbody>
              {#each diff.paramChanges as p (p.key)}
                <tr><td>{p.key}</td><td>{p.before}</td><td class="ok-text">{p.after}</td></tr>
              {/each}
            </tbody>
          </table>
        {/if}

        <h3>障碍变化(高亮:移动/旋转/新增/删除)</h3>
        <div class="scroll" style="max-height:260px">
          <table>
            <thead><tr><th>编号</th><th>类型</th><th>说明</th><th>位置(m)</th></tr></thead>
            <tbody>
              {#each diff.obstacles as c (c.id + c.kind)}
                {#if c.kind !== 'unchanged'}
                  <tr class={`hl-${c.kind}`}>
                    <td>{c.number}</td>
                    <td>{kindLabel[c.kind]}</td>
                    <td>{c.detail}</td>
                    <td>({c.at.x.toFixed(1)}, {c.at.y.toFixed(1)})</td>
                  </tr>
                {/if}
              {/each}
              {#each diff.obstacles as c (c.id + c.kind + '-u')}
                {#if c.kind === 'unchanged'}
                  <tr class="muted"><td>{c.number}</td><td>未变</td><td>—</td><td>({c.at.x.toFixed(1)}, {c.at.y.toFixed(1)})</td></tr>
                {/if}
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .compare { display: flex; flex-direction: column; gap: 14px; height: 100%; min-height: 0; }
  .selectors { display: flex; align-items: flex-end; gap: 14px; }
  .selectors .field { flex: 1; margin-bottom: 0; }
  .vs { font-size: 22px; padding-bottom: 8px; color: var(--accent); }
  .sidebyside { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; flex: 1; min-height: 320px; }
  .canvas-panel { display: flex; flex-direction: column; min-height: 0; }
  .canvas-panel :global(div.canvas-wrap) { flex: 1; }
  .detail { flex-shrink: 0; }
  .stats { margin-bottom: 8px; }
  .stats > div { background: var(--panel-2); padding: 8px 12px; border-radius: 8px; }
  .danger-text { color: var(--danger); }
  .ok-text { color: var(--ok); }
</style>
