<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { view } from '../lib/viewStore.svelte';
  import Icon from '../components/Icon.svelte';
  import Segmented from '../components/Segmented.svelte';
  import { flagLabel, reasonCodes, statusLabel } from '../lib/judge';
  import { formatDuration, formatStamp, shortDay } from '../lib/geo';
  import { VERDICT_META } from '../lib/ui';
  import { laneCenterY } from '../lib/world';
  import type { Detection, Run } from '../lib/types';

  type FilterKey = 'pending' | 'flagged' | 'all' | 'valid' | 'invalid';
  let filter = $state<FilterKey>('pending');
  let sessionFilter = $state<string>('all');
  let activeRunId = $state<string | null>(null);
  let reasonCode = $state(reasonCodes[0]);
  let reasonNote = $state('');
  let zoomSnap = $state(false);
  let intakeOpen = $state(false);
  let upSession = $state<string>('');
  let upBoat = $state<string>('');
  let upLane = $state(2);
  let upAnomaly = $state<'clean' | 'deviation' | 'miss' | 'start'>('deviation');

  const intakeSession = $derived(
    app.data.sessions.find((x) => x.id === upSession) ??
      [...app.data.sessions].filter((x) => x.status === 'published').sort((a, b) => b.day.localeCompare(a.day))[0] ??
      null
    );
  const intakeBoats = $derived(
    intakeSession
      ? app.data.boats.filter((b) => !intakeSession!.assigned.includes(b.id) || true)
      : app.data.boats
    );

  function seedUploadDefaults() {
    const s = [...app.data.sessions].filter((x) => x.status === 'published').sort((a, b) => b.day.localeCompare(a.day))[0];
    if (s && !upSession) upSession = s.id;
    if (!upBoat) upBoat = app.data.boats[0]?.id ?? '';
    if (s && s.lanes.length && !s.lanes.includes(upLane)) upLane = s.lanes[0];
  }

  function submitUpload() {
    if (!intakeSession || !upBoat) {
      app.notify('请选择科目与艇只', 'warn');
      return;
    }
    const opts: Parameters<typeof app.uploadRun>[0] = {
      sessionId: intakeSession.id,
      boatId: upBoat,
      lane: upLane
    };
    if (upAnomaly === 'deviation') { opts.devAmp = 4.6; opts.secPer500 = 104; }
    if (upAnomaly === 'miss') { opts.missAtMark = Math.min(intakeSession.endMark - 1, intakeSession.startMark + 2); opts.secPer500 = 106; }
    if (upAnomaly === 'start') { opts.startOffsetSec = -0.41; opts.secPer500 = 102; }
    if (upAnomaly === 'clean') { opts.secPer500 = 108; }
    const run = app.uploadRun(opts);
    if (run) {
      activeRunId = run.id;
      filter = 'pending';
      intakeOpen = false;
    }
  }

  const boatOf = (id: string) => app.data.boats.find((b) => b.id === id);
  const sessionOf = (id: string) => app.data.sessions.find((s) => s.id === id);

  const allRuns = $derived([...app.data.runs].sort((a, b) => b.uploadedAt - a.uploadedAt));

  const filtered = $derived.by(() => {
    let list = allRuns;
    if (sessionFilter !== 'all') list = list.filter((r) => r.sessionId === sessionFilter);
    if (filter === 'pending') list = list.filter((r) => r.status === 'pending');
    else if (filter === 'flagged') list = list.filter((r) => r.detections.length > 0);
    else if (filter === 'valid' || filter === 'invalid') list = list.filter((r) => r.status === filter);
    return list;
  });

  const activeRun = $derived(
    allRuns.find((r) => r.id === activeRunId) ?? filtered[0] ?? null
  );
  const activeBoat = $derived(activeRun ? boatOf(activeRun.boatId) : null);
  const activeSession = $derived(activeRun ? sessionOf(activeRun.sessionId) : null);

  const counts = $derived({
    pending: allRuns.filter((r) => r.status === 'pending').length,
    flagged: allRuns.filter((r) => r.detections.length > 0).length,
    valid: allRuns.filter((r) => r.status === 'valid').length,
    invalid: allRuns.filter((r) => r.status === 'invalid').length,
    all: allRuns.length
  });

  const sessionOptions = $derived(
    [...app.data.sessions].sort((a, b) => (b.day + b.startTime).localeCompare(a.day + a.startTime))
  );

  function defaultReason(r: Run): string {
    if (r.detections.some((d) => d.kind === 'falseStart')) return '判定成立 · 抢航';
    if (r.detections.some((d) => d.kind === 'missedBuoy')) return '判定成立 · 漏标';
    if (r.detections.length) return '判定成立 · 偏航超限';
    return reasonCodes[0];
  }

  function pick(r: Run) {
    activeRunId = r.id;
    reasonNote = r.review?.reason ?? '';
    reasonCode = r.review?.reasonCode ?? defaultReason(r);
    zoomSnap = false;
  }

  function decide(verdict: 'valid' | 'invalid') {
    if (!activeRun) return;
    if (!reasonNote.trim()) {
      app.notify('请填写复核原因', 'warn');
      return;
    }
    app.reviewRun(activeRun.id, verdict, reasonCode, reasonNote.trim());
    reasonNote = '';
  }

  const bulkIds = $derived(filtered.filter((r) => r.status === 'pending').map((r) => r.id));

  const segs = $derived.by(() => {
    if (!activeRun) return [];
    const sp = activeRun.splits;
    const out: { from: number; to: number; sec: number; pace: number }[] = [];
    for (let i = 1; i < sp.length; i++) {
      const sec = sp[i].t - sp[i - 1].t;
      out.push({
        from: sp[i - 1].mark,
        to: sp[i].mark,
        sec,
        pace: (sec / (sp[i].distance - sp[i - 1].distance)) * 500
      });
    }
    return out;
  });
  const avgSeg = $derived(segs.length ? segs.reduce((a, s) => a + s.sec, 0) / segs.length : 0);

  const devSeries = $derived.by(() => {
    if (!activeRun) return [];
    // lane centre is fixed geometry — read it from the course, not from the track mean
    const centre = laneCenterY(activeRun.lane);
    const t = activeRun.track;
    const stride = Math.max(1, Math.floor(t.length / 110));
    const out: number[] = [];
    for (let i = 0; i < t.length; i += stride) out.push(Number((t[i].y - centre).toFixed(2)));
    return out;
  });

  const devPath = $derived.by(() => {
    const W = 100;
    const H = 42;
    const max = Math.max(4, ...devSeries.map(Math.abs));
    return devSeries
      .map((v, i) => {
        const x = (i / Math.max(1, devSeries.length - 1)) * W;
        const y = H / 2 - (v / max) * (H / 2 - 2);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
  });
  const devMax = $derived(Math.max(4, ...devSeries.map(Math.abs)));

  const kindMeta: Record<Detection['kind'], { label: string; tone: string }> = {
    deviation: { label: '偏航', tone: 'deviation' },
    falseStart: { label: '抢航', tone: 'falseStart' },
    missedBuoy: { label: '漏标', tone: 'missedBuoy' }
  };

  function goMap() {
    if (!activeRun) return;
    view.select(activeRun.id);
    view.role = 'viewer';
    view.page = 'overview';
  }
</script>

<div class="page">
  <header class="ph">
    <div>
      <h1>判读复核</h1>
      <p class="ph-sub">
        自动判读偏航 &gt; 3 m、抢航与漏标 · 异常趟次标黄并附截图 · 复核为有效或作废并记录原因
      </p>
    </div>
    <div class="ph-actions">
      <select class="ses-select" bind:value={sessionFilter} onchange={() => (activeRunId = null)}>
        <option value="all">全部科目</option>
        {#each sessionOptions as s (s.id)}
          <option value={s.id}>{s.code} · {s.subject}</option>
        {/each}
      </select>
      <button class="btn sm" class:on={intakeOpen} onclick={() => { intakeOpen = !intakeOpen; seedUploadDefaults(); }}>
        <Icon name="upload" size={11} />模拟上传
      </button>
      <div class="bulk">
        <span class="bulk-n mono">{bulkIds.length} 待处理</span>
        <button class="btn sm" disabled={!bulkIds.length} onclick={() => app.reviewAllPending('valid', bulkIds)}>
          <Icon name="check" size={11} />批量有效
        </button>
        <button class="btn sm danger" disabled={!bulkIds.length} onclick={() => app.reviewAllPending('invalid', bulkIds)}>
          批量作废
        </button>
      </div>
    </div>
  </header>

  <div class="filter-bar">
    <Segmented
      value={filter}
      options={[
        { value: 'pending', label: '待复核', count: counts.pending },
        { value: 'flagged', label: '全部异常', count: counts.flagged },
        { value: 'valid', label: '有效', count: counts.valid },
        { value: 'invalid', label: '作废', count: counts.invalid },
        { value: 'all', label: '全部', count: counts.all }
      ]}
      onchange={(v) => { filter = v; activeRunId = null; }}
    />
    <span class="hint mono">按上传时间倒序 · 点击趟次查看判读截图</span>
  </div>

  {#if intakeOpen}
    <div class="intake">
      <div class="ik-head">
        <Icon name="upload" size={12} />
        <b>学员艇上传</b>
        <span>每趟上传轨迹与分段时间，提交后立即自动判读</span>
        <button class="ik-x" onclick={() => (intakeOpen = false)} aria-label="关闭"><Icon name="close" size={11} /></button>
      </div>
      <div class="ik-grid">
        <label class="field">
          <span>训练科目</span>
          <select bind:value={upSession} onchange={() => { const ss = app.data.sessions.find((x) => x.id === upSession); if (ss && !ss.lanes.includes(upLane)) upLane = ss.lanes[0]; }}>
            {#each [...app.data.sessions].filter((x) => x.status !== 'draft').sort((a, b) => b.day.localeCompare(a.day)) as ss (ss.id)}
              <option value={ss.id}>{ss.code} · {ss.subject}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>艇只</span>
          <select bind:value={upBoat}>
            {#each app.data.boats as b (b.id)}
              <option value={b.id}>{b.code} · {b.athletes.join('/')}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>航道</span>
          <select bind:value={upLane}>
            {#each (intakeSession?.lanes ?? [1, 2, 3, 4, 5, 6]) as l (l)}
              <option value={l}>第 {l} 道</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span>轨迹特征</span>
          <select bind:value={upAnomaly}>
            <option value="clean">正常趟 · 无异常</option>
            <option value="deviation">偏航超 3 m</option>
            <option value="miss">漏标（划过相邻航道）</option>
            <option value="start">抢航（提前 0.41 s）</option>
          </select>
        </label>
        <button class="btn primary ik-go" onclick={submitUpload}>
          <Icon name="upload" size={12} />上传并判读
        </button>
      </div>
    </div>
  {/if}

  <div class="body">
    <!-- ---------- list ---------- -->
    <div class="run-list">
      {#each filtered as r (r.id)}
        {@const boat = boatOf(r.boatId)}
        {@const ses = sessionOf(r.sessionId)}
        {@const flagged = r.detections.length > 0}
        <button class="run-item" class:on={activeRun?.id === r.id} class:flagged onclick={() => pick(r)}>
          <span class="ri-rail" class:pending={r.status === 'pending'} class:invalid={r.status === 'invalid'}></span>
          <div class="ri-top">
            <span class="ri-lane mono">L{r.lane}</span>
            <span class="ri-code mono">{boat?.code}</span>
            <span class="badge {VERDICT_META[r.status].tone}">{statusLabel[r.status]}</span>
            <span class="ri-time mono">{formatStamp(r.uploadedAt)}</span>
          </div>
          <div class="ri-mid">
            <span class="ri-ses mono">{ses?.code}</span>
            <span class="ri-dur mono">{formatDuration(r.durationSec)}</span>
            <span class="ri-dev mono" class:bad={r.maxDeviation > 3}>偏 {r.maxDeviation.toFixed(1)}m</span>
          </div>
          {#if flagged}
            <div class="ri-flags">
              {#each [...new Set(r.detections.map((d) => d.kind))] as k (k)}
                <span class="ftag {kindMeta[k].tone}">{flagLabel[k]}</span>
              {/each}
              <span class="ri-snap-tag mono">截图</span>
            </div>
          {/if}
        </button>
      {/each}
      {#if !filtered.length}
        <div class="empty">该筛选下没有趟次</div>
      {/if}
    </div>

    <!-- ---------- detail ---------- -->
    {#if activeRun && activeBoat}
      <div class="detail">
        <div class="detail-head">
          <div class="dh-left">
            <span class="dh-dot" style={`background:${activeBoat.color}`}></span>
            <div>
              <div class="dh-code mono">{activeBoat.code}</div>
              <div class="dh-sub">
                {activeBoat.name} · {activeBoat.athletes.join(' / ')} · 第 {activeRun.lane} 道
              </div>
            </div>
          </div>
          <div class="dh-right">
            <span class="badge {VERDICT_META[activeRun.status].tone}">{statusLabel[activeRun.status]}</span>
            <button class="btn sm ghost" onclick={goMap}>
              <Icon name="target" size={11} />地图定位
            </button>
          </div>
        </div>

        <div class="detail-meta mono">
          <span>{activeSession?.code}</span>
          <span class="sep">·</span>
          <span>{shortDay(activeSession?.day ?? '')}</span>
          <span class="sep">·</span>
          <span>M{activeRun.startMark}–M{activeRun.endMark}</span>
          <span class="sep">·</span>
          <span>{activeRun.distanceM} m</span>
          <span class="sep">·</span>
          <span>{formatDuration(activeRun.durationSec)}</span>
        </div>

        <div class="detail-grid">
          <div class="col-visual">
          <!-- snapshot -->
            <section class="sec">
              <div class="sec-head">
                <span class="eyebrow">判读截图</span>
                <button class="mini-btn" onclick={() => (zoomSnap = !zoomSnap)}>
                  {zoomSnap ? '原始比例' : '放大'}
                </button>
              </div>
              <div class="snap" class:zoom={zoomSnap}>
                <img src={activeRun.snapshot} alt={`${activeBoat.code} 判读截图`} />
                <div class="snap-badge mono">AUTO-JUDGE</div>
              </div>
            </section>

            <!-- metrics -->
            <div class="metrics">
              <div class="m" class:bad={activeRun.maxDeviation > 3}>
                <span class="mk">最大偏航</span>
                <span class="mv mono">{activeRun.maxDeviation.toFixed(2)}<i>m</i></span>
                <span class="mt">阈值 3.00</span>
              </div>
              <div class="m" class:bad={activeRun.startOffsetSec < 0}>
                <span class="mk">起航偏移</span>
                <span class="mv mono">{activeRun.startOffsetSec >= 0 ? '+' : ''}{activeRun.startOffsetSec.toFixed(2)}<i>s</i></span>
                <span class="mt">{activeRun.startOffsetSec < 0 ? '早于发令' : '正常'}</span>
              </div>
              <div class="m" class:bad={activeRun.meanDeviation > 2}>
                <span class="mk">平均偏航</span>
                <span class="mv mono">{activeRun.meanDeviation.toFixed(2)}<i>m</i></span>
                <span class="mt">全程均值</span>
              </div>
            </div>

            <!-- deviation profile -->
            <section class="sec">
              <div class="sec-head">
                <span class="eyebrow">偏航剖面</span>
                <span class="sec-note mono">纵轴 ±{devMax.toFixed(1)} m</span>
              </div>
              <div class="devchart">
                <svg viewBox="0 0 100 42" preserveAspectRatio="none">
                  <line x1="0" y1="21" x2="100" y2="21" stroke="#2c7d84" stroke-width="0.35" stroke-dasharray="1.4 1" />
                  {#if devMax > 3}
                    {@const y3 = 21 - (3 / devMax) * 19}
                    <line x1="0" y1={21 - y3 + y3} x2="100" y2={21 - y3 + y3} stroke="#e9b154" stroke-width="0.3" stroke-opacity="0.35" stroke-dasharray="0.8 0.8" />
                    <line x1="0" y1={21 + (3 / devMax) * 19} x2="100" y2={21 + (3 / devMax) * 19} stroke="#e9b154" stroke-width="0.3" stroke-opacity="0.35" stroke-dasharray="0.8 0.8" />
                  {/if}
                  <path d={devPath} fill="none" stroke={activeRun.maxDeviation > 3 ? '#e9b154' : '#6fd3d8'} stroke-width="0.7" vector-effect="non-scaling-stroke" />
                </svg>
                <div class="chart-axis mono">
                  <span>M{activeRun.startMark}</span>
                  <span>M{Math.round((activeRun.startMark + activeRun.endMark) / 2)}</span>
                  <span>M{activeRun.endMark}</span>
                </div>
              </div>
            </section>

            <!-- splits -->
            <section class="sec">
              <div class="sec-head">
                <span class="eyebrow">分段时间</span>
                <span class="sec-note mono">每 250 m</span>
              </div>
              <div class="split-table">
                <div class="st-head mono">
                  <span>区段</span><span>用时</span><span>配速 /500m</span><span></span>
                </div>
                {#each segs as s (s.to)}
                  {@const fast = s.sec < avgSeg - 0.3}
                  {@const slow = s.sec > avgSeg + 0.3}
                  <div class="st-row">
                    <span class="mono">M{s.from}–{s.to}</span>
                    <span class="mono">{s.sec.toFixed(1)}s</span>
                    <span class="mono">{s.pace.toFixed(1)}</span>
                    <span class="st-bar">
                      <i class:fast class:slow style={`width:${Math.min(100, (s.sec / (avgSeg * 1.25)) * 100)}%`}></i>
                    </span>
                  </div>
                {/each}
              </div>
            </section>

          </div>
          <div class="col-side">
            <!-- detections -->
            <section class="sec">
              <div class="sec-head">
                <span class="eyebrow">自动判读</span>
                <span class="sec-note mono {activeRun.detections.length ? 'warn' : 'ok'}">
                  {activeRun.detections.length ? `${activeRun.detections.length} 项异常` : '全部通过'}
                </span>
              </div>
              {#if activeRun.detections.length}
                <div class="det-list">
                  {#each activeRun.detections as d, i (i)}
                    <div class="det" class:serious={d.severity === 'serious'}>
                      <span class="det-kind">{flagLabel[d.kind]}</span>
                      <div class="det-body">
                        <span class="det-text">{d.detail}</span>
                        <span class="det-src mono">自动判读 · 规则 {d.kind === 'deviation' ? 'DEV>3m' : d.kind === 'falseStart' ? 'START<0' : 'MARK±6.75m'}</span>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else}
                <div class="det-ok">
                  <Icon name="check" size={12} />
                  未触发偏航、抢航或漏标规则
                </div>
              {/if}
            </section>
            <!-- review -->
            <section class="sec">
              <div class="sec-head">
                <span class="eyebrow">复核结论</span>
                {#if activeRun.review}
                  <span class="sec-note mono">{activeRun.review.by} · {formatStamp(activeRun.review.at)}</span>
                {/if}
              </div>

              {#if activeRun.review}
                <div class="review-done">
                  <div class="rd-top">
                    <span class="badge {VERDICT_META[activeRun.review.verdict].tone}">
                      {statusLabel[activeRun.review.verdict]}
                    </span>
                    <span class="rd-code">{activeRun.review.reasonCode}</span>
                  </div>
                  <p class="rd-reason">{activeRun.review.reason}</p>
                  <div class="rd-by mono">{activeRun.review.by} · {formatStamp(activeRun.review.at)}</div>
                </div>
                <button class="reopen" onclick={() => { activeRunId = activeRun!.id; reasonNote = activeRun!.review!.reason; reasonCode = activeRun!.review!.reasonCode; }}>
                  重新复核
                </button>
              {:else}
                <div class="review-form">
                  <label class="field">
                    <span>原因分类</span>
                    <select bind:value={reasonCode}>
                      {#each reasonCodes as c (c)}
                        <option value={c}>{c}</option>
                      {/each}
                    </select>
                  </label>
                  <label class="field">
                    <span>复核说明 <em>必填，将写入操作记录</em></span>
                    <textarea
                      rows="3"
                      bind:value={reasonNote}
                      placeholder="例如：艇载 GPS 在 M5 附近跳变，经与水上裁判对讲确认未越线，判为设备漂移。"
                    ></textarea>
                  </label>
                  <div class="review-actions">
                    <button class="btn valid-btn" onclick={() => decide('valid')}>
                      <Icon name="check" size={12} />判为有效
                    </button>
                    <button class="btn danger" onclick={() => decide('invalid')}>
                      <Icon name="close" size={12} />判为作废
                    </button>
                    <span class="ra-actor mono">复核人 · {app.actor.name}</span>
                  </div>
                </div>
              {/if}
            </section>
          </div>
        </div>
      </div>
    {:else}
      <div class="no-sel">
        <Icon name="review" size={26} />
        <p>没有待处理的趟次</p>
        <span>切换到「全部」或「全部异常」查看已复核记录</span>
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
  .ph-sub { margin-top: 5px; font-size: 11px; color: var(--muted); max-width: 620px; }
  .ph-actions { display: flex; align-items: center; gap: 10px; flex: none; }
  .ses-select { width: 210px; height: 29px; font-size: 11px; }
  .bulk { display: flex; align-items: center; gap: 5px; padding-left: 10px; border-left: 1px solid var(--line-soft); }
  .bulk-n { font-size: 9.5px; color: var(--amber); margin-right: 3px; }

  .intake {
    flex: none; margin: 10px 24px 0; border: 1px solid rgba(111,211,216,.26);
    border-radius: var(--radius); background: rgba(111,211,216,.045); padding: 9px 12px 11px;
  }
  .ik-head { display: flex; align-items: center; gap: 7px; color: var(--teal); margin-bottom: 8px; }
  .ik-head b { font-size: 11px; font-weight: 500; }
  .ik-head span { font-size: 9.5px; color: var(--muted); }
  .ik-x { margin-left: auto; color: var(--muted-2); width: 18px; height: 18px; display: grid; place-items: center; }
  .ik-x:hover { color: var(--ink); }
  .ik-grid { display: grid; grid-template-columns: 1.5fr 1.4fr 0.8fr 1.2fr auto; gap: 8px; align-items: end; }
  .ik-go { height: 32px; }

  .filter-bar {
    display: flex; align-items: center; gap: 14px; padding: 9px 24px;
    border-bottom: 1px solid var(--line-soft); flex: none; background: rgba(4,18,22,.4);
  }
  .hint { font-size: 9px; color: var(--muted-2); letter-spacing: .03em; }

  .body { flex: 1; min-height: 0; display: grid; grid-template-columns: 322px 1fr; overflow: hidden; }
  .btn.on { border-color: rgba(111,211,216,.5); color: var(--teal); background: rgba(111,211,216,.1); }

  .run-list { overflow-y: auto; border-right: 1px solid var(--line-soft); padding: 10px 8px 20px 10px; display: flex; flex-direction: column; gap: 4px; }
  .run-item {
    position: relative; text-align: left; padding: 9px 11px 9px 13px;
    border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--panel);
    transition: border-color .13s, background .13s; overflow: hidden;
  }
  .run-item:hover { border-color: var(--line); background: var(--panel-2); }
  .run-item.on { border-color: rgba(233,177,84,.44); background: rgba(233,177,84,.055); }
  .ri-rail { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--teal); opacity: .55; }
  .ri-rail.pending { background: var(--amber); opacity: 1; }
  .ri-rail.invalid { background: var(--red); opacity: .8; }
  .ri-top { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .ri-lane { font-size: 9px; color: var(--muted-2); }
  .ri-code { font-size: 11px; color: var(--ink); }
  .ri-time { margin-left: auto; font-size: 8.5px; color: var(--muted-2); }
  .ri-mid { display: flex; align-items: baseline; gap: 9px; font-size: 9.5px; color: var(--muted); }
  .ri-ses { color: var(--teal); font-size: 9px; }
  .ri-dev { color: var(--muted); }
  .ri-dev.bad { color: var(--amber); }
  .ri-flags { display: flex; align-items: center; gap: 4px; margin-top: 5px; }
  .ftag {
    font-size: 8.5px; padding: 1px 5px; border-radius: 2px; letter-spacing: .03em;
    background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(233,177,84,.28);
  }
  .ftag.missedBuoy { background: var(--red-bg); color: var(--red); border-color: rgba(234,125,109,.3); }
  .ri-snap-tag { font-size: 8px; color: var(--muted-2); margin-left: auto; }
  .empty { padding: 34px 16px; text-align: center; font-size: 11px; color: var(--muted-2); }

  .detail { display: flex; flex-direction: column; min-height: 0; }
  .detail-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 22px 10px; }
  .dh-left { display: flex; align-items: center; gap: 9px; }
  .dh-dot { width: 7px; height: 7px; border-radius: 50%; }
  .dh-code { font-size: 13.5px; color: var(--ink); }
  .dh-sub { font-size: 10px; color: var(--muted); margin-top: 1px; }
  .dh-right { display: flex; align-items: center; gap: 8px; }
  .detail-meta { display: flex; align-items: center; gap: 7px; padding: 0 22px 11px; font-size: 9.5px; color: var(--muted-2); }
  .sep { color: #34565b; }
  .detail-grid {
    flex: 1; min-height: 0; overflow-y: auto;
    display: grid; grid-template-columns: minmax(0, 1fr) 348px; gap: 18px;
    padding: 0 22px 26px; align-content: start;
  }
  .col-visual { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .col-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }

  .sec { display: flex; flex-direction: column; gap: 7px; }
  .sec-head { display: flex; align-items: baseline; justify-content: space-between; }
  .sec-note { font-size: 9px; color: var(--muted-2); }
  .sec-note.warn { color: var(--amber); }
  .sec-note.ok { color: var(--green); }
  .mini-btn { font-size: 9px; color: var(--muted); padding: 2px 7px; border-radius: 2px; border: 1px solid var(--line-soft); }
  .mini-btn:hover { color: var(--ink-2); border-color: var(--line); }

  .snap {
    position: relative; border: 1px solid var(--line); border-radius: var(--radius);
    overflow: hidden; background: #04161b; width: 100%;
  }
  .snap img { display: block; width: 100%; height: auto; max-width: 100%; transition: transform .3s; }
  .snap.zoom img { transform: scale(1.8); transform-origin: 45% 42%; }
  .snap-badge {
    position: absolute; bottom: 6px; right: 7px; font-size: 7px; letter-spacing: .17em;
    color: rgba(233,177,84,.7); padding: 2px 5px; border: 1px solid rgba(233,177,84,.24);
    border-radius: 1px; background: rgba(4,20,24,.72);
  }

  .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line-soft); border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
  .m { background: var(--panel); padding: 8px 11px; display: flex; flex-direction: column; gap: 2px; }
  .m.bad { background: rgba(233,177,84,.07); }
  .mk { font-size: 8.5px; color: var(--muted-2); letter-spacing: .05em; }
  .mv { font-size: 15px; color: var(--ink-2); line-height: 1.2; }
  .m.bad .mv { color: var(--amber); }
  .mv i { font-style: normal; font-size: 9px; color: var(--muted-2); margin-left: 2px; }
  .mt { font-size: 8px; color: var(--muted-2); }

  .devchart { background: var(--panel); border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 8px 10px 5px; }
  .devchart svg { display: block; width: 100%; height: 64px; }
  .chart-axis { display: flex; justify-content: space-between; font-size: 8px; color: var(--muted-2); padding: 0 1px; }

  .split-table { border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
  .st-head, .st-row { display: grid; grid-template-columns: 88px 68px 84px 1fr; align-items: center; gap: 8px; padding: 4px 10px; }
  .st-head { background: rgba(4,18,22,.5); font-size: 8px; color: var(--muted-2); letter-spacing: .06em; border-bottom: 1px solid var(--line-soft); }
  .st-row { font-size: 10px; color: var(--ink-2); border-bottom: 1px solid rgba(20,54,57,.5); }
  .st-row:last-child { border-bottom: 0; }
  .st-row:nth-child(odd) { background: rgba(255,255,255,.012); }
  .st-bar { height: 5px; background: var(--bg-deep); border-radius: 1px; overflow: hidden; }
  .st-bar i { display: block; height: 100%; background: #2f8c94; }
  .st-bar i.fast { background: #b8862f; }
  .st-bar i.slow { background: #8a4a48; }

  .det-list { display: flex; flex-direction: column; gap: 5px; }
  .det { display: flex; gap: 9px; padding: 8px 10px; background: rgba(233,177,84,.06); border-left: 2px solid rgba(233,177,84,.5); border-radius: 1px; }
  .det.serious { background: rgba(234,125,109,.07); border-left-color: rgba(234,125,109,.6); }
  .det-kind { flex: none; font-size: 10px; color: var(--amber); width: 26px; }
  .det.serious .det-kind { color: var(--red); }
  .det-body { display: flex; flex-direction: column; gap: 2px; }
  .det-text { font-size: 10.5px; color: var(--ink-2); line-height: 1.45; }
  .det-src { font-size: 8px; color: var(--muted-2); letter-spacing: .03em; }
  .det-ok { display: flex; align-items: center; gap: 6px; font-size: 10.5px; color: var(--green); padding: 7px 10px; background: var(--green-bg); border-radius: 2px; }

  .review-form {
    display: flex; flex-direction: column; gap: 9px; padding: 12px;
    background: rgba(4,20,24,.55); border: 1px solid var(--line); border-radius: var(--radius);
    position: sticky; top: 0;
  }
  .field em { font-style: normal; font-size: 8.5px; color: var(--muted-2); float: right; text-transform: none; letter-spacing: 0; font-family: var(--font); }
  .review-actions { display: flex; align-items: center; gap: 6px; }
  .valid-btn { border-color: rgba(130,217,171,.36); color: var(--green); }
  .valid-btn:hover { background: var(--green-bg); border-color: rgba(130,217,171,.6); }
  .ra-actor { margin-left: auto; font-size: 8.5px; color: var(--muted-2); }

  .review-done { padding: 10px 11px; background: rgba(111,211,216,.04); border: 1px solid var(--line); border-radius: var(--radius); }
  .rd-top { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .rd-code { font-size: 10px; color: var(--ink-2); }
  .rd-reason { font-size: 10.5px; color: var(--ink-2); line-height: 1.55; }
  .rd-by { font-size: 8.5px; color: var(--muted-2); margin-top: 5px; }
  .reopen { align-self: flex-start; font-size: 9.5px; color: var(--teal); padding: 3px 8px; border-radius: 2px; border: 1px solid var(--line); }
  .reopen:hover { background: rgba(111,211,216,.07); }

  .no-sel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: var(--muted-2); }
  .no-sel p { font-size: 12.5px; color: var(--muted); }
  .no-sel span { font-size: 10px; }
</style>
