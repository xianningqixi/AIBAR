<script setup lang="ts">
import { onMounted, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import { useTtsStore } from '@/stores/tts'
import { useImageGenStore } from '@/stores/imageGen'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import ModelTab from '@/components/settings/ModelTab.vue'
import PresetsTab from '@/components/settings/PresetsTab.vue'
import PersonasTab from '@/components/settings/PersonasTab.vue'
import ImageTab from '@/components/settings/ImageTab.vue'
import TtsTab from '@/components/settings/TtsTab.vue'
import AboutTab from '@/components/settings/AboutTab.vue'
import { imageHistory, loadImageHistory } from '@/components/settings/shared'

const models = useModelProfilesStore()
const presets = usePresetsStore()
const personas = usePersonasStore()
const tts = useTtsStore()
const imageGen = useImageGenStore()
const route = useRoute()
const router = useRouter()

function initialTab(): string {
  const raw = String(route.query.tab || '')
  if (['model', 'presets', 'personas', 'image', 'tts', 'about'].includes(raw)) return raw
  return 'model'
}

function syncTabFromRoute() {
  const next = initialTab()
  if (activeTab.value !== next) {
    activeTab.value = next
  }
}

const activeTab = ref(initialTab())

const tabs = [
  { key: 'model', label: '模型连接' },
  { key: 'presets', label: '生成参数' },
  { key: 'personas', label: '我的身份' },
  { key: 'image', label: '图像生成' },
  { key: 'tts', label: '语音 (TTS)' },
  { key: 'about', label: '关于' },
]

const tabComponents: Record<string, Component> = {
  model: ModelTab,
  presets: PresetsTab,
  personas: PersonasTab,
  image: ImageTab,
  tts: TtsTab,
  about: AboutTab,
}

onMounted(async () => {
  await Promise.all([
    models.loadSecrets(),
    presets.load(),
    personas.load(),
    tts.load(),
    imageGen.load(),
  ])
  await loadImageHistory()
})

watch(activeTab, (tab) => {
  if (route.path === '/settings') {
    router.replace({ query: { ...route.query, tab } })
  }
})

watch(() => [route.path, route.query.tab], syncTabFromRoute)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg">
    <AppPageHeader title="设置" back-to="/browse" mobile-only-back />

    <div class="max-w-6xl mx-auto w-full px-5 py-6 flex-1 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial mb-6">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-accent-500/15 blur-3xl pointer-events-none" />
        <div class="relative grid md:grid-cols-[1fr_auto] gap-6 items-end p-5 md:p-7">
          <div>
            <p class="text-[11px] uppercase tracking-[0.2em] text-brand-300/80 mb-2">配置中心</p>
            <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
              管理 <span class="text-brand-300">模型 · 参数 · 图像 · 语音</span>
            </h2>
            <p class="mt-1.5 text-xs md:text-sm text-ink-secondary max-w-xl">
              模型连接、生成参数、身份、图像和语音在这里配置。世界书和提示词 MOD 已移到左侧资料库单独管理。
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2.5 md:min-w-[420px] md:grid-cols-4">
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">模型</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ models.profiles.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">预设</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ presets.presets.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">身份</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ personas.personas.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">图片</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ imageHistory.length }}</p>
            </div>
          </div>
        </div>
      </section>

      <AppTabs v-model="activeTab" :tabs="tabs" class="mb-6" />

      <KeepAlive>
        <component :is="tabComponents[activeTab]" />
      </KeepAlive>
    </div>
  </div>
</template>
