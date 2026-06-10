import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: '/browse',
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

export default router
