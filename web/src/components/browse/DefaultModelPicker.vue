<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppButton from '@/components/ui/AppButton.vue'
import { getProviderLabel } from '@/lib/providers'
import { formatModelPricing } from '@/lib/points'
import type { ModelProfile } from '@/api/types'

// 从 BrowsePage 拆出的“选择默认模型”抽屉：列表、状态徽章与切换逻辑自包含，
// 页面只负责 v-model 控制开合。
const modelValue = defineModel<boolean>({ required: true })

const router = useRouter()
const models = useModelProfilesStore()
const session = useSessionStore()
const ui = useUiStore()

function isProfileUsable(profile: ModelProfile): boolean {
  return Boolean(profile.id && profile.model && profile.enabled !== false)
}

const usableModelProfiles = computed(() => models.profiles.filter(isProfileUsable))

const activeModelTitle = computed(() =>
  models.activeProfile.model || models.activeProfile.name || '选择模型',
)

const activeModelSubtitle = computed(() =>
  isProfileUsable(models.activeProfile)
    ? formatModelPricing(models.activeProfile)
    : '等待管理员提供共享模型',
)

function modelStatusLabel(profile: ModelProfile): string {
  if (profile.id === models.activeProfileId) return isProfileUsable(profile) ? '当前' : '需配置'
  return isProfileUsable(profile) ? '可用' : '需配置'
}

function modelStatusClass(profile: ModelProfile): string {
  if (profile.id === models.activeProfileId) {
    return isProfileUsable(profile)
      ? 'bg-brand-500/15 text-brand-200 ring-brand-500/30'
      : 'bg-warning/15 text-warning ring-warning/30'
  }
  return isProfileUsable(profile)
    ? 'bg-success/10 text-success ring-success/20'
    : 'bg-warning/10 text-warning ring-warning/20'
}

function selectDefaultModel(profile: ModelProfile) {
  if (!isProfileUsable(profile)) return
  models.setActive(profile.id)
  modelValue.value = false
  ui.addToast('默认模型已切换', 'success')
}

function openModelSettings() {
  modelValue.value = false
  router.push('/settings')
}
</script>

<template>
  <AppDrawer v-model="modelValue" title="选择默认模型" width="24rem">
    <div class="space-y-3 p-4">
      <div class="rounded-lg bg-surface-sunken p-4 ring-1 ring-border-subtle">
        <p class="text-xs font-semibold text-ink-muted">当前模型</p>
        <p class="mt-2 truncate text-base font-semibold text-ink-primary">{{ activeModelTitle }}</p>
        <p class="mt-1 text-sm text-ink-muted">{{ activeModelSubtitle }}</p>
      </div>

      <button
        v-for="profile in usableModelProfiles"
        :key="profile.id"
        class="w-full rounded-lg bg-surface p-4 text-left ring-1 ring-border-subtle transition-all hover:ring-brand-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        :class="profile.id === models.activeProfileId ? 'bg-brand-500/10 ring-brand-500/35' : ''"
        @click="selectDefaultModel(profile)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-ink-primary">{{ profile.name }}</p>
            <p class="mt-1 truncate text-xs text-ink-muted">
              {{ getProviderLabel(profile.source) }} · {{ profile.model || '未填写模型' }}
            </p>
            <p class="mt-1 text-xs text-ink-muted">{{ formatModelPricing(profile) }}</p>
          </div>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1"
            :class="modelStatusClass(profile)"
          >
            {{ modelStatusLabel(profile) }}
          </span>
        </div>
      </button>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <AppButton size="sm" variant="ghost" @click="modelValue = false">关闭</AppButton>
        <AppButton v-if="session.isAdmin" size="sm" variant="secondary" @click="openModelSettings">管理模型</AppButton>
      </div>
    </template>
  </AppDrawer>
</template>
