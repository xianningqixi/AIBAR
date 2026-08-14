<script setup lang="ts">
defineProps<{
  modelValue: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="relative">
    <select
      :value="modelValue"
      :disabled="disabled"
      class="h-10 w-full appearance-none rounded-lg bg-surface border border-border pl-3 pr-9 text-sm text-ink-primary transition-all duration-150 hover:border-border-strong focus:outline-none focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/30 focus:shadow-glow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <slot />
    </select>
    <svg
      class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </div>
</template>
