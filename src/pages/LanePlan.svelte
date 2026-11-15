<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { RACE_LANES, raceSquad, findConflicts, conflictsFor } from '../lib/race';
  import { formatStamp } from '../lib/geo';
  import type { Race, RacePhase } from '../lib/types';

  type PhaseFilter = 'all' | 'heat' | 'final';
  let phase = $state<PhaseFilter>('all');
  let activeId = $state<string | null>(null);

  const races = $derived(
    app.data.races
      .filter((r) => phase === 'all' || r.phase === phase)
      .sort((a, b) => a.time.localeCompare(b.time))
  );
  const active = $derived(app.data.races.find((r) => r.id === activeId) ?? races[0] ?? null);

  const published = $derived(app.data.races.filter((r) => r.status === 'published'));

  const boatOf = (id: string | null) => (id ? app.data.boats.find((b) => b.id === id) ?? null : null);

  const chair = (boats: string[]) => boats.join(' / ');

  let dragBoat = $state<string | null>(null);
  let dragFrom = $state<number | null>(null);

  /** boats available to the active race's discipline, not already placed elsewhere in this race */
  const available = $derived.by(() => {
    if (!active) return [];
    const squad = raceSquad(active, app.data.boats);
    const placed = new Set(active.lanes.map((l) => l.boatId).filter(Boolean) as string[]);
    return app.data.boats.filter((b) => b.squad === squad && !placed.has(b.id));
  });

  function assign(lane: number, boatId: string | null) {
    if (!active) return;
    app.assignLane(active.id, lane, boatId);
  }

  function onDragStart(e: DragEvent, boatId: string, fromLane: number | null) {
    dragBoat = boatId;
    dragFrom = fromLane;
    e.dataTransfer?.setData('text/plain', boatId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  function onDrop(e: DragEvent, lane: number) {
    e.preventDefault();
    const id = e.dataTransfer?.getData('text/plain') || dragBoat;
    if (!id || !active) return;
    // dragging within this race: swap if target occupied
    if (dragFrom != null && dragFrom !== lane) {
      const target = active.lanes.find((l) => l.lane === lane);
      const source = active.lanes.find((l) => l.lane === dragFrom);
      if (source) {
        app.assignLane(active.id, lane, id);
        if (target?.boatId) app.assignLane(active.id, dragFrom, target.boatId);
        else app.assignLane(active.id, dragFrom, null);
      }
    } else {
      assign(lane, id);
    }
    dragBoat = null;
    dragFrom = null;
  }

  const totalPlanned = $derived(
    app.data.races.reduce((a, r) => a + r.lanes.filter((l) => l.boatId).length, 0)
    );
  const conflicts = $derived(findConflicts(app.data.races, app.data.boats));
  const activeConflicts = $derived(active ? conflictsFor(active.id, conflicts) : []);
  const hardCount = $derived(conflicts.filter((c) => c.severity === 'hard').length);

  function conflictOf(r: Race) {
    return conflictsFor(r.id, conflicts);
  }
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>赛事编排</h1>
      <p class="ph-sub">按预赛 / 决赛出分组名单与赛道分配 · 重复占用赛道自动提示 · 发布后观众端可见</p>
    </div>
    <div class="ph-actions">
      <Segmented
        value={phase}
        options={[
          { value: 'all', label: '全部' },
          { value: 'heat', label: '预赛' },
          { value: 'final', label: '决赛' }
        ]}
        onchange={(v) => { phase = v; activeId = null; }}
      />
      <button class="btn sm" onclick={() => { app.addRace('heat'); }}>
        <Icon name="plus" size={11} />预赛组
      </button>
      <button class="btn sm" onclick={() => { app.addRace('final'); }}>
        <Icon name="plus" size={11} />决赛
      </button>
    </div>
  </header>

  <div class="summary">
    <div class="sm-item"><span class="mono">{app.data.races.length}</span> 场比赛</div>
    <i></i>
    <div class="sm-item"><span class="mono">{published.length}</span> 已发布</div>
    <i></i>
    <div class="sm-item"><span class="mono">{totalPlanned}</span> 艇已分道</div>
    <i></i>
    <div class="sm-item" class:alert={hardCount > 0}>
      <span class="mono">{hardCount}</span> 处冲突
    </div>
    <i></i>
    <div class="sm-item"><span class="mono">6</span> 条赛道可用</div>
    <span class="sm-hint">拖拽艇只卡片到赛道，或用下拉框分配</span>
  </div>

  <div class="body">
    <!-- left: race list -->
    <div class="race-list">
      {#each races as r (r.id)}
        {@const filled = r.lanes.filter((l) => l.boatId).length}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <button class="race-card" class:on={active?.id === r.id} onclick={() => (activeId = r.id)}>
          <div class="rc-top">
            <span class="rc-time mono">{r.time}</span>
            <span class="phase-tag" class:final={r.phase === 'final'}>{r.phase === 'heat' ? '预赛' : '决赛'} {r.group}</span>
            <span class="badge {r.status === 'published' ? 'teal' : 'neutral'}">
              {r.status === 'published' ? '已发布' : '草稿'}
            </span>
            {#if conflictOf(r).length}
              <span class="rc-conflict" class:hard={conflictOf(r).some((c) => c.severity === 'hard')}>
                <Icon name="warn" size={9} />{conflictOf(r).length}
              </span>
            {/if}
            <span class="rc-ver mono">v{r.version}</span>
          </div>
          <div class="rc-name">{r.name}</div>
          <div class="rc-bar">
            {#each RACE_LANES as l (l)}
              {@const b = boatOf(r.lanes.find((x) => x.lane === l)?.boatId ?? null)}
              <span class="rc-seat" class:filled={!!b} style={b ? `background:${b.color}22;border-color:${b.color}55` : ''}>
                <i class="mono">{l}</i>
                <b>{b ? b.code.split('-')[1] : '·'}</b>
              </span>
            {/each}
          </div>
          <div class="rc-foot mono">{filled}/6 道 · {r.updatedBy} 改于 {formatStamp(r.updatedAt)}</div>
        </button>
      {/each}
    </div>

    <!-- right: lane board -->
    {#if active}
      <div class="board">
        <div class="board-head">
          <div class="bh-left">
            <div class="bh-name">{active.name}</div>
            <div class="bh-meta mono">
              {active.phase === 'heat' ? '预赛' : '决赛'} · {active.group} 组 · {active.time} 开赛 · v{active.version}
            </div>
          </div>
          <div class="bh-actions">
            <input
              class="time-input mono"
              type="time"
              value={active.time}
              onchange={(e) => app.setRaceTime(active!.id, (e.currentTarget as HTMLInputElement).value)}
            />
            {#if active.status === 'draft'}
              <button class="btn sm primary" onclick={() => app.setRaceStatus(active!.id, 'published')}>发布</button>
            {:else}
              <button class="btn sm" onclick={() => app.setRaceStatus(active!.id, 'draft')}>撤回</button>
            {/if}
            <button class="btn sm ghost" onclick={() => { view.role = 'viewer'; view.page = 'raceday'; }}>
              <Icon name="eye" size={11} />观众视图
            </button>
          </div>
        </div>

        {#if activeConflicts.length}
          <div class="conflict-strip">
            <div class="cs-head">
              <Icon name="warn" size={12} />
              <b>{activeConflicts.length} 处冲突需处理</b>
              <span>冲突项不会阻止保存，但发布前应解决</span>
            </div>
            <div class="cs-list">
              {#each activeConflicts.filter((c, i, arr) => arr.findIndex((x) => x.kind === c.kind && x.message === c.message) === i) as c, i (i)}
                <div class="cs-item" class:hard={c.severity === 'hard'}>
                  <span class="cs-kind">{c.kind === 'lane-clash' ? '赛道冲突' : c.kind === 'time-clash' ? '时间冲突' : c.kind === 'squad-mismatch' ? '组别不符' : c.kind === 'incomplete' ? '组员不足' : '重复入列'}</span>
                  <span class="cs-msg">{c.message}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="lane-board">
          {#each RACE_LANES as lane (lane)}
            {@const entry = active.lanes.find((l) => l.lane === lane)}
            {@const boat = boatOf(entry?.boatId ?? null)}
            {@const dup = activeConflicts.some((c) => c.lane === lane || (c.kind === 'lane-clash' && !c.lane))}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="lane-row"
              class:empty={!boat}
              class:dup={dup}
              ondragover={(e) => e.preventDefault()}
              ondrop={(e) => onDrop(e, lane)}
            >
              <div class="lane-no">
                <span class="ln mono">{lane}</span>
                <span class="ln-cap">道</span>
              </div>
              {#if boat}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="boat-chip"
                  style={`border-color:${boat.color}55;background:${boat.color}12`}
                  draggable="true"
                  ondragstart={(e) => onDragStart(e, boat.id, lane)}
                >
                  <span class="bc-dot" style={`background:${boat.color}`}></span>
                  <div class="bc-main">
                    <span class="bc-code mono">{boat.code}</span>
                    <span class="bc-name">{boat.name} · {chair(boat.athletes)}</span>
                  </div>
                  <button class="bc-x" onclick={() => assign(lane, null)} title="清空">
                    <Icon name="close" size={10} />
                  </button>
                </div>
              {:else}
                <div class="lane-drop">拖拽艇只到此 · 或从下方选择</div>
              {/if}
              <div class="lane-pick">
                <select
                  value={entry?.boatId ?? ''}
                  onchange={(e) => assign(lane, (e.currentTarget as HTMLSelectElement).value || null)}
                >
                  <option value="">— 空 —</option>
                  {#each app.data.boats.filter((b) => b.squad === raceSquad(active!, app.data.boats)) as b (b.id)}
                    <option value={b.id}>{b.code} · {b.name}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
        </div>

        <!-- available boats of this discipline -->
        <div class="avail">
          <div class="av-head">
            <span class="eyebrow">可分配艇只</span>
            <span class="av-n mono">{available.length} 未入列</span>
          </div>
          <div class="av-grid">
            {#each available as b (b.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="av-chip"
                style={`border-color:${b.color}44`}
                draggable="true"
                ondragstart={(e) => onDragStart(e, b.id, null)}
              >
                <span class="bc-dot" style={`background:${b.color}`}></span>
                <span class="bc-code mono">{b.code}</span>
                <span class="av-ath">{b.athletes.join('/')}</span>
              </div>
            {/each}
            {#if !available.length}
              <div class="av-empty">该组别艇只已全部分道</div>
            {/if}
          </div>
        </div>

        <div class="board-foot mono">
          分组依据 · {raceSquad(active, app.data.boats)} ·
          <span class="bf-note">改动实时写入操作记录</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .ph {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 20px 24px 15px; border-bottom: 1px solid var(--line-soft); flex: none;
  }
  h1 { font-size: 19px; font-weight: 500; }
  .ph-sub { margin-top: 5px; font-size: 11px; color: var(--muted); }
  .ph-actions { display: flex; align-items: center; gap: 8px; flex: none; }

  .summary {
    display: flex; align-items: center; gap: 14px; padding: 8px 24px;
    border-bottom: 1px solid var(--line-soft); background: rgba(4,18,22,.4);
    font-size: 10.5px; color: var(--muted); flex: none;
  }
  .sm-item .mono { color: var(--ink-2); }
  .sm-item.alert .mono { color: var(--red); }
  .summary i { width: 1px; height: 12px; background: var(--line-soft); }
  .sm-hint { margin-left: auto; font-size: 9px; color: var(--muted-2); }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 306px 1fr; overflow: hidden; }
  .race-list { overflow-y: auto; border-right: 1px solid var(--line-soft); padding: 10px 9px 20px 10px; display: flex; flex-direction: column; gap: 5px; }
  .race-card {
    text-align: left; padding: 9px 11px; border: 1px solid var(--line-soft);
    border-radius: var(--radius); background: var(--panel); transition: border-color .13s, background .13s;
  }
  .race-card:hover { border-color: var(--line); background: var(--panel-2); }
  .race-card.on { border-color: rgba(233,177,84,.44); background: rgba(233,177,84,.05); }
  .rc-top { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .rc-time { font-size: 11px; color: var(--ink); }
  .phase-tag {
    font-size: 8.5px; padding: 1px 5px; border-radius: 2px; color: var(--teal);
    background: rgba(111,211,216,.09); border: 1px solid rgba(111,211,216,.24);
  }
  .phase-tag.final { color: var(--amber); background: var(--amber-bg); border-color: rgba(233,177,84,.3); }
  .rc-conflict {
    display: inline-flex; align-items: center; gap: 3px; font-size: 8.5px; padding: 0 4px;
    border-radius: 2px; color: var(--amber); background: var(--amber-bg);
  }
  .rc-conflict.hard { color: var(--red); background: var(--red-bg); }
  .rc-ver { font-size: 8.5px; color: var(--muted-2); margin-left: auto; }
  .rc-name { font-size: 11.5px; color: var(--ink-2); margin-bottom: 6px; }
  .rc-bar { display: flex; gap: 3px; }
  .rc-seat {
    flex: 1; height: 19px; display: flex; align-items: center; justify-content: center; gap: 3px;
    border: 1px solid var(--line-soft); border-radius: 2px; background: var(--bg-deep);
  }
  .rc-seat i { font-style: normal; font-size: 8px; color: var(--muted-2); }
  .rc-seat b { font-size: 8.5px; font-weight: 500; color: var(--muted); }
  .rc-seat.filled b { color: var(--ink-2); }
  .rc-foot { font-size: 8.5px; color: var(--muted-2); margin-top: 6px; }

  .board { display: flex; flex-direction: column; min-height: 0; }
  .board-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 22px 12px; border-bottom: 1px solid var(--line-soft); }
  .bh-name { font-size: 14px; color: var(--ink); }
  .bh-meta { font-size: 9.5px; color: var(--muted-2); margin-top: 3px; }
  .bh-actions { display: flex; align-items: center; gap: 6px; }
  .time-input { width: 86px; height: 27px; font-size: 11px; }

  .conflict-strip {
    margin: 12px 22px 0; border: 1px solid rgba(234,125,109,.34); border-radius: var(--radius);
    background: rgba(234,125,109,.055); overflow: hidden; flex: none;
  }
  .cs-head { display: flex; align-items: center; gap: 7px; padding: 7px 11px; color: var(--red); border-bottom: 1px solid rgba(234,125,109,.24); }
  .cs-head b { font-size: 11px; font-weight: 500; }
  .cs-head span { font-size: 9px; color: rgba(234,125,109,.72); margin-left: auto; }
  .cs-list { padding: 5px 11px 7px; display: flex; flex-direction: column; gap: 3px; }
  .cs-item { display: flex; gap: 8px; align-items: baseline; font-size: 10px; }
  .cs-kind { flex: none; font-size: 8.5px; color: var(--red); width: 44px; letter-spacing: .04em; }
  .cs-msg { color: var(--ink-2); line-height: 1.45; }
  .cs-item.hard .cs-msg { color: #f0d4cf; }

  .lane-board { flex: 1; overflow-y: auto; padding: 12px 22px 14px; display: flex; flex-direction: column; gap: 6px; }
  .lane-row {
    display: grid; grid-template-columns: 42px 1fr 168px; align-items: center; gap: 12px;
    padding: 7px 10px; border: 1px solid var(--line-soft); border-radius: var(--radius);
    background: var(--panel); transition: border-color .13s, background .13s;
  }
  .lane-row.empty { border-style: dashed; background: rgba(4,18,22,.35); }
  .lane-row.dup { border-color: rgba(234,125,109,.5); background: rgba(234,125,109,.05); }
  .lane-no { display: flex; align-items: baseline; gap: 3px; }
  .ln { font-size: 15px; color: var(--ink); }
  .ln-cap { font-size: 8px; color: var(--muted-2); }

  .boat-chip {
    display: flex; align-items: center; gap: 8px; padding: 6px 9px; border: 1px solid;
    border-radius: var(--radius); cursor: grab;
  }
  .boat-chip:active { cursor: grabbing; }
  .bc-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .bc-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .bc-code { font-size: 11px; color: var(--ink); }
  .bc-name { font-size: 9px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bc-x { color: var(--muted-2); width: 17px; height: 17px; display: grid; place-items: center; border-radius: 2px; flex: none; }
  .bc-x:hover { color: var(--red); background: var(--red-bg); }
  .lane-drop { font-size: 10px; color: var(--muted-2); padding: 8px 4px; }
  .lane-pick select { height: 27px; font-size: 10.5px; }

  .avail { border-top: 1px solid var(--line-soft); padding: 11px 22px 12px; background: rgba(4,18,22,.4); }
  .av-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 7px; }
  .av-n { font-size: 9px; color: var(--muted-2); }
  .av-grid { display: flex; flex-wrap: wrap; gap: 5px; }
  .av-chip {
    display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;
    border: 1px solid; border-radius: 2px; background: rgba(255,255,255,.015); cursor: grab;
  }
  .av-chip:active { cursor: grabbing; }
  .av-ath { font-size: 9px; color: var(--muted-2); }
  .av-empty { font-size: 10px; color: var(--muted-2); padding: 4px; }
  .board-foot { padding: 8px 22px; font-size: 8.5px; color: var(--muted-2); border-top: 1px solid var(--line-soft); letter-spacing: .04em; }
  .bf-note { color: var(--amber); opacity: .8; }
</style>
