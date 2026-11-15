import { createMemo, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type {
  AnimationDoc,
  BoneDef,
  EasingType,
  Keyframe,
  PartDef,
  Violation,
} from '../types';
import { getNode, uid } from '../data/constants';
import { autoScore, detectViolations } from '../lib/rules';
import { evaluatePose, sampleTrack } from '../lib/animation';

export type SelectionKind = 'bone' | 'part' | 'metric' | null;

export interface Selection {
  kind: SelectionKind;
  id: string | null;
}

export function createEditorStore(initial: AnimationDoc) {
  const [doc, setDoc] = createStore<AnimationDoc>(structuredClone(initial));
  const [time, setTime] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [selection, setSelection] = createSignal<Selection>({ kind: 'bone', id: 'forearm' });
  const [showSkeleton, setShowSkeleton] = createSignal(true);
  const [showGuides, setShowGuides] = createSignal(true);
  const [fps] = createSignal(30);

  let rafId: number | null = null;
  let lastTs: number | null = null;

  const violations = createMemo<Violation[]>(() => detectViolations(doc));
  const score = createMemo(() => autoScore(doc));

  /** 当前时间点落在哪些违规区间(时间轴标红 + 视图提示) */
  const activeViolations = createMemo(() => {
    const t = time();
    return violations().filter((x) => t >= x.start - 0.25 && t <= x.end + 0.25);
  });

  function tick(ts: number) {
    if (lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    let next = time() + dt;
    if (next >= doc.duration) {
      next = 0;
    }
    setTime(Number(next.toFixed(3)));
    if (playing()) rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing()) return;
    if (time() >= doc.duration) setTime(0);
    setPlaying(true);
    lastTs = null;
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    setPlaying(false);
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function togglePlay() {
    playing() ? pause() : play();
  }

  function seek(t: number) {
    setTime(Math.min(doc.duration, Math.max(0, Number(t.toFixed(3)))));
  }

  function touch() {
    setDoc('updatedAt', Date.now());
  }

  /* ---------------- 关键帧 ---------------- */

  function addKeyframe(track: string, kind: Keyframe['kind'], value: number, easing: EasingType = 'easeInOut') {
    const at = time();
    setDoc(
      'keyframes',
      produce((frames) => {
        const idx = frames.findIndex((f) => f.track === track && Math.abs(f.time - at) < 1e-6);
        const frame: Keyframe = { id: uid('kf'), time: at, track, kind, value, easing };
        if (idx >= 0) frames[idx] = frame;
        else frames.push(frame);
      }),
    );
    touch();
  }

  function updateKeyframe(id: string, patch: Partial<Keyframe>) {
    setDoc(
      'keyframes',
      produce((frames) => {
        const idx = frames.findIndex((f) => f.id === id);
        if (idx < 0) return;
        frames[idx] = { ...frames[idx], ...patch };
      }),
    );
    touch();
  }

  function deleteKeyframe(id: string) {
    setDoc(
      'keyframes',
      produce((frames) => {
        const idx = frames.findIndex((f) => f.id === id);
        if (idx >= 0) frames.splice(idx, 1);
      }),
    );
    touch();
  }

  function selectedTrackFrames(): Keyframe[] {
    const sel = selection();
    if (!sel.id || !sel.kind) return [];
    return doc.keyframes.filter((f) => f.track === sel.id).sort((a, b) => a.time - b.time);
  }

  /** 当前选中轨道在当前时间的值(无关键帧时回退静息角/0) */
  function selectedCurrentValue(): number {
    const sel = selection();
    if (!sel.id) return 0;
    const v = sampleTrack(doc.keyframes, sel.id, time());
    if (v !== null) return v;
    if (sel.kind === 'bone') {
      const bone = doc.bones.find((b) => b.id === sel.id);
      return bone ? bone.restAngle : 0;
    }
    return 0;
  }

  /* ---------------- 骨骼 ---------------- */

  function updateBone(id: string, patch: Partial<BoneDef>) {
    setDoc(
      'bones',
      produce((bones) => {
        const idx = bones.findIndex((b) => b.id === id);
        if (idx >= 0) bones[idx] = { ...bones[idx], ...patch };
      }),
    );
    touch();
  }

  function setBoneParent(id: string, parentId: string | null) {
    if (id === parentId) return;
    // 防止成环
    if (parentId !== null) {
      let cursor: string | null = parentId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === id) return;
        if (seen.has(cursor)) return;
        seen.add(cursor);
        cursor = doc.bones.find((b) => b.id === cursor)?.parentId ?? null;
      }
    }
    updateBone(id, { parentId });
  }

  /** 拖拽绑骨:把拆件绑定到骨骼 */
  function bindPart(partId: string, boneId: string | null) {
    setDoc(
      'parts',
      produce((parts) => {
        const p = parts.find((x) => x.id === partId);
        if (p) p.boneId = boneId;
      }),
    );
    touch();
  }

  function updatePart(id: string, patch: Partial<PartDef>) {
    setDoc(
      'parts',
      produce((parts) => {
        const idx = parts.findIndex((p) => p.id === id);
        if (idx >= 0) parts[idx] = { ...parts[idx], ...patch };
      }),
    );
    touch();
  }

  function addPart(part: PartDef) {
    setDoc(
      'parts',
      produce((parts) => {
        parts.push(part);
      }),
    );
    touch();
  }

  function removePart(id: string) {
    setDoc(
      'parts',
      produce((parts) => {
        const idx = parts.findIndex((p) => p.id === id);
        if (idx >= 0) parts.splice(idx, 1);
      }),
    );
    touch();
  }

  /* ---------------- 节点区间 / 时长 ---------------- */

  function setNodeRange(nodeId: string, start: number, end: number) {
    setDoc(
      'nodeRanges',
      produce((ranges) => {
        ranges[nodeId] = {
          start: Math.max(0, Number(start.toFixed(2))),
          end: Math.max(0, Number(end.toFixed(2))),
        };
      }),
    );
    touch();
  }

  function setDuration(d: number) {
    setDoc('duration', Math.max(1, d));
    touch();
  }

  function replaceDoc(next: AnimationDoc) {
    pause();
    setDoc(structuredClone(next));
    setTime(0);
    touch();
  }

  /** 当前时间对应的动作节点 id */
  function currentNodeId(): string | null {
    const t = time();
    for (const [id, r] of Object.entries(doc.nodeRanges)) {
      if (t >= r.start - 1e-6 && t <= r.end + 1e-6) return id;
    }
    return null;
  }

  function currentNodeSpec() {
    const id = currentNodeId();
    return id ? getNode(id) : null;
  }

  /** 视图里点击骨骼时选中并可直接旋转(拖拽绑骨交互入口) */
  function poseAt(t: number) {
    return evaluatePose(doc, t);
  }

  return {
    // state
    doc,
    setDoc,
    time,
    playing,
    selection,
    setSelection,
    showSkeleton,
    setShowSkeleton,
    showGuides,
    setShowGuides,
    fps,
    violations,
    score,
    activeViolations,
    // playback
    play,
    pause,
    togglePlay,
    seek,
    // keyframes
    addKeyframe,
    updateKeyframe,
    deleteKeyframe,
    selectedTrackFrames,
    selectedCurrentValue,
    // bones / parts
    updateBone,
    setBoneParent,
    bindPart,
    updatePart,
    addPart,
    removePart,
    // ranges
    setNodeRange,
    setDuration,
    replaceDoc,
    currentNodeId,
    currentNodeSpec,
    poseAt,
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
