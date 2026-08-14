<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
  as?: 'div' | 'section' | 'article'
  tone?: 'default' | 'sunken' | 'glow' | 'warning'
  collapsible?: boolean
  title?: string
  defaultOpen?: boolean
}>(), {
  defaultOpen: true,
})

const surfaceClass = computed(() => {
  if (props.tone === 'sunken') return 'bg-surface-sunken border-border-subtle'
  if (props.tone === 'glow') return 'bg-surface border-brand-500/30 shadow-glow'
  if (props.tone === 'warning') return 'bg-warning-soft border-warning/20'
  return 'bg-surface border-border'
})

const paddingClass = computed(() => {
  if (props.padding === 'none') return ''
  if (props.padding === 'sm') return 'p-3'
  if (props.padding === 'lg') return 'p-6'
  return 'p-4'
})

const hoverClass = computed(() =>
  props.hover ? 'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-glow' : '',
)
</script>

<template>
  <details
    v-if="collapsible"
    :open="defaultOpen"
    :class="['overflow-hidden rounded-xl border', surfaceClass, hoverClass]"
  >
    <summary class="app-summary cursor-pointer list-none px-4 py-3 transition-colors hover:bg-surface-elevated">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="flex items-center gap-2 text-sm font-semibold text-ink-primary">
          <span class="h-4 w-1 shrink-0 rounded-full bg-brand-gradient" />
          <slot name="title">{{ title }}</slot>
        </h3>
        <span v-if="$slots.summary" class="text-xs text-ink-muted">
          <slot name="summary" />
        </span>
      </div>
    </summary>
    <div :class="['border-t border-border-subtle', paddingClass]">
      <slot />
    </div>
  </details>
  <component
    :is="as || 'section'"
    v-else
    :class="['rounded-xl border', surfaceClass, paddingClass, hoverClass]"
  >
    <slot />
  </component>
</template>

<style scoped>
.app-summary::-webkit-details-marker {
  display: none;
}
.app-summary::marker {
  content: none;
}
</style>
