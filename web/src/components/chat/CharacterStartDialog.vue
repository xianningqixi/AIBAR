<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { usePersonasStore } from '@/stores/personas'
import {
  characterGreetingPreview,
  characterGreetings,
  isInteractiveCharacterGreeting,
} from '@/lib/storyFromCharacter'
import type { Character, CharacterStartSelection } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppInput from '@/components/ui/AppInput.vue'
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
const backgroundExpanded = ref(false)
const nameInput = ref<InstanceType<typeof AppInput> | null>(null)
let initializeEpoch = 0

const greetings = computed(() => characterGreetings(props.character))
const selectedGreetingSource = computed(() => greetings.value[selectedGreetingIndex.value] || '')
const interactiveGreeting = computed(() => (
  isInteractiveCharacterGreeting(props.character, selectedGreetingSource.value)
))
const selectedGreetingPreview = computed(() => replaceGreetingPlaceholders(
  characterGreetingPreview(props.character, selectedGreetingSource.value),
))
const avatarUrl = computed(() => {
  const avatar = props.character?.avatar
  if (!avatar || avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
})

function replaceGreetingPlaceholders(greeting: string) {
  return greeting
    .replace(/\{\{char\}\}/gi, props.character?.name || '角色')
    .replace(/\{\{user\}\}/gi, playerName.value.trim() || 'User')
}
const background = computed(() => {
  const character = props.character
  const explicitScenario = (character?.data?.scenario || character?.scenario || '').trim()
  const description = (character?.data?.description || character?.description || '').trim()
  const embeddedScenario = description.match(
    /(?:^|[;[\n])\s*(?:scenario|场景|背景)\s*[:=：]\s*([^\]\n]+)/i,
  )?.[1]?.trim()
  const source = explicitScenario || embeddedScenario || description
  return source
    .replace(/\{\{char\}\}/gi, character?.name || '角色')
    .replace(/\{\{user\}\}/gi, playerName.value.trim() || 'User')
})

const backgroundShort = computed(() => {
  const text = background.value
  return text.length > 180 ? `${text.slice(0, 177).trimEnd()}...` : text
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
  backgroundExpanded.value = false
  const personaId = personas.activePersonaId || personas.personas[0]?.id || CUSTOM_PERSONA_ID
  applyPersona(personaId)
  await nextTick()
  // 自动聚焦玩家名称输入框
  const input = nameInput.value?.$el?.querySelector('input') as HTMLInputElement | undefined
  input?.focus()
}

function updateOpen(open: boolean) {
  if (!open && props.busy) return
  emit('update:modelValue', open)
}

function confirmStart() {
  if (!props.character || props.busy) return
  emit('start', {
    greeting: replaceGreetingPlaceholders(selectedGreetingSource.value),
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
    :title="character ? `开始与 ${character.name} 聊天` : '开始新对话'"
    size="lg"
    @update:model-value="updateOpen"
  >
    <div class="grid max-h-[min(70dvh,720px)] gap-5 overflow-y-auto md:grid-cols-[200px_minmax(0,1fr)]">
      <!-- 左侧：角色封面与背景 -->
      <div class="space-y-4">
        <div class="mx-auto w-40 md:w-full">
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            class="aspect-[3/4] w-full rounded-2xl object-cover shadow-elevated ring-1 ring-border-subtle"
            alt=""
          />
          <div
            v-else
            class="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-brand-soft text-brand-300 shadow-elevated ring-1 ring-border-subtle"
          >
            <svg class="h-16 w-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
        </div>

        <div v-if="background" class="rounded-xl bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-xs font-semibold text-ink-muted">背景设定</p>
          <p class="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
            {{ backgroundExpanded ? background : backgroundShort }}
          </p>
          <button
            v-if="background.length > 180"
            class="mt-1.5 text-xs text-brand-300 hover:text-brand-200"
            @click="backgroundExpanded = !backgroundExpanded"
          >
            {{ backgroundExpanded ? '收起' : '展开' }}
          </button>
        </div>
      </div>

      <!-- 右侧：开场与玩家身份 -->
      <div class="space-y-5">
        <section class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-ink-primary">角色开场</p>
            <span class="text-xs text-ink-muted">{{ greetings.length ? `${greetings.length} 个开局` : '无预置开局' }}</span>
          </div>

          <!-- 横向可选卡片：默认折叠为 3 行，提供沉浸感 -->
          <div v-if="greetings.length > 1" class="flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="(_, index) in greetings"
              :key="index"
              type="button"
              class="shrink-0 rounded-lg px-3 py-2 text-left text-xs transition-all"
              :class="selectedGreetingIndex === index
                ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/40'
                : 'bg-surface-sunken text-ink-secondary ring-1 ring-border-subtle hover:bg-surface hover:text-ink-primary'"
              @click="selectedGreetingIndex = index"
            >
              <span class="font-medium">开局 {{ index + 1 }}</span>
            </button>
          </div>

          <div
            v-if="selectedGreetingSource"
            class="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-sunken px-4 py-3 text-sm leading-6 text-ink-secondary ring-1 ring-border-subtle"
          >
            <p>{{ selectedGreetingPreview }}</p>
            <p v-if="interactiveGreeting" class="mt-2 text-xs text-ink-muted">完整内容会在进入故事后加载。</p>
          </div>
          <p v-else class="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-ink-muted ring-1 ring-border-subtle">这个角色没有预置开场白，将从玩家的第一条消息开始。</p>
        </section>

        <section class="space-y-4">
          <div>
            <p class="text-sm font-semibold text-ink-primary">玩家身份</p>
            <p class="mt-1 text-xs text-ink-muted">身份会固定在这段聊天中。</p>
          </div>
          <AppFormField label="身份来源">
            <select
              :value="selectedPersonaId"
              class="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/30"
              @change="applyPersona(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="persona in personas.personas" :key="persona.id" :value="persona.id">
                {{ persona.name }}{{ persona.id === personas.activePersonaId ? ' · 当前' : '' }}
              </option>
              <option :value="CUSTOM_PERSONA_ID">本次自定义</option>
            </select>
          </AppFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <AppFormField label="玩家名称" required>
              <AppInput ref="nameInput" v-model="playerName" placeholder="你的名字" />
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
    </div>

    <template #footer>
      <AppButton variant="ghost" :disabled="busy" @click="updateOpen(false)">取消</AppButton>
      <AppButton variant="gradient" :disabled="busy || !character" @click="confirmStart">
        {{ busy ? '正在创建…' : '进入故事' }}
      </AppButton>
    </template>
  </AppDialog>
</template>
