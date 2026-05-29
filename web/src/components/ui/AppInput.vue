<script setup lang="ts">
defineProps<{
  modelValue: string | number
  placeholder?: string
  type?: string
  disabled?: boolean
  readonly?: boolean
  step?: string | number
  min?: string | number
  max?: string | number
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="relative flex items-center w-full">
    <span v-if="$slots.prefix" class="absolute left-3 text-ink-muted flex items-center pointer-events-none">
      <slot name="prefix" />
    </span>
    <input
      :type="type || 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :step="step"
      :min="min"
      :max="max"
      :class="[
        'w-full rounded-lg bg-surface border border-border text-sm text-ink-primary placeholder-ink-muted transition-all duration-150 hover:border-border-strong',
        'focus:outline-none focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/30 focus:shadow-glow',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        $slots.prefix ? 'pl-9' : 'pl-3',
        $slots.suffix ? 'pr-9' : 'pr-3',
        'py-2',
      ]"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="$slots.suffix" class="absolute right-3 text-ink-muted flex items-center pointer-events-none">
      <slot name="suffix" />
    </span>
  </div>
</template>
