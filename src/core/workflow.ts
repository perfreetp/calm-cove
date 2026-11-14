import { uid } from './ids';
import type { ActivityEvent, ReviewComment, ReviewRecord, Shot, ShotStatus, VersionRecord } from './types';

export function nowIso(): string {
  return new Date().toISOString();
}

export function fmtDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export interface DeadlineInfo {
  daysLeft: number;
  overdue: boolean;
  warning: boolean;
  label: string;
  tone: 'ok' | 'warn' | 'overdue';
}

export function deadlineInfo(dueDate: string, today = new Date()): DeadlineInfo {
  const due = new Date(`${dueDate}T00:00:00`);
  const daysLeft = daysBetween(today, due);
  const overdue = daysLeft < 0;
  const warning = !overdue && daysLeft <= 3;
  let label: string;
  if (overdue) label = `已超期 ${Math.abs(daysLeft)} 天`;
  else if (daysLeft === 0) label = '今天到期';
  else label = `剩余 ${daysLeft} 天`;
  return { daysLeft, overdue, warning, label, tone: overdue ? 'overdue' : warning ? 'warn' : 'ok' };
}

export const STATUS_LABEL: Record<ShotStatus, string> = {
  draft: '制作中',
  in_review: '待审核',
  rework: '退回返工',
  approved: '已通过',
  delivered: '已交付',
};

export const STATUS_ORDER: ShotStatus[] = ['draft', 'in_review', 'rework', 'approved', 'delivered'];

export function nextRound(shot: Shot): number {
  return shot.reviews.length + 1;
}

export function pendingReview(shot: Shot): ReviewRecord | undefined {
  return [...shot.reviews].reverse().find((r) => r.verdict === 'pending');
}

export function latestReview(shot: Shot): ReviewRecord | undefined {
  return shot.reviews[shot.reviews.length - 1];
}

export function canSubmit(shot: Shot): boolean {
  return shot.status === 'draft' || shot.status === 'rework';
}

export function canReview(shot: Shot): boolean {
  return shot.status === 'in_review';
}

export function canDeliver(shot: Shot): boolean {
  return shot.status === 'approved';
}

export interface SubmitOptions {
  actor: string;
  at?: string;
}

export function submitForReview(
  shot: Shot,
  opts: SubmitOptions,
): { shot: Shot; review: ReviewRecord; event: ActivityEvent } {
  const at = opts.at ?? nowIso();
  const review: ReviewRecord = {
    id: uid('review'),
    round: nextRound(shot),
    submittedAt: at,
    submittedBy: opts.actor,
    verdict: 'pending',
    comments: [],
  };
  const next: Shot = {
    ...shot,
    status: 'in_review',
    updatedAt: at,
    reviews: [...shot.reviews, review],
  };
  return {
    shot: next,
    review,
    event: {
      id: uid('evt'),
      at,
      actor: opts.actor,
      kind: 'submit',
      shotId: shot.id,
      projectId: shot.projectId,
      detail: `${shot.code}《${shot.title}》提交第 ${review.round} 轮审核`,
    },
  };
}

export interface RejectOptions {
  actor: string;
  comments: Array<{ frame: number; time: number; text: string }>;
  at?: string;
}

export function rejectShot(shot: Shot, opts: RejectOptions): { shot: Shot; event: ActivityEvent } {
  const at = opts.at ?? nowIso();
  const pending = pendingReview(shot);
  const comments: ReviewComment[] = opts.comments.map((c) => ({
    id: uid('comment'),
    frame: c.frame,
    time: c.time,
    text: c.text.trim(),
    author: opts.actor,
    createdAt: at,
  }));
  const reviews = shot.reviews.map((r) =>
    pending && r.id === pending.id
      ? { ...r, verdict: 'rejected' as const, reviewedAt: at, reviewer: opts.actor, comments }
      : r,
  );
  const next: Shot = {
    ...shot,
    status: 'rework',
    reworkCount: shot.reworkCount + 1,
    updatedAt: at,
    reviews,
  };
  return {
    shot: next,
    event: {
      id: uid('evt'),
      at,
      actor: opts.actor,
      kind: 'reject',
      shotId: shot.id,
      projectId: shot.projectId,
      detail: `${shot.code} 被退回，返工第 ${next.reworkCount} 次，意见 ${comments.length} 条`,
    },
  };
}

export interface ApproveOptions {
  actor: string;
  comments?: Array<{ frame: number; time: number; text: string }>;
  at?: string;
}

export function approveShot(
  shot: Shot,
  opts: ApproveOptions,
): { shot: Shot; version: VersionRecord; event: ActivityEvent } {
  const at = opts.at ?? nowIso();
  const pending = pendingReview(shot);
  const comments: ReviewComment[] = (opts.comments ?? []).map((c) => ({
    id: uid('comment'),
    frame: c.frame,
    time: c.time,
    text: c.text.trim(),
    author: opts.actor,
    createdAt: at,
  }));
  const reviews = shot.reviews.map((r) =>
    pending && r.id === pending.id
      ? { ...r, verdict: 'approved' as const, reviewedAt: at, reviewer: opts.actor, comments }
      : r,
  );
  const version: VersionRecord = {
    id: uid('ver'),
    version: shot.versions.length + 1,
    createdAt: at,
    createdBy: opts.actor,
    reviewId: pending?.id ?? '',
  };
  const next: Shot = {
    ...shot,
    status: 'approved',
    updatedAt: at,
    reviews,
    versions: [...shot.versions, version],
  };
  return {
    shot: next,
    version,
    event: {
      id: uid('evt'),
      at,
      actor: opts.actor,
      kind: 'approve',
      shotId: shot.id,
      projectId: shot.projectId,
      detail: `${shot.code} 审核通过，锁定版本 v${version.version}`,
    },
  };
}

export function markDelivered(shot: Shot, actor: string, at = nowIso()): { shot: Shot; event: ActivityEvent } {
  const version = shot.versions[shot.versions.length - 1];
  const next: Shot = {
    ...shot,
    status: 'delivered',
    deliveredVersion: version?.version,
    updatedAt: at,
  };
  return {
    shot: next,
    event: {
      id: uid('evt'),
      at,
      actor,
      kind: 'deliver',
      shotId: shot.id,
      projectId: shot.projectId,
      detail: `${shot.code} 已打包交付 v${version?.version ?? 1}`,
    },
  };
}

/** A shot being reworked keeps the previous round's comments for reference. */
export function lastRejection(shot: Shot): ReviewRecord | undefined {
  return [...shot.reviews].reverse().find((r) => r.verdict === 'rejected');
}

export function shotStatusTone(status: ShotStatus): string {
  return `tone-${status}`;
}

export function projectProgress(shots: Shot[]): { approved: number; total: number; percent: number } {
  const total = shots.length;
  const approved = shots.filter((s) => s.status === 'approved' || s.status === 'delivered').length;
  return { approved, total, percent: total === 0 ? 0 : Math.round((approved / total) * 100) };
}

export function shotNeedsAttention(shot: Shot): boolean {
  return shot.status === 'rework' || shot.status === 'in_review';
}
