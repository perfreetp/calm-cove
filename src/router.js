import { createRouter, createWebHashHistory } from 'vue-router'
import Dashboard from './views/Dashboard.vue'
import ProjectList from './views/ProjectList.vue'
import Editor from './views/Editor.vue'
import Review from './views/Review.vue'
import Diff from './views/Diff.vue'
import History from './views/History.vue'

const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/projects', name: 'projects', component: ProjectList },
  { path: '/editor/:id', name: 'editor', component: Editor, props: true },
  { path: '/review/:id', name: 'review', component: Review, props: true },
  { path: '/diff/:id', name: 'diff', component: Diff, props: true },
  { path: '/history/:id', name: 'history', component: History, props: true }
]

export default createRouter({
  history: createWebHashHistory(),
  routes
})
