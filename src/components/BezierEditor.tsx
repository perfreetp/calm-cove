import { createMemo, onCleanup, onMount } from 'solid-js';
import type { Easing } from '../core/types';
import { applyEasing, bezierSamples } from '../core/easing';

export interface BezierEditorProps {
  easing: Easing;
  onChange: (easing: Easing) => void;
}

const PAD = 16;

export function BezierEditor(props: BezierEditorProps) {
  let svgRef: SVGSVGElement | undefined;
  let dragHandle: 'p1' | 'p2' | null = null;

  const point1 = createMemo(() => {
    const e = props.easing;
    return e.type === 'bezier' ? e.p1 : { x: 0.42, y: 0 };
  });
  const point2 = createMemo(() => {
    const e = props.easing;
    return e.type === 'bezier' ? e.p2 : { x: 0.58, y: 1 };
  });

  const size = () => {
    if (!svgRef) return { w: 240, h: 200 };
    const rect = svgRef.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  };

  const toScreen = (x: number, y: number) => {
    const s = size();
    return { x: PAD + x * (s.w - PAD * 2), y: s.h - PAD - y * (s.h - PAD * 2) };
  };

  const fromScreen = (px: number, py: number) => {
    const s = size();
    return {
      x: Math.min(1, Math.max(0, (px - PAD) / Math.max(1, s.w - PAD * 2))),
      y: Math.min(2, Math.max(-1, (s.h - PAD - py) / Math.max(1, s.h - PAD * 2))),
    };
  };

  const samples = createMemo(() => bezierSamples(point1(), point2(), 40));

  const pathD = createMemo(() => {
    const pts = samples().map((p) => toScreen(p.x, p.y));
    return `M ${pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`;
  });

  onMount(() => {
    const move = (e: PointerEvent) => {
      if (!dragHandle || !svgRef) return;
      const rect = svgRef.getBoundingClientRect();
      const p = fromScreen(e.clientX - rect.left, e.clientY - rect.top);
      const cur = {
        p1: { ...point1() },
        p2: { ...point2() },
      };
      cur[dragHandle] = p;
      props.onChange({ type: 'bezier', p1: cur.p1, p2: cur.p2 });
    };
    const up = () => {
      dragHandle = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    onCleanup(() => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    });
  });

  const s1 = () => toScreen(point1().x, point1().y);
  const s2 = () => toScreen(point2().x, point2().y);
  const origin = () => toScreen(0, 0);
  const end = () => toScreen(1, 1);

  return (
    <div class="bezier-editor">
      <svg ref={svgRef} viewBox={`0 0 ${size().w} ${size().h}`} preserveAspectRatio="none">
        <rect
          x={PAD}
          y={PAD}
          width={size().w - PAD * 2}
          height={size().h - PAD * 2}
          fill="rgba(255,255,255,0.02)"
          stroke="#22303f"
        />
        <line
          x1={PAD}
          y1={size().h - PAD}
          x2={size().w - PAD}
          y2={PAD}
          stroke="rgba(120,150,180,0.3)"
          stroke-dasharray="4 4"
        />
        <path d={pathD()} fill="none" stroke="var(--violet)" stroke-width="2.2" />
        <line
          x1={origin().x}
          y1={origin().y}
          x2={s1().x}
          y2={s1().y}
          stroke="rgba(167,139,250,0.45)"
          stroke-width="1"
        />
        <line x1={end().x} y1={end().y} x2={s2().x} y2={s2().y} stroke="rgba(167,139,250,0.45)" stroke-width="1" />
        <circle cx={origin().x} cy={origin().y} r="3.4" fill="#8fb7d1" />
        <circle cx={end().x} cy={end().y} r="3.4" fill="#8fb7d1" />
        <circle
          class="bezier-handle"
          cx={s1().x}
          cy={s1().y}
          r="6"
          fill="#a78bfa"
          stroke="#e5dcff"
          stroke-width="1.4"
          onPointerDown={(e) => {
            e.preventDefault();
            dragHandle = 'p1';
          }}
        />
        <circle
          class="bezier-handle"
          cx={s2().x}
          cy={s2().y}
          r="6"
          fill="#a78bfa"
          stroke="#e5dcff"
          stroke-width="1.4"
          onPointerDown={(e) => {
            e.preventDefault();
            dragHandle = 'p2';
          }}
        />
      </svg>
    </div>
  );
}

export interface EasingSwatchProps {
  easing: Easing;
  label?: string;
}

export function EasingSwatch(props: EasingSwatchProps) {
  const samples = createMemo(() => {
    if (props.easing.type === 'linear') {
      return Array.from({ length: 17 }, (_, i) => applyEasing(props.easing, i / 16));
    }
    if (props.easing.type === 'easeInOut') {
      return Array.from({ length: 17 }, (_, i) => applyEasing(props.easing, i / 16));
    }
    return Array.from({ length: 17 }, (_, i) => applyEasing(props.easing, i / 16));
  });
  return (
    <svg width="46" height="20" viewBox="0 0 46 20" style={{ display: 'block' }}>
      <path
        d={samples()
          .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / 16) * 44 + 1} ${19 - Math.min(1, Math.max(-0.2, v)) * 17}`)
          .join(' ')}
        fill="none"
        stroke="var(--violet)"
        stroke-width="1.6"
      />
    </svg>
  );
}
