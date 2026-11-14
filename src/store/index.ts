// ============ 全局数据仓库（工作流 + 版本 + 统计） ============
import { defineStore } from 'pinia'
import { loadTable, saveTable, uid } from '@/db/storage'
import {
  RETURN_REASONS,
  TODAY,
  seedAirspace,
  seedAnomalies,
  seedCustomers,
  seedOrders,
  seedProjects,
  seedReceipts,
  seedRehearsals,
  seedSchedules,
  seedScripts,
  seedUsers,
  seedVersions
} from '@/db/seed'
import type {
  AnomalyReport,
  AirspaceFiling,
  Customer,
  DraftStatus,
  ExecutionReceipt,
  Order,
  Project,
  Rehearsal,
  Schedule,
  ShowScript,
  User,
  VersionRecord
} from '@/types'
import { runSafetyCheck } from '@/lib/script'
import type { SafetyReport } from '@/lib/script'

interface State {
  booted: boolean
  users: User[]
  currentUserId: string | null
  customers: Customer[]
  orders: Order[]
  projects: Project[]
  airspace: AirspaceFiling[]
  scripts: ShowScript[]
  versions: VersionRecord[]
  schedules: Schedule[]
  rehearsals: Rehearsal[]
  receipts: ExecutionReceipt[]
  anomalies: AnomalyReport[]
  safetyCache: Record<string, SafetyReport>
}

function persist(s: State): void {
  saveTable('users', s.users)
  saveTable('customers', s.customers)
  saveTable('orders', s.orders)
  saveTable('projects', s.projects)
  saveTable('airspace', s.airspace)
  saveTable('scripts', s.scripts)
  saveTable('versions', s.versions)
  saveTable('schedules', s.schedules)
  saveTable('rehearsals', s.rehearsals)
  saveTable('receipts', s.receipts)
  saveTable('anomalies', s.anomalies)
  saveTable('currentUserId', s.currentUserId)
}

export const useStore = defineStore('main', {
  state: (): State => ({
    booted: false,
    users: [],
    currentUserId: null,
    customers: [],
    orders: [],
    projects: [],
    airspace: [],
    scripts: [],
    versions: [],
    schedules: [],
    rehearsals: [],
    receipts: [],
    anomalies: [],
    safetyCache: {}
  }),

  getters: {
    currentUser(state): User | null {
      return state.users.find((u) => u.id === state.currentUserId) ?? null
    },
    customerName(state): (id: string) => string {
      return (id: string) => state.customers.find((c) => c.id === id)?.name ?? '—'
    },
    userName(state): (id: string) => string {
      return (id: string) => state.users.find((u) => u.id === id)?.name ?? '—'
    },
    scriptOf(state): (projectId: string) => ShowScript | undefined {
      return (projectId: string) => state.scripts.find((s) => s.projectId === projectId)
    },
    projectOf(state): (id: string) => Project | undefined {
      return (id: string) => state.projects.find((p) => p.id === id)
    },
    orderOf(state): (id: string) => Order | undefined {
      return (id: string) => state.orders.find((o) => o.id === id)
    },
    versionsOf(state): (projectId: string) => VersionRecord[] {
      return (projectId: string) =>
        state.versions.filter((v) => v.projectId === projectId).sort((a, b) => b.version - a.version)
    },
    airspaceOf(state): (projectId: string) => AirspaceFiling | undefined {
      return (projectId: string) => state.airspace.find((a) => a.projectId === projectId)
    },
    /** 策划工作负荷统计 */
    plannerWorkload(state): { plannerId: string; plannerName: string; inProgress: number; overdue: number }[] {
      return state.users
        .filter((u) => u.role === 'planner')
        .map((u) => {
          const mine = state.projects.filter((p) => p.plannerId === u.id)
          const inProgress = mine.filter((p) => p.status === 'in_progress' || p.status === 'returned').length
          const overdue = mine.filter(
            (p) =>
              (p.status === 'in_progress' || p.status === 'returned') &&
              p.deadline < TODAY
          ).length
          return { plannerId: u.id, plannerName: u.name, inProgress, overdue }
        })
    }
  },

  actions: {
    boot() {
      if (this.booted) return
      this.users = loadTable('users', seedUsers)
      this.customers = loadTable('customers', seedCustomers)
      this.orders = loadTable('orders', seedOrders)
      this.projects = loadTable('projects', seedProjects)
      this.airspace = loadTable('airspace', seedAirspace)
      this.scripts = loadTable('scripts', seedScripts)
      this.versions = loadTable('versions', seedVersions)
      this.schedules = loadTable('schedules', seedSchedules)
      this.rehearsals = loadTable('rehearsals', seedRehearsals)
      this.receipts = loadTable('receipts', seedReceipts)
      this.anomalies = loadTable('anomalies', seedAnomalies)
      this.currentUserId = loadTable<string | null>('currentUserId', null)
      this.booted = true
    },
    resetAll() {
      Object.entries(localStorage)
        .filter(([k]) => k.startsWith('droneshow:'))
        .forEach(([k]) => localStorage.removeItem(k))
      this.booted = false
      this.safetyCache = {}
      this.boot()
    },
    save() {
      persist(this)
    },

    // ---- 认证 ----
    login(username: string, password: string): User | null {
      const u = this.users.find((x) => x.username === username && x.password === password)
      if (u) {
        this.currentUserId = u.id
        saveTable('currentUserId', u.id)
      }
      return u ?? null
    },
    logout() {
      this.currentUserId = null
      saveTable('currentUserId', null)
    },

    // ---- 客户 / 订单 ----
    saveCustomer(c: Customer) {
      const i = this.customers.findIndex((x) => x.id === c.id)
      if (i >= 0) this.customers[i] = c
      else this.customers.push({ ...c, id: c.id || uid('c'), createdAt: c.createdAt || new Date().toISOString() })
      this.save()
    },
    saveOrder(o: Order) {
      const i = this.orders.findIndex((x) => x.id === o.id)
      if (i >= 0) this.orders[i] = o
      else this.orders.push({ ...o, id: o.id || uid('o'), createdAt: o.createdAt || new Date().toISOString() })
      this.save()
    },

    // ---- 项目立项 ----
    createProject(input: { orderId: string; plannerId: string; deadline: string }): Project {
      const order = this.orders.find((o) => o.id === input.orderId)!
      const project: Project = {
        id: uid('p'),
        projectNo: 'PRJ-' + String(this.projects.length + 1).padStart(3, '0'),
        orderId: order.id,
        title: order.title,
        plannerId: input.plannerId,
        droneCount: order.droneCount,
        showDate: order.showDate,
        deadline: input.deadline,
        status: 'in_progress',
        venue: order.venue,
        createdAt: new Date().toISOString()
      }
      this.projects.push(project)
      this.airspace.push({
        id: uid('a'), projectId: project.id, stage: 'not_started', applyNo: '',
        airspace: `${order.venue}半径 300m 空域`, ceilingM: 120,
        submittedAt: '', updatedAt: '', note: ''
      })
      this.save()
      return project
    },

    // ---- 脚本编辑（直接持久化；提交时才产生版本快照） ----
    saveScript(script: ShowScript) {
      const i = this.scripts.findIndex((s) => s.id === script.id)
      if (i >= 0) this.scripts[i] = JSON.parse(JSON.stringify(script))
      else this.scripts.push(JSON.parse(JSON.stringify(script)))
      delete this.safetyCache[script.projectId]
      this.save()
    },

    // ---- 安全校验（带缓存，脚本变更即失效） ----
    checkSafety(projectId: string): SafetyReport | null {
      const script = this.scriptOf(projectId)
      if (!script) return null
      const report = runSafetyCheck(script)
      this.safetyCache[projectId] = report
      return report
    },

    // ---- 提交：生成版本 ----
    submitScript(projectId: string, comment: string): { ok: boolean; error?: string } {
      const user = this.currentUser
      const project = this.projects.find((p) => p.id === projectId)
      const script = this.scriptOf(projectId)
      if (!user || !project || !script) return { ok: false, error: '数据缺失' }
      if (user.role !== 'planner') return { ok: false, error: '只有策划可以提交稿件' }
      const report = this.checkSafety(projectId)
      if (report && !report.ok) {
        return { ok: false, error: `安全校验未通过：${report.firstViolator?.message ?? '存在超限项'}，请修改后再提交` }
      }
      const ver = this.versions.filter((v) => v.projectId === projectId).reduce((m, v) => Math.max(m, v.version), 0) + 1
      this.versions.push({
        id: uid('v'), projectId, version: ver, action: 'submit',
        operatorId: user.id, operatorName: user.name, at: new Date().toISOString(),
        comment, snapshot: JSON.parse(JSON.stringify(script))
      })
      project.status = 'submitted'
      this.save()
      return { ok: true }
    },

    // ---- 退回：原因必须来自下拉 ----
    returnScript(projectId: string, reason: string, comment: string, by: 'customer' | 'supervisor'): { ok: boolean; error?: string } {
      const user = this.currentUser
      const project = this.projects.find((p) => p.id === projectId)
      if (!user || !project) return { ok: false, error: '数据缺失' }
      if (user.role !== 'admin') return { ok: false, error: '只有后台主管可以执行退回' }
      if (!RETURN_REASONS.includes(reason)) return { ok: false, error: '退回原因必须从下拉列表选择' }
      if (project.status !== 'submitted') return { ok: false, error: '只有待审稿件可以退回' }
      const ver = this.versions.filter((v) => v.projectId === projectId).reduce((m, v) => Math.max(m, v.version), 0) + 1
      this.versions.push({
        id: uid('v'), projectId, version: ver, action: 'return',
        operatorId: user.id, operatorName: user.name, at: new Date().toISOString(),
        comment, returnReason: reason, returnBy: by, snapshot: null
      })
      project.status = 'returned'
      this.save()
      return { ok: true }
    },

    // ---- 审核通过 ----
    approveScript(projectId: string, comment: string): { ok: boolean; error?: string } {
      const user = this.currentUser
      const project = this.projects.find((p) => p.id === projectId)
      if (!user || !project) return { ok: false, error: '数据缺失' }
      if (user.role !== 'admin') return { ok: false, error: '只有后台主管可以审核' }
      if (project.status !== 'submitted') return { ok: false, error: '只有待审稿件可以审核通过' }
      const ver = this.versions.filter((v) => v.projectId === projectId).reduce((m, v) => Math.max(m, v.version), 0) + 1
      this.versions.push({
        id: uid('v'), projectId, version: ver, action: 'approve',
        operatorId: user.id, operatorName: user.name, at: new Date().toISOString(),
        comment, snapshot: null
      })
      project.status = 'approved'
      this.save()
      return { ok: true }
    },

    // ---- 空域申报 ----
    saveAirspace(f: AirspaceFiling) {
      const i = this.airspace.findIndex((x) => x.id === f.id)
      const next = { ...f, updatedAt: new Date().toISOString() }
      if (i >= 0) this.airspace[i] = next
      else this.airspace.push(next)
      this.save()
    },

    // ---- 排期 ----
    saveSchedule(sc: Schedule) {
      const i = this.schedules.findIndex((x) => x.id === sc.id)
      if (i >= 0) this.schedules[i] = sc
      else this.schedules.push({ ...sc, id: sc.id || uid('sc') })
      this.save()
    },

    // ---- 飞手：确认执行（不可改稿） ----
    confirmSchedule(scheduleId: string): { ok: boolean; error?: string } {
      const user = this.currentUser
      const sc = this.schedules.find((x) => x.id === scheduleId)
      if (!user || !sc) return { ok: false, error: '数据缺失' }
      if (user.role !== 'pilot' || sc.pilotId !== user.id) return { ok: false, error: '只有该场飞手可以确认' }
      if (sc.status !== 'scheduled') return { ok: false, error: '当前状态不可确认' }
      sc.status = 'confirmed'
      this.save()
      return { ok: true }
    },
    startSchedule(scheduleId: string) {
      const sc = this.schedules.find((x) => x.id === scheduleId)
      if (sc && sc.status === 'confirmed') {
        sc.status = 'executing'
        this.save()
      }
    },
    reportAnomaly(input: Omit<AnomalyReport, 'id' | 'at' | 'handled' | 'pilotId'>) {
      const user = this.currentUser
      if (!user) return
      this.anomalies.push({
        ...input,
        id: uid('an'),
        pilotId: user.id,
        at: new Date().toISOString(),
        handled: false
      })
      this.save()
    },

    // ---- 彩排 ----
    saveRehearsal(r: Rehearsal) {
      const i = this.rehearsals.findIndex((x) => x.id === r.id)
      if (i >= 0) this.rehearsals[i] = r
      else this.rehearsals.push({ ...r, id: r.id || uid('r'), at: r.at || new Date().toISOString() })
      this.save()
    },

    // ---- 执行回执：按场次统计 ----
    finishSchedule(scheduleId: string, receipt: Omit<ExecutionReceipt, 'id' | 'operatorId'>): { ok: boolean; error?: string } {
      const user = this.currentUser
      const sc = this.schedules.find((x) => x.id === scheduleId)
      const project = sc ? this.projects.find((p) => p.id === sc.projectId) : undefined
      if (!user || !sc || !project) return { ok: false, error: '数据缺失' }
      if (user.role !== 'pilot' || sc.pilotId !== user.id) return { ok: false, error: '只有该场飞手可以回执' }
      const anomalyCount = this.anomalies.filter((a) => a.scheduleId === scheduleId).length
      const finalReceipt: ExecutionReceipt = {
        ...receipt,
        id: uid('rc'),
        operatorId: user.id,
        anomalyCount: receipt.anomalyCount ?? anomalyCount
      }
      this.receipts.push(finalReceipt)
      sc.status = 'aborted' in receipt && (receipt as unknown as { aborted?: boolean }).aborted ? 'aborted' : 'done'
      project.status = 'completed'
      const ver = this.versions.filter((v) => v.projectId === project.id).reduce((m, v) => Math.max(m, v.version), 0) + 1
      this.versions.push({
        id: uid('v'), projectId: project.id, version: ver, action: 'complete',
        operatorId: user.id, operatorName: user.name, at: new Date().toISOString(),
        comment: `执行回执：架次 ${finalReceipt.sorties}，用机 ${finalReceipt.flightMinutes} 分钟，异常 ${finalReceipt.anomalyCount} 次`,
        snapshot: null
      })
      this.save()
      return { ok: true }
    },

    handleAnomaly(id: string) {
      const a = this.anomalies.find((x) => x.id === id)
      if (a) {
        a.handled = true
        this.save()
      }
    },

    // ---- 场次统计 ----
    statsByProject(projectId: string) {
      const list = this.receipts.filter((r) => r.projectId === projectId)
      return {
        sessions: list.length,
        sorties: list.reduce((s, r) => s + r.sorties, 0),
        flightMinutes: list.reduce((s, r) => s + r.flightMinutes, 0),
        anomalies: list.reduce((s, r) => s + r.anomalyCount, 0)
      }
    },

    setProjectStatus(id: string, status: DraftStatus) {
      const p = this.projects.find((x) => x.id === id)
      if (p) {
        p.status = status
        this.save()
      }
    }
  }
})
