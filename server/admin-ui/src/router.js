import { createRouter, createWebHistory } from 'vue-router'
import { checkAuth } from './api.js'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('./views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: () => import('./views/Layout.vue'),
    children: [
      { path: '', name: 'Dashboard', component: () => import('./views/Dashboard.vue') },
      { path: 'poi', name: 'PoiList', component: () => import('./views/PoiList.vue') },
      { path: 'review', name: 'ReviewList', component: () => import('./views/ReviewList.vue') },
      { path: 'article', name: 'ArticleList', component: () => import('./views/ArticleList.vue') },
      { path: 'source', name: 'SourceList', component: () => import('./views/SourceList.vue') },
    ],
  },
]

const router = createRouter({
  history: createWebHistory('/manage/'),
  routes,
})

router.beforeEach(async (to, from, next) => {
  if (to.meta.public) {
    next()
    return
  }
  try {
    await checkAuth()
    next()
  } catch {
    next('/login')
  }
})

export default router
