<script setup lang="ts">
defineProps<{
  label?: string
  hint?: string
  error?: string
  required?: boolean
  inline?: boolean
}>()
</script>

<template>
  <div :class="['flex', inline ? 'flex-row items-center gap-3' : 'flex-col gap-1.5']">
    <label v-if="label" :class="['text-xs font-medium text-ink-secondary', inline ? 'shrink-0' : '']">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <div :class="inline ? 'flex-1' : ''">
      <slot />
      <p v-if="error" class="mt-1 text-xs text-red-500">{{ error }}</p>
      <p v-else-if="hint" class="mt-1 text-xs text-ink-muted">{{ hint }}</p>
    </div>
  </div>
</template>
