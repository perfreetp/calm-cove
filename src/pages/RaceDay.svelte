<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { RACE_LANES, raceSquad } from '../lib/race';
  import { shortDay, formatStamp } from '../lib/geo';

  type PhaseFilter = 'all' | 'heat' | 'final';
  let phase = $state<PhaseFilter>('all');
  let activeId = $state<string | null>(null);

  // the audience only ever sees published races
  const published = $derived(
    app.data.races.filter((r) => r.status === 'published').sort((a, b) => a.time.localeCompare(b.time))
  );
  const shown = $derived(published.filter((r) => phase === 'all' || r.phase === phase));
  const active = $derived(published.find((r) => r.id === activeId) ?? shown[0] ?? null);

  const boatOf = (id: string | null) => (id ? app.data.boats.find((b) => b.id === id) ?? null : null);
  const squadsOf = $derived(new Map(app.data.squads.map((s) => [s.id, s])));

  const drafts = $derived(app.data.races.filter((r) => r.status !== 'published'));

  function groupByPhase() {
    return [
      { key: 'heat' as const, label: '预赛', races: shown.filter((r) => r.phase === 'heat') },
      { key: 'final' as const, label: '决赛', races: shown.filter((r) => r.phase === 'final') }
    ].filter((g) => g.races.length);
  }
  const groups = $derived(groupByPhase());
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>赛事日 · 分组与赛道</h1>
      <p class="ph-sub">2026-11-16 · 青澜水库 · 仅显示教练端已发布的分组名单与赛道分配</p>
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
      <span class="read-pill"><Icon name="eye" size={11} />只读</span>
    </div>
  </header>

  <div class="body">
    <!-- left: schedule -->
    <div class="sched">
      {#each groups as g (g.key)}
        <div class="grp">
          <div class="grp-head">
            <span class="gh-label">{g.label}</span>
            <span class="gh-line"></span>
            <span class="gh-count mono">{g.races.length} 场</span>
          </div>
          {#each g.races as r (r.id)}
            {@const filled = r.lanes.filter((l) => l.boatId).length}
            <button class="rc" class:on={active?.id === r.id} onclick={() => (activeId = r.id)}>
              <div class="rc-time mono">{r.time}</div>
              <div class="rc-body">
                <div class="rc-name">{r.name}</div>
                <div class="rc-meta mono">{filled} 艇 · {r.group} 组 · 2000 m</div>
              </div>
              <span class="rc-arrow"><Icon name="chevron" size={11} /></span>
            </button>
          {/each}
        </div>
      {/each}

      {#if drafts.length}
        <div class="draft-note">
          <Icon name="clock" size={11} />
          <span>{drafts.length} 场分组尚未发布，教练确认后会出现在这里</span>
        </div>
      {/if}
      {#if !groups.length}
        <div class="empty">暂无已发布赛事</div>
      {/if}
    </div>

    <!-- right: lineup sheet -->
    {#if active}
      {@const squad = squadsOf.get(raceSquad(active, app.data.boats))}
      <div class="sheet">
        <div class="sheet-head">
          <div class="sh-main">
            <div class="sh-eyebrow mono">
              {shortDay(active.day)} · {active.time} 开赛 · {active.phase === 'heat' ? '预赛' : '决赛'}{active.group} 组
            </div>
            <h2>{active.name}</h2>
            <p class="sh-sub">
              起点 M0 → 终点 M8 · 全长 2000 m · 6 条赛道 · 每道宽 14 m
            </p>
          </div>
          <div class="sh-badge">
            <span class="badge teal"><span class="dot"></span>已发布</span>
            <span class="sh-squad" style={`color:${squad?.color};border-color:${squad?.color}55;background:${squad?.color}11`}>
              {squad?.name}
            </span>
          </div>
        </div>

        <!-- course schematic: six lanes with boat cards -->
        <div class="course-viz">
          <div class="cv-axis">
            <span class="mono">0 m</span>
            <span class="cv-ticks">
              {#each [250, 500, 750, 1000, 1250, 1500, 1750] as d (d)}
                <i class="mono">{d}</i>
              {/each}
            </span>
            <span class="mono">2000 m</span>
          </div>
          {#each RACE_LANES as lane (lane)}
            {@const entry = active.lanes.find((l) => l.lane === lane)}
            {@const boat = boatOf(entry?.boatId ?? null)}
            <div class="cv-lane" class:blank={!boat}>
              <span class="cvl-no mono">{lane}</span>
              {#if boat}
                <div class="cvl-boat" style={`border-color:${boat.color}55;background:${boat.color}0f`}>
                  <span class="cb-dot" style={`background:${boat.color}`}></span>
                  <span class="cb-code mono">{boat.code}</span>
                  <span class="cb-name">{boat.name}</span>
                  <span class="cb-ath">{boat.athletes.join(' / ')}</span>
                </div>
              {:else}
                <div class="cvl-empty mono">待定</div>
              {/if}
              <div class="cvl-track">
                <div class="cvl-dash"></div>
                {#if boat}
                  <span class="cvl-start" style={`background:${boat.color}`}></span>
                {/if}
                <span class="cvl-finish mono">M8</span>
              </div>
            </div>
          {/each}
        </div>

        <div class="sheet-foot">
          <div class="sf-left mono">
            赛道分配 v{active.version} · {active.updatedBy} 于 {formatStamp(active.updatedAt)}
          </div>
          <div class="sf-right">
            <Icon name="laneplan" size={11} />
            <span>出发顺序按预赛成绩，决赛中心道位次最高</span>
          </div>
        </div>

        <!-- full race-day order -->
        <div class="order">
          <div class="order-head">
            <span class="eyebrow">赛事日流程</span>
            <span class="order-note mono">{published.length} 场已发布 · 全部同日</span>
          </div>
          <div class="order-track">
            {#each published as r (r.id)}
              {@const filled = r.lanes.filter((l) => l.boatId).length}
              <button class="order-item" class:on={r.id === active.id} onclick={() => (activeId = r.id)}>
                <span class="oi-time mono">{r.time}</span>
                <span class="oi-name">{r.name.replace(/ 预赛 /, ' 预 ').replace(/ 决赛 /, ' 决 ')}</span>
                <span class="oi-lanes">
                  {#each RACE_LANES as l (l)}
                    {@const boat = boatOf(r.lanes.find((x) => x.lane === l)?.boatId ?? null)}
                    <i class:filled={!!boat} style={boat ? `background:${boat.color}` : ''}></i>
                  {/each}
                </span>
                <span class="oi-count mono">{filled}/6</span>
              </button>
            {/each}
          </div>
          <div class="order-axis mono">
            {#each published as r (r.id)}
              <span class="oa-tick"></span>
            {/each}
          </div>
        </div>
      </div>
    {:else}
      <div class="no-race">
        <Icon name="laneplan" size={26} />
        <p>暂无已发布的赛事分组</p>
        <span>教练发布分组与赛道分配后即可查看</span>
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
  .ph-actions { display: flex; align-items: center; gap: 10px; }
  .read-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 9.5px; color: var(--muted-2); padding: 3px 8px; border: 1px solid var(--line-soft); border-radius: 2px; }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 306px 1fr; overflow: hidden; }
  .sched { overflow-y: auto; border-right: 1px solid var(--line-soft); padding: 14px 12px 24px 16px; }
  .grp + .grp { margin-top: 16px; }
  .grp-head { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
  .gh-label { font-size: 10px; color: var(--ink-2); letter-spacing: .12em; }
  .gh-line { flex: 1; height: 1px; background: var(--line-soft); }
  .gh-count { font-size: 9px; color: var(--muted-2); }
  .rc {
    width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 10px;
    border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--panel);
    text-align: left; margin-bottom: 5px; transition: border-color .13s, background .13s;
  }
  .rc:hover { border-color: var(--line); background: var(--panel-2); }
  .rc.on { border-color: rgba(233,177,84,.42); background: rgba(233,177,84,.05); }
  .rc-time { font-size: 12px; color: var(--ink); flex: none; }
  .rc-body { flex: 1; min-width: 0; }
  .rc-name { font-size: 11.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-meta { font-size: 8.5px; color: var(--muted-2); margin-top: 2px; }
  .rc-arrow { color: var(--muted-2); flex: none; }
  .rc.on .rc-arrow { color: var(--amber); }
  .draft-note { display: flex; gap: 6px; align-items: flex-start; margin-top: 14px; padding: 8px 9px; font-size: 9.5px; color: var(--muted-2); line-height: 1.5; background: rgba(4,18,22,.4); border-radius: 2px; }
  .empty { padding: 40px; text-align: center; font-size: 11px; color: var(--muted-2); }

  .sheet { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; padding: 18px 24px 22px; }
  .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
  .sh-eyebrow { font-size: 9.5px; color: var(--muted-2); letter-spacing: .05em; margin-bottom: 5px; }
  .sheet-head h2 { font-size: 20px; font-weight: 500; letter-spacing: .01em; }
  .sh-sub { font-size: 10.5px; color: var(--muted); margin-top: 5px; }
  .sh-badge { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex: none; }
  .sh-squad { font-size: 9.5px; padding: 2px 8px; border-radius: 2px; border: 1px solid; }

  .course-viz { border: 1px solid var(--line-soft); border-radius: var(--radius-lg); background: rgba(6,34,38,.5); padding: 10px 14px 12px; }
  .cv-axis { display: flex; align-items: center; justify-content: space-between; padding: 0 10px 8px 278px; font-size: 8.5px; color: var(--muted-2); }
  .cv-ticks { display: flex; gap: 24px; }
  .cv-ticks i { font-style: normal; font-size: 8px; color: #4d757a; }
  .cv-lane { display: grid; grid-template-columns: 22px 246px 1fr; align-items: center; gap: 10px; height: 42px; border-top: 1px solid rgba(20,54,57,.6); }
  .cv-lane:first-child { border-top: 0; }
  .cv-lane.blank { opacity: .6; }
  .cvl-no { font-size: 11px; color: var(--muted-2); }
  .cvl-track { position: relative; height: 100%; display: flex; align-items: center; }
  .cvl-dash { width: 100%; height: 1px; background: repeating-linear-gradient(to right, #2a6469 0 8px, transparent 8px 15px); }
  .cvl-start { position: absolute; left: 0; width: 3px; height: 16px; border-radius: 1px; box-shadow: 0 0 8px rgba(255,255,255,.18); }
  .cvl-finish { position: absolute; right: 0; font-size: 7.5px; color: var(--muted-2); }
  .cvl-boat {
    display: flex; align-items: center; gap: 7px; padding: 5px 9px; border: 1px solid; border-radius: var(--radius);
    min-width: 0;
  }
  .cb-dot { width: 5px; height: 5px; border-radius: 50%; flex: none; }
  .cb-code { font-size: 10px; color: var(--ink); flex: none; }
  .cb-name { font-size: 9.5px; color: var(--muted); flex: none; }
  .cb-ath { font-size: 9px; color: var(--muted-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cvl-empty { font-size: 9.5px; color: var(--muted-2); padding: 5px 9px; border: 1px dashed var(--line-soft); border-radius: var(--radius); text-align: center; }

  .sheet-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; font-size: 8.5px; color: var(--muted-2); }
  .sf-right { display: inline-flex; align-items: center; gap: 5px; }

  .order { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--line-soft); }
  .order-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
  .order-note { font-size: 8.5px; color: var(--muted-2); }
  .order-track { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 5px; }
  .order-item {
    display: flex; align-items: center; flex-wrap: wrap; gap: 5px 8px;
    padding: 8px 10px; border: 1px solid var(--line-soft); border-radius: var(--radius);
    background: var(--panel); text-align: left; transition: border-color .13s, background .13s;
  }
  .order-item:hover { border-color: var(--line); background: var(--panel-2); }
  .order-item.on { border-color: rgba(233,177,84,.42); background: rgba(233,177,84,.05); }
  .oi-time { font-size: 10.5px; color: var(--teal); flex: none; }
  .order-item.on .oi-time { color: var(--amber); }
  .oi-name { font-size: 10px; color: var(--ink-2); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .oi-lanes { display: flex; gap: 2px; flex: none; }
  .oi-lanes i { width: 7px; height: 12px; border-radius: 1px; background: rgba(255,255,255,.06); display: block; }
  .oi-count { font-size: 8px; color: var(--muted-2); flex: none; }
  .order-axis { display: flex; justify-content: space-between; margin-top: 6px; padding: 0 10px; }
  .oa-tick { width: 1px; height: 3px; background: var(--line-soft); }

  .no-race { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted-2); }
  .no-race p { font-size: 12.5px; color: var(--muted); }
  .no-race span { font-size: 10px; }
</style>
