<script lang="ts">
  interface Props {
    values: number[];
    width?: number;
    height?: number;
    color?: string;
    fill?: boolean;
    /** index to mark */
    mark?: number;
    /** draw a dashed zero line and scale symmetrically around it */
    baseline?: boolean;
  }
  let { values, width = 96, height = 26, color = 'var(--teal)', fill = true, mark = -1, baseline = false }: Props = $props();

  const min = $derived(baseline ? -Math.max(0.5, ...values.map(Math.abs)) : Math.min(...values));
  const max = $derived(baseline ? Math.max(0.5, ...values.map(Math.abs)) : Math.max(...values));
  const span = $derived(max - min || 1);

  const pts = $derived(
    values.map((v, i) => {
      const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return { x, y };
    })
  );

  const line = $derived(pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '));
  const area = $derived(`0,${height} ${line} ${width},${height}`);
</script>

<svg {width} {height} viewBox={`0 0 ${width} ${height}`} class="spark" aria-hidden="true">
  {#if fill}
    <polygon points={area} fill={color} opacity="0.1" />
  {/if}
  {#if baseline}
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#2c7d84" stroke-width="0.5" stroke-dasharray="3 3" opacity="0.8" />
  {/if}
  <polyline points={line} fill="none" stroke={color} stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
  {#if mark >= 0 && pts[mark]}
    <circle cx={pts[mark].x} cy={pts[mark].y} r="2.4" fill={color} stroke="var(--bg)" stroke-width="1.2" />
  {/if}
</svg>

<style>
  .spark {
    display: block;
    overflow: visible;
  }
</style>
