<script setup lang="ts">
import { computed } from 'vue'
import type { Character, ModelProfile } from '@/api/types'
import { getProviderLabel } from '@/lib/providers'

const props = defineProps<{
  character: Character
  profile: ModelProfile
  modelOpen?: boolean
}>()

defineEmits<{
  back: []
  toggleSidebar: []
  toggleModelPicker: []
  openSettings: []
}>()

const providerLabel = computed(() => getProviderLabel(props.profile.source))
</script>

<template>
  <div class="relative flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-bg/90 backdrop-blur">
    <button
      class="p-2 -ml-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/5 transition-colors"
      @click="$emit('back')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
    </button>

    <button
      class="p-2 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/5 transition-colors"
      title="聊天列表"
      @click="$emit('toggleSidebar')"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    </button>

    <div class="flex items-center gap-2.5 min-w-0 flex-1">
      <div class="relative shrink-0">
        <img
          v-if="character.avatar && character.avatar !== 'none'"
          :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
          class="w-9 h-9 rounded-full object-cover ring-2 ring-brand-500/40"
        />
        <div v-else class="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center ring-2 ring-brand-500/40">
          <svg class="w-4 h-4 text-brand-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <span class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-bg" />
      </div>
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-ink-primary truncate">{{ character.name }}</h2>
        <p class="text-[11px] text-ink-muted truncate">
          <span class="inline-flex items-center gap-1">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-gradient"></span>
            {{ providerLabel }}
          </span>
        </p>
      </div>
    </div>

    <button
      class="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-semibold text-ink-primary ring-1 ring-border-subtle shadow-sm transition-all hover:ring-brand-500/40 md:inline-flex"
      :class="modelOpen ? 'ring-brand-500/60 bg-brand-500/10' : ''"
      @click="$emit('toggleModelPicker')"
    >
      <span class="max-w-[220px] truncate">{{ profile.model || profile.name }}</span>
      <svg class="h-4 w-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div class="flex items-center gap-1">
      <button
        class="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-xs font-medium text-ink-secondary ring-1 ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40 transition-colors md:hidden"
        @click="$emit('toggleModelPicker')"
      >
        <span class="max-w-[38vw] truncate">{{ profile.model || profile.name }}</span>
        <svg class="h-3.5 w-3.5 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <button
        class="p-2 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/5 transition-colors"
        title="高级设置"
        @click="$emit('openSettings')"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</template>
