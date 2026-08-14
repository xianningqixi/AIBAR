<script setup lang="ts" generic="T extends string | number">
defineProps<{
  modelValue: T
  options: Array<{ value: T; label: string; icon?: string }>
  size?: 'sm' | 'md'
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()
</script>

<template>
  <div
    role="radiogroup"
    class="inline-flex items-center gap-0.5 rounded-xl bg-surface-sunken p-1 ring-1 ring-border-subtle"
    :class="disabled ? 'opacity-50 pointer-events-none' : ''"
  >
    <button
      v-for="option in options"
      :key="String(option.value)"
      type="button"
      role="radio"
      :aria-checked="modelValue === option.value"
      :class="[
        'rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        modelValue === option.value
          ? 'bg-surface text-brand-300 shadow-sm ring-1 ring-border-subtle'
          : 'text-ink-secondary hover:text-ink-primary',
      ]"
      @click="emit('update:modelValue', option.value)"
    >
      <span v-if="option.icon" class="mr-1" aria-hidden="true">{{ option.icon }}</span>{{ option.label }}
    </button>
  </div>
</template>
