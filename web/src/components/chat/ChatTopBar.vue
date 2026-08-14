<script setup lang="ts">
import { computed } from 'vue'
import type { Character, ModelProfile } from '@/api/types'
import { getProviderLabel } from '@/lib/providers'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  character: Character
  profile: ModelProfile
  modelOpen?: boolean
}>()

const ui = useUiStore()

defineEmits<{
  back: []
  toggleSidebar: []
  toggleModelPicker: []
  openSettings: []
}>()

const providerLabel = computed(() => getProviderLabel(props.profile.source))
const modelDisplay = computed(() => props.profile.model || props.profile.name)
</script>

<template>
  <!-- 左：返回 + 头像 + 名称；右：模型 + 聊天列表 + 设置。不使用绝对定位，避免中窄屏与标题重叠 -->
  <div class="flex items-center gap-3 border-b border-border-subtle bg-bg/95 px-4 py-3 shadow-sm backdrop-blur md:px-6 md:py-4">
    <button
      class="-ml-1 shrink-0 rounded-lg p-2 text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary active:bg-ink-primary/10"
      title="返回"
      aria-label="返回"
      @click="$emit('back')"
    >
      <svg class="h-5 w-5 md:h-6 md:w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <div class="flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
      <div class="relative shrink-0">
        <img
          v-if="character.avatar && character.avatar !== 'none'"
          :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
          class="h-9 w-9 rounded-full object-cover ring-2 ring-brand-500/40 md:h-10 md:w-10"
          alt=""
        />
        <div v-else class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft ring-2 ring-brand-500/40 md:h-10 md:w-10">
          <svg class="h-4 w-4 text-brand-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-[2.5px] ring-bg/90 shadow-sm md:h-3 md:w-3" />
      </div>
      <div class="min-w-0">
        <h2 class="truncate text-sm font-semibold text-ink-primary md:text-base">{{ character.name }}</h2>
        <p class="truncate text-[11px] text-ink-muted md:text-xs">
          <span class="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2 py-0.5 ring-1 ring-border-subtle">
            <span class="h-1.5 w-1.5 rounded-full bg-brand-gradient" />
            {{ providerLabel }}
          </span>
        </p>
      </div>
    </div>

    <div class="ml-auto flex shrink-0 items-center gap-0.5 md:gap-1">
      <button
        class="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-ink-secondary shadow-sm ring-1 ring-border-subtle transition-colors hover:text-ink-primary hover:ring-brand-500/40 md:text-sm md:font-semibold md:text-ink-primary"
        :class="modelOpen ? 'bg-brand-500/10 text-brand-300 ring-brand-500/60' : ''"
        :title="`当前模型：${modelDisplay}`"
        aria-haspopup="listbox"
        :aria-expanded="modelOpen"
        @click="$emit('toggleModelPicker')"
      >
        <span class="max-w-[34vw] truncate md:max-w-[13rem]">{{ modelDisplay }}</span>
        <svg class="h-3.5 w-3.5 shrink-0 text-ink-muted md:h-4 md:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <button
        class="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary active:bg-ink-primary/10"
        :class="ui.sidePanelOpen ? 'bg-brand-500/10 text-brand-300' : ''"
        title="聊天列表"
        aria-label="聊天列表"
        @click="$emit('toggleSidebar')"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      </button>

      <button
        class="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary active:bg-ink-primary/10"
        :class="ui.modelDrawerOpen ? 'bg-brand-500/10 text-brand-300' : ''"
        title="高级设置"
        aria-label="高级设置"
        @click="$emit('openSettings')"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</template>
