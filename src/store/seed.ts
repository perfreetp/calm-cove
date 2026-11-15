import { ACTION_NODES, createEmptyDoc, createTemplateDoc } from '../data/constants';
import type {
  AnimationDoc,
  Assignment,
  Courseware,
  Student,
  SubmissionRecord,
} from '../types';
import { autoScore } from '../lib/rules';
import { uid } from '../data/constants';
import { loadJSON, saveJSON, STORAGE_KEYS } from './persistence';

const STUDENT_SEED: Student[] = [
  { id: 's1', name: '王晓雯', no: 'NS2026001', group: '采血一班' },
  { id: 's2', name: '李建国', no: 'NS2026002', group: '采血一班' },
  { id: 's3', name: '陈雨桐', no: 'NS2026003', group: '采血二班' },
  { id: 's4', name: '赵欣怡', no: 'NS2026004', group: '采血二班' },
  { id: 's5', name: '孙浩然', no: 'NS2026005', group: '采血三班' },
];

function makeBadDoc(): AnimationDoc {
  // 一份带典型错误的学员作业:消毒不足 30s、进针角度 38° 越界、按压只有 90s、关节越限
  const doc = createEmptyDoc();
  doc.nodeRanges = {
    disinfect: { start: 0, end: 20 },
    insert: { start: 20, end: 26 },
    fix: { start: 26, end: 40 },
    withdraw: { start: 40, end: 43 },
    press: { start: 43, end: 133 },
  };
  doc.duration = 133;
  const kf = (time: number, track: string, kind: 'bone' | 'metric', value: number, easing: 'linear' | 'easeInOut' = 'easeInOut') =>
    ({ id: uid('kf'), time, track, kind, value, easing });
  // 小角度体系:128 超出前臂限位(100)以制造关节越限违规
  doc.keyframes = [
    kf(0, 'upperArm', 'bone', 30, 'linear'),
    kf(133, 'upperArm', 'bone', 40, 'linear'),
    kf(0, 'forearm', 'bone', 55),
    kf(20, 'forearm', 'bone', 70),
    kf(20, 'hand', 'bone', 0),
    kf(26, 'forearm', 'bone', 45),
    kf(20, 'needleAngle', 'metric', 38, 'linear'),
    kf(26, 'needleAngle', 'metric', 35, 'linear'),
    kf(26, 'forearm', 'bone', 48),
    kf(40, 'forearm', 'bone', 50, 'linear'),
    kf(43, 'forearm', 'bone', 128),
    kf(133, 'forearm', 'bone', 88, 'linear'),
    kf(43, 'pressForce', 'metric', 3, 'linear'),
    kf(133, 'pressForce', 'metric', 3, 'linear'),
    kf(0, 'hand', 'bone', 0, 'linear'),
    kf(133, 'hand', 'bone', -8, 'linear'),
    kf(0, 'head', 'bone', 0, 'linear'),
    kf(133, 'head', 'bone', 0, 'linear'),
    kf(0, 'torso', 'bone', 0, 'linear'),
    kf(133, 'torso', 'bone', 0, 'linear'),
  ];
  return doc;
}

function makeMildBadDoc(): AnimationDoc {
  const doc = createTemplateDoc();
  // 按压时长缩水到 150s,其余基本合规
  doc.nodeRanges.press = { start: 64, end: 214 };
  doc.duration = 214;
  return doc;
}

export function seedIfNeeded(force = false): void {
  if (!force && loadJSON<boolean>(STORAGE_KEYS.seeded, false)) return;

  const coursewares: Courseware[] = [
    {
      id: 'cw-standard',
      name: '静脉采血标准动作课件(五节点完整版)',
      description: '覆盖消毒/进针/固定/拔针/按压全流程,全部指标落在规范区间,可直接复用为学员模板。',
      doc: createTemplateDoc(),
      builtin: true,
      createdAt: Date.now(),
    },
  ];

  const assignment: Assignment = {
    id: 'asg-1',
    title: '静脉采血规范操作骨骼动画考核',
    description:
      '依据血站采血操作规程,完成消毒(≥30s)、进针(角度15°~30°)、固定、拔针、按压(≥3分钟)五个动作节点的骨骼动画制作。',
    nodeIds: ACTION_NODES.map((n) => n.id),
    coursewareId: 'cw-standard',
    createdAt: Date.now(),
    deadline: null,
  };

  const badDoc = makeBadDoc();
  const mildDoc = makeMildBadDoc();
  const submissions: SubmissionRecord[] = [
    {
      id: 'sub-seed-1',
      studentId: 's2',
      assignmentId: 'asg-1',
      status: 'reviewing',
      doc: badDoc,
      autoScore: autoScore(badDoc),
      finalScore: null,
      review: [],
      generalComment: '',
      submittedAt: Date.now() - 86400000,
      reviewedAt: null,
      revision: 0,
    },
    {
      id: 'sub-seed-2',
      studentId: 's3',
      assignmentId: 'asg-1',
      status: 'completed',
      doc: mildDoc,
      autoScore: autoScore(mildDoc),
      finalScore: 82,
      review: ACTION_NODES.map((n) => ({
        nodeId: n.id,
        teacherScore: null,
        comment: n.id === 'press' ? '按压时长不足 180 秒,下次注意计时。' : '动作规范,节奏合理。',
        qualified: n.id !== 'press',
      })),
      generalComment: '整体流程完整,注意按压环节的计时要求。',
      submittedAt: Date.now() - 2 * 86400000,
      reviewedAt: Date.now() - 3600000,
      revision: 0,
    },
  ];

  saveJSON(STORAGE_KEYS.students, STUDENT_SEED);
  saveJSON(STORAGE_KEYS.coursewares, coursewares);
  saveJSON(STORAGE_KEYS.assignments, [assignment]);
  saveJSON(STORAGE_KEYS.submissions, submissions);
  saveJSON(STORAGE_KEYS.seeded, true);
}

export { createEmptyDoc, createTemplateDoc };
