<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import MapCanvas from '../components/MapCanvas.svelte';
  import LayerPanel from '../components/LayerPanel.svelte';
  import RunInspector from '../components/RunInspector.svelte';
  import Icon from '../components/Icon.svelte';
  import { formatDuration, formatClock, shortDay } from '../lib/geo';
  import { STATUS_META } from '../lib/ui';
  import type { LayerId } from '../lib/types';

  let mapApi = $state({
    focusRun: (_: string) => {},
    focusLane: (_: number) => {},
    focusAll: () => {}
  });
  function bindMap(api: typeof mapApi) {
    mapApi = api;
  }

  const world = $derived(app.data.world);
  const publishedSessions = $derived(
    app.data.sessions
      .filter((s) => s.status === 'published' || s.status === 'closed')
      .sort((a, b) => (b.day + b.startTime).localeCompare(a.day + a.startTime))
  );
  const todaySessions = $derived(
    publishedSessions.filter((s) => s.day === '2026-11-15' && s.status === 'published')
  );

  const visibleRuns = $derived(
    app.data.runs.filter((r) => {
      const s = app.data.sessions.find((x) => x.id === r.sessionId);
      return !!s && s.status !== 'draft';
    })
  );

  const selectedRun = $derived(app.data.runs.find((r) => r.id === view.selected[0]) ?? null);
  const selectedBoat = $derived(
    selectedRun ? app.data.boats.find((b) => b.id === selectedRun.boatId) ?? null : null
  );
  const selectedSession = $derived(
    selectedRun ? app.data.sessions.find((s) => s.id === selectedRun.sessionId) ?? null : null
  );

  const pointTotal = $derived(visibleRuns.reduce((a, r) => a + r.track.length, 0));
  const flaggedCount = $derived(visibleRuns.filter((r) => r.detections.length).length);
  const pendingCount = $derived(visibleRuns.filter((r) => r.status === 'pending').length);

  const focusSession = $derived(
    view.focusSessionId ? app.data.sessions.find((s) => s.id === view.focusSessionId) ?? null : null
  );

  const layerCounts = $derived({
    depth: world.contours.length + 1,
    shore: 1,
    grid: 1,
    lanes: world.lanes.length,
    buoys: world.buoys.length,
    docks: world.docks.length,
    tracks: visibleRuns.length,
    labels: world.lanes.length
  });

  function selectRun(id: string | null, additive: boolean) {
    view.select(id, additive);
  }

  /* ---------- replay ---------- */
  let replayRunId = $state<string | null>(null);
  let replayT = $state(0);
  let replayPlaying = $state(false);
  let replaySpeed = $state(1);
  let raf = 0;
  let lastFrame = 0;

  const replayRun = $derived(
    replayRunId ? app.data.runs.find((r) => r.id === replayRunId) ?? null : null
  );
  const replayBoat = $derived(
    replayRun ? app.data.boats.find((b) => b.id === replayRun.boatId) ?? null : null
  );

  function tick(now: number) {
    if (!replayPlaying || !replayRun) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    replayT = replayT + dt * replaySpeed * 8;
    if (replayT >= replayRun.durationSec) {
      replayT = replayRun.durationSec;
      replayPlaying = false;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function toggleReplay() {
    if (!replayRun) return;
    if (replayT >= replayRun.durationSec) replayT = 0;
    replayPlaying = !replayPlaying;
    if (replayPlaying) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
    }
  }

  function startReplay(id: string) {
    replayRunId = id;
    replayT = 0;
    replayPlaying = true;
    lastFrame = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
    mapApi.focusRun(id);
  }

  function scrub(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    replayT = v;
    if (replayPlaying) {
      cancelAnimationFrame(raf);
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function stopReplay() {
    replayPlaying = false;
    cancelAnimationFrame(raf);
    replayRunId = null;
  }

  $effect(() => {
    // stop the loop whenever the run disappears
    if (replayRunId && !app.data.runs.some((r) => r.id === replayRunId)) stopReplay();
  });

  function toggleSession(id: string) {
    view.focusSessionId = view.focusSessionId === id ? null : id;
  }
</script>

<div class="ov">
  <div class="map-area">
    <MapCanvas
      {world}
      runs={visibleRuns}
      boats={app.data.boats}
      layers={view.layers}
      selected={view.selected}
      hovered={view.hovered}
      highlightLanes={focusSession?.lanes ?? []}
      markRange={focusSession ? { from: focusSession.startMark, to: focusSession.endMark } : null}
      playback={replayRun ? { runId: replayRun.id, t: replayT } : null}
      onapi={bindMap}
      onSelect={selectRun}
      onHover={(id) => (view.hovered = id)}
    />

    <div class="overlay left">
      <div class="stat-strip">
        <div class="stat">
          <span class="sv mono">{visibleRuns.length}</span>
          <span class="sk">已发布趟次</span>
        </div>
        <i></i>
        <div class="stat">
          <span class="sv mono">{publishedSessions.length}</span>
          <span class="sk">训练科目</span>
        </div>
        <i></i>
        <div class="stat warn">
          <span class="sv mono">{pendingCount}</span>
          <span class="sk">待教练复核</span>
        </div>
        <i></i>
        <div class="stat">
          <span class="sv mono">{pointTotal.toLocaleString('en-US')}</span>
          <span class="sk">轨迹点</span>
        </div>
      </div>

      <div class="lp-host">
        <LayerPanel
          layers={view.layers}
          counts={layerCounts}
          onchange={(id: LayerId, on: boolean) => view.toggleLayer(id, on)}
          onSolo={(id: LayerId) => view.soloLayer(id)}
        />
      </div>

      <div class="side-card">
        <div class="sc-head">
          <span class="eyebrow">今日训练 · 11.15</span>
          <span class="badge live"><span class="dot"></span>进行中</span>
        </div>
        {#each todaySessions as s (s.id)}
          <button class="ses-row" class:on={view.focusSessionId === s.id} onclick={() => toggleSession(s.id)}>
            <span class="ses-time mono">{s.startTime}</span>
            <span class="ses-main">
              <span class="ses-code mono">{s.code}</span>
              <span class="ses-subj">{s.subject}</span>
            </span>
            <span class="ses-lanes mono">{s.lanes.length}道</span>
          </button>
        {/each}
        {#if !todaySessions.length}
          <div class="empty-note">今日暂无已发布科目</div>
        {/if}
        <div class="sc-foot">
          <span>教练已发布内容实时同步</span>
          <span class="sync-dot"></span>
        </div>
      </div>
    </div>

    <div class="overlay right">
      {#if selectedRun}
        <div class="insp-slot">
          <RunInspector
            run={selectedRun}
            boat={selectedBoat}
            session={selectedSession}
            onClose={() => view.clearSelection()}
            onFocus={(id) => mapApi.focusRun(id)}
            onReplay={(id) => startReplay(id)}
          />
        </div>
      {:else}
        <div class="hint-card">
          <div class="hc-head">
            <Icon name="target" size={13} />
            <span>轨迹查看</span>
          </div>
          <p>点击任意一条轨迹可查看该趟的分段时间、偏航曲线与自动判读结论。按住 <span class="kbd">Shift</span> 可多选对比。</p>
          <div class="hc-legend">
            <span class="lg"><i style="background:var(--teal)"></i>有效趟次</span>
            <span class="lg"><i style="background:var(--amber)"></i>待复核</span>
            <span class="lg"><i style="background:var(--red)"></i>已作废</span>
          </div>
        </div>
      {/if}
    </div>

    <div class="overlay bottom">
      {#if replayRun && replayBoat}
        <div class="replay">
          <div class="rp-left">
            <button class="rp-play" onclick={toggleReplay} aria-label={replayPlaying ? '暂停' : '播放'}>
              <Icon name={replayPlaying ? 'pause' : 'play'} size={12} />
            </button>
            <div class="rp-id">
              <span class="mono">{replayBoat.code}</span>
              <span class="rp-lane">第 {replayRun.lane} 道</span>
            </div>
          </div>
          <input
            class="rp-range"
            type="range"
            min="0"
            max={replayRun.durationSec}
            step="0.1"
            value={replayT}
            oninput={scrub}
            aria-label="回放进度"
          />
          <div class="rp-time mono">
            <b>{replayT.toFixed(1)}</b><span>/ {replayRun.durationSec.toFixed(1)} s</span>
          </div>
          <div class="rp-speeds">
            {#each [1, 2, 4] as sp (sp)}
              <button class="rp-sp" class:on={replaySpeed === sp} onclick={() => (replaySpeed = sp)}>{sp}×</button>
            {/each}
          </div>
          <button class="rp-x" onclick={stopReplay} aria-label="关闭回放"><Icon name="close" size={11} /></button>
        </div>
      {/if}
      <div class="timeline">
        <div class="tl-head">
          <span class="eyebrow">训练时间轴</span>
          <span class="tl-note mono">11.10 – 11.16</span>
        </div>
        <div class="tl-days">
          {#each ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'] as day (day)}
            {@const count = visibleRuns.filter((r) => {
              const s = app.data.sessions.find((x) => x.id === r.sessionId);
              return s?.day === day;
            }).length}
            {@const isRace = day === '2026-11-16'}
            <div class="tl-day" class:today={day === '2026-11-15'} class:race={isRace}>
              <span class="tl-d mono">{day.slice(5)}</span>
              <span class="tl-wd">{day === '2026-11-16' ? '赛事日' : shortDay(day).replace(/^\d+\.\d+\s/, '')}</span>
              <span class="tl-bar">
                {#each Array.from({ length: Math.min(6, Math.max(1, count)) }) as _, i (i)}
                  <i style={`opacity:${0.4 + i * 0.1}`}></i>
                {/each}
              </span>
              <span class="tl-c mono">{isRace ? '6' : count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .ov {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .map-area {
    position: relative;
    flex: 1;
    min-height: 0;
  }
  .overlay {
    position: absolute;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    z-index: 5;
  }
  .overlay > * {
    pointer-events: auto;
  }
  .insp-slot {
    pointer-events: auto;
    display: flex;
    justify-content: flex-end;
  }
  .overlay.left {
    top: 48px;
    left: 12px;
    width: 236px;
  }
  .overlay.right {
    top: 48px;
    right: 12px;
    align-items: flex-end;
  }
  .overlay.bottom {
    left: 50%;
    transform: translateX(-50%);
    bottom: 14px;
    max-width: calc(100% - 360px);
    align-items: center;
  }

  .stat-strip {
    display: flex;
    align-items: stretch;
    background: rgba(6, 26, 31, 0.9);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    padding: 8px 4px;
    backdrop-filter: blur(10px);
    box-shadow: var(--shadow);
  }
  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 0 9px;
    min-width: 0;
  }
  .sv {
    font-size: 16px;
    line-height: 1.1;
    color: var(--ink);
  }
  .stat.warn .sv {
    color: var(--amber);
  }
  .sk {
    font-size: 8.5px;
    color: var(--muted-2);
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .stat-strip i {
    width: 1px;
    background: var(--line-soft);
    margin: 2px 0;
  }

  .lp-host {
    display: flex;
    min-height: 0;
    overflow: hidden;
  }
  .lp-host :global(.lp) {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .lp-host :global(.lp-body) {
    overflow-y: auto;
    min-height: 0;
  }

  .side-card {
    background: rgba(6, 26, 31, 0.9);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    backdrop-filter: blur(10px);
    overflow: hidden;
    box-shadow: var(--shadow);
  }
  .sc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 11px 7px;
    border-bottom: 1px solid var(--line-soft);
  }
  .ses-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid var(--line-soft);
    transition: background 0.13s;
  }
  .ses-row:hover {
    background: rgba(111, 211, 216, 0.05);
  }
  .ses-row.on {
    background: rgba(233, 177, 84, 0.08);
  }
  .ses-time {
    font-size: 10px;
    color: var(--muted);
    flex: none;
  }
  .ses-row.on .ses-time {
    color: var(--amber);
  }
  .ses-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .ses-code {
    font-size: 9px;
    color: var(--teal);
    letter-spacing: 0.04em;
  }
  .ses-subj {
    font-size: 10.5px;
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ses-lanes {
    font-size: 9px;
    color: var(--muted-2);
    flex: none;
  }
  .empty-note {
    padding: 14px 12px;
    font-size: 10.5px;
    color: var(--muted-2);
  }
  .sc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 11px;
    font-size: 8.5px;
    color: var(--muted-2);
    background: rgba(4, 18, 22, 0.6);
  }
  .sync-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--green);
    opacity: 0.8;
  }

  .hint-card {
    width: 268px;
    background: rgba(6, 26, 31, 0.88);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    backdrop-filter: blur(10px);
    padding: 11px 13px 12px;
    box-shadow: var(--shadow);
  }
  .hc-head {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--teal);
    font-size: 11px;
    margin-bottom: 6px;
  }
  .hint-card p {
    font-size: 10.5px;
    color: var(--muted);
    line-height: 1.6;
  }
  .kbd {
    margin: 0 1px;
  }
  .hc-legend {
    display: flex;
    gap: 11px;
    margin-top: 9px;
    padding-top: 8px;
    border-top: 1px solid var(--line-soft);
    font-size: 9px;
    color: var(--muted-2);
  }
  .lg {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .lg i {
    width: 11px;
    height: 2px;
    display: block;
  }

  .replay {
    display: flex; align-items: center; gap: 11px; padding: 8px 12px;
    background: rgba(6, 26, 31, 0.94); border: 1px solid rgba(233,177,84,.3);
    border-radius: var(--radius-lg); backdrop-filter: blur(10px);
    box-shadow: 0 10px 30px rgba(0,0,0,.45);
  }
  .rp-left { display: flex; align-items: center; gap: 8px; flex: none; }
  .rp-play {
    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
    background: rgba(233,177,84,.14); border: 1px solid rgba(233,177,84,.4); color: var(--amber);
  }
  .rp-play:hover { background: rgba(233,177,84,.24); }
  .rp-id { display: flex; flex-direction: column; line-height: 1.25; }
  .rp-id .mono { font-size: 10.5px; color: var(--ink); }
  .rp-lane { font-size: 8.5px; color: var(--muted-2); }
  .rp-range {
    -webkit-appearance: none; appearance: none; width: 260px; height: 3px; border-radius: 2px;
    background: linear-gradient(to right, #e9b154 0%, #e9b154 var(--fill, 0%), #1d4a4f var(--fill, 0%), #1d4a4f 100%);
    outline: none; cursor: pointer;
  }
  .rp-range::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #ffe3a8; border: 1px solid #8a6a25; cursor: grab;
  }
  .rp-time { display: flex; align-items: baseline; gap: 3px; flex: none; }
  .rp-time b { font-size: 12px; color: var(--amber); }
  .rp-time span { font-size: 8.5px; color: var(--muted-2); }
  .rp-speeds { display: flex; gap: 2px; flex: none; }
  .rp-sp { width: 24px; height: 20px; border-radius: 2px; font-size: 9px; color: var(--muted-2); font-family: var(--mono); }
  .rp-sp:hover { color: var(--ink-2); }
  .rp-sp.on { background: rgba(233,177,84,.14); color: var(--amber); }
  .rp-x { color: var(--muted-2); width: 18px; height: 18px; display: grid; place-items: center; flex: none; }
  .rp-x:hover { color: var(--ink); }

  /* left column: stack of stat strip + layers that can shrink */
  .overlay.left {
    max-height: calc(100% - 96px);
  }
  .overlay.left > :global(.lp) {
    min-height: 0;
  }

  @media (max-height: 780px) {
    .side-card {
      display: none;
    }
  }

  @media (max-width: 1420px) {
    .side-card {
      display: none;
    }
    .overlay.left {
      width: 214px;
    }
  }

  @media (max-width: 1240px) {
    .hint-card {
      width: 226px;
    }
    .stat-strip {
      padding: 6px 3px;
    }
    .stat {
      padding: 0 7px;
    }
    .sv {
      font-size: 14px;
    }
    .sk {
      font-size: 8px;
    }
  }

  @media (max-width: 1100px) {
    .timeline {
      display: none;
    }
  }

  @media (max-width: 960px) {
    .hint-card {
      display: none;
    }
    .overlay.left {
      width: 190px;
    }
    .overlay.right {
      top: 46px;
    }
  }

  .timeline {
    width: min(760px, calc(100vw - 360px));
    min-width: 420px;
    background: rgba(6, 26, 31, 0.9);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    backdrop-filter: blur(10px);
    padding: 8px 12px 10px;
    box-shadow: var(--shadow);
  }
  .tl-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7px;
  }
  .tl-note {
    font-size: 9px;
    color: var(--muted-2);
  }
  .tl-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
  }
  .tl-day {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 5px 7px;
    border-radius: 2px;
    border: 1px solid var(--line-soft);
    background: rgba(4, 18, 22, 0.5);
  }
  .tl-day.today {
    border-color: rgba(111, 211, 216, 0.35);
    background: rgba(111, 211, 216, 0.07);
  }
  .tl-day.race {
    border-color: rgba(233, 177, 84, 0.45);
    background: rgba(233, 177, 84, 0.07);
  }
  .tl-d {
    font-size: 10.5px;
    color: var(--ink-2);
  }
  .tl-day.race .tl-d {
    color: var(--amber);
  }
  .tl-wd {
    font-size: 8.5px;
    color: var(--muted-2);
  }
  .tl-bar {
    display: flex;
    gap: 2px;
    height: 3px;
    margin: 3px 0 1px;
  }
  .tl-bar i {
    flex: 1;
    background: var(--teal-deep);
    border-radius: 1px;
  }
  .tl-day.race .tl-bar i {
    background: var(--amber);
  }
  .tl-c {
    font-size: 8.5px;
    color: var(--muted-2);
  }
</style>
