<script setup lang="ts">
import { computed } from 'vue'

export interface Tab {
  key: string
  label: string
  badge?: string | number
  group?: string
}

const props = defineProps<{
  modelValue: string
  tabs: Tab[]
}>()

const grouped = computed(() => {
  const result: Array<{ type: 'group'; label: string } | { type: 'tab'; tab: Tab }> = []
  let lastGroup = ''
  for (const tab of props.tabs) {
    if (tab.group && tab.group !== lastGroup) {
      result.push({ type: 'group', label: tab.group })
      lastGroup = tab.group
    }
    result.push({ type: 'tab', tab })
  }
  return result
})
</script>

<template>
  <div class="relative">
    <div class="flex items-center gap-1 overflow-x-auto border-b border-border-subtle pb-0.5" role="tablist">
      <template v-for="(item, index) in grouped" :key="item.type === 'group' ? `g-${item.label}` : item.tab.key">
        <span
          v-if="item.type === 'group'"
          class="ml-2 mr-1 shrink-0 select-none text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
          role="presentation"
        >
          {{ item.label }}
        </span>
        <button
          v-else
          :id="`tab-${item.tab.key}`"
          role="tab"
          :aria-selected="modelValue === item.tab.key"
          :aria-controls="`tabpanel-${item.tab.key}`"
          :tabindex="modelValue === item.tab.key ? 0 : -1"
          :class="[
            'relative shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
            modelValue === item.tab.key
              ? 'text-ink-primary'
              : 'text-ink-muted hover:text-ink-secondary',
          ]"
          @click="$emit('update:modelValue', item.tab.key)"
          @keydown.left.prevent="$emit('update:modelValue', grouped[index - 1]?.type === 'tab' ? (grouped[index - 1] as Extract<typeof grouped[number], { type: 'tab' }>).tab.key : '')"
          @keydown.right.prevent="$emit('update:modelValue', grouped[index + 1]?.type === 'tab' ? (grouped[index + 1] as Extract<typeof grouped[number], { type: 'tab' }>).tab.key : '')"
        >
          <span class="inline-flex items-center gap-2">
            {{ item.tab.label }}
            <span
              v-if="item.tab.badge !== undefined && item.tab.badge !== null && item.tab.badge !== ''"
              :class="[
                'text-[11px] px-1.5 py-0.5 rounded-full leading-none',
                modelValue === item.tab.key ? 'bg-brand-500/15 text-brand-400' : 'bg-ink-primary/5 text-ink-muted',
              ]"
            >
              {{ item.tab.badge }}
            </span>
          </span>
          <span
            v-if="modelValue === item.tab.key"
            class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-gradient"
          />
        </button>
      </template>
    </div>
    <!-- 右侧滚动渐变提示 -->
    <div
      class="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-bg to-transparent"
      aria-hidden="true"
    />
  </div>
</template>
