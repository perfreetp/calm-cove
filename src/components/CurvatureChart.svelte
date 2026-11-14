<script>
  // 曲率实时曲线：κ 随轴向位置变化，超阈值斜率区段标黄
  import { paint } from '../lib/offscreen.js';
  import { clamp } from '../lib/geometry.js';

  let { samples = [], abrupt = [], view = null, height = 78, threshold = 0.0016 } = $props();
  let canvasEl = $state(null);
  let wrapEl = $state(null);
  let size = $state({ w: 600, h: height });

  $effect(() => {
    if (!wrapEl) return;
    const apply = () => { size = { w: Math.max(240, wrapEl.clientWidth), h: height }; };
    const ro = new ResizeObserver(apply);
    ro.observe(wrapEl);
    apply();
    return () => ro.disconnect();
  });

  $effect(() => {
    if (!canvasEl || !size.w || !samples.length) return;
    const raf = requestAnimationFrame(() => {
      paint(canvasEl, (ctx, w, h, dpr) => {
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(10,16,25,.6)';
        ctx.fillRect(0, 0, w, h);

        const padL = 46;
        const padR = 14;
        const top = 18;
        const bottom = h - 15;
        const x0 = samples[0].x;
        const x1 = samples[samples.length - 1].x;
        // 用 95 分位作为量程上限，避免单个尖峰把整体压平
        const ks = samples.map((p) => p.kappa).sort((a, b) => a - b);
        const p95 = ks[Math.min(ks.length - 1, Math.floor(ks.length * 0.95))] ?? 0;
        const maxK = ks[ks.length - 1] ?? 0;
        const kMax = Math.max(p95 * 1.25, threshold * 3.2, 1e-9);
        const mapX = (x) => padL + ((x - x0) / Math.max(x1 - x0, 1)) * (w - padL - padR);
        const mapY = (k) => bottom - (Math.min(k, kMax) / kMax) * (bottom - top);

        // 阈值线
        ctx.strokeStyle = 'rgba(243,193,75,.45)';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padL, mapY(threshold));
        ctx.lineTo(w - padR, mapY(threshold));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(243,193,75,.65)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('突变阈值', padL - 6, mapY(threshold) + 3);

        // 区段底色
        for (const seg of abrupt) {
          const a = mapX(seg.startMM);
          const b = mapX(seg.endMM);
          ctx.fillStyle = 'rgba(243,193,75,.1)';
          ctx.fillRect(a, top, Math.max(1.5, b - a), bottom - top);
        }

        // κ 曲线
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
          const px = mapX(samples[i].x);
          const py = mapY(samples[i].kappa);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(70,211,197,.9)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // 面积填充
        ctx.beginPath();
        ctx.moveTo(mapX(samples[0].x), bottom);
        for (const p of samples) ctx.lineTo(mapX(p.x), mapY(p.kappa));
        ctx.lineTo(mapX(samples[samples.length - 1].x), bottom);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, 'rgba(70,211,197,.16)');
        g.addColorStop(1, 'rgba(70,211,197,.02)');
        ctx.fillStyle = g;
        ctx.fill();

        // 轴标签
        ctx.fillStyle = 'rgba(150,180,220,.75)';
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('κ', 8, top + 12);
        ctx.fillStyle = 'rgba(120,150,185,.55)';
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillText('10⁻³/mm', 8, top + 22);
        ctx.fillStyle = 'rgba(150,180,220,.5)';
        ctx.font = '9px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${x0.toFixed(0)}`, padL, h - 4);
        ctx.textAlign = 'right';
        ctx.fillText(`${x1.toFixed(0)} mm`, w - padR, h - 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(160,190,225,.62)';
        ctx.font = '8.5px ui-monospace, monospace';
        ctx.fillText(`${(kMax * 1000).toFixed(1)}`, padL - 5, top + 2);
        if (maxK > kMax) {
          ctx.fillStyle = 'rgba(243,193,75,.8)';
          ctx.textAlign = 'left';
          ctx.fillText(`峰值 ${(maxK * 1000).toFixed(0)}`, padL + 4, top + 2);
        }
        ctx.restore();
      });
    });
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="chart" style="height:{height}px" bind:this={wrapEl}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .chart { width: 100%; border-radius: 8px; overflow: hidden; border: 1px solid var(--line-soft); }
  canvas { display: block; width: 100%; height: 100%; }
</style>
