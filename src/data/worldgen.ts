import type {
  Canal,
  CanalLevel,
  DocStatus,
  Feature,
  FeatureRevision,
  FeatureType,
  PropBag,
  Rejection,
  RasterSheet,
  World,
} from '../types'
import { LEVEL_ORDER, TYPE_CODE, TYPE_LABEL } from '../types'
import { bboxOf, chaikin, mulberry32, pathOf, pointAtDistance, polylineLength, type Pt } from '../lib/geo'

export const WORLD_W = 4200
export const WORLD_H = 3000

/* ------------------------------------------------------------------ */
/* terrain                                                             */
/* ------------------------------------------------------------------ */

function hash2(ix: number, iy: number, seed = 7): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}

/** ground elevation in metres — three ridges, three valleys */
export function elevationAt(x: number, y: number): number {
  const u = x / WORLD_W
  const v = y / WORLD_H
  let e = 760 + 150 * Math.sin(v * Math.PI * 3 + 0.6) + 90 * Math.sin(u * Math.PI * 2 + 1.2)
  e += 210 * Math.cos(v * Math.PI * 6.0 + u * 2.2) * (0.4 + 0.6 * u)
  e += 480 * (valueNoise(x / 260, y / 260, 11) - 0.35)
  e += 190 * (valueNoise(x / 90, y / 90, 23) - 0.5)
  e += 70 * (valueNoise(x / 32, y / 32, 41) - 0.5)
  return Math.max(520, e)
}

/* ------------------------------------------------------------------ */
/* names                                                               */
/* ------------------------------------------------------------------ */

const TRUNKS = [
  { code: 'QG-1', name: '青杠岭干渠', y: 760, dir: 1 },
  { code: 'SM-2', name: '石门干渠', y: 1620, dir: -1 },
  { code: 'BY-3', name: '白岩干渠', y: 2380, dir: 1 },
]

const BRANCH_WORDS = [
  '核桃坪', '杉树湾', '磨盘山', '青石沟', '大槽', '凉风垭', '老鹰岩', '红岩', '黄泥堡', '王家坪',
  '马鞍山', '响水洞', '枇杷湾', '李子沟', '枫香坪', '茅草坡', '园木岭', '柏林', '干溪', '石板溪',
  '皂角垭', '岩门口', '水井湾', '学堂坪', '半边街', '中梁山', '月儿坝', '梨子坡', '老屋基', '皮匠沟',
]

const GATE_KIND = ['分水闸', '节制闸', '退水闸', '进水闸', '泄水闸']
const WEIR_KIND = ['量水堰', '三角量水堰', '巴歇尔量水槽', '矩形量水堰']
const PUMP_KIND = ['提水泵站', '加压泵站', '二级提灌站']
const DROP_KIND = ['跌水', '陡坡跌水']
const CULVERT_KIND = ['涵洞', '倒虹吸涵', '穿路涵']
const GATE_STYLE = ['平板钢闸门', '弧形钢闸门', '铸铁闸门', '混凝土叠梁闸']
const WEIR_SHAPE = ['矩形堰', '三角堰', '巴歇尔槽']
const ENERGY = ['消力池', '挑流消能', '底流消能', '台阶式消能']

const REVIEWERS = ['周立群', '陈晓岚', '杨宗义']
const PROCESSORS = ['刘卫东', '何小梅', '张建国', '宋清']

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length) % arr.length]
}

function round(n: number, d = 0): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

/* ------------------------------------------------------------------ */
/* canal geometry                                                      */
/* ------------------------------------------------------------------ */

function makeTrunkPath(rand: () => number, y0: number, dir: number): Pt[] {
  const ctrl: Pt[] = []
  const n = 9
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = 130 + t * (WORLD_W - 290)
    const y = y0 + Math.sin(t * Math.PI * 2.2 + y0) * 115 + (rand() - 0.5) * 70
    ctrl.push([x, y])
  }
  // keep the trunk from running off the sheet
  return chaikin(ctrl, 3).map(([x, y]) => [x, Math.max(160, Math.min(WORLD_H - 160, y))] as Pt)
}

function makeBranchPath(rand: () => number, origin: Pt, dir: number, length: number): Pt[] {
  const ctrl: Pt[] = [origin]
  const steps = 5
  const outward = dir === 1 ? -1 : 1 // valley trunk, branches climb into hills
  const lean = (rand() - 0.5) * 0.7
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const dx = (Math.sin(t * 2.6 + rand() * 0.25) * 0.5 + lean) * length * 0.22
    ctrl.push([origin[0] + dx, origin[1] + outward * length * t])
  }
  return chaikin(ctrl, 2)
}

function makeLateralPath(rand: () => number, origin: Pt, dir: number, length: number): Pt[] {
  const outward = dir === 1 ? -1 : 1
  const ctrl: Pt[] = [origin]
  const steps = 4
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    ctrl.push([
      origin[0] + (rand() - 0.5) * length * 0.55 + t * length * 0.18,
      origin[1] + outward * length * t,
    ])
  }
  return chaikin(ctrl, 1)
}

/* ------------------------------------------------------------------ */
/* generation                                                          */
/* ------------------------------------------------------------------ */

const YEAR_POOL = [1963, 1968, 1971, 1975, 1978, 1982, 1986, 1990, 1994, 1998, 2003, 2008, 2012, 2016, 2019, 2021]

function statusRoll(rand: () => number): DocStatus {
  const r = rand()
  if (r < 0.3) return 'draft'
  if (r < 0.43) return 'submitted'
  if (r < 0.52) return 'rejected'
  if (r < 0.82) return 'approved'
  return 'archived'
}

function revisionDate(version: number, baseYear: number): string {
  const year = Math.min(2025, baseYear + 6 + version * 4)
  const month = 1 + ((version * 5 + baseYear) % 12)
  const day = 1 + ((version * 11 + baseYear) % 27)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function buildWorld(): World {
  const rand = mulberry32(20261115)
  const canals: Canal[] = []
  const features: Feature[] = []
  const rejections: Rejection[] = []
  const codeCounters = new Map<string, number>()

  const registerCanal = (c: Canal) => {
    canals.push(c)
  }

  TRUNKS.forEach((t, ti) => {
    const trunkPts = makeTrunkPath(rand, t.y, t.dir)
    const trunkLenU = polylineLength(trunkPts)
    const trunk = {
      id: `c-trunk-${ti}`,
      code: t.code,
      name: t.name,
      level: 'trunk' as CanalLevel,
      parentId: null,
      startChainage: 0,
      endChainage: round(trunkLenU * 4, 0),
      designFlow: round(14 + rand() * 9, 2),
      builtYear: pick(rand, [1963, 1968, 1971, 1975]),
      status: statusRoll(rand),
      version: 1,
      length: trunkLenU * 4,
      pts: trunkPts,
      d: pathOf(trunkPts),
      bbox: bboxOf(trunkPts),
    } as Canal
    if (trunk.status === 'archived') trunk.version = 3 + Math.floor(rand() * 2)
    registerCanal(trunk)

    // branches along the trunk
    const branchCount = 20 + ti * 4
    for (let bi = 0; bi < branchCount; bi++) {
      const tRel = (bi + 0.6 + rand() * 0.3) / (branchCount + 0.5)
      const at = tRel * trunkLenU
      const origin = pointAtDistance(trunkPts, at)
      const blen = 240 + rand() * 190
      const bPts = makeBranchPath(rand, origin, t.dir, blen)
      const bLenU = polylineLength(bPts)
      const bNum = String(bi + 1).padStart(2, '0')
      const branch: Canal = {
        id: `c-branch-${ti}-${bi}`,
        code: `${t.code}-${bNum}`,
        name: `${pick(rand, BRANCH_WORDS)}支渠`,
        level: 'branch',
        parentId: trunk.id,
        startChainage: 0,
        endChainage: Math.round(bLenU * 4),
        designFlow: round(1.2 + rand() * 3.4, 2),
        builtYear: pick(rand, YEAR_POOL.slice(0, 10)),
        status: statusRoll(rand),
        version: 1,
        length: bLenU * 4,
        pts: bPts,
        d: pathOf(bPts),
        bbox: bboxOf(bPts),
      }
      if (branch.status === 'archived') branch.version = 2 + Math.floor(rand() * 3)
      registerCanal(branch)

      const lateralCount = 7 + Math.floor(rand() * 4)
      for (let li = 0; li < lateralCount; li++) {
        const lt = (li + 0.5 + rand() * 0.5) / lateralCount
        const lOrigin = pointAtDistance(bPts, lt * bLenU)
        const llen = 90 + rand() * 120
        const lPts = makeLateralPath(rand, lOrigin, t.dir, llen)
        const lLenU = polylineLength(lPts)
        if (lLenU < 20) continue
        const lNum = String(li + 1).padStart(2, '0')
        const lateral: Canal = {
          id: `c-lat-${ti}-${bi}-${li}`,
          code: `${branch.code}-${lNum}`,
          name: `${pick(rand, BRANCH_WORDS)}斗渠`,
          level: 'lateral',
          parentId: branch.id,
          startChainage: 0,
          endChainage: Math.round(lLenU * 4),
          designFlow: round(0.08 + rand() * 0.42, 2),
          builtYear: pick(rand, YEAR_POOL),
          status: statusRoll(rand),
          version: 1,
          length: lLenU * 4,
          pts: lPts,
          d: pathOf(lPts),
          bbox: bboxOf(lPts),
        }
        if (lateral.status === 'archived') lateral.version = 2 + Math.floor(rand() * 3)
        registerCanal(lateral)
      }
    }
  })

  /* ---------------- features ---------------- */

  const typeWeights: Record<CanalLevel, [FeatureType, number][]> = {
    trunk: [['gate', 0.38], ['pump', 0.2], ['culvert', 0.19], ['weir', 0.12], ['drop', 0.11]],
    branch: [['gate', 0.34], ['weir', 0.22], ['culvert', 0.18], ['drop', 0.16], ['pump', 0.1]],
    lateral: [['gate', 0.28], ['weir', 0.29], ['culvert', 0.15], ['drop', 0.21], ['pump', 0.07]],
  }

  const density: Record<CanalLevel, number> = { trunk: 250, branch: 96, lateral: 21 }

  function rollType(level: CanalLevel): FeatureType {
    const weights = typeWeights[level]
    let r = rand()
    for (const [t, w] of weights) {
      if (r < w) return t
      r -= w
    }
    return 'gate'
  }

  function featureProps(type: FeatureType, canal: Canal, chainage: number, idx: number): PropBag {
    const q = Math.max(0.05, canal.designFlow * (0.15 + rand() * 0.6))
    switch (type) {
      case 'gate':
        return {
          类别: pick(rand, GATE_KIND),
          闸门型式: pick(rand, GATE_STYLE),
          孔口宽度: `${round(0.8 + rand() * 2.6, 1)} m`,
          设计流量: `${round(q, 2)} m³/s`,
          启闭方式: pick(rand, ['手电两用螺杆', '电动卷扬', '手动葫芦']),
          管理单位: pick(rand, ['一管所', '二管所', '三管所']),
        }
      case 'weir':
        return {
          堰型: pick(rand, WEIR_SHAPE),
          堰宽: `${round(0.6 + rand() * 2.2, 1)} m`,
          量程: `${round(0.15 + rand() * 0.9, 2)} m³/s`,
          刻度精度: pick(rand, ['1 cm', '5 mm', '2 cm']),
          水尺零点: `${round(700 + rand() * 90, 2)} m`,
        }
      case 'pump':
        return {
          装机功率: `${round(7.5 + rand() * 55, 1)} kW`,
          扬程: `${round(8 + rand() * 42, 1)} m`,
          机组台数: `${1 + Math.floor(rand() * 3)} 台`,
          设计流量: `${round(0.05 + rand() * 0.5, 2)} m³/s`,
          管理单位: pick(rand, ['一管所', '二管所', '三管所']),
        }
      case 'drop':
        return {
          跌差: `${round(0.4 + rand() * 2.8, 2)} m`,
          消能方式: pick(rand, ENERGY),
          边墙型式: pick(rand, ['浆砌石重力墙', '混凝土挡墙']),
          设计流量: `${round(q, 2)} m³/s`,
        }
      case 'culvert':
        return {
          断面型式: pick(rand, ['圆管涵', '盖板涵', '拱涵', '箱涵']),
          孔径: `${round(0.5 + rand() * 1.6, 2)} m`,
          洞长: `${round(6 + rand() * 30, 1)} m`,
          设计流量: `${round(q, 2)} m³/s`,
          进出口形式: pick(rand, ['八字墙', '一字墙', '跌井式']),
        }
    }
  }

  const featureShortSeq = new Map<string, number>()

  function addFeaturesForCanal(canal: Canal, count: number, atHead: boolean) {
    // main features ordered by chainage
    const chainages: number[] = []
    for (let i = 0; i < count; i++) {
      const base = atHead ? i / Math.max(1, count) : (i + 0.4 + rand() * 0.4) / Math.max(1, count)
      const chain = Math.min(canal.endChainage - 4, Math.max(2, base * canal.endChainage))
      chainages.push(chain)
    }
    chainages.sort((a, b) => a - b)
    chainages.forEach((chain, i) => {
      const type = i === 0 && canal.level !== 'trunk' && rand() < 0.8 ? 'gate' : rollType(canal.level)
      const p = pointAtDistance(canal.pts, chain / 4)
      const jitter = 2.2
      const x = round(p[0] + (rand() - 0.5) * jitter, 1)
      const y = round(p[1] + (rand() - 0.5) * jitter, 1)
      const seqKey = `${type}`
      const seq = (featureShortSeq.get(seqKey) || 0) + 1
      featureShortSeq.set(seqKey, seq)
      const shortCode = `${TYPE_CODE[type]}-${String(seq).padStart(3, '0')}`
      const id = `f-${canal.id}-${i}`
      const status: DocStatus =
        canal.status === 'rejected' && rand() < 0.4
          ? 'rejected'
          : canal.status === 'submitted' && rand() < 0.15
            ? 'draft'
            : canal.status
      const version = 1 + (rand() < 0.12 ? 1 + Math.floor(rand() * 2) : 0)
      const builtYear = Math.max(1958, Math.min(2024, canal.builtYear + Math.round((rand() - 0.5) * 18)))
      const props = featureProps(type, canal, chain, i)
      const revisions: FeatureRevision[] = []
      for (let v = 1; v <= version; v++) {
        const shift = v === version ? 0 : (rand() - 0.5) * 16
        const chShift = v === version ? 0 : round((rand() - 0.5) * 90, 0)
        const rp = pointAtDistance(canal.pts, (chain + chShift) / 4)
        revisions.push({
          version: v,
          date: revisionDate(v, builtYear),
          author: v === version ? pick(rand, PROCESSORS) : pick(rand, ['王大成', '李守义', '刘卫东', '何小梅']),
          note:
            v === version
              ? status === 'archived'
                ? '资料整编归档，桩号复核无误'
                : '现场核对桩号与尺寸，重新矢量化'
              : pick(rand, [
                  '初测上图，桩号按 1998 年竣工图录入',
                  '补测闸底板高程，位置微调',
                  '渠道改线后重新量距',
                  '量水堰更换为巴歇尔槽',
                  '核对管理桩，修正至现状位置',
                ]),
          x: round(rp[0] + shift * 0.55, 1),
          y: round(rp[1] + shift * 0.35, 1),
          chainage: round(Math.max(0, Math.min(canal.endChainage, chain + chShift)), 0),
          props: v === version ? { ...props } : historicalProps(props, type, v, version, rand),
        })
      }
      const latest = revisions[revisions.length - 1]
      features.push({
        id,
        code: `${canal.code}-${TYPE_CODE[type]}-${String(seq).padStart(3, '0')}`,
        shortCode,
        name: `${canal.name} ${formatStakeShort(chain)} ${pick(rand, kindList(type))}`,
        type,
        canalId: canal.id,
        level: canal.level,
        x: latest.x,
        y: latest.y,
        chainage: latest.chainage,
        status,
        processed: status !== 'draft',
        version,
        builtYear,
        props: latest.props,
        revisions,
        updatedAt: latest.date,
      })
    })
  }

  for (const canal of canals) {
    const count = Math.round(density[canal.level] * (0.82 + rand() * 0.36))
    addFeaturesForCanal(canal, count, true)
  }

  /* ---------------- rejections ---------------- */

  const rejectedCanals = canals.filter((c) => c.status === 'rejected')
  const reasons = [
    '起止桩号与竣工图不符，斗渠入口段整体偏移约 12 m',
    '量水堰位置与渠道中心线不重合，需按现场水尺重新量距',
    '该段涵洞在扫描图上被树影遮挡，矢量化位置不可靠',
    '设计流量与 2019 年节水改造后的实际过流能力不一致',
    '跌水要素缺少消能方式，且桩号重复录入',
  ]
  for (const canal of rejectedCanals) {
    const a = round(rand() * canal.endChainage * 0.45, 0)
    const b = round(Math.min(canal.endChainage, a + canal.endChainage * (0.18 + rand() * 0.4)), 0)
    const ids = features
      .filter((f) => f.canalId === canal.id && f.chainage >= a && f.chainage <= b)
      .map((f) => f.id)
    rejections.push({
      id: `rej-${canal.id}`,
      canalId: canal.id,
      startChainage: a,
      endChainage: b,
      reason: pick(rand, reasons),
      reviewer: pick(rand, REVIEWERS),
      date: `2025-${String(3 + Math.floor(rand() * 8)).padStart(2, '0')}-${String(2 + Math.floor(rand() * 25)).padStart(2, '0')}`,
      featureIds: ids,
    })
  }

  return { canals, features, rejections }
}

/** earlier revisions carry slightly different attributes, so the
 *  version-comparison table has real content to show */
function historicalProps(
  latest: PropBag,
  type: FeatureType,
  version: number,
  latestVersion: number,
  rand: () => number,
): PropBag {
  const out: PropBag = { ...latest }
  const age = latestVersion - version
  const before = (cur: string | number, unit: string, factor: number) => {
    const n = Number(String(cur).split(' ')[0])
    if (!Number.isFinite(n)) return cur
    const v = Math.max(0.1, n * (1 - factor * age * (0.7 + rand() * 0.6)))
    return `${round(v, 2)} ${unit}`
  }
  switch (type) {
    case 'gate':
      out['闸门型式'] = pick(rand, ['铸铁闸门', '混凝土叠梁闸', '平板钢闸门'])
      out['孔口宽度'] = before(latest['孔口宽度'] ?? '', 'm', 0.07)
      out['设计流量'] = before(latest['设计流量'] ?? '', 'm³/s', 0.12)
      out['启闭方式'] = pick(rand, ['手动葫芦', '手动螺杆'])
      break
    case 'weir':
      out['堰型'] = pick(rand, ['矩形堰', '三角堰'])
      out['堰宽'] = before(latest['堰宽'] ?? '', 'm', 0.08)
      out['量程'] = before(latest['量程'] ?? '', 'm³/s', 0.15)
      out['刻度精度'] = pick(rand, ['2 cm', '5 cm'])
      break
    case 'pump':
      out['装机功率'] = before(latest['装机功率'] ?? '', 'kW', 0.16)
      out['扬程'] = before(latest['扬程'] ?? '', 'm', 0.1)
      out['机组台数'] = `${Math.max(1, Number(String(latest['机组台数']).split(' ')[0]) - 1)} 台`
      break
    case 'drop':
      out['跌差'] = before(latest['跌差'] ?? '', 'm', 0.09)
      out['消能方式'] = pick(rand, ['挑流消能', '台阶式消能', '底流消能'])
      break
    case 'culvert':
      out['断面型式'] = pick(rand, ['圆管涵', '盖板涵', '拱涵'])
      out['孔径'] = before(latest['孔径'] ?? '', 'm', 0.11)
      out['洞长'] = before(latest['洞长'] ?? '', 'm', 0.06)
      break
  }
  return out
}

function formatStakeShort(m: number): string {
  const v = Math.max(0, Math.round(m))
  return `${Math.floor(v / 1000)}+${String(v % 1000).padStart(3, '0')}`
}

function kindList(type: FeatureType): string[] {
  switch (type) {
    case 'gate':
      return GATE_KIND
    case 'weir':
      return WEIR_KIND
    case 'pump':
      return PUMP_KIND
    case 'drop':
      return DROP_KIND
    case 'culvert':
      return CULVERT_KIND
  }
}

/* ------------------------------------------------------------------ */
/* indexes                                                             */
/* ------------------------------------------------------------------ */

export const GRID_CELL = 100

function key(cx: number, cy: number) {
  return `${cx},${cy}`
}

export interface SpatialIndex {
  cell: number
  cols: number
  rows: number
  buckets: Map<string, number[]>
  query(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    out: number[],
    accept?: (f: Feature) => boolean,
  ): number[]
}

export function buildIndex(features: Feature[]): SpatialIndex {
  const cell = GRID_CELL
  const cols = Math.ceil(WORLD_W / cell) + 1
  const rows = Math.ceil(WORLD_H / cell) + 1
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < features.length; i++) {
    const f = features[i]
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(f.x / cell)))
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(f.y / cell)))
    const k = key(cx, cy)
    let arr = buckets.get(k)
    if (!arr) {
      arr = []
      buckets.set(k, arr)
    }
    arr.push(i)
  }
  return {
    cell,
    cols,
    rows,
    buckets,
    query(x0, y0, x1, y1, out, accept) {
      out.length = 0
      const cx0 = Math.max(0, Math.floor(x0 / cell))
      const cy0 = Math.max(0, Math.floor(y0 / cell))
      const cx1 = Math.min(cols - 1, Math.floor(x1 / cell))
      const cy1 = Math.min(rows - 1, Math.floor(y1 / cell))
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const arr = buckets.get(key(cx, cy))
          if (!arr) continue
          for (let i = 0; i < arr.length; i++) {
            const fi = arr[i]
            if (accept && !accept(features[fi])) continue
            out.push(fi)
          }
        }
      }
      return out
    },
  }
}

export interface WorldMeta {
  index: SpatialIndex
  byCanal: Map<string, Feature[]>
  byParent: Map<string, Canal[]>
  canalById: Map<string, Canal>
  featureById: Map<string, Feature>
  originChanByCanal: Map<string, number>
}

export function buildMeta(world: World): WorldMeta {
  const byCanal = new Map<string, Feature[]>()
  for (const f of world.features) {
    let arr = byCanal.get(f.canalId)
    if (!arr) {
      arr = []
      byCanal.set(f.canalId, arr)
    }
    arr.push(f)
  }
  for (const arr of byCanal.values()) arr.sort((a, b) => a.chainage - b.chainage)

  const byParent = new Map<string, Canal[]>()
  const canalById = new Map<string, Canal>()
  for (const c of world.canals) {
    canalById.set(c.id, c)
    const pk = c.parentId || '__root'
    let arr = byParent.get(pk)
    if (!arr) {
      arr = []
      byParent.set(pk, arr)
    }
    arr.push(c)
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.code.localeCompare(b.code))
  }
  const featureById = new Map(world.features.map((f) => [f.id, f]))
  return {
    index: buildIndex(world.features),
    byCanal,
    byParent,
    canalById,
    featureById,
    originChanByCanal: new Map(world.canals.map((c) => [c.id, c.startChainage])),
  }
}

/* ------------------------------------------------------------------ */
/* scanned sheets                                                      */
/* ------------------------------------------------------------------ */

export const SHEETS: RasterSheet[] = [
  { id: 'sheet-1', name: '青杠岭干渠 1+000～6+500 竣工图（1998 扫描件）', url: '', x: 220, y: 380, w: 1900, h: 900, opacity: 0.34 },
  { id: 'sheet-2', name: '石门干渠 0+000～4+800 复核草图（手绘）', url: '', x: 2100, y: 1150, w: 1500, h: 1000, opacity: 0.28 },
  { id: 'sheet-3', name: '白岩干渠斗渠布置图（2016 拍摄照片）', url: '', x: 900, y: 1850, w: 1300, h: 820, opacity: 0.26 },
  { id: 'sheet-4', name: '灌区总平面图（1978 蓝晒图翻拍）', url: '', x: 220, y: 150, w: 1600, h: 1100, opacity: 0.22 },
]

export function totalFeatureCount(world: World) {
  return world.features.length
}

export function makeToolName(type: FeatureType) {
  return TYPE_LABEL[type]
}
