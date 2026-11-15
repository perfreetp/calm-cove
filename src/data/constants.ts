import type {
  ActionNodeDef,
  AnimationDoc,
  BoneDef,
  MetricDef,
  PartDef,
} from '../types';

/** 采血规范指标 */
export const METRICS: MetricDef[] = [
  {
    id: 'needleAngle',
    name: '进针角度',
    unit: '°',
    min: 15,
    max: 30,
    description: '静脉穿刺针与皮肤表面夹角应保持在 15°~30° 之间',
  },
  {
    id: 'pressForce',
    name: '按压力度',
    unit: '级',
    min: 2,
    max: 4,
    description: '拔针后按压应力度适中(2~4 级),不可揉搓穿刺点',
  },
];

export function getMetric(id: string): MetricDef {
  const m = METRICS.find((x) => x.id === id);
  if (!m) throw new Error(`未知指标 ${id}`);
  return m;
}

/** 质控科拆解的五个采血动作节点及规范区间 */
export const ACTION_NODES: ActionNodeDef[] = [
  {
    id: 'disinfect',
    name: '消毒',
    order: 1,
    minDuration: 30,
    maxDuration: null,
    metrics: [],
    specText:
      '以穿刺点为中心螺旋式向外消毒,直径不少于 5cm,消毒时长不少于 30 秒,待干后再行穿刺。',
  },
  {
    id: 'insert',
    name: '进针',
    order: 2,
    minDuration: 2,
    maxDuration: 15,
    metrics: ['needleAngle'],
    specText: '绷紧皮肤,持针沿静脉走向进针,进针角度控制在 15°~30°,见回血后降低角度再进针少许。',
  },
  {
    id: 'fix',
    name: '固定',
    order: 3,
    minDuration: 10,
    maxDuration: 120,
    metrics: [],
    specText: '用胶布固定针柄,保持针头稳定,嘱患者握拳松拳,观察采血流程是否顺畅。',
  },
  {
    id: 'withdraw',
    name: '拔针',
    order: 4,
    minDuration: 1,
    maxDuration: 10,
    metrics: [],
    specText: '采血结束后松止血带,干棉签置于穿刺点上方,快速拔针,避免针尖刮擦血管壁。',
  },
  {
    id: 'press',
    name: '按压',
    order: 5,
    minDuration: 180,
    maxDuration: null,
    metrics: ['pressForce'],
    specText: '拔针后立即按压穿刺点满 3 分钟(180 秒),力度适中,禁止揉搓,凝血功能异常者延长按压。',
  },
];

export function getNode(id: string): ActionNodeDef {
  const n = ACTION_NODES.find((x) => x.id === id);
  if (!n) throw new Error(`未知动作节点 ${id}`);
  return n;
}

/**
 * 默认护士角色骨架(面向采血操作的简化五段式骨架)。
 * 约定:所有骨骼静息角 0(部件贴图竖直),关键帧值为画布旋转量并沿父子层级累加;
 * 正角度顺时针,负角度逆时针,限位用小角度区间。
 */
export function defaultBones(): BoneDef[] {
  return [
    {
      id: 'torso',
      name: '躯干',
      parentId: null,
      x: 380,
      y: 430,
      restAngle: 0,
      minAngle: -10,
      maxAngle: 10,
      length: 140,
    },
    {
      id: 'head',
      name: '头部',
      parentId: 'torso',
      x: 0,
      y: -140,
      restAngle: 0,
      minAngle: -20,
      maxAngle: 20,
      length: 38,
    },
    {
      id: 'upperArm',
      name: '上臂',
      parentId: 'torso',
      x: 4,
      y: -112,
      restAngle: 0,
      minAngle: 0,
      maxAngle: 80,
      length: 72,
    },
    {
      id: 'forearm',
      name: '前臂',
      parentId: 'upperArm',
      x: 0,
      y: -72,
      restAngle: 0,
      minAngle: 0,
      maxAngle: 100,
      length: 68,
    },
    {
      id: 'hand',
      name: '手掌',
      parentId: 'forearm',
      x: 0,
      y: -68,
      restAngle: 0,
      minAngle: -40,
      maxAngle: 40,
      length: 22,
    },
  ];
}

/** 默认内置分层拆件(程序生成贴图,可被学员导入的自定义图片替换) */
export function defaultParts(): PartDef[] {
  return [
    {
      id: 'p-torso',
      name: '躯干拆件',
      builtin: 'torso',
      src: null,
      width: 130,
      height: 170,
      // 髋关节:底部中央,对齐躯干根关节
      pivotX: 65,
      pivotY: 166,
      boneId: 'torso',
      zOrder: 0,
    },
    {
      id: 'p-head',
      name: '头部拆件',
      builtin: 'head',
      src: null,
      width: 84,
      height: 96,
      // 颈关节:底部中央,对齐头部骨骼原点
      pivotX: 42,
      pivotY: 90,
      boneId: 'head',
      zOrder: 3,
    },
    {
      id: 'p-upperarm',
      name: '上臂拆件',
      builtin: 'upperArm',
      src: null,
      width: 56,
      height: 126,
      // 肩关节:底部中央,对齐上臂骨骼原点
      pivotX: 28,
      pivotY: 122,
      boneId: 'upperArm',
      zOrder: 1,
    },
    {
      id: 'p-forearm',
      name: '前臂拆件',
      builtin: 'forearm',
      src: null,
      width: 50,
      height: 112,
      // 肘关节:底部中央,对齐前臂骨骼原点
      pivotX: 25,
      pivotY: 108,
      boneId: 'forearm',
      zOrder: 1,
    },
    {
      id: 'p-hand',
      name: '手掌拆件',
      builtin: 'hand',
      src: null,
      width: 46,
      height: 52,
      // 腕关节:顶部中央,对齐手掌骨骼原点
      pivotX: 23,
      pivotY: 10,
      boneId: 'hand',
      zOrder: 2,
    },
  ];
}

let seq = 0;
/** 工程内稳定 id 生成(时间戳 + 计数器,避免 Math.random 不可用时的问题) */
export function uid(prefix = 'id'): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq.toString(36)}`;
}

/**
 * 标准课件模板:一份满足全部规范区间的示范动画。
 * 时间轴按真实秒数排布,按压段占满 180 秒。
 */
export function createTemplateDoc(): AnimationDoc {
  const ranges: AnimationDoc['nodeRanges'] = {
    disinfect: { start: 0, end: 32 },
    insert: { start: 32, end: 40 },
    fix: { start: 40, end: 60 },
    withdraw: { start: 60, end: 64 },
    press: { start: 64, end: 244 },
  };
  const kf = (
    time: number,
    track: string,
    kind: 'bone' | 'metric',
    value: number,
    easing: AnimationDoc['keyframes'][number]['easing'] = 'easeInOut',
    bezier?: [number, number, number, number],
  ) => ({ id: uid('kf'), time, track, kind, value, easing, bezier });

  const keyframes = [
    // 骨骼轨道存局部旋转角度(静息 0,沿层级累加),全部落在限位内
    // 上臂:操作期前抬,拔针/按压调整
    kf(0, 'upperArm', 'bone', 20),
    kf(32, 'upperArm', 'bone', 20, 'linear'),
    kf(60, 'upperArm', 'bone', 22, 'easeInOut'),
    kf(70, 'upperArm', 'bone', 28),
    kf(244, 'upperArm', 'bone', 28, 'linear'),
    // 消毒:屈肘往复做螺旋擦拭
    kf(0, 'forearm', 'bone', 50),
    kf(8, 'forearm', 'bone', 70),
    kf(16, 'forearm', 'bone', 55),
    kf(24, 'forearm', 'bone', 68),
    kf(32, 'forearm', 'bone', 60),
    kf(0, 'hand', 'bone', -15),
    kf(8, 'hand', 'bone', 15),
    kf(16, 'hand', 'bone', -12),
    kf(24, 'hand', 'bone', 12),
    kf(32, 'hand', 'bone', 0),
    // 进针:前臂下压、手掌微调,进针角度 22°(规范区间内)
    kf(32, 'forearm', 'bone', 60),
    kf(40, 'forearm', 'bone', 40),
    kf(32, 'hand', 'bone', 0),
    kf(40, 'hand', 'bone', 8),
    kf(32, 'needleAngle', 'metric', 22, 'linear'),
    kf(36, 'needleAngle', 'metric', 20, 'bezier', [0.25, 0.1, 0.25, 1]),
    kf(40, 'needleAngle', 'metric', 18, 'linear'),
    // 固定:保持稳定
    kf(40, 'forearm', 'bone', 40),
    kf(60, 'forearm', 'bone', 42, 'linear'),
    kf(40, 'hand', 'bone', 8),
    kf(60, 'hand', 'bone', 6, 'linear'),
    // 拔针:快速屈肘抬臂
    kf(60, 'forearm', 'bone', 42),
    kf(64, 'forearm', 'bone', 80, 'linear'),
    kf(60, 'hand', 'bone', 6),
    kf(64, 'hand', 'bone', 0, 'linear'),
    // 按压:屈臂按压 180 秒,力度 3 级
    kf(64, 'forearm', 'bone', 80),
    kf(70, 'forearm', 'bone', 82),
    kf(244, 'forearm', 'bone', 82, 'linear'),
    kf(64, 'hand', 'bone', 0),
    kf(70, 'hand', 'bone', -8),
    kf(244, 'hand', 'bone', -8, 'linear'),
    kf(64, 'pressForce', 'metric', 3, 'linear'),
    kf(244, 'pressForce', 'metric', 3, 'linear'),
    // 头与躯干全程微动(均在各自限位内)
    kf(0, 'head', 'bone', 0, 'linear'),
    kf(40, 'head', 'bone', 6, 'easeInOut'),
    kf(244, 'head', 'bone', 3, 'linear'),
    kf(0, 'torso', 'bone', 0, 'linear'),
    kf(244, 'torso', 'bone', 0, 'linear'),
  ];

  return {
    bones: defaultBones(),
    parts: defaultParts(),
    keyframes,
    duration: 244,
    nodeRanges: ranges,
    updatedAt: Date.now(),
  };
}

/** 学员新建空白工程时的初始文档(未做动作,等待编辑) */
export function createEmptyDoc(): AnimationDoc {
  return {
    bones: defaultBones(),
    parts: defaultParts(),
    keyframes: [],
    duration: 260,
    nodeRanges: {
      disinfect: { start: 0, end: 30 },
      insert: { start: 30, end: 38 },
      fix: { start: 38, end: 58 },
      withdraw: { start: 58, end: 62 },
      press: { start: 62, end: 242 },
    },
    updatedAt: Date.now(),
  };
}
