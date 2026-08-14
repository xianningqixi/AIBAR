<script setup lang="ts">
// 全站统一搜索框：左侧放大镜 + 可选清除按钮，尺寸与 AppInput 对齐
withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  size?: 'md' | 'lg'
  clearable?: boolean
  disabled?: boolean
  ariaLabel?: string
}>(), {
  placeholder: '搜索',
  size: 'md',
  clearable: true,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="relative flex w-full items-center">
    <span class="pointer-events-none absolute left-3 flex items-center text-ink-muted">
      <svg :class="size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
    </span>
    <input
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="ariaLabel || placeholder"
      :class="[
        'w-full rounded-lg border border-border bg-surface text-ink-primary placeholder-ink-muted transition-all duration-150 hover:border-border-strong',
        'focus:outline-none focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/30 focus:shadow-glow',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'lg' ? 'py-3 pl-10 text-base' : 'py-2 pl-9 text-sm',
        clearable && modelValue ? 'pr-9' : 'pr-3',
      ]"
      @input="onInput"
    />
    <button
      v-if="clearable && modelValue && !disabled"
      type="button"
      class="absolute right-2 flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-ink-primary/5 hover:text-ink-primary"
      aria-label="清除搜索"
      @click="emit('update:modelValue', '')"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* 隐藏浏览器自带的搜索清除按钮，使用统一样式 */
input[type='search']::-webkit-search-decoration,
input[type='search']::-webkit-search-cancel-button,
input[type='search']::-webkit-search-results-button,
input[type='search']::-webkit-search-results-decoration {
  appearance: none;
}
</style>
