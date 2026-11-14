// 四种时段工况

export const MODES = [
  {
    key: 'day',
    label: '白天',
    ambient: 210,
    powerScale: 0.35,
    sky: ['#bfe2ff', '#eaf4ff'],
    icon: '☀',
    note: '天窗天然光 210 lx，人工照明降功率至 35%',
  },
  {
    key: 'dusk',
    label: '黄昏',
    ambient: 42,
    powerScale: 0.72,
    sky: ['#4a3f72', '#f0a06a'],
    icon: '◑',
    note: '天窗余晖 42 lx，人工照明 72%',
  },
  {
    key: 'night',
    label: '夜间',
    ambient: 4,
    powerScale: 1.0,
    sky: ['#0b1020', '#16203a'],
    icon: '☾',
    note: '仅人工照明，全部灯具满功率',
  },
  {
    key: 'maint',
    label: '检修',
    ambient: 2,
    powerScale: 1.0,
    sky: ['#101820', '#1b2a30'],
    icon: '⚒',
    note: '检修工况：全部灯具满功率，应急灯切入 100%',
  },
];

export const MODE = Object.fromEntries(MODES.map((m) => [m.key, m]));

/** 热力图配色（按 lux 分段） */
export const LUX_STOPS = [
  { v: 0, color: '#060a12', label: '0' },
  { v: 15, color: '#0d1c33', label: '15' },
  { v: 40, color: '#13395e', label: '40' },
  { v: 80, color: '#155d7d', label: '80' },
  { v: 120, color: '#1c8478', label: '120' },
  { v: 150, color: '#4fae66', label: '150' },
  { v: 200, color: '#94c44b', label: '200' },
  { v: 260, color: '#cfc23c', label: '260' },
  { v: 340, color: '#e6a03c', label: '340' },
  { v: 460, color: '#df6c33', label: '460' },
  { v: 650, color: '#c03a43', label: '650' },
  { v: 1000, color: '#f4e6df', label: '1000' },
];


