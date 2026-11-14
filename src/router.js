import { createRouter, createWebHashHistory } from 'vue-router'
import ProjectsView from './views/ProjectsView.vue'
import ProjectDetailView from './views/ProjectDetailView.vue'
import TasksView from './views/TasksView.vue'
import EditorView from './views/EditorView.vue'
import ReviewView from './views/ReviewView.vue'
import CompareView from './views/CompareView.vue'
import DeliveryView from './views/DeliveryView.vue'
import DashboardView from './views/DashboardView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', component: ProjectsView },          // 1 项目列表 / 客户下单
    { path: '/projects/:id', component: ProjectDetailView }, // 2 项目详情（房间与任务）
    { path: '/tasks', component: TasksView },                // 3 任务大厅（领取）
    { path: '/editor/:taskId', component: EditorView },      // 4 体素建模器
    { path: '/review', component: ReviewView },              // 5 主管审核
    { path: '/compare', component: CompareView },            // 6 历史版本比对
    { path: '/delivery', component: DeliveryView },          // 7 交付中心 / 客户视图
    { path: '/dashboard', component: DashboardView }         // 8 工作台
  ]
})
