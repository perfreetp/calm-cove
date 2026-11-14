<script>
  import { paint } from '../lib/offscreen.js';
  import { drawScarMap } from '../lib/render.js';

  let { scars = [], span = [0, 300], limbName = '', height = 128 } = $props();
  let canvasEl = $state(null);
  let wrapEl = $state(null);
  let size = $state({ w: 400, h: height });

  $effect(() => {
    if (!wrapEl) return;
    const apply = () => { size = { w: Math.max(200, wrapEl.clientWidth), h: height }; };
    const ro = new ResizeObserver(apply);
    ro.observe(wrapEl);
    apply();
    return () => ro.disconnect();
  });

  $effect(() => {
    const deps = [scars, size, span, limbName];
    if (!canvasEl || !size.w) return;
    const raf = requestAnimationFrame(() => {
      paint(canvasEl, (ctx, w, h, dpr) => {
        drawScarMap(ctx, { width: w, height: h, dpr, scars, span, limbName });
      });
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="map" style="height:{height}px" bind:this={wrapEl}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .map { width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid var(--line-soft); }
  canvas { display: block; width: 100%; height: 100%; }
</style>
