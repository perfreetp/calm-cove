import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import {
  buildScene,
  poseAngleFromPointer,
  rigToScreen,
  snapPivot,
  worldPointerToRig,
  type CameraState,
} from '../core/scene';
import type { Rig, TrackMap, Vec2 } from '../core/types';
import { SceneRenderer, type RendererBackend } from '../render/renderer';
import { buildDrawList, type DrawList } from '../render/drawlist';

export type StageDragMode = 'select' | 'rotate' | 'pivot';

export interface StageProps {
  rig: Rig;
  tracks: TrackMap;
  time: number;
  selectedBoneId?: string | null;
  hoverBoneId?: string | null;
  showBones: boolean;
  boneAlpha?: number;
  showGuides?: boolean;
  showLabels?: boolean;
  poseOverrides?: Record<string, { rotation?: number; x?: number; y?: number }>;
  /** Restrict permanent labels to these bones; selected/hovered always show. */
  labelBones?: string[];
  interactive?: boolean;
  dragMode?: StageDragMode;
  onSelectBone?: (boneId: string | null) => void;
  onHoverBone?: (boneId: string | null) => void;
  onCamera?: (camera: CameraState) => void;
  /** Called continuously while dragging a bone; `commit=false` during move. */
  onRotateBone?: (boneId: string, degrees: number, commit: boolean) => void;
  onMovePivot?: (boneId: string, point: Vec2, commit: boolean) => void;
  /** Extra class for layout embedding. */
  class?: string;
}

export function Stage(props: StageProps) {
  let canvasRef: HTMLCanvasElement | undefined;
  let hostRef: HTMLDivElement | undefined;
  let renderer: SceneRenderer | null = null;
  const [backend, setBackend] = createSignal<RendererBackend>('none');
  const [camera, setCamera] = createSignal<CameraState>({ zoom: 1, panX: 0, panY: 0 });
  const [size, setSize] = createSignal<{ x: number; y: number }>({ x: 0, y: 0 });
  const [panning, setPanning] = createSignal(false);
  const [localHover, setLocalHover] = createSignal<string | null>(null);
  const [ready, setReady] = createSignal(false);
  let drawList: DrawList | null = null;

  const drag = {
    active: false,
    boneId: '' as string,
    kind: 'rotate' as 'rotate' | 'pivot',
    grabOffset: 0,
    startPivot: { x: 0, y: 0 } as Vec2,
    startPointer: { x: 0, y: 0 } as Vec2,
    moved: false,
  };
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  const hoverId = () => (props.hoverBoneId !== undefined ? props.hoverBoneId : localHover());

  const scene = createMemo(() =>
    buildScene(props.rig, props.tracks, {
      time: props.time,
      showBones: props.showBones,
      showLabels: props.showLabels ?? true,
      selectedBoneId: props.selectedBoneId ?? null,
      hoverBoneId: hoverId(),
      poseOverrides: props.poseOverrides,
      labelBones: props.labelBones,
    }),
  );

  const drawOptions = () => ({
    showBones: props.showBones,
    boneAlpha: props.boneAlpha ?? 1,
    showGuides: props.showGuides ?? true,
    selectedBoneId: props.selectedBoneId ?? null,
    hoverBoneId: hoverId(),
  });

  const redraw = () => {
    if (!renderer || !canvasRef) return;
    const vpSize = size();
    if (vpSize.x <= 0 || vpSize.y <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cam = camera();
    drawList = buildDrawList({
      scene: scene(),
      rig: props.rig,
      camera: cam,
      viewport: { x: vpSize.x, y: vpSize.y },
      options: drawOptions(),
    });
    renderer.render(drawList, {
      width: vpSize.x,
      height: vpSize.y,
      dpr,
      zoom: cam.zoom,
      panX: cam.panX,
      panY: cam.panY,
      rigWidth: props.rig.rigWidth,
      rigHeight: props.rig.rigHeight,
      background: [0.043, 0.063, 0.086, 1],
    });
    void drawList;
  };

  onMount(() => {
    let alive = true;

    // Measure before the async renderer exists: the first draw otherwise runs
    // against a 0×0 viewport and never gets a size-change event to retry with.
    if (hostRef) {
      const rect = hostRef.getBoundingClientRect();
      setSize({ x: rect.width, y: rect.height });
    }

    (async () => {
      if (!canvasRef) return;
      renderer = await SceneRenderer.create(canvasRef);
      if (!alive) {
        renderer.destroy();
        return;
      }
      setBackend(renderer.backend);
      setReady(true);
      redraw();
    })();

    const observer = new ResizeObserver(() => {
      if (!hostRef) return;
      const rect = hostRef.getBoundingClientRect();
      setSize({ x: rect.width, y: rect.height });
      redraw();
    });
    if (hostRef) observer.observe(hostRef);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        resetCamera();
      }
    };
    window.addEventListener('keydown', onKey);

    onCleanup(() => {
      alive = false;
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
      renderer?.destroy();
      renderer = null;
    });
  });

  createEffect(() => {
    scene();
    props.showBones;
    props.showLabels;
    props.showGuides;
    props.boneAlpha;
    camera();
    size();
    props.selectedBoneId;
    hoverId();
    props.poseOverrides;
    props.labelBones;
    if (ready()) redraw();
  });

  createEffect(() => {
    props.onCamera?.(camera());
  });

  const screenOfRig = (x: number, y: number) => rigToScreen({ x, y }, camera(), size(), props.rig);

  function pickBone(clientX: number, clientY: number): { id: string; onJoint: boolean } | null {
    if (!canvasRef) return null;
    const rect = canvasRef.getBoundingClientRect();
    const pointer = { x: clientX - rect.left, y: clientY - rect.top };
    const rigPoint = worldPointerToRig(pointer, camera(), size(), props.rig);
    let best: { id: string; dist: number; onJoint: boolean } | null = null;
    const zoomScale = Math.min(size().x / props.rig.rigWidth, size().y / props.rig.rigHeight) * camera().zoom;
    const threshold = 15 / Math.max(0.001, zoomScale);
    const jointThreshold = 18 / Math.max(0.001, zoomScale);
    for (const sb of scene().bones) {
      const jointDist = Math.hypot(rigPoint.x - sb.pivot.x, rigPoint.y - sb.pivot.y);
      if (jointDist <= jointThreshold && (!best || jointDist < best.dist)) {
        best = { id: sb.bone.id, dist: jointDist, onJoint: true };
      }
      const dx = sb.tip.x - sb.pivot.x;
      const dy = sb.tip.y - sb.pivot.y;
      const lenSq = dx * dx + dy * dy;
      const t =
        lenSq < 1e-6
          ? 0
          : Math.max(0, Math.min(1, ((rigPoint.x - sb.pivot.x) * dx + (rigPoint.y - sb.pivot.y) * dy) / lenSq));
      const px = sb.pivot.x + dx * t;
      const py = sb.pivot.y + dy * t;
      const dist = Math.hypot(rigPoint.x - px, rigPoint.y - py);
      if (dist <= threshold && (!best || dist < best.dist)) best = { id: sb.bone.id, dist, onJoint: false };
    }
    return best ? { id: best.id, onJoint: best.onJoint } : null;
  }

  function rigPointOf(e: PointerEvent): Vec2 {
    const rect = canvasRef!.getBoundingClientRect();
    return worldPointerToRig({ x: e.clientX - rect.left, y: e.clientY - rect.top }, camera(), size(), props.rig);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button === 1 || e.button === 2 || e.altKey) {
      setPanning(true);
      panStart = { x: e.clientX, y: e.clientY, panX: camera().panX, panY: camera().panY };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (!props.interactive) return;
    const hit = pickBone(e.clientX, e.clientY);
    if (hit) props.onSelectBone?.(hit.id);
    else if (!e.shiftKey) props.onSelectBone?.(null);

    if (!hit) return;
    const sb = scene().bones.find((b) => b.bone.id === hit.id);
    if (!sb) return;
    const mode = props.dragMode ?? 'select';

    const pointer = rigPointOf(e);
    if (mode === 'pivot') {
      drag.active = true;
      drag.boneId = hit.id;
      drag.kind = 'pivot';
      drag.startPivot = { ...sb.pivot };
      drag.startPointer = pointer;
      drag.moved = false;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (mode === 'rotate') {
      const pointerAngle = (Math.atan2(pointer.y - sb.pivot.y, pointer.x - sb.pivot.x) * 180) / Math.PI;
      drag.active = true;
      drag.boneId = hit.id;
      drag.kind = 'rotate';
      drag.grabOffset = sb.angle - poseAngleFromPointer(sb, pointer);
      drag.startPointer = pointer;
      drag.moved = false;
      void pointerAngle;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (panning()) {
      setCamera((c) => ({
        ...c,
        panX: panStart.panX + (e.clientX - panStart.x),
        panY: panStart.panY + (e.clientY - panStart.y),
      }));
      return;
    }
    if (drag.active) {
      const sb = scene().bones.find((b) => b.bone.id === drag.boneId);
      if (!sb) return;
      const pointer = rigPointOf(e);
      if (drag.kind === 'rotate') {
        const angle = poseAngleFromPointer(sb, pointer) + drag.grabOffset;
        drag.moved = true;
        props.onRotateBone?.(drag.boneId, angle, false);
      } else {
        const next = snapPivot({
          x: drag.startPivot.x + (pointer.x - drag.startPointer.x),
          y: drag.startPivot.y + (pointer.y - drag.startPointer.y),
        });
        drag.moved = true;
        props.onMovePivot?.(drag.boneId, next, false);
      }
      return;
    }
    const hit = pickBone(e.clientX, e.clientY);
    setLocalHover(hit?.id ?? null);
    props.onHoverBone?.(hit?.id ?? null);
    if (canvasRef) {
      canvasRef.style.cursor =
        props.interactive && hit
          ? props.dragMode === 'rotate'
            ? 'grab'
            : props.dragMode === 'pivot'
              ? 'move'
              : 'pointer'
          : 'default';
    }
  }

  function endDrag(e: PointerEvent) {
    if (panning()) {
      setPanning(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (drag.active) {
      const sb = scene().bones.find((b) => b.bone.id === drag.boneId);
      if (sb) {
        if (drag.kind === 'rotate') {
          props.onRotateBone?.(drag.boneId, sb.angle, true);
        } else {
          props.onMovePivot?.(drag.boneId, { x: sb.pivot.x, y: sb.pivot.y }, true);
        }
      }
      drag.active = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  }

  function resetCamera() {
    setCamera({ zoom: 1, panX: 0, panY: 0 });
  }

  function zoomBy(factor: number) {
    setCamera((c) => ({ ...c, zoom: Math.min(4, Math.max(0.35, c.zoom * factor)) }));
  }

  return (
    <div class={`stage ${props.class ?? ''}`} ref={hostRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          setLocalHover(null);
          props.onHoverBone?.(null);
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomBy(e.deltaY < 0 ? 1.08 : 0.93);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div class="stage-overlay">
        <Show when={props.showLabels ?? true}>
          <For each={scene().labels}>
            {(label) => {
              const pos = () => screenOfRig(label.at.x, label.at.y);
              const violating = () => label.kind === 'bone' && label.color[0] > 0.9 && label.color[1] < 0.5;
              return (
                <div
                  class="label"
                  classList={{ violating: violating() }}
                  style={{
                    left: `${pos().x}px`,
                    top: `${pos().y}px`,
                    color: `rgba(${label.color.map((c) => Math.round(c * 255)).join(',')})`,
                  }}
                >
                  {label.text}
                </div>
              );
            }}
          </For>
        </Show>
      </div>
      <div class="stage-hud">
        <span class="pill" title="渲染后端">
          {backend() === 'webgpu' ? 'WebGPU' : backend() === 'canvas2d' ? 'Canvas2D 回退' : '初始化中…'}
        </span>
        <span class="pill">{Math.round(camera().zoom * 100)}%</span>
        <Show when={props.selectedBoneId}>
          <span class="pill">{scene().bones.find((b) => b.bone.id === props.selectedBoneId)?.bone.name}</span>
        </Show>
      </div>
      <div class="stage-tools">
        <button class="small" title="放大 (Ctrl+滚轮)" onClick={() => zoomBy(1.15)}>
          ＋
        </button>
        <button class="small" title="缩小 (Ctrl+滚轮)" onClick={() => zoomBy(0.87)}>
          －
        </button>
        <button class="small" title="重置视图 (Ctrl+0)" onClick={resetCamera}>
          重置
        </button>
      </div>
      <Show when={scene().bones.some((b) => b.violating)}>
        <div class="stage-alert">
          {(() => {
            const bad = scene().bones.filter((b) => b.violating);
            return `${bad.map((b) => b.bone.name).join('、')} 超出关节活动角度`;
          })()}
        </div>
      </Show>
    </div>
  );
}
