
<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

import { getNavSection } from '@/lib/navigation'

const route = useRoute()


const tabs = [
  {
    key: 'browse',
    label: '探索',
    to: '/browse',
    icon: 'M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z',
  },
  {
    key: 'create',
    label: '创作',
    to: '/create',
    icon: 'M12 4v16m8-8H4',
  },
  {
    key: 'hub',
    label: '社区',
    to: '/hub',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    key: 'library',
    label: '资料库',
    to: '/characters',
    icon: 'M4 4h6v16H4zM14 4h6v16h-6zM4 8h6m4 0h6',
  },
  {
    key: 'account',
    label: '我的',
    to: '/account',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
]

function isActive(key: string): boolean {
  return getNavSection(route.name) === key
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur-md md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom)"
    aria-label="底部导航"
  >
    <!-- 内容区固定 h-16（4rem），加上 safe-area 内边距即为总高度；App.vue 的 pb 与之一致 -->
    <div class="grid h-16 grid-cols-5">
      <RouterLink
        v-for="tab in tabs"
        :key="tab.key"
        :aria-label="tab.label"
        class="relative flex h-full flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-95"
        :class="isActive(tab.key) ? 'text-brand-300' : 'text-ink-secondary hover:text-ink-secondary'"
        :to="tab.to"
        :aria-current="isActive(tab.key) ? 'page' : undefined"
      >
        <span
          v-if="isActive(tab.key)"
          class="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-b-full bg-brand-gradient"
          aria-hidden="true"
        />
        <svg
          class="h-5 w-5 transition-transform duration-150"
          :class="isActive(tab.key) ? 'scale-110' : ''"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tab.icon" />
        </svg>
        <span class="text-xs font-medium">{{ tab.label }}</span>
      </RouterLink>
    </div>
  </nav>
</template>
