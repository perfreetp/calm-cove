import type { LayerId, LayerState } from './types';

export interface LayerDef {
  id: LayerId;
  name: string;
  desc: string;
  group: 'base' | 'course' | 'activity';
}

export const LAYER_DEFS: LayerDef[] = [
  { id: 'depth', name: '水深分层', desc: '等深线 3 / 6 / 12 / 20 m', group: 'base' },
  { id: 'shore', name: '岸线', desc: '库岸轮廓与坝体', group: 'base' },
  { id: 'grid', name: '测量网格', desc: '100 m 方格网', group: 'base' },
  { id: 'lanes', name: '航道线', desc: '6 条 13.5 m 航道', group: 'course' },
  { id: 'buoys', name: '浮标', desc: '每 250 m 标志点', group: 'course' },
  { id: 'docks', name: '码头设施', desc: '浮码头 / 船库 / 栈桥', group: 'course' },
  { id: 'tracks', name: '训练轨迹', desc: '各艇整趟轨迹', group: 'activity' },
  { id: 'labels', name: '注记', desc: '编号与分段时间', group: 'activity' }
];

export const LAYER_GROUPS: { key: LayerDef['group']; label: string }[] = [
  { key: 'base', label: '底图' },
  { key: 'course', label: '航道' },
  { key: 'activity', label: '活动' }
];

export const DEFAULT_LAYERS: LayerState = {
  depth: true,
  shore: true,
  grid: false,
  lanes: true,
  buoys: true,
  docks: true,
  tracks: true,
  labels: true
};

export const LAYER_SHORT: Record<LayerId, string> = {
  depth: '深',
  shore: '岸',
  grid: '网',
  lanes: '道',
  buoys: '标',
  docks: '港',
  tracks: '迹',
  labels: '注'
};

// 2026-11-10 is a Tuesday — verified against Date, not assumed.
export const TIMELINE_DAYS = [
  { key: '2026-11-10', label: '11.10', wd: '周二' },
  { key: '2026-11-11', label: '11.11', wd: '周三' },
  { key: '2026-11-12', label: '11.12', wd: '周四' },
  { key: '2026-11-13', label: '11.13', wd: '周五' },
  { key: '2026-11-14', label: '11.14', wd: '周六' },
  { key: '2026-11-15', label: '11.15', wd: '周日' },
  { key: '2026-11-16', label: '11.16', wd: '赛事日' }
];

export const WIND_DIRS = [
  { deg: 0, name: '北' },
  { deg: 45, name: '东北' },
  { deg: 90, name: '东' },
  { deg: 135, name: '东南' },
  { deg: 180, name: '南' },
  { deg: 225, name: '西南' },
  { deg: 270, name: '西' },
  { deg: 315, name: '西北' }
];

export function compassName(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return WIND_DIRS[idx].name;
}

export const STATUS_META = {
  draft: { label: '草稿', tone: 'neutral' as const },
  published: { label: '已发布', tone: 'teal' as const },
  closed: { label: '已结课', tone: 'neutral' as const }
};

export const VERDICT_META = {
  pending: { label: '待复核', tone: 'warn' as const },
  valid: { label: '有效', tone: 'live' as const },
  invalid: { label: '作废', tone: 'danger' as const }
};
