<script setup lang="ts">
defineProps<{
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
  as?: 'div' | 'section' | 'article'
  tone?: 'default' | 'sunken' | 'glow'
}>()
</script>

<template>
  <component
    :is="as || 'section'"
    :class="[
      'rounded-xl border',
      tone === 'sunken'
        ? 'bg-surface-sunken border-border-subtle'
        : tone === 'glow'
          ? 'bg-surface border-brand-500/30 shadow-glow'
          : 'bg-surface border-border',
      padding === 'none' ? '' : padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-4',
      hover ? 'transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-glow' : '',
    ]"
  >
    <slot />
  </component>
</template>
