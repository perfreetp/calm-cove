import type { DB, Order, OrderStatus, User } from '../types';

export interface StoreStat {
  storeId: string;
  orders: number;
  returns: number;
  avgReturns: number;
  delivered: number;
  pending: number;
  avgWall: number;
  onTime: number;
  fitters: number;
}

export function storeStats(db: DB): StoreStat[] {
  return db.stores.map((s) => {
    const os = db.orders.filter((o) => o.storeId === s.id);
    const returns = os.reduce((a, o) => a + o.returns.length, 0);
    const walls = os.map((o) => o.versions[o.versions.length - 1].wallThickness);
    const delivered = os.filter((o) => o.status === 'delivered');
    const onTime = delivered.filter((o) => new Date(o.updatedAt) <= new Date(o.dueAt)).length;
    return {
      storeId: s.id,
      orders: os.length,
      returns,
      avgReturns: os.length ? returns / os.length : 0,
      delivered: delivered.length,
      pending: os.filter((o) => o.status === 'pending_model' || o.status === 'pending_review' || o.status === 'returned').length,
      avgWall: walls.length ? walls.reduce((a, b) => a + b, 0) / walls.length : 0,
      onTime: delivered.length ? onTime / delivered.length : 0,
      fitters: db.users.filter((u) => u.storeId === s.id && u.role === 'fitter').length,
    };
  });
}

export function thicknessDistribution(orders: Order[]): Array<{ wall: number; count: number }> {
  const levels = [0.8, 1.2, 1.6, 2.0];
  return levels.map((wall) => ({
    wall,
    count: orders.filter((o) => o.versions[o.versions.length - 1].wallThickness === wall).length,
  }));
}

export function statusCounts(orders: Order[]): Record<OrderStatus, number> {
  const out: Record<OrderStatus, number> = {
    pending_model: 0,
    pending_review: 0,
    returned: 0,
    ordered: 0,
    delivered: 0,
  };
  orders.forEach((o) => {
    out[o.status]++;
  });
  return out;
}

export function fitterStats(db: DB, storeId?: string): Array<{ user: User; orders: number; delivered: number; avgReturns: number }> {
  return db.users
    .filter((u) => u.role === 'fitter' && u.active && (!storeId || u.storeId === storeId))
    .map((u) => {
      const os = db.orders.filter((o) => o.fitterId === u.id);
      return {
        user: u,
        orders: os.length,
        delivered: os.filter((o) => o.status === 'delivered').length,
        avgReturns: os.length ? os.reduce((a, o) => a + o.returns.length, 0) / os.length : 0,
      };
    })
    .sort((a, b) => b.orders - a.orders);
}

export interface DailyBucket {
  day: string;
  created: number;
  delivered: number;
  returned: number;
}

export function dailySeries(orders: Order[], days = 30): DailyBucket[] {
  const out: DailyBucket[] = [];
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, created: 0, delivered: 0, returned: 0 });
  }
  const idx = new Map(out.map((b, i) => [b.day, i]));
  orders.forEach((o) => {
    const c = o.createdAt.slice(0, 10);
    if (idx.has(c)) out[idx.get(c)!].created++;
    o.events.forEach((e) => {
      const k = e.at.slice(0, 10);
      if (!idx.has(k)) return;
      if (e.type === 'delivered') out[idx.get(k)!].delivered++;
      if (e.type === 'returned') out[idx.get(k)!].returned++;
    });
  });
  return out;
}

export interface CurvHotspotRow {
  order: Order;
  versionSeq: number;
  seam: string;
  curvature: number;
  overBy: number;
  region: string;
  wall: number;
  createdAt: string;
}

export function curvatureHotspots(orders: Order[]): CurvHotspotRow[] {
  const rows: CurvHotspotRow[] = [];
  orders.forEach((o) => {
    const v = o.versions[o.versions.length - 1];
    if (v.metrics.curvatureMax > v.threshold) {
      rows.push({
        order: o,
        versionSeq: v.seq,
        seam: `${(v.metrics.curvatureP95).toFixed(2)}`,
        curvature: v.metrics.curvatureMax,
        overBy: v.metrics.curvatureMax / v.threshold - 1,
        region: v.metrics.curvatureMax > 1.2 ? '耳道第二弯' : '耳甲腔',
        wall: v.wallThickness,
        createdAt: v.createdAt,
      });
    }
  });
  return rows.sort((a, b) => b.curvature - a.curvature);
}

export function last30(orders: Order[]): Order[] {
  const cutoff = Date.now() - 30 * 86400000;
  return orders.filter((o) => new Date(o.createdAt).getTime() >= cutoff);
}
