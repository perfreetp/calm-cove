import React, { useEffect, useRef, useState } from 'react';
import { EarRenderer } from '../webgl/EarRenderer';
import type { GeoModel } from '../lib/geom';

export function Preview3D({
  model,
  mode = 'solid',
  threshold = 0.67,
  height,
  showHandles = false,
  interactive = true,
}: {
  model: GeoModel;
  mode?: 'solid' | 'curv' | 'thick';
  threshold?: number;
  height?: number | string;
  showHandles?: boolean;
  interactive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const r = useRef<EarRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [rot, setRot] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let rend: EarRenderer;
    try {
      rend = new EarRenderer(canvas);
    } catch {
      return;
    }
    r.current = rend;
    rend.camera = { yaw: -0.7, pitch: 0.3, dist: 68, target: [0, 3.6, -7.2] };
    setReady(true);
    let t0 = performance.now();
    let raf = 0;
    const loop = () => {
      if (rot) rend.camera.yaw += 0.0026;
      rend.render((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rend.dispose();
      r.current = null;
    };
  }, []);

  useEffect(() => {
    const rend = r.current;
    if (!rend || !ready) return;
    rend.setModel(model);
    rend.mode = mode;
    rend.threshold = threshold;
  }, [model, mode, threshold, ready]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      let lx = e.clientX;
      let ly = e.clientY;
      const shift = e.shiftKey;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - lx;
        const dy = ev.clientY - ly;
        lx = ev.clientX;
        ly = ev.clientY;
        if (shift || ev.buttons === 4) r.current?.pan(dx, dy);
        else r.current?.orbit(dx, dy);
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      r.current?.zoom(e.deltaY);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('wheel', wheel);
    };
  }, [interactive, ready]);

  return (
    <div className="viewer" style={{ height: height ?? '100%', minHeight: 0 }}>
      <canvas ref={ref} style={{ cursor: interactive ? 'grab' : 'default' }} />
      {interactive && (
        <div className="viewer-overlay">
          <div className="vp-tools" style={{ top: 8, left: 8 }}>
            <button className={`icon-btn ${rot ? 'on' : ''}`} onClick={() => setRot((v) => !v)} title="自动旋转">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M20 12a8 8 0 1 1-2.6-5.8" />
                <path d="M20 4v4.6h-4.6" />
              </svg>
            </button>
            <button className="icon-btn" onClick={() => r.current?.fit()} title="复位">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="12" cy="12" r="7" />
                <circle cx="12" cy="12" r="2.2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
