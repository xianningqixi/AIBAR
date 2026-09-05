<script setup lang="ts">
import type { Character, StoryCard } from '@/api/types'
import { storyThumbnail } from '@/lib/characterMeta'
import { formatRelative } from '@/lib/format'
import ResourceCover from '@/components/ui/ResourceCover.vue'
defineProps<{ story: StoryCard; character?: Character; eager?: boolean }>()
</script>

<template>
  <button type="button" class="resource-card group" :aria-label="`查看故事：${story.title}`">
    <ResourceCover :src="storyThumbnail(story, character)" :title="story.title" kind="story" :eager="eager" class="aspect-[4/3] w-full" />
    <div class="flex flex-1 flex-col p-4">
      <p class="text-xs text-brand-300">{{ character?.name || '角色已缺失' }}</p>
      <h3 class="mt-1 truncate text-base font-semibold">{{ story.title }}</h3>
      <p class="mt-2 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-secondary">{{ story.summary || story.scenario || '打开故事卡，查看这段故事的开场。' }}</p>
      <div class="mt-3 flex gap-1.5 overflow-hidden"><span v-for="tag in story.tags?.slice(0, 2)" :key="tag" class="resource-tag">{{ tag }}</span></div>
      <p class="mt-auto pt-4 text-xs text-ink-muted">{{ formatRelative(story.updatedAt || story.createdAt) }}更新</p>
    </div>
  </button>
</template>
