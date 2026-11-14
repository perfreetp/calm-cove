import { reactive, computed } from 'vue';
import { buildTemplate, docClone, TEMPLATES, CATEGORIES, STATUS, uid, emptyDoc, layerByName, computeBOM, legibility } from './model.js';

export { STATUS, CATEGORIES, TEMPLATES };

const LS_KEY = 'biaobantong.state.v2';
const HISTORY_LIMIT = 120; // ≥ 50 undo steps required
const AUTOSAVE_MS = 600;

export const USERS = {
  maker: { id: 'u_maker', name: '陈工', role: 'maker', roleLabel: '制作方 · 版面设计' },
  reviewer: { id: 'u_reviewer', name: '李审', role: 'reviewer', roleLabel: '审核方 · 交安工程' },
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Seed data                                                          */
/* ------------------------------------------------------------------ */

function makeVersion(sign, no, doc, status = 'draft', when = null) {
  return {
    id: uid('V'),
    name: `V${no}`,
    no,
    status, // draft | submitted | returned | approved
    doc,
    createdAt: when || new Date().toISOString(),
    submittedAt: status === 'submitted' || status === 'returned' || status === 'approved' ? (when || new Date().toISOString()) : null,
    approvedAt: status === 'approved' ? (when || new Date().toISOString()) : null,
    author: USERS.maker.name,
    note: '',
    packageExportedAt: null,
  };
}

function seed() {
  const projects = [
    { id: 'P1', name: '京港澳高速 K1120 段标志改造', client: '省交投集团', stage: '施工图' },
    { id: 'P2', name: '青阳互通出口指路系统', client: '市公路局', stage: '施工图' },
  ];

  const t1 = buildTemplate('p-speed').doc;
  // V2 incorporates the review: ring 50→54mm, number moved down 40mm
  const t1v1 = docClone(t1);
  const t1v2 = docClone(t1);
  t1v1.layers.find((l) => l.name === '红圈边框').strokeWidth = 50;
  t1v1.layers.find((l) => l.name === '限速数值').y = 132;
  t1v1.layers.find((l) => l.name === '限速数值').charWidth = 246;
  t1v2.layers.find((l) => l.name === '红圈边框').strokeWidth = 54;
  t1v2.layers.find((l) => l.name === '限速数值').y = 172;
  t1v2.layers.find((l) => l.name === '限速数值').charWidth = 260;
  const t2 = buildTemplate('m-straight').doc;
  const t3 = buildTemplate('g-exit').doc;
  const t4 = buildTemplate('p-no-entry').doc;
  const t5 = buildTemplate('g-place').doc;
  const t6 = buildTemplate('m-left').doc;

  const signs = [
    {
      id: 'S1', projectId: 'P1', code: 'BS-1120-01', name: '主线限速 60', category: 'prohibition',
      templateId: 'p-speed', status: 'closed', round: 2, dueDate: addDays(todayISO(), -6),
      createdAt: addDays(todayISO(), -20), closedAt: addDays(todayISO(), -2),
      owner: USERS.maker.name, location: '主线 K1120+350 右侧',
      versions: [
        makeVersion(null, 1, t1v1, 'approved', addDays(todayISO(), -20) + 'T09:00:00.000Z'),
        makeVersion(null, 2, t1v2, 'approved', addDays(todayISO(), -9) + 'T10:00:00.000Z'),
      ],
      activeVersionId: null,
      comments: [],
    },
    {
      id: 'S2', projectId: 'P1', code: 'BS-1120-02', name: '直行指示', category: 'mandatory',
      templateId: 'm-straight', status: 'reviewing', round: 2, dueDate: addDays(todayISO(), 3),
      createdAt: addDays(todayISO(), -12), closedAt: null, owner: USERS.maker.name, location: 'K1120+900 渠化岛',
      versions: [
        makeVersion(null, 1, docClone(t2), 'returned', addDays(todayISO(), -12) + 'T09:00:00.000Z'),
        makeVersion(null, 2, docClone(t2), 'submitted', addDays(todayISO(), -2) + 'T16:20:00.000Z'),
      ],
      activeVersionId: null,
      comments: [],
    },
    {
      id: 'S3', projectId: 'P2', code: 'ZY-021', name: '青阳出口预告', category: 'guide',
      templateId: 'g-exit', status: 'returned', round: 1, dueDate: addDays(todayISO(), -1),
      createdAt: addDays(todayISO(), -8), closedAt: null, owner: USERS.maker.name, location: '青阳互通 A 匝道',
      versions: [makeVersion(null, 1, docClone(t3), 'returned', addDays(todayISO(), -8) + 'T11:00:00.000Z')],
      activeVersionId: null,
      comments: [],
    },
    {
      id: 'S4', projectId: 'P1', code: 'BS-1120-03', name: '禁止驶入', category: 'prohibition',
      templateId: 'p-no-entry', status: 'drafting', round: 0, dueDate: addDays(todayISO(), 7),
      createdAt: addDays(todayISO(), -3), closedAt: null, owner: USERS.maker.name, location: 'K1121+100 匝道口',
      versions: [makeVersion(null, 1, docClone(t4), 'draft', addDays(todayISO(), -3) + 'T14:00:00.000Z')],
      activeVersionId: null, comments: [],
    },
    {
      id: 'S5', projectId: 'P2', code: 'ZY-022', name: '合肥方向地名', category: 'guide',
      templateId: 'g-place', status: 'reviewing', round: 1, dueDate: addDays(todayISO(), -3),
      createdAt: addDays(todayISO(), -10), closedAt: null, owner: USERS.maker.name, location: 'G206 K88+200',
      versions: [makeVersion(null, 1, docClone(t5), 'submitted', addDays(todayISO(), -10) + 'T09:30:00.000Z')],
      activeVersionId: null, comments: [],
    },
    {
      id: 'S6', projectId: 'P2', code: 'ZY-023', name: '左转指示', category: 'mandatory',
      templateId: 'm-left', status: 'drafting', round: 0, dueDate: addDays(todayISO(), 12),
      createdAt: addDays(todayISO(), -1), closedAt: null, owner: USERS.maker.name, location: '迎宾大道交叉口',
      versions: [makeVersion(null, 1, docClone(t6), 'draft', addDays(todayISO(), -1) + 'T15:00:00.000Z')],
      activeVersionId: null, comments: [],
    },
  ];

  for (const s of signs) s.activeVersionId = s.versions[s.versions.length - 1].id;

  // Seed review threads that reflect realistic states.
  const s1v1 = signs[0].versions[0];
  signs[0].comments = [
    {
      id: uid('C'), no: 1, versionId: s1v1.id, carriedFrom: null,
      kind: 'point', x: 300, y: 128, layerId: null,
      text: '限速数字距底板顶沿偏近，压到了安全边距，请下移。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -19) + 'T10:12:00.000Z',
      status: 'closed',
      replies: [{ author: USERS.maker.name, text: '已下移 40mm，字高不变。', action: 'fixed', createdAt: addDays(todayISO(), -18) + 'T09:40:00.000Z' }],
      closedBy: USERS.reviewer.name, closedAt: addDays(todayISO(), -17) + 'T11:00:00.000Z',
    },
    {
      id: uid('C'), no: 2, versionId: s1v1.id, carriedFrom: null,
      kind: 'layer', x: null, y: null, layerId: signs[0].versions[0].doc.layers.find((l) => l.name === '红圈边框').id,
      text: '外圈红边线宽按 GB 5768.2 应为 50mm 级，当前偏细。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -19) + 'T10:20:00.000Z',
      status: 'closed',
      replies: [{ author: USERS.maker.name, text: '已调整为 54mm。', action: 'fixed', createdAt: addDays(todayISO(), -18) + 'T09:45:00.000Z' }],
      closedBy: USERS.reviewer.name, closedAt: addDays(todayISO(), -17) + 'T11:02:00.000Z',
    },
  ];

  const s2v1 = signs[1].versions[0];
  const s2v2 = signs[1].versions[1];
  const arrowLayer = s2v1.doc.layers.find((l) => l.name === '直行箭头');
  signs[1].comments = [
    {
      id: uid('C'), no: 1, versionId: s2v2.id, carriedFrom: s2v1.id, kind: 'layer', x: null, y: null,
      layerId: signs[1].versions[1].doc.layers.find((l) => l.name === '直行箭头').id,
      text: '箭头杆宽与箭头头部比例不符合指示标志图形要求，杆偏细、头偏宽。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -11) + 'T14:05:00.000Z',
      status: 'replied',
      replies: [{ author: USERS.maker.name, text: '已按图形比例重绘：杆 84mm、头宽 210mm、头长 150mm。', action: 'fixed', createdAt: addDays(todayISO(), -2) + 'T16:10:00.000Z' }],
      closedBy: null, closedAt: null,
    },
    {
      id: uid('C'), no: 2, versionId: s2v2.id, carriedFrom: s2v1.id, kind: 'point', x: 300, y: 300, layerId: null,
      text: '圆牌下缘与路面标线视认角需复核，建议出侧向 15° 效果图。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -11) + 'T14:09:00.000Z',
      status: 'open',
      replies: [], closedBy: null, closedAt: null,
    },
  ];

  const s3v1 = signs[2].versions[0];
  signs[2].comments = [
    {
      id: uid('C'), no: 1, versionId: s3v1.id, carriedFrom: null, kind: 'point', x: 790, y: 610, layerId: null,
      text: '地名与拼音基线间距过大，视觉上读作两行独立信息，请压缩行距。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -7) + 'T09:20:00.000Z',
      status: 'open', replies: [], closedBy: null, closedAt: null,
    },
    {
      id: uid('C'), no: 2, versionId: s3v1.id, carriedFrom: null, kind: 'layer', x: null, y: null,
      layerId: signs[2].versions[0].doc.layers.find((l) => l.name === '距离').id,
      text: '出口距离应写作「500m」，当前字距偏紧且单位小写不一致。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -7) + 'T09:26:00.000Z',
      status: 'open', replies: [], closedBy: null, closedAt: null,
    },
  ];

  const s5v1 = signs[4].versions[0];
  signs[4].comments = [
    {
      id: uid('C'), no: 1, versionId: s5v1.id, carriedFrom: null, kind: 'layer', x: null, y: null,
      layerId: signs[4].versions[0].doc.layers.find((l) => l.name === '地名').id,
      text: '字高不足：设计速度 60km/h 对应最小字高 300mm，当前 380mm 满足，但字宽/字高比应为 1:1。',
      author: USERS.reviewer.name, createdAt: addDays(todayISO(), -9) + 'T10:02:00.000Z',
      status: 'resolved_pending', replies: [], closedBy: null, closedAt: null,
    },
  ];

  return {
    projects,
    signs,
    activeProjectId: 'P1',
    activeSignId: 'S2',
    currentUser: 'maker',
    ui: { tab: 'edit' },
  };
}

/* ------------------------------------------------------------------ */
/* Store                                                              */
/* ------------------------------------------------------------------ */

export const store = reactive({
  projects: [],
  signs: [],
  activeProjectId: null,
  activeSignId: null,
  currentUser: 'maker',
  ui: { tab: 'edit' },
  toast: null,
  ready: false,
});

const history = reactive({
  signId: null,
  stack: [],
  index: -1,
});

let saveTimer = null;
let lastSnapshot = null;

export function currentUser() {
  return USERS[store.currentUser];
}

export function isMaker() {
  return store.currentUser === 'maker';
}

export function activeSign() {
  return store.signs.find((s) => s.id === store.activeSignId) || null;
}

export function activeVersion(sign = activeSign()) {
  if (!sign) return null;
  return sign.versions.find((v) => v.id === sign.activeVersionId) || sign.versions[sign.versions.length - 1] || null;
}

export function versionById(sign, id) {
  return sign.versions.find((v) => v.id === id) || null;
}

export function canEdit(sign, version) {
  if (!sign || !version) return false;
  if (sign.status === 'closed') return false;
  if (version.status === 'submitted' || version.status === 'approved') return false;
  return isMaker();
}

/* ---------- persistence ---------- */

export function persist() {
  if (!store.ready) return;
  try {
    const data = {
      projects: store.projects,
      signs: store.signs,
      activeProjectId: store.activeProjectId,
      activeSignId: store.activeSignId,
      currentUser: store.currentUser,
      ui: { tab: store.ui.tab },
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('保存失败', e);
  }
}

const scheduleSave = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, AUTOSAVE_MS);
};

export function initStore() {
  if (store.ready) return;
  let loaded = null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) loaded = JSON.parse(raw);
  } catch { loaded = null; }
  const data = loaded && loaded.signs && loaded.signs.length ? loaded : seed();
  store.projects = data.projects;
  store.signs = data.signs;
  store.activeProjectId = data.activeProjectId || data.projects[0]?.id;
  store.activeSignId = data.activeSignId || data.signs[0]?.id;
  store.currentUser = data.currentUser || 'maker';
  store.ui.tab = data.ui?.tab || 'edit';
  store.ready = true;
  resetHistory();
}

export function resetAllData() {
  localStorage.removeItem(LS_KEY);
  const data = seed();
  store.projects = data.projects;
  store.signs = data.signs;
  store.activeProjectId = data.activeProjectId;
  store.activeSignId = data.activeSignId;
  store.currentUser = data.currentUser;
  store.ui.tab = 'edit';
  resetHistory();
  persist();
}

/* ---------- history ---------- */

function snapshotDoc() {
  const sign = activeSign();
  const version = activeVersion(sign);
  if (!sign || !version) return null;
  return { signId: sign.id, versionId: version.id, doc: JSON.stringify(version.doc) };
}

export function resetHistory() {
  history.signId = null;
  history.stack = [];
  history.index = -1;
  const snap = snapshotDoc();
  if (snap) pushHistorySnapshot(snap, true);
}

function pushHistorySnapshot(snap, reset = false) {
  history.signId = snap.signId;
  if (reset) {
    history.stack = [snap];
    history.index = 0;
  } else {
    if (lastSnapshot === snap.doc) return;
    history.stack = history.stack.slice(0, history.index + 1);
    history.stack.push(snap);
    if (history.stack.length > HISTORY_LIMIT) history.stack.shift();
    history.index = history.stack.length - 1;
  }
  lastSnapshot = snap.doc;
}

/** Record the current document state. Call after each committed edit. */
export function commit(label = '') {
  const snap = snapshotDoc();
  if (!snap) return;
  if (history.signId !== snap.signId) {
    history.signId = snap.signId;
    history.stack = [];
    history.index = -1;
    lastSnapshot = null;
    pushHistorySnapshot(snap, true);
  } else {
    pushHistorySnapshot(snap);
  }
  scheduleSave();
}

export function beginHistory() {
  const snap = snapshotDoc();
  if (!snap) return;
  if (history.signId !== snap.signId) {
    history.signId = snap.signId;
    history.stack = [snap];
    history.index = 0;
    lastSnapshot = snap.doc;
  } else if (!history.stack.length) {
    history.stack = [snap];
    history.index = 0;
    lastSnapshot = snap.doc;
  }
}

export const canUndo = () => history.signId === (activeSign()?.id || null) && history.index > 0;
export const canRedo = () => history.signId === (activeSign()?.id || null) && history.index < history.stack.length - 1;
export const undoDepth = () => (history.signId === (activeSign()?.id || null) ? history.index : 0);
export const redoDepth = () => (history.signId === (activeSign()?.id || null) ? history.stack.length - 1 - history.index : 0);

function applyHistory(index) {
  const entry = history.stack[index];
  if (!entry) return;
  const sign = store.signs.find((s) => s.id === entry.signId);
  if (!sign) return;
  const version = versionById(sign, entry.versionId);
  if (!version) return;
  if (sign.activeVersionId !== version.id) sign.activeVersionId = version.id;
  version.doc = JSON.parse(entry.doc);
  history.index = index;
  history.signId = sign.id;
  lastSnapshot = entry.doc;
  scheduleSave();
}

export function undo() {
  if (!canUndo()) return;
  applyHistory(history.index - 1);
}

export function redo() {
  if (!canRedo()) return;
  applyHistory(history.index + 1);
}

export const historyInfo = () => ({
  undo: canUndo() ? history.index : 0,
  redo: history.stack.length - 1 - (history.index < 0 ? 0 : history.index),
  total: history.stack.length,
});

/* ---------- signs ---------- */

export function setActiveSign(id) {
  if (store.activeSignId === id) return;
  store.activeSignId = id;
  const sign = activeSign();
  const v = activeVersion(sign);
  if (v) sign.activeVersionId = v.id;
  history.signId = null;
  resetHistory();
  persist();
}

export function setActiveVersion(versionId) {
  const sign = activeSign();
  if (!sign) return;
  if (!versionById(sign, versionId)) return;
  sign.activeVersionId = versionId;
  resetHistory();
  persist();
}

export function projectSigns(projectId = store.activeProjectId) {
  return store.signs.filter((s) => s.projectId === projectId);
}

export function signTemplatesFor(category) {
  return TEMPLATES.filter((t) => t.category === category);
}

export function createSign({ projectId, templateId, code, name, dueDate, location }) {
  const { doc, template } = buildTemplate(templateId);
  const sign = {
    id: uid('S'),
    projectId: projectId || store.activeProjectId,
    code: code || autoCode(projectId || store.activeProjectId),
    name: name || template.name,
    category: template.category,
    templateId,
    status: 'drafting',
    round: 0,
    dueDate: dueDate || addDays(todayISO(), 14),
    createdAt: todayISO(),
    closedAt: null,
    owner: currentUser().name,
    location: location || '',
    versions: [makeVersion(null, 1, doc, 'draft', new Date().toISOString())],
    activeVersionId: null,
    comments: [],
  };
  sign.activeVersionId = sign.versions[0].id;
  store.signs.push(sign);
  store.activeSignId = sign.id;
  resetHistory();
  persist();
  return sign;
}

function autoCode(projectId) {
  const existing = store.signs.filter((s) => s.projectId === projectId);
  const n = String(existing.length + 1).padStart(2, '0');
  return `${projectId || 'P'}-${n}`;
}

/* ---------- versions ---------- */

export function versionGate(version) {
  const open = store.signs
    .flatMap((s) => (s.id === store.activeSignId ? s.comments : []))
    .filter((c) => c.versionId === version.id && c.status !== 'closed');
  return open;
}

export function createNextVersion(sign = activeSign()) {
  if (!sign) return null;
  if (!isMaker()) throw new Error('仅制作方可新建版本');
  if (sign.status === 'closed') throw new Error('已结项，版本已冻结，不能新建版本');
  const last = sign.versions[sign.versions.length - 1];
  const doc = JSON.parse(JSON.stringify(last.doc));
  const v = makeVersion(sign, last.no + 1, doc, 'draft', new Date().toISOString());
  v.basedOn = last.id;
  sign.versions.push(v);
  sign.activeVersionId = v.id;
  if (sign.status === 'reviewing') sign.status = 'returned';
  resetHistory();
  persist();
  return v;
}

export function submitVersion(sign = activeSign(), version = activeVersion(sign)) {
  if (!sign || !version) return { ok: false, message: '无版本' };
  if (!isMaker()) return { ok: false, message: '仅制作方可提交' };
  if (sign.status === 'closed') return { ok: false, message: '已结项，不能再提交' };
  if (version.status === 'submitted') return { ok: false, message: '该版本已在审核中' };
  if (version.status === 'approved') return { ok: false, message: '该版本已通过，请新建版本' };

  // migration of unresolved comments to the newly submitted version
  const openPrev = sign.comments.filter((c) => c.status !== 'closed' && c.versionId !== version.id);
  const sameVersionOpen = sign.comments.filter((c) => c.status !== 'closed' && c.versionId === version.id);
  for (const c of openPrev) {
    c.versionId = version.id;
    c.carriedFrom = c.carriedFrom || c.versionId;
    c.status = 'open';
    c.replies = c.replies || [];
  }
  version.status = 'submitted';
  version.submittedAt = new Date().toISOString();
  version.note = '';
  sign.status = 'reviewing';

  persist();
  return { ok: true, message: `已提交 ${version.name} 待审核` };
}

export function returnForRevision(sign = activeSign(), version = activeVersion(sign), note = '') {
  if (!isMaker() && store.currentUser !== 'reviewer') return { ok: false, message: '无权限' };
  if (!sign || !version) return { ok: false, message: '无版本' };
  if (version.status !== 'submitted') return { ok: false, message: '该版本不在审核中' };
  version.status = 'returned';
  version.note = note;
  sign.status = 'returned';
  bumpRound(sign);
  persist();
  return { ok: true, message: `已退回修改（第 ${sign.round} 轮）` };
}

/**
 * 修改轮次 counts returns: R0 while it has not been through review yet,
 * then +1 for each 退回修改 (the maker's rework pass).
 */
function bumpRound(sign) {
  sign.round = (sign.round || 0) + 1;
}

export function approveVersion(sign = activeSign(), version = activeVersion(sign)) {
  if (store.currentUser !== 'reviewer') return { ok: false, message: '仅审核方可结项' };
  if (!sign || !version) return { ok: false, message: '无版本' };
  if (version.status !== 'submitted') return { ok: false, message: '仅审核中的版本可结项' };
  const open = sign.comments.filter((c) => c.status !== 'closed');
  if (open.length) {
    return { ok: false, message: `还有 ${open.length} 条批注未关闭，不能结项` };
  }
  version.status = 'approved';
  version.approvedAt = new Date().toISOString();
  sign.status = 'closed';
  sign.closedAt = todayISO();
  persist();
  return { ok: true, message: `${version.name} 已结项` };
}

let versionCounter = 0;
export function addVersionComment({ version, kind, x, y, layerId, text }) {
  const sign = activeSign();
  if (!sign || !version) return null;
  const no = sign.comments.length + 1;
  const c = {
    id: uid('C'),
    no,
    versionId: version.id,
    carriedFrom: null,
    kind,
    x: x ?? null,
    y: y ?? null,
    layerId: layerId || null,
    text: text || '',
    author: currentUser().name,
    createdAt: new Date().toISOString(),
    status: 'open',
    replies: [],
    closedBy: null,
    closedAt: null,
  };
  sign.comments.push(c);
  persist();
  return c;
}

export function replyComment(commentId, { text, action }) {
  const sign = activeSign();
  const c = sign?.comments.find((x) => x.id === commentId);
  if (!c) return { ok: false, message: '批注不存在' };
  if (!isMaker()) return { ok: false, message: '仅制作方可回复' };
  if (c.status === 'closed') return { ok: false, message: '批注已关闭' };
  if (!text || !text.trim()) return { ok: false, message: '请填写回复说明' };
  if (action === 'declined' && text.trim().length < 6) return { ok: false, message: '不改理由请写清楚（≥6 字）' };
  c.replies.push({ author: currentUser().name, text: text.trim(), action, createdAt: new Date().toISOString() });
  c.status = 'replied';
  persist();
  return { ok: true, message: action === 'declined' ? '已回复：不修改' : '已回复：已处理' };
}

export function closeComment(commentId) {
  const sign = activeSign();
  const c = sign?.comments.find((x) => x.id === commentId);
  if (!c) return { ok: false, message: '批注不存在' };
  if (store.currentUser !== 'reviewer') return { ok: false, message: '仅审核方可确认关闭' };
  if (c.status === 'closed') return { ok: false, message: '已关闭' };
  if (c.status !== 'replied') return { ok: false, message: '制作方尚未回复' };
  c.status = 'closed';
  c.closedBy = currentUser().name;
  c.closedAt = new Date().toISOString();
  persist();
  return { ok: true, message: `批注 #${c.no} 已确认关闭` };
}

export function reopenComment(commentId) {
  const sign = activeSign();
  const c = sign?.comments.find((x) => x.id === commentId);
  if (!c) return { ok: false, message: '批注不存在' };
  if (store.currentUser !== 'reviewer') return { ok: false, message: '仅审核方可重开' };
  c.status = 'replied';
  c.closedBy = null;
  c.closedAt = null;
  persist();
  return { ok: true, message: '已重新打开，等待制作方处理' };
}

export function deleteComment(commentId) {
  const sign = activeSign();
  if (!sign) return;
  if (store.currentUser !== 'reviewer') return { ok: false, message: '仅审核方可删除' };
  const c = sign.comments.find((x) => x.id === commentId);
  if (!c || c.status === 'closed') return { ok: false, message: '已关闭的批注不可删除' };
  sign.comments = sign.comments.filter((x) => x.id !== commentId);
  persist();
  return { ok: true, message: '批注已删除' };
}

export function commentStats(sign = activeSign(), version = null) {
  const list = sign ? sign.comments.filter((c) => !version || c.versionId === version.id) : [];
  return {
    total: list.length,
    open: list.filter((c) => c.status === 'open').length,
    replied: list.filter((c) => c.status === 'replied').length,
    closed: list.filter((c) => c.status === 'closed').length,
    blocking: list.filter((c) => c.status !== 'closed').length,
  };
}

/* ---------- derived ---------- */

export function overdueDays(sign) {
  const end = sign.status === 'closed' && sign.closedAt ? sign.closedAt : todayISO();
  return Math.max(0, daysBetween(sign.dueDate, end));
}

export function dueInDays(sign) {
  return daysBetween(todayISO(), sign.dueDate);
}

export function signReadiness(sign) {
  const v = activeVersion(sign);
  const stats = commentStats(sign, v);
  const issues = [];
  if (!v) issues.push('无版本');
  if (sign.status !== 'closed') {
    if (stats.blocking) issues.push(`批注未关闭 ${stats.blocking} 条`);
    if (v && v.status !== 'approved') issues.push('版本未结项');
  }
  return { ok: issues.length === 0, issues, stats };
}

export function canExportPackage(sign = activeSign(), version = activeVersion(sign)) {
  if (!sign || !version) return { ok: false, reason: '无版本' };
  if (sign.status !== 'closed') return { ok: false, reason: `标志牌未结项（${STATUS[sign.status].label}）` };
  if (version.status !== 'approved') return { ok: false, reason: `${version.name} 未通过审核` };
  const open = sign.comments.filter((c) => c.status !== 'closed');
  if (open.length) return { ok: false, reason: `还有 ${open.length} 条批注未关闭` };
  return { ok: true, reason: '' };
}

export function toast(message, tone = 'info') {
  store.toast = { message, tone, at: Date.now() };
  setTimeout(() => {
    if (store.toast && Date.now() - store.toast.at >= 2400) store.toast = null;
  }, 2600);
}

export function setUser(role) {
  store.currentUser = role;
  persist();
}

export function markPackageExported(version) {
  version.packageExportedAt = new Date().toISOString();
  persist();
}

export { addDays, todayISO, daysBetween, HISTORY_LIMIT };
