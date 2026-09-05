<script setup lang="ts">
import type { CommunityWork } from '@/api/community'
import ResourceCover from '@/components/ui/ResourceCover.vue'

defineProps<{ work: CommunityWork; noImage?: boolean; eager?: boolean }>()
function typeLabel(type: CommunityWork['type']): string {
  return type === 'story' ? '故事' : type === 'mod' ? '提示词' : '角色'
}
</script>

<template>
  <button type="button" class="resource-card group" :aria-label="`查看作品：${work.title}`">
    <ResourceCover v-if="!noImage" :src="work.coverUrl" :title="work.title" :kind="work.type" :eager="eager" class="aspect-square w-full sm:aspect-[4/5]">
      <span v-if="work.status === 'hidden'" class="absolute right-3 top-3 rounded-lg bg-surface/95 px-2 py-1 text-xs font-medium text-warning-strong">已下架</span>
    </ResourceCover>
    <div class="flex flex-1 flex-col p-4">
      <div class="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
        <span class="text-brand-300">{{ typeLabel(work.type) }}</span>
        <span class="truncate text-ink-muted">{{ work.authorName }}</span>
      </div>
      <h3 class="truncate text-[15px] font-semibold text-ink-primary">{{ work.title }}</h3>
      <p class="mt-2 line-clamp-2 min-h-10 text-[13px] leading-5 text-ink-secondary">{{ work.summary || '打开作品，了解更多内容。' }}</p>
      <div v-if="work.tags.length" class="mt-3 flex gap-1.5 overflow-hidden">
        <span v-for="tag in work.tags.slice(0, 3)" :key="tag" class="resource-tag">{{ tag }}</span>
      </div>
      <div class="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-4 text-xs text-ink-muted">
        <span>{{ work.type === 'mod' ? '导入' : '启动' }} {{ work.launchCount }}</span>
        <span class="inline-flex items-center gap-1" :aria-label="`评分 ${work.ratingAverage.toFixed(1)}，${work.favoriteCount} 人收藏`">
          <svg class="h-3 w-3 text-warning" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1.5 12.6 7l6 .6-4.5 4 1.3 5.9L10 14.4 4.6 17.5 5.9 11.6l-4.5-4 6-.6L10 1.5z" /></svg>
          {{ work.ratingAverage.toFixed(1) }} <span class="ml-1">收藏 {{ work.favoriteCount }}</span>
        </span>
        <span v-if="noImage && work.status === 'hidden'" class="text-warning-strong">已下架</span>
      </div>
    </div>
  </button>
</template>
