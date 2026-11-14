import { describe, expect, it } from 'vitest';
import {
  approveShot,
  daysBetween,
  deadlineInfo,
  nextRound,
  pendingReview,
  rejectShot,
  submitForReview,
  markDelivered,
} from './workflow';
import { buildRig } from './templates';
import type { Shot } from './types';

function baseShot(): Shot {
  return {
    id: 'shot-1',
    projectId: 'p1',
    code: 'S01',
    title: '俯屈起始',
    order: 0,
    duration: 5,
    assignee: '林岚',
    status: 'draft',
    reworkCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    rig: buildRig('fetus'),
    tracks: {},
    appliedActions: [],
    reviews: [],
    versions: [],
  };
}

describe('review workflow', () => {
  it('submit moves the shot to review with an increasing round', () => {
    const { shot, review } = submitForReview(baseShot(), { actor: '林岚', at: '2026-02-01T10:00:00.000Z' });
    expect(shot.status).toBe('in_review');
    expect(review.round).toBe(1);
    expect(pendingReview(shot)?.id).toBe(review.id);
    expect(nextRound(shot)).toBe(2);
  });

  it('reject increments the rework counter and records the time', () => {
    const submitted = submitForReview(baseShot(), { actor: '林岚', at: '2026-02-01T10:00:00.000Z' }).shot;
    const { shot, event } = rejectShot(submitted, {
      actor: '郑蔚',
      at: '2026-02-02T09:30:00.000Z',
      comments: [{ frame: 12, time: 1.2, text: '胎头俯屈不足' }],
    });
    expect(shot.status).toBe('rework');
    expect(shot.reworkCount).toBe(1);
    expect(shot.updatedAt).toBe('2026-02-02T09:30:00.000Z');
    expect(shot.reviews[0].verdict).toBe('rejected');
    expect(shot.reviews[0].reviewedAt).toBe('2026-02-02T09:30:00.000Z');
    expect(shot.reviews[0].comments[0].frame).toBe(12);
    expect(event.kind).toBe('reject');
    expect(event.detail).toContain('返工第 1 次');
  });

  it('a second rejection keeps incrementing the counter', () => {
    let shot = submitForReview(baseShot(), { actor: '林岚', at: '2026-02-01T10:00:00.000Z' }).shot;
    shot = rejectShot(shot, { actor: '郑蔚', comments: [{ frame: 1, time: 0.1, text: 'a' }] }).shot;
    shot = submitForReview(shot, { actor: '林岚', at: '2026-02-03T10:00:00.000Z' }).shot;
    shot = rejectShot(shot, { actor: '郑蔚', comments: [{ frame: 2, time: 0.2, text: 'b' }] }).shot;
    expect(shot.reworkCount).toBe(2);
    expect(shot.reviews).toHaveLength(2);
    expect(shot.reviews[1].round).toBe(2);
  });

  it('approve locks a version and clears the pending review', () => {
    const submitted = submitForReview(baseShot(), { actor: '林岚', at: '2026-02-01T10:00:00.000Z' }).shot;
    const { shot, version } = approveShot(submitted, { actor: '郑蔚', at: '2026-02-04T11:00:00.000Z' });
    expect(shot.status).toBe('approved');
    expect(shot.versions).toHaveLength(1);
    expect(version.version).toBe(1);
    expect(pendingReview(shot)).toBeUndefined();
    expect(shot.reviews[0].verdict).toBe('approved');
  });

  it('delivery records the locked version on the shot', () => {
    const submitted = submitForReview(baseShot(), { actor: '林岚', at: '2026-02-01T10:00:00.000Z' }).shot;
    const approved = approveShot(submitted, { actor: '郑蔚' }).shot;
    const delivered = markDelivered(approved, '郑蔚').shot;
    expect(delivered.status).toBe('delivered');
    expect(delivered.deliveredVersion).toBe(1);
  });

  it('rejection comments keep their author and creation time', () => {
    const submitted = submitForReview(baseShot(), { actor: '林岚' }).shot;
    const { shot } = rejectShot(submitted, {
      actor: '郑蔚',
      at: '2026-03-01T08:00:00.000Z',
      comments: [
        { frame: 5, time: 0.5, text: '骨盆位置偏移' },
        { frame: 20, time: 2, text: '仰伸过快' },
      ],
    });
    const comments = shot.reviews[0].comments;
    expect(comments).toHaveLength(2);
    expect(comments.every((c) => c.author === '郑蔚')).toBe(true);
    expect(comments.every((c) => c.createdAt === '2026-03-01T08:00:00.000Z')).toBe(true);
  });
});

describe('deadline tracking', () => {
  const today = new Date(2026, 4, 20);

  it('counts whole days between dates', () => {
    expect(daysBetween(new Date(2026, 4, 20), new Date(2026, 4, 25))).toBe(5);
    expect(daysBetween(new Date(2026, 4, 20), new Date(2026, 4, 18))).toBe(-2);
  });

  it('flags overdue projects', () => {
    const info = deadlineInfo('2026-05-17', today);
    expect(info.overdue).toBe(true);
    expect(info.daysLeft).toBe(-3);
    expect(info.label).toBe('已超期 3 天');
    expect(info.tone).toBe('overdue');
  });

  it('warns during the last three days', () => {
    const info = deadlineInfo('2026-05-22', today);
    expect(info.overdue).toBe(false);
    expect(info.warning).toBe(true);
    expect(info.tone).toBe('warn');
  });

  it('reports a comfortable margin as ok', () => {
    const info = deadlineInfo('2026-06-10', today);
    expect(info.tone).toBe('ok');
    expect(info.daysLeft).toBe(21);
  });

  it('handles the due date being today', () => {
    const info = deadlineInfo('2026-05-20', today);
    expect(info.daysLeft).toBe(0);
    expect(info.label).toBe('今天到期');
  });
});
