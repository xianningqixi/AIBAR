<script setup lang="ts">
import { ref, watch, nextTick, onMounted } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  autoGrow?: boolean
  maxHeight?: number
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()

const el = ref<HTMLTextAreaElement>()

function resize() {
  if (!props.autoGrow || !el.value) return
  el.value.style.height = 'auto'
  const max = props.maxHeight ?? 320
  el.value.style.height = Math.min(el.value.scrollHeight, max) + 'px'
}

watch(() => props.modelValue, () => nextTick(resize))
onMounted(() => nextTick(resize))
</script>

<template>
  <textarea
    ref="el"
    :value="modelValue"
    :placeholder="placeholder"
    :rows="rows ?? 4"
    :disabled="disabled"
    class="w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm text-ink-primary placeholder-ink-muted transition-colors duration-150 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50 disabled:cursor-not-allowed resize-y"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>
