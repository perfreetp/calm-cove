<script lang="ts">
  import { select } from 'd3-selection';
  import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
  import type { Boat, Dock, LayerState, Run, TrackPoint, World } from '../lib/types';
  import { untrack } from 'svelte';
  import { catmullRomPath, clamp } from '../lib/geo';
  import { trackGeometry, positionAt } from '../lib/trackRender';
  import { LANE_WIDTH, MARK_STEP } from '../lib/world';
  import { flagLabel } from '../lib/judge';

  interface Props {
    world: World;
    runs: Run[];
    boats: Boat[];
    layers: LayerState;
    selected: string[];
    hovered?: string | null;
    highlightLanes?: number[];
    markRange?: { from: number; to: number } | null;
    playback?: { runId: string; t: number } | null;
    onSelect?: (id: string | null, additive: boolean) => void;
    onHover?: (id: string | null) => void;
    onapi?: (api: {
      focusRun: (id: string) => void;
      focusLane: (no: number) => void;
      focusAll: () => void;
    }) => void;
  }

  let {
    world,
    runs,
    boats,
    layers,
    selected,
    hovered = null,
    highlightLanes = [],
    markRange = null,
    playback = null,
    onSelect,
    onHover,
    onapi
  }: Props = $props();

  let wrapEl = $state<HTMLDivElement | null>(null);
  let svgEl = $state<SVGSVGElement | null>(null);
  let worldG = $state<SVGGElement | null>(null);
  let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> | null = null;

  const view = $state({ tx: 0, ty: 0, k: 1, w: 1000, h: 620, N: 6000, fitted: false });
  let kFit = 0.2;

  // reservoir geometry is static for the whole session — capture once
  // svelte-ignore state_referenced_locally
  const W = world;
  const shorePath = catmullRomPath(W.shoreline, true, 0.42);
  const islandPaths = W.islands.map((i) => catmullRomPath(i, true, 0.4));
  const bandPaths = W.depthBands.map((b) => ({ depth: b.depth, color: b.color, d: catmullRomPath(b.points, true, 0.4) }));
  const contourPaths = W.contours.map((c) => catmullRomPath(c, true, 0.4));
  const dockPaths = (w: Dock) => catmullRomPath(w.points, true, 0.12);

  const laneTickXs = Array.from({ length: W.markCount }, (_, i) => W.startX + i * MARK_STEP);
  const boatById = $derived(new Map(boats.map((b) => [b.id, b])));
  const selectedSet = $derived(new Set(selected));

  // N = scale denominator. Detail bands follow the 1:2000 → 1:200 range.
  const lodRaw = $derived(
    view.N > 4400 ? 'overview' : view.N >= 1900 ? 'far' : view.N >= 1000 ? 'mid' : view.N >= 480 ? 'near' : 'close'
  );
  // replaying a single run always wants the detailed geometry, whatever the zoom
  const lod = $derived(playback ? (lodRaw === 'overview' || lodRaw === 'far' ? 'near' : lodRaw) : lodRaw);
  const lodText = $derived(
    lod === 'overview'
      ? '全水域 · 概览'
      : lod === 'far'
        ? '远景 · 仅航道与浮标'
        : lod === 'mid'
          ? '中景 · 航道编号'
          : lod === 'near'
            ? '近景 · 艇位与编号'
            : '细部 · 分段时间与判读'
  );
  const scaleLabel = $derived(
    `1 : ${view.N >= 1000 ? Math.round(view.N).toLocaleString('en-US') : Math.round(view.N)}`
  );

  /* ---- what each detail band draws ----
     overview : water + lanes + buoys only (per the brief)
     far      : same, slightly richer (lane numbers)
     mid      : + buoy numbers, dock labels
     near     : + boat markers & numbers, detection pins
     close    : + per-run codes, split dots, landmark names, gates */
  // the labels layer switches typography off wholesale, independent of zoom
  const showLaneNums = $derived(layers.labels && lod !== 'overview');
  const showBuoyNums = $derived(layers.labels && (lod === 'mid' || lod === 'near' || lod === 'close'));
  const showFacilityLabels = $derived(layers.labels && (lod === 'mid' || lod === 'near' || lod === 'close'));
  const showGateLabels = $derived(layers.labels && lod === 'close');
  const showTickLabels = $derived(layers.labels && lod === 'close');
  const showMarkers = $derived(lod === 'near' || lod === 'close');
  const showGates = $derived(lod === 'near' || lod === 'close');
  const showLandmarks = $derived(layers.labels && lod === 'close');
  const showRunCodes = $derived(layers.labels && lod === 'close');

  const laneY = new Map(W.lanes.map((l) => [l.no, l.centerY]));
  const topOfLanes = W.lanes[0].top;
  const bottomOfLanes = W.lanes[W.lanes.length - 1].bottom;

  interface Marker {
    run: Run;
    boat: Boat;
    x: number;
    y: number;
    sx: number;
    sy: number;
    label: string;
    flagged: boolean;
  }

  const markers = $derived.by(() => {
    if (!layers.tracks) return [] as Marker[];
    const list: Marker[] = [];
    for (const run of runs) {
      const boat = boatById.get(run.boatId);
      const y = laneY.get(run.lane);
      if (!boat || y === undefined) continue;
      const xw = world.startX + run.startMark * MARK_STEP;
      list.push({
        run,
        boat,
        x: xw,
        y,
        sx: xw * view.k + view.tx,
        sy: y * view.k + view.ty,
        label: boat.code.split('-')[1],
        flagged: run.detections.length > 0
      });
    }
    return list;
  });

  const detectionPins = $derived.by(() => {
    if (!showMarkers || !layers.tracks) return [];
    const out: { run: Run; boat: Boat; sx: number; sy: number; text: string; key: string }[] = [];
    for (const run of runs) {
      const boat = boatById.get(run.boatId);
      if (!boat) continue;
      for (const d of run.detections) {
        if (!d.at) continue;
        const sx = d.at.x * view.k + view.tx;
        const sy = d.at.y * view.k + view.ty;
        if (sx < -60 || sy < -40 || sx > view.w + 60 || sy > view.h + 40) continue;
        out.push({
          run,
          boat,
          sx,
          sy,
          text: `${boat.code} ${flagLabel[d.kind]}`,
          key: `${run.id}-${d.kind}`
        });
      }
    }
    return out.slice(0, 55);
  });

  const playbackPos = $derived.by(() => {
    if (!playback || !layers.tracks) return null;
    const run = runs.find((r) => r.id === playback.runId);
    if (!run) return null;
    const p = positionAt(run, playback.t);
    const lane = laneY.get(run.lane);
    return { x: p.x, y: lane !== undefined ? p.y : p.y, sx: p.x * view.k + view.tx, sy: p.y * view.k + view.ty };
  });

  /* ---------- hit testing over decimated samples ---------- */
  const hitSamples = new Map<string, TrackPoint[]>();
  function samplesOf(run: Run): TrackPoint[] {
    let s = hitSamples.get(run.id);
    if (!s) {
      const stride = Math.max(1, Math.floor(run.track.length / 130));
      s = [];
      for (let i = 0; i < run.track.length; i += stride) s.push(run.track[i]);
      hitSamples.set(run.id, s);
    }
    return s;
  }

  function nearestRun(wx: number, wy: number): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    const list = runs;
    for (let r = 0; r < list.length; r++) {
      const pts = samplesOf(list[r]);
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - wx;
        const dy = pts[i].y - wy;
        const d = dx * dx + dy * dy;
        if (!best || d < best.dist) best = { id: list[r].id, dist: d };
        if (d < 1) return { id: list[r].id, dist: 0 };
      }
    }
    return best ? { id: best.id, dist: Math.sqrt(best.dist) } : null;
  }

  /* ---------- d3 zoom ---------- */
  function applyTransform() {
    if (worldG) worldG.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.k})`);
  }

  function syncFromTransform(t: { x: number; y: number; k: number }) {
    view.tx = t.x;
    view.ty = t.y;
    view.k = t.k;
    view.N = 3779 / t.k;
    applyTransform();
    // 1/k in a CSS variable keeps labels, buoys and hairlines at a constant
    // on-screen size without re-rendering any SVG node during pan/zoom.
    if (wrapEl) wrapEl.style.setProperty('--inv', String(1 / t.k));
  }

  function measure() {
    if (!wrapEl) return;
    const r = wrapEl.getBoundingClientRect();
    view.w = Math.max(320, Math.round(r.width));
    view.h = Math.max(280, Math.round(r.height));
  }

  function fit() {
    if (!svgEl || !zoomBehavior) return;
    untrack(measure);
    const pad = 36;
    kFit = Math.min((view.w - pad * 2) / world.bounds.w, (view.h - pad * 2) / world.bounds.h);
    zoomBehavior.scaleExtent([kFit, 18.9]);
    zoomBehavior.extent([
      [0, 0],
      [view.w, view.h]
    ]);
    const tx = (view.w - world.bounds.w * kFit) / 2;
    const ty = (view.h - world.bounds.h * kFit) / 2;
    select(svgEl).call(zoomBehavior.transform as never, zoomIdentity.translate(tx, ty).scale(kFit) as never);
    view.fitted = true;
  }

  function zoomBy(factor: number) {
    if (!svgEl || !zoomBehavior) return;
    select(svgEl).call(zoomBehavior.scaleBy as never, factor as never);
  }

  function focusBox(x0: number, y0: number, x1: number, y1: number) {
    if (!svgEl || !zoomBehavior) return;
    const bw = Math.max(30, x1 - x0);
    const bh = Math.max(30, y1 - y0);
    const k = clamp(Math.min((view.w - 140) / bw, (view.h - 140) / bh), kFit, 18.9);
    const tx = view.w / 2 - ((x0 + x1) / 2) * k;
    const ty = view.h / 2 - ((y0 + y1) / 2) * k;
    select(svgEl).call(zoomBehavior.transform as never, zoomIdentity.translate(tx, ty).scale(k) as never);
  }

  function focusRun(runId: string) {
    const run = runs.find((r) => r.id === runId);
    if (!run) return;
    const y = laneY.get(run.lane);
    if (y === undefined) return;
    const x0 = world.startX + run.startMark * MARK_STEP;
    const x1 = world.startX + run.endMark * MARK_STEP;
    focusBox(x0 - 36, y - LANE_WIDTH * 1.9, x1 + 36, y + LANE_WIDTH * 1.9);
  }

  function focusLane(no: number) {
    const y = laneY.get(no);
    if (y === undefined) return;
    focusBox(world.startX - 40, y - LANE_WIDTH * 1.5, world.finishX + 40, y + LANE_WIDTH * 1.5);
  }

  $effect(() => {
    onapi?.({ focusRun, focusLane, focusAll: fit });
  });

  /* ---------- pointer ---------- */
  let down = { x: 0, y: 0, t: 0 };

  function onPointerDown(e: PointerEvent) {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerUp(e: PointerEvent) {
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 5 || performance.now() - down.t > 850) return;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const wx = (e.clientX - rect.left - view.tx) / view.k;
    const wy = (e.clientY - rect.top - view.ty) / view.k;
    const near = layers.tracks ? nearestRun(wx, wy) : null;
    if (near && near.dist <= 11 / view.k) {
      onSelect?.(near.id, e.shiftKey || e.metaKey || e.ctrlKey);
    } else {
      onSelect?.(null, false);
    }
  }

  let hoverRaf = 0;
  let lastHover: string | null = null;
  function onPointerMove(e: PointerEvent) {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      if (!svgEl) return;
      if (!layers.tracks) {
        if (lastHover !== hovered) onHover?.(null);
        return;
      }
      const rect = svgEl.getBoundingClientRect();
      const wx = (e.clientX - rect.left - view.tx) / view.k;
      const wy = (e.clientY - rect.top - view.ty) / view.k;
      const near = nearestRun(wx, wy);
      const id = near && near.dist <= 12 / view.k ? near.id : null;
      if (id !== hovered) onHover?.(id);
    });
  }

  /* ---------- effects ---------- */
  $effect(() => {
    if (!wrapEl) return;
    const el = wrapEl;
    const ro = new ResizeObserver(() => {
      untrack(() => {
        const r = el.getBoundingClientRect();
        view.w = Math.max(320, Math.round(r.width));
        view.h = Math.max(280, Math.round(r.height));
        if (!view.fitted) fit();
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!svgEl) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 18.9])
      .extent([
        [0, 0],
        [1, 1]
      ])
      .translateExtent([
        [-1500, -1100],
        [world.bounds.w + 1500, world.bounds.h + 1100]
      ])
      .on('zoom', (e: D3ZoomEvent<SVGSVGElement, unknown>) => {
        syncFromTransform({ x: e.transform.x, y: e.transform.y, k: e.transform.k });
      });
    zoomBehavior = z;
    select(svgEl).call(z);
    select(svgEl).on('dblclick.zoom', null);
    untrack(() => fit());
    return () => {
      select(svgEl!).on('.zoom', null);
      zoomBehavior = null;
    };
  });

  /* ---------- scale bar ---------- */
  const scaleBar = $derived.by(() => {
    const metres = 96 / view.k;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(0.1, metres))));
    const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
    let best = candidates[0];
    for (const c of candidates) if (c <= metres * 1.5) best = c;
    return { metres: best, px: best * view.k, divisions: best / pow === 2.5 ? 4 : 2 };
  });

  /* ---------- minimap ---------- */
  const mini = { w: 152, h: 88 };
  const miniBox = $derived.by(() => {
    const pad = 5;
    const s = Math.min((mini.w - pad * 2) / world.bounds.w, (mini.h - pad * 2) / world.bounds.h);
    return {
      s,
      ox: pad + (mini.w - pad * 2 - world.bounds.w * s) / 2,
      oy: pad + (mini.h - pad * 2 - world.bounds.h * s) / 2
    };
  });
  const viewRect = $derived({
    x: miniBox.ox + (-view.tx / view.k) * miniBox.s,
    y: miniBox.oy + (-view.ty / view.k) * miniBox.s,
    w: (view.w / view.k) * miniBox.s,
    h: (view.h / view.k) * miniBox.s
  });
  const miniShore = $derived(
    `M${world.shoreline.map((p) => `${miniBox.ox + p.x * miniBox.s},${miniBox.oy + p.y * miniBox.s}`).join(' L')}`
  );

  function onMiniClick(e: MouseEvent) {
    if (!svgEl || !zoomBehavior) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const wx = (e.clientX - rect.left - miniBox.ox) / miniBox.s;
    const wy = (e.clientY - rect.top - miniBox.oy) / miniBox.s;
    const k = Math.max(view.k, kFit * 2.2);
    select(svgEl).call(
      zoomBehavior.transform as never,
      zoomIdentity.translate(view.w / 2 - wx * k, view.h / 2 - wy * k).scale(k) as never
    );
  }

  const inkOf = (status: Run['status']) =>
    status === 'pending' ? 'var(--amber)' : status === 'invalid' ? 'var(--red)' : 'var(--teal)';

  const markBand = $derived.by(() => {
    if (!markRange) return null;
    return {
      x: world.startX + markRange.from * MARK_STEP,
      w: (markRange.to - markRange.from) * MARK_STEP,
      y: topOfLanes - LANE_WIDTH / 2 - 9,
      h: bottomOfLanes - topOfLanes + LANE_WIDTH + 18
    };
  });
</script>

<div bind:this={wrapEl} class="map-wrap" data-lod={lod}>
  <svg
    bind:this={svgEl}
    class="canvas"
    role="application"
    aria-label="水库分层平面图，可缩放平移，点击轨迹查看详情"
    viewBox={`0 0 ${view.w} ${view.h}`}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointermove={onPointerMove}
    onpointerleave={() => onHover?.(null)}
  >
    <defs>
      <linearGradient id="waterBase" x1="0.1" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="#0b3038" />
        <stop offset="0.5" stop-color="#082730" />
        <stop offset="1" stop-color="#061e25" />
      </linearGradient>
      <radialGradient id="deepCore" cx="0.46" cy="0.52" r="0.6">
        <stop offset="0" stop-color="#0f4049" stop-opacity="0.5" />
        <stop offset="0.65" stop-color="#07222b" stop-opacity="0.15" />
        <stop offset="1" stop-color="#04141a" stop-opacity="0" />
      </radialGradient>
      <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="5" stroke="#8fb7b6" stroke-width="1" stroke-opacity="0.26" />
      </pattern>
      <pattern id="grat" width={world.graticule.step} height={world.graticule.step} patternUnits="userSpaceOnUse">
        <path
          d={`M${world.graticule.step} 0 H0 V${world.graticule.step}`}
          fill="none"
          stroke="#3f8b90"
          stroke-width="0.6"
          stroke-opacity="0.55"
        />
      </pattern>
    </defs>

    <rect x="0" y="0" width={view.w} height={view.h} fill="#04181e" />

    <g bind:this={worldG}>
      <!-- water body: depth bands painted outermost → deepest -->
      <path d={shorePath} fill={bandPaths[0]?.color ?? '#10525c'} />
      {#if layers.depth}
        {#each bandPaths.slice(1) as band (band.depth)}
          <path d={band.d} fill={band.color} />
        {/each}
      {/if}
      <path d={shorePath} fill="url(#deepCore)" opacity="0.85" />
      {#if layers.depth}
        {#each contourPaths as d, i (i)}
          <path
            d={d}
            fill="none"
            stroke="#2f7982"
            stroke-width={i === 0 ? 1.4 : 0.9}
            stroke-opacity={i === 0 ? 0.55 : 0.4}
          />
        {/each}
        {#if showFacilityLabels}
          <text x={world.shoreline[0].x + 26} y={world.shoreline[0].y - 26} class="depth-label">3 m</text>
        {/if}
      {/if}

      {#if layers.grid}
        <rect x="0" y="0" width={world.bounds.w} height={world.bounds.h} fill="url(#grat)" opacity={lod === 'far' ? 0.3 : 0.55} />
      {/if}

      {#each islandPaths as d, i (i)}
        <path d={d} fill="#123138" stroke="#2d6a74" stroke-width="1.2" />
        {#if lod === 'mid' || lod === 'near' || lod === 'close'}
          <path d={d} fill="url(#hatch)" opacity="0.4" />
        {/if}
      {/each}

      {#if layers.shore}
        <path d={shorePath} fill="none" stroke="#0a2a30" stroke-width="8" stroke-opacity="0.6" />
        <path d={shorePath} fill="none" stroke="#4e9aa0" stroke-width="2.4" stroke-opacity="0.95" />
      {/if}

      {#if markBand}
        <rect x={markBand.x} y={markBand.y} width={markBand.w} height={markBand.h} fill="#e9b154" opacity="0.05" />
        <rect
          x={markBand.x}
          y={markBand.y}
          width={markBand.w}
          height={markBand.h}
          fill="none"
          stroke="#e9b154"
          stroke-width="1.4"
          stroke-dasharray="10 6"
          stroke-opacity="0.85"
        />
      {/if}

      {#if layers.lanes}
        {#each world.lanes as lane (lane.no)}
          {@const hot = highlightLanes.includes(lane.no)}
          <rect
            x={world.startX - 24}
            y={lane.top}
            width={world.finishX - world.startX + 48}
            height={LANE_WIDTH}
            fill={hot ? '#1d7079' : '#0f3a40'}
            opacity={hot ? 0.5 : 0.22}
          />
          <line
            class="lane-center"
            x1={lane.startX}
            y1={lane.centerY}
            x2={lane.finishX}
            y2={lane.centerY}
          />
          <line class="lane-edge" x1={lane.startX - 24} y1={lane.top} x2={lane.finishX + 24} y2={lane.top} />
          <line class="lane-edge" x1={lane.startX - 24} y1={lane.bottom} x2={lane.finishX + 24} y2={lane.bottom} />
          {#if showLaneNums}
            <text x={world.startX - 34} y={lane.centerY} class="lane-num" text-anchor="end" dominant-baseline="middle">{lane.no}</text>
            <text x={world.finishX + 36} y={lane.centerY} class="lane-num dim" text-anchor="start" dominant-baseline="middle">{lane.no}</text>
          {/if}

          {#if showGates}
            <path class="gate-chev" d={`M${world.startX - 16} ${lane.centerY - 4.5} l9 4.5 l-9 4.5`} fill="none" stroke="#e9b154" stroke-opacity="0.9" />
            <path class="gate-chev" d={`M${world.finishX + 8} ${lane.centerY - 4.5} l9 4.5 l-9 4.5`} fill="none" stroke="#8fe0e2" stroke-opacity="0.9" />
          {/if}
        {/each}

        <line class="gate-line" x1={world.startX} y1={topOfLanes - 16} x2={world.startX} y2={bottomOfLanes + 16} stroke="#e9b154" stroke-opacity="0.85" />
        <line class="gate-line" x1={world.finishX} y1={topOfLanes - 16} x2={world.finishX} y2={bottomOfLanes + 16} stroke="#8fe0e2" stroke-opacity="0.9" />

        {#if showGateLabels}
          <text x={world.startX - 4} y={topOfLanes - 22} class="gate-label" text-anchor="end">起点 M0</text>
          <text x={world.finishX + 4} y={topOfLanes - 22} class="gate-label end" text-anchor="start">终点 M8 · 2000 m</text>
        {/if}
        {#if showLaneNums && lod !== 'mid'}
          {#each world.lanes as lane (lane.no)}
            {#each laneTickXs.slice(1, -1) as mx (mx)}
              <text
                x={mx + 6}
                y={lane.centerY - 10}
                class="lane-ribbon"
                dominant-baseline="middle"
              >{lane.no}</text>
            {/each}
          {/each}
        {/if}
      {/if}

      {#if lod === 'mid' || lod === 'near' || lod === 'close'}
        {#each laneTickXs as x, i (i)}
          {#if i > 0 && i < laneTickXs.length - 1}
            <line class="tick-line" x1={x} y1={topOfLanes - 20} x2={x} y2={bottomOfLanes + 20} />
            {#if showTickLabels}
              <text x={x + 3} y={topOfLanes - 24} class="tick-label">{i * 250} m</text>
            {/if}
          {/if}
        {/each}
      {/if}

      {#if layers.buoys}
        {#each world.buoys as b (b.id)}
          {@const gate = b.kind === 'gate'}
          <circle
            class="buoy"
            class:gate
            cx={b.pos.x}
            cy={b.pos.y}
            fill={gate ? '#f0cd8a' : '#9fdde0'}
            stroke={gate ? '#e9b154' : '#4e9aa0'}
          />
          {#if gate}
            <circle class="buoy-ring" cx={b.pos.x} cy={b.pos.y} fill="none" stroke="#e9b154" stroke-opacity="0.45" />
          {/if}
          {#if showBuoyNums}
            <text x={b.pos.x + 6} y={b.pos.y - 4.5} class="buoy-label">{b.mark}</text>
          {/if}
        {/each}
      {/if}

      {#if layers.docks}
        {#each world.docks as d (d.id)}
          <path d={dockPaths(d)} fill="#1a3f44" stroke="#5c9ba0" stroke-width="1.2" stroke-opacity="0.9" />
          {#if showFacilityLabels}
            <path d={dockPaths(d)} fill="url(#hatch)" opacity="0.35" />
            <text x={d.labelAt.x} y={d.labelAt.y} class="dock-label" text-anchor="middle">{d.name}</text>
          {/if}
        {/each}
        {#if showLandmarks}
          {#each world.landmarks as lm, i (i)}
            <g transform={`translate(${lm.at.x} ${lm.at.y})`}>
              <rect x="-3" y="-3" width="6" height="6" fill="#e9b154" opacity="0.85" />
              <text x="7" y="2" class="lm-label">{lm.name}</text>
            </g>
          {/each}
        {/if}
      {/if}

      {#if layers.tracks}
        {#each runs as run (run.id)}
          {@const geo = trackGeometry(run)}
          {@const isSel = selectedSet.has(run.id)}
          {@const isHov = hovered === run.id}
          {@const ink = inkOf(run.status)}
          <g class="track" class:sel={isSel || isHov} class:inv={run.status === 'invalid'} class:pending={run.status === 'pending'}>
            <path class="trk l0" d={geo.l0} stroke={ink} />
            <path class="trk l1" d={geo.l1} stroke={ink} />
            <path class="trk l2" d={geo.l2} stroke={ink} />
            <path class="trk l3" d={geo.l3} stroke={ink} />
          </g>
        {/each}
        {#if showLandmarks && selectedSet.size > 0}
          {#each runs as run (run.id)}
            {#if selectedSet.has(run.id)}
              {@const geo = trackGeometry(run)}
              {#each geo.marks as m (m.mark)}
                <circle cx={m.x} cy={m.y} r="2.8" fill="#e9b154" stroke="#1d1607" stroke-width="0.9" />
              {/each}
            {/if}
          {/each}
        {/if}
      {/if}

      {#if playbackPos}
        <g class="playback" transform={`translate(${playbackPos.x} ${playbackPos.y})`}>
          <circle r="8" fill="none" stroke="#f0cd8a" stroke-width="1.1" stroke-opacity="0.55" />
          <path d="M-6.5 0 q3.2 -2.8 6.5 0 q3.4 2.8 6.5 0" fill="none" stroke="#ffe3a8" stroke-width="1.4" />
          <circle r="2" fill="#ffe3a8" />
        </g>
      {/if}
    </g>

    <g class="hud">
      {#each markers as m (m.run.id)}
        {@const isSel = selectedSet.has(m.run.id)}
        {@const isHov = hovered === m.run.id}
        <g
          transform={`translate(${m.sx} ${m.sy})`}
          class="boat-marker"
          class:sel={isSel}
          class:hov={isHov}
          class:flagged={m.flagged}
        >
          <path
            d="M-6.2 0 q3.4 -2.9 6.2 0 q3.3 2.9 6.2 0"
            fill="none"
            stroke={inkOf(m.run.status)}
            stroke-width={isSel || isHov ? 2.1 : 1.1}
          />
          <rect x="-1.5" y="-9.6" width="3" height="3.2" fill={inkOf(m.run.status)} opacity="0.9" />
          <text x="0" y="-12.4" class="boat-num" text-anchor="middle">{m.label}</text>
          {#if m.flagged}
            <path d="M6.6 -9 l4 1.7 l-4 1.7 z" fill="#e9b154" />
          {/if}
          {#if showRunCodes}
            <text x="0" y="11.4" class="boat-code" text-anchor="middle">{m.boat.code}</text>
          {/if}
        </g>
      {/each}

      {#each detectionPins as pin (pin.key)}
        <g transform={`translate(${pin.sx} ${pin.sy})`} class="pin">
          <line x1="0" y1="0" x2="0" y2="-14" stroke="#e9b154" stroke-width="0.9" stroke-opacity="0.6" />
          <path d="M0 -14 l6.6 2.8 l-6.6 2.8 z" fill="#e9b154" />
          {#if showRunCodes}
            <text x="8.5" y="-10.6" class="pin-label">{pin.text}</text>
          {/if}
        </g>
      {/each}
    </g>

    <g transform={`translate(18 ${view.h - 26})`}>
      {#each Array.from({ length: scaleBar.divisions }) as _, i (i)}
        <rect
          x={(i / scaleBar.divisions) * scaleBar.px}
          y="-4"
          width={scaleBar.px / scaleBar.divisions}
          height="4"
          fill={i % 2 === 0 ? '#c7e4e2' : '#0b262a'}
          stroke="#6f9aa0"
          stroke-width="0.6"
        />
      {/each}
      <text x="0" y="8" class="scale-text">0</text>
      <text x={scaleBar.px} y="8" class="scale-text" text-anchor="end">
        {scaleBar.metres >= 1000 ? `${scaleBar.metres / 1000} km` : `${Math.round(scaleBar.metres * 10) / 10} m`}
      </text>
    </g>

    <g class="compass" transform={`translate(${view.w - 30} 32)`}>
      <path d="M0 -12 L4.4 4 L0 1 L-4.4 4 Z" fill="#8adfe4" opacity="0.8" />
      <text x="0" y="14" text-anchor="middle" class="compass-n">N</text>
    </g>
  </svg>

  <div class="map-controls">
    <button class="mc" onclick={() => zoomBy(1.6)} title="放大" aria-label="放大">＋</button>
    <div class="mc-scale mono">{scaleLabel}</div>
    <button class="mc" onclick={() => zoomBy(1 / 1.6)} title="缩小" aria-label="缩小">−</button>
    <button class="mc fit" onclick={() => fit()} title="全水域" aria-label="全水域">
      <svg width="13" height="13" viewBox="0 0 14 14"><path d="M1 5V1h4M9 1h4v4M13 9v4h-4M5 13H1V9" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
    </button>
  </div>

  <div class="lod-pill">
    <span class="dot-lod"></span>
    <span>{lodText}</span>
  </div>

  <div class="minimap" onclick={onMiniClick} role="presentation">
    <svg width={mini.w} height={mini.h} viewBox={`0 0 ${mini.w} ${mini.h}`}>
      <rect width={mini.w} height={mini.h} fill="#04161b" />
      <path d={miniShore} fill="#0d3640" stroke="#3f8b90" stroke-width="0.8" />
      {#each world.lanes as lane (lane.no)}
        <line
          x1={miniBox.ox + world.startX * miniBox.s}
          y1={miniBox.oy + lane.centerY * miniBox.s}
          x2={miniBox.ox + world.finishX * miniBox.s}
          y2={miniBox.oy + lane.centerY * miniBox.s}
          stroke="#5f9ea3"
          stroke-width="0.5"
          stroke-opacity="0.75"
        />
      {/each}
      {#each runs as run (run.id)}
        {#if selectedSet.has(run.id)}
          <line
            x1={miniBox.ox + (world.startX + run.startMark * MARK_STEP) * miniBox.s}
            y1={miniBox.oy + (laneY.get(run.lane) ?? 0) * miniBox.s}
            x2={miniBox.ox + (world.startX + run.endMark * MARK_STEP) * miniBox.s}
            y2={miniBox.oy + (laneY.get(run.lane) ?? 0) * miniBox.s}
            stroke="#e9b154"
            stroke-width="1"
          />
        {/if}
      {/each}
      <rect
        x={viewRect.x}
        y={viewRect.y}
        width={Math.max(6, Math.min(mini.w, viewRect.w))}
        height={Math.max(6, Math.min(mini.h, viewRect.h))}
        fill="none"
        stroke="#e9b154"
        stroke-width="1"
      />
    </svg>
    <div class="mini-cap mono">全水域</div>
  </div>
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #04181e;
  }
  .canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
    font-family: var(--font);
  }
  .canvas:active {
    cursor: grabbing;
  }

  .lane-ribbon {
    fill: #5c8f93;
    font-size: calc(8px * var(--inv));
    font-family: var(--mono);
    opacity: 0.8;
  }
  .lane-num {
    fill: #86bcc0;
    font-size: calc(11px * var(--inv));
    font-family: var(--mono);
    font-weight: 500;
  }
  .lane-num.dim {
    fill: #5f8a8d;
  }
  .buoy-label {
    fill: #96c4c6;
    font-size: calc(9px * var(--inv));
    font-family: var(--mono);
  }
  .dock-label {
    fill: #a6d1d1;
    font-size: calc(9.5px * var(--inv));
    letter-spacing: 0.04em;
  }
  .lm-label {
    fill: #d0b98c;
    font-size: calc(9px * var(--inv));
    font-family: var(--mono);
  }
  .depth-label {
    fill: #6f9a9c;
    font-size: 6px;
    font-family: var(--mono);
    opacity: 0.7;
  }
  .tick-label,
  .gate-label {
    fill: #6f9a9c;
    font-size: 5.4px;
    font-family: var(--mono);
    letter-spacing: 0.04em;
  }
  .gate-label.end {
    fill: #8fe0e2;
  }
  .scale-text {
    fill: #8fb4b6;
    font-family: var(--mono);
    font-size: 7px;
  }
  .compass-n {
    fill: #6f9aa0;
    font-family: var(--mono);
    font-size: 6px;
  }
  .compass {
    opacity: 0.5;
  }

  :root {
    --inv: 1;
  }
  .map-wrap {
    --inv: 1;
  }
  .trk {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.55;
    pointer-events: none;
    stroke-width: calc(1.05px * var(--inv));
  }
  .track.pending .trk { opacity: 0.72; }
  .track.sel .trk {
    stroke-width: calc(2.6px * var(--inv));
    opacity: 1;
  }
  .track.inv.sel .trk { opacity: 0.85; }
  .track:global(.hov) .trk {
    stroke-width: calc(2px * var(--inv));
    opacity: 1;
  }
  .buoy {
    r: calc(2.6px * var(--inv));
    stroke-width: calc(0.8px * var(--inv));
  }
  .buoy.gate {
    r: calc(3.8px * var(--inv));
    stroke-width: calc(1px * var(--inv));
  }
  .buoy-ring {
    r: calc(7.5px * var(--inv));
    stroke-width: calc(0.9px * var(--inv));
  }
  .lane-center {
    stroke: #3f8b90;
    stroke-opacity: 0.55;
    stroke-width: calc(1.1px * var(--inv));
    stroke-dasharray: calc(9px * var(--inv)) calc(7px * var(--inv));
  }
  .lane-edge {
    stroke: #2a6469;
    stroke-opacity: 0.6;
    stroke-width: calc(0.7px * var(--inv));
  }
  .tick-line {
    stroke: #3f8b90;
    stroke-opacity: 0.3;
    stroke-width: calc(0.6px * var(--inv));
    stroke-dasharray: calc(4px * var(--inv)) calc(6px * var(--inv));
  }
  .gate-line {
    stroke-width: calc(1.6px * var(--inv));
  }
  .gate-chev {
    stroke-width: calc(1.1px * var(--inv));
  }
  .trk.l2,
  .trk.l3 {
    display: none;
  }
  .track.inv .trk {
    stroke-dasharray: 3 2.6;
    opacity: 0.6;
  }

  /* LOD switching is pure CSS so pan/zoom never rebuilds path data */
  [data-lod='overview'] .trk.l0 { display: inline; }
  [data-lod='overview'] .trk.l1,
  [data-lod='overview'] .trk.l2,
  [data-lod='overview'] .trk.l3 { display: none; }
  [data-lod='far'] .trk.l0 { display: inline; }
  [data-lod='far'] .trk.l1,
  [data-lod='far'] .trk.l2,
  [data-lod='far'] .trk.l3 { display: none; }
  [data-lod='mid'] .trk.l0 { display: none; }
  [data-lod='mid'] .trk.l1 { display: inline; }
  [data-lod='mid'] .trk.l2,
  [data-lod='mid'] .trk.l3 { display: none; }
  [data-lod='near'] .trk.l0,
  [data-lod='near'] .trk.l1 { display: none; }
  [data-lod='near'] .trk.l2 { display: inline; }
  [data-lod='near'] .trk.l3 { display: none; }
  [data-lod='close'] .trk.l0,
  [data-lod='close'] .trk.l1,
  [data-lod='close'] .trk.l2 { display: none; }
  [data-lod='close'] .trk.l3 { display: inline; }

  .boat-marker {
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.18s ease;
  }
  [data-lod='near'] .boat-marker,
  [data-lod='close'] .boat-marker {
    opacity: 0.9;
  }
  .boat-marker.sel,
  .boat-marker.hov {
    opacity: 1;
  }
  .boat-num {
    fill: #dceeec;
    font-family: var(--mono);
    font-size: 8px;
    font-weight: 500;
    paint-order: stroke;
    stroke: #04212a;
    stroke-width: 2.4px;
  }
  .boat-code {
    fill: #7fb4b7;
    font-family: var(--mono);
    font-size: 6.2px;
    paint-order: stroke;
    stroke: #04212a;
    stroke-width: 2px;
  }
  .boat-marker.sel .boat-num {
    fill: #ffe3a8;
  }
  .boat-marker.flagged .boat-num {
    fill: #f3cd8a;
  }

  .pin {
    pointer-events: none;
    opacity: 0.92;
  }
  .pin-label {
    fill: #e0bf83;
    font-size: 6px;
    font-family: var(--mono);
    paint-order: stroke;
    stroke: #04212a;
    stroke-width: 2.2px;
  }

  .map-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: rgba(6, 26, 31, 0.86);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 3px;
    backdrop-filter: blur(9px);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
  }
  .mc {
    width: 28px;
    height: 25px;
    display: grid;
    place-items: center;
    color: var(--ink-2);
    font-size: 14px;
    border-radius: 2px;
  }
  .mc:hover {
    background: rgba(111, 211, 216, 0.12);
    color: var(--teal);
  }
  .mc.fit {
    height: 23px;
    color: var(--muted);
  }
  .mc-scale {
    font-size: 8.5px;
    color: var(--muted);
    text-align: center;
    padding: 3px 0;
    border-block: 1px solid var(--line-soft);
    white-space: nowrap;
  }

  .lod-pill {
    position: absolute;
    top: 12px;
    left: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 25px;
    padding: 0 10px;
    background: rgba(6, 26, 31, 0.82);
    border: 1px solid var(--line);
    border-radius: 2px;
    font-size: 10.5px;
    color: var(--ink-2);
    backdrop-filter: blur(9px);
  }
  .dot-lod {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--teal);
    box-shadow: 0 0 0 2px rgba(111, 211, 216, 0.18);
    transition: background 0.3s, box-shadow 0.3s;
  }
  :global(.map-wrap[data-lod='near']) .dot-lod,
  :global(.map-wrap[data-lod='close']) .dot-lod {
    background: var(--amber);
    box-shadow: 0 0 0 2px rgba(233, 177, 84, 0.22);
  }

  .minimap {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 152px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    background: #04161b;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.4);
    cursor: crosshair;
  }
  .minimap svg {
    display: block;
  }
  .mini-cap {
    position: absolute;
    left: 6px;
    bottom: 4px;
    font-size: 8px;
    color: var(--muted-2);
    letter-spacing: 0.14em;
    pointer-events: none;
  }
</style>
