<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}>(), {
  min: 0,
  max: 100,
  step: 1,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

// 已填充段百分比，用于品牌渐变轨道
const percent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / range) * 100))
})
</script>

<template>
  <input
    type="range"
    class="app-slider w-full"
    :class="disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'"
    :value="modelValue"
    :min="min"
    :max="max"
    :step="step"
    :disabled="disabled"
    :style="{ '--fill': `${percent}%` }"
    @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
  />
</template>

<style scoped>
.app-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 6px;
  border-radius: 9999px;
  background:
    linear-gradient(90deg, #8b5cf6, #ec4899) 0 / var(--fill, 0%) 100% no-repeat,
    rgb(var(--c-ink-primary) / 0.08);
  outline-offset: 4px;
}
.app-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 18px;
  width: 18px;
  border-radius: 9999px;
  background: rgb(var(--c-surface));
  border: 2px solid rgb(var(--c-brand-500));
  box-shadow: 0 1px 4px rgb(var(--c-shadow) / 0.25);
  transition: transform 0.15s ease;
}
.app-slider::-webkit-slider-thumb:hover {
  transform: scale(1.12);
}
.app-slider::-moz-range-thumb {
  height: 18px;
  width: 18px;
  border-radius: 9999px;
  background: rgb(var(--c-surface));
  border: 2px solid rgb(var(--c-brand-500));
  box-shadow: 0 1px 4px rgb(var(--c-shadow) / 0.25);
  transition: transform 0.15s ease;
}
.app-slider::-moz-range-thumb:hover {
  transform: scale(1.12);
}
.app-slider:focus-visible {
  outline: 2px solid rgb(var(--c-brand-500));
}
</style>
