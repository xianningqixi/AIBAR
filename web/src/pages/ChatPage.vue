<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { refThrottled } from '@vueuse/core'
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
import { useSessionStore } from '@/stores/session'
import ChatTopBar from '@/components/chat/ChatTopBar.vue'
import MessageList from '@/components/chat/MessageList.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import ChatSettingsDrawer from '@/components/chat/ChatSettingsDrawer.vue'
import CharacterStartDialog from '@/components/chat/CharacterStartDialog.vue'
import StCompatibilityDialog from '@/components/chat/StCompatibilityDialog.vue'
import AppDrawer from '@/components/ui/AppDrawer.vue'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import ImageGenerateBox from '@/components/image/ImageGenerateBox.vue'
import { getApiErrorMessage } from '@/api/client'
import { confirmDialog, promptDialog } from '@/composables/useDialog'
import { useStCompatibilityGate } from '@/composables/useStCompatibilityGate'
import { analyzeCharacterRuntime } from '@/lib/characterRuntime'
import { testConnection } from '@/api/generate'
import { fetchCharacter } from '@/api/characters'
import { useChatFilesStore } from '@/stores/chatFiles'
import { getChatDraftKey } from '@/lib/accountStorage'
import { getProviderLabel } from '@/lib/providers'
import { buildChatMessageImagePrompt } from '@/lib/imagePrompts'
import { formatModelPricing } from '@/lib/points'
import { createChatFromCharacter } from '@/lib/storyStart'
import type { CharacterStartSelection, ChatEntry, Character, ImageAsset, ModelProfile } from '@/api/types'
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
const session = useSessionStore()

const character = ref<Character | null>(null)
const chatFiles = useChatFilesStore()
const chatList = computed(() => chatFiles.entries)
const loadingChats = computed(() => chatFiles.loading)
const importing = computed(() => chatFiles.importing)
const importInput = ref<HTMLInputElement>()
const modelPickerOpen = ref(false)
const modelSearch = ref('')
const imageDrawerOpen = ref(false)
const imageMessageIndex = ref(-1)
const imagePrompt = ref('')
const inputDraft = ref('')
const newChatDialogOpen = ref(false)
const creatingNewChat = ref(false)
const compatibilityRequired = ref(false)
const {
  dialogOpen: compatibilityDialogOpen,
  launching: compatibilityLaunching,
  analysis: runtimeAnalysis,
  setGate: showCompatibilityGate,
  reset: resetCompatibilityGate,
  confirmLaunch: confirmCompatibilityLaunch,
} = useStCompatibilityGate()


interface ModelTestResult {
  ok: boolean
  message: string
  models?: number
}
const modelTesting = ref<Record<string, boolean>>({})
const modelTestResults = ref<Record<string, ModelTestResult>>({})

const routeAvatar = computed(() => decodeURIComponent((route.params.avatar as string) || ''))
const routeChatFile = computed(() => (route.query.chat as string) || '')

// 流式内容在页面层节流：否则每个 token 都会让本页与整个消息列表重渲染一次。
const throttledStreamingContent = refThrottled(
  computed(() => chat.streamingContent),
  150,
)

// 未发送的草稿按账号+角色落到 localStorage，刷新或会话过期后不丢字。
const draftStorageKey = computed(() => getChatDraftKey(session.user?.handle || '', routeAvatar.value))
watch(draftStorageKey, (key) => {
  try {
    inputDraft.value = localStorage.getItem(key) || ''
  } catch {
    inputDraft.value = ''
  }
}, { immediate: true })
watch(inputDraft, (value) => {
  try {
    if (value) localStorage.setItem(draftStorageKey.value, value)
    else localStorage.removeItem(draftStorageKey.value)
  } catch {
    // 隐私模式等场景下 localStorage 不可用时静默降级为仅内存草稿。
  }
})

async function initChat() {
  const avatar = routeAvatar.value
  compatibilityRequired.value = false
  resetCompatibilityGate()
  character.value = chars.findCharacter(avatar) || null
  try {
    character.value = await fetchCharacter(avatar)
    chars.upsertCharacter(character.value)
  } catch (error: unknown) {
    ui.addToast(`角色加载失败：${getApiErrorMessage(error)}`, 'error')
    router.push('/browse')
    return
  }
  if (!character.value) {
    ui.addToast('角色未找到', 'error')
    router.push('/browse')
    return
  }
  const analysis = analyzeCharacterRuntime(character.value)
  if (analysis.requiresCompatibility) {
    chat.reset()
    compatibilityRequired.value = true
    showCompatibilityGate(character.value, analysis, routeChatFile.value || character.value.chat)
    return
  }
  await chat.loadChat(character.value, routeChatFile.value)
  await loadChatList()
}

async function loadChatList() {
  if (!character.value) return
  await chatFiles.loadList(character.value)
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
  ui.sidePanelOpen = false
  newChatDialogOpen.value = true
}

async function confirmNewChat(selection: CharacterStartSelection) {
  if (!character.value || creatingNewChat.value) return
  creatingNewChat.value = true
  try {
    const fileName = await createChatFromCharacter(character.value, {
      greeting: selection.greeting,
      greetingIndex: selection.greetingIndex,
      persona: selection.persona,
      profileId: chat.selectedProfileId,
      world: chat.selectedWorld,
      modIds: chat.selectedModIds,
    })
    newChatDialogOpen.value = false
    ui.addToast('已创建新聊天', 'success')
    await router.push({
      path: `/chat/${encodeURIComponent(character.value.avatar)}`,
      query: { chat: fileName },
    })
  } catch (error: unknown) {
    ui.addToast(`创建聊天失败：${getApiErrorMessage(error)}`, 'error')
  } finally {
    creatingNewChat.value = false
  }
}

// 抽屉「身份」分组：查看/修改本聊天的玩家身份（写入聊天存档）

async function makeDefault(entry: ChatEntry) {
  if (!character.value) return
  await chatFiles.makeDefault(character.value, entry)
}

async function renameEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  const next = await promptDialog({ title: '新的聊天名称', defaultValue: entry.file_id || entry.file_name.replace(/\.jsonl$/i, '') })
  if (!next?.trim()) return
  const renamed = await chatFiles.rename(character.value, entry, next)
  if (renamed && chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
    openChat(next.trim())
  }
}

async function deleteEntry(entry: ChatEntry) {
  if (!character.value || !entry.file_name) return
  if (!await confirmDialog({ title: '删除聊天', message: `删除聊天「${entry.file_id || entry.file_name}」？`, danger: true, confirmText: '删除' })) return
  const removed = await chatFiles.remove(character.value, entry)
  if (removed && chat.currentChatFile === entry.file_name.replace(/\.jsonl$/i, '')) {
    router.push(`/chat/${encodeURIComponent(character.value.avatar)}`)
  }
}

async function exportCurrent() {
  if (!character.value) return
  await chatFiles.exportChatFile(character.value, chat.currentChatFile)
}

function triggerImport() {
  importInput.value?.click()
}

async function onImportFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file || !character.value) return
  await chatFiles.importFile(character.value, file)
}

async function clearCurrent() {
  if (!character.value) return
  if (!await confirmDialog({ title: '清空聊天', message: '清空当前聊天的所有消息？文件会保留，但内容会全部删除。', danger: true, confirmText: '清空' })) return
  try {
    await chat.clearCurrentChat()
    ui.addToast('已清空当前聊天', 'success')
    await loadChatList()
  } catch (e: unknown) {
    ui.addToast(`清空失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function saveChatAsStory() {
  if (!character.value) {
    ui.addToast('没有当前角色', 'warning')
    return
  }
  if (!chat.messages.length) {
    ui.addToast('当前聊天没有任何消息，无法保存为故事', 'warning')
    return
  }
  const title = await promptDialog({ title: '故事标题', defaultValue: `${character.value.name} - 故事` })
  if (!title?.trim()) return
  const story = await chatFiles.saveCurrentChatAsStory(title)
  if (story) router.push(`/story/${encodeURIComponent(story.id)}`)
}

function handleSend(text: string) {
  inputDraft.value = ''
  void chat.sendMessage(text).then((accepted) => {
    // 消息被拒（未加载完成/无可用模型）时把用户打的字还回输入框，避免丢草稿。
    if (!accepted && !inputDraft.value) inputDraft.value = text
  })
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




const noModelAvailable = computed(() => chat.ready && !chat.selectedProfile.id)

const chatInputBusyLabel = computed(() => {
  // 没有可用模型时直接禁用输入并说明原因，而不是等用户打完字再丢一条 toast
  if (noModelAvailable.value) return '暂无可用模型，无法发送。请联系管理员开通共享模型'
  // 记忆整理在后台进行，不再锁输入框，只作为状态提示
  if (chat.memoryUpdating) return '后台整理记忆中，可继续对话'
  if (chat.replyDraftLoading) return 'AI 正在拟回复...'
  return ''
})



const filteredProfiles = computed(() => {
  const q = modelSearch.value.trim().toLowerCase()
  const enabledProfiles = models.profiles.filter((profile) => profile.enabled !== false)
  if (!q) return enabledProfiles
  return enabledProfiles.filter((profile) => {
    return [
      profile.name,
      profile.model,
      profile.source,
      getProviderLabel(profile.source),
    ].some((item) => item.toLowerCase().includes(q))
  })
})

function profileStatusLabel(profile: ModelProfile): string {
  if (!session.isAdmin) return '可用'
  if (modelTesting.value[profile.id]) return '测试中'
  const result = modelTestResults.value[profile.id]
  if (result) return result.ok ? '通畅' : '异常'
  if (profile.source === 'custom') return profile.endpoint ? '可测' : '待配置'
  return models.hasSavedApiKey(profile) ? '可测' : '待配置'
}

function profileStatusClass(profile: ModelProfile): string {
  const label = profileStatusLabel(profile)
  if (label === '可用') return 'bg-success/15 text-success-strong'
  if (label === '通畅') return 'bg-success/10 text-success'
  if (label === '测试中') return 'bg-brand-500/15 text-brand-300'
  if (label === '异常') return 'bg-danger/15 text-danger'
  if (label === '可测') return 'bg-success/15 text-success-strong'
  return 'bg-warning/15 text-warning'
}

async function selectModelProfile(profile: ModelProfile) {
  await chat.setSelectedProfileId(profile.id)
  ui.addToast('本聊天的模型配置已更新', 'success')
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
  // 有浮层打开时 Esc 交给浮层自己处理，不能顺带打断正在进行的生成。
  if (ui.sidePanelOpen || ui.modelDrawerOpen || imageDrawerOpen.value || newChatDialogOpen.value) return
  if (!chat.isStreaming) return
  e.preventDefault()
  chat.stopGeneration()
}


onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  // 设置加载与聊天初始化互不依赖，并行执行缩短进入聊天的等待。
  await Promise.all([
    models.loadSecrets(),
    modsStore.load(),
    presets.load(),
    personas.load(),
    tts.load(),
    imageGen.load(),
    initChat(),
  ])
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

watch(() => route.fullPath, initChat)
</script>

<template>
  <div v-if="compatibilityRequired && character && runtimeAnalysis" class="min-h-[100dvh] bg-bg">
    <header class="border-b border-border-subtle bg-bg/95 px-4 py-3 backdrop-blur">
      <div class="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <AppButton variant="ghost" size="sm" @click="router.push('/browse')">返回</AppButton>
        <span class="truncate text-sm font-semibold text-ink-primary">{{ character.name }}</span>
        <span class="rounded bg-warning/15 px-2 py-1 text-[11px] font-medium text-warning-strong ring-1 ring-warning/25">ST 兼容卡</span>
      </div>
    </header>
    <main class="mx-auto grid max-w-4xl gap-6 px-5 py-10 md:grid-cols-[12rem_minmax(0,1fr)] md:px-8">
      <img
        :src="`/thumbnail?type=avatar&file=${encodeURIComponent(character.avatar)}`"
        :alt="character.name"
        class="aspect-[3/4] w-full max-w-48 rounded-md object-cover ring-1 ring-border"
      />
      <section class="min-w-0">
        <p class="text-xs font-semibold text-warning-strong">需要完整 SillyTavern 运行时</p>
        <h1 class="mt-2 text-2xl font-semibold text-ink-primary">这张卡不会在简版聊天中打开</h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-ink-secondary">
          已在读取聊天存档前停止。进入兼容模式后，世界书、正则、TavernHelper、MVU、iframe 和消息事件会由 ST 原生内核处理。
        </p>
        <div class="mt-5 flex flex-wrap gap-2">
          <span
            v-for="capability in runtimeAnalysis.capabilities"
            :key="capability.id"
            class="rounded bg-surface-sunken px-2.5 py-1 text-xs text-ink-secondary ring-1 ring-border-subtle"
          >{{ capability.label }}<template v-if="capability.count"> · {{ capability.count }}</template></span>
        </div>
        <div class="mt-7 flex flex-wrap gap-3">
          <AppButton @click="compatibilityDialogOpen = true">进入 ST 兼容模式</AppButton>
          <AppButton variant="secondary" @click="router.push(`/character/${encodeURIComponent(character.avatar)}`)">查看角色详情</AppButton>
        </div>
      </section>
    </main>
    <StCompatibilityDialog
      v-model="compatibilityDialogOpen"
      :character="character"
      :analysis="runtimeAnalysis"
      :busy="compatibilityLaunching"
      @confirm="confirmCompatibilityLaunch"
    />
  </div>

  <div v-else-if="chat.character" class="h-[100dvh] flex flex-col bg-bg">
    <ChatTopBar
      :character="chat.character"
      :profile="chat.selectedProfile"
      :model-open="modelPickerOpen"
      @back="router.push('/browse')"
      @toggle-sidebar="ui.toggleSidePanel()"
      @toggle-model-picker="modelPickerOpen = !modelPickerOpen"
      @open-settings="ui.toggleModelDrawer()"
    />

    <AppDialog v-model="modelPickerOpen" title="选择模型" size="lg">
      <div class="space-y-3">
        <p class="text-xs text-ink-muted">切换只影响当前聊天，不会改其他存档。</p>

        <div v-if="session.isAdmin" class="rounded-lg bg-surface-sunken/55 px-3 py-2.5 ring-1 ring-border-subtle">
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span class="font-medium text-ink-secondary">模型状态</span>
            <span class="rounded-full bg-success/10 px-2.5 py-1 text-success-strong">通畅</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-success" />可测</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-warning" />待配置</span>
            <span class="inline-flex items-center gap-1 text-ink-muted"><span class="h-1.5 w-1.5 rounded-full bg-danger" />异常</span>
          </div>
        </div>

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
                  <span v-if="chat.selectedProfileId === profile.id" class="rounded bg-brand-500/15 px-1.5 py-0.5 text-[11px] text-brand-300">当前模型</span>
                  <span
                    v-if="models.activeProfileId === profile.id"
                    class="rounded bg-success/15 px-1.5 py-0.5 text-[11px] text-success-strong"
                  >
                    默认
                  </span>
                </div>
                <p class="mt-2 text-sm text-ink-secondary">
                  <span class="inline-flex h-2 w-2 rounded-full bg-success" />
                  <span class="ml-2 font-medium">{{ profile.model || '未填写模型名' }}</span>
                  <span class="ml-2 text-xs text-ink-muted">{{ getProviderLabel(profile.source) }}</span>
                </p>
                <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span>输出上限：{{ profile.maxTokens }}</span>
                  <span>T：{{ profile.temperature }}</span>
                  <span>{{ formatModelPricing(profile) }}</span>
                  <span v-if="session.isAdmin && profile.endpoint" class="max-w-[260px] truncate">端点：{{ profile.endpoint }}</span>
                </div>
                <p
                  v-if="modelTestResults[profile.id] && !modelTestResults[profile.id].ok"
                  class="mt-2 text-xs text-danger"
                >
                  {{ modelTestResults[profile.id].message }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-3">
                <span class="rounded-full px-2.5 py-1 text-xs font-medium" :class="profileStatusClass(profile)">
                  {{ profileStatusLabel(profile) }}
                </span>
                <button
                  v-if="session.isAdmin"
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

        <div v-if="session.isAdmin" class="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-3">
          <p class="text-xs text-ink-muted">需要新增或修改 Key 时，进入模型设置向导。</p>
          <AppButton size="sm" variant="secondary" @click="router.push({ path: '/settings', query: { tab: 'model' } })">
            管理模型
          </AppButton>
        </div>
      </div>
    </AppDialog>

    <MessageList
      :messages="chat.messages"
      :loading="chat.loading"
      :streaming="throttledStreamingContent"
      :is-streaming="chat.isStreaming"
      :character-avatar="chat.character?.avatar"
      :character-name="chat.character?.name"
      :character-greeting="chat.character?.data?.first_mes"
      :media-actions="session.isAdmin"
      @edit="handleEdit"
      @delete="handleDelete"
      @regenerate="handleRegenerate"
      @continue="handleContinue"
      @swipe="handleSwipe"
      @generate-image="openMessageImagePanel"
    />

    <!-- 与消息列同宽同边距，错误条不会比气泡更宽 -->
    <div
      v-if="!chat.loading && !chat.ready && chat.error"
      class="mx-auto w-full max-w-4xl px-4"
    >
      <div
        class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong"
        role="alert"
      >
        <span>{{ chat.error }}。为保护原聊天，本页已禁止保存和生成。</span>
        <AppButton size="sm" variant="secondary" @click="initChat">重新加载</AppButton>
      </div>
    </div>

    <ChatInput
      v-model="inputDraft"
      :disabled="chat.loading || !chat.ready || noModelAvailable"
      :is-streaming="chat.isStreaming"
      :busy-label="chatInputBusyLabel"
      :draft-loading="chat.replyDraftLoading"
      :draft-options="chat.replyDraftOptions"
      :draft-error="chat.replyDraftError"
      :draft-disabled="chat.loading || !chat.ready || chat.isStreaming || noModelAvailable"
      :character-name="chat.character?.name"
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
          <h4 class="text-[11px] font-semibold text-ink-muted mb-2">
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
                  <button class="text-danger transition-colors hover:text-danger-strong" @click="deleteEntry(entry)">删除</button>
                </div>
              </div>
            </AppCard>
            <p v-if="chatList.length === 0" class="text-xs text-ink-muted py-2 text-center">暂无聊天记录</p>
          </div>
        </div>
      </div>
    </AppDrawer>

      <ChatSettingsDrawer :character-avatar="character?.avatar || ''" />

    <AppDrawer
      v-if="session.isAdmin"
      v-model="imageDrawerOpen"
      side="right"
      title="消息配图"
      width="28rem"
    >
      <div class="p-4 space-y-4">
        <div class="rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
          <p class="text-[11px] font-semibold text-ink-muted">选中消息</p>
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

    <CharacterStartDialog
      v-model="newChatDialogOpen"
      :character="character"
      :busy="creatingNewChat"
      @start="confirmNewChat"
    />
  </div>

  <!-- 载入占位：先撑出与真实布局一致的顶栏 + 内容区，避免打开聊天时整页跳动 -->
  <div v-else class="flex h-[100dvh] flex-col bg-bg">
    <div class="flex items-center gap-3 border-b border-border-subtle bg-bg/90 px-4 py-3">
      <div class="h-9 w-9 shrink-0 rounded-lg" />
      <div class="skeleton h-9 w-9 shrink-0 rounded-full" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <div class="skeleton h-3.5 w-32 rounded" />
        <div class="skeleton h-2.5 w-20 rounded" />
      </div>
      <div class="skeleton h-9 w-28 shrink-0 rounded-lg" />
    </div>
    <div class="flex flex-1 items-center justify-center">
      <AppSpinner size="lg" />
    </div>
  </div>
</template>
