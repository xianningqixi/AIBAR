<script setup lang="ts">
import { computed } from 'vue'
import type { Character, ModelProfile } from '@/api/types'
import { useUiStore } from '@/stores/ui'
import { characterCover } from '@/lib/characterMeta'
import ResourceCover from '@/components/ui/ResourceCover.vue'

const props = defineProps<{ character: Character; profile: ModelProfile; modelOpen?: boolean }>()
const ui = useUiStore()
const modelDisplay = computed(() => props.profile.model || props.profile.name || '选择模型')
defineEmits<{ back: []; toggleSidebar: []; toggleModelPicker: []; openSettings: [] }>()
</script>

<template>
  <header class="shrink-0 border-b border-border-subtle bg-bg/95 backdrop-blur-xl">
    <div class="mx-auto flex max-w-6xl items-center gap-2 px-3 py-3 md:gap-3 md:px-6">
      <button class="icon-button" aria-label="返回" title="返回探索" @click="$emit('back')">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="m14 6-6 6 6 6" /></svg>
      </button>
      <ResourceCover :src="characterCover(character.avatar)" :title="character.name" eager class="h-10 w-10 shrink-0 rounded-xl" />
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-base font-semibold">{{ character.name }}</h1>
        <button class="flex max-w-full items-center gap-1 py-1 text-xs text-ink-muted transition-colors hover:text-brand-300" :title="`切换模型：${modelDisplay}`" aria-label="选择聊天模型" aria-haspopup="dialog" :aria-expanded="modelOpen" @click="$emit('toggleModelPicker')">
          <span class="truncate">{{ modelDisplay }}</span>
          <svg class="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="m7 10 5 5 5-5" /></svg>
        </button>
      </div>
      <button class="icon-button" :class="ui.sidePanelOpen ? 'bg-brand-500/10 text-brand-300' : ''" aria-label="聊天列表" title="聊天列表" :aria-expanded="ui.sidePanelOpen" @click="$emit('toggleSidebar')">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" d="M4 6h16M4 12h16M4 18h10" /></svg>
      </button>
      <button class="icon-button" :class="ui.modelDrawerOpen ? 'bg-brand-500/10 text-brand-300' : ''" aria-label="高级设置" title="高级设置" :aria-expanded="ui.modelDrawerOpen" @click="$emit('openSettings')">
        <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" d="M4 7h9m4 0h3M4 17h3m4 0h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg>
      </button>
    </div>
  </header>
</template>
