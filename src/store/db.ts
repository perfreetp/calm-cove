// ---------- 本地持久化数据层(localStorage) ----------
import { createSignal } from "solid-js";
import type { Question, Submission, Task, User } from "../types";

const KEY = "nb-studio-db-v1";

export interface Db {
  users: User[];
  questions: Question[];
  tasks: Task[];
  submissions: Submission[];
}

function seedDb(): Db {
  const users: User[] = [
    { id: "t1", name: "王老师", role: "teacher", className: "道桥2301" },
    { id: "s1", name: "李同学", role: "student", className: "道桥2301" },
    { id: "s2", name: "张同学", role: "student", className: "道桥2301" },
    { id: "s3", name: "赵同学", role: "student", className: "道桥2302" },
  ];
  const questions: Question[] = [
    {
      id: "q1",
      title: "城市高架桥段声屏障设计(直线段)",
      examPoints: ["高度控制", "立柱间距", "透明屏配比", "桩号核算", "降噪设计"],
      stakeStart: 12300,
      stakeEnd: 12540,
      maxHeight: 4.0,
      colSpacingStd: 2.0,
      colSpacingMin: 1.8,
      colSpacingMax: 2.5,
      transparentRatioMin: 0.25,
      noiseReqDb: 20,
      seed: 20260101,
      createdBy: "t1",
      createdAt: new Date().toISOString(),
    },
    {
      id: "q2",
      title: "互通立交匝道段声屏障设计(小半径)",
      examPoints: ["高度控制", "立柱间距", "降噪设计", "构造处理"],
      stakeStart: 8600,
      stakeEnd: 8760,
      maxHeight: 3.5,
      colSpacingStd: 2.0,
      colSpacingMin: 1.5,
      colSpacingMax: 2.2,
      transparentRatioMin: 0.3,
      noiseReqDb: 18,
      seed: 20260202,
      createdBy: "t1",
      createdAt: new Date().toISOString(),
    },
  ];
  const tasks: Task[] = [
    {
      id: "task1",
      questionId: "q1",
      studentId: "s1",
      status: "pending",
      deadline: "2026-11-30",
      createdAt: new Date().toISOString(),
    },
    {
      id: "task2",
      questionId: "q2",
      studentId: "s1",
      status: "pending",
      deadline: "2026-12-05",
      createdAt: new Date().toISOString(),
    },
    {
      id: "task3",
      questionId: "q1",
      studentId: "s2",
      status: "pending",
      deadline: "2026-11-30",
      createdAt: new Date().toISOString(),
    },
  ];
  return { users, questions, tasks, submissions: [] };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* 损坏则重建 */
  }
  const db = seedDb();
  localStorage.setItem(KEY, JSON.stringify(db));
  return db;
}

const [db, setDb] = createSignal<Db>(load());

function persist(next: Db) {
  setDb(next);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function useDb() {
  return db;
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ----- 题库 -----
export function addQuestion(q: Question) {
  persist({ ...db(), questions: [...db().questions, q] });
}
export function deleteQuestion(id: string) {
  persist({
    ...db(),
    questions: db().questions.filter((q) => q.id !== id),
    tasks: db().tasks.filter((t) => t.questionId !== id),
  });
}

// ----- 任务 -----
export function addTask(t: Task) {
  persist({ ...db(), tasks: [...db().tasks, t] });
}
export function updateTask(id: string, patch: Partial<Task>) {
  persist({
    ...db(),
    tasks: db().tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  });
}

// ----- 提交 -----
export function upsertSubmission(s: Submission) {
  const list = db().submissions;
  const i = list.findIndex((x) => x.id === s.id);
  const submissions = i >= 0 ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
  persist({ ...db(), submissions });
}
export function getSubmissionByTask(taskId: string): Submission | undefined {
  return db().submissions.find((s) => s.taskId === taskId);
}

export function resetDb() {
  const fresh = seedDb();
  localStorage.setItem(KEY, JSON.stringify(fresh));
  setDb(fresh);
}
