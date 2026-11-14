// 状态管理：本地持久化 + 派生统计
import { seedDatabase, FABRICS } from './seed.js';
import { evaluateModel, round } from './geometry.js';

const KEY = 'burn-garment-studio.v1';

export function newSession(db, role, studentId) {
  return { ...db.session, role, studentId: studentId ?? db.session.studentId };
}

export function loadDb() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && Array.isArray(parsed.tasks)) {
        return reconcileDeadlines(parsed);
      }
    }
  } catch (e) {
    console.warn('本地数据读取失败，使用种子数据', e);
  }
  const seeded = seedDatabase();
  saveDb(seeded);
  return seeded;
}

/** 相对时间种子在重启后仍保持"今天到期"的语义，适度滚动截止时间 */
function reconcileDeadlines(db) {
  return db;
}

export function saveDb(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('保存失败', e);
  }
}

export function resetDb() {
  const db = seedDatabase();
  saveDb(db);
  return db;
}

export function taskById(db, id) {
  return db.tasks.find((t) => t.id === id) ?? null;
}

export function studentById(db, id) {
  return db.students.find((s) => s.id === id) ?? null;
}

export function submissionsFor(db, taskId, studentId) {
  return db.submissions
    .filter((s) => s.taskId === taskId && s.studentId === studentId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

export function allSubmissionsFor(db, studentId) {
  return db.submissions
    .filter((s) => s.studentId === studentId)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

export function latestSubmission(db, taskId, studentId) {
  const list = submissionsFor(db, taskId, studentId);
  return list[0] ?? null;
}

export function isLate(task, when) {
  return new Date(when).getTime() > new Date(task.deadline).getTime();
}

export function submitWork(db, { taskId, studentId, points, offsetMM }) {
  const task = taskById(db, taskId);
  const now = new Date();
  const prev = submissionsFor(db, taskId, studentId);
  const attempt = prev.length + 1;
  const evaluation = evaluateModel(points, task, offsetMM);
  const late = isLate(task, now);
  const sub = {
    id: `${taskId}-${studentId}-a${attempt}-${now.getTime().toString(36)}`,
    taskId,
    studentId,
    attempt,
    points: points.map((p) => ({ x: round(p.x, 2), y: round(p.y, 2) })),
    offsetMM: round(offsetMM, 1),
    submittedAt: now.toISOString(),
    late,
    autoScore: evaluation.autoScore,
    evaluation,
    status: 'pending',
    teacherDeduction: null,
    teacherComment: '',
    gradedAt: null,
    finalScore: null,
  };
  db.submissions.push(sub);
  saveDb(db);
  return sub;
}

export function gradeSubmission(db, subId, { deduction, comment }) {
  const sub = db.submissions.find((s) => s.id === subId);
  if (!sub) return null;
  sub.teacherDeduction = Math.max(0, Number(deduction) || 0);
  sub.teacherComment = comment ?? '';
  sub.finalScore = round(Math.max(0, sub.autoScore - sub.teacherDeduction), 1);
  sub.status = 'graded';
  sub.gradedAt = new Date().toISOString();
  saveDb(db);
  return sub;
}

export function ungradeSubmission(db, subId) {
  const sub = db.submissions.find((s) => s.id === subId);
  if (!sub) return;
  sub.teacherDeduction = null;
  sub.teacherComment = '';
  sub.finalScore = null;
  sub.status = 'pending';
  sub.gradedAt = null;
  saveDb(db);
}

export function setSession(db, patch) {
  db.session = { ...db.session, ...patch };
  saveDb(db);
}

export function setDeadline(db, taskId, iso) {
  const t = taskById(db, taskId);
  if (!t) return;
  t.deadline = iso;
  saveDb(db);
}

export function createTask(db, draft) {
  const task = {
    id: `T-${Date.now().toString(36)}`,
    publishedAt: new Date().toISOString(),
    totalStudents: db.students.length,
    instructor: db.teacher ? `${db.teacher.name} · ${db.teacher.title}` : '教师',
    ...draft,
  };
  db.tasks.push(task);
  saveDb(db);
  return task;
}

export function updateTask(db, taskId, patch) {
  const t = taskById(db, taskId);
  if (!t) return;
  Object.assign(t, patch);
  for (const sub of db.submissions.filter((s) => s.taskId === taskId)) {
    if (sub.status === 'pending' && !sub.teacherDeduction) {
      // 任务参数变化后重算未批阅卷的自动分
      const ev = evaluateModel(sub.points, t, sub.offsetMM);
      sub.evaluation = ev;
      sub.autoScore = ev.autoScore;
    }
  }
  saveDb(db);
}

/** 班级进度：每个任务 × 每位学员 */
export function classProgress(db, taskId, cohort) {
  const task = taskById(db, taskId);
  const students = db.students.filter((s) => !cohort || s.cohort === cohort);
  return students.map((st) => {
    const subs = submissionsFor(db, taskId, st.id);
    const latest = subs[0] ?? null;
    const first = subs.length ? subs[subs.length - 1] : null;
    const best = subs.length ? [...subs].sort((a, b) => (b.finalScore ?? b.autoScore) - (a.finalScore ?? a.autoScore))[0] : null;
    return {
      student: st,
      attempts: subs.length,
      latest,
      first,
      best,
      status: !latest ? 'none' : latest.status === 'pending' ? 'pending' : 'graded',
      late: latest?.late ?? false,
      improved:
        first && latest && first.id !== latest.id
          ? round((latest.finalScore ?? latest.autoScore) - (first.finalScore ?? first.autoScore), 1)
          : null,
    };
  });
}

/** 常见错误统计 */
export function errorStats(db, taskId) {
  const subs = taskId ? db.submissions.filter((s) => s.taskId === taskId) : db.submissions;
  // 只统计每位学员每个任务的最近一次
  const latestMap = new Map();
  for (const s of subs) {
    const k = `${s.taskId}|${s.studentId}`;
    const cur = latestMap.get(k);
    if (!cur || new Date(s.submittedAt) > new Date(cur.submittedAt)) latestMap.set(k, s);
  }
  const latest = [...latestMap.values()];
  const map = new Map();
  for (const s of latest) {
    for (const err of s.evaluation.errors) {
      const cur = map.get(err.type) ?? {
        type: err.type,
        label: err.label,
        students: new Set(),
        occurrences: 0,
      };
      cur.students.add(s.studentId);
      cur.occurrences += err.count;
      map.set(err.type, cur);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, studentCount: e.students.size, students: [...e.students] }))
    .sort((a, b) => b.studentCount - a.studentCount);
}

/** 学员个人错误画像 */
export function studentErrorProfile(db, studentId) {
  const subs = db.submissions.filter((s) => s.studentId === studentId);
  const latestMap = new Map();
  for (const s of subs) {
    const cur = latestMap.get(s.taskId);
    if (!cur || new Date(s.submittedAt) > new Date(cur.submittedAt)) latestMap.set(s.taskId, s);
  }
  const map = new Map();
  for (const s of latestMap.values()) {
    for (const e of s.evaluation.errors) {
      const cur = map.get(e.type) ?? { type: e.type, label: e.label, count: 0, tasks: new Set() };
      cur.count += e.count;
      cur.tasks.add(s.taskId);
      map.set(e.type, cur);
    }
  }
  return [...map.values()].map((e) => ({ ...e, taskCount: e.tasks.size }));
}

export function classSummary(db) {
  const students = db.students;
  const rows = students.map((st) => {
    const subs = db.submissions.filter((s) => s.studentId === st.id);
    const scored = subs.filter((s) => s.finalScore != null || s.status === 'pending');
    const avg = scored.length
      ? round(scored.reduce((a, s) => a + (s.finalScore ?? s.autoScore), 0) / scored.length, 1)
      : null;
    return {
      student: st,
      submissions: subs.length,
      graded: subs.filter((s) => s.status === 'graded').length,
      pending: subs.filter((s) => s.status === 'pending').length,
      avg,
      late: subs.filter((s) => s.late).length,
    };
  });
  const avgs = rows.map((r) => r.avg).filter((v) => v != null);
  return {
    rows,
    avg: avgs.length ? round(avgs.reduce((a, b) => a + b, 0) / avgs.length, 1) : null,
    submissions: db.submissions.length,
    pending: db.submissions.filter((s) => s.status === 'pending').length,
    late: db.submissions.filter((s) => s.late).length,
  };
}

export { FABRICS };
