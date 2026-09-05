<script setup lang="ts">
const props = defineProps<{
  label?: string
  for?: string
  hint?: string
  error?: string
  required?: boolean
  inline?: boolean
}>()
</script>

<template>
  <div :class="['flex', inline ? 'flex-row items-start gap-3' : 'flex-col gap-1.5']">
    <label v-if="label" :for="props.for" :class="['text-xs font-medium text-ink-secondary', inline ? 'shrink-0 pt-1.5' : '']">
      {{ label }}
      <span v-if="required" class="text-danger">*</span>
    </label>
    <div :class="inline ? 'flex-1' : ''">
      <slot />
      <p v-if="error" class="mt-1 text-xs text-danger">{{ error }}</p>
      <p v-else-if="hint" class="mt-1 text-xs text-ink-muted">{{ hint }}</p>
    </div>
  </div>
</template>
