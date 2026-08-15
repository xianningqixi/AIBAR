<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useModsStore } from '@/stores/mods'
import { usePresetsStore } from '@/stores/presets'
import { useSessionStore } from '@/stores/session'
import { useTtsStore } from '@/stores/tts'
import { useWorldInfoStore } from '@/stores/worldInfo'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import { getApiErrorMessage } from '@/api/client'
import { PROVIDER_VOICES, TTS_PROVIDERS } from '@/api/tts'
import { formatModelPricing } from '@/lib/points'
import type { TtsProvider } from '@/api/types'

// 从 ChatPage 拆出的右侧“聊天设置”抽屉：模型 / 身份 / 记忆 / 世界与 MOD / 语音 五个分页。
// 数据全部来自各自的 Pinia store，页面只传一个角色头像兜底（chat.character 未就位时）。
const props = defineProps<{
  characterAvatar?: string
}>()

const router = useRouter()
const chat = useChatStore()
const ui = useUiStore()
const models = useModelProfilesStore()
const modsStore = useModsStore()
const presets = usePresetsStore()
const tts = useTtsStore()
const session = useSessionStore()
const worldInfoStore = useWorldInfoStore()

const worlds = computed(() => worldInfoStore.worlds)

// 右侧高级抽屉分组：模型 / 身份 / 记忆 / 世界与 MOD / 语音
const drawerTab = ref('model')
const drawerTabs = computed(() => {
  const items = [
    { key: 'model', label: '模型' },
    { key: 'persona', label: '身份' },
    { key: 'memory', label: '记忆' },
    { key: 'world', label: '世界与MOD' },
  ]
  // 语音配置只对管理员开放，非管理员不展示该分页
  if (session.isAdmin) items.push({ key: 'voice', label: '语音' })
  return items
})

async function handleProfileSelect(profileId: string) {
  await chat.setSelectedProfileId(profileId)
  ui.addToast('本聊天的模型配置已更新', 'success')
}

async function handlePresetSelect(presetId: string) {
  await chat.setSelectedPresetId(presetId)
  ui.addToast(presetId ? '已应用预设参数' : '已取消预设', 'success')
}

async function handleWorldSelect(value: string) {
  await chat.setSelectedWorld(value)
  ui.addToast(value ? '已绑定本聊天的世界书' : '已解除世界书绑定', 'success')
}

const personaNameDraft = ref('')
const personaDescriptionDraft = ref('')
const personaSaving = ref(false)

function syncPersonaDraft() {
  const persona = chat.generationPersona
  personaNameDraft.value = persona.name
  personaDescriptionDraft.value = persona.description
}

watch(
  () => [ui.modelDrawerOpen && drawerTab.value === 'persona', chat.currentChatFile] as const,
  ([visible]) => {
    if (visible) syncPersonaDraft()
  },
)

async function saveChatPersona() {
  if (personaSaving.value) return
  personaSaving.value = true
  try {
    await chat.setChatPersona({
      name: personaNameDraft.value,
      description: personaDescriptionDraft.value,
    })
    syncPersonaDraft()
    ui.addToast('本聊天的身份已更新', 'success')
  } finally {
    personaSaving.value = false
  }
}

async function unfreezeChatPersona() {
  if (personaSaving.value) return
  personaSaving.value = true
  try {
    await chat.clearChatPersona()
    syncPersonaDraft()
    ui.addToast('已改为跟随全局身份', 'success')
  } finally {
    personaSaving.value = false
  }
}

function formatMemoryUpdatedAt(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function clearChatMemory() {
  await chat.clearMemorySummary()
  ui.addToast('记忆已清空', 'success')
}

const memoryStatusLabel = computed(() => {
  if (chat.memoryUpdating) return '整理中'
  if (chat.memorySummary) return '已更新'
  return chat.messages.length > 1 ? '待整理' : '等待对话'
})
const memoryStatusClass = computed(() => {
  if (chat.memoryUpdating) return 'bg-brand-500/15 text-brand-300'
  if (chat.memorySummary) return 'bg-success/15 text-success-strong'
  return chat.messages.length > 1 ? 'bg-warning/15 text-warning' : 'bg-ink-primary/5 text-ink-muted'
})
const memoryEmptyText = computed(() =>
  chat.messages.length > 1 ? '下次发送时整理历史' : '暂无记忆',
)

const globalModIds = computed(() =>
  modsStore.mods.filter((m) => m.enabled).map((m) => m.id),
)

function handleModIdsUpdate(ids: string[]) {
  const global = new Set(globalModIds.value)
  void chat.setSelectedModIds(ids.filter((id) => !global.has(id)))
}

// 世界书列表只有“世界与MOD”分页会用到，首次打开时再加载（store 内有缓存）。
async function ensureWorlds() {
  try {
    await worldInfoStore.load()
  } catch (e: unknown) {
    ui.addToast(`世界书列表加载失败：${getApiErrorMessage(e)}`, 'error')
  }
}
watch([() => ui.modelDrawerOpen, drawerTab], ([open, tab]) => {
  if (open && tab === 'world') void ensureWorlds()
})

const playableTtsProviders = computed(() => TTS_PROVIDERS.filter((provider) => (
  provider.playable && tts.settings[provider.id].enabled
)))
const currentCharacterAvatar = computed(() => chat.character?.avatar || props.characterAvatar || '')
const currentCharacterVoice = computed(() => {
  const avatar = currentCharacterAvatar.value
  return avatar ? tts.settings.characterVoices[avatar] : undefined
})
const chatTtsProvider = computed<TtsProvider>(() => currentCharacterVoice.value?.provider || tts.settings.defaultProvider)
const chatTtsVoice = computed(() => currentCharacterVoice.value?.voice || tts.settings[chatTtsProvider.value].voice || '')
const chatTtsVoiceOptions = computed(() => {
  const provider = chatTtsProvider.value
  const seen = new Set<string>()
  const custom = (tts.settings.customVoices[provider] || []).map((voice) => {
    seen.add(voice.voice)
    return { value: voice.voice, label: `${voice.name} · 自定义` }
  })
  const builtin = (PROVIDER_VOICES[provider] || [])
    .filter((voice) => !seen.has(voice))
    .map((voice) => ({ value: voice, label: voice }))
  return [...custom, ...builtin]
})
const chatTtsProviderEnabled = computed(() => !!tts.settings[chatTtsProvider.value]?.enabled)
const chatTtsFollowingDefault = computed(() => !currentCharacterVoice.value)

function setChatTtsProvider(provider: string) {
  const avatar = currentCharacterAvatar.value
  if (!avatar) return
  const nextProvider = provider as TtsProvider
  if (!tts.settings[nextProvider]?.enabled) {
    ui.addToast('该 TTS 渠道未启用，请先到设置里启用', 'warning')
    return
  }
  const nextVoice = tts.settings[nextProvider].voice || PROVIDER_VOICES[nextProvider]?.[0] || ''
  if (!nextVoice) {
    ui.addToast('该渠道没有可用音色，请先到设置里创建音色', 'warning')
    return
  }
  tts.setCharacterVoice(avatar, { provider: nextProvider, voice: nextVoice })
  ui.addToast('当前角色音色渠道已更新', 'success')
}

function setChatTtsVoice(voice: string) {
  const avatar = currentCharacterAvatar.value
  if (!avatar || !voice.trim()) return
  if (!tts.settings[chatTtsProvider.value].enabled) {
    ui.addToast('当前 TTS 渠道未启用，请先到设置里启用', 'warning')
    return
  }
  tts.setCharacterVoice(avatar, { provider: chatTtsProvider.value, voice: voice.trim() })
  ui.addToast('当前角色音色已更新', 'success')
}

function followDefaultTtsVoice() {
  const avatar = currentCharacterAvatar.value
  if (!avatar) return
  tts.setCharacterVoice(avatar, null)
  ui.addToast('当前角色已改为跟随默认音色', 'success')
}
</script>

<template>
  <AppDrawer
    :model-value="ui.modelDrawerOpen"
    side="right"
    title="聊天设置"
    width="24rem"
    @update:model-value="ui.modelDrawerOpen = $event"
  >
    <!-- 8 个互不相干的分组拆成 4 个分页：模型 / 记忆 / 世界与 MOD / 语音 -->
    <div class="px-5 pt-4">
      <AppTabs v-model="drawerTab" :tabs="drawerTabs" />
    </div>

    <div class="space-y-4 p-5">
      <template v-if="drawerTab === 'model'">
        <AppFormField label="当前聊天使用模型">
          <AppSelect
            :model-value="chat.selectedProfileId"
            @update:model-value="handleProfileSelect"
          >
            <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }} · {{ profile.model }}
            </option>
          </AppSelect>
        </AppFormField>

        <AppFormField
          label="提示词预设"
          hint="模型参数由管理员设置；预设中的提示词仍会应用到当前聊天。"
        >
          <AppSelect
            :model-value="chat.selectedPresetId"
            @update:model-value="handlePresetSelect"
          >
            <option value="">不使用预设</option>
            <option v-for="p in presets.presets" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </AppSelect>
        </AppFormField>

        <AppCard padding="sm">
          <dl class="space-y-1.5 text-xs">
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">渠道</dt>
              <dd class="text-ink-primary truncate">{{ chat.selectedProfile.source }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">模型</dt>
              <dd class="text-ink-primary truncate text-right">{{ chat.selectedProfile.model }}</dd>
            </div>
            <div v-if="session.isAdmin && chat.selectedProfile.endpoint" class="flex justify-between gap-2">
              <dt class="text-ink-muted">端点</dt>
              <dd class="text-ink-primary truncate text-right">{{ chat.selectedProfile.endpoint }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">温度 / 上限</dt>
              <dd class="text-ink-primary">{{ chat.selectedProfile.temperature }} / {{ chat.selectedProfile.maxTokens }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">计价</dt>
              <dd class="truncate text-right text-ink-primary">{{ formatModelPricing(chat.selectedProfile) }}</dd>
            </div>
          </dl>
        </AppCard>
      </template>

      <template v-else-if="drawerTab === 'persona'">
        <AppCard padding="sm" tone="sunken">
          <div class="flex flex-wrap items-center gap-2">
            <h4 class="text-xs font-medium text-ink-secondary">玩家身份</h4>
            <span
              class="rounded-full px-2 py-0.5 text-[11px]"
              :class="chat.chatPersona ? 'bg-brand-500/15 text-brand-300' : 'bg-ink-primary/5 text-ink-muted'"
            >
              {{ chat.chatPersona ? '已固定到本聊天' : '跟随全局身份' }}
            </span>
          </div>
          <p class="mt-1 text-xs text-ink-muted">
            {{ chat.chatPersona
              ? '本聊天使用下面的身份，切换全局身份不会影响它。'
              : `本聊天暂未固定身份，生成时使用全局身份（当前：${chat.generationPersona.name}）。保存后将固定到本聊天。` }}
          </p>
        </AppCard>

        <AppFormField label="玩家名称">
          <AppInput v-model="personaNameDraft" placeholder="User" />
        </AppFormField>
        <AppFormField label="身份摘要" hint="身份、经历、与角色的关系；随每次生成送给模型。">
          <AppTextarea
            v-model="personaDescriptionDraft"
            :rows="4"
            auto-grow
            :max-height="200"
            placeholder="身份、经历、与角色的关系"
          />
        </AppFormField>

        <div class="flex items-center justify-between gap-3">
          <AppButton
            v-if="chat.chatPersona"
            size="sm"
            variant="ghost"
            :disabled="personaSaving"
            @click="unfreezeChatPersona"
          >
            改为跟随全局身份
          </AppButton>
          <span v-else></span>
          <AppButton size="sm" :disabled="personaSaving" @click="saveChatPersona">
            {{ personaSaving ? '保存中…' : '保存到本聊天' }}
          </AppButton>
        </div>
      </template>

      <template v-else-if="drawerTab === 'memory'">
        <AppCard padding="sm" tone="sunken">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-xs font-medium text-ink-secondary">
                  自动记忆
                </h4>
                <span
                  class="rounded-full px-2 py-0.5 text-[11px]"
                  :class="memoryStatusClass"
                >
                  {{ memoryStatusLabel }}
                </span>
              </div>
              <p v-if="chat.memorySummary" class="mt-1 text-xs text-ink-muted">
                已记忆 {{ chat.memoryMessageCount }} 条历史消息
                <span v-if="formatMemoryUpdatedAt(chat.memoryUpdatedAt)">
                  · {{ formatMemoryUpdatedAt(chat.memoryUpdatedAt) }}
                </span>
              </p>
              <p v-else class="mt-1 text-xs text-ink-muted">{{ memoryEmptyText }}</p>
            </div>
            <AppButton
              size="sm"
              variant="ghost"
              :disabled="!chat.memorySummary || chat.memoryUpdating"
              @click="clearChatMemory"
            >
              清空
            </AppButton>
          </div>
          <p
            v-if="chat.memorySummary"
            class="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-secondary"
          >
            {{ chat.memorySummary }}
          </p>
        </AppCard>
        <p class="text-xs text-ink-muted">
          对话变长后会自动把早期消息压缩成记忆摘要，随每次生成一起送给模型。
        </p>
      </template>

      <template v-else-if="drawerTab === 'world'">
        <AppFormField
          label="世界书绑定 (本聊天)"
          hint="适合临时切换地点、组织或规则；每次生成只注入命中关键词的条目。"
        >
          <AppSelect
            :model-value="chat.selectedWorld"
            @update:model-value="handleWorldSelect"
          >
            <option value="">不绑定</option>
            <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
              {{ w.name || w.file_id }}
            </option>
          </AppSelect>
        </AppFormField>

        <ModPicker
          :model-value="chat.selectedModIds"
          :mods="modsStore.mods"
          :locked-ids="globalModIds"
          title="本聊天加载 MOD"
          description="全局 MOD 已锁定加载。这里勾选的额外 MOD 会写入当前聊天存档。"
          compact
          @update:model-value="handleModIdsUpdate"
        />

        <div class="flex items-center justify-end gap-3">
          <AppButton size="sm" variant="secondary" @click="router.push('/worlds')">管理世界书</AppButton>
          <AppButton size="sm" variant="secondary" @click="router.push('/mods')">管理 MOD</AppButton>
        </div>
      </template>

      <template v-else-if="drawerTab === 'voice' && session.isAdmin">
        <AppFormField label="TTS 渠道">
          <AppSelect
            :model-value="chatTtsProvider"
            @update:model-value="setChatTtsProvider"
          >
            <option v-for="provider in playableTtsProviders" :key="provider.id" :value="provider.id">
              {{ provider.label }}
            </option>
          </AppSelect>
        </AppFormField>

        <AppFormField label="当前角色音色">
          <AppSelect
            v-if="chatTtsVoiceOptions.length"
            :model-value="chatTtsVoice"
            @update:model-value="setChatTtsVoice"
          >
            <option v-for="voice in chatTtsVoiceOptions" :key="voice.value" :value="voice.value">
              {{ voice.label }}
            </option>
          </AppSelect>
          <AppInput
            v-else
            :model-value="chatTtsVoice"
            placeholder="输入 voice_id"
            @update:model-value="setChatTtsVoice"
          />
        </AppFormField>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <span
            :class="[
              'text-xs',
              !chatTtsProviderEnabled ? 'text-warning' : 'text-ink-muted',
            ]"
          >
            <template v-if="!chatTtsProviderEnabled">当前渠道未启用</template>
            <template v-else-if="chatTtsFollowingDefault">跟随默认音色</template>
            <template v-else>已为当前角色覆盖</template>
          </span>
          <AppButton
            v-if="!chatTtsProviderEnabled"
            size="sm"
            variant="secondary"
            @click="tts.updateProvider(chatTtsProvider, { enabled: true })"
          >
            启用渠道
          </AppButton>
          <AppButton
            v-else
            size="sm"
            variant="secondary"
            :disabled="chatTtsFollowingDefault"
            @click="followDefaultTtsVoice"
          >
            跟随默认
          </AppButton>
        </div>

        <div class="flex items-center justify-end gap-3">
          <AppButton
            size="sm"
            variant="secondary"
            @click="router.push({ path: '/settings', query: { tab: 'tts' } })"
          >
            管理音色库
          </AppButton>
        </div>
      </template>
    </div>
  </AppDrawer>
</template>
