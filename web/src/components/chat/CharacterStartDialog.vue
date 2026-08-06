<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { usePersonasStore } from '@/stores/personas'
import { characterGreetings } from '@/lib/storyFromCharacter'
import type { Character, CharacterStartSelection } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'

const CUSTOM_PERSONA_ID = '__custom__'

const props = withDefaults(defineProps<{
  modelValue: boolean
  character: Character | null
  busy?: boolean
}>(), {
  busy: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  start: [selection: CharacterStartSelection]
}>()

const personas = usePersonasStore()
const selectedGreetingIndex = ref(0)
const selectedPersonaId = ref(CUSTOM_PERSONA_ID)
const playerName = ref('User')
const playerDescription = ref('')
let initializeEpoch = 0

const greetings = computed(() => characterGreetings(props.character))
const selectedGreeting = computed(() => {
  const greeting = greetings.value[selectedGreetingIndex.value] || ''
  return greeting
    .replace(/\{\{char\}\}/gi, props.character?.name || '角色')
    .replace(/\{\{user\}\}/gi, playerName.value.trim() || 'User')
})
const background = computed(() => {
  const character = props.character
  const explicitScenario = (character?.data?.scenario || character?.scenario || '').trim()
  const description = (character?.data?.description || character?.description || '').trim()
  const embeddedScenario = description.match(
    /(?:^|[;[\n])\s*(?:scenario|场景|背景)\s*[:=：]\s*([^\]\n]+)/i,
  )?.[1]?.trim()
  const source = explicitScenario || embeddedScenario || description
  const text = source.length > 600 ? `${source.slice(0, 597).trimEnd()}...` : source
  return text
    .replace(/\{\{char\}\}/gi, character?.name || '角色')
    .replace(/\{\{user\}\}/gi, playerName.value.trim() || 'User')
})

function applyPersona(id: string) {
  selectedPersonaId.value = id
  const persona = personas.getPersona(id)
  // 切到「本次自定义」保留已输入的内容，方便在某个 persona 基础上微调
  if (!persona) return
  playerName.value = persona.name || 'User'
  playerDescription.value = persona.description || ''
}

async function initialize() {
  const epoch = ++initializeEpoch
  await personas.load()
  if (epoch !== initializeEpoch || !props.modelValue) return
  selectedGreetingIndex.value = 0
  playerName.value = 'User'
  playerDescription.value = ''
  const personaId = personas.activePersonaId || personas.personas[0]?.id || CUSTOM_PERSONA_ID
  applyPersona(personaId)
}

function updateOpen(open: boolean) {
  if (!open && props.busy) return
  emit('update:modelValue', open)
}

function confirmStart() {
  if (!props.character || props.busy) return
  emit('start', {
    greeting: selectedGreeting.value,
    greetingIndex: selectedGreetingIndex.value,
    persona: {
      id: selectedPersonaId.value === CUSTOM_PERSONA_ID ? '' : selectedPersonaId.value,
      name: playerName.value.trim() || 'User',
      description: playerDescription.value.trim(),
    },
  })
}

watch(
  () => [props.modelValue, props.character?.avatar] as const,
  ([open]) => {
    if (open) void initialize()
    else initializeEpoch += 1
  },
)
</script>

<template>
  <AppDialog
    :model-value="modelValue"
    :title="character ? `设置开局 · ${character.name}` : '设置开局'"
    size="lg"
    @update:model-value="updateOpen"
  >
    <div class="max-h-[70dvh] space-y-5 overflow-y-auto pr-1">
      <section v-if="background" class="border-b border-border-subtle pb-4">
        <p class="text-xs font-semibold text-ink-muted">背景设定</p>
        <p class="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-ink-secondary">
          {{ background }}
        </p>
      </section>

      <section class="space-y-3 border-b border-border-subtle pb-4">
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm font-semibold text-ink-primary">角色开场</p>
          <span class="text-xs text-ink-muted">{{ greetings.length ? `${greetings.length} 个开局` : '无预置开局' }}</span>
        </div>
        <AppSelect
          v-if="greetings.length > 1"
          :model-value="String(selectedGreetingIndex)"
          @update:model-value="selectedGreetingIndex = Number($event)"
        >
          <option v-for="(_, index) in greetings" :key="index" :value="index">开局 {{ index + 1 }}</option>
        </AppSelect>
        <p
          v-if="selectedGreeting"
          class="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken px-3 py-2.5 text-sm leading-6 text-ink-secondary ring-1 ring-border-subtle"
        >
          {{ selectedGreeting }}
        </p>
        <p v-else class="text-sm text-ink-muted">这个角色没有预置开场白，将从玩家的第一条消息开始。</p>
      </section>

      <section class="space-y-4">
        <div>
          <p class="text-sm font-semibold text-ink-primary">玩家身份</p>
          <p class="mt-1 text-xs text-ink-muted">身份会固定在这段聊天中。</p>
        </div>
        <AppFormField label="身份来源">
          <AppSelect :model-value="selectedPersonaId" @update:model-value="applyPersona">
            <option v-for="persona in personas.personas" :key="persona.id" :value="persona.id">
              {{ persona.name }}{{ persona.id === personas.activePersonaId ? ' · 当前' : '' }}
            </option>
            <option :value="CUSTOM_PERSONA_ID">本次自定义</option>
          </AppSelect>
        </AppFormField>
        <div class="grid gap-4 sm:grid-cols-2">
          <AppFormField label="玩家名称" required>
            <AppInput v-model="playerName" placeholder="User" />
          </AppFormField>
          <AppFormField label="身份摘要">
            <AppTextarea
              v-model="playerDescription"
              :rows="3"
              auto-grow
              :max-height="160"
              placeholder="身份、经历、与角色的关系"
            />
          </AppFormField>
        </div>
      </section>
    </div>

    <template #footer>
      <AppButton variant="secondary" :disabled="busy" @click="updateOpen(false)">取消</AppButton>
      <AppButton variant="gradient" :disabled="busy || !character" @click="confirmStart">
        {{ busy ? '正在创建…' : '进入故事' }}
      </AppButton>
    </template>
  </AppDialog>
</template>
