<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { usePersonasStore } from '@/stores/personas'
import type { Persona } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'

const personas = usePersonasStore()

const selectedPersonaId = ref('')

const selectedPersona = computed<Persona | null>(() => {
  return personas.personas.find((p) => p.id === selectedPersonaId.value) || personas.personas[0] || null
})

function addPersona() {
  const p = personas.createPersona()
  selectedPersonaId.value = p.id
}

function deleteSelectedPersona(persona: Persona) {
  personas.deletePersona(persona.id)
  selectedPersonaId.value = personas.personas[0]?.id || ''
}

onMounted(async () => {
  await personas.load()
  selectedPersonaId.value = personas.activePersonaId || personas.personas[0]?.id || ''
})
</script>

<template>
  <div class="grid lg:grid-cols-[300px_1fr] gap-4">
    <AppCard padding="md">
      <div class="flex flex-wrap gap-2 mb-4">
        <AppButton size="sm" @click="addPersona">+ 新建</AppButton>
      </div>
      <div class="space-y-1">
        <button
          v-for="p in personas.personas"
          :key="p.id"
          :class="[
            'relative w-full text-left px-3 py-2.5 rounded-lg transition-colors',
            selectedPersonaId === p.id
              ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
          ]"
          @click="selectedPersonaId = p.id"
        >
          <span
            v-if="selectedPersonaId === p.id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
          />
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium truncate">{{ p.name }}</span>
            <span v-if="personas.activePersonaId === p.id" class="text-[10px] text-emerald-600 shrink-0">当前</span>
          </div>
          <div class="mt-1 text-[11px] text-ink-muted line-clamp-1">
            {{ p.description || '无描述' }}
          </div>
        </button>
        <AppEmpty v-if="!personas.personas.length" icon="chat" title="暂无 Persona" description="点击上方新建。" />
      </div>
    </AppCard>

    <AppCard v-if="selectedPersona" padding="md" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-ink-primary">Persona 详情</h2>
          <p class="text-xs text-ink-muted mt-1">Persona 代表你的角色，生成时作为 user_name 使用。</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
            <input
              type="radio"
              :checked="personas.activePersonaId === selectedPersona.id"
              class="accent-brand-500"
              @change="personas.setActive(selectedPersona!.id)"
            />
            设为当前
          </label>
          <button
            v-if="personas.personas.length > 1"
            class="text-xs text-red-500 hover:text-red-600 transition-colors"
            @click="deleteSelectedPersona(selectedPersona)"
          >
            删除
          </button>
        </div>
      </div>

      <AppFormField label="名称">
        <AppInput
          :model-value="selectedPersona.name"
          @update:model-value="(v) => personas.updatePersona(selectedPersona!.id, { name: v as string })"
        />
      </AppFormField>

      <AppFormField label="描述" hint="给模型看的你的身份描述。">
        <AppTextarea
          :model-value="selectedPersona.description"
          :rows="6"
          auto-grow
          placeholder="例如：我是一名来自北方王国的旅行者，性格好奇且喜欢冒险。"
          @update:model-value="(v) => personas.updatePersona(selectedPersona!.id, { description: v as string })"
        />
      </AppFormField>
    </AppCard>
  </div>
</template>
