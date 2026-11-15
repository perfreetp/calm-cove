<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { compassName, STATUS_META } from '../lib/ui';
  import { formatClock, formatStamp, shortDay } from '../lib/geo';
  import { statusLabel } from '../lib/judge';

  type Filter = 'all' | 'today' | 'week';

  let filter = $state<Filter>('all');
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16'];

  const sessions = $derived.by(() => {
    let list = app.data.sessions.filter((s) => s.status !== 'draft');
    if (filter === 'today') list = list.filter((s) => s.day === '2026-11-15');
    if (filter === 'week') list = list.filter((s) => s.day <= '2026-11-15');
    return list.sort((a, b) => (b.day + b.startTime).localeCompare(a.day + a.startTime));
  });

  const grouped = $derived.by(() => {
    const map = new Map<string, typeof sessions>();
    for (const s of sessions) {
      if (!map.has(s.day)) map.set(s.day, []);
      map.get(s.day)!.push(s);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  });

  let selectedId = $state<string | null>(null);

  // seed the selection once, after the first derived pass resolves
  $effect(() => {
    if (selectedId === null) {
      const first = sessions.find((x) => x.day === '2026-11-15') ?? sessions[0];
      if (first) selectedId = first.id;
    }
  });
  const selected = $derived(app.data.sessions.find((s) => s.id === selectedId) ?? null);
  const sessionRuns = $derived(
    selected ? app.data.runs.filter((r) => r.sessionId === selected.id) : []
  );

  const totalRuns = $derived(
    app.data.runs.filter((r) => {
      const s = app.data.sessions.find((x) => x.id === r.sessionId);
      return s && s.status !== 'draft';
    })
  );
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>训练日程</h1>
      <p class="ph-sub">教练端发布的训练科目 · 只读同步 · 每节课含航道、起止浮标、风向区间与计划艇数</p>
    </div>
    <Segmented
      value={filter}
      options={[
        { value: 'all', label: '全部' },
        { value: 'today', label: '今日' },
        { value: 'week', label: '本周' }
      ]}
      onchange={(v) => {
        filter = v;
        const next = (v === 'today' ? sessions.filter((x) => x.day === '2026-11-15') : sessions)[0];
        if (next) selectedId = next.id;
      }}
    />
  </header>

  <div class="body">
    <div class="list">
      {#each grouped as [day, items] (day)}
        <div class="day-group">
          <div class="day-head">
            <span class="day-d mono">{day.slice(5).replace('-', '.')}</span>
            <span class="day-wd">{day === '2026-11-16' ? '赛事日' : shortDay(day).replace(/^\d+\.\d+\s/, '')}</span>
            <span class="day-line"></span>
            <span class="day-n mono">{items.length} 节</span>
          </div>
          {#each items as s (s.id)}
            {@const runs = app.data.runs.filter((r) => r.sessionId === s.id)}
            {@const flagged = runs.filter((r) => r.detections.length).length}
            <button class="card-row" class:on={selectedId === s.id} onclick={() => (selectedId = s.id)}>
              <div class="cr-time">
                <span class="mono">{s.startTime}</span>
                <span class="mono tm">{s.durationMin}′</span>
              </div>
              <div class="cr-main">
                <div class="cr-top">
                  <span class="code mono">{s.code}</span>
                  <span class="badge {STATUS_META[s.status].tone}">{STATUS_META[s.status].label}</span>
                  {#if flagged}
                    <span class="badge warn">{flagged} 趟异常</span>
                  {/if}
                </div>
                <div class="cr-subject">{s.subject}</div>
                <div class="cr-meta">
                  <span><Icon name="laneplan" size={10} />{s.lanes.length} 条航道 · {s.lanes.join('/')}</span>
                  <span><Icon name="anchor" size={10} />M{s.startMark}–M{s.endMark} · {(s.endMark - s.startMark) * 250} m</span>
                  <span><Icon name="wind" size={10} />{compassName(Math.round((s.wind.fromDeg + s.wind.toDeg) / 2))} {s.wind.minMs}–{s.wind.maxMs} m/s</span>
                  <span><Icon name="users" size={10} />{runs.length}/{s.plannedBoats} 艇</span>
                </div>
              </div>
              <div class="cr-right">
                <span class="cr-coach">{app.data.coaches.find((c) => c.id === s.coachId)?.name}</span>
                <span class="cr-runs mono">{runs.length} 趟</span>
              </div>
            </button>
          {/each}
        </div>
      {/each}
      {#if !grouped.length}
        <div class="empty">该筛选下暂无已发布科目</div>
      {/if}
    </div>

    <aside class="detail">
      {#if selected}
        <div class="d-head">
          <div>
            <div class="d-code mono">{selected.code}</div>
            <h2>{selected.subject}</h2>
          </div>
          <span class="badge {STATUS_META[selected.status].tone}">{STATUS_META[selected.status].label}</span>
        </div>

        <p class="d-focus">{selected.focus}</p>

        <div class="d-grid">
          <div class="d-item">
            <span class="dk">日期 · 时间</span>
            <span class="dv">{shortDay(selected.day)} · {selected.startTime}</span>
          </div>
          <div class="d-item">
            <span class="dk">时限</span>
            <span class="dv mono">{selected.timeLimitMin} min / 艇</span>
          </div>
          <div class="d-item">
            <span class="dk">航道编号</span>
            <span class="dv mono">{selected.lanes.join(' / ')}</span>
          </div>
          <div class="d-item">
            <span class="dk">起止浮标</span>
            <span class="dv mono">M{selected.startMark} → M{selected.endMark}</span>
          </div>
          <div class="d-item">
            <span class="dk">距离</span>
            <span class="dv mono">{(selected.endMark - selected.startMark) * 250} m</span>
          </div>
          <div class="d-item">
            <span class="dk">计划艇数</span>
            <span class="dv mono">{sessionRuns.length} / {selected.plannedBoats}</span>
          </div>
        </div>

        <div class="wind-box">
          <div class="wb-head">
            <Icon name="wind" size={12} />
            <span>风向区间</span>
          </div>
          <div class="wb-body">
            <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" fill="none" stroke="#1d4a4f" stroke-width="1" />
              <circle cx="28" cy="28" r="16" fill="none" stroke="#143639" stroke-width="0.8" stroke-dasharray="2 3" />
              <path
                d={(() => {
                  const a0 = ((selected.wind.fromDeg - 90) * Math.PI) / 180;
                  const a1 = ((selected.wind.toDeg - 90) * Math.PI) / 180;
                  const r = 24;
                  const x0 = 28 + Math.cos(a0) * r;
                  const y0 = 28 + Math.sin(a0) * r;
                  const x1 = 28 + Math.cos(a1) * r;
                  const y1 = 28 + Math.sin(a1) * r;
                  const span = ((selected.wind.toDeg - selected.wind.fromDeg + 360) % 360) * (Math.PI / 180);
                  return `M28 28 L${x0} ${y0} A${r} ${r} 0 ${span > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`;
                })()}
                fill="rgba(111,211,216,0.16)"
                stroke="rgba(111,211,216,0.5)"
                stroke-width="0.8"
              />
              {#each [0, 90, 180, 270] as deg (deg)}
                <text x={28 + Math.cos(((deg - 90) * Math.PI) / 180) * 28} y={28 + Math.sin(((deg - 90) * Math.PI) / 180) * 28 + 2} text-anchor="middle" class="rose-l">{['N', 'E', 'S', 'W'][deg / 90]}</text>
              {/each}
            </svg>
            <div class="wb-txt">
              <span class="wb-main mono">{selected.wind.fromDeg}° – {selected.wind.toDeg}°</span>
              <span class="wb-sub">{compassName(selected.wind.fromDeg)} → {compassName(selected.wind.toDeg)}</span>
              <span class="wb-speed mono">{selected.wind.minMs} – {selected.wind.maxMs} m/s</span>
            </div>
          </div>
        </div>

        <div class="d-section">
          <div class="ds-head">
            <span class="eyebrow">教练备注</span>
          </div>
          <p class="ds-note">{selected.note || '—'}</p>
        </div>

        <div class="d-section">
          <div class="ds-head">
            <span class="eyebrow">本课趟次</span>
            <span class="mono ds-count">{sessionRuns.length}</span>
          </div>
          <div class="run-list">
            {#each sessionRuns as r (r.id)}
              {@const boat = app.data.boats.find((b) => b.id === r.boatId)}
              <button class="run-row" onclick={() => { view.focusSessionId = selected.id; view.select(r.id); view.page = 'overview'; }}>
                <span class="rr-lane mono">L{r.lane}</span>
                <span class="rr-code mono">{boat?.code}</span>
                <span class="rr-dur mono">{r.durationSec.toFixed(1)}s</span>
                <span class="badge {r.status === 'valid' ? 'live' : r.status === 'invalid' ? 'danger' : 'warn'}">
                  {statusLabel[r.status]}
                </span>
              </button>
            {/each}
            {#if !sessionRuns.length}
              <div class="empty-note">尚无上传记录</div>
            {/if}
          </div>
        </div>

        <div class="d-foot mono">
          发布 {selected.publishedAt ? formatStamp(selected.publishedAt) : '—'} · v{selected.version}
        </div>
      {:else}
        <div class="d-empty">
          <Icon name="sessions" size={22} />
          <p>选择左侧科目查看详情</p>
          <span>包含航道、浮标区间、风向、趟次与复核状态</span>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .ph {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--line-soft);
    flex: none;
  }
  h1 {
    font-size: 19px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .ph-sub {
    margin-top: 5px;
    font-size: 11px;
    color: var(--muted);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 372px;
    overflow: hidden;
  }
  .list {
    overflow-y: auto;
    padding: 16px 20px 28px 24px;
  }
  .day-group + .day-group {
    margin-top: 18px;
  }
  .day-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .day-d {
    font-size: 13px;
    color: var(--ink);
    letter-spacing: 0.02em;
  }
  .day-wd {
    font-size: 10px;
    color: var(--muted-2);
  }
  .day-line {
    flex: 1;
    height: 1px;
    background: var(--line-soft);
  }
  .day-n {
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .card-row {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-lg);
    background: var(--panel);
    text-align: left;
    transition: border-color 0.15s, background 0.15s;
    margin-bottom: 7px;
  }
  .card-row:hover {
    border-color: var(--line);
    background: var(--panel-2);
  }
  .card-row.on {
    border-color: rgba(233, 177, 84, 0.4);
    background: rgba(233, 177, 84, 0.045);
  }
  .cr-time {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: none;
    width: 42px;
    padding-top: 1px;
  }
  .cr-time span:first-child {
    font-size: 13px;
    color: var(--ink);
  }
  .tm {
    font-size: 9px;
    color: var(--muted-2);
  }
  .cr-main {
    flex: 1;
    min-width: 0;
  }
  .cr-top {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-bottom: 3px;
  }
  .code {
    font-size: 9.5px;
    color: var(--teal);
    letter-spacing: 0.05em;
  }
  .cr-subject {
    font-size: 12.5px;
    color: var(--ink);
    margin-bottom: 6px;
  }
  .cr-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    font-size: 9.5px;
    color: var(--muted);
  }
  .cr-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .cr-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex: none;
  }
  .cr-coach {
    font-size: 10px;
    color: var(--ink-2);
  }
  .cr-runs {
    font-size: 9px;
    color: var(--muted-2);
  }
  .empty {
    padding: 40px;
    text-align: center;
    color: var(--muted-2);
    font-size: 12px;
  }

  .detail {
    border-left: 1px solid var(--line-soft);
    background: rgba(6, 24, 28, 0.55);
    overflow-y: auto;
    padding: 18px 20px 26px;
  }
  .d-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .d-code {
    font-size: 9.5px;
    color: var(--teal);
    letter-spacing: 0.07em;
    margin-bottom: 3px;
  }
  .d-head h2 {
    font-size: 14.5px;
    font-weight: 500;
    line-height: 1.4;
  }
  .d-focus {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.6;
    margin: 8px 0 14px;
    padding-left: 9px;
    border-left: 2px solid var(--line);
  }
  .d-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--line-soft);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .d-item {
    background: var(--panel);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dk {
    font-size: 8.5px;
    color: var(--muted-2);
    letter-spacing: 0.05em;
  }
  .dv {
    font-size: 11.5px;
    color: var(--ink-2);
  }
  .wind-box {
    margin-top: 12px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .wb-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    font-size: 10px;
    color: var(--muted);
    background: rgba(4, 18, 22, 0.5);
    border-bottom: 1px solid var(--line-soft);
  }
  .wb-body {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
  }
  .rose-l {
    fill: #4d757a;
    font-size: 6px;
    font-family: var(--mono);
  }
  .wb-txt {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .wb-main {
    font-size: 12px;
    color: var(--ink);
  }
  .wb-sub {
    font-size: 9.5px;
    color: var(--muted);
  }
  .wb-speed {
    font-size: 10px;
    color: var(--teal);
  }
  .d-section {
    margin-top: 16px;
  }
  .ds-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7px;
  }
  .ds-count {
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .ds-note {
    font-size: 11px;
    color: var(--ink-2);
    line-height: 1.6;
    padding: 9px 11px;
    background: var(--panel);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
  }
  .run-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .run-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 9px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--panel);
    text-align: left;
    transition: border-color 0.13s, background 0.13s;
  }
  .run-row:hover {
    border-color: var(--line-bright);
    background: var(--panel-2);
  }
  .rr-lane {
    font-size: 9.5px;
    color: var(--muted-2);
    width: 20px;
  }
  .rr-code {
    font-size: 10.5px;
    color: var(--ink-2);
    flex: 1;
  }
  .rr-dur {
    font-size: 10px;
    color: var(--muted);
  }
  .empty-note {
    font-size: 10.5px;
    color: var(--muted-2);
    padding: 6px 2px;
  }
  .d-foot {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid var(--line-soft);
    font-size: 9px;
    color: var(--muted-2);
    letter-spacing: 0.04em;
  }
  .d-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--muted-2);
    text-align: center;
  }
  .d-empty p {
    font-size: 12px;
    color: var(--muted);
  }
  .d-empty span {
    font-size: 10px;
  }
</style>
