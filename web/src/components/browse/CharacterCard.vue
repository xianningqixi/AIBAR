<script setup lang="ts">
import type { Character } from '@/api/types'
import { useCharactersStore } from '@/stores/characters'

const props = defineProps<{
  character: Character
}>()

const store = useCharactersStore()

function thumbnailUrl(avatar: string): string {
  if (!avatar || avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
}

function truncatedDescription(desc?: string, maxLen = 60): string {
  if (!desc) return ''
  return desc.length > maxLen ? desc.slice(0, maxLen).trimEnd() + '…' : desc
}

const description = props.character.description || props.character.data?.description || ''
</script>

<template>
  <div
    class="group relative rounded-xl bg-surface border border-border-subtle overflow-hidden cursor-pointer transition-all duration-150 hover:border-brand-500/40 hover:shadow-elevated hover:-translate-y-0.5"
  >
    <button
      class="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/45 backdrop-blur-sm hover:bg-black/65 transition-colors"
      :title="character.fav === 'true' ? '取消收藏' : '加入收藏'"
      @click.stop="store.toggleFav(character)"
    >
      <svg
        class="w-3.5 h-3.5"
        :class="character.fav === 'true' ? 'text-rose-400 fill-rose-400' : 'text-white/70'"
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      </svg>
    </button>

    <div class="aspect-[2/3] bg-surface-sunken relative overflow-hidden">
      <img
        v-if="character.avatar && character.avatar !== 'none'"
        :src="thumbnailUrl(character.avatar)"
        :alt="character.name"
        class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        loading="lazy"
      />
      <div v-else class="w-full h-full flex items-center justify-center text-ink-muted/50">
        <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      </div>

      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
        <h3 class="text-sm font-semibold text-white truncate drop-shadow-sm">{{ character.name }}</h3>
      </div>
    </div>

    <div class="p-3 space-y-2">
      <p v-if="description" class="text-xs text-ink-secondary line-clamp-2 leading-relaxed min-h-[2.5rem]">
        {{ truncatedDescription(description) }}
      </p>

      <div v-if="character.tags?.length" class="flex flex-wrap gap-1">
        <span
          v-for="tag in character.tags.slice(0, 3)"
          :key="tag"
          class="px-1.5 py-0.5 text-[10px] rounded bg-white/5 text-ink-muted"
        >
          {{ tag }}
        </span>
      </div>
    </div>
  </div>
</template>
