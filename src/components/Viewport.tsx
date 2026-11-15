import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { EditorStore } from '../store/editor';
import { createRenderer, type Renderer } from '../renderer/renderer';
import { buildScene, preloadPartImages } from '../lib/scene';
import { SCENE_H, SCENE_W } from '../renderer/textures';
import type { PartDef } from '../types';

interface Props {
  editor: EditorStore;
  onDropPart?: (partId: string, boneId: string | null) => void;
}

export default function Viewport(props: Props) {
  let canvasRef: HTMLCanvasElement | undefined;
  let overlayRef: HTMLCanvasElement | undefined;
  let renderer: Renderer | null = null;
  let raf = 0;
  let dragOver = false;
  const [rendererKind, setRendererKind] = createSignal<'webgpu' | 'canvas2d' | null>(null);

  const editor = props.editor;

  const drawOverlay = (scene: ReturnType<typeof buildScene>) => {
    const c = overlayRef;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== c.clientWidth * dpr) {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
    }
    const scale = Math.min(c.width / SCENE_W, c.height / SCENE_H);
    const ox = (c.width - SCENE_W * scale) / 2;
    const oy = (c.height - SCENE_H * scale) / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    for (const t of scene.texts) {
      ctx.fillStyle = t.color;
      ctx.font = `${t.size}px "Microsoft YaHei", "PingFang SC", sans-serif`;
      ctx.textAlign = t.align;
      ctx.textBaseline = 'middle';
      ctx.fillText(t.text, t.x, t.y);
    }
  };

  const frame = () => {
    const scene = buildScene(editor.doc, editor.time(), {
      showSkeleton: editor.showSkeleton(),
      showGuides: editor.showGuides(),
    });
    renderer?.render(scene);
    if (rendererKind() === 'webgpu') drawOverlay(scene);
    raf = requestAnimationFrame(frame);
  };

  onMount(async () => {
    if (!canvasRef) return;
    await preloadPartImages(editor.doc);
    renderer = await createRenderer(canvasRef);
    setRendererKind(renderer.kind);
    raf = requestAnimationFrame(frame);
  });

  onCleanup(() => {
    cancelAnimationFrame(raf);
    renderer?.dispose();
    renderer = null;
    setRendererKind(null);
  });

  // 外部文档替换(导入课件)后重新预加载贴图
  createEffect(() => {
    // 监听 parts 的 src/builtin 变化
    editor.doc.parts.map((p) => `${p.src}|${p.builtin}`).join(',');
    void preloadPartImages(editor.doc);
  });

  /** 画布坐标 → 场景坐标 */
  function toScene(e: MouseEvent) {
    const rect = canvasRef!.getBoundingClientRect();
    const sx = (e.clientX - rect.left) / rect.width * SCENE_W;
    const sy = (e.clientY - rect.top) / rect.height * SCENE_H;
    return { sx, sy };
  }

  function pickBone(e: MouseEvent) {
    const { sx, sy } = toScene(e);
    const poses = editor.poseAt(editor.time());
    // 命中关节点 14px 半径
    let hit: string | null = null;
    for (const [id, p] of poses) {
      if (Math.hypot(p.wx - sx, p.wy - sy) <= 14) {
        hit = id;
        break;
      }
    }
    if (hit) editor.setSelection({ kind: 'bone', id: hit });
  }

  function pickPartBone(e: DragEvent): string | null {
    const { sx, sy } = toScene(e as unknown as MouseEvent);
    const poses = editor.poseAt(editor.time());
    let hit: string | null = null;
    let best = 18;
    for (const [id, p] of poses) {
      const d = Math.hypot(p.wx - sx, p.wy - sy);
      if (d <= best) {
        best = d;
        hit = id;
      }
    }
    return hit;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    const partId = e.dataTransfer?.getData('text/part-id');
    if (!partId) return;
    const boneId = pickPartBone(e);
    props.onDropPart?.(partId, boneId);
  }

  return (
    <div
      class="viewport-wrap"
      onDragOver={(e) => {
        e.preventDefault();
        dragOver = true;
      }}
      onDragLeave={() => (dragOver = false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasRef} width={SCENE_W} height={SCENE_H} onClick={pickBone} />
      <Show when={rendererKind() === 'webgpu'}>
        <canvas ref={overlayRef} class="text-overlay" />
      </Show>
      <div class="viewport-toolbar">
        <button
          class={editor.showSkeleton() ? 'active' : ''}
          onClick={() => editor.setShowSkeleton(!editor.showSkeleton())}
        >
          骨骼层
        </button>
        <button
          class={editor.showGuides() ? 'active' : ''}
          onClick={() => editor.setShowGuides(!editor.showGuides())}
        >
          规范辅助线
        </button>
      </div>
      <div class="violation-toast">
        {editor.activeViolations().map((v) => (
          <div class="item" title={`${v.start.toFixed(1)}s ~ ${v.end.toFixed(1)}s`}>
            ⚠ {v.message}
          </div>
        ))}
      </div>
      <Show when={dragOver}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(47,128,237,0.12)', 'pointer-events': 'none' }} />
      </Show>
    </div>
  );
}

export function partDragData(part: PartDef): Record<string, string> {
  return { 'text/part-id': part.id };
}
