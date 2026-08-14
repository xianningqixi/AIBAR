<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { WorldInfoEntry, WorldInfoFile } from '@/api/types'
import { confirmDialog } from '@/composables/useDialog'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'

const props = defineProps<{ file: WorldInfoFile }>()
const emit = defineEmits<{
  (e: 'update', file: WorldInfoFile): void
}>()

const selectedKey = ref<string>('')

const isArrayShape = computed(() => Array.isArray(props.file.entries))

const entries = computed<Array<{ key: string; entry: WorldInfoEntry }>>(() => {
  if (isArrayShape.value) {
    return (props.file.entries as WorldInfoEntry[]).map((entry, i) => ({
      key: String(i),
      entry,
    }))
  }
  const obj = (props.file.entries as Record<string, WorldInfoEntry>) || {}
  return Object.entries(obj).map(([k, v]) => ({ key: k, entry: v }))
})

const selectedEntry = computed<WorldInfoEntry | null>(() => {
  const found = entries.value.find((it) => it.key === selectedKey.value)
  return found?.entry || null
})

watch(
  () => entries.value,
  (list) => {
    if (!selectedKey.value && list[0]) {
      selectedKey.value = list[0].key
    }
  },
  { immediate: true },
)

function emitUpdate(updater: (file: WorldInfoFile) => WorldInfoFile) {
  emit('update', updater(props.file))
}

function entryDisplay(entry: WorldInfoEntry): string {
  return entry.comment || (Array.isArray(entry.key) ? entry.key.join(', ') : '') || '(未命名)'
}

function entryKeysText(entry: WorldInfoEntry): string {
  return Array.isArray(entry.key) ? entry.key.join(', ') : ''
}

function updateEntry(updates: Partial<WorldInfoEntry>) {
  if (!selectedEntry.value) return
  emitUpdate((file) => {
    if (Array.isArray(file.entries)) {
      const idx = Number(selectedKey.value)
      const next = [...file.entries]
      next[idx] = { ...next[idx], ...updates }
      return { ...file, entries: next }
    }
    const obj = { ...((file.entries as Record<string, WorldInfoEntry>) || {}) }
    obj[selectedKey.value] = { ...obj[selectedKey.value], ...updates }
    return { ...file, entries: obj }
  })
}

function setKeys(text: string) {
  const keys = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  updateEntry({ key: keys })
}

function nextUid(): number {
  const used = entries.value
    .map((it) => Number(it.entry.uid))
    .filter((n) => !Number.isNaN(n))
  if (!used.length) return 0
  return Math.max(...used) + 1
}

function addEntry() {
  const uid = nextUid()
  const newEntry: WorldInfoEntry = {
    uid,
    key: [],
    keysecondary: [],
    comment: '新条目',
    content: '',
    constant: false,
    disable: false,
    order: 100,
  }
  emitUpdate((file) => {
    if (Array.isArray(file.entries)) {
      const next = [...file.entries, newEntry]
      const newKey = String(next.length - 1)
      queueMicrotask(() => {
        selectedKey.value = newKey
      })
      return { ...file, entries: next }
    }
    const obj = { ...((file.entries as Record<string, WorldInfoEntry>) || {}) }
    const newKey = String(uid)
    obj[newKey] = newEntry
    queueMicrotask(() => {
      selectedKey.value = newKey
    })
    return { ...file, entries: obj }
  })
}

async function deleteEntry() {
  if (!selectedEntry.value) return
  if (!await confirmDialog({ title: '删除条目', message: `删除条目「${entryDisplay(selectedEntry.value)}」？`, danger: true, confirmText: '删除' })) return
  emitUpdate((file) => {
    if (Array.isArray(file.entries)) {
      const idx = Number(selectedKey.value)
      const next = file.entries.filter((_, i) => i !== idx)
      queueMicrotask(() => {
        selectedKey.value = next[0] ? '0' : ''
      })
      return { ...file, entries: next }
    }
    const obj = { ...((file.entries as Record<string, WorldInfoEntry>) || {}) }
    delete obj[selectedKey.value]
    queueMicrotask(() => {
      const first = Object.keys(obj)[0]
      selectedKey.value = first || ''
    })
    return { ...file, entries: obj }
  })
}
</script>

<template>
  <div class="grid lg:grid-cols-[220px_1fr] gap-3 min-h-0">
    <div class="flex flex-col gap-2 min-h-0">
      <AppButton size="sm" @click="addEntry">+ 新条目</AppButton>
      <div class="flex-1 overflow-y-auto space-y-1 max-h-[480px] pr-1">
        <button
          v-for="item in entries"
          :key="item.key"
          :class="[
            'w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors',
            selectedKey === item.key
              ? 'bg-brand-500/15 text-brand-300'
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
            item.entry.disable ? 'opacity-50' : '',
          ]"
          @click="selectedKey = item.key"
        >
          <div class="font-medium truncate">{{ entryDisplay(item.entry) }}</div>
          <div class="text-[11px] text-ink-muted mt-0.5 truncate">
            <span v-if="item.entry.constant">[常驻]</span>
            <span v-else>{{ entryKeysText(item.entry) || '(无关键词)' }}</span>
          </div>
        </button>
        <AppEmpty
          v-if="entries.length === 0"
          icon="book"
          title="无条目"
          description="点击上方按钮新增。"
        />
      </div>
    </div>

    <div v-if="selectedEntry" class="space-y-3 min-h-0 overflow-y-auto pr-1">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold text-ink-primary">条目设置</h3>
        <AppButton size="sm" variant="danger" @click="deleteEntry">删除条目</AppButton>
      </div>
      <div class="grid md:grid-cols-2 gap-3">
        <AppFormField label="标题/备注">
          <AppInput
            :model-value="selectedEntry.comment || ''"
            placeholder="给自己看的标题"
            @update:model-value="(v) => updateEntry({ comment: v as string })"
          />
        </AppFormField>
        <AppFormField label="关键词" hint="逗号分隔;支持 /regex/i 形式。">
          <AppInput
            :model-value="entryKeysText(selectedEntry)"
            placeholder="key1, key2"
            @update:model-value="(v) => setKeys(v as string)"
          />
        </AppFormField>
        <AppFormField label="顺序 (order)">
          <AppInput
            type="number"
            :model-value="selectedEntry.order ?? 100"
            @update:model-value="(v) => updateEntry({ order: parseInt(String(v)) || 0 })"
          />
        </AppFormField>
        <AppFormField label="开关" inline>
          <div class="flex items-center gap-4 text-xs text-ink-secondary">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                class="accent-brand-500"
                :checked="selectedEntry.constant"
                @change="(e) => updateEntry({ constant: (e.target as HTMLInputElement).checked })"
              />
              常驻(忽略关键词)
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                class="accent-brand-500"
                :checked="selectedEntry.disable"
                @change="(e) => updateEntry({ disable: (e.target as HTMLInputElement).checked })"
              />
              禁用
            </label>
          </div>
        </AppFormField>
      </div>
      <AppFormField label="内容" hint="命中时会注入到系统提示的世界书段落。">
        <AppTextarea
          :model-value="selectedEntry.content || ''"
          :rows="10"
          auto-grow
          @update:model-value="(v) => updateEntry({ content: v })"
        />
      </AppFormField>
    </div>

    <div v-else class="flex items-center justify-center text-xs text-ink-muted">
      左侧选择或新增一个条目。
    </div>
  </div>
</template>
