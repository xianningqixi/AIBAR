<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CommunityWork } from '@/api/community'

const props = defineProps<{
  work: CommunityWork
  noImage?: boolean
  eager?: boolean
}>()

const imageLoaded = ref(false)
const imageFailed = ref(false)

watch(
  () => props.work.coverUrl,
  () => {
    imageLoaded.value = false
    imageFailed.value = false
  },
)

function typeLabel(type: CommunityWork['type']): string {
  if (type === 'story') return '故事'
  if (type === 'mod') return '提示词'
  return '角色'
}
</script>

<template>
  <!-- 根元素即按钮：避免外层再包 button 造成可交互元素嵌套 -->
  <button
    type="button"
    class="group flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface text-left ring-1 ring-border-subtle transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow hover:ring-brand-500/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
  >
    <div v-if="!noImage" class="relative aspect-[3/4] w-full overflow-hidden bg-surface-sunken">
      <div v-if="work.type === 'mod'" class="flex h-full flex-col items-center justify-center bg-brand-soft text-ink-primary">
        <svg class="h-12 w-12 text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="m8 9-4 3 4 3m8-6 4 3-4 3M13 5l-2 14" />
        </svg>
        <span class="mt-3 text-xs text-ink-muted">提示词 MOD</span>
      </div>
      <template v-else>
        <div
          v-if="!imageLoaded || imageFailed"
          class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-sunken text-ink-muted"
          aria-hidden="true"
        >
          <span class="text-3xl font-semibold">{{ work.title.trim().slice(0, 1) || '?' }}</span>
          <span v-if="imageFailed" class="text-xs">封面加载失败</span>
        </div>
        <img
          v-if="!imageFailed"
          :src="work.coverUrl"
          :alt="work.title"
          class="h-full w-full object-cover transition-[opacity,transform] duration-300 group-hover:scale-[1.025]"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          :loading="eager ? 'eager' : 'lazy'"
          :fetchpriority="eager ? 'high' : 'auto'"
          decoding="async"
          @load="imageLoaded = true"
          @error="imageFailed = true"
        />
      </template>
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-3 pt-10 text-white">
        <p class="truncate text-sm font-semibold">{{ work.title }}</p>
        <p class="mt-0.5 truncate text-xs text-white/75">{{ work.authorName }}</p>
      </div>
      <span class="absolute left-2 top-2 rounded-md bg-brand-500/85 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
        {{ typeLabel(work.type) }}
      </span>
      <span v-if="work.status === 'hidden'" class="absolute right-2 top-2 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-white">
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
          <span v-if="work.status === 'hidden'" class="rounded bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning-strong">已下架</span>
          <span class="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-secondary">{{ typeLabel(work.type) }}</span>
        </div>
      </div>
      <div class="mb-3">
        <p class="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-ink-secondary">{{ work.summary || '暂无简介' }}</p>
        <div v-if="work.tags.length" class="mt-2 flex min-h-5 gap-1 overflow-hidden">
          <span v-for="tag in work.tags.slice(0, 3)" :key="tag" class="shrink-0 rounded bg-brand-500/10 px-1.5 py-0.5 text-xs text-brand-300">{{ tag }}</span>
        </div>
      </div>
      <div class="mt-auto flex items-center justify-between border-t border-border-subtle pt-2 text-xs text-ink-muted">
        <span>{{ work.type === 'mod' ? '导入' : '启动' }} {{ work.launchCount }}</span>
        <span class="inline-flex items-center gap-0.5">
          <svg class="h-3 w-3 text-warning" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M10 1.5 12.6 7l6 .6-4.5 4 1.3 5.9L10 14.4 4.6 17.5 5.9 11.6l-4.5-4 6-.6L10 1.5z" />
          </svg>
          {{ work.ratingAverage.toFixed(1) }} · 收藏 {{ work.favoriteCount }}
        </span>
        <span>v{{ work.versionNumber }}</span>
      </div>
    </div>
  </button>
</template>
