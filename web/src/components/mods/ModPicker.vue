<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ModItem } from '@/stores/mods'
import SearchInput from '@/components/ui/SearchInput.vue'
import AppCheckbox from '@/components/ui/AppCheckbox.vue'

const props = withDefaults(defineProps<{
  modelValue: string[]
  mods: ModItem[]
  lockedIds?: string[]
  title?: string
  description?: string
  emptyText?: string
  compact?: boolean
}>(), {
  lockedIds: () => [],
  title: '加载 MOD',
  description: '',
  emptyText: '暂无 MOD。可以先到设置里创建一个。',
  compact: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const search = ref('')
const activeTab = ref<'all' | 'public' | 'mine' | 'selected'>('all')

const lockedSet = computed(() => new Set(props.lockedIds))
const selectedSet = computed(() => new Set([...props.modelValue, ...props.lockedIds]))

const tabs = computed(() => [
  { key: 'all' as const, label: '全部', count: props.mods.length },
  { key: 'public' as const, label: '公用Mod', count: props.mods.filter((m) => m.builtin).length },
  { key: 'mine' as const, label: '我的Mod', count: props.mods.filter((m) => !m.builtin).length },
  { key: 'selected' as const, label: '已加载', count: selectedSet.value.size },
])

const filteredMods = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.mods.filter((mod) => {
    if (activeTab.value === 'public' && !mod.builtin) return false
    if (activeTab.value === 'mine' && mod.builtin) return false
    if (activeTab.value === 'selected' && !selectedSet.value.has(mod.id)) return false
    if (!q) return true
    return (
      mod.name.toLowerCase().includes(q) ||
      String(mod.description || '').toLowerCase().includes(q) ||
      String(mod.content || '').toLowerCase().includes(q)
    )
  })
})

function positionLabel(position: ModItem['position']): string {
  if (position === 'system_prepend') return '系统前缀'
  if (position === 'user_suffix') return '用户后缀'
  return '系统后缀'
}

function toggleMod(id: string) {
  if (lockedSet.value.has(id)) return
  const next = props.modelValue.includes(id)
    ? props.modelValue.filter((item) => item !== id)
    : [...props.modelValue, id]
  emit('update:modelValue', next)
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-ink-primary">{{ title }}</h3>
        <p v-if="description" class="mt-1 text-xs text-ink-muted leading-relaxed max-w-xl">{{ description }}</p>
      </div>
      <div class="w-full sm:w-56">
        <SearchInput v-model="search" placeholder="搜索 MOD" />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-1 border-b border-border-subtle">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="[
          'relative px-3 py-2 text-xs font-medium transition-colors',
          activeTab === tab.key ? 'text-ink-primary' : 'text-ink-muted hover:text-ink-secondary',
        ]"
        @click="activeTab = tab.key"
      >
        <span class="inline-flex items-center gap-1.5">
          {{ tab.label }}
          <span class="rounded-full bg-ink-primary/5 px-1.5 py-0.5 text-[11px] leading-none text-ink-muted">{{ tab.count }}</span>
        </span>
        <span v-if="activeTab === tab.key" class="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />
      </button>
    </div>

    <div v-if="filteredMods.length === 0" class="rounded-lg border border-border-subtle bg-surface-sunken px-4 py-6 text-center text-xs text-ink-muted">
      {{ emptyText }}
    </div>

    <div v-else :class="compact ? 'space-y-3' : 'grid gap-4 md:grid-cols-2'">
      <label
        v-for="mod in filteredMods"
        :key="mod.id"
        :class="[
          'block rounded-lg border p-3 transition-colors',
          selectedSet.has(mod.id)
            ? 'border-brand-500/50 bg-brand-500/10'
            : 'border-border-subtle bg-surface-sunken hover:border-border',
          lockedSet.has(mod.id) ? 'cursor-default' : 'cursor-pointer',
        ]"
      >
        <div class="flex items-start gap-2.5">
          <AppCheckbox
            class="mt-1"
            :model-value="selectedSet.has(mod.id)"
            :disabled="lockedSet.has(mod.id)"
            @update:model-value="() => toggleMod(mod.id)"
          />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="truncate text-sm font-medium text-ink-primary">{{ mod.name }}</span>
              <span class="rounded bg-ink-primary/5 px-1.5 py-0.5 text-[11px] text-ink-muted">{{ mod.builtin ? '公用' : '我的' }}</span>
              <span v-if="mod.enabled" class="rounded bg-success/10 px-1.5 py-0.5 text-[11px] text-success">全局</span>
              <span class="rounded bg-ink-primary/5 px-1.5 py-0.5 text-[11px] text-ink-muted">{{ positionLabel(mod.position) }}</span>
            </div>
            <p v-if="mod.description" class="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-secondary">
              {{ mod.description }}
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              <span>{{ String(mod.content || '').length }} 字</span>
              <span v-if="lockedSet.has(mod.id)">已全局加载</span>
            </div>
          </div>
        </div>
      </label>
    </div>
  </section>
</template>
