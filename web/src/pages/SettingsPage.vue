<script setup lang="ts">
import { computed, onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import { useTtsStore } from '@/stores/tts'
import { useImageGenStore } from '@/stores/imageGen'
import { useSessionStore } from '@/stores/session'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ModelTab from '@/components/settings/ModelTab.vue'
import PresetsTab from '@/components/settings/PresetsTab.vue'
import PersonasTab from '@/components/settings/PersonasTab.vue'
import ImageTab from '@/components/settings/ImageTab.vue'
import TtsTab from '@/components/settings/TtsTab.vue'
import TelegramBotTab from '@/components/settings/TelegramBotTab.vue'
import AboutTab from '@/components/settings/AboutTab.vue'
import { imageHistory, loadImageHistory } from '@/components/settings/shared'

const models = useModelProfilesStore()
const presets = usePresetsStore()
const personas = usePersonasStore()
const tts = useTtsStore()
const imageGen = useImageGenStore()
const session = useSessionStore()
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
  ...(session.isAdmin ? [{ key: 'model', label: '模型连接' }] : []),
  { key: 'presets', label: '提示词预设' },
  { key: 'personas', label: '我的身份' },
  ...(session.isAdmin ? [
    { key: 'image', label: '图像生成' },
    { key: 'tts', label: '语音 (TTS)' },
    { key: 'telegram', label: 'Telegram Bot' },
  ] : []),
  { key: 'about', label: '关于' },
])

const availableTabKeys = computed(() => tabs.value.map((tab) => tab.key))
const activeTab = ref(initialTab())

/** 概览计数卡片点击跳转对应 Tab；该 Tab 对当前用户不可用时保持静止 */
function goTab(key: string) {
  if (availableTabKeys.value.includes(key)) activeTab.value = key
}

const tabComponents: Record<string, Component> = {
  model: ModelTab,
  presets: PresetsTab,
  personas: PersonasTab,
  image: ImageTab,
  tts: TtsTab,
  telegram: TelegramBotTab,
  about: AboutTab,
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

        <!-- 移动端没有常驻侧栏，用快捷入口补齐资料库导航 -->
        <nav class="grid grid-cols-3 gap-3 md:hidden" aria-label="资料库快捷入口">
          <button class="rounded-lg border border-border bg-surface px-2 py-3 text-sm font-medium text-ink-secondary" @click="router.push('/characters')">角色库</button>
          <button class="rounded-lg border border-border bg-surface px-2 py-3 text-sm font-medium text-ink-secondary" @click="router.push('/worlds')">世界书</button>
          <button class="rounded-lg border border-border bg-surface px-2 py-3 text-sm font-medium text-ink-secondary" @click="router.push('/mods')">提示词 MOD</button>
        </nav>

        <!-- 概览计数：点击跳转到对应 Tab -->
        <AppCard padding="sm">
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <button
              v-for="card in [
                { key: 'model', label: '模型', count: models.profiles.length },
                { key: 'presets', label: '预设', count: presets.presets.length },
                { key: 'personas', label: '身份', count: personas.personas.length },
                { key: 'image', label: '图片', count: imageHistory.length },
              ]"
              :key="card.key"
              type="button"
              class="rounded-lg bg-surface-sunken px-3 py-2.5 text-center transition-colors"
              :class="availableTabKeys.includes(card.key)
                ? 'hover:bg-surface-elevated hover:ring-1 hover:ring-border cursor-pointer'
                : 'cursor-default opacity-70'"
              @click="goTab(card.key)"
            >
              <p class="text-[11px] text-ink-muted">{{ card.label }}</p>
              <p class="mt-0.5 text-lg font-semibold text-ink-primary tabular-nums">{{ card.count }}</p>
            </button>
          </div>
        </AppCard>

        <KeepAlive :max="1">
          <component
            :is="tabComponents[activeTab]"
            :key="[session.sessionEpoch, session.user?.handle || '', activeTab].join(':')"
          />
        </KeepAlive>
      </div>
    </div>
  </div>
</template>
