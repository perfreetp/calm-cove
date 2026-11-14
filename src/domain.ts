import { ZONES } from './factory.js';
import type { ComputeResult, DarkArea, WorkOrder, WorkerKpi } from './types.js';

export const STATUS_LABEL: Record<WorkOrder['status'], string> = {
  pending: '待分派',
  assigned: '已分派',
  washing: '洗涤中',
  submitted: '待质检',
  qc_passed: '质检合格',
  rejected: '打回返洗',
  done: '完成',
};

export function totalPieces(order: WorkOrder): number {
  return order.items.reduce((s, it) => s + it.count, 0);
}

/** 5% 抽查：总件数的 5%，至少 1 件；20 件以下小单全检 */
export function sampleCount(order: WorkOrder): number {
  const total = totalPieces(order);
  if (total <= 20) return total;
  return Math.max(1, Math.round(total * 0.05));
}

export function zoneName(id?: string): string {
  return ZONES.find((z) => z.id === id)?.name ?? '—';
}

/** 看板：各师傅日完成量、返洗率 */
export function workerKpis(orders: WorkOrder[], workers: { id: string; name: string }[]): WorkerKpi[] {
  return workers.map((w) => {
    const mine = orders.filter((o) => o.workerId === w.id);
    const completed = mine.filter((o) =>
      o.status === 'qc_passed' || o.status === 'done' || o.status === 'rejected').length;
    const rewashed = mine.reduce((s, o) => s + o.rewashes.length, 0);
    return {
      workerId: w.id,
      name: w.name,
      completed,
      rewashed,
      rewashRate: completed ? rewashed / completed : 0,
    };
  });
}

export interface BoardStats {
  totalOrders: number;
  activeOrders: number;
  passedToday: number;
  rewashRateAll: number;
  darkAreas: DarkArea[];
  zoneCompliance: { name: string; compliance: number; avgLux: number; threshold: number }[];
  avgCompliance: number;
}

export function boardStats(orders: WorkOrder[], sim: ComputeResult | null): BoardStats {
  const doneish = orders.filter((o) =>
    o.status === 'qc_passed' || o.status === 'done' || o.status === 'rejected');
  const rewashTotal = orders.reduce((s, o) => s + o.rewashes.length, 0);
  const zones = sim?.zones ?? [];
  const avg = zones.length
    ? zones.reduce((s, z) => s + z.compliance, 0) / zones.length
    : 0;
  return {
    totalOrders: orders.length,
    activeOrders: orders.filter((o) => ['assigned', 'washing', 'submitted', 'rejected'].includes(o.status)).length,
    passedToday: orders.filter((o) => o.status === 'qc_passed' || o.status === 'done').length,
    rewashRateAll: doneish.length ? rewashTotal / doneish.length : 0,
    darkAreas: sim?.darkAreas ?? [],
    zoneCompliance: zones.map((z) => ({
      name: z.name,
      compliance: z.compliance,
      avgLux: z.avgLux,
      threshold: z.threshold,
    })),
    avgCompliance: avg,
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  // BOM 让 Excel 正确识别 UTF-8 中文
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fmtLux(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(2)}k` : Math.round(v).toString();
}
