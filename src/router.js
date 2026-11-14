import { createRouter, createWebHashHistory } from 'vue-router'

import ApplyView from './views/ApplyView.vue'
import SimulateView from './views/SimulateView.vue'
import StationsView from './views/StationsView.vue'
import DispatchView from './views/DispatchView.vue'
import FieldView from './views/FieldView.vue'
import QcView from './views/QcView.vue'
import BoardView from './views/BoardView.vue'

export const navGroups = [
  {
    title: '前期规划',
    items: [
      { path: '/apply', idx: '01', name: '新建申请', sub: '线路走向 · 参数立项', role: '运营' },
      { path: '/simulate', idx: '02', name: '三维推演', sub: '种子街区 · 立面编辑', role: '运营' },
      { path: '/stations', idx: '03', name: '站点编排', sub: '站距校验 · 候选站', role: '运营' }
    ]
  },
  {
    title: '建设执行',
    items: [
      { path: '/dispatch', idx: '04', name: '工单分派', sub: '片区 · 施工员', role: '主管' },
      { path: '/field', idx: '05', name: '现场施工', sub: '尺寸 · 朝向 · 照片', role: '施工员' },
      { path: '/qc', idx: '06', name: '质量抽检', sub: '验收标准 · 返工', role: '质检' }
    ]
  },
  {
    title: '复盘监管',
    items: [
      { path: '/board', idx: '07', name: '主管看板', sub: '完成量 · 返工率 · 线路总览', role: '主管' }
    ]
  }
]

const routes = [
  { path: '/', redirect: '/simulate' },
  { path: '/apply', component: ApplyView, meta: { title: '新建站台申请', crumb: '前期规划 / 新建申请' } },
  { path: '/simulate', component: SimulateView, meta: { title: '三维街区推演', crumb: '前期规划 / 三维推演' } },
  { path: '/stations', component: StationsView, meta: { title: '候选站点编排', crumb: '前期规划 / 站点编排' } },
  { path: '/dispatch', component: DispatchView, meta: { title: '工单片区派工', crumb: '建设执行 / 工单分派' } },
  { path: '/field', component: FieldView, meta: { title: '施工员作业台', crumb: '建设执行 / 现场施工' } },
  { path: '/qc', component: QcView, meta: { title: '质检验收抽检', crumb: '建设执行 / 质量抽检' } },
  { path: '/board', component: BoardView, meta: { title: '主管看板与线路总览', crumb: '复盘监管 / 主管看板' } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
