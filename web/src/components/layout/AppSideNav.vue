<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter, type RouteLocationRaw } from 'vue-router'

const route = useRoute()
const router = useRouter()

const mainNav: Array<{ key: string; label: string; to: string; names: string[]; icon: string }> = [
  {
    key: 'browse',
    label: '探索',
    to: '/browse',
    names: ['browse', 'characterDetail'],
    icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    key: 'create',
    label: '创作',
    to: '/create',
    names: ['create', 'characterNew', 'characterEdit', 'storyNew', 'storyEdit', 'storyDetail'],
    icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  },
  {
    key: 'hub',
    label: '社区 Hub',
    to: '/hub',
    names: ['communityHub'],
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  },
]

const libraryNav: Array<{ label: string; to: RouteLocationRaw; isActive: () => boolean; icon: string }> = [
  {
    label: '角色库',
    to: '/characters',
    isActive: () => route.name === 'characters',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  {
    label: '世界书',
    to: '/worlds',
    isActive: () => route.name === 'worlds',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  },
  {
    label: '提示词 MOD',
    to: '/mods',
    isActive: () => route.name === 'mods',
    icon: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z',
  },
]

const activeMain = computed(() => mainNav.find((item) => item.names.includes(String(route.name)))?.key)
const settingsActive = computed(() => route.name === 'settings')
</script>

<template>
  <aside class="hidden md:flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-border-subtle bg-surface/70 px-5 py-6 sticky top-0">
    <button class="flex items-center gap-3 text-left" @click="router.push('/browse')">
      <div class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white shadow-glow">
        A
      </div>
      <div class="leading-tight">
        <h1 class="text-xl font-semibold tracking-tight text-ink-primary">AIBAR</h1>
        <p class="text-xs text-ink-muted">选角色，开聊</p>
      </div>
    </button>

    <nav class="mt-10 space-y-1">
      <button
        v-for="item in mainNav"
        :key="item.key"
        :class="[
          'w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all',
          activeMain === item.key
            ? 'bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/35'
            : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
        ]"
        @click="router.push(item.to)"
      >
        <svg class="h-5 w-5 shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="item.icon" />
        </svg>
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <div class="mt-auto space-y-4 border-t border-border-subtle pt-4">
      <div>
        <p class="px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">资料库</p>
        <div class="mt-1.5 space-y-0.5">
          <button
            v-for="item in libraryNav"
            :key="item.label"
            :class="[
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              item.isActive()
                ? 'bg-brand-500/10 text-brand-200'
                : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
            ]"
            @click="router.push(item.to)"
          >
            <svg class="h-[18px] w-[18px] shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" :d="item.icon" />
            </svg>
            {{ item.label }}
          </button>
        </div>
      </div>

      <button
        :class="[
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors',
          settingsActive
            ? 'bg-brand-500/10 text-brand-200 ring-1 ring-brand-500/35'
            : 'text-ink-secondary ring-1 ring-border-subtle hover:bg-ink-primary/5 hover:text-ink-primary',
        ]"
        @click="router.push('/settings')"
      >
        <svg class="h-[18px] w-[18px] shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span class="flex-1">
          设置
          <span class="mt-0.5 block text-[11px] font-normal text-ink-muted">模型 · 参数 · 图像 · 语音 · 身份</span>
        </span>
        <svg class="h-4 w-4 shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  </aside>
</template>
