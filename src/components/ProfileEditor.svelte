<script>
  import {
    sampleProfile, findAbrupt, offsetSamples, detectSelfIntersections, decimate,
    buildSpline, pressureProfile, clamp, round,
  } from '../lib/geometry.js';
  import { paint } from '../lib/offscreen.js';
  import { drawProfile, makeView, makeViewport } from '../lib/render.js';

  let {
    task,
    points = $bindable([]),
    offsetMM = 6,
    metrics = $bindable(null),
    mode = 'edit',
    showReference = false,
    showSeam = true,
    showComb = true,
    deviation = null,
    height = 460,
    onSelectIndex = () => {},
    requireOffset = true,
  } = $props();

  let canvasEl = $state(null);
  let wrapEl = $state(null);
  let size = $state({ w: 900, h: height });
  let zoom = $state(1);
  let pan = $state({ x: 0, y: 0 });
  let dragIndex = $state(-1);
  let activeIndex = $state(-1);
  let hoverWorld = $state(null);
  let cursor = $state('default');
  let bgDrag = $state(null);

  const samples = $derived(points.length >= 2 ? sampleProfile(points, 220) : []);
  const base = $derived(
    samples.length >= 2 ? makeView(samples, size.w, size.h, { pad: 30, bottom: 52, top: 92 }) : null
  );
  const view = $derived(base ? makeViewport(base, size.w, size.h, zoom, pan) : null);
  const refSpline = $derived(task.reference?.length ? buildSpline(task.reference) : null);

  // 半径可调范围由任务测量表推导，避免拖出毫无意义的数值
  const yMin = $derived.by(() => {
    const r = Math.min(...task.measurements.map((m) => m.circ / (2 * Math.PI)));
    return Math.max(3, r * 0.55);
  });
  const yMax = $derived.by(() => {
    const r = Math.max(...task.measurements.map((m) => m.circ / (2 * Math.PI)));
    return r * 1.45;
  });

  // 复核模式：把参考半径挂到采样点上，供偏差带/色带渲染
  const renderSamples = $derived.by(() => {
    if (!deviation || !refSpline) return samples;
    return samples.map((p) => ({
      ...p,
      reference: refSpline.eval(clamp(p.x, refSpline.x0, refSpline.x1)).y,
    }));
  });

  const abrupt = $derived(samples.length > 2 ? findAbrupt(samples, task.curvatureThreshold) : []);
  const offsetPoly = $derived(
    samples.length > 1 && requireOffset ? decimate(offsetSamples(samples, offsetMM), 2) : []
  );
  const selfIntersections = $derived(
    offsetPoly.length > 3 ? detectSelfIntersections(offsetPoly) : []
  );
  const pressure = $derived(
    samples.length > 2 ? pressureProfile(samples, task.fabric) : null
  );

  const hoverSample = $derived.by(() => {
    if (!hoverWorld || samples.length < 2) return null;
    let best = samples[0];
    let bd = Infinity;
    for (const p of samples) {
      const d = Math.abs(p.x - hoverWorld.x);
      if (d < bd) { bd = d; best = p; }
    }
    return bd < 10 ? best : null;
  });

  $effect(() => {
    const payload = {
      samples,
      abrupt,
      selfIntersections,
      pressure,
      offsetPoly,
      maxKappa: samples.length ? Math.max(...samples.map((p) => p.kappa)) : 0,
    };
    metrics = payload;
  });

  $effect(() => {
    if (!wrapEl) return;
    const apply = () => { size = { w: Math.max(320, wrapEl.clientWidth), h: height }; };
    const ro = new ResizeObserver(apply);
    ro.observe(wrapEl);
    apply();
    return () => ro.disconnect();
  });

  $effect(() => {
    const deps = [samples, view, task, showComb, showSeam, showReference, deviation,
      abrupt, selfIntersections, offsetPoly, points, dragIndex, activeIndex, hoverWorld, size];
    if (!canvasEl || !view) return;
    const raf = requestAnimationFrame(() => {
      paint(canvasEl, (ctx, w, h, dpr) => {
        drawProfile(ctx, {
          width: w,
          height: h,
          dpr,
          samples: renderSamples,
          view,
          measurements: task.measurements,
          scars: task.scars,
          showComb,
          showSeam: showSeam && showReference === false ? showSeam : showSeam,
          seamPoly: offsetPoly,
          selfIntersections,
          showReference: showReference && !!refSpline,
          refSpline,
          abruptSegments: abrupt,
          deviationOverlay: !!deviation,
          deviationSegments: deviation?.deviationSegments ?? [],
          deviationThreshold: deviation?.threshold ?? 5,
          curvePoints: points,
          dragIndex: dragIndex >= 0 ? dragIndex : activeIndex,
          hover: hoverWorld && view ? view.toScreen(hoverWorld) : null,
          strip: true,
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  function localXY(ev) {
    const r = canvasEl.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function hitTest(sp) {
    if (!view) return -1;
    let best = -1;
    let bd = 15;
    for (let i = 0; i < points.length; i++) {
      const p = view.toScreen(points[i]);
      const d = Math.hypot(p.x - sp.x, p.y - sp.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function onPointerDown(ev) {
    if (mode !== 'edit' || ev.button === 2) return;
    const sp = localXY(ev);
    const idx = hitTest(sp);
    canvasEl.setPointerCapture(ev.pointerId);
    if (idx >= 0) {
      dragIndex = idx;
      activeIndex = idx;
      onSelectIndex(idx);
      cursor = 'grabbing';
      ev.preventDefault();
    } else {
      bgDrag = { x: sp.x, y: sp.y, pan: { ...pan } };
      cursor = 'grabbing';
    }
  }

  function onPointerMove(ev) {
    if (!view) return;
    const sp = localXY(ev);
    if (dragIndex >= 0) {
      const w = view.toWorld(sp.x, sp.y);
      const i = dragIndex;
      const lo = i > 0 ? points[i - 1].x + 3 : view.x0 + 1;
      const hi = i < points.length - 1 ? points[i + 1].x - 3 : view.x1 - 1;
      const next = points.slice();
      next[i] = { x: clamp(w.x, Math.min(lo, hi), Math.max(lo, hi)), y: clamp(w.y, yMin, yMax) };
      points = next;
      return;
    }
    if (bgDrag) {
      pan = { x: bgDrag.pan.x + (sp.x - bgDrag.x), y: bgDrag.pan.y + (sp.y - bgDrag.y) };
      return;
    }
    hoverWorld = view.toWorld(sp.x, sp.y);
    cursor = hitTest(sp) >= 0 ? 'grab' : 'crosshair';
  }

  function onPointerUp(ev) {
    try { canvasEl.releasePointerCapture(ev.pointerId); } catch { /* noop */ }
    dragIndex = -1;
    bgDrag = null;
    if (view) cursor = hitTest(localXY(ev)) >= 0 ? 'grab' : 'crosshair';
  }

  function onDoubleClick(ev) {
    if (mode !== 'edit' || !view) return;
    const sp = localXY(ev);
    if (hitTest(sp) >= 0) return;
    const w = view.toWorld(sp.x, sp.y);
    if (w.x <= view.x0 + 2 || w.x >= view.x1 - 2) return;
    const next = [...points, { x: clamp(w.x, view.x0 + 2, view.x1 - 2), y: clamp(w.y, yMin, yMax) }]
      .sort((a, b) => a.x - b.x);
    points = next;
    activeIndex = next.findIndex((p) => Math.abs(p.x - w.x) < 1e-6);
    onSelectIndex(activeIndex);
  }

  function onContextMenu(ev) {
    ev.preventDefault();
    if (mode !== 'edit' || points.length <= 3) return;
    const idx = hitTest(localXY(ev));
    if (idx < 0) return;
    points = points.filter((_, i) => i !== idx);
    activeIndex = -1;
    onSelectIndex(-1);
  }

  function onWheel(ev) {
    if (!view || !base) return;
    ev.preventDefault();
    const sp = localXY(ev);
    const before = view.toWorld(sp.x, sp.y);
    const nextZoom = clamp(zoom * Math.exp(-ev.deltaY * 0.0015), 0.55, 8);
    const scale = base.baseScale * nextZoom;
    const vScale = scale * base.vy;
    const ox = size.w / 2 - base.cx * scale;
    pan = {
      x: sp.x - before.x * scale - ox,
      y: sp.y + before.y * vScale - base.axisY,
    };
    zoom = nextZoom;
  }

  export function applyPointEdit(index, patch) {
    if (index < 0 || index >= points.length) return;
    const next = points.map((p, i) => (i === index ? { ...p, ...patch } : p));
    points = next.sort((a, b) => a.x - b.x);
    activeIndex = points.findIndex((p) => Math.abs(p.x - next[index].x) < 1e-6 && p.y === next[index].y);
  }

  export function resetView() {
    zoom = 1;
    pan = { x: 0, y: 0 };
  }

  export function zoomBy(f) {
    zoom = clamp(zoom * f, 0.55, 8);
  }

  export function deleteActive() {
    if (activeIndex >= 0 && points.length > 3) {
      points = points.filter((_, i) => i !== activeIndex);
      activeIndex = -1;
      onSelectIndex(-1);
    }
  }

  function keydown(ev) {
    if (mode !== 'edit') return;
    const tag = ev.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && activeIndex >= 0) {
      ev.preventDefault();
      deleteActive();
    }
    if (ev.key === 'Escape') {
      activeIndex = -1;
      onSelectIndex(-1);
    }
  }

  const zoomPct = $derived(`${Math.round(zoom * 100)}%`);
</script>

<svelte:window onkeydown={keydown} />

<div class="editor" style="height:{height}px" bind:this={wrapEl}>
  <canvas
    bind:this={canvasEl}
    style="cursor:{cursor}"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointerleave={() => (hoverWorld = null)}
    ondblclick={onDoubleClick}
    oncontextmenu={onContextMenu}
    onwheel={onWheel}
  ></canvas>

  <div class="hud top-left">
    <div class="chip">{task.limb} · {task.measurements[0].label} → {task.measurements.at(-1).label}</div>
    <div class="chip sub">控制点 {points.length}</div>
    {#if mode === 'edit'}
      <div class="chip hint">双击加点 · 右键删点 · 拖动画布平移</div>
    {/if}
  </div>

  <div class="hud top-right">
    <button class="ic" onclick={() => zoomBy(1.24)} title="放大">＋</button>
    <button class="ic" onclick={() => zoomBy(0.8)} title="缩小">－</button>
    <button class="ic wide" onclick={resetView} title="复位视图">{zoomPct}</button>
  </div>

  <div class="hud bottom-left">
    {#if hoverSample}
      <div class="readout mono">
        <span class="lbl">x</span><b>{hoverSample.x.toFixed(1)}</b>
        <span class="lbl">r</span><b>{hoverSample.y.toFixed(2)}</b>
        <span class="sep"></span>
        <span class="lbl">κ</span><b class="accent">{(hoverSample.kappa * 1000).toFixed(2)}</b>
        <span class="lbl">×10⁻³/mm</span>
        <span class="lbl">ρ</span><b>{hoverSample.kappa > 1e-5 ? (1 / hoverSample.kappa).toFixed(0) : '∞'}</b>
        <span class="lbl">mm</span>
      </div>
    {:else if mode === 'edit'}
      <div class="readout hintbar">悬停曲线查看曲率 · 黄色标记为曲率突变区段</div>
    {/if}
  </div>

  {#if mode === 'edit' && activeIndex >= 0 && points[activeIndex]}
    <div class="hud bottom-right">
      <div class="coord">
        <span class="lbl mono">P{activeIndex + 1}</span>
        <label>x <input class="mono" type="number" step="1" value={points[activeIndex].x.toFixed(1)}
          oninput={(e) => applyPointEdit(activeIndex, { x: clamp(+e.currentTarget.value, view?.x0 ?? 0, view?.x1 ?? 400) })} /></label>
        <label>r <input class="mono" type="number" step="0.5" value={points[activeIndex].y.toFixed(1)}
          oninput={(e) => applyPointEdit(activeIndex, { y: clamp(+e.currentTarget.value, yMin, yMax) })} /></label>
        <button class="ic" title="删除该控制点" onclick={deleteActive} disabled={points.length <= 3}>✕</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .editor {
    position: relative; width: 100%; flex: 0 0 auto; border-radius: 10px; overflow: hidden;
    background: #0a1019; border: 1px solid var(--line-soft);
  }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }

  .hud { position: absolute; display: flex; gap: 6px; align-items: center; pointer-events: none; }
  .top-left { top: 10px; left: 12px; flex-wrap: wrap; max-width: 60%; }
  .top-right { top: 10px; right: 12px; pointer-events: auto; }
  .bottom-left { bottom: 9px; left: 12px; right: 210px; flex-wrap: wrap; }
  .bottom-right { bottom: 9px; right: 12px; pointer-events: auto; }

  .chip {
    font-size: 11px; padding: 3px 9px; border-radius: 6px;
    background: rgba(11, 20, 32, .84); border: 1px solid var(--line);
    color: var(--text-2); backdrop-filter: blur(6px);
  }
  .chip.sub { color: var(--text-3); }
  .chip.hint { color: #5f7a9c; }

  .ic {
    width: 28px; height: 26px; padding: 0; border-radius: 7px; font-size: 13px;
    background: rgba(11, 20, 32, .86); border-color: var(--line); backdrop-filter: blur(6px);
  }
  .ic.wide { width: 54px; font-size: 10.5px; font-family: var(--mono); }

  .readout {
    display: inline-flex; gap: 5px; align-items: baseline; flex-wrap: wrap;
    background: rgba(11, 20, 32, .86); border: 1px solid var(--line);
    border-radius: 7px; padding: 4px 10px; font-size: 11px;
    backdrop-filter: blur(6px);
  }
  .readout .lbl { color: var(--text-3); font-size: 10px; font-family: var(--sans); }
  .readout b { font-weight: 600; }
  .readout .accent { color: var(--accent); }
  .readout .sep { width: 1px; height: 11px; background: var(--line); margin: 0 3px; }
  .hintbar { color: var(--text-3); font-size: 10.5px; font-family: var(--sans); }

  .coord {
    display: flex; gap: 8px; align-items: center;
    background: rgba(11, 20, 32, .9); border: 1px solid var(--line);
    border-radius: 8px; padding: 5px 9px; font-size: 11px; color: var(--text-3);
  }
  .coord input { width: 60px; padding: 2px 5px; font-size: 11px; background: #0a1420; }
  .coord label { display: flex; align-items: center; gap: 4px; }
  .coord .lbl { color: var(--accent); }
  .coord .ic { width: 24px; height: 22px; font-size: 11px; }
</style>
