<script setup lang="ts">
import type { CommunityWork } from '@/api/community'

defineProps<{
  work: CommunityWork
  noImage?: boolean
}>()

function typeLabel(type: CommunityWork['type']): string {
  if (type === 'story') return '故事'
  if (type === 'mod') return '提示词'
  return '角色'
}
</script>

<template>
  <article class="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-brand-500/45">
    <div v-if="!noImage" class="relative aspect-[3/4] overflow-hidden bg-surface-sunken">
      <div v-if="work.type === 'mod'" class="flex h-full flex-col items-center justify-center bg-surface-sunken text-ink-primary">
        <span class="font-mono text-5xl font-semibold text-brand-300">{ }</span>
        <span class="mt-3 text-xs text-ink-muted">提示词 MOD</span>
      </div>
      <img v-else :src="work.coverUrl" :alt="work.title" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" loading="lazy" />
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-white">
        <p class="truncate text-sm font-semibold">{{ work.title }}</p>
        <p class="mt-0.5 truncate text-[11px] text-white/75">{{ work.authorName }}</p>
      </div>
      <span class="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur">
        {{ typeLabel(work.type) }}
      </span>
      <span v-if="work.status === 'hidden'" class="absolute right-2 top-2 rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white">
        已下架
      </span>
    </div>
    <div class="flex flex-1 flex-col p-3">
      <div v-if="noImage" class="mb-2 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="truncate text-sm font-semibold text-ink-primary">{{ work.title }}</h3>
          <p class="mt-0.5 truncate text-xs text-ink-muted">{{ work.authorName }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <span v-if="work.status === 'hidden'" class="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">已下架</span>
          <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-[11px] text-ink-secondary">{{ typeLabel(work.type) }}</span>
        </div>
      </div>
      <div class="mb-3">
        <p class="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-secondary">{{ work.summary || '暂无简介' }}</p>
        <div v-if="work.tags.length" class="mt-2 flex min-h-5 gap-1 overflow-hidden">
          <span v-for="tag in work.tags.slice(0, 3)" :key="tag" class="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 text-xs text-brand-300">{{ tag }}</span>
        </div>
      </div>
      <div class="mt-auto flex items-center justify-between border-t border-border-subtle pt-2 text-[11px] text-ink-muted">
        <span>{{ work.type === 'mod' ? '导入' : '启动' }} {{ work.launchCount }}</span>
        <span>★ {{ work.ratingAverage.toFixed(1) }} · 收藏 {{ work.favoriteCount }}</span>
        <span>v{{ work.versionNumber }}</span>
      </div>
    </div>
  </article>
</template>
