import { OBSTACLES, SEED_WORKERS, SIM_H, SIM_SCALE, SIM_W, WINDOWS, seedPlan } from './factory.js';
import type {
  ComputeResult, LightingPlan, WorkOrder, Worker as PlantWorker,
} from './types.js';

const PLAN_KEY = 'llw.lightingPlans.v1';
const ORDER_KEY = 'llw.workOrders.v1';
const WORKER_KEY = 'llw.workers.v1';
const HOUR_KEY = 'llw.hour.v1';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayAt(h: number, m = 0): string {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString().slice(0, 16);
}

function seedOrders(): WorkOrder[] {
  const now = new Date().toISOString().slice(0, 16);
  return [
    {
      id: 'WO-20261114-001',
      hotelName: '锦江国际大酒店',
      items: [
        { category: '床单', count: 120, stain: '一般' },
        { category: '枕套', count: 200, stain: '一般' },
      ],
      pickupTime: todayAt(18, 0),
      status: 'assigned',
      zoneId: 'wash',
      shift: 'day',
      workerId: 'w2',
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'WO-20261114-002',
      hotelName: '希尔顿花园酒店',
      items: [
        { category: '被套', count: 60, stain: '油渍' },
        { category: '浴巾', count: 80, stain: '一般' },
      ],
      pickupTime: todayAt(19, 30),
      status: 'pending',
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'WO-20261114-003',
      hotelName: '全季商务酒店',
      items: [{ category: '毛巾', count: 300, stain: '茶渍' }],
      pickupTime: todayAt(20, 0),
      status: 'submitted',
      zoneId: 'iron',
      shift: 'day',
      workerId: 'w4',
      wash: {
        waterTemp: 75,
        duration: 45,
        detergentMl: 180,
        photoDataUrl: '',
        submittedAt: now,
      },
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'WO-20261114-004',
      hotelName: '万达文华酒店',
      items: [
        { category: '台布', count: 45, stain: '食物' },
        { category: '工服', count: 90, stain: '油渍' },
      ],
      pickupTime: todayAt(17, 0),
      status: 'qc_passed',
      zoneId: 'qc',
      shift: 'evening',
      workerId: 'w5',
      wash: {
        waterTemp: 80,
        duration: 50,
        detergentMl: 220,
        photoDataUrl: '',
        submittedAt: now,
      },
      qcSampled: true,
      qcPlanId: 'plan-default',
      rewashes: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'WO-20261114-005',
      hotelName: '如家精选酒店',
      items: [{ category: '床单', count: 150, stain: '血渍' }],
      pickupTime: todayAt(16, 30),
      status: 'rejected',
      zoneId: 'wash',
      shift: 'evening',
      workerId: 'w6',
      wash: {
        waterTemp: 60,
        duration: 35,
        detergentMl: 120,
        photoDataUrl: '',
        submittedAt: now,
      },
      qcSampled: true,
      qcPlanId: 'plan-default',
      rewashes: [{ reason: '血渍残留未洗净', at: now }],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

type Listener = () => void;

class Store {
  plans: LightingPlan[] = [];
  orders: WorkOrder[] = [];
  workers: PlantWorker[] = [];
  hour = 8;
  activePlanId = 'plan-default';
  lastResult: ComputeResult | null = null;
  private listeners = new Set<Listener>();
  private worker: globalThis.Worker | null = null;
  private reqSeq = 0;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private inFlightReqId = -1;
  private dirty = false;

  init(): void {
    this.plans = load<LightingPlan[]>(PLAN_KEY, []);
    if (this.plans.length === 0) {
      this.plans = [seedPlan()];
      this.persistPlans();
    }
    this.orders = load<WorkOrder[]>(ORDER_KEY, []);
    if (this.orders.length === 0) {
      this.orders = seedOrders();
      this.persistOrders();
    }
    this.workers = load<PlantWorker[]>(WORKER_KEY, SEED_WORKERS);
    this.hour = load<number>(HOUR_KEY, 8);
    this.activePlanId = this.plans[0]?.id ?? '';
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  get activePlan(): LightingPlan {
    return this.plans.find((p) => p.id === this.activePlanId) ?? this.plans[0];
  }

  persistPlans(): void {
    save(PLAN_KEY, this.plans);
  }

  persistOrders(): void {
    save(ORDER_KEY, this.orders);
  }

  setHour(hour: number): void {
    this.hour = hour;
    save(HOUR_KEY, hour);
    this.scheduleCompute();
    this.emit();
  }

  updatePlan(mutator: (plan: LightingPlan) => void): void {
    const plan = this.activePlan;
    mutator(plan);
    plan.updatedAt = new Date().toISOString();
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }

  addPlan(name: string): void {
    const plan: LightingPlan = {
      id: uid('plan'),
      name,
      fixtures: structuredClone(this.activePlan.fixtures),
      qcStationId: this.activePlan.qcStationId,
      updatedAt: new Date().toISOString(),
    };
    this.plans.push(plan);
    this.activePlanId = plan.id;
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }

  removePlan(id: string): void {
    if (this.plans.length <= 1) return;
    this.plans = this.plans.filter((p) => p.id !== id);
    if (this.activePlanId === id) this.activePlanId = this.plans[0].id;
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }

  selectPlan(id: string): void {
    this.activePlanId = id;
    this.scheduleCompute();
    this.emit();
  }

  upsertOrder(order: WorkOrder): void {
    const idx = this.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) this.orders[idx] = order;
    else this.orders.unshift(order);
    order.updatedAt = new Date().toISOString().slice(0, 16);
    this.persistOrders();
    this.emit();
  }

  // ---------- Worker 照度计算（防抖 + 在途合并 + 版本追平） ----------
  scheduleCompute(): void {
    this.dirty = true;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => this.computeNow(), 90);
  }

  private ensureWorker(): globalThis.Worker {
    if (this.worker) return this.worker;
    const w = new globalThis.Worker(new URL('./workers/illuminance.worker.js', import.meta.url), {
      type: 'module',
    });
    w.onmessage = (ev: MessageEvent<ComputeResult>) => {
      const r = ev.data;
      this.inFlight = false;
      if (r.reqId === this.inFlightReqId) {
        this.lastResult = r; // 在途版本的完整回包上屏
        this.emit();
      }
      if (this.dirty) this.computeNow(); // 期间有变更 -> 按最新状态追平
    };
    w.onerror = (e) => {
      this.inFlight = false;
      console.error('[illuminance worker]', e.message);
    };
    this.worker = w;
    return w;
  }

  computeNow(): void {
    if (this.inFlight) return; // 在途期间的变更由 dirty 记录，回包后自动追平
    const plan = this.activePlan;
    if (!plan) return;
    this.dirty = false;
    const reqId = ++this.reqSeq;
    this.inFlight = true;
    this.inFlightReqId = reqId;
    this.ensureWorker().postMessage({
      type: 'compute',
      reqId,
      width: SIM_W,
      height: SIM_H,
      scale: SIM_SCALE,
      fixtures: plan.fixtures,
      obstacles: OBSTACLES,
      windows: WINDOWS,
      hour: this.hour,
    });
  }
}

export const store = new Store();
