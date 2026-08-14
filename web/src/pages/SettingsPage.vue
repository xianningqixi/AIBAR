
<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import { useTtsStore } from '@/stores/tts'
import { useImageGenStore } from '@/stores/imageGen'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppSegmentedControl from '@/components/ui/AppSegmentedControl.vue'
import { imageHistory, loadImageHistory } from '@/components/settings/shared'

// 设置页 7 个 Tab 全量静态导入会把 admin-only 的大块代码打进首屏 chunk，
// 改为按需懒加载；200ms 内加载完成不闪 loading 占位
function lazyTab(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({ loader, loadingComponent: AppSpinner, delay: 200 })
}

const models = useModelProfilesStore()
const presets = usePresetsStore()
const personas = usePersonasStore()
const tts = useTtsStore()
const imageGen = useImageGenStore()
const session = useSessionStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

function initialTab(): string {
  const raw = String(route.query.tab || '')
  if (availableTabKeys.value.includes(raw)) return raw
  return session.isAdmin ? 'model' : 'presets'
}

function syncTabFromRoute() {
  const next = initialTab()
  if (activeTab.value !== next) {
    activeTab.value = next
  }
  if (route.path === '/settings' && route.query.tab !== next) {
    void router.replace({ query: { ...route.query, tab: next } })
  }
}

const tabs = computed(() => [
  { key: 'presets', label: '提示词预设', group: '个人配置' },
  { key: 'personas', label: '我的身份', group: '个人配置' },
  ...(session.isAdmin ? [
    { key: 'model', label: '模型连接', group: '管理员配置' },
    { key: 'image', label: '图像生成', group: '管理员配置' },
    { key: 'tts', label: '语音 (TTS)', group: '管理员配置' },
    { key: 'telegram', label: 'Telegram Bot', group: '管理员配置' },
  ] : []),
  { key: 'about', label: '关于' },
])

const availableTabKeys = computed(() => tabs.value.map((tab) => tab.key))
const activeTab = ref(initialTab())

const themeOptions = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

const cards = computed(() => [
  { key: 'presets', label: '预设', count: presets.presets.length, icon: 'book' },
  { key: 'personas', label: '身份', count: personas.personas.length, icon: 'users' },
  { key: 'model', label: '模型', count: models.profiles.length, icon: 'cog', locked: !session.isAdmin },
  { key: 'image', label: '图片', count: imageHistory.value.length, icon: 'image', locked: !session.isAdmin },
])

function canGoToCard(card: typeof cards.value[number]) {
  return !card.locked && availableTabKeys.value.includes(card.key)
}

/** 概览计数卡片点击跳转对应 Tab；该 Tab 对当前用户不可用时保持静止 */
function goTab(key: string) {
  if (availableTabKeys.value.includes(key)) activeTab.value = key
}

const tabComponents: Record<string, Component> = {
  model: lazyTab(() => import('@/components/settings/ModelTab.vue')),
  presets: lazyTab(() => import('@/components/settings/PresetsTab.vue')),
  personas: lazyTab(() => import('@/components/settings/PersonasTab.vue')),
  image: lazyTab(() => import('@/components/settings/ImageTab.vue')),
  tts: lazyTab(() => import('@/components/settings/TtsTab.vue')),
  telegram: lazyTab(() => import('@/components/settings/TelegramBotTab.vue')),
  about: lazyTab(() => import('@/components/settings/AboutTab.vue')),
}

onMounted(async () => {
  await Promise.all([
    models.loadSecrets(),
    presets.load(),
    personas.load(),
    ...(session.isAdmin ? [tts.load(), imageGen.load()] : []),
  ])
  await loadImageHistory()
})

watch(activeTab, (tab) => {
  if (route.path === '/settings') {
    router.replace({ query: { ...route.query, tab } })
  }
})

watch(
  [() => route.path, () => route.query.tab, () => session.isAdmin],
  syncTabFromRoute,
  { immediate: true },
)
</script>

<template>
  <div class="min-h-[100dvh] flex flex-col bg-bg">
    <AppPageHeader title="设置" back-to="/browse" mobile-only-back />

    <div class="max-w-6xl mx-auto w-full px-5 py-6 md:px-8 lg:px-10 flex-1 animate-fade-in-up">
      <div class="space-y-6">
        <AppTabs v-model="activeTab" :tabs="tabs" />

        <!-- 概览计数 + 外观 -->
        <AppCard padding="sm">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <button
                v-for="card in cards"
                :key="card.key"
                type="button"
                class="relative rounded-lg bg-surface-sunken px-3 py-2.5 text-left transition-all"
                :class="canGoToCard(card)
                  ? 'hover:bg-surface-elevated hover:ring-1 hover:ring-border cursor-pointer hover:-translate-y-0.5'
                  : 'cursor-default opacity-60'"
                @click="goTab(card.key)"
              >
                <div class="flex items-center justify-between">
                  <p class="text-[11px] text-ink-muted">{{ card.label }}</p>
                  <svg v-if="card.locked" class="h-3.5 w-3.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" title="需要管理员权限">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <svg v-else-if="card.icon === 'book'" class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <svg v-else-if="card.icon === 'users'" class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                  <svg v-else-if="card.icon === 'cog'" class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <svg v-else-if="card.icon === 'image'" class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p class="mt-1 text-lg font-semibold text-ink-primary tabular-nums">{{ card.count }}</p>
              </button>
            </div>

            <div class="flex items-center gap-3 text-sm text-ink-secondary">
              <span class="text-xs">外观</span>
              <AppSegmentedControl v-model="ui.theme" :options="themeOptions" size="sm" />
            </div>
          </div>
        </AppCard>

        <!-- 移动端没有常驻侧栏，用快捷入口补齐资料库导航 -->
        <nav class="grid grid-cols-3 gap-3 md:hidden" aria-label="资料库快捷入口">
          <button class="inline-flex items-center justify-center gap-2 rounded-lg bg-surface px-2 py-3 text-sm font-medium text-ink-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-elevated" @click="router.push('/characters')">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            角色库
          </button>
          <button class="inline-flex items-center justify-center gap-2 rounded-lg bg-surface px-2 py-3 text-sm font-medium text-ink-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-elevated" @click="router.push('/worlds')">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            世界书
          </button>
          <button class="inline-flex items-center justify-center gap-2 rounded-lg bg-surface px-2 py-3 text-sm font-medium text-ink-secondary ring-1 ring-border-subtle transition-colors hover:bg-surface-elevated" @click="router.push('/mods')">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            提示词 MOD
          </button>
        </nav>

        <KeepAlive :max="3">
          <component
            :is="tabComponents[activeTab]"
            :key="[session.sessionEpoch, session.user?.handle || '', activeTab].join(':')"
          />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>
