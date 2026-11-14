import { buildGates, generateCourse } from './generator';
import { computeConflicts } from './conflicts';
import { buildArcsAndPath, buildStrideMarks, computeTiming } from './timing';
import type {
  EventRecord,
  GenParams,
  Role,
  RouteCourse,
  RouteVersion,
  Vec2,
  VersionStatus,
} from './types';

const LS_EVENTS = 'eqcs.events.v1';
const LS_VERSIONS = 'eqcs.versions.v1';
const LS_SESSION = 'eqcs.session.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export interface SearchFilter {
  level: string;
  designer: string;
  dateFrom: string;
  dateTo: string;
  minObstacles: number | null;
  maxObstacles: number | null;
}

export interface ReturnReasonStat {
  category: string;
  count: number;
}

export interface QuarterReportRow {
  quarter: string;
  events: number;
  versions: number;
  approved: number;
  returned: number;
}

function createStore() {
  const events = $state<EventRecord[]>(load(LS_EVENTS, []));
  const versions = $state<RouteVersion[]>(load(LS_VERSIONS, []));
  const session = $state<{ role: Role; currentEventId: string | null; currentVersionId: string | null }>(
    load(LS_SESSION, { role: 'designer', currentEventId: null, currentVersionId: null }),
  );

  // 持久化:组件外作用域用 $effect.root 建立独立响应式根
  $effect.root(() => {
    $effect(() => localStorage.setItem(LS_EVENTS, JSON.stringify(events)));
    $effect(() => localStorage.setItem(LS_VERSIONS, JSON.stringify(versions)));
    $effect(() => localStorage.setItem(LS_SESSION, JSON.stringify(session)));
  });

  // ---------- 赛事档案 ----------
  function createEvent(input: Omit<EventRecord, 'id' | 'createdAt'>): EventRecord {
    const ev: EventRecord = { ...input, id: uid('ev'), createdAt: Date.now() };
    events.push(ev);
    session.currentEventId = ev.id;
    session.currentVersionId = null;
    return ev;
  }

  function updateEvent(id: string, patch: Partial<EventRecord>): void {
    const ev = events.find((e) => e.id === id);
    if (ev) Object.assign(ev, patch);
  }

  function deleteEvent(id: string): void {
    const idx = events.findIndex((e) => e.id === id);
    if (idx >= 0) events.splice(idx, 1);
    for (let i = versions.length - 1; i >= 0; i--) {
      if (versions[i].eventId === id) versions.splice(i, 1);
    }
    if (session.currentEventId === id) {
      session.currentEventId = null;
      session.currentVersionId = null;
    }
  }

  function getEvent(id: string | null): EventRecord | undefined {
    return events.find((e) => e.id === id);
  }

  function versionsOf(eventId: string): RouteVersion[] {
    return versions
      .filter((v) => v.eventId === eventId)
      .sort((a, b) => a.versionNo - b.versionNo);
  }

  // ---------- 路线版本 ----------
  function nextVersionNo(eventId: string): number {
    const list = versionsOf(eventId);
    return list.length ? Math.max(...list.map((v) => v.versionNo)) + 1 : 1;
  }

  /** 生成新版本;previous 传入时保留手动障碍 */
  function generateVersion(eventId: string, params: GenParams, label: string): RouteVersion {
    const previous = currentVersion()?.course;
    const course = generateCourse(params, previous);
    const ver: RouteVersion = {
      id: uid('rv'),
      eventId,
      versionNo: nextVersionNo(eventId),
      label: label || `版本 ${nextVersionNo(eventId)}`,
      status: 'draft',
      course,
      submittedAt: null,
      reviewedAt: null,
      reviewReason: '',
      createdAt: Date.now(),
    };
    versions.push(ver);
    session.currentVersionId = ver.id;
    return ver;
  }

  /** 设计师拖动障碍:标记 manual,保留位置并重新计算路线与冲突 */
  function moveObstacle(versionId: string, obstacleId: string, pos: Vec2, angle?: number): void {
    const ver = versions.find((x) => x.id === versionId);
    if (!ver || ver.status === 'approved') return;
    const o = ver.course.obstacles.find((x) => x.id === obstacleId);
    if (!o) return;
    o.manual = true;
    o.position = { ...pos };
    if (angle !== undefined) o.angle = angle;
    recompute(ver.course);
  }

  /** 以当前工作副本重新生成(参数变化),手动障碍保留原位 */
  function regenerate(versionId: string, params: GenParams): void {
    const ver = versions.find((x) => x.id === versionId);
    if (!ver || ver.status === 'approved') return;
    ver.course = generateCourse(params, ver.course);
  }

  /** 复制为新版本(快照) */
  function forkVersion(versionId: string, label?: string): RouteVersion {
    const src = versions.find((x) => x.id === versionId);
    if (!src) throw new Error('版本不存在');
    const ver: RouteVersion = structuredClone(src);
    ver.id = uid('rv');
    ver.versionNo = nextVersionNo(src.eventId);
    ver.label = label || `版本 ${ver.versionNo}(复制)`;
    ver.status = 'draft';
    ver.submittedAt = null;
    ver.reviewedAt = null;
    ver.reviewReason = '';
    ver.createdAt = Date.now();
    versions.push(ver);
    session.currentVersionId = ver.id;
    return ver;
  }

  function recompute(course: RouteCourse): void {
    const gates = buildGates(course.obstacles, course.params.field.length, course.params.field.width);
    course.gates = gates;
    const { path, arcs } = buildArcsAndPath(course.obstacles, gates);
    course.path = path;
    course.arcs = arcs;
    course.strides = buildStrideMarks(course.obstacles, path);
    course.conflicts = computeConflicts(course.obstacles, path, arcs, course.strides, course.params);
    Object.assign(course, computeTiming(path, arcs, course.params.difficulty));
  }

  // ---------- 审查工作流 ----------
  function submitVersion(versionId: string): void {
    const ver = versions.find((x) => x.id === versionId);
    if (ver && ver.status === 'draft') {
      ver.status = 'submitted';
      ver.submittedAt = Date.now();
    }
  }

  function reviewVersion(versionId: string, approve: boolean, reason: string): void {
    const ver = versions.find((x) => x.id === versionId);
    if (!ver || ver.status !== 'submitted') return;
    ver.status = (approve ? 'approved' : 'returned') as VersionStatus;
    ver.reviewedAt = Date.now();
    ver.reviewReason = approve ? reason || '审查通过' : reason;
  }

  function currentVersion(): RouteVersion | undefined {
    return versions.find((v) => v.id === session.currentVersionId);
  }

  function selectEvent(eventId: string | null): void {
    session.currentEventId = eventId;
    const list = eventId ? versionsOf(eventId) : [];
    session.currentVersionId = list.length ? list[list.length - 1].id : null;
  }

  function selectVersion(versionId: string | null): void {
    session.currentVersionId = versionId;
  }

  function setRole(role: Role): void {
    session.role = role;
  }

  // ---------- 档案检索 ----------
  function searchEvents(f: SearchFilter): EventRecord[] {
    return events.filter((ev) => {
      if (f.level && ev.level !== f.level) return false;
      if (f.designer && !ev.designer.includes(f.designer)) return false;
      if (f.dateFrom && ev.date < f.dateFrom) return false;
      if (f.dateTo && ev.date > f.dateTo) return false;
      if (f.minObstacles !== null || f.maxObstacles !== null) {
        const counts = versionsOf(ev.id).map((v) => v.course.params.obstacleCount);
        const max = counts.length ? Math.max(...counts) : 0;
        if (f.minObstacles !== null && max < f.minObstacles) return false;
        if (f.maxObstacles !== null && max > f.maxObstacles) return false;
      }
      return true;
    });
  }

  // ---------- 季度报告 ----------
  function quarterlyReport(year: number): QuarterReportRow[] {
    const rows: QuarterReportRow[] = [];
    for (let q = 1; q <= 4; q++) {
      const from = `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`;
      const toMonth = String(q * 3).padStart(2, '0');
      const to = `${year}-${toMonth}-31`;
      const evs = events.filter((e) => e.date >= from && e.date <= to);
      const evIds = new Set(evs.map((e) => e.id));
      const vs = versions.filter((v) => evIds.has(v.eventId));
      rows.push({
        quarter: `${year} Q${q}`,
        events: evs.length,
        versions: vs.length,
        approved: vs.filter((v) => v.status === 'approved').length,
        returned: vs.filter((v) => v.status === 'returned').length,
      });
    }
    return rows;
  }

  function returnReasonStats(year: number): ReturnReasonStat[] {
    const cats = ['步距不足', '线路交叉', '落地区越界', '其他'];
    const counts = new Map(cats.map((c) => [c, 0]));
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const evIds = new Set(
      events.filter((e) => e.date >= from && e.date <= to).map((e) => e.id),
    );
    for (const v of versions) {
      if (v.status !== 'returned' || !evIds.has(v.eventId)) continue;
      const r = v.reviewReason;
      if (r.includes('步距')) counts.set('步距不足', (counts.get('步距不足') ?? 0) + 1);
      else if (r.includes('交叉')) counts.set('线路交叉', (counts.get('线路交叉') ?? 0) + 1);
      else if (r.includes('越界') || r.includes('落地')) counts.set('落地区越界', (counts.get('落地区越界') ?? 0) + 1);
      else counts.set('其他', (counts.get('其他') ?? 0) + 1);
    }
    return cats.map((category) => ({ category, count: counts.get(category) ?? 0 }));
  }

  return {
    get events() { return events; },
    get versions() { return versions; },
    get session() { return session; },
    createEvent, updateEvent, deleteEvent, getEvent, versionsOf,
    generateVersion, regenerate, forkVersion, moveObstacle,
    submitVersion, reviewVersion, currentVersion,
    selectEvent, selectVersion, setRole,
    searchEvents, quarterlyReport, returnReasonStats,
  };
}

export const store = createStore();
