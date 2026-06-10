import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage, StreamState, Character, ImageAsset, ModelProfile } from '@/api/types'
import { fetchChat, saveChat } from '@/api/chats'
import { generateReply, generateReplyStream } from '@/api/generate'
import { buildChatCompletionPayload, buildGeneratePayload, getCharacterChatName } from '@/lib/buildPayload'
import { buildReplyDraftPayload, parseReplyDraftOptions, type ReplyDraftOption } from '@/lib/replyDraft'
import { getMatchedWorldInfo } from '@/lib/worldInfoMatch'
import { useModelProfilesStore } from './modelProfiles'
import { useModsStore } from './mods'
import { usePresetsStore } from './presets'
import { usePersonasStore } from './personas'
import { useUiStore } from './ui'

type GenerationOptions = {
  extraMessages?: ChatMessage[]
  appendToIndex?: number
  swipes?: string[]
  updateMemory?: boolean
}

type ChatMemoryState = {
  summary: string
  updatedAt: string
  messageCount: number
}

const MEMORY_TRANSCRIPT_MAX_CHARS = 120000
const MEMORY_SUMMARY_MAX_CHARS = 1800
const MEMORY_SUMMARY_PRESET = {
  id: 'aibar-memory-summary',
  name: 'Memory Summary',
  temperature: 0.2,
  topP: 0.85,
  maxTokens: 1200,
  presencePenalty: 0,
  frequencyPenalty: 0,
  systemPrompt: '',
}

let replyDraftRequestId = 0

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const metadata = ref<Record<string, unknown>>({})
  const character = ref<Character | null>(null)
  const currentChatFile = ref('')
  const selectedProfileId = ref('')
  const selectedPresetId = ref('')
  const selectedWorld = ref('')
  const selectedModIds = ref<string[]>([])
  const loading = ref(false)
  const error = ref('')
  const memoryUpdating = ref(false)
  const replyDraftLoading = ref(false)
  const replyDraftOptions = ref<ReplyDraftOption[]>([])
  const replyDraftError = ref('')

  const streaming = ref<StreamState>({
    active: false,
    controller: null,
    partial: { content: '' },
  })

  const isStreaming = computed(() => streaming.value.active)
  const streamingContent = computed(() => streaming.value.partial.content)
  const memorySummary = computed(() => getMemoryState().summary)
  const memoryUpdatedAt = computed(() => getMemoryState().updatedAt)
  const memoryMessageCount = computed(() => getMemoryState().messageCount)
  const selectedProfile = computed<ModelProfile>(() => {
    const profiles = useModelProfilesStore()
    return profiles.getProfile(selectedProfileId.value) || profiles.activeProfile
  })

  const selectedPreset = computed(() => {
    const presets = usePresetsStore()
    return presets.getPreset(selectedPresetId.value) || presets.activePreset || null
  })

  function reset() {
    messages.value = []
    metadata.value = {}
    character.value = null
    currentChatFile.value = ''
    selectedProfileId.value = ''
    selectedPresetId.value = ''
    selectedWorld.value = ''
    selectedModIds.value = []
    streaming.value = { active: false, controller: null, partial: { content: '' } }
    memoryUpdating.value = false
    replyDraftLoading.value = false
    replyDraftOptions.value = []
    replyDraftError.value = ''
    error.value = ''
  }

  async function loadChat(char: Character, chatFile?: string) {
    reset()
    character.value = char
    loading.value = true
    error.value = ''
    currentChatFile.value = getCharacterChatName(char, chatFile)

    try {
      const result = await fetchChat(char.name, currentChatFile.value, char.avatar)
      messages.value = result.messages.map(normalizeSwipeMessage)
      metadata.value = result.metadata
    } catch (e) {
      console.warn('Load chat failed (may be new):', e instanceof Error ? e.message : e)
      messages.value = []
      metadata.value = { simple_ui: true }
    } finally {
      loading.value = false
    }

    const profiles = useModelProfilesStore()
    const presets = usePresetsStore()
    selectedProfileId.value = getMetadataProfileId() || profiles.activeProfileId
    selectedPresetId.value = getMetadataPresetId() || presets.activePresetId
    selectedWorld.value = getMetadataWorld() || resolveCharacterWorld(char)
    selectedModIds.value = getMetadataModIds()
    writeMetadataProfileId(selectedProfileId.value)
    writeMetadataPresetId(selectedPresetId.value)
    writeMetadataWorld(selectedWorld.value)
    writeMetadataModIds(selectedModIds.value)
  }

  function resolveCharacterWorld(char: Character): string {
    const data = char.data
    if (typeof data?.world === 'string' && data.world) return data.world
    const ext = data?.extensions as Record<string, unknown> | undefined
    if (ext && typeof ext.world === 'string') return ext.world
    return ''
  }

  async function persist() {
    if (!character.value) return
    const fileName = currentChatFile.value || getCharacterChatName(character.value)
    await saveChat(
      character.value.name,
      fileName,
      character.value.avatar,
      messages.value,
      metadata.value,
    )
  }

  let persistPromise: Promise<void> | null = null
  let persistDirty = false

  // 合并并发保存：写入进行中时新的请求只置脏标记，写完后补一次，避免重复 IO 与乱序覆盖
  function persistSafe(): Promise<void> {
    if (persistPromise) {
      persistDirty = true
      return persistPromise
    }
    persistPromise = (async () => {
      try {
        do {
          persistDirty = false
          await persist()
        } while (persistDirty)
        error.value = ''
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        error.value = 'Save failed: ' + message
        useUiStore().addToast(`聊天保存失败：${message}`, 'error', 5000)
      } finally {
        persistPromise = null
      }
    })()
    return persistPromise
  }

  function getMetadataProfileId(): string {
    const aibar = metadata.value.aibar
    if (aibar && typeof aibar === 'object' && 'profileId' in aibar) {
      return String((aibar as Record<string, unknown>).profileId || '')
    }
    return ''
  }

  function getMetadataAibar(): Record<string, unknown> {
    return metadata.value.aibar && typeof metadata.value.aibar === 'object'
      ? (metadata.value.aibar as Record<string, unknown>)
      : {}
  }

  function mergeMetadataAibar(updates: Record<string, unknown>) {
    metadata.value = {
      ...metadata.value,
      aibar: { ...getMetadataAibar(), ...updates },
    }
  }

  function writeMetadataProfileId(profileId: string) {
    mergeMetadataAibar({ profileId })
  }

  function getMetadataPresetId(): string {
    const v = getMetadataAibar().presetId
    return typeof v === 'string' ? v : ''
  }

  function writeMetadataPresetId(presetId: string) {
    mergeMetadataAibar({ presetId })
  }

  function getMetadataWorld(): string {
    const v = getMetadataAibar().world
    return typeof v === 'string' ? v : ''
  }

  function writeMetadataWorld(world: string) {
    mergeMetadataAibar({ world })
  }

  function getMetadataModIds(): string[] {
    const v = getMetadataAibar().mods
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  }

  function writeMetadataModIds(ids: string[]) {
    mergeMetadataAibar({ mods: ids })
  }

  function getMemoryState(): ChatMemoryState {
    const memory = getMetadataAibar().memory
    if (!memory || typeof memory !== 'object') {
      return { summary: '', updatedAt: '', messageCount: 0 }
    }

    const data = memory as Record<string, unknown>
    return {
      summary: typeof data.summary === 'string' ? data.summary : '',
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      messageCount: typeof data.messageCount === 'number' ? data.messageCount : 0,
    }
  }

  function writeMemoryState(summary: string, messageCount: number) {
    mergeMetadataAibar({
      memory: {
        summary: summary.trim(),
        updatedAt: new Date().toISOString(),
        messageCount,
      },
    })
  }

  async function clearMemorySummary() {
    writeMemoryState('', 0)
    await persistSafe()
  }

  function getEffectiveCharacter(): Character | null {
    if (!character.value) return null
    const aibar = getMetadataAibar()
    const storyParts = [
      typeof aibar.storyTitle === 'string' && aibar.storyTitle ? `故事标题：${aibar.storyTitle}` : '',
      typeof aibar.storySummary === 'string' && aibar.storySummary ? `故事简介：${aibar.storySummary}` : '',
      typeof aibar.storyScenario === 'string' && aibar.storyScenario ? `故事场景：${aibar.storyScenario}` : '',
    ].filter(Boolean)
    const storySystemAppend =
      typeof aibar.storySystemAppend === 'string' ? aibar.storySystemAppend.trim() : ''

    if (!storyParts.length && !storySystemAppend) return character.value

    const data = character.value.data || { name: character.value.name }
    const scenario = [data.scenario || character.value.scenario || '', ...storyParts]
      .filter(Boolean)
      .join('\n\n')
    const systemPrompt = [data.system_prompt || '', storySystemAppend]
      .filter(Boolean)
      .join('\n\n')

    return {
      ...character.value,
      scenario,
      data: {
        ...data,
        scenario,
        system_prompt: systemPrompt,
      },
    }
  }

  async function setSelectedPresetId(presetId: string) {
    selectedPresetId.value = presetId
    writeMetadataPresetId(presetId)
    await persistSafe()
  }

  async function setSelectedProfileId(profileId: string) {
    const profiles = useModelProfilesStore()
    if (!profiles.getProfile(profileId)) return
    selectedProfileId.value = profileId
    writeMetadataProfileId(profileId)
    await persistSafe()
  }

  async function setSelectedWorld(world: string) {
    selectedWorld.value = world
    writeMetadataWorld(world)
    await persistSafe()
  }

  async function setSelectedModIds(ids: string[]) {
    selectedModIds.value = [...ids]
    writeMetadataModIds(selectedModIds.value)
    await persistSafe()
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !character.value) return
    if (streaming.value.active || memoryUpdating.value) return
    clearReplyDrafts()

    messages.value.push({
      role: 'user',
      content: text.trim(),
      date: new Date().toISOString(),
    })

    await persistSafe()

    await runGeneration({ updateMemory: true })
  }

  function formatMemoryTranscript(
    historyMessages: ChatMessage[],
    userName: string,
    characterName: string,
  ): string {
    return historyMessages
      .map((message, index) => {
        const content = message.content.trim()
        if (!content) return ''
        const role =
          message.role === 'assistant'
            ? characterName
            : message.role === 'system'
              ? '系统'
              : userName
        return `${index + 1}. ${role}：${content}`
      })
      .filter(Boolean)
      .join('\n\n')
  }

  function trimMemoryTranscript(transcript: string): string {
    if (transcript.length <= MEMORY_TRANSCRIPT_MAX_CHARS) return transcript
    return [
      '（早前内容已由旧记忆承接，下面保留最近的历史对话。）',
      transcript.slice(-MEMORY_TRANSCRIPT_MAX_CHARS),
    ].join('\n\n')
  }

  function normalizeMemoryReply(reply: string): string {
    const cleaned = reply
      .trim()
      .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
      .replace(/\s*```$/, '')
      .trim()

    if (!cleaned || /^(无|暂无|没有|空)$/i.test(cleaned)) return ''
    if (cleaned.length <= MEMORY_SUMMARY_MAX_CHARS) return cleaned
    return `${cleaned.slice(0, MEMORY_SUMMARY_MAX_CHARS).trim()}...`
  }

  async function refreshMemorySummary(
    sourceMessages: ChatMessage[],
    config: ModelProfile,
    effectiveCharacter: Character,
    userName: string,
  ): Promise<string> {
    const historyMessages = sourceMessages.slice(0, Math.max(0, sourceMessages.length - 1))
    if (!historyMessages.length) {
      writeMemoryState('', 0)
      return ''
    }

    const previousMemory = getMemoryState().summary
    const transcript = trimMemoryTranscript(
      formatMemoryTranscript(historyMessages, userName, effectiveCharacter.name || '角色'),
    )
    if (!transcript) {
      writeMemoryState('', 0)
      return ''
    }

    memoryUpdating.value = true
    try {
      const payload = buildChatCompletionPayload(
        config,
        [
          {
            role: 'system',
            content: [
              '你是聊天记忆整理器，只负责整理历史对话背景。',
              '不要续写剧情，不要扮演角色，不要解释过程，只输出可直接注入下一轮角色扮演的背景记忆。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              '请把旧记忆与历史对话合并成一份稳定、紧凑的背景信息。',
              '保留：用户身份与偏好、角色关系变化、重要剧情事实、世界状态、未完成目标、关键约定。',
              '忽略：寒暄、重复措辞、无长期价值的临时表达。',
              `摘要控制在 ${MEMORY_SUMMARY_MAX_CHARS} 字以内；如果没有值得记忆的信息，输出“无”。`,
              '',
              `旧记忆：\n${previousMemory || '无'}`,
              '',
              `历史对话：\n${transcript}`,
            ].join('\n'),
          },
        ],
        effectiveCharacter,
        MEMORY_SUMMARY_PRESET,
        userName,
      )
      const reply = await generateReply(payload)
      const summary = normalizeMemoryReply(reply)
      writeMemoryState(summary, historyMessages.length)
      await persistSafe()
      return summary
    } finally {
      memoryUpdating.value = false
    }
  }

  function clearReplyDrafts() {
    replyDraftRequestId += 1
    replyDraftLoading.value = false
    replyDraftOptions.value = []
    replyDraftError.value = ''
  }

  async function draftUserReplies(userNote = '') {
    if (!character.value) return
    if (streaming.value.active || memoryUpdating.value || replyDraftLoading.value) return

    replyDraftLoading.value = true
    replyDraftError.value = ''
    const requestId = ++replyDraftRequestId

    try {
      const config = selectedProfile.value
      const effectiveCharacter = getEffectiveCharacter() || character.value
      const personas = usePersonasStore()
      const personaName = personas.activePersona?.name || 'User'
      const personaDescription = personas.activePersona?.description || ''

      let worldInfoText = ''
      try {
        worldInfoText = await getMatchedWorldInfo(selectedWorld.value, effectiveCharacter, messages.value)
      } catch (e) {
        console.warn('World info scan failed for reply draft', e)
      }

      const payload = buildReplyDraftPayload(config, effectiveCharacter, messages.value, {
        userName: personaName,
        personaDescription,
        memorySummary: getMemoryState().summary,
        worldInfoText,
        userNote,
      })
      const reply = await generateReply(payload)
      if (requestId !== replyDraftRequestId) return
      const options = parseReplyDraftOptions(reply)
      if (!options.length) {
        throw new Error('模型没有返回可用的回复选项')
      }
      replyDraftOptions.value = options
    } catch (e) {
      if (requestId !== replyDraftRequestId) return
      replyDraftError.value = e instanceof Error && e.message ? e.message : '拟回复失败'
      replyDraftOptions.value = []
    } finally {
      if (requestId === replyDraftRequestId) {
        replyDraftLoading.value = false
      }
    }
  }

  async function runGeneration(options: GenerationOptions = {}) {
    if (!character.value) return

    const config = selectedProfile.value
    const sourceMessages = options.extraMessages?.length
      ? [...messages.value, ...options.extraMessages]
      : messages.value

    const modsStore = useModsStore()
    if (!modsStore.loaded) await modsStore.load()
    const globalEnabled = modsStore.mods.filter((m) => m.enabled)
    const localMods = modsStore.getModsByIds(selectedModIds.value).map((m) => ({ ...m, enabled: true }))
    const seen = new Set<string>()
    const allMods = [...globalEnabled, ...localMods].filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    const effectiveCharacter = getEffectiveCharacter() || character.value

    let worldInfoText = ''
    try {
      worldInfoText = await getMatchedWorldInfo(selectedWorld.value, effectiveCharacter, sourceMessages)
    } catch (e) {
      console.warn('World info scan failed', e)
    }

    const personas = usePersonasStore()
    const personaName = personas.activePersona?.name || 'User'
    const personaDescription = personas.activePersona?.description || ''
    let memorySummaryForPrompt = getMemoryState().summary

    if (options.updateMemory) {
      try {
        memorySummaryForPrompt = await refreshMemorySummary(
          sourceMessages,
          config,
          effectiveCharacter,
          personaName,
        )
      } catch (e) {
        console.warn('Memory summary failed', e)
        memorySummaryForPrompt = getMemoryState().summary
      }
    }

    const payload = buildGeneratePayload(
      config,
      effectiveCharacter,
      sourceMessages,
      worldInfoText,
      allMods,
      selectedPreset.value,
      personaName,
      personaDescription,
      memorySummaryForPrompt,
    )

    const controller = new AbortController()
    streaming.value = {
      active: true,
      controller,
      partial: { content: '' },
    }

    let reasoningContent = ''
    try {
      for await (const evt of generateReplyStream(payload, controller.signal)) {
        if (evt.content) {
          streaming.value.partial.content += evt.content
        }
        if (evt.reasoning) {
          reasoningContent += evt.reasoning
          streaming.value.partial.reasoning = reasoningContent
        }
      }

      const content = streaming.value.partial.content.trim()
      if (content) {
        commitAssistantContent(content, options, reasoningContent)
      }
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      const aborted = err.name === 'AbortError'
      if (!aborted) {
        useUiStore().addToast(`生成失败：${err.message || '请检查模型配置'}`, 'error', 5000)
      }

      // 已收到的部分内容仍然保留；没有部分内容时恢复重新生成前的 swipes
      const partial = streaming.value.partial.content.trim()
      if (partial) {
        commitAssistantContent(`${partial}\n\n[中断]`, options)
      } else if (options.swipes?.length) {
        const restored = options.swipes[options.swipes.length - 1]
        messages.value.push({
          role: 'assistant',
          content: restored,
          date: new Date().toISOString(),
          swipes: options.swipes,
          swipe_id: options.swipes.length - 1,
        })
      }
    } finally {
      streaming.value = { active: false, controller: null, partial: { content: '' } }
      await persistSafe()
    }
  }

  function commitAssistantContent(content: string, options: GenerationOptions, reasoning = '') {
    if (
      typeof options.appendToIndex === 'number' &&
      messages.value[options.appendToIndex]?.role === 'assistant'
    ) {
      const prev = messages.value[options.appendToIndex]
      messages.value[options.appendToIndex] = {
        ...prev,
        content: `${prev.content}\n\n${content}`,
      }
      return
    }

    const message: ChatMessage = {
      role: 'assistant',
      content,
      date: new Date().toISOString(),
    }

    if (options.swipes?.length) {
      const swipes = [...options.swipes]
      if (!swipes.includes(content)) {
        swipes.push(content)
      }
      message.swipes = swipes
      message.swipe_id = swipes.length - 1
    } else {
      message.swipes = [content]
      message.swipe_id = 0
    }

    if (reasoning) {
      message.reasoning = reasoning
    }

    messages.value.push(message)
  }

  function stopGeneration() {
    streaming.value.controller?.abort()
  }

  async function clearCurrentChat() {
    if (!character.value) return
    messages.value = []
    writeMemoryState('', 0)
    await persistSafe()
  }

  async function regenerateLast() {
    if (streaming.value.active) return
    const idx = messages.value.map((m) => m.role).lastIndexOf('assistant')
    if (idx === -1) return

    const oldMsg = normalizeSwipeMessage(messages.value[idx])
    const oldContent = oldMsg.content
    const oldSwipes = oldMsg.swipes?.length ? [...oldMsg.swipes] : [oldContent]
    if (!oldSwipes.includes(oldContent)) {
      oldSwipes.push(oldContent)
    }

    messages.value.splice(idx, 1)
    await persistSafe()

    await runGeneration({ swipes: oldSwipes })
  }

  async function applySwipe(index: number, direction: -1 | 1) {
    const msg = messages.value[index]
    if (!msg || msg.role !== 'assistant' || !msg.swipes?.length) return

    const currentIdx =
      typeof msg.swipe_id === 'number' && msg.swipe_id >= 0
        ? msg.swipe_id
        : msg.swipes.indexOf(msg.content)
    const nextIdx = currentIdx + direction
    if (nextIdx < 0 || nextIdx >= msg.swipes.length) return

    messages.value[index] = {
      ...msg,
      content: msg.swipes[nextIdx],
      swipe_id: nextIdx,
    }

    await persistSafe()
  }

  async function editMessage(index: number, newContent: string) {
    if (index < 0 || index >= messages.value.length) return
    const msg = messages.value[index]
    const next: ChatMessage = { ...msg, content: newContent }
    if (msg.role === 'assistant' && msg.swipes?.length) {
      const swipeIdx =
        typeof msg.swipe_id === 'number' && msg.swipe_id >= 0
          ? msg.swipe_id
          : msg.swipes.indexOf(msg.content)
      if (swipeIdx >= 0) {
        next.swipes = [...msg.swipes]
        next.swipes[swipeIdx] = newContent
      }
    }
    messages.value[index] = next
    await persistSafe()
  }

  async function deleteMessage(index: number) {
    if (index < 0 || index >= messages.value.length) return
    messages.value.splice(index, 1)
    await persistSafe()
  }

  async function attachImageToMessage(index: number, asset: ImageAsset) {
    if (index < 0 || index >= messages.value.length) return
    const msg = messages.value[index]
    const images = Array.isArray(msg.images) ? [...msg.images] : []
    if (!images.some((image) => image.id === asset.id)) {
      images.push(asset)
    }
    messages.value[index] = { ...msg, images }
    await persistSafe()
  }

  async function continueLastReply() {
    if (streaming.value.active) return
    const lastIndex = messages.value.length - 1
    const last = messages.value[lastIndex]
    if (!last || last.role !== 'assistant') return

    await runGeneration({
      appendToIndex: lastIndex,
      extraMessages: [
        {
          role: 'user',
          content: '请从上一条回复的结尾自然续写，不要重复已经说过的内容。',
          date: new Date().toISOString(),
        },
      ],
    })
  }

  function normalizeSwipeMessage(message: ChatMessage): ChatMessage {
    if (message.role !== 'assistant') return message

    const swipes = Array.isArray(message.swipes) ? [...message.swipes] : []
    if (!swipes.includes(message.content)) {
      swipes.push(message.content)
    }

    const swipeId =
      typeof message.swipe_id === 'number' && message.swipe_id >= 0
        ? message.swipe_id
        : swipes.indexOf(message.content)

    return {
      ...message,
      swipes,
      swipe_id: Math.max(0, swipeId),
    }
  }

  return {
    messages,
    metadata,
    character,
    currentChatFile,
    selectedProfileId,
    selectedProfile,
    selectedPresetId,
    selectedPreset,
    selectedWorld,
    selectedModIds,
    loading,
    error,
    memoryUpdating,
    memorySummary,
    memoryUpdatedAt,
    memoryMessageCount,
    replyDraftLoading,
    replyDraftOptions,
    replyDraftError,
    streaming,
    isStreaming,
    streamingContent,
    loadChat,
    sendMessage,
    stopGeneration,
    clearCurrentChat,
    regenerateLast,
    persist,
    persistSafe,
    editMessage,
    deleteMessage,
    attachImageToMessage,
    continueLastReply,
    applySwipe,
    clearMemorySummary,
    draftUserReplies,
    clearReplyDrafts,
    setSelectedProfileId,
    setSelectedPresetId,
    setSelectedWorld,
    setSelectedModIds,
    reset,
  }
})
