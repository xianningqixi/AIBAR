import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TtsProvider, TtsProviderConfig, TtsCharacterVoice, TtsSettings, TtsVoiceProfile } from '@/api/types'
import { loadAibarSettings, saveAibarSettings } from '@/api/settings'
import { PROVIDER_MODELS, PROVIDER_VOICES, TTS_PROVIDERS, synthesizeSpeech } from '@/api/tts'

const PROVIDER_IDS = TTS_PROVIDERS.map((p) => p.id) as readonly TtsProvider[]
const PLAYABLE_PROVIDER_IDS = TTS_PROVIDERS.filter((p) => p.playable).map((p) => p.id) as readonly TtsProvider[]

const DEFAULTS = Object.fromEntries(TTS_PROVIDERS.map((provider) => [
  provider.id,
  {
    enabled: false,
    model: PROVIDER_MODELS[provider.id]?.[0] || '',
    voice: PROVIDER_VOICES[provider.id]?.[0] || '',
    endpoint: provider.defaultEndpoint || '',
    extra: Object.fromEntries((provider.extraFields || []).map((field) => [field.key, field.defaultValue ?? ''])),
  } satisfies TtsProviderConfig,
])) as Record<TtsProvider, TtsProviderConfig>

function normalizeVoice(provider: TtsProvider, voice: string, fallback: string): string {
  if (provider === 'mimo') {
    if (voice === 'default_zh' || voice === 'mimo_default') return '冰糖'
    if (voice === 'default_en') return 'Mia'
  }
  return voice || fallback
}

function normalizeModel(provider: TtsProvider, model: string, fallback: string): string {
  if (provider === 'mimo' && model === 'mimo-v2-tts') return 'mimo-v2.5-tts'
  return model || fallback
}

function normalizeProvider(provider: TtsProvider, input: unknown, fallback: TtsProviderConfig): TtsProviderConfig {
  if (!input || typeof input !== 'object') return { ...fallback }
  const obj = input as Record<string, unknown>
  const voice = typeof obj.voice === 'string' ? obj.voice : ''
  const model = typeof obj.model === 'string' ? obj.model : ''
  return {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : fallback.enabled,
    model: normalizeModel(provider, model, fallback.model),
    voice: normalizeVoice(provider, voice, fallback.voice),
    endpoint: typeof obj.endpoint === 'string' ? obj.endpoint : fallback.endpoint,
    extra: obj.extra && typeof obj.extra === 'object'
      ? { ...(fallback.extra || {}), ...(obj.extra as Record<string, string | number | boolean>) }
      : fallback.extra ? { ...fallback.extra } : undefined,
  }
}

function normalizeCustomVoices(input: unknown): Record<TtsProvider, TtsVoiceProfile[]> {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const result = Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, []])) as unknown as Record<TtsProvider, TtsVoiceProfile[]>
  for (const provider of PROVIDER_IDS) {
    const list = Array.isArray(raw[provider]) ? raw[provider] as unknown[] : []
    result[provider] = list
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' && item.id ? item.id : `${provider}-${String(item.voice || item.name || Date.now())}`,
        name: typeof item.name === 'string' && item.name ? item.name : String(item.voice || ''),
        voice: typeof item.voice === 'string' ? item.voice : '',
        model: typeof item.model === 'string' ? item.model : undefined,
        note: typeof item.note === 'string' ? item.note : undefined,
      }))
      .filter((item) => item.voice)
  }
  return result
}

function normalizeSettings(input: unknown): TtsSettings {
  const obj = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const defaultProvider = PLAYABLE_PROVIDER_IDS.includes(obj.defaultProvider as TtsProvider)
    ? (obj.defaultProvider as TtsProvider)
    : 'openai'
  const charRaw = obj.characterVoices && typeof obj.characterVoices === 'object'
    ? obj.characterVoices as Record<string, unknown>
    : {}
  const characterVoices: Record<string, TtsCharacterVoice> = {}
  for (const [avatar, v] of Object.entries(charRaw)) {
    if (!v || typeof v !== 'object') continue
    const cv = v as Record<string, unknown>
    const p = PROVIDER_IDS.includes(cv.provider as TtsProvider) ? (cv.provider as TtsProvider) : 'openai'
    const voice = typeof cv.voice === 'string' ? cv.voice : ''
    if (!voice) continue
    characterVoices[avatar] = { provider: p, voice }
  }
  const result = {
    enabled: typeof obj.enabled === 'boolean' ? obj.enabled : false,
    defaultProvider,
    characterVoices,
    customVoices: normalizeCustomVoices(obj.customVoices),
  } as TtsSettings
  for (const provider of PROVIDER_IDS) {
    result[provider] = normalizeProvider(provider, obj[provider], DEFAULTS[provider])
  }
  return result
}

export const useTtsStore = defineStore('tts', () => {
  const settings = ref<TtsSettings>(normalizeSettings({}))
  const loaded = ref(false)
  const currentMessageKey = ref<string>('')
  const isPlaying = ref(false)
  const isLoadingAudio = ref(false)
  let currentAudio: HTMLAudioElement | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let storeVersion = 0
  let playbackVersion = 0
  let loadPromise: Promise<void> | null = null

  const enabled = computed(() => settings.value.enabled)
  const defaultProvider = computed(() => settings.value.defaultProvider)

  async function load() {
    if (loadPromise) return loadPromise
    if (loaded.value) return
    const version = storeVersion
    const promise = (async () => {
      try {
        const stored = await loadAibarSettings<{ simple_ui_tts?: TtsSettings }>()
        if (version === storeVersion) settings.value = normalizeSettings(stored.simple_ui_tts)
      } catch (e) {
        if (version === storeVersion) console.warn('Load TTS settings failed', e)
      } finally {
        if (version === storeVersion) {
          loaded.value = true
          loadPromise = null
        }
      }
    })()
    loadPromise = promise
    return promise
  }

  function schedulePersist() {
    if (!loaded.value) return
    if (persistTimer) clearTimeout(persistTimer)
    const version = storeVersion
    persistTimer = setTimeout(() => {
      persistTimer = null
      if (version === storeVersion) void persistNow(version)
    }, 300)
  }

  async function persistNow(version = storeVersion) {
    if (version !== storeVersion) return
    try {
      await saveAibarSettings({ simple_ui_tts: settings.value })
    } catch (e) {
      if (version === storeVersion) console.warn('Persist TTS settings failed', e)
    }
  }

  function setEnabled(v: boolean) {
    settings.value.enabled = v
    schedulePersist()
  }

  function setDefaultProvider(p: TtsProvider) {
    if (!PLAYABLE_PROVIDER_IDS.includes(p)) return
    settings.value.defaultProvider = p
    schedulePersist()
  }

  function updateProvider(p: TtsProvider, updates: Partial<TtsProviderConfig>) {
    if (!PROVIDER_IDS.includes(p)) return
    settings.value[p] = { ...settings.value[p], ...updates }
    schedulePersist()
  }

  function setCharacterVoice(avatar: string, voice: TtsCharacterVoice | null) {
    if (!avatar) return
    if (!voice || !voice.voice) {
      const next = { ...settings.value.characterVoices }
      delete next[avatar]
      settings.value.characterVoices = next
    } else {
      settings.value.characterVoices = {
        ...settings.value.characterVoices,
        [avatar]: { provider: voice.provider, voice: voice.voice },
      }
    }
    schedulePersist()
  }

  function addCustomVoice(provider: TtsProvider, voice: TtsVoiceProfile) {
    if (!PROVIDER_IDS.includes(provider) || !voice.voice.trim()) return
    const current = settings.value.customVoices[provider] || []
    const id = voice.id || `${provider}-${Date.now()}`
    settings.value.customVoices = {
      ...settings.value.customVoices,
      [provider]: [
        ...current.filter((item) => item.id !== id),
        {
          id,
          name: voice.name.trim() || voice.voice.trim(),
          voice: voice.voice.trim(),
          model: voice.model?.trim() || undefined,
          note: voice.note?.trim() || undefined,
        },
      ],
    }
    schedulePersist()
  }

  function removeCustomVoice(provider: TtsProvider, id: string) {
    if (!PROVIDER_IDS.includes(provider) || !id) return
    settings.value.customVoices = {
      ...settings.value.customVoices,
      [provider]: (settings.value.customVoices[provider] || []).filter((item) => item.id !== id),
    }
    schedulePersist()
  }

  function getEffectiveVoice(avatar?: string): {
    provider: TtsProvider; model: string; voice: string; endpoint?: string
  } | null {
    if (avatar && settings.value.characterVoices[avatar]) {
      const cv = settings.value.characterVoices[avatar]
      const cfg = settings.value[cv.provider]
      if (!cfg.enabled) return null
      return { provider: cv.provider, model: cfg.model, voice: cv.voice, endpoint: cfg.endpoint }
    }
    const p = settings.value.defaultProvider
    const cfg = settings.value[p]
    if (!cfg.enabled) return null
    return { provider: p, model: cfg.model, voice: cfg.voice, endpoint: cfg.endpoint }
  }

  function stopPlayback() {
    playbackVersion += 1
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
    isPlaying.value = false
    isLoadingAudio.value = false
    currentMessageKey.value = ''
  }

  async function play(text: string, messageKey: string, avatarOverride?: string) {
    if (!text?.trim()) return
    if (currentMessageKey.value === messageKey && isPlaying.value) {
      stopPlayback()
      return
    }
    stopPlayback()
    const version = storeVersion
    const requestId = playbackVersion
    const effective = getEffectiveVoice(avatarOverride)
    if (!effective) {
      throw new Error('当前 TTS 渠道未启用或没有可用音色，请到设置 → 语音配置')
    }
    currentMessageKey.value = messageKey
    isLoadingAudio.value = true
    try {
      const blob = await synthesizeSpeech({
        text: text.trim(),
        provider: effective.provider,
        model: effective.model,
        voice: effective.voice,
        endpoint: effective.endpoint,
        extra: settings.value[effective.provider].extra,
      })
      if (version !== storeVersion || requestId !== playbackVersion) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      currentAudio = audio
      isLoadingAudio.value = false
      isPlaying.value = true
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url)
        if (currentAudio === audio) {
          currentAudio = null
          isPlaying.value = false
          currentMessageKey.value = ''
        }
      })
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(url)
        if (currentAudio === audio) {
          currentAudio = null
          isPlaying.value = false
          currentMessageKey.value = ''
        }
      })
      await audio.play()
    } catch (e) {
      if (version !== storeVersion || requestId !== playbackVersion) return
      isLoadingAudio.value = false
      isPlaying.value = false
      currentMessageKey.value = ''
      throw e
    }
  }

  function reset() {
    storeVersion += 1
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = null
    loadPromise = null
    stopPlayback()
    settings.value = normalizeSettings({})
    loaded.value = false
    currentMessageKey.value = ''
    isPlaying.value = false
    isLoadingAudio.value = false
  }

  return {
    settings,
    loaded,
    enabled,
    defaultProvider,
    currentMessageKey,
    isPlaying,
    isLoadingAudio,
    load,
    setEnabled,
    setDefaultProvider,
    updateProvider,
    setCharacterVoice,
    addCustomVoice,
    removeCustomVoice,
    getEffectiveVoice,
    play,
    stopPlayback,
    reset,
  }
})
