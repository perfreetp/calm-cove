import { createEffect, createSignal } from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import { cloneTracks, offsetTracks, sliceTracks, sortKeys, type SampleValue } from './core/animation';
import { uid } from './core/ids';
import { buildRig } from './core/templates';
import type {
  ActivityEvent,
  AppState,
  AppliedAction,
  DeliveryPackage,
  MotionAction,
  Project,
  ProjectDraft,
  ReviewRecord,
  Rig,
  Role,
  Shot,
  TrackMap,
  User,
} from './core/types';
import { approveShot, rejectShot, submitForReview, markDelivered, nowIso } from './core/workflow';
import { loadState, saveState } from './data/persist';
import { createSeedState } from './data/seed';

const initial = loadState();

export const [appState, setAppState] = createStore<AppState>(initial.state);
export const [restoredFromStorage] = createSignal(initial.restored);
export const [loadWarning, setLoadWarning] = createSignal<string | undefined>(initial.error);
export const [storageError, setStorageError] = createSignal<string | undefined>();

let saveTimer: ReturnType<typeof setTimeout> | null = null;
createEffect(() => {
  // Touch the whole state so any mutation schedules a write.
  const snapshot = JSON.stringify(appState);
  void snapshot;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const result = saveState(appState);
    if (!result.ok) setStorageError(result.error);
  }, 250);
});

export function pushEvent(event: ActivityEvent): void {
  setAppState('events', (events) => [event, ...events].slice(0, 300));
}

export function setCurrentUser(user: User): void {
  setAppState('currentUser', user);
}

export function setRole(role: Role): void {
  const names: Record<Role, string> = {
    animator: '林岚',
    supervisor: '郑蔚',
    learner: '学员 001',
  };
  setAppState('currentUser', { name: names[role], role });
}

export function projectById(id: string): Project | undefined {
  return appState.projects.find((p) => p.id === id);
}

export function shotById(id: string): Shot | undefined {
  return appState.shots.find((s) => s.id === id);
}

export function shotsOf(projectId: string): Shot[] {
  return appState.shots
    .filter((s) => s.projectId === projectId)
    .slice()
    .sort((a, b) => a.order - b.order);
}

export function actionById(id: string): MotionAction | undefined {
  return appState.actions.find((a) => a.id === id);
}

export function shotsUsingAction(actionId: string): Shot[] {
  return appState.shots.filter((s) => s.appliedActions.some((a) => a.actionId === actionId));
}

/* ------------------------------------------------------------------ */
/* Projects & shots                                                    */
/* ------------------------------------------------------------------ */

export interface CreateProjectResult {
  project: Project;
  shots: Shot[];
}

export function createProject(draft: ProjectDraft): CreateProjectResult {
  const at = nowIso();
  const project: Project = {
    id: uid('proj'),
    courseName: draft.courseName.trim(),
    client: draft.client.trim(),
    dueDate: draft.dueDate,
    resolution: draft.resolution,
    fps: draft.fps,
    templateId: draft.templateId,
    notes: draft.notes,
    createdAt: at,
  };

  const shots: Shot[] = draft.shots.map((entry, i) => ({
    id: uid('shot'),
    projectId: project.id,
    code: entry.code.trim() || `S${String(i + 1).padStart(2, '0')}`,
    title: entry.title.trim() || `镜头 ${i + 1}`,
    order: i,
    duration: entry.duration,
    assignee: appState.currentUser.name,
    status: 'draft' as const,
    reworkCount: 0,
    createdAt: at,
    updatedAt: at,
    rig: buildRig(draft.templateId),
    tracks: {},
    appliedActions: [],
    reviews: [],
    versions: [],
  }));

  setAppState(
    produce((s) => {
      s.projects.unshift(project);
      s.shots.push(...shots);
    }),
  );
  pushEvent({
    id: uid('evt'),
    at,
    actor: appState.currentUser.name,
    kind: 'create',
    projectId: project.id,
    detail: `新建课程《${project.courseName}》，生成 ${shots.length} 条镜头制作条目`,
  });
  return { project, shots };
}

export function updateProject(id: string, patch: Partial<Project>): void {
  setAppState(
    'projects',
    (p) => p.id === id,
    (p) => ({ ...p, ...patch }),
  );
}

export function deleteProject(id: string): void {
  setAppState(
    produce((s) => {
      s.projects = s.projects.filter((p) => p.id !== id);
      s.shots = s.shots.filter((sh) => sh.projectId !== id);
      s.deliveries = s.deliveries.filter((d) => d.projectId !== id);
    }),
  );
}

export function addShot(projectId: string, entry: { code: string; title: string; duration: number }): Shot {
  const project = projectById(projectId);
  const siblings = shotsOf(projectId);
  const at = nowIso();
  const shot: Shot = {
    id: uid('shot'),
    projectId,
    code: entry.code || `S${String(siblings.length + 1).padStart(2, '0')}`,
    title: entry.title,
    order: siblings.length,
    duration: entry.duration,
    assignee: appState.currentUser.name,
    status: 'draft',
    reworkCount: 0,
    createdAt: at,
    updatedAt: at,
    rig: buildRig(project?.templateId ?? 'mechanism'),
    tracks: {},
    appliedActions: [],
    reviews: [],
    versions: [],
  };
  setAppState('shots', (shots) => [...shots, shot]);
  return shot;
}

export function deleteShot(shotId: string): void {
  setAppState(
    produce((s) => {
      s.shots = s.shots.filter((sh) => sh.id !== shotId);
      s.deliveries = s.deliveries.filter((d) => d.shotId !== shotId);
    }),
  );
}

/** Commit a shot's rig and tracks (the editor's explicit save path). */
export function commitShotEdit(shotId: string, patch: { rig?: Rig; tracks?: TrackMap; duration?: number }): void {
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((shot) => {
      if (patch.rig) shot.rig = patch.rig;
      if (patch.tracks) shot.tracks = patch.tracks;
      if (patch.duration !== undefined) shot.duration = patch.duration;
      shot.updatedAt = nowIso();
    }),
  );
}

export function setShotMeta(
  shotId: string,
  patch: Partial<Pick<Shot, 'assignee' | 'title' | 'duration' | 'code'>>,
): void {
  setAppState(
    'shots',
    (s) => s.id === shotId,
    (shot) => ({ ...shot, ...patch, updatedAt: nowIso() }),
  );
}

/* ------------------------------------------------------------------ */
/* Review workflow                                                     */
/* ------------------------------------------------------------------ */

export function submitShot(shotId: string): ReviewRecord | undefined {
  const shot = shotById(shotId);
  if (!shot) return undefined;
  const result = submitForReview(shot, { actor: appState.currentUser.name });
  setAppState('shots', (s) => s.id === shotId, result.shot);
  pushEvent(result.event);
  return result.review;
}

export function rejectReview(shotId: string, comments: Array<{ frame: number; time: number; text: string }>): boolean {
  const shot = shotById(shotId);
  if (!shot || comments.length === 0) return false;
  const result = rejectShot(shot, { actor: appState.currentUser.name, comments });
  setAppState('shots', (s) => s.id === shotId, result.shot);
  pushEvent(result.event);
  return true;
}

export function approveReview(
  shotId: string,
  comments: Array<{ frame: number; time: number; text: string }> = [],
): boolean {
  const shot = shotById(shotId);
  if (!shot) return false;
  const result = approveShot(shot, { actor: appState.currentUser.name, comments });
  setAppState('shots', (s) => s.id === shotId, result.shot);
  pushEvent(result.event);
  return true;
}

export function saveDelivery(pkg: DeliveryPackage): void {
  setAppState('deliveries', (list) => [pkg, ...list]);
  const shot = shotById(pkg.shotId);
  if (shot) {
    const result = markDelivered(shot, appState.currentUser.name);
    setAppState('shots', (s) => s.id === pkg.shotId, result.shot);
    pushEvent(result.event);
  }
}

/* ------------------------------------------------------------------ */
/* Motion copy between shots                                           */
/* ------------------------------------------------------------------ */

export interface CopyMotionResult {
  ok: boolean;
  message: string;
  targetShotId?: string;
}

/**
 * Copy the full animation of one shot onto the next shot in the same project,
 * so the animator can start from the previous performance and refine it.
 */
export function copyMotionToNextShot(shotId: string): CopyMotionResult {
  const shot = shotById(shotId);
  if (!shot) return { ok: false, message: '镜头不存在。' };
  const siblings = shotsOf(shot.projectId);
  const idx = siblings.findIndex((s) => s.id === shotId);
  const target = siblings[idx + 1];
  if (!target) return { ok: false, message: '已是该项目最后一个镜头，没有下一镜头可复制。' };
  if (target.rig.templateId !== shot.rig.templateId) {
    return { ok: false, message: '下一镜头使用了不同的骨骼模板，无法直接复制动作。' };
  }
  setAppState(
    'shots',
    (s) => s.id === target.id,
    produce((t) => {
      t.tracks = sliceTracks(shot.tracks, { start: 0, end: shot.duration }, 0);
      t.appliedActions = shot.appliedActions.map((a) => ({ ...a, appliedAt: nowIso() }));
      t.updatedAt = nowIso();
    }),
  );
  return {
    ok: true,
    message: `已把 ${shot.code} 的动作复制到 ${target.code}，可在编辑器里继续微调。`,
    targetShotId: target.id,
  };
}

/** Replace one shot's tracks with a copy of another (used by copy/paste actions). */
export function copyTracksBetween(
  fromShotId: string,
  toShotId: string,
  range?: { start: number; end: number },
): boolean {
  const from = shotById(fromShotId);
  const to = shotById(toShotId);
  if (!from || !to) return false;
  const tracks = range ? sliceTracks(from.tracks, range, 0) : (JSON.parse(JSON.stringify(from.tracks)) as TrackMap);
  setAppState(
    'shots',
    (s) => s.id === toShotId,
    produce((t) => {
      t.tracks = tracks;
      t.updatedAt = nowIso();
    }),
  );
  return true;
}

/* ------------------------------------------------------------------ */
/* Action library                                                      */
/* ------------------------------------------------------------------ */

export function createAction(input: {
  name: string;
  category: string;
  description: string;
  duration: number;
  templateId: string;
  tracks: TrackMap;
}): MotionAction {
  const at = nowIso();
  const action: MotionAction = {
    id: uid('action'),
    name: input.name,
    category: input.category,
    description: input.description,
    duration: input.duration,
    templateId: input.templateId,
    tracks: cloneTracks(input.tracks),
    createdAt: at,
    updatedAt: at,
  };
  setAppState('actions', (list) => [...list, action]);
  return action;
}

export function updateActionMeta(
  actionId: string,
  patch: Partial<Pick<MotionAction, 'name' | 'category' | 'description'>>,
): void {
  setAppState(
    'actions',
    (a) => a.id === actionId,
    (a) => ({ ...a, ...patch, updatedAt: nowIso() }),
  );
}

/** Rewrite an action's tracks and resync every shot referencing it. */
export function updateActionTracks(actionId: string, tracks: TrackMap): { affected: Shot[] } {
  const affected = shotsUsingAction(actionId);
  const action = actionById(actionId);
  if (!action) return { affected: [] };
  setAppState(
    'actions',
    (a) => a.id === actionId,
    produce((a) => {
      a.tracks = cloneTracks(tracks);
      a.updatedAt = nowIso();
    }),
  );
  for (const shot of affected) {
    resyncAppliedAction(shot.id, actionId);
  }
  pushEvent({
    id: uid('evt'),
    at: nowIso(),
    actor: appState.currentUser.name,
    kind: 'sync',
    detail: `动作「${action.name}」更新，同步到 ${affected.length} 个镜头`,
  });
  return { affected };
}

export function deleteAction(actionId: string): { affected: Shot[] } {
  const affected = shotsUsingAction(actionId);
  setAppState(
    produce((s) => {
      s.actions = s.actions.filter((a) => a.id !== actionId);
    }),
  );
  return { affected };
}

/**
 * Bake a library action into a shot's tracks. Keys already present within the
 * action window are replaced by the action's keys, so re-syncing is idempotent.
 */
export function applyActionToShot(shotId: string, actionId: string, startTime = 0): boolean {
  const shot = shotById(shotId);
  const action = actionById(actionId);
  if (!shot || !action) return false;
  if (shot.rig.templateId !== action.templateId) return false;
  bakeAction(shotId, action, startTime);
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((s) => {
      if (!s.appliedActions.some((a) => a.actionId === actionId)) {
        s.appliedActions.push({
          actionId,
          actionName: action.name,
          startTime,
          duration: action.duration,
          appliedAt: nowIso(),
        });
      }
    }),
  );
  return true;
}

export function detachAction(shotId: string, actionId: string): void {
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((s) => {
      s.appliedActions = s.appliedActions.filter((a) => a.actionId !== actionId);
    }),
  );
}

function bakeAction(shotId: string, action: MotionAction, startTime: number): void {
  const shot = shotById(shotId);
  if (!shot) return;
  const next: TrackMap = {};
  const windowStart = startTime;
  const windowEnd = startTime + action.duration;
  for (const [boneId, keys] of Object.entries(shot.tracks)) {
    next[boneId] = sortKeys(keys).filter((k) => k.time < windowStart - 1e-6 || k.time > windowEnd + 1e-6);
  }
  for (const [boneId, keys] of Object.entries(action.tracks)) {
    const baked =
      offsetTracks({ [boneId]: cloneTracks({ [boneId]: keys })[boneId] }, startTime, shot.duration)[boneId] ?? [];
    const existing = next[boneId] ?? [];
    next[boneId] = sortKeys([...existing, ...baked]);
  }
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((s) => {
      s.tracks = next;
      s.updatedAt = nowIso();
    }),
  );
}

export function resyncAppliedAction(shotId: string, actionId: string): void {
  const shot = shotById(shotId);
  const action = actionById(actionId);
  if (!shot || !action) return;
  const applied = shot.appliedActions.find((a) => a.actionId === actionId);
  if (!applied) return;
  bakeAction(shotId, action, applied.startTime);
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((s) => {
      const a = s.appliedActions.find((x) => x.actionId === actionId);
      if (a) a.duration = action.duration;
    }),
  );
}

export function appliedActionStart(shotId: string, actionId: string): number {
  const shot = shotById(shotId);
  return shot?.appliedActions.find((a) => a.actionId === actionId)?.startTime ?? 0;
}

export function appliedActionInstance(shot: Shot, actionId: string): AppliedAction | undefined {
  return shot.appliedActions.find((a) => a.actionId === actionId);
}

export function shiftAppliedAction(shotId: string, actionId: string, startTime: number): void {
  setAppState(
    'shots',
    (s) => s.id === shotId,
    produce((s) => {
      const a = s.appliedActions.find((x) => x.actionId === actionId);
      if (a) a.startTime = Math.max(0, startTime);
    }),
  );
  const action = actionById(actionId);
  if (action) bakeAction(shotId, action, Math.max(0, startTime));
}

export function keyframeAt(tracks: TrackMap, boneId: string, time: number): SampleValue | null {
  const keys = tracks[boneId];
  if (!keys) return null;
  const found = keys.find((k) => Math.abs(k.time - time) < 0.0005);
  return found ? { rotation: found.rotation, x: found.x, y: found.y } : null;
}

export function resetAllData(): void {
  setAppState(createSeedState());
}
