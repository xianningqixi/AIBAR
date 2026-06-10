<script setup lang="ts">
defineProps<{
  size?: 'sm' | 'md' | 'lg'
  inline?: boolean
}>()
</script>

<template>
  <div :class="inline ? 'inline-flex' : 'flex items-center justify-center p-4'">
    <div
      :class="[
        'animate-spin rounded-full border-2 border-border border-t-brand-500',
        size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8 border-[3px]' : 'w-5 h-5',
      ]"
    />
  </div>
</template>
