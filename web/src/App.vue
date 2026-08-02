<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useBillingStore } from '@/stores/billing'
import { useCharactersStore } from '@/stores/characters'
import { useChatStore } from '@/stores/chat'
import { useImageGenStore } from '@/stores/imageGen'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useModsStore } from '@/stores/mods'
import { usePersonasStore } from '@/stores/personas'
import { usePresetsStore } from '@/stores/presets'
import { useSessionStore } from '@/stores/session'
import { useTtsStore } from '@/stores/tts'
import { invalidateSettingsCache } from '@/api/settings'
import { clearSettingsSharedState } from '@/components/settings/shared'
import {
  clearLegacyDiscordImportQueue,
  clearLegacyTelegramBotAdminToken,
  clearStoredTelegramBotAdminToken,
} from '@/lib/accountStorage'
import { clearWorldInfoCache } from '@/lib/worldInfoMatch'
import AppToast from './components/ui/AppToast.vue'
import AppSideNav from './components/layout/AppSideNav.vue'
import MobileTabBar from './components/layout/MobileTabBar.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const billing = useBillingStore()
const characters = useCharactersStore()
const chat = useChatStore()
const imageGen = useImageGenStore()
const models = useModelProfilesStore()
const mods = useModsStore()
const personas = usePersonasStore()
const presets = usePresetsStore()
const tts = useTtsStore()
// 聊天和独立网页应用全屏沉浸：不显示侧栏和底部导航
const isImmersive = computed(() => route.name === 'chat' || route.name === 'webApp')
const isAuth = computed(() => route.name === 'login' || route.name === 'register')
const chromeHidden = computed(() => isImmersive.value || isAuth.value)

watch(
  [() => session.user?.handle || '', () => session.isAdmin],
  ([handle, isAdmin]) => {
    clearLegacyDiscordImportQueue()
    clearLegacyTelegramBotAdminToken()
    if (handle && !isAdmin) clearStoredTelegramBotAdminToken(handle)
    clearWorldInfoCache()
    invalidateSettingsCache()
    characters.reset()
    chat.reset()
    mods.reset()
    presets.reset()
    personas.reset()
    imageGen.reset()
    tts.reset()
    billing.reset()
    models.reset()
    clearSettingsSharedState()
    if (!handle) {
      if (session.booted && !route.meta.public) {
        void router.replace({ path: '/login', query: { redirect: route.fullPath } })
      }
      return
    }
    if (!isAdmin && route.meta.admin) {
      void router.replace('/browse')
    }
    void Promise.all([
      billing.load(),
      models.load(),
    ]).catch((error) => console.warn('Load account data failed', error))
  },
  { immediate: true },
)
</script>

<template>
  <!-- pb 与 MobileTabBar 高度严格对应：内容区 h-16(4rem) + safe-area-inset-bottom -->
  <div
    class="min-h-[100dvh] bg-bg text-ink-primary md:flex"
    :class="chromeHidden ? '' : 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0'"
  >
    <AppSideNav v-if="!chromeHidden" />
    <div class="min-w-0 w-full flex-1">
      <RouterView />
    </div>
  </div>
  <MobileTabBar v-if="!chromeHidden" />
  <AppToast />
</template>
