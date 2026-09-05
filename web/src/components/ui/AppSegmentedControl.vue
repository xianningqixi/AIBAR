<script setup lang="ts" generic="T extends string | number">
import { ref } from 'vue'

const props = defineProps<{
  modelValue: T
  options: ReadonlyArray<{ value: T; label: string; icon?: string }>
  size?: 'sm' | 'md'
  disabled?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()
const group = ref<HTMLElement>()
function onKeydown(event: KeyboardEvent, index: number) {
  if (props.disabled) return
  let next: number
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % props.options.length
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + props.options.length) % props.options.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = props.options.length - 1
  else return
  event.preventDefault()
  const option = props.options[next]
  if (!option) return
  emit('update:modelValue', option.value)
  group.value?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
}
</script>

<template>
  <div
    ref="group"
    role="radiogroup"
    :aria-label="ariaLabel"
    class="inline-flex max-w-full items-center overflow-x-auto gap-0.5 rounded-xl bg-surface-sunken p-1 ring-1 ring-border-subtle"
    :class="disabled ? 'opacity-50 pointer-events-none' : ''"
  >
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      type="button"
      role="radio"
      :disabled="disabled"
      :tabindex="modelValue === option.value || (!options.some(item => item.value === modelValue) && index === 0) ? 0 : -1"
      @keydown="onKeydown($event, index)"
      :aria-checked="modelValue === option.value"
      :class="[
        'shrink-0 whitespace-nowrap rounded-lg font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
        size === 'sm' ? 'min-h-8 px-3 py-1.5 text-xs' : 'min-h-9 px-4 py-2 text-sm',
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
