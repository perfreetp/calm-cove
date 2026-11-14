// ---------- 立面画布组件：WebGPU 渲染 + 缩放平移 + 跨选择 ----------
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Span, Violation } from "../types";
import { createRenderer, type Renderer, type View } from "../gpu/renderer";
import { buildScene } from "../gpu/scene";

interface Props {
  spans: Span[];
  violations: Violation[];
  selectedSpan: number | null;
  onSelectSpan?: (i: number | null) => void;
  height?: number;
}

export default function ElevationCanvas(props: Props) {
  let canvas!: HTMLCanvasElement;
  let wrap!: HTMLDivElement;
  let renderer: Renderer | null = null;
  const [backend, setBackend] = createSignal<string>("初始化…");
  const [view, setView] = createSignal<View>({ scale: 40, offsetX: 20, offsetY: 60 });
  const [size, setSize] = createSignal({ w: 800, h: 320 });

  const scene = createMemo(() => buildScene(props.spans, props.violations, props.selectedSpan));

  function fitView() {
    const s = scene();
    const { w, h } = size();
    const worldW = s.maxX - s.minX;
    const worldH = s.maxY + 1.6;
    const scale = Math.min((w - 40) / worldW, (h - 60) / worldH);
    setView({ scale, offsetX: 20 - s.minX * scale, offsetY: 30 });
  }

  function draw() {
    const { w, h } = size();
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    renderer?.render(scene().rects, view(), w, h);
  }

  onMount(async () => {
    const ro = new ResizeObserver(() => {
      setSize({ w: wrap.clientWidth, h: wrap.clientHeight });
    });
    ro.observe(wrap);
    onCleanup(() => ro.disconnect());
    renderer = await createRenderer(canvas);
    setBackend(renderer.backend === "webgpu" ? "WebGPU" : "Canvas2D(降级)");
    fitView();
  });
  onCleanup(() => renderer?.dispose());

  createEffect(() => {
    scene();
    view();
    size();
    draw();
  });

  // 交互：拖拽平移 / 滚轮缩放 / 点击选跨
  let dragging = false;
  let moved = 0;
  let lastX = 0;
  let lastY = 0;

  function onDown(e: PointerEvent) {
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX;
    lastY = e.clientY;
    const v = view();
    setView({ ...v, offsetX: v.offsetX + dx, offsetY: v.offsetY - dy });
  }
  function onUp(e: PointerEvent) {
    dragging = false;
    if (moved < 4 && props.onSelectSpan) {
      // 像素 -> 世界 -> 命中跨
      const rect = canvas.getBoundingClientRect();
      const v = view();
      const wx = (e.clientX - rect.left - v.offsetX) / v.scale;
      const hit = props.spans.find((s) => wx >= s.startStake && wx <= s.startStake + s.width);
      props.onSelectSpan(hit ? hit.index : null);
    }
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const v = view();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const ns = Math.min(400, Math.max(4, v.scale * factor));
    // 以鼠标位置为中心缩放
    const wx = (mx - v.offsetX) / v.scale;
    setView({ ...v, scale: ns, offsetX: mx - wx * ns });
  }

  const labelStyle = (x: number, y: number) => {
    const v = view();
    return {
      left: `${x * v.scale + v.offsetX}px`,
      top: `${size().h - (y * v.scale + v.offsetY)}px`,
    };
  };

  return (
    <div ref={wrap} class="canvas-wrap" style={{ height: `${props.height ?? 340}px` }}>
      <canvas
        ref={canvas}
        style={{ width: "100%", height: "100%", display: "block", cursor: "grab" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onWheel={onWheel}
      />
      {scene().labels.map((l) => (
        <div class={`cv-label cv-${l.kind}`} style={labelStyle(l.x, l.y)}>
          {l.text}
        </div>
      ))}
      <div class="cv-badge">{backend()} · 滚轮缩放 / 拖拽平移 / 点击选跨</div>
      <button class="cv-fit" onClick={fitView}>
        适应视图
      </button>
      <Show when={props.violations.length > 0}>
        <div class="cv-viol-count">⚠ {props.violations.length} 处不合规</div>
      </Show>
    </div>
  );
}
