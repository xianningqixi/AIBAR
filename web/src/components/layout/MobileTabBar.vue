<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

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
    key: 'settings',
    label: '设置',
    to: '/settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  },
]

function isActive(key: string): boolean {
  const path = route.path
  switch (key) {
    case 'browse':
      return path.startsWith('/browse') || path.startsWith('/chat') || path.startsWith('/character')
    case 'create':
      return path.startsWith('/create') || path.startsWith('/story')
    case 'hub':
      return path.startsWith('/hub')
    case 'settings':
      return path.startsWith('/settings')
    default:
      return false
  }
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface/95 backdrop-blur-md md:hidden"
    style="padding-bottom: env(safe-area-inset-bottom)"
  >
    <div class="grid grid-cols-4">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex flex-col items-center gap-0.5 py-2 transition-colors"
        :class="isActive(tab.key) ? 'text-brand-300' : 'text-ink-muted hover:text-ink-secondary'"
        @click="router.push(tab.to)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tab.icon" />
        </svg>
        <span class="text-[11px] font-medium">{{ tab.label }}</span>
      </button>
    </div>
  </nav>
</template>
