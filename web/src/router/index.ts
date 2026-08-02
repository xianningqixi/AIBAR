import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior: () => ({ top: 0 }),
  routes: [
    {
      path: '/',
      redirect: '/browse',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { public: true, publicOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/pages/RegisterPage.vue'),
      meta: { public: true, publicOnly: true },
    },
    {
      path: '/browse',
      name: 'browse',
      component: () => import('@/pages/BrowsePage.vue'),
    },
    {
      path: '/create',
      name: 'create',
      component: () => import('@/pages/CreatePage.vue'),
    },
    {
      path: '/hub',
      name: 'communityHub',
      component: () => import('@/pages/CommunityHubPage.vue'),
    },
    {
      path: '/work/:id',
      name: 'communityWork',
      component: () => import('@/pages/CommunityWorkPage.vue'),
    },
    {
      path: '/web-app/:cardId',
      name: 'webApp',
      component: () => import('@/pages/WebAppPage.vue'),
    },
    {
      path: '/publish',
      name: 'publish',
      component: () => import('@/pages/PublishPage.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/pages/AdminPage.vue'),
      meta: { admin: true },
    },
    {
      path: '/account',
      name: 'account',
      component: () => import('@/pages/AccountPage.vue'),
    },
    {
      path: '/chat/:avatar',
      name: 'chat',
      component: () => import('@/pages/ChatPage.vue'),
    },
    {
      path: '/characters',
      name: 'characters',
      component: () => import('@/pages/CharacterManagerPage.vue'),
    },
    {
      path: '/character/new',
      name: 'characterNew',
      component: () => import('@/pages/CharacterEditorPage.vue'),
    },
    {
      path: '/character/:avatar/edit',
      name: 'characterEdit',
      component: () => import('@/pages/CharacterEditorPage.vue'),
    },
    {
      path: '/character/:avatar',
      name: 'characterDetail',
      component: () => import('@/pages/CharacterDetailPage.vue'),
    },
    {
      path: '/story/new',
      name: 'storyNew',
      component: () => import('@/pages/StoryNewPage.vue'),
    },
    {
      path: '/story/:id/edit',
      name: 'storyEdit',
      component: () => import('@/pages/StoryNewPage.vue'),
    },
    {
      path: '/story/:id',
      name: 'storyDetail',
      component: () => import('@/pages/StoryDetailPage.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/SettingsPage.vue'),
      // 世界书和 MOD 已独立成页，旧的 ?tab= 链接重定向过去
      beforeEnter: (to) => {
        if (to.query.tab === 'world') return { path: '/worlds' }
        if (to.query.tab === 'mods') return { path: '/mods' }
        return true
      },
    },
    {
      path: '/worlds',
      name: 'worlds',
      component: () => import('@/pages/WorldsPage.vue'),
    },
    {
      path: '/mods',
      name: 'mods',
      component: () => import('@/pages/ModsPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'notFound',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.booted) await session.boot()

  if (to.meta.publicOnly && session.authenticated) return { path: '/browse' }
  if (!to.meta.public && !session.authenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.meta.admin && !session.isAdmin) return { path: '/browse' }
  return true
})

export default router
