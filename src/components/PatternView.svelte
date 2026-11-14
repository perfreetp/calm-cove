<script>
  import { paint } from '../lib/offscreen.js';
  import { drawPattern } from '../lib/render.js';

  let {
    pattern = null,
    offsetMM = 0,
    taskTitle = '',
    studentName = '',
    height = 320,
    paper = null,
    showGrid = true,
    showDims = true,
  } = $props();

  let canvasEl = $state(null);
  let wrapEl = $state(null);
  let size = $state({ w: 700, h: height });

  $effect(() => {
    if (!wrapEl) return;
    const apply = () => { size = { w: Math.max(280, wrapEl.clientWidth), h: height }; };
    const ro = new ResizeObserver(apply);
    ro.observe(wrapEl);
    apply();
    return () => ro.disconnect();
  });

  $effect(() => {
    const deps = [pattern, size, offsetMM, taskTitle, studentName, showGrid, showDims, paper];
    if (!canvasEl || !size.w) return;
    const raf = requestAnimationFrame(() => {
      paint(canvasEl, (ctx, w, h, dpr) => {
        drawPattern(ctx, {
          width: w, height: h, dpr, pattern, offsetMM, taskTitle, studentName,
          showGrid, showDims, paper,
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  });

  export function toDataURL() {
    return canvasEl?.toDataURL('image/png');
  }

  export function getCanvas() {
    return canvasEl;
  }
</script>

<div class="wrap" style="height:{height}px" bind:this={wrapEl}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .wrap {
    width: 100%; border-radius: 10px; overflow: hidden;
    border: 1px solid #d7d2c4; background: #f7f4ec;
    box-shadow: 0 4px 18px rgba(0, 0, 0, .35);
  }
  canvas { display: block; width: 100%; height: 100%; }
</style>
