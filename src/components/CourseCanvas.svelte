<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { createRenderer, makeCamera, project, type Camera, type Renderer } from '../lib/renderer';
  import { dist, facingVectors } from '../lib/geometry';
  import type { RouteCourse, Vec2 } from '../lib/types';

  let {
    course = $bindable(),
    highlightIds,
    showConflicts = $bindable(true),
    showStrides = $bindable(true),
    editable = true,
    selectedId = $bindable<string | null>(null),
    onMove,
  } = $props<{
    course: RouteCourse | undefined;
    highlightIds?: Set<string>;
    showConflicts?: boolean;
    showStrides?: boolean;
    editable?: boolean;
    selectedId?: string | null;
    onMove?: (id: string, pos: Vec2) => void;
  }>();

  const highlights = $derived(highlightIds ?? new Set<string>());

  let wrap = $state<HTMLDivElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let renderer = $state<Renderer | null>(null);
  let backend = $state('初始化中…');
  let cam = $state<Camera>({ mode: 'top', x: 0, y: 0, zoom: 10, heading: 0, fov: Math.PI / 3 });
  let dpr = 1;
  let riderIndex = $state(0);
  let labels = $state<{ x: number; y: number; text: string; color: string; bold?: boolean }[]>([]);
  let lastCourseRef = $state<RouteCourse | undefined>(undefined);

  let wrapSize = $state({ w: 0, h: 0 });

  onMount(async () => {
    renderer = await createRenderer(canvasEl!);
    backend = renderer.backend === 'webgpu' ? 'WebGPU 渲染' : 'Canvas2D 降级渲染';
    dpr = window.devicePixelRatio || 1;
    const r = wrap!.getBoundingClientRect();
    renderer.resize(r.width || 800, r.height || 600, dpr);
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap!);
    return () => ro.disconnect();
  });

  function resize() {
    if (!wrap || !renderer) return;
    const r = wrap.getBoundingClientRect();
    renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
    wrapSize = { w: r.width, h: r.height };
  }

  function cssSize(): { w: number; h: number } {
    const r = wrap?.getBoundingClientRect();
    return { w: r?.width || 800, h: r?.height || 600 };
  }

  function fitView() {
    if (!course) return;
    const { length, width } = course.params.field;
    const { w, h } = cssSize();
    cam = {
      mode: 'top',
      x: length / 2,
      y: width / 2,
      zoom: Math.min((w - 40) / length, (h - 40) / width),
      heading: 0,
      fov: cam.fov,
    };
  }

  function setMode(mode: 'top' | 'rider') {
    if (!course) return;
    if (mode === 'top') {
      fitView();
    } else {
      cam = makeCamera('rider', course);
      riderIndex = 0;
      syncRider();
    }
  }

  function syncRider() {
    if (!course || cam.mode !== 'rider') return;
    const o = course.obstacles[Math.min(riderIndex, course.obstacles.length - 1)];
    const f = facingVectors(o.angle).forward;
    cam = { ...cam, x: o.position.x - f.x * 12, y: o.position.y - f.y * 12, heading: o.angle };
  }

  function riderStep(d: number) {
    if (!course) return;
    riderIndex = Math.max(0, Math.min(course.obstacles.length - 1, riderIndex + d));
    syncRider();
  }

  let didInitialFit = $state(false);

  // 渲染与覆盖层标注。显式声明依赖,untrack 写入避免读写同一状态造成循环
  $effect(() => {
    // 依赖:渲染器、路线、相机、容器尺寸、各开关
    const r = renderer;
    const c = course;
    const camera = cam;
    const size = wrapSize;
    const hl = highlights;
    const sc = showConflicts;
    const ss = showStrides;
    const sel = selectedId;
    if (!r || !c) return;
    // 实例首次渲染、切换路线、或容器尺寸变化(俯视)时适应窗口
    if (!didInitialFit || lastCourseRef !== c) {
      lastCourseRef = c;
      didInitialFit = true;
      fitView();
    } else if (camera.mode === 'top' && size.w > 0) {
      // 容器尺寸变化后保持整场地可见
      const { length, width } = c.params.field;
      const targetZoom = Math.min((size.w - 40) / length, (size.h - 40) / width);
      if (Math.abs(targetZoom - camera.zoom) / camera.zoom > 0.05) fitView();
    }
    const { w, h } = cssSize();
    r.render(c, camera, { highlightIds: hl, showConflicts: sc, showStrides: ss, selectedId: sel });
    const next = buildLabelsData(w, h, camera);
    untrack(() => (labels = next));
  });

  function buildLabelsData(w: number, h: number, camera: Camera): typeof labels {
    if (!course || camera.mode !== 'top') return [];
    const ls: { x: number; y: number; text: string; color: string; bold?: boolean }[] = [];
    for (const o of course.obstacles) {
      const p = project(o.position, camera, w, h);
      if (Number.isNaN(p.sx)) continue;
      ls.push({ x: p.sx, y: p.sy - 14, text: o.number + (o.manual ? ' ✋' : ''), color: '#fff', bold: true });
    }
    if (showStrides) {
      for (let i = 0; i < course.obstacles.length - 1; i++) {
        const a = course.obstacles[i];
        const b = course.obstacles[i + 1];
        const m = { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 };
        const p = project(m, camera, w, h);
        if (Number.isNaN(p.sx)) continue;
        const mark = course.strides[i];
        ls.push({
          x: p.sx, y: p.sy + 16,
          text: mark.related ? `${mark.distance}m · ${mark.strides}步` : `${mark.distance}m`,
          color: mark.related ? '#ffd479' : '#9fd8ff',
        });
      }
    }
    if (showConflicts) {
      for (const cf of course.conflicts) {
        const p = project(cf.at, camera, w, h);
        if (Number.isNaN(p.sx)) continue;
        ls.push({ x: p.sx + 10, y: p.sy + 4, text: cf.type === 'stride' ? '步距' : cf.type === 'crossing' ? '交叉' : '越界', color: '#ff6b6b' });
      }
    }
    return ls;
  }

  // ---------- 指针交互(俯视) ----------
  let dragId: string | null = null;
  let panning = false;
  let lastPx = 0;
  let lastPy = 0;

  function toWorld(e: PointerEvent): Vec2 {
    const rect = canvasEl!.getBoundingClientRect();
    return renderer!.screenToWorld(e.clientX - rect.left, e.clientY - rect.top, cam);
  }

  function hitTest(w: Vec2): string | null {
    if (!course) return null;
    let best: string | null = null;
    let bestD = 2.8;
    for (const o of course.obstacles) {
      const d = dist(w, o.position);
      if (d < bestD) {
        bestD = d;
        best = o.id;
      }
    }
    return best;
  }

  function onPointerDown(e: PointerEvent) {
    if (cam.mode !== 'top') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const w = toWorld(e);
    const hit = editable ? hitTest(w) : null;
    if (hit) {
      dragId = hit;
      selectedId = hit;
    } else {
      panning = true;
      selectedId = null;
    }
    lastPx = e.clientX;
    lastPy = e.clientY;
  }

  function onPointerMove(e: PointerEvent) {
    if (!course) return;
    if (dragId) {
      const w = toWorld(e);
      const f = course.params.field;
      const pos = { x: Math.max(2, Math.min(f.length - 2, w.x)), y: Math.max(2, Math.min(f.width - 2, w.y)) };
      onMove?.(dragId, pos);
    } else if (panning) {
      cam = { ...cam, x: cam.x - (e.clientX - lastPx) / cam.zoom, y: cam.y - (e.clientY - lastPy) / cam.zoom };
      lastPx = e.clientX;
      lastPy = e.clientY;
    }
  }

  function onPointerUp() {
    dragId = null;
    panning = false;
  }

  function onWheel(e: WheelEvent) {
    if (cam.mode !== 'top') return;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    cam = { ...cam, zoom: Math.max(2, Math.min(45, cam.zoom * factor)) };
  }
</script>

<div class="canvas-wrap" bind:this={wrap}>
  <canvas
    bind:this={canvasEl}
    class={cam.mode === 'top' && editable ? 'grabbable' : ''}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onwheel={onWheel}
  ></canvas>

  <div class="overlay">
    {#each labels as l, i (i)}
      <span class="lbl" style={`left:${l.x}px;top:${l.y}px;color:${l.color};font-weight:${l.bold ? 700 : 400}`}>{l.text}</span>
    {/each}
  </div>

  <div class="toolbar">
    <span class="tag">{backend}</span>
    <button class={cam.mode === 'top' ? 'primary' : ''} onclick={() => setMode('top')}>俯视</button>
    <button class={cam.mode === 'rider' ? 'primary' : ''} onclick={() => setMode('rider')}>骑手视角</button>
    {#if cam.mode === 'top'}
      <button onclick={fitView}>适应窗口</button>
    {:else}
      <button onclick={() => riderStep(-1)}>◀ 上一道</button>
      <span class="tag">第 {riderIndex + 1}/{course?.obstacles.length ?? 0} 道</span>
      <button onclick={() => riderStep(1)}>下一道 ▶</button>
    {/if}
  </div>
</div>

<style>
  .canvas-wrap { position: relative; width: 100%; height: 100%; min-height: 420px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: #0a0d12; }
  canvas { width: 100%; height: 100%; display: block; touch-action: none; }
  canvas.grabbable { cursor: grab; }
  .overlay { position: absolute; inset: 0; pointer-events: none; }
  .lbl { position: absolute; transform: translate(-50%, -50%); font-size: 12px; text-shadow: 0 1px 3px #000; white-space: nowrap; }
  .toolbar { position: absolute; left: 10px; top: 10px; display: flex; gap: 6px; align-items: center; }
  .toolbar button { padding: 4px 10px; font-size: 12px; }
</style>
