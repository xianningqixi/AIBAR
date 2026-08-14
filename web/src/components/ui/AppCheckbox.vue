<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label
    class="inline-flex cursor-pointer items-center gap-2 select-none"
    :class="disabled ? 'cursor-not-allowed opacity-50' : ''"
  >
    <input
      type="checkbox"
      class="peer sr-only"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span
      class="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-strong bg-surface transition-all duration-150 peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40"
      aria-hidden="true"
    >
      <svg
        class="h-3 w-3 text-white transition-opacity duration-150"
        :class="modelValue ? 'opacity-100' : 'opacity-0'"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path d="M2.5 6.5 5 9l4.5-5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
    <span v-if="label || $slots.default" class="text-sm text-ink-primary"><slot>{{ label }}</slot></span>
  </label>
</template>
