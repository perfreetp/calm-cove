import type {
  AppData,
  AuditEvent,
  Boat,
  Race,
  Run,
  Session,
  SessionStatus,
  Run as RunT
} from './types';
import { ANCHOR, buildSeed, coaches, RACE_DAY } from './seed';
import { synthRun } from './sim';
import { LANE_WIDTH, MARK_STEP, START_X, laneCenterY } from './world';
import { mulberry32 } from './geo';

const STORAGE_KEY = 'qinglan.rowing.v1';

interface PersistShape {
  v: 1;
  data: AppData;
  actorId: string;
}

function load(): { data: AppData; actorId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed?.v === 1 && parsed.data?.world && Array.isArray(parsed.data.runs)) {
        return { data: parsed.data, actorId: parsed.actorId || 'c-shen' };
      }
    }
  } catch {
    /* private mode / quota — fall back to seed */
  }
  return { data: buildSeed(), actorId: 'c-shen' };
}

let uid = 0;
export const newId = (prefix: string) => `${prefix}-${(++uid).toString(36)}${Math.round(performance.now() % 1000).toString(36)}`;

class AppStore {
  data = $state.raw<AppData>(load().data);
  actorId = $state<string>(load().actorId);
  /** viewers are read-only; the coach endpoints gate every mutation */
  role = $state<'viewer' | 'coach'>('viewer');
  toast = $state<{ text: string; tone: 'ok' | 'warn'; id: string } | null>(null);
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  get actor() {
    return coaches.find((c) => c.id === this.actorId) ?? coaches[0];
  }

  setActor(id: string) {
    this.actorId = id;
    this.queueSave();
  }

  private persist() {
    try {
      const payload: PersistShape = { v: 1, data: this.data, actorId: this.actorId };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota errors */
    }
  }

  private queueSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persist(), 350);
  }

  private commit(next: AppData, audit?: Omit<AuditEvent, 'id' | 'at' | 'actor' | 'actorRole'> & { actor?: string; actorRole?: AuditEvent['actorRole'] }) {
    let data = next;
    if (audit) {
      const event: AuditEvent = {
        id: newId('aud'),
        at: Date.now(),
        actor: audit.actor ?? this.actor.name,
        actorRole: audit.actorRole ?? 'coach',
        kind: audit.kind,
        action: audit.action,
        target: audit.target,
        detail: audit.detail
      };
      data = { ...data, audit: [event, ...data.audit].slice(0, 400) };
    }
    this.data = data;
    this.queueSave();
  }

  notify(text: string, tone: 'ok' | 'warn' = 'ok') {
    const id = newId('toast');
    this.toast = { text, tone, id };
    setTimeout(() => {
      if (this.toast?.id === id) this.toast = null;
    }, 2600);
  }

  resetDemo() {
    this.data = buildSeed();
    this.queueSave();
    this.notify('已恢复演示数据');
  }

  /* ---------------- sessions ---------------- */

  saveSession(patch: Partial<Session> & { id?: string }, auditAction = '保存'): string {
    const now = Date.now();
    const existing = patch.id ? this.data.sessions.find((s) => s.id === patch.id) : undefined;
    if (existing) {
      const updated: Session = { ...existing, ...patch, status: existing.status === 'published' ? 'published' : 'draft' };
      const sessions = this.data.sessions.map((s) => (s.id === updated.id ? updated : s));
      this.commit(
        { ...this.data, sessions },
        { kind: 'session', action: auditAction, target: updated.code, detail: this.describeSession(updated) }
      );
      return updated.id;
    }
    const id = newId('ses');
    const session: Session = {
      id,
      code: patch.code?.trim() || `TR-${newId('x').slice(-4).toUpperCase()}`,
      subject: patch.subject ?? '未命名科目',
      focus: patch.focus ?? '',
      coachId: patch.coachId ?? this.actorId,
      day: patch.day ?? ANCHOR,
      startTime: patch.startTime ?? '07:00',
      durationMin: patch.durationMin ?? 60,
      lanes: patch.lanes ?? [2, 3, 4],
      startMark: patch.startMark ?? 0,
      endMark: patch.endMark ?? 4,
      wind: patch.wind ?? { fromDeg: 240, toDeg: 300, minMs: 1, maxMs: 4 },
      plannedBoats: patch.plannedBoats ?? 3,
      assigned: patch.assigned ?? [],
      timeLimitMin: patch.timeLimitMin ?? 5,
      status: 'draft',
      version: 1,
      note: patch.note ?? '',
      createdAt: now,
      publishedAt: null
    };
    this.commit(
      { ...this.data, sessions: [session, ...this.data.sessions] },
      { kind: 'session', action: '新建草稿', target: session.code, detail: this.describeSession(session) }
    );
    return id;
  }

  private describeSession(s: Session): string {
    const m0 = s.startMark * MARK_STEP;
    const m1 = s.endMark * MARK_STEP;
    return `航道 ${s.lanes.join('/')} · ${m1 - m0} m · 计划 ${s.plannedBoats} 艇 · 风向 ${s.wind.fromDeg}°–${s.wind.toDeg}° ${s.wind.minMs}–${s.wind.maxMs} m/s · 时限 ${s.timeLimitMin} min`;
  }

  setSessionStatus(id: string, status: SessionStatus) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) return;
    const now = Date.now();
    const updated: Session = {
      ...s,
      status,
      version: s.version + 1,
      publishedAt: status === 'published' ? now : s.publishedAt
    };
    const sessions = this.data.sessions.map((x) => (x.id === id ? updated : x));
    this.commit(
      { ...this.data, sessions },
      {
        kind: 'session',
        action: status === 'published' ? '发布' : status === 'closed' ? '结课' : '撤回',
        target: s.code,
        detail: status === 'published' ? `v${updated.version} · ${this.describeSession(updated)}` : `版本 v${updated.version}`
      }
    );
    this.notify(status === 'published' ? `已发布 ${s.code}，观众端已同步` : `已更新 ${s.code} 状态`);
  }

  deleteSession(id: string) {
    const s = this.data.sessions.find((x) => x.id === id);
    if (!s) return;
    this.commit(
      {
        ...this.data,
        sessions: this.data.sessions.filter((x) => x.id !== id),
        runs: this.data.runs.filter((r) => r.sessionId !== id)
      },
      { kind: 'session', action: '删除', target: s.code, detail: '连同该科目下的轨迹记录一并移除' }
    );
    this.notify('已删除科目与关联轨迹', 'warn');
  }

  /* ---------------- runs / review ---------------- */

  reviewRun(runId: string, verdict: 'valid' | 'invalid', reasonCode: string, reason: string) {
    const run = this.data.runs.find((r) => r.id === runId);
    if (!run) return;
    const boat = this.data.boats.find((b) => b.id === run.boatId);
    const updated: Run = {
      ...run,
      status: verdict,
      review: { by: this.actor.name, at: Date.now(), verdict, reason, reasonCode }
    };
    const runs = this.data.runs.map((r) => (r.id === runId ? updated : r));
    const session = this.data.sessions.find((s) => s.id === run.sessionId);
    this.commit(
      { ...this.data, runs },
      {
        kind: 'review',
        action: '复核',
        target: `${boat?.code ?? run.boatId} · ${session?.code ?? ''}`,
        detail: `${verdict === 'valid' ? '有效' : '作废'} · ${reasonCode}${reason ? ' · ' + reason : ''}`
      }
    );
    this.notify(`已标记为${verdict === 'valid' ? '有效' : '作废'}并写入操作记录`);
  }

  reviewAllPending(verdict: 'valid' | 'invalid', runIds: string[]) {
    if (!runIds.length) return;
    const now = Date.now();
    const runs = this.data.runs.map((r) =>
      runIds.includes(r.id)
        ? {
            ...r,
            status: verdict,
            review: {
              by: this.actor.name,
              at: now,
              verdict,
              reason: '批量复核确认',
              reasonCode: verdict === 'valid' ? '判定成立 · 偏航超限' : '判定成立 · 漏标'
            }
          }
        : r
    );
    this.commit(
      { ...this.data, runs },
      {
        kind: 'review',
        action: '批量复核',
        target: `${runIds.length} 趟`,
        detail: `统一标记为${verdict === 'valid' ? '有效' : '作废'}`
      }
    );
    this.notify(`已批量处理 ${runIds.length} 趟`);
  }

  /** Simulated athlete upload: any accepted spec produces a judged run + audit event. */
  uploadRun(opts: {
    sessionId: string;
    boatId: string;
    lane: number;
    startOffsetSec?: number;
    devAmp?: number;
    missAtMark?: number;
    secPer500?: number;
  }): Run | null {
    const session = this.data.sessions.find((s) => s.id === opts.sessionId);
    const boat = this.data.boats.find((b) => b.id === opts.boatId);
    if (!session || !boat) return null;
    const seed = 4000 + Math.round(performance.now()) + this.data.runs.length * 17;
    const laneCenter = laneCenterY(opts.lane);
    const rnd = mulberry32(seed);
    const result = synthRun({
      seed,
      laneCenterY: laneCenter,
      startX: START_X,
      startMark: session.startMark,
      endMark: session.endMark,
      markStep: MARK_STEP,
      laneWidth: LANE_WIDTH,
      lane: opts.lane,
      boatId: boat.code,
      startOffsetSec: opts.startOffsetSec ?? Math.round(rnd() * 30) / 100,
      secPer500: opts.secPer500 ?? 99 + rnd() * 9,
      baseBias: (rnd() - 0.5) * 1.4,
      deviationAmp: opts.devAmp,
      deviationAt: opts.devAmp ? 0.4 + rnd() * 0.35 : undefined,
      missAtMark: opts.missAtMark,
      missAmp: opts.missAtMark ? 7.2 + rnd() * 1.4 : undefined,
      wobbly: rnd() > 0.7
    });
    const now = Date.now();
    const run: Run = {
      id: newId('run'),
      sessionId: opts.sessionId,
      boatId: opts.boatId,
      lane: opts.lane,
      startMark: session.startMark,
      endMark: session.endMark,
      gunAt: now - 8 * 60 * 1000,
      durationSec: result.durationSec,
      distanceM: result.distanceM,
      splits: result.splits,
      track: result.track,
      maxDeviation: result.maxDeviation,
      meanDeviation: result.meanDeviation,
      startOffsetSec: result.startOffsetSec,
      detections: result.detections,
      snapshot: result.snapshot,
      status: 'pending',
      review: null,
      uploadedAt: now
    };
    const runs = [run, ...this.data.runs];
    this.commit(
      { ...this.data, runs, liveRunId: run.id },
      {
        actor: boat.athletes[0] ?? boat.code,
        actorRole: 'athlete',
        kind: 'upload',
        action: '上传轨迹',
        target: `${boat.code} · ${session.code}`,
        detail: `${result.track.length} 个轨迹点 · ${result.splits.length} 个分段时间 · 自动判读 ${result.detections.length} 项异常`
      }
    );
    this.notify(
      result.detections.length ? '新轨迹已上传，自动判读发现异常，已标黄' : '新轨迹已上传，判读通过',
      result.detections.length ? 'warn' : 'ok'
    );
    return run;
  }

  /* ---------------- races ---------------- */

  private raceWith(raceId: string, mutate: (r: Race) => Race): Race | null {
    const race = this.data.races.find((r) => r.id === raceId);
    if (!race) return null;
    return mutate(race);
  }

  assignLane(raceId: string, lane: number, boatId: string | null, opts?: { silent?: boolean }) {
    const target = this.raceWith(raceId, (race) => ({
      ...race,
      lanes: race.lanes.map((l) =>
        l.lane === lane
          ? { ...l, boatId }
          : boatId
            ? l.boatId === boatId
              ? { ...l, boatId: null }
              : l
          : l
      ),
      version: race.version + 1,
      updatedAt: Date.now(),
      updatedBy: this.actor.name
    }));
    if (!target) return;
    const races = this.data.races.map((r) => (r.id === raceId ? target : r));
    const boat = boatId ? this.data.boats.find((b) => b.id === boatId) : null;
    this.commit(
      { ...this.data, races },
      {
        kind: 'race',
        action: boatId ? '分配赛道' : '清空赛道',
        target: target.name,
        detail: boatId ? `${lane} 道 → ${boat?.code}` : `${lane} 道清空 · v${target.version}`
      }
    );
  }

  setRaceTime(raceId: string, time: string) {
    const target = this.raceWith(raceId, (race) => ({
      ...race,
      time,
      version: race.version + 1,
      updatedAt: Date.now(),
      updatedBy: this.actor.name
    }));
    if (!target) return;
    const races = this.data.races.map((r) => (r.id === raceId ? target : r));
    this.commit(
      { ...this.data, races },
      { kind: 'race', action: '调整时间', target: target.name, detail: `${time} 开赛 · v${target.version}` }
    );
  }

  setRaceStatus(raceId: string, status: 'draft' | 'published') {
    const target = this.raceWith(raceId, (race) => ({
      ...race,
      status,
      version: race.version + 1,
      updatedAt: Date.now(),
      updatedBy: this.actor.name
    }));
    if (!target) return;
    const races = this.data.races.map((r) => (r.id === raceId ? target : r));
    this.commit(
      { ...this.data, races },
      { kind: 'race', action: status === 'published' ? '发布' : '撤回', target: target.name, detail: `v${target.version}` }
    );
    this.notify(status === 'published' ? `${target.name} 已发布，观众端可见` : '已撤回为草稿');
  }

  renameRace(raceId: string, name: string) {
    const target = this.raceWith(raceId, (race) => ({
      ...race,
      name,
      version: race.version + 1,
      updatedAt: Date.now(),
      updatedBy: this.actor.name
    }));
    if (!target) return;
    const races = this.data.races.map((r) => (r.id === raceId ? target : r));
    this.commit({ ...this.data, races }, { kind: 'race', action: '重命名', target: target.name, detail: `v${target.version}` });
  }

  addRace(phase: Race['phase']) {
    const id = newId('race');
    const race: Race = {
      id,
      name: phase === 'heat' ? '新增预赛组' : '新增决赛',
      phase,
      group: phase === 'heat' ? '新组' : 'F',
      day: RACE_DAY,
      time: phase === 'heat' ? '11:20' : '16:50',
      lanes: Array.from({ length: 6 }, (_, i) => ({ lane: i + 1, boatId: null })),
      status: 'draft',
      version: 1,
      updatedAt: Date.now(),
      updatedBy: this.actor.name
    };
    this.commit(
      { ...this.data, races: [...this.data.races, race] },
      { kind: 'race', action: '新建', target: race.name, detail: `6 条赛道待分配 · ${race.time} 开赛` }
    );
  }

  getBoat(boatId: string | null): Boat | null {
    return boatId ? this.data.boats.find((b) => b.id === boatId) ?? null : null;
  }

  getSessionOf(run: RunT): Session | undefined {
    return this.data.sessions.find((s) => s.id === run.sessionId);
  }
}

export const app = new AppStore();
export { coaches, RACE_DAY, ANCHOR };
