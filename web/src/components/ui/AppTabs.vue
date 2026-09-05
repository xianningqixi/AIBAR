<script setup lang="ts">
import { computed, ref } from 'vue'

export interface Tab {
  key: string
  label: string
  badge?: string | number
  group?: string
}

const props = defineProps<{
  modelValue: string
  tabs: Tab[]
  ariaLabel?: string
  panelPrefix?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const tablist = ref<HTMLElement>()
function onKeydown(event: KeyboardEvent, key: string) {
  const index = props.tabs.findIndex(tab => tab.key === key)
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % props.tabs.length
  else if (event.key === 'ArrowLeft') next = (index - 1 + props.tabs.length) % props.tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = props.tabs.length - 1
  else return
  event.preventDefault()
  const tab = props.tabs[next]
  if (!tab) return
  emit('update:modelValue', tab.key)
  const button = tablist.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]
  button?.focus({ preventScroll: true })
  button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
}

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
    <div ref="tablist" class="flex items-center gap-2 overflow-x-auto border-b border-border-subtle" role="tablist" :aria-label="ariaLabel || '页面选项'">
      <template v-for="item in grouped" :key="item.type === 'group' ? `g-${item.label}` : item.tab.key">
        <span
          v-if="item.type === 'group'"
          class="ml-2 mr-1 shrink-0 select-none text-[11px] font-semibold uppercase tracking-wider text-ink-muted"
          role="presentation"
        >
          {{ item.label }}
        </span>
        <button
          v-else
          type="button"
          role="tab"
          :aria-selected="modelValue === item.tab.key"
          :aria-controls="panelPrefix ? `${panelPrefix}${item.tab.key}` : undefined"
          :tabindex="modelValue === item.tab.key ? 0 : -1"
          :class="[
            'relative shrink-0 min-h-12 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
            modelValue === item.tab.key
              ? 'text-brand-300'
              : 'text-ink-muted hover:text-ink-secondary',
          ]"
          @keydown="onKeydown($event, item.tab.key)"
          @click="emit('update:modelValue', item.tab.key)"
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
  </div>
</template>
