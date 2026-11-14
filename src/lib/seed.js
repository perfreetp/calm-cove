import { evaluateModel, round } from './geometry.js';

export const FABRICS = [
  { id: 'mid-jersey', name: '中弹经编氨纶', tensionNPerMM: 0.13, baseSeamMM: 5, elasticity: 0.25 },
  { id: 'high-jersey', name: '高弹平纹氨纶', tensionNPerMM: 0.11, baseSeamMM: 5, elasticity: 0.35 },
  { id: 'low-woven', name: '低弹涤纶梭织', tensionNPerMM: 0.18, baseSeamMM: 4, elasticity: 0.15 },
];

const STUDENTS = [
  { id: 'S2024001', name: '林知远', cohort: '2024 秋季 1 班', avatar: '林' },
  { id: 'S2024002', name: '陈曼', cohort: '2024 秋季 1 班', avatar: '陈' },
  { id: 'S2024003', name: '赵一鸣', cohort: '2024 秋季 1 班', avatar: '赵' },
  { id: 'S2024004', name: '吴桐', cohort: '2024 秋季 1 班', avatar: '吴' },
  { id: 'S2024005', name: '何静', cohort: '2024 秋季 1 班', avatar: '何' },
  { id: 'S2024006', name: '罗宇', cohort: '2024 秋季 1 班', avatar: '罗' },
  { id: 'S2024007', name: '苏晚晴', cohort: '2024 秋季 1 班', avatar: '苏' },
];

const TASK_BASE = [
  {
    id: 'T-forearm-01',
    title: '右前臂屈侧压力衣',
    limb: '右前臂',
    axisLabel: '距腕横纹距离',
    span: [50, 290],
    brief:
      '患者男，34 岁，右前臂屈侧深 II 度烧伤植皮后 4 个月，瘢痕充血、高出皮面约 2 mm，肘关节活动尚可。按测量表建立围度轮廓，配置 24–32 mmHg 压力档。',
    measurements: [
      { pos: 60, circ: 162, label: '腕横纹上 1 cm' },
      { pos: 110, circ: 196, label: '前臂下 1/3' },
      { pos: 160, circ: 228, label: '前臂中段' },
      { pos: 210, circ: 252, label: '前臂最大围' },
      { pos: 250, circ: 246, label: '肘下 5 cm' },
      { pos: 285, circ: 238, label: '肘横纹下 1 cm' },
    ],
    scars: [
      { start: 145, end: 215, severity: '深 II 度', note: '充血期瘢痕，需持续加压' },
      { start: 62, end: 92, severity: 'III 度', note: '植皮区，压力需平缓过渡' },
    ],
    tier: { label: '中压档', min: 24, max: 32 },
    fabricId: 'mid-jersey',
    curvatureThreshold: 0.0016,
  },
  {
    id: 'T-calf-02',
    title: '左小腿后侧压力衣',
    limb: '左小腿',
    axisLabel: '距外踝距离',
    span: [40, 340],
    brief:
      '患者女，41 岁，左小腿后侧环形烧伤愈合后 6 个月，跟腱上方瘢痕挛缩，踝背屈受限 5°。注意跟腱区曲率过渡，避免缝份堆积。',
    measurements: [
      { pos: 50, circ: 196, label: '外踝上 1 cm' },
      { pos: 95, circ: 240, label: '跟腱上缘' },
      { pos: 145, circ: 292, label: '小腿下 1/3' },
      { pos: 210, circ: 336, label: '小腿最大围' },
      { pos: 270, circ: 318, label: '腓肠肌下缘' },
      { pos: 330, circ: 288, label: '腘窝下 3 cm' },
    ],
    scars: [
      { start: 70, end: 130, severity: 'III 度', note: '跟腱区挛缩瘢痕' },
      { start: 190, end: 260, severity: '深 II 度', note: '腓肠肌区瘢痕' },
    ],
    tier: { label: '低压档', min: 17, max: 23 },
    fabricId: 'high-jersey',
    curvatureThreshold: 0.0014,
  },
  {
    id: 'T-upperarm-03',
    title: '左上臂环形压力衣',
    limb: '左上臂',
    axisLabel: '距腋窝距离',
    span: [30, 300],
    brief:
      '患者男，26 岁，左上臂环形电烧伤后 8 个月，瘢痕稳定但跨肩关节。围度跨度大，需检查等距偏移是否自交，并按比例导出的下料图交制作间。',
    measurements: [
      { pos: 40, circ: 300, label: '腋窝下 1 cm' },
      { pos: 90, circ: 282, label: '上臂上 1/3' },
      { pos: 150, circ: 268, label: '上臂中段' },
      { pos: 210, circ: 276, label: '肱二头肌腹' },
      { pos: 260, circ: 258, label: '肘上 5 cm' },
      { pos: 295, circ: 244, label: '肘上 1 cm' },
    ],
    scars: [
      { start: 60, end: 120, severity: '深 II 度', note: '腋窝前壁瘢痕' },
      { start: 200, end: 245, severity: 'III 度', note: '植皮区边界' },
    ],
    tier: { label: '中压档', min: 18, max: 26 },
    fabricId: 'low-woven',
    curvatureThreshold: 0.0018,
  },
];

function makeReference(task) {
  // 参考轮廓直接由教师测量表生成：半径 = 围度 / 2π
  return task.measurements.map((m) => ({
    x: m.pos,
    y: Math.round((m.circ / (2 * Math.PI)) * 100) / 100,
  }));
}

function buildTasks(now) {
  const hour = 3600 * 1000;
  const day = 24 * hour;
  // 第一个任务当天截止，第二个任务已截止（用于演示补交标记），第三个仍开放
  const offsets = [20 * hour, -12 * hour, 5 * day];
  return TASK_BASE.map((t, i) => {
    const fabric = FABRICS.find((f) => f.id === t.fabricId);
    const reference = makeReference(t);
    return {
      ...t,
      pressureTier: { ...t.tier },
      fabric,
      reference,
      publishedAt: new Date(now - 8 * day).toISOString(),
      deadline: new Date(now + offsets[i]).toISOString(),
      instructor: '周敏 · 康复工程教研室',
      totalStudents: STUDENTS.length,
    };
  });
}

/** 在参考轮廓基础上加减控制点，生成一份学员作答 */
function perturb(reference, edits) {
  return reference.map((p) => {
    const e = edits.find((x) => Math.abs(x.x - p.x) < 0.5);
    return e ? { x: p.x, y: round(p.y + e.dy, 2) } : { ...p };
  });
}

function studentSubmission(task, studentId, points, offsetMM, submittedAt, attempt, review) {
  const evaluation = evaluateModel(points, task, offsetMM);
  const late = new Date(submittedAt).getTime() > new Date(task.deadline).getTime();
  const base = {
    id: `${task.id}-${studentId}-a${attempt}`,
    taskId: task.id,
    studentId,
    attempt,
    points,
    offsetMM,
    submittedAt,
    late,
    evaluation,
    autoScore: evaluation.autoScore,
    status: review ? 'graded' : 'pending',
    teacherDeduction: review?.deduction ?? null,
    teacherComment: review?.comment ?? '',
    gradedAt: review?.gradedAt ?? null,
  };
  base.finalScore =
    review != null ? round(Math.max(0, evaluation.autoScore - review.deduction), 1) : null;
  return base;
}

export function seedDatabase() {
  const now = Date.now();
  const tasks = buildTasks(now);
  const [forearm, calf, upperarm] = tasks;

  const good = perturb(forearm.reference, [
    { x: 160, dy: 1.8 },
    { x: 210, dy: -1.2 },
    { x: 250, dy: 0.9 },
  ]);

  // 陈曼：9 个控制点疏密交替 → 曲率梳锯齿（曲率突变检测命中）
  const jagged = [];
  for (let i = 0; i < 9; i++) {
    const x = 60 + (i * 225) / 8;
    const circ = 162 + (i * 76) / 8;
    jagged.push({
      x: round(x, 1),
      y: round(circ / (2 * Math.PI) + (i % 2 ? -1.5 : 1.5), 2),
    });
  }

  // 赵一鸣：前臂中段单侧隆起 → 偏差 > 5 mm，待批阅
  const drifted = [
    { x: 60, y: 25.8 },
    { x: 110, y: 31.2 },
    { x: 150, y: 36.3 },
    { x: 185, y: 46.3 },
    { x: 215, y: 40.1 },
    { x: 250, y: 39.2 },
    { x: 285, y: 37.9 },
  ];

  // 吴桐：局部尖角凹陷 → 等距偏移自交
  const notched = [
    { x: 60, y: 25.8 },
    { x: 100, y: 29.6 },
    { x: 140, y: 34.6 },
    { x: 156, y: 36.4 },
    { x: 168, y: 22.0 },
    { x: 180, y: 36.6 },
    { x: 215, y: 40.1 },
    { x: 250, y: 39.2 },
    { x: 285, y: 37.9 },
  ];

  // 何静：整体放大 → 压力掉出档位
  const loose = forearm.reference.map((p) => ({ ...p, y: round(p.y * 1.16, 2) }));

  const day = 24 * 3600 * 1000;
  const submissions = [];

  // 林知远：两次作答，第二次已批阅且高分
  submissions.push(
    studentSubmission(forearm, 'S2024001', perturb(forearm.reference, [{ x: 160, dy: 2.4 }, { x: 210, dy: -2.1 }, { x: 250, dy: 1.5 }]), 6.3, new Date(now - 2.2 * day).toISOString(), 1, {
      deduction: 6,
      comment: '最大围处轮廓偏松，压力梯度不够，已扣 6 分。第二次改进明显。',
      gradedAt: new Date(now - 2 * day).toISOString(),
    }),
    studentSubmission(forearm, 'S2024001', good, 6.3, new Date(now - 0.8 * day).toISOString(), 2, {
      deduction: 2,
      comment: '轮廓贴合度好，曲率梳连续。最大围处仍有约 1.8 mm 外扩，注意与测量表对齐。',
      gradedAt: new Date(now - 0.5 * day).toISOString(),
    })
  );

  // 陈曼：锯齿控制点 → 曲率突变
  submissions.push(
    studentSubmission(forearm, 'S2024002', jagged, 7.4, new Date(now - 1.6 * day).toISOString(), 1, {
      deduction: 8,
      comment: '控制点沿轴向等距堆叠且上下交替，曲率梳出现 6 处锯齿状突变（137–158 mm 与 181–219 mm 偏差也超 5 mm），肘下段加压不均。建议减少控制点并重新拟合。',
      gradedAt: new Date(now - 1.2 * day).toISOString(),
    })
  );

  // 赵一鸣：中段明显隆起 → 偏差 > 5mm，待批阅
  submissions.push(
    studentSubmission(forearm, 'S2024003', drifted, 6.3, new Date(now - 0.4 * day).toISOString(), 1)
  );

  // 吴桐：尖锐凹陷 → 缝份自交
  submissions.push(
    studentSubmission(forearm, 'S2024004', notched, 6.3, new Date(now - 0.9 * day).toISOString(), 1, {
      deduction: 10,
      comment: '150–185 mm 处形成尖角凹陷，6.3 mm 等距偏移在该处自交 1 次，下料图会出现重叠尖角，必须先把凹陷过渡成圆弧再生成缝份。',
      gradedAt: new Date(now - 0.6 * day).toISOString(),
    })
  );

  // 何静：整体偏大 → 压力低于档位
  submissions.push(
    studentSubmission(forearm, 'S2024005', loose, 6.3, new Date(now - 1 * day).toISOString(), 1, {
      deduction: 4,
      comment: '整体围度按 1.16 倍放大，估算压力掉到 24 mmHg 边界以下，达不到 24–32 mmHg 中压档。请回看测量表。',
      gradedAt: new Date(now - 0.7 * day).toISOString(),
    })
  );

  // 罗宇：超过截止时间 → 补交；小腿任务
  submissions.push(
    studentSubmission(
      calf,
      'S2024006',
      perturb(calf.reference, [{ x: 145, dy: 7.5 }, { x: 210, dy: -3.4 }, { x: 270, dy: 5.0 }]),
      6.8,
      new Date(now - 2 * 3600 * 1000).toISOString(),
      1
    )
  );

  // 上臂任务：给两位学员的示例
  submissions.push(
    studentSubmission(
      upperarm,
      'S2024001',
      perturb(upperarm.reference, [{ x: 150, dy: 2.2 }, { x: 210, dy: 2.8 }, { x: 260, dy: -1.4 }]),
      4.6,
      new Date(now - 0.2 * day).toISOString(),
      1
    ),
    studentSubmission(
      upperarm,
      'S2024002',
      upperarm.reference.map((p) => ({ ...p, y: p.y + 4.8 })),
      4.6,
      new Date(now - 0.25 * day).toISOString(),
      1
    )
  );

  // 陈曼小腿：控制点不足导致末端断层（生成时的常错案例）
  const calfShort = calf.reference.map((p, i) => (i > 3 ? { ...p, y: p.y + 6.5 } : p));
  submissions.push(
    studentSubmission(calf, 'S2024002', calfShort, 6.8, new Date(now - 1.6 * day).toISOString(), 1, {
      deduction: 5,
      comment: '腘窝段未按测量表收口，末端出现台阶。曲线应完整覆盖测量表首末点。',
      gradedAt: new Date(now - 0.3 * day).toISOString(),
    })
  );

  const assigned = new Set(submissions.map((s) => `${s.taskId}|${s.studentId}`));
  const last = new Map();
  for (const s of submissions) {
    const k = `${s.taskId}|${s.studentId}`;
    if (!last.has(k) || new Date(s.submittedAt) > new Date(last.get(k).submittedAt)) last.set(k, s);
  }

  return {
    version: 1,
    createdAt: new Date(now).toISOString(),
    tasks,
    students: STUDENTS,
    submissions,
    session: {
      role: 'student',
      studentId: 'S2024001',
      taskId: 'T-forearm-01',
    },
    teacher: { id: 'T-01', name: '周敏', title: '康复工程教研室 · 讲师' },
    meta: {
      assigned: [...assigned],
      lastSubmissionBy: [...last.entries()].map(([k, v]) => [k, v.id]),
    },
  };
}

export { STUDENTS };
