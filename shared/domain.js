// Shared domain model for the tunnel MEP drawing & delivery platform.
// Imported by both the Express server and the SolidJS client.

export const LAYERS = {
  hvac: { id: 'hvac', name: '暖通', color: '#5ec8ff', hex: 0x5ec8ff, dim: 'rgba(94, 200, 255, 0.10)', cdxf: 4 },
  elec: { id: 'elec', name: '电气', color: '#ffc857', hex: 0xffc857, dim: 'rgba(255, 200, 87, 0.10)', cdxf: 2 },
  civil: { id: 'civil', name: '土建', color: '#9fb0bd', hex: 0x9fb0bd, dim: 'rgba(159, 176, 189, 0.10)', cdxf: 8 },
  anno: { id: 'anno', name: '标注', color: '#c9a7ff', hex: 0xc9a7ff, dim: 'rgba(201, 167, 255, 0.10)', cdxf: 6 },
};

export const LAYER_ORDER = ['civil', 'hvac', 'elec', 'anno'];

// w = symbol extent along tunnel axis (m), h = lateral extent (m), z = draw order
export const KINDS = {
  duct: { label: '风管', short: '风管', layer: 'hvac', w: 4.0, h: 1.3, z: 1, prefix: 'DU', line: true, lod: 3 },
  cable_tray: { label: '电缆桥架', short: '桥架', layer: 'elec', w: 4.0, h: 0.6, z: 1, prefix: 'CT', line: true, lod: 3 },
  civil_joint: { label: '变形缝', short: '变形缝', layer: 'civil', w: 0.5, h: 1.0, z: 2, prefix: 'CJ', lod: 1 },
  fan_equip: { label: '风机房设备', short: '机房', layer: 'hvac', w: 6.0, h: 2.8, z: 3, prefix: 'EQ', lod: 2 },
  jet_fan: { label: '射流风机', short: '风机', layer: 'hvac', w: 4.2, h: 1.35, z: 4, prefix: 'JF', lod: 1 },
  damper: { label: '风阀', short: '风阀', layer: 'hvac', w: 1.8, h: 0.95, z: 4, prefix: 'FD', lod: 2 },
  co_sensor: { label: 'CO 检测器', short: 'CO', layer: 'elec', w: 1.35, h: 1.35, z: 5, prefix: 'CO', sensor: true, lod: 2 },
  vi_sensor: { label: '能见度检测器', short: 'VI', layer: 'elec', w: 1.35, h: 1.35, z: 5, prefix: 'VI', sensor: true, lod: 2 },
  chainage_mark: { label: '区段桩号', short: '桩号', layer: 'anno', w: 0.6, h: 9.5, z: 6, prefix: 'LB', lod: 3 },
};

// Stable index used by the binary geometry feed. Order MUST stay stable.
export const KIND_KEYS = [
  'jet_fan', 'damper', 'duct', 'fan_equip', 'co_sensor', 'vi_sensor',
  'cable_tray', 'civil_joint', 'chainage_mark',
];
export const KIND_INDEX = Object.fromEntries(KIND_KEYS.map((k, i) => [k, i]));

export const LAYER_KEYS = ['hvac', 'elec', 'civil', 'anno'];
export const LAYER_INDEX = Object.fromEntries(LAYER_KEYS.map((k, i) => [k, i]));

export const MODEL_LIBRARY = {
  jet_fan: ['SDS-1120T 可逆射流风机', 'SDS-1000T 可逆射流风机', 'SDS-1250 单向射流风机'],
  damper: ['FVD-800×630 电动风阀', 'FVD-1000×630 电动风阀', 'FVD-630×500 手动风阀'],
  duct: ['1400×800 镀锌钢板风管', '1600×900 镀锌钢板风管', '1250×630 镀锌钢板风管'],
  fan_equip: ['T35-11 轴流排风机', 'GGD 低压控制柜', 'ZP100 片式消声器', 'BP-45 变频控制柜', 'XL-21 动力配电箱'],
  co_sensor: ['CO-2000 一氧化碳检测器', 'CX-3000 CO/VI 一体机'],
  vi_sensor: ['VI-100 能见度检测器', 'VIS-200 能见度检测器'],
  cable_tray: ['300×100 热浸锌桥架', '400×150 热浸锌桥架'],
  civil_joint: ['20mm 变形缝', '30mm 沉降缝'],
  chainage_mark: ['区段桩号标注'],
};

export const STATUS_LABELS = {
  todo: '待分配', assigned: '待制作', in_progress: '制作中', rework: '返工中',
  submitted: '待审核', approved: '已通过', rejected: '已退回',
  planning: '策划中', active: '进行中', delivered: '已交付',
  open: '待处理', resolved: '已整改', waived: '已确认豁免', superseded: '已失效',
  error: '错误', warn: '警告',
};

export const TASK_STATUS_STYLE = {
  todo: 'muted', assigned: 'info', in_progress: 'info', rework: 'warn',
  submitted: 'accent', approved: 'ok',
};

export const ISSUE_TYPES = {
  fan_spacing: {
    label: '风机间距不足', short: '间距',
    desc: '同一断面相邻射流风机净距小于 6.0 m',
  },
  sensor_unmounted: {
    label: '传感器漏挂', short: '漏挂',
    desc: 'CO / 能见度检测器未挂接到区段或未挂装',
  },
  duplicate_section: {
    label: '区段编号重复', short: '重号',
    desc: '项目内存在重复的区段编号',
  },
};

export const DRAWING_SPECS = ['A0', 'A1', 'A2', 'A3'];
export const SHEET_SIZES_MM = { A0: [1189, 841], A1: [841, 594], A2: [594, 420], A3: [420, 297] };

export function boreLayout(project) {
  const bores = project.bores || (project.lanes >= 4 ? 2 : 1);
  const lanesPerBore = project.lanes / bores;
  const roadW = lanesPerBore * 3.75;
  const boreW = roadW + 4.6;                 // shoulders + curbs
  const gap = 18;                            // rock pillar between bores
  const centers = bores === 1 ? [0] : [boreW / 2 + gap / 2, -boreW / 2 - gap / 2];
  return {
    bores, lanesPerBore, roadW, boreW, gap, centers,
    extentY: Math.max(...centers.map(Math.abs)) + boreW / 2 + 22,
    boreNames: bores === 2 ? ['Z', 'Y'] : ['S'],
    boreLabels: bores === 2 ? ['左线', '右线'] : ['单洞'],
  };
}

export function formatChainage(meters) {
  if (meters == null || Number.isNaN(meters)) return '—';
  const sign = meters < 0 ? '-' : '';
  const abs = Math.abs(meters);
  const km = Math.floor(abs / 1000);
  const m = Math.round(abs - km * 1000);
  return `${sign}K${km}+${String(m).padStart(3, '0')}`;
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Element list columns shared by the CSV export and the in-package search table.
export const ELEMENT_CSV_COLUMNS = [
  ['section_code', '区段编号'],
  ['section_range', '区段范围'],
  ['bore_label', '洞线'],
  ['layer_label', '图层'],
  ['kind_label', '要素类型'],
  ['code', '编号'],
  ['model', '型号'],
  ['chainage_text', '桩号'],
  ['offset', '横向偏移(m)'],
  ['mounted_label', '挂接状态'],
  ['upstream_code', '上游要素'],
  ['downstream_code', '下游要素'],
];
