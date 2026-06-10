<script setup lang="ts">
interface Tab {
  key: string
  label: string
  badge?: string | number
}

defineProps<{
  modelValue: string
  tabs: Tab[]
}>()

defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div class="flex items-center gap-1 overflow-x-auto border-b border-border-subtle">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="[
        'relative shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
        modelValue === tab.key
          ? 'text-ink-primary'
          : 'text-ink-muted hover:text-ink-secondary',
      ]"
      @click="$emit('update:modelValue', tab.key)"
    >
      <span class="inline-flex items-center gap-2">
        {{ tab.label }}
        <span
          v-if="tab.badge !== undefined && tab.badge !== null && tab.badge !== ''"
          :class="[
            'text-[10px] px-1.5 py-0.5 rounded-full leading-none',
            modelValue === tab.key ? 'bg-brand-500/15 text-brand-400' : 'bg-ink-primary/5 text-ink-muted',
          ]"
        >
          {{ tab.badge }}
        </span>
      </span>
      <span
        v-if="modelValue === tab.key"
        class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-gradient"
      />
    </button>
  </div>
</template>
