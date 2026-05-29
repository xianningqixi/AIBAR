import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ChatMessage, StreamState, Character, ImageAsset, ModelProfile } from '@/api/types'
import { fetchChat, saveChat } from '@/api/chats'
import { generateReplyStream } from '@/api/generate'
import { buildGeneratePayload, getCharacterChatName } from '@/lib/buildPayload'
import { getMatchedWorldInfo } from '@/lib/worldInfoMatch'
import { useModelProfilesStore } from './modelProfiles'
import { useModsStore } from './mods'
import { usePresetsStore } from './presets'
import { usePersonasStore } from './personas'

type GenerationOptions = {
  extraMessages?: ChatMessage[]
  appendToIndex?: number
  swipes?: string[]
}

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

  const streaming = ref<StreamState>({
    active: false,
    controller: null,
    partial: { content: '' },
  })

  const isStreaming = computed(() => streaming.value.active)
  const streamingContent = computed(() => streaming.value.partial.content)
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
    } catch (e: any) {
      console.warn('Load chat failed (may be new):', e.message)
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
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function setSelectedProfileId(profileId: string) {
    const profiles = useModelProfilesStore()
    if (!profiles.getProfile(profileId)) return
    selectedProfileId.value = profileId
    writeMetadataProfileId(profileId)
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function setSelectedWorld(world: string) {
    selectedWorld.value = world
    writeMetadataWorld(world)
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function setSelectedModIds(ids: string[]) {
    selectedModIds.value = [...ids]
    writeMetadataModIds(selectedModIds.value)
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !character.value) return
    if (streaming.value.active) return

    messages.value.push({
      role: 'user',
      content: text.trim(),
      date: new Date().toISOString(),
    })

    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }

    await runGeneration()
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

    const payload = buildGeneratePayload(config, effectiveCharacter, sourceMessages, worldInfoText, allMods, selectedPreset.value, personaName, personaDescription)

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
    } catch (e: any) {
      if (e.name === 'AbortError') {
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
      } else {
        messages.value.push({
          role: 'assistant',
          content: `生成失败：${e.message || '请检查模型配置'}`,
          date: new Date().toISOString(),
        })
      }
    } finally {
      streaming.value = { active: false, controller: null, partial: { content: '' } }
      try {
        await persist()
      } catch (e: any) {
        error.value = 'Save failed: ' + e.message
      }
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
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
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
    try {
      await persist()
    } catch {}

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

    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
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
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function deleteMessage(index: number) {
    if (index < 0 || index >= messages.value.length) return
    messages.value.splice(index, 1)
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
  }

  async function attachImageToMessage(index: number, asset: ImageAsset) {
    if (index < 0 || index >= messages.value.length) return
    const msg = messages.value[index]
    const images = Array.isArray(msg.images) ? [...msg.images] : []
    if (!images.some((image) => image.id === asset.id)) {
      images.push(asset)
    }
    messages.value[index] = { ...msg, images }
    try {
      await persist()
    } catch (e: any) {
      error.value = 'Save failed: ' + e.message
    }
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
    streaming,
    isStreaming,
    streamingContent,
    loadChat,
    sendMessage,
    stopGeneration,
    clearCurrentChat,
    regenerateLast,
    persist,
    editMessage,
    deleteMessage,
    attachImageToMessage,
    continueLastReply,
    applySwipe,
    setSelectedProfileId,
    setSelectedPresetId,
    setSelectedWorld,
    setSelectedModIds,
    reset,
  }
})
