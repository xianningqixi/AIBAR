<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  icon?: 'chat' | 'box' | 'search' | 'book'
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div class="mb-4 text-ink-muted/40">
      <slot name="icon">
        <svg v-if="icon === 'chat'" class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <svg v-else-if="icon === 'search'" class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <svg v-else-if="icon === 'book'" class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <svg v-else class="w-14 h-14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </slot>
    </div>
    <h3 v-if="title" class="text-sm font-medium text-ink-secondary mb-1">{{ title }}</h3>
    <p v-if="description" class="text-xs text-ink-muted max-w-sm">{{ description }}</p>
    <div v-if="$slots.actions" class="mt-5 flex items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
