<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePresetsStore } from '@/stores/presets'
import type { Preset } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'

const presets = usePresetsStore()

const selectedPresetId = ref('')

const selectedPreset = computed<Preset | null>(() => {
  return presets.presets.find((p) => p.id === selectedPresetId.value) || presets.presets[0] || null
})

function addPreset() {
  const p = presets.createPreset()
  selectedPresetId.value = p.id
}

function deleteSelectedPreset(preset: Preset) {
  if (!window.confirm(`删除预设「${preset.name || '未命名'}」？此操作不可恢复。`)) return
  presets.deletePreset(preset.id)
  selectedPresetId.value = presets.presets[0]?.id || ''
}

onMounted(async () => {
  await presets.load()
  selectedPresetId.value = presets.activePresetId || presets.presets[0]?.id || ''
})
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
    <AppCard padding="md">
      <div class="flex flex-wrap gap-2 mb-3">
        <AppButton size="sm" @click="addPreset">+ 新建</AppButton>
      </div>
      <div class="space-y-1">
        <button
          v-for="p in presets.presets"
          :key="p.id"
          :class="[
            'relative w-full text-left px-3 py-2.5 rounded-lg transition-colors',
            selectedPresetId === p.id
              ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
          ]"
          @click="selectedPresetId = p.id"
        >
          <span
            v-if="selectedPresetId === p.id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
          />
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium truncate">{{ p.name }}</span>
            <span v-if="presets.activePresetId === p.id" class="text-[11px] text-emerald-600 shrink-0">当前</span>
          </div>
          <div class="mt-1 text-[11px] text-ink-muted truncate">
            {{ p.systemPrompt ? `${p.systemPrompt.length} 字提示词` : '未填写额外提示词' }}
          </div>
        </button>
        <AppEmpty v-if="!presets.presets.length" icon="book" title="暂无预设" description="点击上方新建。" />
      </div>
    </AppCard>

    <AppCard v-if="selectedPreset" padding="md" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-ink-primary">提示词预设详情</h2>
          <p class="text-xs text-ink-muted mt-1">模型参数由管理员统一设置；这里保存追加到角色设定后的个人提示词。</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
            <input
              type="radio"
              :checked="presets.activePresetId === selectedPreset.id"
              class="accent-brand-500"
              @change="presets.setActive(selectedPreset!.id)"
            />
            设为当前
          </label>
          <button
            v-if="presets.presets.length > 1"
            class="text-xs text-red-500 hover:text-red-600 transition-colors"
            @click="deleteSelectedPreset(selectedPreset)"
          >
            删除
          </button>
        </div>
      </div>

      <AppFormField label="名称">
        <AppInput
          :model-value="selectedPreset.name"
          @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { name: v as string })"
        />
      </AppFormField>

      <AppFormField label="额外系统提示" hint="追加到角色系统提示末尾。">
        <AppTextarea
          :model-value="selectedPreset.systemPrompt"
          :rows="5"
          auto-grow
          @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { systemPrompt: v as string })"
        />
      </AppFormField>
    </AppCard>
  </div>
</template>
