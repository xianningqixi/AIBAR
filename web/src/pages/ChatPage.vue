<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useCharactersStore } from '@/stores/characters'
import { useUiStore } from '@/stores/ui'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useModsStore } from '@/stores/mods'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import { useTtsStore } from '@/stores/tts'
import { useImageGenStore } from '@/stores/imageGen'
import ChatTopBar from '@/components/chat/ChatTopBar.vue'
import MessageList from '@/components/chat/MessageList.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import ModPicker from '@/components/mods/ModPicker.vue'
import ImageGenerateBox from '@/components/image/ImageGenerateBox.vue'
import { testConnection } from '@/api/generate'
import { PROVIDER_VOICES, TTS_PROVIDERS } from '@/api/tts'
import { deleteChat, exportChat, importChat, renameChat } from '@/api/chats'
import { fetchCharacterChats, setCharacterChat } from '@/api/characters'
import { listWorldInfo } from '@/api/worldinfo'
import { saveStory } from '@/api/stories'
import { getProviderLabel } from '@/lib/providers'
import { buildChatMessageImagePrompt } from '@/lib/imagePrompts'
import type { ChatEntry, Character, ImageAsset, ModelProfile, TtsProvider, WorldInfoSummary } from '@/api/types'
import type { ReplyDraftOption } from '@/lib/replyDraft'

const route = useRoute()
const router = useRouter()
const chat = useChatStore()
const chars = useCharactersStore()
const ui = useUiStore()
const models = useModelProfilesStore()
const modsStore = useModsStore()
const presets = usePresetsStore()
const personas = usePersonasStore()
const tts = useTtsStore()
const imageGen = useImageGenStore()

const character = ref<Character | null>(null)
const chatList = ref<ChatEntry[]>([])
const loadingChats = ref(false)
const importing = ref(false)
const importInput = ref<HTMLInputElement>()
const worlds = ref<WorldInfoSummary[]>([])
const modelPickerOpen = ref(false)
const modelSearch = ref('')
const imageDrawerOpen = ref(false)
const imageMessageIndex = ref(-1)
const imagePrompt = ref('')
const inputDraft = ref('')

interface ModelTestResult {
  ok: boolean
  message: string
  models?: number
}
const modelTesting = ref<Record<string, boolean>>({})
const modelTestResults = ref<Record<string, ModelTestResult>>({})

const routeAvatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const routeChatFile = computed(() => (route.query.chat as string) || '')

async function initChat() {
  const avatar = routeAvatar.value
  character.value = chars.findCharacter(avatar) || null
  if (!character.value) {
    await chars.load()
    character.value = chars.findCharacter(avatar) || null
  }
  if (!character.value) {
    ui.addToast('角色未找到', 'error')
    router.push('/browse')
    return
  }
  await chat.loadChat(character.value, routeChatFile.value)
  await loadChatList()
}

async function loadChatList() {
  if (!character.value) return
  loadingChats.value = true
  try {
    chatList.value = await fetchCharacterChats(character.value.avatar)
  } catch (e: any) {
    ui.addToast(`聊天列表加载失败：${e.message}`, 'error')
  } finally {
    loadingChats.value = false
  }
}

function openChat(fileName: string) {
  if (!character.value) return
  router.push({
    path: `/chat/${encodeURIComponent(character.value.avatar)}`,
    query: { chat: fileName.replace(/\.jsonl$/i, '') },
  })
}

function createNewChat() {
  if (!character.value) return
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  router.push({
    path: `/chat/${encodeURIComponent(character.value.avatar)}`,
    query: { chat: `${character.value.name} - ${stamp}` },
  })
}

async function makeDefault(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  try {
    await setCharacterChat(character.value.avatar, entry.file_name)
    ui.addToast('已设为默认聊天', 'success')
    await chars.load()
  } catch (e: any) {
    ui.addToast(`设置失败：${e.message}`, 'error')
  }
}

async function renameEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  const next = window.prompt('新的聊天名称', entry.file_id || entry.file_name.replace(/\.jsonl$/i, ''))
  if (!next?.trim()) return
  try {
    await renameChat(character.value.name, entry.file_name, next.trim(), character.value.avatar)
    ui.addToast('聊天已重命名', 'success')
    await loadChatList()
    if (chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
      openChat(next.trim())
    }
  } catch (e: any) {
    ui.addToast(`重命名失败：${e.message}`, 'error')
  }
}

async function deleteEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  if (!window.confirm(`删除聊天「${entry.file_id || entry.file_name}」？`)) return
  try {
    await deleteChat(character.value.name, entry.file_name, character.value.avatar)
    ui.addToast('聊天已删除', 'success')
    await loadChatList()
    if (chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
      router.push(`/chat/${encodeURIComponent(character.value.avatar)}`)
    }
  } catch (e: any) {
    ui.addToast(`删除失败：${e.message}`, 'error')
  }
}

async function exportCurrent() {
  if (!character.value || !chat.currentChatFile) {
    ui.addToast('没有当前聊天可导出', 'warning')
    return
  }
  try {
    const { filename, content } = await exportChat(character.value.avatar, chat.currentChatFile)
    const blob = new Blob([content], { type: 'application/jsonl' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ui.addToast('已导出当前聊天', 'success')
  } catch (e: any) {
    ui.addToast(`导出失败：${e.message}`, 'error')
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !character.value) return
  importing.value = true
  try {
    await importChat(character.value.avatar, character.value.name, file)
    ui.addToast(`已导入 ${file.name}`, 'success')
    await loadChatList()
  } catch (e: any) {
    ui.addToast(`导入失败：${e.message}`, 'error')
  } finally {
    importing.value = false
  }
}

async function clearCurrent() {
  if (!character.value) return
  if (!window.confirm('清空当前聊天的所有消息？文件会保留,但内容会全部删除。')) return
  try {
    await chat.clearCurrentChat()
    ui.addToast('已清空当前聊天', 'success')
    await loadChatList()
  } catch (e: any) {
    ui.addToast(`清空失败：${e.message}`, 'error')
  }
}

async function saveChatAsStory() {
  if (!character.value) {
    ui.addToast('没有当前角色', 'warning')
    return
  }
  const msgs = chat.messages
  if (!msgs.length) {
    ui.addToast('当前聊天没有任何消息，无法保存为故事', 'warning')
    return
  }
  const title = window.prompt('故事标题', `${character.value.name} - 故事`)
  if (!title?.trim()) return
  try {
    const aibar = chat.metadata?.aibar && typeof chat.metadata.aibar === 'object'
      ? (chat.metadata.aibar as Record<string, unknown>)
      : {}
    const summary = typeof aibar.storySummary === 'string' ? aibar.storySummary : ''
    const scenario = typeof aibar.storyScenario === 'string' ? aibar.storyScenario : ''
    const systemAppend = typeof aibar.storySystemAppend === 'string' ? aibar.storySystemAppend : ''
    const world = typeof aibar.world === 'string' ? aibar.world : ''

    const userMsg = msgs.find((m) => m.role === 'user')
    const firstAssistantMsg = msgs.find((m) => m.role === 'assistant')

    const story = await saveStory({
      title: title.trim(),
      summary: summary || (msgs.length > 0 ? `从聊天「${chat.currentChatFile}」反向保存` : ''),
      characterAvatar: character.value.avatar,
      world,
      scenario,
      openingUserMessage: userMsg?.content || '',
      openingAssistantMessage: firstAssistantMsg?.content || '',
      systemAppend,
      modelProfileId: chat.selectedProfileId,
      modIds: chat.selectedModIds,
    })
    ui.addToast('已保存为故事模板', 'success')
    router.push(`/story/${encodeURIComponent(story.id)}`)
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

function handleSend(text: string) {
  inputDraft.value = ''
  chat.sendMessage(text)
}
function handleStop() { chat.stopGeneration() }
function handleRegenerate() { chat.regenerateLast() }
function handleContinue() { chat.continueLastReply() }
function handleEdit(index: number, content: string) { chat.editMessage(index, content) }
function handleDelete(index: number) { chat.deleteMessage(index) }
function handleSwipe(index: number, direction: -1 | 1) { chat.applySwipe(index, direction) }

async function handleDraftReplies(hint: string) {
  ui.addToast('正在生成 5 个回复方向...', 'info', 1800)
  await chat.draftUserReplies(hint)
  if (chat.replyDraftOptions.length) {
    ui.addToast('已生成 5 个回复方向', 'success')
  } else if (chat.replyDraftError) {
    ui.addToast(`拟回复失败：${chat.replyDraftError}`, 'error')
  }
}

function handleDraftSelect(option: ReplyDraftOption) {
  inputDraft.value = option.message
  ui.addToast('已填入输入框，可以继续编辑', 'success')
}

function openMessageImagePanel(index: number) {
  const message = chat.messages[index]
  if (!message) return
  imageMessageIndex.value = index
  const start = Math.max(0, index - 3)
  const nearby = chat.messages.slice(start, index + 1)
  imagePrompt.value = buildChatMessageImagePrompt(message, nearby, chat.character)
  imageDrawerOpen.value = true
}

async function attachGeneratedImage(asset: ImageAsset) {
  if (imageMessageIndex.value < 0) return
  await chat.attachImageToMessage(imageMessageIndex.value, asset)
  ui.addToast('配图已写入当前聊天记录', 'success')
}

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

const globalModIds = computed(() =>
  modsStore.mods.filter((m) => m.enabled).map((m) => m.id),
)

const playableTtsProviders = computed(() => TTS_PROVIDERS.filter((provider) => (
  provider.playable && tts.settings[provider.id].enabled
)))
const currentCharacterAvatar = computed(() => chat.character?.avatar || character.value?.avatar || '')
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
const memoryStatusLabel = computed(() => {
  if (chat.memoryUpdating) return '整理中'
  if (chat.memorySummary) return '已更新'
  return chat.messages.length > 1 ? '待整理' : '等待对话'
})
const memoryStatusClass = computed(() => {
  if (chat.memoryUpdating) return 'bg-brand-500/15 text-brand-300'
  if (chat.memorySummary) return 'bg-emerald-500/15 text-emerald-600'
  return chat.messages.length > 1 ? 'bg-amber-500/15 text-amber-600' : 'bg-ink-primary/5 text-ink-muted'
})
const memoryEmptyText = computed(() =>
  chat.messages.length > 1 ? '下次发送时整理历史' : '暂无记忆',
)
const chatInputBusyLabel = computed(() => {
  if (chat.memoryUpdating) return '整理记忆中...'
  if (chat.replyDraftLoading) return 'AI 正在拟回复...'
  return ''
})

function handleModIdsUpdate(ids: string[]) {
  const global = new Set(globalModIds.value)
  void chat.setSelectedModIds(ids.filter((id) => !global.has(id)))
}

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

const filteredProfiles = computed(() => {
  const q = modelSearch.value.trim().toLowerCase()
  if (!q) return models.profiles
  return models.profiles.filter((profile) => {
    return [
      profile.name,
      profile.model,
      profile.source,
      getProviderLabel(profile.source),
    ].some((item) => item.toLowerCase().includes(q))
  })
})

function profileStatusLabel(profile: ModelProfile): string {
  if (modelTesting.value[profile.id]) return '测试中'
  const result = modelTestResults.value[profile.id]
  if (result) return result.ok ? '通畅' : '异常'
  if (profile.source === 'custom') return profile.endpoint ? '可测' : '待配置'
  return models.hasSavedApiKey(profile) ? '可测' : '待配置'
}

function profileStatusClass(profile: ModelProfile): string {
  const label = profileStatusLabel(profile)
  if (label === '通畅') return 'bg-lime-500/15 text-lime-300'
  if (label === '测试中') return 'bg-brand-500/15 text-brand-300'
  if (label === '异常') return 'bg-red-500/15 text-red-600'
  if (label === '可测') return 'bg-emerald-500/15 text-emerald-600'
  return 'bg-amber-500/15 text-amber-600'
}

async function selectModelProfile(profile: ModelProfile) {
  await handleProfileSelect(profile.id)
  modelPickerOpen.value = false
}

async function testModelProfile(profile: ModelProfile) {
  modelTesting.value = { ...modelTesting.value, [profile.id]: true }
  try {
    const result = await testConnection(profile)
    modelTestResults.value = { ...modelTestResults.value, [profile.id]: result }
    ui.addToast(result.ok ? '模型连接正常' : `模型连接失败：${result.message}`, result.ok ? 'success' : 'error')
  } finally {
    modelTesting.value = { ...modelTesting.value, [profile.id]: false }
  }
}

function handleGlobalKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (modelPickerOpen.value) {
    modelPickerOpen.value = false
    e.preventDefault()
    return
  }
  if (!chat.isStreaming) return
  e.preventDefault()
  chat.stopGeneration()
}

onMounted(async () => {
  await Promise.all([
    models.loadSecrets(),
    modsStore.load(),
    presets.load(),
    personas.load(),
    tts.load(),
    imageGen.load(),
  ])
  try {
    worlds.value = await listWorldInfo()
  } catch {
    /* noop */
  }
  await initChat()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

watch(() => route.fullPath, initChat)
</script>

<template>
  <div v-if="chat.character" class="h-screen flex flex-col bg-bg">
    <ChatTopBar
      :character="chat.character"
      :profile="chat.selectedProfile"
      :model-open="modelPickerOpen"
      @back="router.push('/browse')"
      @toggle-sidebar="ui.toggleSidePanel()"
      @toggle-model-picker="modelPickerOpen = !modelPickerOpen"
      @open-settings="ui.toggleModelDrawer()"
    />

    <div
      v-if="modelPickerOpen"
      class="fixed inset-0 z-40 flex items-start justify-center bg-black/35 px-4 py-20 backdrop-blur-sm"
      @click.self="modelPickerOpen = false"
    >
      <div class="w-full max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border">
        <div class="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h3 class="text-base font-semibold text-ink-primary">选择模型</h3>
            <p class="mt-0.5 text-xs text-ink-muted">切换只影响当前聊天，不会改其他存档。</p>
          </div>
          <button
            class="rounded-lg p-2 text-ink-muted hover:bg-ink-primary/5 hover:text-ink-primary"
            @click="modelPickerOpen = false"
          >
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="border-b border-border-subtle bg-surface-sunken/55 px-5 py-3">
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span class="font-medium text-ink-secondary">模型状态</span>
            <span class="rounded-full bg-lime-500/15 px-2.5 py-1 text-lime-300">通畅</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />可测</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-amber-400" />待配置</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-red-400" />异常</span>
          </div>
        </div>

        <div class="space-y-3 p-5">
          <AppInput v-model="modelSearch" placeholder="搜索模型或 Profile" />

          <div class="max-h-[52vh] overflow-y-auto pr-1">
            <button
              v-for="profile in filteredProfiles"
              :key="profile.id"
              class="group w-full border-l-2 px-3 py-4 text-left transition-colors hover:bg-ink-primary/5"
              :class="chat.selectedProfileId === profile.id ? 'border-brand-400 bg-brand-500/5' : 'border-border-subtle'"
              @click="selectModelProfile(profile)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <h4 class="truncate text-sm font-semibold text-ink-primary">{{ profile.name }}</h4>
                    <span v-if="chat.selectedProfileId === profile.id" class="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] text-brand-300">当前模型</span>
                    <span
                      v-if="models.activeProfileId === profile.id"
                      class="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-600"
                    >
                      默认
                    </span>
                  </div>
                  <p class="mt-2 text-sm text-ink-secondary">
                    <span class="inline-flex h-2 w-2 rounded-full bg-lime-500" />
                    <span class="ml-2 font-medium">{{ profile.model || '未填写模型名' }}</span>
                    <span class="ml-2 text-xs text-ink-muted">{{ getProviderLabel(profile.source) }}</span>
                  </p>
                  <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                    <span>输出上限：{{ profile.maxTokens }}</span>
                    <span>T：{{ profile.temperature }}</span>
                    <span v-if="profile.endpoint" class="max-w-[260px] truncate">端点：{{ profile.endpoint }}</span>
                  </div>
                  <p
                    v-if="modelTestResults[profile.id] && !modelTestResults[profile.id].ok"
                    class="mt-2 text-xs text-red-600"
                  >
                    {{ modelTestResults[profile.id].message }}
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-3">
                  <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="profileStatusClass(profile)">
                    {{ profileStatusLabel(profile) }}
                  </span>
                  <button
                    class="rounded-lg px-2.5 py-1 text-xs text-brand-300 ring-1 ring-brand-500/30 hover:bg-brand-500/10"
                    @click.stop="testModelProfile(profile)"
                  >
                    {{ modelTesting[profile.id] ? '测试中…' : '测试' }}
                  </button>
                </div>
              </div>
            </button>

            <div v-if="!filteredProfiles.length" class="py-8 text-center text-sm text-ink-muted">
              没有匹配的模型 Profile。
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
            <p class="text-xs text-ink-muted">需要新增或修改 Key 时，进入模型设置向导。</p>
            <AppButton size="sm" variant="secondary" @click="router.push({ path: '/settings', query: { tab: 'model' } })">
              管理模型
            </AppButton>
          </div>
        </div>
      </div>
    </div>

    <MessageList
      :messages="chat.messages"
      :loading="chat.loading"
      :streaming="chat.streamingContent"
      :is-streaming="chat.isStreaming"
      :character-avatar="chat.character?.avatar"
      @edit="handleEdit"
      @delete="handleDelete"
      @regenerate="handleRegenerate"
      @continue="handleContinue"
      @swipe="handleSwipe"
      @generate-image="openMessageImagePanel"
    />

    <ChatInput
      v-model="inputDraft"
      :disabled="chat.loading || chat.memoryUpdating"
      :is-streaming="chat.isStreaming"
      :busy-label="chatInputBusyLabel"
      :draft-loading="chat.replyDraftLoading"
      :draft-options="chat.replyDraftOptions"
      :draft-error="chat.replyDraftError"
      :draft-disabled="chat.loading || chat.isStreaming || chat.memoryUpdating"
      @send="handleSend"
      @stop="handleStop"
      @request-drafts="handleDraftReplies"
      @select-draft="handleDraftSelect"
      @clear-drafts="chat.clearReplyDrafts"
    />

    <input
      ref="importInput"
      type="file"
      accept=".json,.jsonl"
      class="hidden"
      @change="onImportFile"
    />

    <AppDrawer
      :model-value="ui.sidePanelOpen"
      side="left"
      title="聊天管理"
      @update:model-value="ui.sidePanelOpen = $event"
    >
      <div class="p-4 space-y-5">
        <div class="grid grid-cols-2 gap-2">
          <AppButton size="sm" variant="gradient" class="col-span-2" @click="createNewChat">
            + 新聊天
          </AppButton>
          <AppButton size="sm" variant="secondary" @click="loadChatList">刷新</AppButton>
          <AppButton size="sm" variant="secondary" :disabled="importing" @click="triggerImport">
            {{ importing ? '导入中…' : '导入聊天' }}
          </AppButton>
          <AppButton size="sm" variant="secondary" @click="exportCurrent">导出当前</AppButton>
          <AppButton size="sm" variant="secondary" @click="saveChatAsStory">存为故事</AppButton>
          <AppButton size="sm" variant="danger" @click="clearCurrent">清空消息</AppButton>
        </div>

        <div>
          <h4 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            历史聊天
          </h4>
          <div v-if="loadingChats" class="text-xs text-ink-muted py-3 text-center">加载中…</div>
          <div v-else class="space-y-2">
            <AppCard
              v-for="entry in chatList"
              :key="entry.file_name"
              padding="none"
              hover
            >
              <div class="p-3">
                <button
                  class="block w-full text-left text-sm text-ink-primary hover:text-brand-400 truncate transition-colors"
                  @click="openChat(entry.file_name)"
                >
                  {{ entry.file_id || entry.file_name }}
                </button>
                <p class="mt-1 text-xs text-ink-muted line-clamp-2 leading-relaxed">
                  {{ entry.mes || '（暂无消息）' }}
                </p>
                <div class="mt-2.5 flex flex-wrap gap-3 text-xs">
                  <button class="text-ink-secondary hover:text-ink-primary transition-colors" @click="makeDefault(entry)">设默认</button>
                  <button class="text-ink-secondary hover:text-ink-primary transition-colors" @click="renameEntry(entry)">重命名</button>
                  <button class="text-red-500 hover:text-red-600 transition-colors" @click="deleteEntry(entry)">删除</button>
                </div>
              </div>
            </AppCard>
            <p v-if="chatList.length === 0" class="text-xs text-ink-muted py-2 text-center">暂无聊天记录</p>
          </div>
        </div>
      </div>
    </AppDrawer>

    <AppDrawer
      :model-value="ui.modelDrawerOpen"
      side="right"
      title="模型 / 世界 / MOD / 语音"
      width="22rem"
      @update:model-value="ui.modelDrawerOpen = $event"
    >
      <div class="p-4 space-y-5">
        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            当前聊天使用模型
          </label>
          <AppSelect
            :model-value="chat.selectedProfileId"
            @update:model-value="handleProfileSelect"
          >
            <option v-for="profile in models.profiles" :key="profile.id" :value="profile.id">
              {{ profile.name }} · {{ profile.model }}
            </option>
          </AppSelect>
        </div>

        <div>
          <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted mb-2">
            生成预设
          </label>
          <AppSelect
            :model-value="chat.selectedPresetId"
            @update:model-value="handlePresetSelect"
          >
            <option value="">不使用预设</option>
            <option v-for="p in presets.presets" :key="p.id" :value="p.id">
              {{ p.name }} · T{{ p.temperature }}
            </option>
          </AppSelect>
          <p class="mt-1.5 text-[11px] text-ink-muted">预设会覆盖模型的温度和长度参数。</p>
        </div>

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
            <div v-if="chat.selectedProfile.endpoint" class="flex justify-between gap-2">
              <dt class="text-ink-muted">端点</dt>
              <dd class="text-ink-primary truncate text-right">{{ chat.selectedProfile.endpoint }}</dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt class="text-ink-muted">温度 / 上限</dt>
              <dd class="text-ink-primary">{{ chat.selectedProfile.temperature }} / {{ chat.selectedProfile.maxTokens }}</dd>
            </div>
          </dl>
        </AppCard>

        <AppCard padding="sm" tone="sunken">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h4 class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  自动记忆
                </h4>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px]"
                  :class="memoryStatusClass"
                >
                  {{ memoryStatusLabel }}
                </span>
              </div>
              <p v-if="chat.memorySummary" class="mt-1 text-[11px] text-ink-muted">
                已记忆 {{ chat.memoryMessageCount }} 条历史消息
                <span v-if="formatMemoryUpdatedAt(chat.memoryUpdatedAt)">
                  · {{ formatMemoryUpdatedAt(chat.memoryUpdatedAt) }}
                </span>
              </p>
              <p v-else class="mt-1 text-[11px] text-ink-muted">{{ memoryEmptyText }}</p>
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
            class="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-secondary"
          >
            {{ chat.memorySummary }}
          </p>
        </AppCard>

        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              角色语音
            </label>
            <button
              class="text-[11px] text-brand-300 hover:text-brand-200"
              @click="router.push({ path: '/settings', query: { tab: 'tts' } })"
            >
              管理音色库
            </button>
          </div>

          <div class="space-y-3 rounded-xl border border-border-subtle bg-surface/35 p-3">
            <div class="space-y-1.5">
              <label class="block text-[11px] font-medium text-ink-muted">TTS 渠道</label>
              <AppSelect
                :model-value="chatTtsProvider"
                @update:model-value="setChatTtsProvider"
              >
                <option v-for="provider in playableTtsProviders" :key="provider.id" :value="provider.id">
                  {{ provider.label }}
                </option>
              </AppSelect>
            </div>

            <div class="space-y-1.5">
              <label class="block text-[11px] font-medium text-ink-muted">当前角色音色</label>
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
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <span
                :class="[
                  'text-[11px]',
                  !chatTtsProviderEnabled ? 'text-amber-600' : 'text-ink-muted',
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
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center justify-between gap-2">
            <label class="block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              世界书绑定 (本聊天)
            </label>
            <button
              class="text-[11px] text-brand-300 hover:text-brand-200"
              @click="router.push('/worlds')"
            >
              管理世界书
            </button>
          </div>
          <AppSelect
            :model-value="chat.selectedWorld"
            @update:model-value="handleWorldSelect"
          >
            <option value="">不绑定</option>
            <option v-for="w in worlds" :key="w.file_id" :value="w.file_id">
              {{ w.name || w.file_id }}
            </option>
          </AppSelect>
          <p class="mt-1.5 text-[11px] text-ink-muted">适合临时切换地点、组织或规则；每次生成只注入命中关键词的条目。</p>
        </div>

        <ModPicker
          :model-value="chat.selectedModIds"
          :mods="modsStore.mods"
          :locked-ids="globalModIds"
          title="本聊天加载 MOD"
          description="全局 MOD 已锁定加载。这里勾选的额外 MOD 会写入当前聊天存档。"
          compact
          @update:model-value="handleModIdsUpdate"
        />

        <AppButton variant="secondary" class="w-full" @click="router.push('/mods')">
          管理 MOD
        </AppButton>
      </div>
    </AppDrawer>

    <AppDrawer
      v-model="imageDrawerOpen"
      side="right"
      title="消息配图"
      width="28rem"
    >
      <div class="p-4 space-y-4">
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">选中消息</p>
          <p class="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary">
            {{ chat.messages[imageMessageIndex]?.content || '未选择消息' }}
          </p>
        </div>

        <ImageGenerateBox
          title="根据消息生成配图"
          description="默认会带入当前消息、最近上下文和角色设定；你可以先手改 Prompt 再生成。"
          :prompt="imagePrompt"
          context-type="chat"
          :context-id="`${chat.character?.avatar || 'chat'}:${chat.currentChatFile}:${imageMessageIndex}`"
          :draft-profile="chat.selectedProfile"
          action-label="生成并写入消息"
          @generated="attachGeneratedImage"
        />
      </div>
    </AppDrawer>
  </div>

  <div v-else class="flex items-center justify-center h-screen">
    <p class="text-ink-muted text-sm">加载中…</p>
  </div>
</template>
