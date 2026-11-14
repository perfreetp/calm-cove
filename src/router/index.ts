// ============ 路由与角色守卫 ============
import { createRouter, createWebHashHistory } from 'vue-router'
import { useStore } from '@/store'
import type { Role } from '@/types'

const routes = [
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/workbench' },
      { path: 'workbench', name: 'workbench', component: () => import('@/views/WorkbenchView.vue') },
      // 策划
      { path: 'planner/projects', name: 'planner-projects', component: () => import('@/views/planner/ProjectListView.vue'), meta: { roles: ['planner', 'admin'] } },
      { path: 'planner/editor/:projectId', name: 'editor', component: () => import('@/views/planner/EditorView.vue'), meta: { roles: ['planner'] } },
      // 飞手
      { path: 'pilot/schedule', name: 'pilot-schedule', component: () => import('@/views/pilot/PilotScheduleView.vue'), meta: { roles: ['pilot'] } },
      // 后台
      { path: 'admin/customers', name: 'admin-customers', component: () => import('@/views/admin/CustomerOrderView.vue'), meta: { roles: ['admin'] } },
      { path: 'admin/projects', name: 'admin-projects', component: () => import('@/views/admin/ProjectReviewView.vue'), meta: { roles: ['admin'] } },
      { path: 'admin/airspace', name: 'admin-airspace', component: () => import('@/views/admin/AirspaceView.vue'), meta: { roles: ['admin'] } },
      { path: 'admin/rehearsal', name: 'admin-rehearsal', component: () => import('@/views/admin/RehearsalView.vue'), meta: { roles: ['admin'] } },
      { path: 'admin/receipt', name: 'admin-receipt', component: () => import('@/views/admin/ReceiptView.vue'), meta: { roles: ['admin'] } },
      { path: 'admin/stats', name: 'admin-stats', component: () => import('@/views/admin/StatsView.vue'), meta: { roles: ['admin'] } }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({ history: createWebHashHistory(), routes })

router.beforeEach((to) => {
  const store = useStore()
  store.boot()
  if (to.meta.public) return true
  if (!store.currentUser) return { name: 'login' }
  const roles = to.meta.roles as Role[] | undefined
  if (roles && store.currentUser && !roles.includes(store.currentUser.role)) {
    return { name: 'workbench' }
  }
  return true
})

export default router
