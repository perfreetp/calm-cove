<script lang="ts">
  import type { Boat, Run, Session } from '../lib/types';
  import { flagLabel, statusLabel } from '../lib/judge';
  import { formatDuration, formatStamp } from '../lib/geo';
  import { laneCenterY } from '../lib/world';
  import { VERDICT_META } from '../lib/ui';
  import Icon from './Icon.svelte';
  import Sparkline from './Sparkline.svelte';

  interface Props {
    run: Run | null;
    boat: Boat | null;
    session: Session | null;
    onClose?: () => void;
    onFocus?: (id: string) => void;
    onReplay?: (id: string) => void;
  }
  let { run, boat, session, onClose, onFocus, onReplay }: Props = $props();

  const splits = $derived(run?.splits ?? []);
  const segs = $derived.by(() => {
    if (!run) return [];
    const out: { from: number; to: number; sec: number; pace: number }[] = [];
    for (let i = 1; i < splits.length; i++) {
      const sec = splits[i].t - splits[i - 1].t;
      const d = splits[i].distance - splits[i - 1].distance;
      out.push({ from: splits[i - 1].mark, to: splits[i].mark, sec, pace: (sec / d) * 500 });
    }
    return out;
  });
  const avgSeg = $derived(segs.length ? segs.reduce((a, s) => a + s.sec, 0) / segs.length : 0);

  const devSeries = $derived.by(() => {
    if (!run || !run.track.length) return [];
    // signed offset from the lane centre, so excursions read left/right of the line
    const centre = laneCenterY(run.lane);
    const stride = Math.max(1, Math.floor(run.track.length / 80));
    const out: number[] = [];
    for (let i = 0; i < run.track.length; i += stride) out.push(run.track[i].y - centre);
    return out;
  });
  const devRange = $derived(Math.max(3.4, ...devSeries.map(Math.abs)));



  const tone = $derived(run ? VERDICT_META[run.status] : null);
</script>

{#if run && boat}
  <div class="insp card fade-in">
    <header class="ins-head">
      <div class="ttl">
        <span class="boat-dot" style={`background:${boat.color}`}></span>
        <div>
          <div class="code mono">{boat.code}</div>
          <div class="sub">{boat.name} · 第 {run.lane} 道</div>
        </div>
      </div>
      <div class="head-actions">
        <span class="badge {tone?.tone}">{tone?.label}</span>
        <button class="x" onclick={() => onClose?.()} aria-label="关闭">
          <Icon name="close" size={13} />
        </button>
      </div>
    </header>

    <div class="hero mono">
      <div class="big">{formatDuration(run.durationSec)}</div>
      <div class="hero-side">
        <div class="hs-row"><span>距离</span><b>{run.distanceM} m</b></div>
        <div class="hs-row"><span>分段时间</span><b>{splits.length} 段</b></div>
      </div>
    </div>

    <div class="pills">
      <div class="pill" class:bad={run.maxDeviation > 3}>
        <span class="k">最大偏航</span>
        <span class="v mono">{run.maxDeviation.toFixed(2)}<i>m</i></span>
      </div>
      <div class="pill" class:bad={run.startOffsetSec < 0}>
        <span class="k">起航</span>
        <span class="v mono">{run.startOffsetSec >= 0 ? '+' : ''}{run.startOffsetSec.toFixed(2)}<i>s</i></span>
      </div>
      <div class="pill">
        <span class="k">平均偏航</span>
        <span class="v mono">{run.meanDeviation.toFixed(2)}<i>m</i></span>
      </div>
    </div>

    <div class="ins-body">
    <section class="block">
      <div class="block-head">
        <span class="eyebrow">偏航曲线</span>
        <span class="axis-note mono">阈值 3 m</span>
      </div>
      <div class="spark-wrap">
        <Sparkline
          values={devSeries.length ? devSeries : [0, 0]}
          width={300}
          height={44}
          color={run.maxDeviation > 3 ? 'var(--amber)' : 'var(--teal)'}
          baseline
        />
        <div class="thresh up" style={`bottom:${50 + (3 / devRange) * 46}%`}><span class="mono">+3 m</span></div>
        <div class="thresh down" style={`bottom:${50 - (3 / devRange) * 46}%`}><span class="mono">−3 m</span></div>
      </div>
    </section>

    <section class="block">
      <div class="block-head">
        <span class="eyebrow">分段时间</span>
        <span class="axis-note mono">每 250 m</span>
      </div>
      <div class="splits">
        {#each segs.slice(0, 6) as s (s.to)}
          {@const fast = s.sec < avgSeg}
          <div class="split-row">
            <span class="mk mono">M{s.from}–{s.to}</span>
            <div class="bar-track">
              <div
                class="bar"
                class:fast
                style={`width:${Math.min(100, (s.sec / (avgSeg * 1.22)) * 100)}%`}
              ></div>
            </div>
            <span class="sec mono">{s.sec.toFixed(1)}</span>
          </div>
        {/each}
        {#if segs.length > 6}
          <div class="more mono">另有 {segs.length - 6} 段 · 展开详情查看</div>
        {/if}
        {#if !segs.length}
          <div class="empty">无分段时间</div>
        {/if}
      </div>
    </section>

    {#if run.detections.length}
      <section class="block">
        <div class="block-head">
          <span class="eyebrow">自动判读</span>
          <span class="flag-count mono">{run.detections.length}</span>
        </div>
        <div class="flags">
          {#each run.detections as d, i (i)}
            <div class="flag" class:serious={d.severity === 'serious'}>
              <span class="ftag">{flagLabel[d.kind]}</span>
              <span class="ftext">{d.detail}</span>
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if run.review}
      <section class="block review">
        <div class="block-head">
          <span class="eyebrow">复核记录</span>
          <span class="axis-note mono">{formatStamp(run.review.at)}</span>
        </div>
        <div class="rv">
          <span class="badge {VERDICT_META[run.review.verdict].tone}">
            {statusLabel[run.review.verdict]}
          </span>
          <span class="rv-by">{run.review.by} · {run.review.reasonCode}</span>
        </div>
        <p class="rv-reason">{run.review.reason}</p>
      </section>
    {/if}

    </div>

    <footer class="ins-foot">
      <button class="btn sm" onclick={() => onReplay?.(run.id)}>
        <Icon name="play" size={11} />
        回放这一趟
      </button>
      <button class="btn sm ghost" onclick={() => onFocus?.(run.id)}>
        <Icon name="target" size={12} />
        定位
      </button>
      <span class="live-note mono">{session?.code ?? ''}</span>
    </footer>
  </div>
{/if}

<style>
  .insp {
    width: 324px;
    max-height: calc(100vh - 200px);
    display: flex;
    flex-direction: column;
    background: rgba(8, 30, 35, 0.97);
    backdrop-filter: blur(14px);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .ins-head,
  .hero,
  .pills,
  .ins-foot {
    flex: none;
  }
  .ins-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }
  .ins-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 12px 10px;
    border-bottom: 1px solid var(--line-soft);
  }
  .ttl {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .boat-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.05);
  }
  .code {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .sub {
    font-size: 10px;
    color: var(--muted);
  }
  .head-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .x {
    color: var(--muted);
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 2px;
  }
  .x:hover {
    color: var(--ink);
    background: var(--panel-3);
  }
  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 12px 14px 10px;
  }
  .big {
    font-size: 27px;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .hero-side {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 10px;
    color: var(--muted);
    align-items: flex-end;
  }
  .hs-row b {
    color: var(--ink-2);
    font-weight: 500;
    margin-left: 6px;
  }
  .pills {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--line-soft);
    border-block: 1px solid var(--line-soft);
  }
  .pill {
    background: rgba(8, 30, 35, 1);
    padding: 7px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .pill.bad {
    background: rgba(233, 177, 84, 0.07);
  }
  .k {
    font-size: 9px;
    color: var(--muted-2);
    letter-spacing: 0.06em;
  }
  .v {
    font-size: 13px;
    color: var(--ink-2);
  }
  .pill.bad .v {
    color: var(--amber);
  }
  .v i {
    font-style: normal;
    font-size: 9px;
    color: var(--muted-2);
    margin-left: 2px;
  }
  .block {
    padding: 10px 14px;
    border-top: 1px solid var(--line-soft);
  }
  .block:first-of-type {
    border-top: 0;
  }
  .block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7px;
  }
  .axis-note {
    font-size: 9px;
    color: var(--muted-2);
  }
  .flag-count {
    font-size: 9px;
    color: var(--amber);
    background: var(--amber-bg);
    padding: 0 5px;
    border-radius: 2px;
  }
  .spark-wrap {
    position: relative;
  }
  .thresh {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed rgba(233, 177, 84, 0.36);
    pointer-events: none;
  }
  .thresh.down {
    border-top-style: dotted;
    border-color: rgba(233, 177, 84, 0.22);
  }
  .thresh span {
    position: absolute;
    right: 0;
    top: -12px;
    font-size: 7.5px;
    color: rgba(233, 177, 84, 0.65);
  }
  .thresh.down span {
    color: rgba(233, 177, 84, 0.4);
  }
  .splits {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .split-row {
    display: grid;
    grid-template-columns: 46px 1fr 34px;
    align-items: center;
    gap: 8px;
  }
  .mk {
    font-size: 9.5px;
    color: var(--muted-2);
  }
  .bar-track {
    height: 8px;
    background: var(--bg-deep);
    border-radius: 1px;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: linear-gradient(90deg, #2f8c94, #5fb9be);
    border-radius: 1px;
  }
  .bar.fast {
    background: linear-gradient(90deg, #b8862f, #e9b154);
  }
  .sec {
    font-size: 10px;
    text-align: right;
    color: var(--ink-2);
  }
  .empty {
    font-size: 10.5px;
    color: var(--muted-2);
  }
  .more {
    font-size: 8.5px;
    color: var(--muted-2);
    padding-top: 2px;
  }
  .flags {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .flag {
    display: flex;
    gap: 7px;
    padding: 6px 8px;
    background: rgba(233, 177, 84, 0.07);
    border-left: 2px solid rgba(233, 177, 84, 0.5);
    border-radius: 1px;
  }
  .flag.serious {
    background: rgba(234, 125, 109, 0.08);
    border-left-color: rgba(234, 125, 109, 0.6);
  }
  .ftag {
    flex: none;
    font-size: 9.5px;
    color: var(--amber);
    letter-spacing: 0.04em;
    padding-top: 1px;
  }
  .flag.serious .ftag {
    color: var(--red);
  }
  .ftext {
    font-size: 10.5px;
    color: var(--ink-2);
    line-height: 1.45;
  }
  .review {
    background: rgba(111, 211, 216, 0.03);
  }
  .rv {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .rv-by {
    font-size: 10px;
    color: var(--muted);
  }
  .rv-reason {
    font-size: 10.5px;
    color: var(--ink-2);
    margin-top: 5px;
    line-height: 1.5;
  }
  .ins-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    border-top: 1px solid var(--line-soft);
    background: rgba(4, 20, 24, 0.5);
  }
  .live-note {
    font-size: 9px;
    color: var(--muted-2);
    letter-spacing: 0.08em;
  }
</style>
