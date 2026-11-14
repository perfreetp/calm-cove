import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  DB,
  Material,
  Order,
  PlanVersion,
  Role,
  Store,
  User,
  ControlPoint,
} from './types';
import { buildSeed, makeEmptyOrder, metricsFor } from './lib/seed';
import { cloneControlPoints } from './lib/geom';

const KEY = 'auris.db.v1';

function loadDB(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && Array.isArray(parsed.orders) && parsed.stores?.length) return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return buildSeed(Date.now());
}

const iso = (t = Date.now()) => new Date(t).toISOString();

interface Actions {
  db: DB;
  currentUser: User;
  setCurrentUserId: (id: string) => void;
  switchRole: (role: Role) => void;
  createOrder: (input: {
    patient: string;
    ear: 'left' | 'right';
    storeId: string;
    fitterId: string;
    materialId: string;
    notes: string;
  }) => Order;
  commitVersion: (
    orderId: string,
    points: ControlPoint[],
    wall: number,
    adaptive: boolean,
    threshold: number,
    note: string,
  ) => void;
  submitOrder: (orderId: string, note?: string) => void;
  approveOrder: (orderId: string, note?: string) => void;
  returnOrder: (orderId: string, reason: string) => void;
  deliverOrder: (orderId: string) => void;
  updateOrderMeta: (orderId: string, patch: Partial<Pick<Order, 'materialId' | 'notes' | 'patient'>>) => void;
  setThreshold: (v: number) => void;
  upsertStore: (s: Store) => void;
  upsertUser: (u: User) => void;
  upsertMaterial: (m: Material) => void;
  restock: (id: string, qty: number) => void;
  resetDemo: () => void;
}

const Ctx = createContext<Actions | null>(null);

function pushEvent(order: Order, actorId: string, type: PlanVersion extends never ? never : Order['events'][number]['type'], label: string, note?: string) {
  order.events = [
    ...order.events,
    { id: `ev-${Math.random().toString(36).slice(2, 9)}`, at: iso(), actorId, type, label, note },
  ];
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(loadDB);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch {
        /* quota */
      }
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [db]);

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === db.settings.currentUserId) ?? db.users[0],
    [db.users, db.settings.currentUserId],
  );

  const mutate = useCallback((fn: (draft: DB) => void) => {
    setDb((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as DB;
      fn(next);
      return next;
    });
  }, []);

  const api: Actions = useMemo(
    () => ({
      db,
      currentUser,
      setCurrentUserId: (id) => mutate((d) => { d.settings.currentUserId = id; }),
      switchRole: (role) =>
        mutate((d) => {
          const u = d.users.find((x) => x.role === role && x.active);
          if (u) d.settings.currentUserId = u.id;
        }),
      createOrder: (input) => {
        const now = Date.now();
        const serial = db.meta.orderSerial;
        const id = `o-${serial}-${now.toString(36).slice(-4)}`;
        const code = `AUR-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${serial}`;
        const draft = makeEmptyOrder({
          id,
          code,
          patient: input.patient,
          ear: input.ear,
          storeId: input.storeId,
          fitterId: input.fitterId,
          materialId: input.materialId,
          now,
          threshold: db.settings.threshold,
        });
        draft.notes = input.notes;
        mutate((d) => {
          d.meta.orderSerial = serial + 1;
          d.orders = [draft, ...d.orders];
        });
        return draft;
      },
      commitVersion: (orderId, points, wall, adaptive, threshold, note) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          const seq = o.versions.length + 1;
          const v: PlanVersion = {
            id: `${o.id}-v${seq}-${Date.now().toString(36).slice(-4)}`,
            orderId: o.id,
            seq,
            createdAt: iso(),
            authorId: d.settings.currentUserId,
            controlPoints: cloneControlPoints(points),
            wallThickness: wall,
            adaptive,
            threshold,
            metrics: metricsFor(points, wall, adaptive, threshold),
            note,
          };
          o.versions.push(v);
          o.currentVersionId = v.id;
          o.updatedAt = v.createdAt;
          o.status = o.status === 'returned' ? 'returned' : o.status;
        }),
      submitOrder: (orderId, note) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          o.status = 'pending_review';
          o.updatedAt = iso();
          pushEvent(o, d.settings.currentUserId, 'submitted', `提交方案 V${o.versions.length} 审核`, note);
        }),
      approveOrder: (orderId, note) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          o.status = 'ordered';
          o.updatedAt = iso();
          const mat = d.materials.find((m) => m.id === o.materialId);
          if (mat) mat.stock = Math.max(0, mat.stock - 1);
          pushEvent(o, d.settings.currentUserId, 'approved', '审核通过，已下单生产', note);
        }),
      returnOrder: (orderId, reason) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          o.status = 'returned';
          o.updatedAt = iso();
          o.returns.push({
            id: `r-${Date.now().toString(36)}`,
            at: iso(),
            reviewerId: d.settings.currentUserId,
            reason,
            versionSeq: o.versions.length,
          });
          pushEvent(o, d.settings.currentUserId, 'returned', '审核退回', reason);
        }),
      deliverOrder: (orderId) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          o.status = 'delivered';
          o.updatedAt = iso();
          pushEvent(o, d.settings.currentUserId, 'delivered', '门店签收，已交付患者');
        }),
      updateOrderMeta: (orderId, patch) =>
        mutate((d) => {
          const o = d.orders.find((x) => x.id === orderId);
          if (!o) return;
          Object.assign(o, patch);
          o.updatedAt = iso();
        }),
      setThreshold: (v) => mutate((d) => { d.settings.threshold = v; }),
      upsertStore: (s) =>
        mutate((d) => {
          const idx = d.stores.findIndex((x) => x.id === s.id);
          if (idx >= 0) d.stores[idx] = s;
          else d.stores.push(s);
        }),
      upsertUser: (u) =>
        mutate((d) => {
          const idx = d.users.findIndex((x) => x.id === u.id);
          if (idx >= 0) d.users[idx] = u;
          else d.users.push(u);
        }),
      upsertMaterial: (m) =>
        mutate((d) => {
          const idx = d.materials.findIndex((x) => x.id === m.id);
          if (idx >= 0) d.materials[idx] = m;
          else d.materials.push(m);
        }),
      restock: (id, qty) =>
        mutate((d) => {
          const m = d.materials.find((x) => x.id === id);
          if (m) m.stock += qty;
        }),
      resetDemo: () => {
        localStorage.removeItem(KEY);
        setDb(buildSeed(Date.now()));
      },
    }),
    [db, currentUser, mutate],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useApp(): Actions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp outside provider');
  return ctx;
}

export function useOrder(orderId: string | undefined) {
  const { db } = useApp();
  return useMemo(() => db.orders.find((o) => o.id === orderId), [db.orders, orderId]);
}

export function fmtTime(isoStr: string) {
  const d = new Date(isoStr);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtDate(isoStr: string) {
  const d = new Date(isoStr);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function relTime(isoStr: string) {
  const ms = Date.now() - new Date(isoStr).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return fmtDate(isoStr);
}
