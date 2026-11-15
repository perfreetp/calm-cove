import { createSignal } from 'solid-js';
import type {
  AnimationDoc,
  Assignment,
  Courseware,
  ReviewNodeResult,
  Role,
  Student,
  SubmissionRecord,
  SubmissionStatus,
} from '../types';
import { ACTION_NODES, createEmptyDoc, createTemplateDoc, uid } from '../data/constants';
import { autoScore, classTopMistakes } from '../lib/rules';
import { loadJSON, saveJSON, STORAGE_KEYS } from './persistence';
import { seedIfNeeded } from './seed';

seedIfNeeded();

/* ---------------- 基础数据信号 ---------------- */

const [role, setRole] = createSignal<Role>(loadJSON<Role>(STORAGE_KEYS.role, 'student'));
const [currentStudentId, setCurrentStudentId] = createSignal('s1');
const [students, setStudents] = createSignal<Student[]>(loadJSON(STORAGE_KEYS.students, []));
const [assignments, setAssignments] = createSignal<Assignment[]>(loadJSON(STORAGE_KEYS.assignments, []));
const [coursewares, setCoursewares] = createSignal<Courseware[]>(loadJSON(STORAGE_KEYS.coursewares, []));
const [submissions, setSubmissions] = createSignal<SubmissionRecord[]>(loadJSON(STORAGE_KEYS.submissions, []));

/** 学员草稿(按学生+作业维度保存) */
const [drafts, setDrafts] = createSignal<Record<string, AnimationDoc>>(
  loadJSON(STORAGE_KEYS.drafts, {}),
);

export function useAppStore() {
  function persistSubmissions(next: SubmissionRecord[]) {
    setSubmissions(next);
    saveJSON(STORAGE_KEYS.submissions, next);
  }

  function persistCoursewares(next: Courseware[]) {
    setCoursewares(next);
    saveJSON(STORAGE_KEYS.coursewares, next);
  }

  function persistDrafts(next: Record<string, AnimationDoc>) {
    setDrafts(next);
    saveJSON(STORAGE_KEYS.drafts, next);
  }

  function switchRole(r: Role) {
    setRole(r);
    saveJSON(STORAGE_KEYS.role, r);
  }

  function draftKey(studentId: string, assignmentId: string) {
    return `${studentId}:${assignmentId}`;
  }

  function getOrCreateDraft(studentId: string, assignmentId: string): AnimationDoc {
    const key = draftKey(studentId, assignmentId);
    const existing = drafts()[key];
    if (existing) return structuredClone(existing);
    const doc = createEmptyDoc();
    persistDrafts({ ...drafts(), [key]: doc });
    return doc;
  }

  function saveDraft(studentId: string, assignmentId: string, doc: AnimationDoc) {
    const key = draftKey(studentId, assignmentId);
    persistDrafts({ ...drafts(), [key]: { ...structuredClone(doc), updatedAt: Date.now() } });
  }

  function getSubmission(studentId: string, assignmentId: string): SubmissionRecord | undefined {
    return submissions().find((s) => s.studentId === studentId && s.assignmentId === assignmentId);
  }

  /** 学员提交:自动评分并进入待复核 */
  function submit(studentId: string, assignmentId: string, doc: AnimationDoc): SubmissionRecord {
    const all = submissions();
    const previous = all.find((s) => s.studentId === studentId && s.assignmentId === assignmentId);
    const score = autoScore(doc);
    const record: SubmissionRecord = previous
      ? {
          ...previous,
          doc: structuredClone(doc),
          autoScore: score,
          status: 'reviewing' as SubmissionStatus,
          review: [],
          generalComment: '',
          finalScore: null,
          submittedAt: Date.now(),
          reviewedAt: null,
        }
      : {
          id: uid('sub'),
          studentId,
          assignmentId,
          status: 'reviewing',
          doc: structuredClone(doc),
          autoScore: score,
          finalScore: null,
          review: [],
          generalComment: '',
          submittedAt: Date.now(),
          reviewedAt: null,
          revision: 0,
        };
    const next = previous ? all.map((s) => (s.id === previous.id ? record : s)) : [...all, record];
    persistSubmissions(next);
    return record;
  }

  /** 老师复核:逐段扣分评语,完成或退回 */
  function review(
    submissionId: string,
    review: ReviewNodeResult[],
    generalComment: string,
    action: 'complete' | 'return',
  ) {
    const all = submissions();
    const target = all.find((s) => s.id === submissionId);
    if (!target) return;
    let finalScore: number | null = null;
    if (action === 'complete' && target.autoScore) {
      // 老师给分段覆盖自动分,未给分沿用自动分;最终分 = 各节点均分
      const nodeScoreMap = new Map(target.autoScore.nodeScores.map((n) => [n.nodeId, n.score]));
      for (const r of review) {
        if (r.teacherScore !== null) nodeScoreMap.set(r.nodeId, r.teacherScore);
      }
      const vals = [...nodeScoreMap.values()];
      finalScore = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    const updated: SubmissionRecord = {
      ...target,
      review,
      generalComment,
      status: action === 'complete' ? 'completed' : 'returned',
      finalScore,
      reviewedAt: Date.now(),
      revision: action === 'return' ? target.revision + 1 : target.revision,
    };
    persistSubmissions(all.map((s) => (s.id === submissionId ? updated : s)));
  }

  /** 退回后学员重新编辑,状态回到待提交(草稿保留) */
  function resumeAfterReturn(studentId: string, assignmentId: string) {
    const all = submissions();
    const target = all.find((s) => s.studentId === studentId && s.assignmentId === assignmentId);
    if (!target || target.status !== 'returned') return;
    persistSubmissions(
      all.map((s) =>
        s.id === target.id ? { ...s, status: 'pending' as SubmissionStatus, finalScore: null, reviewedAt: null } : s,
      ),
    );
  }

  function saveCoursewareFromDoc(name: string, description: string, doc: AnimationDoc): Courseware {
    const cw: Courseware = {
      id: uid('cw'),
      name,
      description,
      doc: structuredClone(doc),
      builtin: false,
      createdAt: Date.now(),
    };
    persistCoursewares([...coursewares(), cw]);
    return cw;
  }

  function deleteCourseware(id: string) {
    persistCoursewares(coursewares().filter((c) => c.id !== id));
  }

  function getCourseware(id: string): Courseware | undefined {
    return coursewares().find((c) => c.id === id);
  }

  /** 成绩单:每个学员各动作节点得分 */
  function gradeBook(assignmentId: string) {
    return students().map((stu) => {
      const sub = submissions().find(
        (s) => s.studentId === stu.id && s.assignmentId === assignmentId,
      );
      const nodeMap = new Map<string, { score: number; violations: number }>();
      if (sub?.autoScore) {
        for (const n of sub.autoScore.nodeScores) {
          nodeMap.set(n.nodeId, { score: n.score, violations: n.violations.length });
        }
      }
      return {
        student: stu,
        status: sub?.status ?? ('pending' as SubmissionStatus),
        finalScore: sub?.finalScore,
        autoTotal: sub?.autoScore?.total ?? null,
        nodeMap,
        submission: sub,
      };
    });
  }

  /** 全班错得最多的三个动作 */
  function topMistakes(assignmentId: string) {
    const docs = submissions()
      .filter((s) => s.assignmentId === assignmentId)
      .map((s) => s.doc);
    return classTopMistakes(docs);
  }

  function addStudent(name: string, no: string, group: string) {
    const next = [...students(), { id: uid('s'), name, no, group }];
    setStudents(next);
    saveJSON(STORAGE_KEYS.students, next);
  }

  function resetDemoData() {
    seedIfNeeded(true);
    setStudents(loadJSON(STORAGE_KEYS.students, []));
    setAssignments(loadJSON(STORAGE_KEYS.assignments, []));
    setCoursewares(loadJSON(STORAGE_KEYS.coursewares, []));
    setSubmissions(loadJSON(STORAGE_KEYS.submissions, []));
    persistDrafts({});
  }

  return {
    // state
    role,
    currentStudentId,
    setCurrentStudentId,
    students,
    assignments,
    coursewares,
    submissions,
    drafts,
    actionNodes: ACTION_NODES,
    // actions
    switchRole,
    getOrCreateDraft,
    saveDraft,
    getSubmission,
    submit,
    review,
    resumeAfterReturn,
    saveCoursewareFromDoc,
    deleteCourseware,
    getCourseware,
    gradeBook,
    topMistakes,
    addStudent,
    resetDemoData,
    createTemplateDoc,
  };
}
