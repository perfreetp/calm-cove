<script lang="ts">
  import { app } from '../lib/store.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { formatDuration, formatDurationShort, shortDay } from '../lib/geo';
  import { statusLabel } from '../lib/judge';
  import { VERDICT_META } from '../lib/ui';
  import type { Run } from '../lib/types';

  type Tab = 'splits' | 'deviation' | 'attendance';
  let tab = $state<Tab>('splits');
  let squad = $state<string>('all');
  let range = $state<'all' | 'recent'>('all');

  const boats = $derived(app.data.boats);
  const sessions = $derived(app.data.sessions);

  const runsOf = (boatId: string) => app.data.runs.filter((r) => r.boatId === boatId);

  /** only reviewed-valid runs count toward averages; invalid excluded, pending noted */
  const usable = $derived.by(() => {
    let list = app.data.runs.filter((r) => r.status !== 'invalid');
    if (range === 'recent') list = list.filter((r) => {
      const s = sessions.find((x) => x.id === r.sessionId);
      return s && s.day >= '2026-11-13';
    });
    if (squad !== 'all') list = list.filter((r) => boats.find((b) => b.id === r.boatId)?.squad === squad);
    return list;
  });

  const allForDuty = $derived.by(() => {
    let list = app.data.runs;
    if (range === 'recent') list = list.filter((r) => {
      const s = sessions.find((x) => x.id === r.sessionId);
      return s && s.day >= '2026-11-13';
    });
    return list;
  });

  const squads = $derived(app.data.squads);

  /* ---------- split averages ---------- */
  interface SplitStat {
    boatId: string;
    code: string;
    squad: string;
    color: string;
    n: number;
    total: number;
    per500: number | null;
    best: number;
    worst: number;
    segments: Map<number, { sec: number; n: number }>;
    trend: number[];
  }

  const splitStats = $derived.by(() => {
    const out: SplitStat[] = [];
    for (const b of boats) {
      if (squad !== 'all' && b.squad !== squad) continue;
      const mine = usable.filter((r) => r.boatId === b.id);
      if (!mine.length) {
        out.push({ boatId: b.id, code: b.code, squad: b.squad, color: b.color, n: 0, total: 0, per500: null, best: 0, worst: 0, segments: new Map(), trend: [] });
        continue;
      }
      let total = 0;
      let paceSum = 0;
      const segments = new Map<number, { sec: number; n: number }>();
      let best = Infinity;
      let worst = 0;
      const trend: number[] = [];
      for (const r of mine) {
        total += r.durationSec;
        const pace = r.durationSec / (r.distanceM / 500);
        best = Math.min(best, pace);
        worst = Math.max(worst, pace);
        paceSum += pace;
        trend.push(Number(pace.toFixed(1)));
        const sp = r.splits;
        for (let i = 1; i < sp.length; i++) {
          const key = (sp[i].distance - sp[i - 1].distance);
          const sec = sp[i].t - sp[i - 1].t;
          const cur = segments.get(key) ?? { sec: 0, n: 0 };
          segments.set(key, { sec: cur.sec + sec, n: cur.n + 1 });
        }
      }
      out.push({
        boatId: b.id,
        code: b.code,
        squad: b.squad,
        color: b.color,
        n: mine.length,
        total,
        per500: paceSum / mine.length,
        best,
        worst,
        segments,
        trend
      });
    }
    return out.sort((a, b) => (a.per500 ?? 999) - (b.per500 ?? 999));
  });

  const fastest = $derived(splitStats.find((s) => s.per500) ?? null);
  const squadAverage = $derived.by(() => {
    const withData = splitStats.filter((s) => s.per500);
    if (!withData.length) return 0;
    return withData.reduce((a, s) => a + (s.per500 ?? 0), 0) / withData.length;
  });

  /* ---------- deviation ---------- */
  const devStats = $derived.by(() => {
    return splitStats.map((s) => {
      const mine = usable.filter((r) => r.boatId === s.boatId);
      const flagged = mine.filter((r) => r.detections.some((d) => d.kind === 'deviation')).length;
      const misses = mine.filter((r) => r.detections.some((d) => d.kind === 'missedBuoy')).length;
      const starts = mine.filter((r) => r.detections.some((d) => d.kind === 'falseStart')).length;
      const mean = mine.length ? mine.reduce((a, r) => a + r.maxDeviation, 0) / mine.length : 0;
      return {
        ...s,
        flagged,
        misses,
        starts,
        meanDeviation: mean,
        rate: mine.length ? (flagged / mine.length) * 100 : 0
      };
    });
  });

  const overall = $derived.by(() => {
    const total = allForDuty.length;
    const dev = allForDuty.filter((r) => r.detections.some((d) => d.kind === 'deviation')).length;
    const miss = allForDuty.filter((r) => r.detections.some((d) => d.kind === 'missedBuoy')).length;
    const fs = allForDuty.filter((r) => r.detections.some((d) => d.kind === 'falseStart')).length;
    const invalid = allForDuty.filter((r) => r.status === 'invalid').length;
    return {
      total,
      dev,
      miss,
      fs,
      invalid,
      devRate: total ? (dev / total) * 100 : 0,
      missRate: total ? (miss / total) * 100 : 0,
      fsRate: total ? (fs / total) * 100 : 0
    };
  });

  /* ---------- attendance ---------- */
  interface AttendRow {
    boatId: string;
    code: string;
    squad: string;
    color: string;
    planned: number;
    uploaded: number;
    valid: number;
    pending: number;
    invalid: number;
    rate: number;
    cells: { sessionId: string; state: 'none' | 'valid' | 'pending' | 'invalid'; planned: boolean }[];
  }

  const attendSessions = $derived(
    sessions
      .filter((s) => s.status !== 'draft')
      .sort((a, b) => (a.day + a.startTime).localeCompare(b.day + b.startTime))
  );

  const attend = $derived.by(() => {
    const rows: AttendRow[] = [];
    for (const b of boats) {
      if (squad !== 'all' && b.squad !== squad) continue;
      const mine = allForDuty.filter((r) => r.boatId === b.id);
      // a crew is "planned" only for sessions whose roster names it
      const plannedSessions = attendSessions.filter((s) => s.assigned.includes(b.id));
      const uploadedForPlan = plannedSessions.filter((s) => mine.some((r) => r.sessionId === s.id));
      const planned = plannedSessions.length;
      const uploaded = uploadedForPlan.length;
      const valid = mine.filter((r) => r.status === 'valid').length;
      const pending = mine.filter((r) => r.status === 'pending').length;
      const invalid = mine.filter((r) => r.status === 'invalid').length;
      const cells = attendSessions.map((s) => {
        const rs = mine.filter((r) => r.sessionId === s.id);
        const plannedHere = s.assigned.includes(b.id);
        if (!rs.length) {
          return { sessionId: s.id, state: 'none' as const, planned: plannedHere };
        }
        const st = rs.some((r) => r.status === 'pending')
          ? 'pending'
          : rs.every((r) => r.status === 'invalid')
            ? 'invalid'
            : 'valid';
        return { sessionId: s.id, state: st as 'valid' | 'pending' | 'invalid', planned: plannedHere };
      });
      rows.push({
        boatId: b.id,
        code: b.code,
        squad: b.squad,
        color: b.color,
        planned,
        uploaded,
        valid,
        pending,
        invalid,
        rate: planned ? (uploaded / planned) * 100 : -1,
        cells
      });
    }
    return rows.sort((x, y) => {
      const rx = x.rate < 0 ? 999 : x.rate;
      const ry = y.rate < 0 ? 999 : y.rate;
      return rx - ry || x.code.localeCompare(y.code);
    });
  });

  const totalAttendance = $derived.by(() => {
    const p = attend.reduce((a, r) => a + r.planned, 0);
    const u = attend.reduce((a, r) => a + r.uploaded, 0);
    return { planned: p, uploaded: u, rate: p ? (u / p) * 100 : 0 };
  });

  let query = $state('');
  const filteredAttend = $derived(
    query.trim()
      ? attend.filter((r) => r.code.toLowerCase().includes(query.toLowerCase()) || boats.find((b) => b.id === r.boatId)?.athletes.some((a) => a.includes(query)))
      : attend
  );
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>统计报告</h1>
      <p class="ph-sub">各艇平均分段时间 · 偏航率与出勤 · 已作废趟次不计入均值，待复核趟次单独标注</p>
    </div>
    <div class="ph-actions">
      <select class="squad-select" bind:value={squad}>
        <option value="all">全部组别</option>
        {#each squads as s (s.id)}
          <option value={s.id}>{s.name}</option>
        {/each}
      </select>
      <Segmented
        value={range}
        options={[{ value: 'all', label: '全周期' }, { value: 'recent', label: '近三日' }]}
        onchange={(v) => (range = v)}
      />
      <span class="runs-count mono">{usable.length} / {allForDuty.length} 趟计入</span>
    </div>
  </header>

  <div class="kpi-strip">
    <div class="kpi">
      <span class="kpi-k">平均 500 m 配速</span>
      <span class="kpi-v mono">{squadAverage.toFixed(1)}<i>s</i></span>
      <span class="kpi-n">均值 · {splitStats.filter((s) => s.per500).length} 艇</span>
    </div>
    <i></i>
    <div class="kpi">
      <span class="kpi-k">最快艇</span>
      <span class="kpi-v mono" style="color:var(--amber)">{fastest?.code ?? '—'}</span>
      <span class="kpi-n">{fastest?.per500 ? fastest.per500.toFixed(1) + ' s/500m' : '无数据'}</span>
    </div>
    <i></i>
    <div class="kpi" class:bad={overall.devRate > 20}>
      <span class="kpi-k">偏航率</span>
      <span class="kpi-v mono">{overall.devRate.toFixed(1)}<i>%</i></span>
      <span class="kpi-n">{overall.dev} / {overall.total} 趟</span>
    </div>
    <i></i>
    <div class="kpi" class:bad={overall.missRate > 10}>
      <span class="kpi-k">漏标率</span>
      <span class="kpi-v mono">{overall.missRate.toFixed(1)}<i>%</i></span>
      <span class="kpi-n">{overall.miss} 趟漏标</span>
    </div>
    <i></i>
    <div class="kpi">
      <span class="kpi-k">出勤</span>
      <span class="kpi-v mono">{totalAttendance.rate.toFixed(0)}<i>%</i></span>
      <span class="kpi-n">{totalAttendance.uploaded} / {totalAttendance.planned} 计划</span>
    </div>
    <i></i>
    <div class="kpi">
      <span class="kpi-k">作废</span>
      <span class="kpi-v mono" style="color:var(--red)">{overall.invalid}</span>
      <span class="kpi-n">经复核剔除</span>
    </div>
  </div>

  <div class="tabs">
    <Segmented
      value={tab}
      options={[
        { value: 'splits', label: '分段时间' },
        { value: 'deviation', label: '偏航率' },
        { value: 'attendance', label: '出勤' }
      ]}
      onchange={(v) => (tab = v)}
    />
  </div>

  <div class="content">
    {#if tab === 'splits'}
      <div class="split-view">
        <div class="table-card">
          <div class="tc-head">
            <span class="eyebrow">各艇平均分段时间</span>
            <span class="tc-sub mono">按 500 m 配速升序</span>
          </div>
          <div class="grid-head mono">
            <span>艇号</span><span>组别</span><span>趟次</span><span>平均 500m</span>
            <span>最佳</span><span>最差</span><span>分段稳定性</span><span>趋势</span>
          </div>
          {#each splitStats as s (s.boatId)}
            {@const mine = usable.filter((r) => r.boatId === s.boatId)}
            {@const spread = s.n > 1 ? s.worst - s.best : 0}
            <div class="stat-row">
              <span class="sr-code mono" style={`color:${s.color}`}>{s.code}</span>
              <span class="sr-squad">{s.squad}</span>
              <span class="mono">{s.n}</span>
              <span class="mono sr-pace">
                {s.per500 ? s.per500.toFixed(1) : '—'}
                {#if s.per500 && s.per500 === fastest?.per500}<span class="fast-mark">最快</span>{/if}
              </span>
              <span class="mono">{s.n ? s.best.toFixed(1) : '—'}</span>
              <span class="mono">{s.n > 1 ? s.worst.toFixed(1) : '—'}</span>
              <span class="stab">
                <span class="stab-bar"><i style={`width:${Math.min(100, (spread / 8) * 100)}%`}></i></span>
                <span class="mono">{s.n > 1 ? `±${(spread / 2).toFixed(1)}s` : '—'}</span>
              </span>
              <span class="trend">
                {#if s.trend.length > 1}
                  {@const pts = s.trend.map((v, i) => {
                    const mn = Math.min(...s.trend);
                    const mx = Math.max(...s.trend);
                    const span = mx - mn || 1;
                    return `${(i / (s.trend.length - 1)) * 52},${16 - ((v - mn) / span) * 12}`;
                  }).join(' ')}
                  <svg width="52" height="18" viewBox="0 0 52 18">
                    <polyline points={pts} fill="none" stroke={s.color} stroke-width="1.3" stroke-linejoin="round" />
                  </svg>
                {:else}
                  <span class="dim mono">—</span>
                {/if}
              </span>
            </div>
          {/each}
        </div>

        <div class="seg-card">
          <div class="tc-head">
            <span class="eyebrow">分段节奏剖面</span>
            <span class="tc-sub mono">各组平均每 250 m</span>
          </div>
          <div class="seg-chart">
            {#each squads.filter((sq) => squad === 'all' || sq.id === squad) as sq (sq.id)}
              {@const fleet = usable.filter((r) => boats.find((b) => b.id === r.boatId)?.squad === sq.id)}
              {#if fleet.length}
                <!-- each slot is the fleet-mean 500 m pace for that 250 m split -->
                {@const means = Array.from({ length: 8 }, (_, i) => {
                  const vals = fleet
                    .map((r) => {
                      const a = r.splits[i];
                      const b = r.splits[i + 1];
                      if (!a || !b) return null;
                      return ((b.t - a.t) / (b.distance - a.distance)) * 500;
                    })
                    .filter((v) => v != null);
                  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
                })}
                <div class="seg-row">
                  <span class="seg-label" style={`color:${sq.color}`} title={sq.name}>{sq.short}</span>
                  <div class="seg-bars">
                    {#each means as mean, i (i)}
                      {#if mean != null}
                        <span class="seg-slot">
                          <span
                            class="seg-bar"
                            style={`height:${Math.max(6, Math.min(100, ((mean - 72) / 62) * 100))}%;background:${sq.color}`}
                            title={`M${i}–M${i + 1} · ${mean.toFixed(1)} s/500m`}
                          ></span>
                          <i class="mono seg-num">{mean.toFixed(0)}</i>
                        </span>
                      {:else}
                        <span class="seg-slot"><span class="seg-bar ghost"></span></span>
                      {/if}
                    {/each}
                  </div>
                  <span class="seg-count mono">{fleet.length} 趟</span>
                </div>
              {/if}
            {/each}
          </div>
          <div class="seg-axis mono">
            <span>M0–1</span><span>M1–2</span><span>M2–3</span><span>M3–4</span><span>M4–5</span><span>M5–6</span><span>M6–7</span><span>M7–8</span>
          </div>
        </div>
      </div>

    {:else if tab === 'deviation'}
      <div class="dev-view">
        <div class="table-card">
          <div class="tc-head">
            <span class="eyebrow">各艇偏航统计</span>
            <span class="tc-sub mono">偏航阈值 3 m · 漏标判定 ±6.75 m</span>
          </div>
          <div class="grid-head mono">
            <span>艇号</span><span>组别</span><span>趟次</span><span>偏航趟</span>
            <span>偏航率</span><span>漏标</span><span>抢航</span><span>平均最大偏航</span>
          </div>
          {#each devStats as s (s.boatId)}
            <div class="stat-row">
              <span class="sr-code mono" style={`color:${s.color}`}>{s.code}</span>
              <span class="sr-squad">{s.squad}</span>
              <span class="mono">{s.n}</span>
              <span class="mono">{s.flagged}</span>
              <span class="rate-cell">
                <span class="rate-bar"><i class:bad={s.rate > 25} style={`width:${Math.min(100, s.rate * 1.6)}%`}></i></span>
                <span class="mono">{s.rate.toFixed(0)}%</span>
              </span>
              <span class="mono" class:has={s.misses > 0}>{s.misses}</span>
              <span class="mono" class:has={s.starts > 0}>{s.starts}</span>
              <span class="mono">{s.n ? s.meanDeviation.toFixed(2) + ' m' : '—'}</span>
            </div>
          {/each}
        </div>

        <div class="dev-side">
          <div class="dev-summary">
            <span class="eyebrow">全队判定分布</span>
            <div class="ds-rows">
              <div class="ds-row">
                <span class="ds-k">偏航 &gt; 3 m</span>
                <span class="ds-bar"><i style={`width:${Math.min(100, overall.devRate * 2)}%`}></i></span>
                <span class="ds-v mono">{overall.dev}/{overall.total}</span>
              </div>
              <div class="ds-row">
                <span class="ds-k">漏标</span>
                <span class="ds-bar miss"><i style={`width:${Math.min(100, overall.missRate * 4)}%`}></i></span>
                <span class="ds-v mono">{overall.miss}/{overall.total}</span>
              </div>
              <div class="ds-row">
                <span class="ds-k">抢航</span>
                <span class="ds-bar fs"><i style={`width:${Math.min(100, overall.fsRate * 4)}%`}></i></span>
                <span class="ds-v mono">{overall.fs}/{overall.total}</span>
              </div>
              <div class="ds-row">
                <span class="ds-k">复核作废</span>
                <span class="ds-bar inv"><i style={`width:${Math.min(100, (overall.invalid / Math.max(1, overall.total)) * 8)}%`}></i></span>
                <span class="ds-v mono">{overall.invalid}</span>
              </div>
            </div>
          </div>
          <div class="note-card">
            <Icon name="warn" size={12} />
            <p>偏航率按「趟」计算，同一趟多次偏航只计一次。设备漂移经教练复核为有效的趟次仍计入统计，但会在复核记录中保留原因。</p>
          </div>
        </div>
      </div>

    {:else}
      <div class="attend-view">
        <div class="tc-head">
          <span class="eyebrow">出勤矩阵</span>
          <div class="att-tools">
            <input type="text" class="att-search" placeholder="搜索艇号或队员" bind:value={query} />
            <span class="tc-sub mono">上传 / 计划</span>
          </div>
        </div>
        <div class="att-grid">
          <div class="ag-head">
            <span class="ag-boat">艇号</span>
            {#each attendSessions as s (s.id)}
              <span class="ag-col" title={`${s.code} · ${shortDay(s.day)} ${s.startTime}`}>
                <i class="mono">{s.day.slice(8)}</i>
                <b class="mono">{s.startTime}</b>
              </span>
            {/each}
            <span class="ag-rate">出勤</span>
          </div>
          {#each filteredAttend as r (r.boatId)}
            <div class="ag-row">
              <span class="ag-boat mono" style={`color:${r.color}`}>{r.code}</span>
              {#each r.cells as cell, i (i)}
                <span
                  class="ag-cell"
                  class:valid={cell.state === 'valid'}
                  class:pending={cell.state === 'pending'}
                  class:invalid={cell.state === 'invalid'}
                  class:planned={cell.state === 'none' && cell.planned}
                  title={`${attendSessions[i].code} · ${cell.state === 'none' ? (cell.planned ? '计划内未上传' : '非本课名单') : statusLabel[cell.state]}`}
                ></span>
              {/each}
              <span class="ag-rate">
                {#if r.rate >= 0}
                  <span class="rate-bar"><i class:bad={r.rate < 70} style={`width:${Math.min(100, r.rate)}%`}></i></span>
                  <span class="mono">{r.rate.toFixed(0)}%</span>
                {:else}
                  <span class="rate-none mono">未排课</span>
                {/if}
              </span>
            </div>
          {/each}
          {#if !filteredAttend.length}
            <div class="att-empty">没有匹配的艇只</div>
          {/if}
        </div>
        <div class="att-legend">
          <span><i class="sw valid"></i>有效</span>
          <span><i class="sw pending"></i>待复核</span>
          <span><i class="sw invalid"></i>作废</span>
          <span><i class="sw planned"></i>计划内未上传</span>
          <span><i class="sw none"></i>非本课名单</span>
          <span class="att-note">出勤 = 已上传 / 该艇被列入名单的课次</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .page { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
  .ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 20px 24px 14px; border-bottom: 1px solid var(--line-soft); flex: none; }
  h1 { font-size: 19px; font-weight: 500; }
  .ph-sub { margin-top: 5px; font-size: 11px; color: var(--muted); }
  .ph-actions { display: flex; align-items: center; gap: 8px; flex: none; }
  .squad-select { width: 150px; height: 28px; font-size: 11px; }
  .runs-count { font-size: 9px; color: var(--muted-2); letter-spacing: .03em; }

  .kpi-strip {
    display: flex; align-items: stretch; padding: 10px 24px;
    border-bottom: 1px solid var(--line-soft); background: rgba(4,18,22,.4); flex: none;
  }
  .kpi { display: flex; flex-direction: column; gap: 2px; padding: 0 18px; min-width: 0; }
  .kpi:first-child { padding-left: 0; }
  .kpi-k { font-size: 9px; color: var(--muted-2); letter-spacing: .05em; white-space: nowrap; }
  .kpi-v { font-size: 19px; line-height: 1.15; color: var(--ink); }
  .kpi-v i { font-style: normal; font-size: 10px; color: var(--muted-2); margin-left: 1px; }
  .kpi.bad .kpi-v { color: var(--amber); }
  .kpi-n { font-size: 8.5px; color: var(--muted-2); white-space: nowrap; }
  .kpi-strip i { width: 1px; background: var(--line-soft); margin: 2px 0; }

  .tabs { padding: 10px 24px 0; flex: none; }
  .content { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 24px 28px; }

  .tc-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 9px; }
  .tc-sub { font-size: 9px; color: var(--muted-2); }

  .table-card { border: 1px solid var(--line-soft); border-radius: var(--radius-lg); overflow: hidden; background: var(--panel); }

  /* ---- splits ---- */
  .split-view { display: grid; grid-template-columns: 1fr 330px; gap: 14px; align-items: start; }
  .grid-head {
    display: grid; grid-template-columns: 82px 50px 40px 74px 56px 56px minmax(96px, 1fr) 56px;
    gap: 8px; padding: 6px 12px; font-size: 8.5px; color: var(--muted-2);
    letter-spacing: .04em; background: rgba(4,18,22,.5); border-bottom: 1px solid var(--line-soft);
  }
  .stat-row {
    display: grid; grid-template-columns: 82px 50px 40px 74px 56px 56px minmax(96px, 1fr) 56px;
    gap: 8px; align-items: center; padding: 6px 12px; font-size: 10.5px; color: var(--ink-2);
    border-bottom: 1px solid rgba(20,54,57,.45);
  }
  .stat-row:last-child { border-bottom: 0; }
  .stat-row:nth-child(odd) { background: rgba(255,255,255,.012); }
  .sr-code { font-size: 10.5px; }
  .sr-squad { font-size: 9px; color: var(--muted-2); }
  .sr-pace { font-size: 11.5px; color: var(--ink); }
  .fast-mark { font-size: 8px; color: var(--amber); margin-left: 5px; }
  .stab { display: flex; align-items: center; gap: 6px; }
  .stab-bar { flex: 1; height: 4px; background: var(--bg-deep); border-radius: 1px; overflow: hidden; min-width: 34px; }
  .stab-bar i { display: block; height: 100%; background: var(--teal-deep); }
  .stab .mono { font-size: 8.5px; color: var(--muted-2); width: 42px; flex: none; }
  .trend { display: flex; align-items: center; }
  .dim { color: var(--muted-2); font-size: 9px; }

  .seg-card { border: 1px solid var(--line-soft); border-radius: var(--radius-lg); background: var(--panel); padding: 12px 14px; }
  .seg-chart { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .seg-row { display: flex; align-items: center; gap: 9px; }
  .seg-label { font-size: 9.5px; width: 28px; flex: none; }
  .seg-bars { flex: 1; display: flex; align-items: flex-end; gap: 3px; height: 72px; }
  .seg-slot { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; position: relative; }
  .seg-bar { display: block; width: 100%; border-radius: 1px 1px 0 0; opacity: .5; min-height: 3px; transition: opacity .14s; }
  .seg-row:hover .seg-bar { opacity: .85; }
  .seg-slot .seg-bar.ghost { background: rgba(255,255,255,.04); opacity: 1; }
  .seg-num { position: absolute; bottom: -11px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 6.5px; color: var(--muted-2); }
  .seg-count { font-size: 8.5px; color: var(--muted-2); width: 30px; text-align: right; flex: none; }
  .seg-axis { display: flex; justify-content: space-between; padding: 18px 0 0 36px; font-size: 7px; color: var(--muted-2); }
  .seg-card .tc-head { margin-bottom: 16px; }

  /* ---- deviation ---- */
  .dev-view { display: grid; grid-template-columns: 1fr 300px; gap: 14px; align-items: start; }
  .dev-view .grid-head,
  .dev-view .stat-row { grid-template-columns: 84px 50px 40px 60px 176px 48px 48px 1fr; }
  .rate-cell { display: flex; align-items: center; gap: 7px; }
  .rate-bar { height: 4px; background: var(--bg-deep); border-radius: 1px; overflow: hidden; flex: 1; min-width: 40px; }
  .rate-bar i { display: block; height: 100%; background: var(--teal-deep); }
  .rate-bar i.bad { background: var(--amber); }
  .rate-cell .mono { font-size: 9px; color: var(--muted); width: 24px; text-align: right; }
  .has { color: var(--amber); }

  .dev-side { display: flex; flex-direction: column; gap: 10px; }
  .dev-summary { border: 1px solid var(--line-soft); border-radius: var(--radius-lg); background: var(--panel); padding: 12px 14px; }
  .ds-rows { display: flex; flex-direction: column; gap: 9px; margin-top: 9px; }
  .ds-row { display: grid; grid-template-columns: 66px 1fr 42px; align-items: center; gap: 8px; }
  .ds-k { font-size: 9.5px; color: var(--muted); }
  .ds-v { font-size: 9px; color: var(--ink-2); text-align: right; }
  .ds-bar { height: 6px; background: var(--bg-deep); border-radius: 1px; overflow: hidden; }
  .ds-bar i { display: block; height: 100%; background: var(--amber); }
  .ds-bar.miss i { background: var(--red); }
  .ds-bar.fs i { background: var(--lilac); }
  .ds-bar.inv i { background: #6b5a2a; }
  .note-card {
    display: flex; gap: 8px; padding: 10px 12px; border-radius: var(--radius);
    background: rgba(233,177,84,.06); border: 1px solid rgba(233,177,84,.22); color: var(--amber-soft);
  }
  .note-card p { font-size: 9.5px; line-height: 1.6; }

  /* ---- attendance ---- */
  .attend-view { border: 1px solid var(--line-soft); border-radius: var(--radius-lg); background: var(--panel); padding: 12px 14px; }
  .att-tools { display: flex; align-items: center; gap: 10px; }
  .att-search { width: 160px; height: 26px; font-size: 10.5px; }
  .att-grid { display: flex; flex-direction: column; }
  .ag-head, .ag-row { display: grid; grid-template-columns: 78px repeat(7, minmax(0, 1fr)) 96px; align-items: center; gap: 3px; padding: 3px 0; }
  .ag-head { border-bottom: 1px solid var(--line-soft); padding-bottom: 6px; margin-bottom: 2px; }
  .ag-boat { font-size: 10px; }
  .ag-col { display: flex; flex-direction: column; align-items: center; gap: 1px; color: var(--muted-2); }
  .ag-col i { font-style: normal; font-size: 9px; color: var(--ink-2); }
  .ag-col b { font-weight: 400; font-size: 7px; color: var(--muted-2); }
  .ag-rate { font-size: 8.5px; color: var(--muted-2); padding-left: 10px; display: flex; align-items: center; gap: 6px; }
  .ag-row { border-bottom: 1px solid rgba(20,54,57,.32); padding: 5px 0; }
  .ag-cell { height: 16px; border-radius: 1px; background: rgba(255,255,255,.03); }
  .ag-cell.planned {
    background: repeating-linear-gradient(45deg, rgba(233,177,84,.13) 0 3px, transparent 3px 6px);
    box-shadow: inset 0 0 0 1px rgba(233,177,84,.14);
  }
  .ag-cell.valid { background: rgba(111,211,216,.42); }
  .ag-cell.pending { background: rgba(233,177,84,.6); }
  .ag-cell.invalid { background: rgba(234,125,109,.45); }
  .rate-none { font-size: 8px; color: var(--muted-2); letter-spacing: .04em; }
  .att-empty { padding: 28px; text-align: center; font-size: 10.5px; color: var(--muted-2); }
  .ag-rate .rate-bar { flex: 1; }
  .ag-rate .mono { font-size: 8.5px; width: 26px; text-align: right; }
  .att-legend { display: flex; align-items: center; gap: 14px; margin-top: 11px; padding-top: 9px; border-top: 1px solid var(--line-soft); font-size: 8.5px; color: var(--muted-2); }
  .att-legend > span { display: inline-flex; align-items: center; gap: 4px; }
  .sw { width: 11px; height: 8px; border-radius: 1px; display: block; background: rgba(255,255,255,.035); }
  .sw.valid { background: rgba(111,211,216,.42); }
  .sw.pending { background: rgba(233,177,84,.6); }
  .sw.invalid { background: rgba(234,125,109,.45); }
  .sw.planned { background: repeating-linear-gradient(45deg, rgba(233,177,84,.35) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1px rgba(233,177,84,.25); }
  .att-note { margin-left: auto; }
</style>
