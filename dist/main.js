// src/factory.ts
var FLOOR_W = 30;
var FLOOR_H = 18;
var SIM_W = 480;
var SIM_H = 288;
var SIM_SCALE = SIM_W / FLOOR_W;
var ZONES = [
  { id: "sort", name: "\u5206\u62E3\u533A", x: 0, y: 0, w: 9, h: 8, kind: "work", threshold: 200 },
  { id: "wash", name: "\u4E3B\u6D17\u533A", x: 9, y: 0, w: 12, h: 8, kind: "work", threshold: 200 },
  { id: "dry", name: "\u70D8\u5E72\u533A", x: 21, y: 0, w: 9, h: 8, kind: "work", threshold: 200 },
  { id: "iron", name: "\u71A8\u5E73\u533A", x: 0, y: 12, w: 21, h: 6, kind: "work", threshold: 300 },
  { id: "qc", name: "\u8D28\u68C0\u533A", x: 21, y: 12, w: 9, h: 6, kind: "qc", threshold: 300 },
  { id: "aisle", name: "\u901A\u9053", x: 0, y: 8, w: 30, h: 4, kind: "aisle", threshold: 150 }
];
var OBSTACLES = [
  { id: "ob-sort-1", name: "\u5206\u62E3\u53F0 A", x: 1.2, y: 2, w: 3.2, h: 1.4 },
  { id: "ob-sort-2", name: "\u5206\u62E3\u53F0 B", x: 5, y: 2, w: 3.2, h: 1.4 },
  { id: "ob-cart-1", name: "\u5E03\u8349\u8F66 1", x: 3, y: 5.6, w: 1.6, h: 1.2 },
  { id: "ob-wm-1", name: "\u6D17\u8131\u673A 1", x: 10.2, y: 1.4, w: 2.4, h: 2.2 },
  { id: "ob-wm-2", name: "\u6D17\u8131\u673A 2", x: 13.4, y: 1.4, w: 2.4, h: 2.2 },
  { id: "ob-wm-3", name: "\u6D17\u8131\u673A 3", x: 16.6, y: 1.4, w: 2.4, h: 2.2 },
  { id: "ob-dry-1", name: "\u70D8\u5E72\u673A 1", x: 22.2, y: 1.4, w: 2.6, h: 2.4 },
  { id: "ob-dry-2", name: "\u70D8\u5E72\u673A 2", x: 25.6, y: 1.4, w: 2.6, h: 2.4 },
  { id: "ob-iron-1", name: "\u71A8\u5E73\u673A", x: 2, y: 13.6, w: 9, h: 2.2 },
  { id: "ob-iron-2", name: "\u6298\u53E0\u53F0", x: 13.2, y: 13.8, w: 4.2, h: 1.8 },
  { id: "ob-qc-1", name: "\u8D28\u68C0\u53F0 1", x: 22.2, y: 13.4, w: 2.4, h: 1.3 },
  { id: "ob-qc-2", name: "\u8D28\u68C0\u53F0 2", x: 25.4, y: 13.4, w: 2.4, h: 1.3 },
  { id: "ob-qc-3", name: "\u8D28\u68C0\u53F0 3", x: 23.8, y: 15.8, w: 2.4, h: 1.3 }
];
var QC_STATIONS = OBSTACLES.filter((o) => o.name.startsWith("\u8D28\u68C0\u53F0"));
var WINDOWS = [
  { id: "win-1", x: 1, y: 0.15, w: 6, h: 0.5 },
  { id: "win-2", x: 10, y: 0.15, w: 8, h: 0.5 },
  { id: "win-3", x: 22, y: 0.15, w: 6, h: 0.5 }
];
var FIXTURE_DEFAULTS = {
  ceiling: { kind: "ceiling", height: 5, flux: 12e3, cct: 5e3, beam: 90, on: true },
  task: { kind: "task", height: 2.4, flux: 3500, cct: 5700, beam: 60, on: true },
  wallwash: { kind: "wallwash", height: 3.2, flux: 4e3, cct: 4e3, beam: 35, on: true }
};
var seq = 0;
function newFixture(kind, x, y) {
  seq += 1;
  const label = { ceiling: "\u9876\u706F", task: "\u5DE5\u4F4D\u706F", wallwash: "\u6D17\u5899\u706F" }[kind];
  return {
    ...structuredClone(FIXTURE_DEFAULTS[kind]),
    id: `fx-${Date.now().toString(36)}-${seq}`,
    name: `${label} ${seq}`,
    x,
    y
  };
}
function f(id, name, kind, x, y, h, flux, cct, beam, on = true, aim) {
  return { id, name, kind, x, y, height: h, flux, cct, beam, on, aim };
}
function seedFixtures() {
  return [
    // 分拣区顶灯
    f("f-s1", "\u9876\u706F \u5206\u62E31", "ceiling", 2.5, 2.2, 5, 11e3, 5e3, 90),
    f("f-s2", "\u9876\u706F \u5206\u62E32", "ceiling", 6.8, 5.2, 5, 11e3, 5e3, 90),
    f("f-s3", "\u5DE5\u4F4D\u706F \u5206\u62E3\u53F0A", "task", 2.8, 2, 2.4, 3200, 5700, 60),
    f("f-s4", "\u5DE5\u4F4D\u706F \u5206\u62E3\u53F0B", "task", 6.6, 2, 2.4, 3200, 5700, 60),
    // 主洗区
    f("f-w1", "\u9876\u706F \u4E3B\u6D171", "ceiling", 11.5, 2.2, 5, 12e3, 5e3, 90),
    f("f-w2", "\u9876\u706F \u4E3B\u6D172", "ceiling", 15.5, 2.2, 5, 12e3, 5e3, 90),
    f("f-w3", "\u9876\u706F \u4E3B\u6D173", "ceiling", 19, 5.6, 5, 12e3, 5e3, 90),
    // 烘干区
    f("f-d1", "\u9876\u706F \u70D8\u5E721", "ceiling", 23.5, 2.4, 5, 11e3, 5e3, 90),
    f("f-d2", "\u9876\u706F \u70D8\u5E722", "ceiling", 27.6, 5.6, 5, 11e3, 5e3, 90),
    f("f-d3", "\u5DE5\u4F4D\u706F \u70D8\u5E72", "task", 24, 4.6, 2.4, 3200, 5700, 60),
    // 通道（刻意欠照 -> 暗区，加灯即可消除）
    f("f-a1", "\u9876\u706F \u901A\u90531", "ceiling", 6, 10, 5, 5500, 4500, 90),
    f("f-a2", "\u9876\u706F \u901A\u90532", "ceiling", 22, 10, 5, 5500, 4500, 90),
    // 熨平区
    f("f-i1", "\u9876\u706F \u71A8\u5E731", "ceiling", 4, 13.2, 5, 12e3, 5e3, 90),
    f("f-i2", "\u9876\u706F \u71A8\u5E732", "ceiling", 10, 15.8, 5, 12e3, 5e3, 90),
    f("f-i3", "\u9876\u706F \u71A8\u5E733", "ceiling", 16.5, 14, 5, 12e3, 5e3, 90),
    f("f-i4", "\u5DE5\u4F4D\u706F \u71A8\u5E73\u673A", "task", 6.5, 13.4, 2.4, 3500, 5700, 60),
    f("f-i5", "\u5DE5\u4F4D\u706F \u6298\u53E0\u53F0", "task", 15.3, 13.6, 2.4, 3500, 5700, 60),
    // 质检区：工位灯 3 关闭 -> 该台夜间/清晨低于 300lux，触发质检台暗区规则
    f("f-q1", "\u9876\u706F \u8D28\u68C0", "ceiling", 25.2, 13, 5, 8e3, 5700, 80),
    f("f-q2", "\u5DE5\u4F4D\u706F \u8D28\u68C0\u53F01", "task", 23.4, 13.2, 2.4, 3500, 5700, 60),
    f("f-q3", "\u5DE5\u4F4D\u706F \u8D28\u68C0\u53F02", "task", 26.6, 13.2, 2.4, 3500, 5700, 60),
    f("f-q4", "\u5DE5\u4F4D\u706F \u8D28\u68C0\u53F03", "task", 25, 15.6, 2.4, 3500, 5700, 60, false),
    // 洗墙灯（照北墙设备带）
    f("f-ww1", "\u6D17\u5899\u706F 1", "wallwash", 8.4, 7.4, 3.2, 4e3, 4e3, 35, true, { x: 8.4, y: 0.6 }),
    f("f-ww2", "\u6D17\u5899\u706F 2", "wallwash", 20.6, 7.4, 3.2, 4e3, 4e3, 35, true, { x: 20.6, y: 0.6 })
  ];
}
function seedPlan() {
  return {
    id: "plan-default",
    name: "\u9ED8\u8BA4\u5E03\u5149\u65B9\u6848",
    fixtures: seedFixtures(),
    qcStationId: "ob-qc-1",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
var SEED_WORKERS = [
  { id: "w1", name: "\u5F20\u5EFA\u56FD", zoneId: "sort", shift: "day" },
  { id: "w2", name: "\u674E\u79C0\u5170", zoneId: "wash", shift: "day" },
  { id: "w3", name: "\u738B\u6D77\u6D9B", zoneId: "dry", shift: "day" },
  { id: "w4", name: "\u9648\u4E3D\u5A1F", zoneId: "iron", shift: "evening" },
  { id: "w5", name: "\u8D75\u654F", zoneId: "qc", shift: "day" },
  { id: "w6", name: "\u5B59\u5FD7\u5F3A", zoneId: "wash", shift: "evening" }
];
var SHIFT_LABEL = {
  day: "\u767D\u73ED 08:00-14:00",
  evening: "\u665A\u73ED 14:00-20:00"
};

// src/lighting.ts
function sunElevation(hour) {
  const t = (hour - 8) / 12;
  return Math.sin(t * Math.PI) * (65 * Math.PI / 180);
}
function daylightCct(hour) {
  const elev = sunElevation(hour);
  return Math.round(3500 + 3e3 * Math.max(0, Math.sin(elev)));
}
function cctToRgb(kelvin) {
  const t = Math.max(1e3, Math.min(12e3, kelvin)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * t ** -0.1332;
    g = 288.12 * t ** -0.0755;
    b = 255;
  }
  return [clamp255(r), clamp255(g), clamp255(b)];
}
function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
var RAMP = [
  { lux: 0, rgb: [18, 32, 92] },
  { lux: 30, rgb: [38, 96, 168] },
  { lux: 80, rgb: [52, 160, 190] },
  { lux: 150, rgb: [62, 190, 140] },
  { lux: 300, rgb: [130, 205, 90] },
  { lux: 500, rgb: [235, 210, 70] },
  { lux: 800, rgb: [235, 130, 45] },
  { lux: 1400, rgb: [220, 55, 45] }
];
function heatColor(lux) {
  const l = Math.log10(1 + Math.max(0, lux));
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i];
    const b = RAMP[i + 1];
    const la = Math.log10(1 + a.lux);
    const lb = Math.log10(1 + b.lux);
    if (l <= lb) {
      const t = (l - la) / Math.max(1e-9, lb - la);
      return [
        Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * t),
        Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * t),
        Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * t)
      ];
    }
  }
  return RAMP[RAMP.length - 1].rgb;
}
var LEGEND = RAMP.map((r) => r.lux);

// src/store.ts
var PLAN_KEY = "llw.lightingPlans.v1";
var ORDER_KEY = "llw.workOrders.v1";
var WORKER_KEY = "llw.workers.v1";
var HOUR_KEY = "llw.hour.v1";
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function todayAt(h, m = 0) {
  const d = /* @__PURE__ */ new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString().slice(0, 16);
}
function seedOrders() {
  const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16);
  return [
    {
      id: "WO-20261114-001",
      hotelName: "\u9526\u6C5F\u56FD\u9645\u5927\u9152\u5E97",
      items: [
        { category: "\u5E8A\u5355", count: 120, stain: "\u4E00\u822C" },
        { category: "\u6795\u5957", count: 200, stain: "\u4E00\u822C" }
      ],
      pickupTime: todayAt(18, 0),
      status: "assigned",
      zoneId: "wash",
      shift: "day",
      workerId: "w2",
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "WO-20261114-002",
      hotelName: "\u5E0C\u5C14\u987F\u82B1\u56ED\u9152\u5E97",
      items: [
        { category: "\u88AB\u5957", count: 60, stain: "\u6CB9\u6E0D" },
        { category: "\u6D74\u5DFE", count: 80, stain: "\u4E00\u822C" }
      ],
      pickupTime: todayAt(19, 30),
      status: "pending",
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "WO-20261114-003",
      hotelName: "\u5168\u5B63\u5546\u52A1\u9152\u5E97",
      items: [{ category: "\u6BDB\u5DFE", count: 300, stain: "\u8336\u6E0D" }],
      pickupTime: todayAt(20, 0),
      status: "submitted",
      zoneId: "iron",
      shift: "day",
      workerId: "w4",
      wash: {
        waterTemp: 75,
        duration: 45,
        detergentMl: 180,
        photoDataUrl: "",
        submittedAt: now
      },
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "WO-20261114-004",
      hotelName: "\u4E07\u8FBE\u6587\u534E\u9152\u5E97",
      items: [
        { category: "\u53F0\u5E03", count: 45, stain: "\u98DF\u7269" },
        { category: "\u5DE5\u670D", count: 90, stain: "\u6CB9\u6E0D" }
      ],
      pickupTime: todayAt(17, 0),
      status: "qc_passed",
      zoneId: "qc",
      shift: "evening",
      workerId: "w5",
      wash: {
        waterTemp: 80,
        duration: 50,
        detergentMl: 220,
        photoDataUrl: "",
        submittedAt: now
      },
      qcSampled: true,
      qcPlanId: "plan-default",
      rewashes: [],
      createdAt: now,
      updatedAt: now
    },
    {
      id: "WO-20261114-005",
      hotelName: "\u5982\u5BB6\u7CBE\u9009\u9152\u5E97",
      items: [{ category: "\u5E8A\u5355", count: 150, stain: "\u8840\u6E0D" }],
      pickupTime: todayAt(16, 30),
      status: "rejected",
      zoneId: "wash",
      shift: "evening",
      workerId: "w6",
      wash: {
        waterTemp: 60,
        duration: 35,
        detergentMl: 120,
        photoDataUrl: "",
        submittedAt: now
      },
      qcSampled: true,
      qcPlanId: "plan-default",
      rewashes: [{ reason: "\u8840\u6E0D\u6B8B\u7559\u672A\u6D17\u51C0", at: now }],
      createdAt: now,
      updatedAt: now
    }
  ];
}
var Store = class {
  plans = [];
  orders = [];
  workers = [];
  hour = 8;
  activePlanId = "plan-default";
  lastResult = null;
  listeners = /* @__PURE__ */ new Set();
  worker = null;
  reqSeq = 0;
  pendingTimer = null;
  inFlight = false;
  inFlightReqId = -1;
  dirty = false;
  init() {
    this.plans = load(PLAN_KEY, []);
    if (this.plans.length === 0) {
      this.plans = [seedPlan()];
      this.persistPlans();
    }
    this.orders = load(ORDER_KEY, []);
    if (this.orders.length === 0) {
      this.orders = seedOrders();
      this.persistOrders();
    }
    this.workers = load(WORKER_KEY, SEED_WORKERS);
    this.hour = load(HOUR_KEY, 8);
    this.activePlanId = this.plans[0]?.id ?? "";
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit() {
    this.listeners.forEach((fn) => fn());
  }
  get activePlan() {
    return this.plans.find((p) => p.id === this.activePlanId) ?? this.plans[0];
  }
  persistPlans() {
    save(PLAN_KEY, this.plans);
  }
  persistOrders() {
    save(ORDER_KEY, this.orders);
  }
  setHour(hour) {
    this.hour = hour;
    save(HOUR_KEY, hour);
    this.scheduleCompute();
    this.emit();
  }
  updatePlan(mutator) {
    const plan = this.activePlan;
    mutator(plan);
    plan.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }
  addPlan(name) {
    const plan = {
      id: uid("plan"),
      name,
      fixtures: structuredClone(this.activePlan.fixtures),
      qcStationId: this.activePlan.qcStationId,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.plans.push(plan);
    this.activePlanId = plan.id;
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }
  removePlan(id) {
    if (this.plans.length <= 1) return;
    this.plans = this.plans.filter((p) => p.id !== id);
    if (this.activePlanId === id) this.activePlanId = this.plans[0].id;
    this.persistPlans();
    this.scheduleCompute();
    this.emit();
  }
  selectPlan(id) {
    this.activePlanId = id;
    this.scheduleCompute();
    this.emit();
  }
  upsertOrder(order) {
    const idx = this.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) this.orders[idx] = order;
    else this.orders.unshift(order);
    order.updatedAt = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16);
    this.persistOrders();
    this.emit();
  }
  // ---------- Worker 照度计算（防抖 + 在途合并 + 版本追平） ----------
  scheduleCompute() {
    this.dirty = true;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => this.computeNow(), 90);
  }
  ensureWorker() {
    if (this.worker) return this.worker;
    const w = new globalThis.Worker(new URL("./workers/illuminance.worker.js", import.meta.url), {
      type: "module"
    });
    w.onmessage = (ev) => {
      const r = ev.data;
      this.inFlight = false;
      if (r.reqId === this.inFlightReqId) {
        this.lastResult = r;
        this.emit();
      }
      if (this.dirty) this.computeNow();
    };
    w.onerror = (e) => {
      this.inFlight = false;
      console.error("[illuminance worker]", e.message);
    };
    this.worker = w;
    return w;
  }
  computeNow() {
    if (this.inFlight) return;
    const plan = this.activePlan;
    if (!plan) return;
    this.dirty = false;
    const reqId = ++this.reqSeq;
    this.inFlight = true;
    this.inFlightReqId = reqId;
    this.ensureWorker().postMessage({
      type: "compute",
      reqId,
      width: SIM_W,
      height: SIM_H,
      scale: SIM_SCALE,
      fixtures: plan.fixtures,
      obstacles: OBSTACLES,
      windows: WINDOWS,
      hour: this.hour
    });
  }
};
var store = new Store();

// src/domain.ts
var STATUS_LABEL = {
  pending: "\u5F85\u5206\u6D3E",
  assigned: "\u5DF2\u5206\u6D3E",
  washing: "\u6D17\u6DA4\u4E2D",
  submitted: "\u5F85\u8D28\u68C0",
  qc_passed: "\u8D28\u68C0\u5408\u683C",
  rejected: "\u6253\u56DE\u8FD4\u6D17",
  done: "\u5B8C\u6210"
};
function totalPieces(order) {
  return order.items.reduce((s, it) => s + it.count, 0);
}
function sampleCount(order) {
  const total = totalPieces(order);
  if (total <= 20) return total;
  return Math.max(1, Math.round(total * 0.05));
}
function zoneName(id) {
  return ZONES.find((z) => z.id === id)?.name ?? "\u2014";
}
function workerKpis(orders, workers) {
  return workers.map((w) => {
    const mine = orders.filter((o) => o.workerId === w.id);
    const completed = mine.filter((o) => o.status === "qc_passed" || o.status === "done" || o.status === "rejected").length;
    const rewashed = mine.reduce((s, o) => s + o.rewashes.length, 0);
    return {
      workerId: w.id,
      name: w.name,
      completed,
      rewashed,
      rewashRate: completed ? rewashed / completed : 0
    };
  });
}
function boardStats(orders, sim) {
  const doneish = orders.filter((o) => o.status === "qc_passed" || o.status === "done" || o.status === "rejected");
  const rewashTotal = orders.reduce((s, o) => s + o.rewashes.length, 0);
  const zones = sim?.zones ?? [];
  const avg = zones.length ? zones.reduce((s, z) => s + z.compliance, 0) / zones.length : 0;
  return {
    totalOrders: orders.length,
    activeOrders: orders.filter((o) => ["assigned", "washing", "submitted", "rejected"].includes(o.status)).length,
    passedToday: orders.filter((o) => o.status === "qc_passed" || o.status === "done").length,
    rewashRateAll: doneish.length ? rewashTotal / doneish.length : 0,
    darkAreas: sim?.darkAreas ?? [],
    zoneCompliance: zones.map((z) => ({
      name: z.name,
      compliance: z.compliance,
      avgLux: z.avgLux,
      threshold: z.threshold
    })),
    avgCompliance: avg
  };
}
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv(filename, header, rows) {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function fmtLux(v) {
  return v >= 1e3 ? `${(v / 1e3).toFixed(2)}k` : Math.round(v).toString();
}

// src/components/lighting-studio.ts
var KIND_LABEL = {
  ceiling: "\u9876\u706F",
  task: "\u5DE5\u4F4D\u706F",
  wallwash: "\u6D17\u5899\u706F"
};
var LightingStudio = class extends HTMLElement {
  heatCanvas;
  overlay;
  octx;
  scale = 26;
  selectedId = null;
  dragging = false;
  hover = null;
  showHeat = true;
  unsubscribe = () => {
  };
  connectedCallback() {
    this.innerHTML = `
      <div class="studio-wrap">
        <div class="studio-left">
          <div class="plan-bar">
            <label>\u5E03\u5149\u65B9\u6848
              <select data-role="plan-select"></select>
            </label>
            <button data-act="add-plan" class="btn">\u53E6\u5B58\u65B0\u65B9\u6848</button>
            <button data-act="del-plan" class="btn btn-danger">\u5220\u9664</button>
            <label class="chk"><input type="checkbox" data-role="heat-toggle" checked> \u7167\u5EA6\u8272\u9636</label>
            <span class="spacer"></span>
            <label>\u5173\u8054\u8D28\u68C0\u53F0
              <select data-role="qc-select"></select>
            </label>
          </div>
          <div class="canvas-stack" data-role="stack">
            <canvas class="heat-canvas" data-role="heat" width="${SIM_W}" height="${SIM_H}"></canvas>
            <canvas class="overlay-canvas" data-role="overlay"></canvas>
          </div>
          <div class="legend" data-role="legend"></div>
          <div class="time-bar">
            <span>\u{1F305} 08:00</span>
            <input type="range" min="8" max="20" step="1" value="${store.hour}" data-role="hour">
            <span>\u{1F319} 20:00</span>
            <strong data-role="hour-label"></strong>
            <span data-role="daylight" class="daylight-tag"></span>
          </div>
        </div>
        <div class="studio-right">
          <section class="panel">
            <h3>\u706F\u5177\u5E93</h3>
            <div class="add-fixture">
              <button class="btn" data-add="ceiling">\uFF0B \u9876\u706F</button>
              <button class="btn" data-add="task">\uFF0B \u5DE5\u4F4D\u706F</button>
              <button class="btn" data-add="wallwash">\uFF0B \u6D17\u5899\u706F</button>
            </div>
            <p class="hint">\u5728\u5E73\u9762\u56FE\u4E0A\u62D6\u52A8\u706F\u5177\u5B9E\u65F6\u91CD\u7B97\uFF1B\u6D17\u5899\u706F\u70B9\u51FB\u540E\u53EF\u6539\u6307\u5411\u3002</p>
          </section>
          <section class="panel" data-role="fixture-panel"></section>
          <section class="panel dark-panel">
            <h3>\u6697\u533A\u6E05\u5355 <em data-role="dark-count"></em></h3>
            <ul data-role="dark-list" class="dark-list"></ul>
            <h3>\u533A\u57DF\u7167\u5EA6</h3>
            <table class="zone-table" data-role="zone-table"></table>
          </section>
        </div>
      </div>
    `;
    this.heatCanvas = this.querySelector('[data-role="heat"]');
    this.overlay = this.querySelector('[data-role="overlay"]');
    this.octx = this.overlay.getContext("2d");
    this.bindEvents();
    this.unsubscribe = store.subscribe(() => this.render());
    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.querySelector('[data-role="stack"]'));
    store.scheduleCompute();
    this.render();
  }
  disconnectedCallback() {
    this.unsubscribe();
  }
  // ---------------- 事件 ----------------
  bindEvents() {
    this.querySelector('[data-role="hour"]').addEventListener("input", (e) => {
      store.setHour(Number(e.target.value));
    });
    this.querySelector('[data-role="heat-toggle"]').addEventListener("change", (e) => {
      this.showHeat = e.target.checked;
      this.drawOverlay();
    });
    this.querySelector('[data-role="plan-select"]').addEventListener("change", (e) => {
      store.selectPlan(e.target.value);
      this.selectedId = null;
    });
    this.querySelector('[data-act="add-plan"]').addEventListener("click", () => {
      const name = prompt("\u65B0\u5E03\u5149\u65B9\u6848\u540D\u79F0", `\u65B9\u6848 ${store.plans.length + 1}`);
      if (name) store.addPlan(name);
    });
    this.querySelector('[data-act="del-plan"]').addEventListener("click", () => {
      if (confirm(`\u5220\u9664\u65B9\u6848\u300C${store.activePlan.name}\u300D\uFF1F`)) {
        store.removePlan(store.activePlan.id);
        this.selectedId = null;
      }
    });
    this.querySelector('[data-role="qc-select"]').addEventListener("change", (e) => {
      store.updatePlan((p) => {
        p.qcStationId = e.target.value;
      });
    });
    this.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.add;
        const fx = newFixture(kind, FLOOR_W / 2, FLOOR_H / 2);
        if (kind === "wallwash") fx.aim = { x: fx.x, y: fx.y - 3 };
        store.updatePlan((p) => p.fixtures.push(fx));
        this.selectedId = fx.id;
      });
    });
    this.overlay.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    window.addEventListener("pointermove", (e) => this.onPointerMove(e));
    window.addEventListener("pointerup", () => {
      this.dragging = false;
    });
  }
  eventPos(e) {
    const r = this.overlay.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / this.scale,
      y: (e.clientY - r.top) / this.scale
    };
  }
  hitFixture(x, y) {
    const fxs = store.activePlan.fixtures;
    for (let i = fxs.length - 1; i >= 0; i--) {
      const fx = fxs[i];
      if (Math.hypot(fx.x - x, fx.y - y) <= 0.7) return fx;
    }
    return null;
  }
  onPointerDown(e) {
    const pos = this.eventPos(e);
    const fx = this.hitFixture(pos.x, pos.y);
    if (fx) {
      this.selectedId = fx.id;
      this.dragging = true;
      this.renderFixturePanel();
      this.drawOverlay();
    } else {
      const sel = this.selected();
      if (sel?.kind === "wallwash") {
        store.updatePlan((p) => {
          const t = p.fixtures.find((q) => q.id === sel.id);
          if (t) t.aim = { x: pos.x, y: pos.y };
        });
      } else {
        this.selectedId = null;
        this.renderFixturePanel();
        this.drawOverlay();
      }
    }
  }
  onPointerMove(e) {
    const rect = this.overlay.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside && !this.dragging) {
      if (this.hover) {
        this.hover = null;
        this.drawOverlay();
      }
      return;
    }
    const pos = this.eventPos(e);
    this.hover = pos;
    if (this.dragging && this.selectedId) {
      const x = Math.max(0.3, Math.min(FLOOR_W - 0.3, pos.x));
      const y = Math.max(0.3, Math.min(FLOOR_H - 0.3, pos.y));
      store.updatePlan((p) => {
        const t = p.fixtures.find((q) => q.id === this.selectedId);
        if (t) {
          t.x = x;
          t.y = y;
        }
      });
    } else {
      this.overlay.style.cursor = this.hitFixture(pos.x, pos.y) ? "grab" : "crosshair";
      this.drawOverlay();
    }
  }
  selected() {
    return store.activePlan.fixtures.find((f2) => f2.id === this.selectedId) ?? null;
  }
  resize() {
    const stack = this.querySelector('[data-role="stack"]');
    const w = stack.clientWidth;
    this.scale = w / FLOOR_W;
    const cw = Math.round(FLOOR_W * this.scale);
    const ch = Math.round(FLOOR_H * this.scale);
    this.overlay.width = cw;
    this.overlay.height = ch;
    this.heatCanvas.style.width = `${cw}px`;
    this.heatCanvas.style.height = `${ch}px`;
    this.drawOverlay();
  }
  // ---------------- 渲染 ----------------
  render() {
    this.renderPlanBar();
    this.drawHeat();
    this.drawOverlay();
    this.renderFixturePanel();
    this.renderDark();
    this.renderTime();
  }
  renderPlanBar() {
    const sel = this.querySelector('[data-role="plan-select"]');
    sel.innerHTML = store.plans.map((p) => `<option value="${p.id}" ${p.id === store.activePlanId ? "selected" : ""}>${p.name}</option>`).join("");
    const qc = this.querySelector('[data-role="qc-select"]');
    qc.innerHTML = '<option value="">\uFF08\u4E0D\u5173\u8054\uFF09</option>' + QC_STATIONS.map((q) => `<option value="${q.id}" ${q.id === store.activePlan.qcStationId ? "selected" : ""}>${q.name}</option>`).join("");
  }
  renderTime() {
    this.querySelector('[data-role="hour-label"]').textContent = `${String(store.hour).padStart(2, "0")}:00 \xB7 \u81EA\u7136\u5149 ${daylightCct(store.hour)}K`;
    const dl = store.lastResult?.daylightLux ?? 0;
    this.querySelector('[data-role="daylight"]').textContent = `\u7A97\u5165\u5C04\u53C2\u8003 ${fmtLux(dl)} lux`;
  }
  drawHeat() {
    const ctx2 = this.heatCanvas.getContext("2d");
    ctx2.clearRect(0, 0, SIM_W, SIM_H);
    const r = store.lastResult;
    if (r && this.showHeat) {
      ctx2.drawImage(r.bitmap, 0, 0);
    }
  }
  drawOverlay() {
    const c = this.octx;
    const s = this.scale;
    c.clearRect(0, 0, this.overlay.width, this.overlay.height);
    c.lineWidth = 1;
    for (const z of ZONES) {
      c.fillStyle = "rgba(255,255,255,0.045)";
      c.fillRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.strokeStyle = "rgba(255,255,255,0.55)";
      c.strokeRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.fillStyle = "rgba(255,255,255,0.92)";
      c.font = "bold 12px system-ui";
      c.fillText(z.name, z.x * s + 6, z.y * s + 15);
      const stat = store.lastResult?.zones.find((q) => q.zoneId === z.id);
      if (stat) {
        c.font = "11px system-ui";
        c.fillStyle = stat.dark ? "#ff9b9b" : "#b9f6ca";
        c.fillText(
          `${fmtLux(stat.avgLux)} lux / \u8FBE\u6807${(stat.compliance * 100).toFixed(0)}%`,
          z.x * s + 6,
          z.y * s + 30
        );
      }
    }
    const darkIds = new Set(store.lastResult?.darkAreas.map((d) => d.zoneId) ?? []);
    c.save();
    c.strokeStyle = "rgba(255,70,70,0.55)";
    c.lineWidth = 2;
    for (const z of ZONES.filter((q) => darkIds.has(q.id))) {
      for (let x = z.x * s; x < (z.x + z.w) * s; x += 12) {
        c.beginPath();
        c.moveTo(x, z.y * s);
        c.lineTo(x + z.h * s, (z.y + z.h) * s);
        c.stroke();
      }
      c.strokeStyle = "rgba(255,90,90,0.9)";
      c.strokeRect(z.x * s, z.y * s, z.w * s, z.h * s);
      c.strokeStyle = "rgba(255,70,70,0.55)";
    }
    c.restore();
    c.strokeStyle = "#80d8ff";
    c.lineWidth = 3;
    for (const w of WINDOWS) {
      c.beginPath();
      c.moveTo(w.x * s, w.y * s);
      c.lineTo((w.x + w.w) * s, w.y * s);
      c.stroke();
    }
    c.lineWidth = 1;
    for (const ob of OBSTACLES) {
      c.fillStyle = "rgba(120,130,150,0.55)";
      c.strokeStyle = "rgba(220,225,235,0.8)";
      c.fillRect(ob.x * s, ob.y * s, ob.w * s, ob.h * s);
      c.strokeRect(ob.x * s, ob.y * s, ob.w * s, ob.h * s);
      c.fillStyle = "rgba(255,255,255,0.85)";
      c.font = "10px system-ui";
      c.fillText(ob.name, ob.x * s + 3, ob.y * s + ob.h * s - 4);
    }
    for (const fx of store.activePlan.fixtures) {
      this.drawFixture(fx, s, c);
    }
    if (this.hover && store.lastResult) {
      const ix = Math.max(0, Math.min(SIM_W - 1, Math.floor(this.hover.x * (SIM_W / FLOOR_W))));
      const iy = Math.max(0, Math.min(SIM_H - 1, Math.floor(this.hover.y * (SIM_H / FLOOR_H))));
      const v = store.lastResult.lux[iy * SIM_W + ix];
      c.fillStyle = "rgba(0,0,0,0.72)";
      const tx = this.hover.x * s + 10;
      const ty = this.hover.y * s - 10;
      c.fillRect(tx - 4, ty - 14, 78, 18);
      c.fillStyle = "#fff";
      c.font = "11px system-ui";
      c.fillText(`${fmtLux(v)} lux`, tx, ty);
    }
    this.renderLegend();
  }
  drawFixture(fx, s, c) {
    const x = fx.x * s;
    const y = fx.y * s;
    const [r, g, b] = cctToRgb(fx.cct);
    const selected = fx.id === this.selectedId;
    const colors = {
      ceiling: "#ffd54f",
      task: "#4fc3f7",
      wallwash: "#ce93d8"
    };
    c.save();
    if (!fx.on) c.globalAlpha = 0.35;
    if (fx.kind === "wallwash" && fx.aim) {
      c.strokeStyle = "rgba(206,147,216,0.8)";
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(fx.aim.x * s, fx.aim.y * s);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#ce93d8";
      c.beginPath();
      c.arc(fx.aim.x * s, fx.aim.y * s, 3, 0, Math.PI * 2);
      c.fill();
    }
    const reach = fx.height * Math.tan(fx.beam * Math.PI / 360);
    c.strokeStyle = `rgba(${r},${g},${b},0.35)`;
    c.beginPath();
    c.arc(x, y, reach * s, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = colors[fx.kind];
    c.strokeStyle = selected ? "#ff5252" : "rgba(0,0,0,0.6)";
    c.lineWidth = selected ? 2.5 : 1;
    c.beginPath();
    if (fx.kind === "ceiling") {
      c.arc(x, y, 7, 0, Math.PI * 2);
    } else if (fx.kind === "task") {
      c.rect(x - 6, y - 6, 12, 12);
    } else {
      c.moveTo(x, y - 8);
      c.lineTo(x + 8, y + 6);
      c.lineTo(x - 8, y + 6);
      c.closePath();
    }
    c.fill();
    c.stroke();
    c.lineWidth = 1;
    c.restore();
  }
  renderLegend() {
    const el = this.querySelector('[data-role="legend"]');
    el.innerHTML = LEGEND.map((lx) => {
      const [r, g, b] = heatColor(lx + 1);
      return `<span class="leg"><i style="background:rgb(${r},${g},${b})"></i>${lx === 0 ? "0" : fmtLux(lx)}lx</span>`;
    }).join("");
  }
  renderFixturePanel() {
    const host = this.querySelector('[data-role="fixture-panel"]');
    const fx = this.selected();
    if (!fx) {
      host.innerHTML = '<h3>\u706F\u5177\u53C2\u6570</h3><p class="hint">\u70B9\u51FB\u5E73\u9762\u56FE\u4E0A\u7684\u706F\u5177\u67E5\u770B\u5E76\u7F16\u8F91\u53C2\u6570\uFF08\u5149\u901A\u91CF / \u8272\u6E29 / \u5149\u675F\u89D2 / \u9AD8\u5EA6\uFF09\u3002</p>';
      return;
    }
    host.innerHTML = `
      <h3>${fx.name} <small>${KIND_LABEL[fx.kind]}</small></h3>
      <div class="fx-form">
        <label>\u540D\u79F0 <input data-f="name" value="${fx.name}"></label>
        <label>\u5149\u901A\u91CF <span class="val">${fx.flux} lm</span>
          <input type="range" min="500" max="20000" step="100" data-f="flux" value="${fx.flux}"></label>
        <label>\u8272\u6E29 <span class="val">${fx.cct} K</span>
          <input type="range" min="2700" max="6500" step="100" data-f="cct" value="${fx.cct}"></label>
        <label>\u5149\u675F\u89D2 <span class="val">${fx.beam}\xB0</span>
          <input type="range" min="10" max="150" step="1" data-f="beam" value="${fx.beam}"></label>
        <label>\u5B89\u88C5\u9AD8\u5EA6 <span class="val">${fx.height.toFixed(1)} m</span>
          <input type="range" min="1.8" max="8" step="0.1" data-f="height" value="${fx.height}"></label>
        <label class="chk"><input type="checkbox" data-f="on" ${fx.on ? "checked" : ""}> \u542F\u7528\u8BE5\u706F</label>
        <div class="fx-actions">
          <button class="btn btn-danger" data-act="delete-fx">\u5220\u9664\u706F\u5177</button>
          <button class="btn" data-act="dup-fx">\u590D\u5236</button>
        </div>
      </div>`;
    host.querySelectorAll("[data-f]").forEach((inp) => {
      inp.addEventListener("input", () => {
        const key = inp.dataset.f;
        store.updatePlan((p) => {
          const t = p.fixtures.find((q) => q.id === fx.id);
          if (!t) return;
          if (key === "on") t.on = inp.checked;
          else if (key === "name") t.name = inp.value;
          else t[key] = Number(inp.value);
        });
      });
    });
    host.querySelector('[data-act="delete-fx"]').addEventListener("click", () => {
      store.updatePlan((p) => {
        p.fixtures = p.fixtures.filter((q) => q.id !== fx.id);
      });
      this.selectedId = null;
      this.renderFixturePanel();
    });
    host.querySelector('[data-act="dup-fx"]').addEventListener("click", () => {
      const copy = structuredClone(fx);
      copy.id = uid("fx");
      copy.x += 1;
      copy.name = `${fx.name} \u526F\u672C`;
      store.updatePlan((p) => p.fixtures.push(copy));
      this.selectedId = copy.id;
    });
  }
  renderDark() {
    const r = store.lastResult;
    const list = this.querySelector('[data-role="dark-list"]');
    const count = this.querySelector('[data-role="dark-count"]');
    const dark = r?.darkAreas ?? [];
    count.textContent = dark.length ? `(${dark.length})` : "\uFF08\u65E0\uFF09";
    list.innerHTML = dark.length ? dark.map((d) => `<li class="dark-item">
          <b>${d.name}</b>\uFF08${d.kind === "qc" ? "\u8D28\u68C0\u53F0" : "\u901A\u9053"}\uFF09
          \u5E73\u5747 <strong>${fmtLux(d.avgLux)} lux</strong>
          <em>\u4F4E\u4E8E\u9608\u503C ${d.threshold} lux</em>
        </li>`).join("") : '<li class="ok-item">\u2713 \u8D28\u68C0\u53F0 \u2265300lux\u3001\u901A\u9053 \u2265150lux\uFF0C\u65E0\u6697\u533A</li>';
    const table = this.querySelector('[data-role="zone-table"]');
    table.innerHTML = `
      <thead><tr><th>\u533A\u57DF</th><th>\u5E73\u5747</th><th>\u6700\u4F4E</th><th>\u8FBE\u6807\u7387</th></tr></thead>
      <tbody>${(r?.zones ?? []).map((z) => `
        <tr class="${z.dark ? "row-dark" : ""}">
          <td>${z.name}</td>
          <td>${fmtLux(z.avgLux)}</td>
          <td>${fmtLux(z.minLux)}</td>
          <td>${(z.compliance * 100).toFixed(1)}%</td>
        </tr>`).join("")}</tbody>`;
  }
};
function planCsvRows(plan) {
  return plan.fixtures.map((fx) => [
    fx.id,
    fx.name,
    KIND_LABEL[fx.kind],
    fx.x.toFixed(2),
    fx.y.toFixed(2),
    fx.height.toFixed(2),
    fx.flux,
    fx.cct,
    fx.beam,
    fx.on ? "\u542F\u7528" : "\u5173\u95ED",
    fx.aim ? `${fx.aim.x.toFixed(2)},${fx.aim.y.toFixed(2)}` : ""
  ]);
}
var FIXTURE_CSV_HEADER = [
  "\u706F\u5177\u7F16\u53F7",
  "\u540D\u79F0",
  "\u7C7B\u578B",
  "X(m)",
  "Y(m)",
  "\u9AD8\u5EA6(m)",
  "\u5149\u901A\u91CF(lm)",
  "\u8272\u6E29(K)",
  "\u5149\u675F\u89D2(\xB0)",
  "\u72B6\u6001",
  "\u6307\u5411\u70B9"
];

// src/components/dashboard.ts
var Dashboard = class extends HTMLElement {
  connectedCallback() {
    store.subscribe(() => this.render());
    this.render();
  }
  render() {
    const stats = boardStats(store.orders, store.lastResult);
    const kpis = workerKpis(store.orders, store.workers);
    const maxDone = Math.max(1, ...kpis.map((k) => k.completed));
    this.innerHTML = `
      <div class="board-wrap">
        <div class="kpi-row">
          ${this.kpi("\u5DE5\u5355\u603B\u6570", String(stats.totalOrders), "\u5355")}
          ${this.kpi("\u5728\u624B\u5DE5\u5355", String(stats.activeOrders), "\u5355")}
          ${this.kpi("\u4ECA\u65E5\u5408\u683C", String(stats.passedToday), "\u5355")}
          ${this.kpi("\u6574\u4F53\u8FD4\u6D17\u7387", (stats.rewashRateAll * 100).toFixed(1), "%", stats.rewashRateAll > 0.15)}
          ${this.kpi("\u6697\u533A\u6570\u91CF", String(stats.darkAreas.length), "\u5904", stats.darkAreas.length > 0)}
          ${this.kpi("\u5E73\u5747\u7167\u5EA6\u8FBE\u6807\u7387", (stats.avgCompliance * 100).toFixed(1), "%", stats.avgCompliance < 0.85)}
        </div>

        <section class="panel">
          <h3>\u5404\u5E08\u5085\u65E5\u5B8C\u6210\u91CF / \u8FD4\u6D17\u7387</h3>
          <div class="bar-chart">
            ${kpis.map((k) => `
              <div class="bar-row">
                <span class="bar-name">${k.name}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${k.completed / maxDone * 100}%"></div>
                </div>
                <span class="bar-val">${k.completed} \u5355</span>
                <span class="bar-rate ${k.rewashRate > 0.15 ? "bad" : ""}">
                  \u8FD4\u6D17\u7387 ${(k.rewashRate * 100).toFixed(0)}%\uFF08${k.rewashed} \u6B21\uFF09
                </span>
              </div>`).join("")}
          </div>
        </section>

        <section class="panel">
          <h3>\u533A\u57DF\u7167\u5EA6\u8FBE\u6807\u7387\uFF08\u5F53\u524D\u65F6\u6BB5 ${String(store.hour).padStart(2, "0")}:00\uFF09</h3>
          <table class="order-table">
            <thead><tr><th>\u533A\u57DF</th><th>\u5E73\u5747\u7167\u5EA6</th><th>\u9608\u503C</th><th>\u8FBE\u6807\u7387</th><th>\u72B6\u6001</th></tr></thead>
            <tbody>
              ${stats.zoneCompliance.map((z) => `
                <tr>
                  <td>${z.name}</td>
                  <td>${fmtLux(z.avgLux)} lux</td>
                  <td>${z.threshold} lux</td>
                  <td>
                    <div class="mini-track"><div class="mini-fill ${z.compliance < 0.85 ? "low" : ""}"
                      style="width:${(z.compliance * 100).toFixed(1)}%"></div></div>
                    ${(z.compliance * 100).toFixed(1)}%
                  </td>
                  <td>${stats.darkAreas.some((d) => d.name === z.name) ? '<span class="status status-rejected">\u6697\u533A</span>' : '<span class="status status-qc_passed">\u8FBE\u6807</span>'}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h3>\u5BFC\u51FA</h3>
          <div class="export-row">
            <button class="btn btn-primary" data-act="export-plan">\u5BFC\u51FA\u5E03\u5149\u70B9\u4F4D\u8868\uFF08CSV\uFF09</button>
            <button class="btn btn-primary" data-act="export-orders">\u5BFC\u51FA\u5DE5\u5355\u660E\u7EC6\uFF08CSV\uFF09</button>
          </div>
          <p class="hint">\u5E03\u5149\u65B9\u6848\u4E0E\u5DE5\u5355\u5206\u5F00\u5B58\u50A8\uFF0C\u5DE5\u5355\u901A\u8FC7\u300C\u8D28\u68C0\u53F0\u5E03\u5149\u65B9\u6848 ID\u300D\u4E0E\u70B9\u4F4D\u65B9\u6848\u5173\u8054\u3002</p>
        </section>
      </div>`;
    this.querySelector('[data-act="export-plan"]').addEventListener("click", () => {
      const plan = store.activePlan;
      exportCsv(`\u5E03\u5149\u70B9\u4F4D\u8868_${plan.name}.csv`, FIXTURE_CSV_HEADER, planCsvRows(plan));
    });
    this.querySelector('[data-act="export-orders"]').addEventListener("click", () => {
      const header = [
        "\u5DE5\u5355\u53F7",
        "\u9152\u5E97",
        "\u5E03\u8349\u660E\u7EC6",
        "\u603B\u4EF6\u6570",
        "\u53D6\u4EF6\u65F6\u95F4",
        "\u533A\u57DF",
        "\u73ED\u6B21",
        "\u5E08\u5085",
        "\u72B6\u6001",
        "\u6C34\u6E29(\u2103)",
        "\u65F6\u957F(min)",
        "\u6D17\u6DA4\u5242(ml)",
        "\u662F\u5426\u62BD\u67E5",
        "\u8D28\u68C0\u65B9\u6848ID",
        "\u8FD4\u6D17\u6B21\u6570",
        "\u8FD4\u6D17\u539F\u56E0"
      ];
      const rows = store.orders.map((o) => [
        o.id,
        o.hotelName,
        o.items.map((i) => `${i.category}x${i.count}(${i.stain})`).join(";"),
        o.items.reduce((s, i) => s + i.count, 0),
        o.pickupTime.replace("T", " "),
        ZONES.find((z) => z.id === o.zoneId)?.name ?? "",
        o.shift === "day" ? "\u767D\u73ED" : o.shift === "evening" ? "\u665A\u73ED" : "",
        store.workers.find((w) => w.id === o.workerId)?.name ?? "",
        o.status,
        o.wash?.waterTemp ?? "",
        o.wash?.duration ?? "",
        o.wash?.detergentMl ?? "",
        o.qcSampled ? "\u662F" : "\u5426",
        o.qcPlanId ?? "",
        o.rewashes.length,
        o.rewashes.map((r) => r.reason).join(";")
      ]);
      exportCsv(`\u5DE5\u5355\u660E\u7EC6_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`, header, rows);
    });
  }
  kpi(label, value, unit, warn = false) {
    return `
      <div class="kpi-card ${warn ? "warn" : ""}">
        <span class="kpi-label">${label}</span>
        <span class="kpi-value">${value}<small>${unit}</small></span>
      </div>`;
  }
};

// src/components/dispatch-board.ts
var DispatchBoard = class extends HTMLElement {
  filterZone = "all";
  filterShift = "all";
  connectedCallback() {
    store.subscribe(() => this.render());
    this.render();
  }
  render() {
    const pending = store.orders.filter((o) => o.status === "pending");
    const others = store.orders.filter((o) => o.status !== "pending");
    this.innerHTML = `
      <div class="dispatch-wrap">
        <section class="panel">
          <h3>\u5F85\u5206\u6D3E\u5DE5\u5355\uFF08${pending.length}\uFF09</h3>
          <div class="filter-bar">
            <label>\u533A\u57DF
              <select data-role="f-zone">
                <option value="all">\u5168\u90E8</option>
                ${ZONES.map((z) => `<option value="${z.id}" ${this.filterZone === z.id ? "selected" : ""}>${z.name}</option>`).join("")}
              </select>
            </label>
            <label>\u73ED\u6B21
              <select data-role="f-shift">
                <option value="all">\u5168\u90E8</option>
                <option value="day" ${this.filterShift === "day" ? "selected" : ""}>\u767D\u73ED</option>
                <option value="evening" ${this.filterShift === "evening" ? "selected" : ""}>\u665A\u73ED</option>
              </select>
            </label>
          </div>
          ${pending.length === 0 ? '<p class="hint">\u6682\u65E0\u5F85\u5206\u6D3E\u5DE5\u5355</p>' : pending.map((o) => this.orderCard(o)).join("")}
        </section>
        <section class="panel">
          <h3>\u5E08\u5085\u6392\u73ED\u4E0E\u5728\u624B\u5DE5\u5355</h3>
          <div class="worker-grid">
            ${store.workers.map((w) => {
      const mine = store.orders.filter((o) => o.workerId === w.id && ["assigned", "washing", "submitted", "rejected"].includes(o.status));
      return `
                <div class="worker-card">
                  <header><b>${w.name}</b>
                    <span class="tag">${zoneName(w.zoneId)} \xB7 ${w.shift === "day" ? "\u767D\u73ED" : "\u665A\u73ED"}</span>
                  </header>
                  <p class="hint">\u5728\u624B ${mine.length} \u5355 \xB7 ${mine.reduce((s, o) => s + totalPieces(o), 0)} \u4EF6</p>
                  <ul>${mine.map((o) => `<li>${o.id} <em>${STATUS_LABEL[o.status]}</em></li>`).join("") || '<li class="hint">\u7A7A\u95F2</li>'}</ul>
                </div>`;
    }).join("")}
          </div>
        </section>
        <section class="panel">
          <h3>\u5DF2\u5206\u6D3E\u5DE5\u5355\uFF08${others.length}\uFF09</h3>
          <table class="order-table">
            <thead><tr><th>\u5DE5\u5355\u53F7</th><th>\u9152\u5E97</th><th>\u533A\u57DF</th><th>\u73ED\u6B21</th><th>\u5E08\u5085</th><th>\u72B6\u6001</th></tr></thead>
            <tbody>
              ${others.map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${zoneName(o.zoneId)}</td>
                  <td>${o.shift ? SHIFT_LABEL[o.shift].split(" ")[0] : "\u2014"}</td>
                  <td>${store.workers.find((w) => w.id === o.workerId)?.name ?? "\u2014"}</td>
                  <td><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </section>
      </div>`;
    this.querySelector('[data-role="f-zone"]').addEventListener("change", (e) => {
      this.filterZone = e.target.value;
      this.render();
    });
    this.querySelector('[data-role="f-shift"]').addEventListener("change", (e) => {
      this.filterShift = e.target.value;
      this.render();
    });
    this.querySelectorAll('[data-role="assign"]').forEach((sel) => {
      sel.addEventListener("change", () => {
        const order = store.orders.find((o) => o.id === sel.dataset.order);
        if (!order || !sel.value) return;
        const [zoneId, shift, workerId] = sel.value.split("|");
        order.zoneId = zoneId;
        order.shift = shift;
        order.workerId = workerId;
        order.status = "assigned";
        store.upsertOrder(order);
      });
    });
  }
  orderCard(o) {
    const candidates = store.workers.filter((w) => (this.filterZone === "all" || w.zoneId === this.filterZone) && (this.filterShift === "all" || w.shift === this.filterShift));
    return `
      <div class="order-card">
        <div class="oc-head">
          <b>${o.id}</b> <span>${o.hotelName}</span>
          <em>\u53D6\u4EF6 ${o.pickupTime.replace("T", " ")}</em>
        </div>
        <div class="oc-items">
          ${o.items.map((i) => `<span class="linen-tag">${i.category} \xD7${i.count}\uFF08${i.stain}\uFF09</span>`).join("")}
          <span class="linen-tag total">\u5171 ${totalPieces(o)} \u4EF6</span>
        </div>
        <div class="oc-assign">
          <label>\u5206\u6D3E\u7ED9
            <select data-role="assign" data-order="${o.id}">
              <option value="">\u8BF7\u9009\u62E9\u533A\u57DF/\u73ED\u6B21/\u5E08\u5085\u2026</option>
              ${candidates.map((w) => `
                <option value="${w.zoneId}|${w.shift}|${w.id}">
                  ${zoneName(w.zoneId)} \xB7 ${w.shift === "day" ? "\u767D\u73ED" : "\u665A\u73ED"} \xB7 ${w.name}
                </option>`).join("")}
            </select>
          </label>
        </div>
      </div>`;
  }
};

// src/components/front-desk.ts
var CATEGORIES = ["\u5E8A\u5355", "\u88AB\u5957", "\u6795\u5957", "\u6BDB\u5DFE", "\u6D74\u5DFE", "\u53F0\u5E03", "\u5DE5\u670D"];
var STAINS = ["\u4E00\u822C", "\u8840\u6E0D", "\u6CB9\u6E0D", "\u8336\u6E0D", "\u98DF\u7269", "\u9709\u6591"];
var FrontDesk = class extends HTMLElement {
  items = [{ category: "\u5E8A\u5355", count: 50, stain: "\u4E00\u822C" }];
  connectedCallback() {
    this.render();
  }
  render() {
    this.innerHTML = `
      <div class="fd-wrap">
        <section class="panel form-panel">
          <h3>\u9152\u5E97\u9001\u6D17\u5355\u5F55\u5165</h3>
          <div class="form-grid">
            <label>\u9152\u5E97\u540D\u79F0
              <input data-role="hotel" placeholder="\u5982\uFF1A\u9526\u6C5F\u56FD\u9645\u5927\u9152\u5E97" list="hotel-list">
              <datalist id="hotel-list">
                ${[...new Set(store.orders.map((o) => o.hotelName))].map((h) => `<option value="${h}">`).join("")}
              </datalist>
            </label>
            <label>\u53D6\u4EF6\u65F6\u95F4
              <input type="datetime-local" data-role="pickup">
            </label>
          </div>
          <h4>\u5E03\u8349\u660E\u7EC6</h4>
          <table class="item-table" data-role="items"></table>
          <div class="row-actions">
            <button class="btn" data-act="add-item">\uFF0B \u6DFB\u52A0\u54C1\u7C7B</button>
            <span class="hint">\u652F\u6301\u591A\u54C1\u7C7B\uFF1A\u5E8A\u5355/\u88AB\u5957/\u6795\u5957/\u6BDB\u5DFE/\u6D74\u5DFE/\u53F0\u5E03/\u5DE5\u670D</span>
          </div>
          <div class="submit-row">
            <strong>\u5408\u8BA1 <span data-role="total">0</span> \u4EF6</strong>
            <button class="btn btn-primary" data-act="submit">\u751F\u6210\u5DE5\u5355</button>
          </div>
        </section>
        <section class="panel">
          <h3>\u6700\u8FD1\u5F55\u5165\uFF08${store.orders.length}\uFF09</h3>
          <table class="order-table">
            <thead><tr><th>\u5DE5\u5355\u53F7</th><th>\u9152\u5E97</th><th>\u4EF6\u6570</th><th>\u53D6\u4EF6</th><th>\u72B6\u6001</th></tr></thead>
            <tbody>
              ${store.orders.slice(0, 8).map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${o.items.reduce((s, i) => s + i.count, 0)}</td>
                  <td>${o.pickupTime.replace("T", " ")}</td>
                  <td><span class="status status-${o.status}">${statusText(o.status)}</span></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </section>
      </div>`;
    const defaultPickup = /* @__PURE__ */ new Date();
    defaultPickup.setHours(18, 0, 0, 0);
    this.querySelector('[data-role="pickup"]').value = defaultPickup.toISOString().slice(0, 16);
    this.drawItems();
    this.querySelector('[data-act="add-item"]').addEventListener("click", () => {
      this.items.push({ category: "\u6BDB\u5DFE", count: 10, stain: "\u4E00\u822C" });
      this.drawItems();
    });
    this.querySelector('[data-act="submit"]').addEventListener("click", () => this.submit());
  }
  drawItems() {
    const t = this.querySelector('[data-role="items"]');
    t.innerHTML = `
      <thead><tr><th>\u54C1\u7C7B</th><th>\u6570\u91CF</th><th>\u6C61\u6E0D\u7C7B\u578B</th><th></th></tr></thead>
      <tbody>
        ${this.items.map((it, i) => `
          <tr>
            <td><select data-i="${i}" data-f="category">
              ${CATEGORIES.map((c) => `<option ${c === it.category ? "selected" : ""}>${c}</option>`).join("")}
            </select></td>
            <td><input type="number" min="1" value="${it.count}" data-i="${i}" data-f="count"></td>
            <td><select data-i="${i}" data-f="stain">
              ${STAINS.map((s) => `<option ${s === it.stain ? "selected" : ""}>${s}</option>`).join("")}
            </select></td>
            <td><button class="btn btn-danger btn-sm" data-act="del" data-i="${i}">\u5220</button></td>
          </tr>`).join("")}
      </tbody>`;
    t.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener("input", () => {
        const i = Number(el.dataset.i);
        const f2 = el.dataset.f;
        if (f2 === "count") this.items[i].count = Math.max(1, Number(el.value) || 1);
        else if (f2 === "category") this.items[i].category = el.value;
        else this.items[i].stain = el.value;
        this.updateTotal();
      });
    });
    t.querySelectorAll('[data-act="del"]').forEach((b) => {
      b.addEventListener("click", () => {
        this.items.splice(Number(b.dataset.i), 1);
        if (this.items.length === 0) this.items.push({ category: "\u5E8A\u5355", count: 1, stain: "\u4E00\u822C" });
        this.drawItems();
      });
    });
    this.updateTotal();
  }
  updateTotal() {
    const el = this.querySelector('[data-role="total"]');
    if (el) el.textContent = String(this.items.reduce((s, i) => s + i.count, 0));
  }
  submit() {
    const hotel = this.querySelector('[data-role="hotel"]').value.trim();
    const pickup = this.querySelector('[data-role="pickup"]').value;
    if (!hotel) return alert("\u8BF7\u586B\u5199\u9152\u5E97\u540D\u79F0");
    if (!pickup) return alert("\u8BF7\u9009\u62E9\u53D6\u4EF6\u65F6\u95F4");
    if (this.items.some((i) => i.count <= 0)) return alert("\u6570\u91CF\u5FC5\u987B\u5927\u4E8E 0");
    const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 16);
    const order = {
      id: `WO-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "")}-${String(store.orders.length + 1).padStart(3, "0")}`,
      hotelName: hotel,
      items: structuredClone(this.items),
      pickupTime: pickup,
      status: "pending",
      qcSampled: false,
      rewashes: [],
      createdAt: now,
      updatedAt: now
    };
    store.upsertOrder(order);
    this.items = [{ category: "\u5E8A\u5355", count: 50, stain: "\u4E00\u822C" }];
    this.render();
    alert(`\u5DE5\u5355 ${order.id} \u5DF2\u521B\u5EFA\uFF0C\u8BF7\u5230\u300C\u5DE5\u5355\u5206\u6D3E\u300D\u6309\u533A\u57DF\u548C\u73ED\u6B21\u6D3E\u7ED9\u5E08\u5085`);
  }
};
function statusText(s) {
  return {
    pending: "\u5F85\u5206\u6D3E",
    assigned: "\u5DF2\u5206\u6D3E",
    washing: "\u6D17\u6DA4\u4E2D",
    submitted: "\u5F85\u8D28\u68C0",
    qc_passed: "\u5408\u683C",
    rejected: "\u8FD4\u6D17",
    done: "\u5B8C\u6210"
  }[s];
}

// src/components/qc-desk.ts
var QcDesk = class extends HTMLElement {
  connectedCallback() {
    store.subscribe(() => this.render());
    this.render();
  }
  render() {
    const queue = store.orders.filter((o) => o.status === "submitted");
    const history = store.orders.filter((o) => ["qc_passed", "rejected", "done"].includes(o.status)).slice(0, 10);
    this.innerHTML = `
      <div class="qc-wrap">
        <section class="panel">
          <h3>\u5F85\u8D28\u68C0\u5DE5\u5355\uFF08${queue.length}\uFF09</h3>
          <p class="hint">\u89C4\u5219\uFF1A\u6309\u603B\u4EF6\u6570 5% \u62BD\u67E5\uFF08\u5C0F\u5355 \u226420 \u4EF6\u5168\u68C0\uFF09\uFF1B\u4E0D\u5408\u683C\u6253\u56DE\u5E76\u8BB0\u5F55\u8FD4\u6D17\u539F\u56E0\u3002\u8D28\u68C0\u5728\u5173\u8054\u5E03\u5149\u65B9\u6848\u7684\u8D28\u68C0\u53F0\u4E0A\u8FDB\u884C\u3002</p>
          ${queue.length === 0 ? '<p class="hint">\u961F\u5217\u4E3A\u7A7A</p>' : queue.map((o) => this.qcCard(o)).join("")}
        </section>
        <section class="panel">
          <h3>\u8D28\u68C0\u8BB0\u5F55</h3>
          <table class="order-table">
            <thead><tr><th>\u5DE5\u5355</th><th>\u9152\u5E97</th><th>\u62BD\u67E5</th><th>\u8D28\u68C0\u53F0/\u65B9\u6848</th><th>\u7ED3\u679C</th><th>\u8FD4\u6D17\u539F\u56E0</th></tr></thead>
            <tbody>
              ${history.map((o) => `
                <tr>
                  <td>${o.id}</td>
                  <td>${o.hotelName}</td>
                  <td>${o.qcSampled ? `${sampleCount(o)}/${totalPieces(o)}` : "\u2014"}</td>
                  <td>${this.planText(o)}</td>
                  <td><span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span></td>
                  <td>${o.rewashes.at(-1)?.reason ?? "\u2014"}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </section>
      </div>`;
    this.querySelectorAll('[data-act="pass"]').forEach((btn) => {
      btn.addEventListener("click", () => this.pass(btn.dataset.order));
    });
    this.querySelectorAll('[data-act="reject"]').forEach((btn) => {
      btn.addEventListener("click", () => this.reject(btn.dataset.order));
    });
  }
  planText(o) {
    const plan = store.plans.find((p) => p.id === o.qcPlanId);
    const station = QC_STATIONS.find((q) => q.id === plan?.qcStationId);
    if (!plan) return "\u2014";
    const lux = this.stationLux(plan.qcStationId);
    return `${plan.name} / ${station?.name ?? "\u672A\u7ED1\u5B9A"}${lux !== null ? `\uFF08${fmtLux(lux)}lux\uFF09` : ""}`;
  }
  stationLux(stationId) {
    if (!stationId || !store.lastResult) return null;
    const st = QC_STATIONS.find((q) => q.id === stationId);
    if (!st) return null;
    const cx = Math.floor((st.x + st.w / 2) * (store.lastResult.width / FLOOR_W));
    const cy = Math.floor((st.y + st.h / 2) * (store.lastResult.height / FLOOR_H));
    return store.lastResult.lux[cy * store.lastResult.width + cx] ?? null;
  }
  qcCard(o) {
    const n = sampleCount(o);
    const darkWarn = store.lastResult?.darkAreas.some((d) => d.kind === "qc") ?? false;
    return `
      <div class="qc-card">
        <header>
          <b>${o.id}</b> <span>${o.hotelName}</span>
          <span class="tag">\u5E94\u62BD\u67E5 ${n} \u4EF6 / \u5171 ${totalPieces(o)} \u4EF6\uFF085%\uFF09</span>
        </header>
        <div class="qc-photo">
          ${o.wash?.photoDataUrl ? `<img src="${o.wash.photoDataUrl}" alt="\u6D17\u6DA4\u7167\u7247">` : '<span class="hint">\u65E0\u7167\u7247</span>'}
          <div class="wash-meta">
            <p>\u6C34\u6E29 <b>${o.wash?.waterTemp}\u2103</b> \xB7 \u65F6\u957F <b>${o.wash?.duration}min</b> \xB7 \u6D17\u6DA4\u5242 <b>${o.wash?.detergentMl}ml</b></p>
            <p class="hint">\u63D0\u4EA4\u4E8E ${o.wash?.submittedAt.replace("T", " ")}</p>
          </div>
        </div>
        <div class="qc-form">
          <label>\u8D28\u68C0\u6240\u7528\u5E03\u5149\u65B9\u6848\uFF08\u5173\u8054\u8D28\u68C0\u53F0\uFF09
            <select data-role="plan" data-order="${o.id}">
              ${store.plans.map((p) => {
      const st = QC_STATIONS.find((q) => q.id === p.qcStationId);
      const lux = this.stationLux(p.qcStationId);
      return `<option value="${p.id}" ${p.id === store.activePlanId ? "selected" : ""}>
                  ${p.name} \u2014 ${st?.name ?? "\u672A\u7ED1\u5B9A\u8D28\u68C0\u53F0"}${lux !== null ? ` \xB7 ${fmtLux(lux)}lux` : ""}
                </option>`;
    }).join("")}
            </select>
          </label>
          ${darkWarn ? '<p class="warn">\u26A0 \u5F53\u524D\u65B9\u6848\u5B58\u5728\u4F4E\u4E8E 300lux \u7684\u8D28\u68C0\u6697\u533A\uFF0C\u8BF7\u6CE8\u610F\u8865\u5149\u540E\u518D\u68C0</p>' : ""}
          <div class="qc-buttons">
            <button class="btn btn-primary" data-act="pass" data-order="${o.id}">\u2713 \u62BD\u68C0\u5408\u683C</button>
            <button class="btn btn-danger" data-act="reject" data-order="${o.id}">\u2715 \u4E0D\u5408\u683C\u6253\u56DE</button>
          </div>
        </div>
      </div>`;
  }
  pass(orderId) {
    const order = store.orders.find((o) => o.id === orderId);
    const planSel = this.querySelector(`[data-role="plan"][data-order="${orderId}"]`);
    order.qcSampled = true;
    order.qcPlanId = planSel?.value;
    order.status = order.rewashes.length > 0 ? "done" : "qc_passed";
    store.upsertOrder(order);
  }
  reject(orderId) {
    const reason = prompt("\u8BF7\u586B\u5199\u8FD4\u6D17\u539F\u56E0\uFF08\u6C61\u6E0D\u6B8B\u7559 / \u7834\u635F / \u5F02\u5473 / \u5176\u4ED6\uFF09", "\u6C61\u6E0D\u6B8B\u7559");
    if (!reason) return;
    const order = store.orders.find((o) => o.id === orderId);
    const planSel = this.querySelector(`[data-role="plan"][data-order="${orderId}"]`);
    order.qcSampled = true;
    order.qcPlanId = planSel?.value;
    order.status = "rejected";
    order.rewashes.push({ reason, at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 16) });
    store.upsertOrder(order);
  }
};

// src/components/wash-desk.ts
var WashDesk = class extends HTMLElement {
  workerId = store.workers[0]?.id ?? "";
  photo = "";
  stream = null;
  videoEl = null;
  connectedCallback() {
    store.subscribe(() => this.render());
    this.render();
  }
  disconnectedCallback() {
    this.stopCamera();
  }
  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  myOrders() {
    return store.orders.filter((o) => o.workerId === this.workerId && (o.status === "assigned" || o.status === "washing" || o.status === "rejected"));
  }
  render() {
    const list = this.myOrders();
    this.innerHTML = `
      <div class="wash-wrap">
        <section class="panel">
          <h3>\u5E08\u5085\u767B\u5F55</h3>
          <label>\u9009\u62E9\u5E08\u5085
            <select data-role="worker">
              ${store.workers.map((w) => `<option value="${w.id}" ${w.id === this.workerId ? "selected" : ""}>${w.name}</option>`).join("")}
            </select>
          </label>
        </section>
        <section class="panel">
          <h3>\u6211\u7684\u6D17\u6DA4\u4EFB\u52A1\uFF08${list.length}\uFF09</h3>
          ${list.length === 0 ? '<p class="hint">\u5F53\u524D\u6CA1\u6709\u5F85\u6D17\u5DE5\u5355</p>' : list.map((o) => `
            <div class="wash-card" data-order="${o.id}">
              <header>
                <b>${o.id}</b> <span>${o.hotelName}</span>
                <span class="status status-${o.status}">${STATUS_LABEL[o.status]}</span>
                ${o.rewashes.length ? `<span class="rewash-badge">\u8FD4\u6D17 \xD7${o.rewashes.length}</span>` : ""}
              </header>
              <p class="hint">${o.items.map((i) => `${i.category}\xD7${i.count}\uFF08${i.stain}\uFF09`).join("\uFF0C")} \xB7 \u5171 ${totalPieces(o)} \u4EF6</p>
              ${o.rewashes.length ? `<p class="rewash-reason">\u4E0A\u6B21\u8FD4\u6D17\u539F\u56E0\uFF1A${o.rewashes[o.rewashes.length - 1].reason}</p>` : ""}
              <div class="wash-actions">
                ${o.status === "assigned" || o.status === "rejected" ? '<button class="btn btn-primary" data-act="start">\u5F00\u59CB\u6D17\u6DA4</button>' : '<button class="btn btn-primary" data-act="submit-open">\u6D17\u5B8C\u63D0\u4EA4</button>'}
              </div>
            </div>`).join("")}
        </section>
      </div>`;
    this.querySelector('[data-role="worker"]').addEventListener("change", (e) => {
      this.workerId = e.target.value;
      this.render();
    });
    this.querySelectorAll('[data-act="start"]').forEach((b) => {
      b.addEventListener("click", () => {
        const order = this.findOrder(b);
        order.status = "washing";
        store.upsertOrder(order);
      });
    });
    this.querySelectorAll('[data-act="submit-open"]').forEach((b) => {
      b.addEventListener("click", () => this.openSubmit(this.findOrder(b)));
    });
  }
  findOrder(b) {
    const id = b.closest(".wash-card").dataset.order;
    return store.orders.find((o) => o.id === id);
  }
  openSubmit(order) {
    const modal = document.createElement("div");
    modal.className = "modal-mask";
    modal.innerHTML = `
      <div class="modal">
        <h3>\u6D17\u6DA4\u63D0\u4EA4 \u2014 ${order.id}</h3>
        <div class="camera-box">
          <video data-role="video" autoplay playsinline class="${this.photo ? "hidden" : ""}"></video>
          <img data-role="preview" class="${this.photo ? "" : "hidden"}" src="${this.photo}">
          <div class="camera-actions">
            <button class="btn" data-cam="on">\u5F00\u542F\u6444\u50CF\u5934</button>
            <button class="btn" data-cam="shot" disabled>\u62CD\u7167</button>
            <label class="btn">\u4E0A\u4F20\u7167\u7247<input type="file" accept="image/*" data-cam="file" hidden></label>
          </div>
        </div>
        <div class="form-grid">
          <label>\u6C34\u6E29 (\u2103)
            <input type="number" min="20" max="100" value="70" data-role="temp">
          </label>
          <label>\u6D17\u6DA4\u65F6\u957F (min)
            <input type="number" min="5" max="180" value="45" data-role="duration">
          </label>
          <label>\u6D17\u6DA4\u5242\u7528\u91CF (ml)
            <input type="number" min="10" max="2000" value="150" data-role="detergent">
          </label>
        </div>
        <p class="hint" data-role="photo-hint">${this.photo ? "\u2713 \u5DF2\u62CD\u6444/\u4E0A\u4F20\u7167\u7247" : "\u8BF7\u62CD\u7167\u6216\u4E0A\u4F20\u6D17\u6DA4\u540E\u7167\u7247"}</p>
        <div class="modal-actions">
          <button class="btn" data-act="cancel">\u53D6\u6D88</button>
          <button class="btn btn-primary" data-act="confirm">\u63D0\u4EA4\u8D28\u68C0</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const video = modal.querySelector('[data-role="video"]');
    const preview = modal.querySelector('[data-role="preview"]');
    this.videoEl = video;
    modal.querySelector('[data-cam="on"]').addEventListener("click", async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = this.stream;
        modal.querySelector('[data-cam="shot"]').disabled = false;
      } catch {
        alert("\u65E0\u6CD5\u8BBF\u95EE\u6444\u50CF\u5934\uFF08\u53EF\u7528\u300C\u4E0A\u4F20\u7167\u7247\u300D\u4EE3\u66FF\uFF09");
      }
    });
    modal.querySelector('[data-cam="shot"]').addEventListener("click", () => {
      const cv = document.createElement("canvas");
      const vw = video.videoWidth || 640;
      const scale = Math.min(1, 640 / vw);
      cv.width = vw * scale;
      cv.height = (video.videoHeight || 480) * scale;
      cv.getContext("2d").drawImage(video, 0, 0, cv.width, cv.height);
      this.photo = cv.toDataURL("image/jpeg", 0.7);
      preview.src = this.photo;
      preview.classList.remove("hidden");
      video.classList.add("hidden");
      modal.querySelector('[data-role="photo-hint"]').textContent = "\u2713 \u5DF2\u62CD\u7167";
      this.stopCamera();
    });
    modal.querySelector('[data-cam="file"]').addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas");
        const scale = Math.min(1, 640 / img.width);
        cv.width = img.width * scale;
        cv.height = img.height * scale;
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        this.photo = cv.toDataURL("image/jpeg", 0.7);
        preview.src = this.photo;
        preview.classList.remove("hidden");
        video.classList.add("hidden");
        modal.querySelector('[data-role="photo-hint"]').textContent = "\u2713 \u5DF2\u4E0A\u4F20\u7167\u7247";
      };
      img.src = URL.createObjectURL(file);
    });
    modal.querySelector('[data-act="cancel"]').addEventListener("click", () => {
      this.stopCamera();
      modal.remove();
    });
    modal.querySelector('[data-act="confirm"]').addEventListener("click", () => {
      if (!this.photo) return alert("\u8BF7\u5148\u62CD\u7167\u6216\u4E0A\u4F20\u7167\u7247");
      const temp = Number(modal.querySelector('[data-role="temp"]').value);
      const duration = Number(modal.querySelector('[data-role="duration"]').value);
      const detergentMl = Number(modal.querySelector('[data-role="detergent"]').value);
      if (!(temp >= 20 && duration >= 5 && detergentMl >= 10)) return alert("\u8BF7\u68C0\u67E5\u6D17\u6DA4\u53C2\u6570");
      order.status = "submitted";
      order.wash = {
        waterTemp: temp,
        duration,
        detergentMl,
        photoDataUrl: this.photo,
        submittedAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 16)
      };
      store.upsertOrder(order);
      this.photo = "";
      this.stopCamera();
      modal.remove();
    });
  }
};

// src/main.ts
customElements.define("lighting-studio", LightingStudio);
customElements.define("front-desk", FrontDesk);
customElements.define("dispatch-board", DispatchBoard);
customElements.define("wash-desk", WashDesk);
customElements.define("qc-desk", QcDesk);
customElements.define("app-dashboard", Dashboard);
var TABS = [
  { id: "studio", label: "\u7167\u660E\u5E03\u5149", tag: "lighting-studio" },
  { id: "front", label: "\u524D\u53F0\u63A5\u5355", tag: "front-desk" },
  { id: "dispatch", label: "\u5DE5\u5355\u5206\u6D3E", tag: "dispatch-board" },
  { id: "wash", label: "\u6D17\u6DA4\u5DE5\u4F4D", tag: "wash-desk" },
  { id: "qc", label: "\u8D28\u68C0\u53F0", tag: "qc-desk" },
  { id: "board", label: "\u770B\u677F\u7EDF\u8BA1", tag: "app-dashboard" }
];
function mount(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  const host = document.querySelector('[data-role="view"]');
  host.innerHTML = `<${tab.tag}></${tab.tag}>`;
  document.querySelectorAll("[data-tab]").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tabId);
  });
  localStorage.setItem("llw.tab", tabId);
}
function boot() {
  store.init();
  const nav = document.querySelector('[data-role="nav"]');
  nav.innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}">${t.label}</button>`).join("");
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) mount(btn.dataset.tab);
  });
  mount(localStorage.getItem("llw.tab") ?? "studio");
}
boot();
//# sourceMappingURL=main.js.map
