import { uid } from '../core/ids';
import { buildRig } from '../core/templates';
import type {
  ActivityEvent,
  AppState,
  AppliedAction,
  Keyframe,
  MotionAction,
  Project,
  Shot,
  TrackMap,
  User,
} from '../core/types';

export function daysFromNow(days: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Seed data                                                           */
/* ------------------------------------------------------------------ */

function key(
  time: number,
  rotation: number,
  easing: 'linear' | 'easeInOut' | 'bezier' = 'easeInOut',
  x = 0,
  y = 0,
): Keyframe {
  return {
    id: uid('key'),
    time,
    rotation,
    x,
    y,
    easing:
      easing === 'bezier' ? { type: 'bezier', p1: { x: 0.3, y: 0.05 }, p2: { x: 0.7, y: 0.95 } } : { type: easing },
  };
}

const ACTION_SEEDS: Array<{
  name: string;
  category: string;
  description: string;
  duration: number;
  templateId: string;
  bone: string;
  keys: Array<ReturnType<typeof key>>;
}> = [
  {
    name: '俯屈',
    category: '分娩机制',
    description: '胎头遇盆底阻力后下颌贴胸，使最小径线通过产道，颈部与胎头轻微前屈。',
    duration: 2.4,
    templateId: 'mechanism',
    bone: 'fetal_head',
    keys: [key(0, 0), key(0.8, -12, 'easeInOut'), key(1.8, -34, 'easeInOut'), key(2.4, -36, 'linear')],
  },
  {
    name: '内旋转',
    category: '分娩机制',
    description: '胎头在中骨盆平面向前旋转 45°，使矢状缝与中骨盆前后径一致。',
    duration: 2.6,
    templateId: 'mechanism',
    bone: 'fetal_root',
    keys: [key(0, 0), key(0.6, 0, 'easeInOut'), key(2.0, 45, 'easeInOut'), key(2.6, 45, 'linear')],
  },
  {
    name: '仰伸',
    category: '分娩机制',
    description: '宫缩与盆底共同作用，胎头以耻骨弓为支点仰伸，顶、额、面依次娩出。',
    duration: 2.2,
    templateId: 'mechanism',
    bone: 'fetal_head',
    keys: [key(0, 0), key(1.2, 18, 'easeInOut'), key(2.2, 44, 'easeInOut')],
  },
  {
    name: '复位',
    category: '分娩机制',
    description: '双肩径衔接后胎头转回原方向，完成复位与外旋转，为娩出双肩做准备。',
    duration: 1.8,
    templateId: 'mechanism',
    bone: 'fetal_root',
    keys: [key(0, 0), key(1.4, -22, 'easeInOut'), key(1.8, -22, 'linear')],
  },
  {
    name: '骨盆摆动',
    category: '骨性产道',
    description: '骶骨随胎头下降做轻微点头运动，演示骶岬的生理性让步。',
    duration: 1.6,
    templateId: 'pelvis',
    bone: 'sacrum',
    keys: [key(0, 0), key(0.8, 4, 'easeInOut'), key(1.6, 0, 'easeInOut')],
  },
  {
    name: '宫颈扩张',
    category: '软产道',
    description: '宫颈由闭合逐步扩张，配合宫缩节奏的缓慢节律变化。',
    duration: 3.0,
    templateId: 'canal',
    bone: 'cervix',
    keys: [key(0, 0), key(1.4, -14, 'easeInOut'), key(2.2, -20, 'bezier'), key(3.0, -22, 'easeInOut')],
  },
];

export function seedActions(): MotionAction[] {
  const created = daysAgoIso(40);
  return ACTION_SEEDS.map((s, i) => {
    const tracks: TrackMap = { [s.bone]: s.keys.map((k) => ({ ...k, id: uid('key') })) };
    return {
      id: `action-${i + 1}`,
      name: s.name,
      category: s.category,
      description: s.description,
      duration: s.duration,
      templateId: s.templateId,
      tracks,
      createdAt: created,
      updatedAt: created,
    };
  });
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function seedTracks(templateId: string, duration: number, preset?: string): TrackMap {
  const tracks: TrackMap = {};
  if (templateId === 'mechanism' || templateId === 'fetus') {
    const rootBone = 'fetal_root';
    tracks[rootBone] = [
      key(0, 0),
      key(duration * 0.35, 8, 'easeInOut'),
      key(duration * 0.7, 16, 'easeInOut'),
      key(duration, 20, 'easeInOut'),
    ];
    tracks['fetal_head'] = [
      key(0, 0),
      key(duration * 0.3, -10),
      key(duration * 0.6, -28),
      key(duration * 0.85, 22, 'bezier'),
      key(duration, 38, 'easeInOut'),
    ];
    tracks['fetal_body'] = [key(0, 0), key(duration * 0.5, 6, 'easeInOut'), key(duration, 4, 'linear')];
    if (preset === 'intro') {
      tracks['fetal_neck'] = [key(0, 0), key(duration * 0.4, -6), key(duration, 2)];
    }
    if (preset === 'rotation') {
      // 内旋转：胎头绕产道纵轴转 45°，同时整体下滑。
      tracks['fetal_root'] = [
        key(0, 0),
        key(duration * 0.2, 8, 'easeInOut'),
        key(duration * 0.6, 38, 'easeInOut'),
        key(duration, 45, 'easeInOut'),
      ];
      tracks['fetal_head'] = [key(0, 0), key(duration * 0.5, -8), key(duration, -4)];
      tracks['fetal_body'] = [key(0, 0), key(duration, 3)];
    }
  }
  if (templateId === 'pelvis') {
    tracks['sacrum'] = [key(0, 0), key(duration * 0.5, 4), key(duration, 0)];
    tracks['birth_inlet'] = [key(0, 0), key(duration * 0.4, -18, 'easeInOut'), key(duration, 24, 'easeInOut')];
  }
  if (templateId === 'canal') {
    tracks['cervix'] = [key(0, 0), key(duration * 0.5, -14), key(duration, -22)];
    tracks['uterus'] = [key(0, 0), key(duration * 0.5, 3), key(duration, 0)];
  }
  if (templateId === 'mechanism' && preset === 'rotation') {
    tracks['pelvis'] = [key(0, 0), key(duration * 0.6, 3), key(duration, 0)];
  }
  // Unanimated parts hold their neutral pose and simply follow their parent.
  return tracks;
}

export interface SeedOptions {
  today?: Date;
}

export function createSeedState(options: SeedOptions = {}): AppState {
  const now = options.today ?? new Date();
  const iso = now.toISOString();
  const actions = seedActions();

  const projects: Project[] = [
    {
      id: 'proj-1',
      courseName: '正常分娩机制三维化培训',
      client: '安馨母婴护理学院',
      dueDate: daysFromNow(12, now),
      resolution: { width: 1920, height: 1080, label: '1920×1080' },
      fps: 24,
      templateId: 'mechanism',
      notes: '面向助产士学员，四个分娩机制动作需连贯可辨。',
      createdAt: iso,
    },
    {
      id: 'proj-2',
      courseName: '骨性产道与软产道对比课',
      client: '南方月子会所培训中心',
      dueDate: daysFromNow(2, now),
      resolution: { width: 1280, height: 720, label: '1280×720' },
      fps: 24,
      templateId: 'pelvis',
      notes: '强调骶骨与宫颈的让步动作，讲解用慢速。',
      createdAt: iso,
    },
    {
      id: 'proj-3',
      courseName: '胎头娩出特写微课',
      client: '贝优动画外包组',
      dueDate: daysFromNow(-4, now),
      resolution: { width: 1080, height: 1080, label: '1080×1080' },
      fps: 30,
      templateId: 'fetus',
      notes: '方形画幅用于移动端，已延期需优先处理。',
      createdAt: iso,
    },
  ];

  const shotDefs: Array<{
    projectId: string;
    code: string;
    title: string;
    duration: number;
    assignee: string;
    status: Shot['status'];
    templateId: string;
    rework: number;
    preset?: string;
  }> = [
    {
      projectId: 'proj-1',
      code: 'S01',
      title: '俯屈起始',
      duration: 6,
      assignee: '林岚',
      status: 'approved',
      templateId: 'mechanism',
      rework: 1,
    },
    {
      projectId: 'proj-1',
      code: 'S02',
      title: '内旋转全程',
      duration: 8,
      assignee: '林岚',
      status: 'in_review',
      templateId: 'mechanism',
      rework: 0,
      preset: 'rotation',
    },
    {
      projectId: 'proj-1',
      code: 'S03',
      title: '仰伸与娩出',
      duration: 7,
      assignee: '周牧',
      status: 'rework',
      templateId: 'mechanism',
      rework: 1,
    },
    {
      projectId: 'proj-1',
      code: 'S04',
      title: '复位与外旋转',
      duration: 5,
      assignee: '周牧',
      status: 'draft',
      templateId: 'mechanism',
      rework: 0,
    },
    {
      projectId: 'proj-2',
      code: 'S01',
      title: '骶骨点头运动',
      duration: 5,
      assignee: '林岚',
      status: 'approved',
      templateId: 'pelvis',
      rework: 0,
    },
    {
      projectId: 'proj-2',
      code: 'S02',
      title: '宫颈扩张过程',
      duration: 6,
      assignee: '周牧',
      status: 'in_review',
      templateId: 'canal',
      rework: 0,
    },
    {
      projectId: 'proj-3',
      code: 'S01',
      title: '胎头特写',
      duration: 4,
      assignee: '林岚',
      status: 'rework',
      templateId: 'fetus',
      rework: 2,
    },
    {
      projectId: 'proj-3',
      code: 'S02',
      title: '下颌贴胸',
      duration: 4,
      assignee: '周牧',
      status: 'draft',
      templateId: 'fetus',
      rework: 0,
    },
  ];

  const shots: Shot[] = shotDefs.map((def, i) => {
    const rig = buildRig(def.templateId);
    const tracks = seedTracks(def.templateId, def.duration, def.preset);
    const applied: AppliedAction[] = [];
    if (def.projectId === 'proj-1') {
      const match = actions.find((a) =>
        def.code === 'S01' ? a.name === '俯屈' : def.code === 'S02' ? a.name === '内旋转' : null,
      );
      if (match) {
        applied.push({
          actionId: match.id,
          actionName: match.name,
          startTime: 0,
          duration: match.duration,
          appliedAt: iso,
        });
      }
    }
    return {
      id: `shot-${i + 1}`,
      projectId: def.projectId,
      code: def.code,
      title: def.title,
      order: i % 4,
      duration: def.duration,
      assignee: def.assignee,
      status: def.status,
      reworkCount: def.rework,
      createdAt: iso,
      updatedAt: iso,
      rig,
      tracks,
      appliedActions: applied,
      reviews: [],
      versions: [],
    };
  });

  const events: ActivityEvent[] = [];

  const state: AppState = {
    version: 1,
    projects,
    shots,
    actions,
    deliveries: [],
    events,
    currentUser: { name: '林岚', role: 'animator' },
    seededAt: iso,
  };
  return state;
}

export function defaultUser(): User {
  return { name: '林岚', role: 'animator' };
}
