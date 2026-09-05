<script setup lang="ts">
import { computed } from 'vue'
import type { Character } from '@/api/types'
import { characterCover, cleanCharacterDescription, getCharacterTags } from '@/lib/characterMeta'
import ResourceCover from '@/components/ui/ResourceCover.vue'

const props = defineProps<{ character: Character; compact?: boolean; eager?: boolean }>()
const tags = computed(() => getCharacterTags(props.character).slice(0, 3))
</script>

<template>
  <button type="button" class="resource-card group" :aria-label="`和 ${character.name} 开始聊天`">
    <ResourceCover v-if="!compact" :src="characterCover(character.avatar)" :title="character.name" :eager="eager" class="aspect-square w-full sm:aspect-[4/5]">
      <span v-if="character.fav === 'true'" class="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur" aria-label="已收藏">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9z" /></svg>
      </span>
    </ResourceCover>
    <div class="flex flex-1 flex-col p-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="truncate text-[15px] font-semibold text-ink-primary">{{ character.name }}</h3>
        <svg class="h-4 w-4 shrink-0 text-brand-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6" /></svg>
      </div>
      <p class="mt-2 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-secondary">{{ cleanCharacterDescription(character) || '打开角色卡，开始你们的故事。' }}</p>
      <div v-if="tags.length" class="mt-3 flex gap-1.5 overflow-hidden">
        <span v-for="tag in tags" :key="tag" class="resource-tag">{{ tag }}</span>
      </div>
      <p class="mt-auto flex items-center gap-1.5 pt-4 text-xs text-ink-muted">
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path stroke-linejoin="round" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-9.5a9 9 0 0 1 18 0Z" /></svg>
        {{ character.chat_size ? '聊过的角色' : '开始新对话' }}
        <span v-if="compact && character.fav === 'true'" class="ml-auto text-brand-300">已收藏</span>
      </p>
    </div>
  </button>
</template>
