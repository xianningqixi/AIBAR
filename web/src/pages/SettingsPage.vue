<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import { useModsStore, type ModItem } from '@/stores/mods'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import { useTtsStore } from '@/stores/tts'
import { useImageGenStore } from '@/stores/imageGen'
import { writeSecret } from '@/api/secrets'
import { TTS_PROVIDERS, PROVIDER_MODELS, PROVIDER_VOICES, synthesizeSpeech, type ProviderSecret } from '@/api/tts'
import { IMAGE_PROVIDERS, listImageAssets } from '@/api/imageGen'
import type { ImageAsset, ImageGenProvider, Preset, Persona, TtsProvider, TtsVoiceProfile } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import { providerConfigs } from '@/lib/providers'
import { testConnection } from '@/api/generate'
import type { ModelProfile, WorldInfoEntry, WorldInfoFile, WorldInfoSummary } from '@/api/types'
import {
  deleteWorldInfo,
  getWorldInfo,
  importWorldInfo,
  listWorldInfo,
  saveWorldInfo,
} from '@/api/worldinfo'
import WorldInfoEditor from '@/components/world/WorldInfoEditor.vue'

const models = useModelProfilesStore()
const ui = useUiStore()
const mods = useModsStore()
const presets = usePresetsStore()
const personas = usePersonasStore()
const tts = useTtsStore()
const imageGen = useImageGenStore()
const route = useRoute()
const router = useRouter()

function initialTab(): string {
  const raw = String(route.query.tab || '')
  if (['model', 'mods', 'world', 'presets', 'personas', 'image', 'tts', 'about'].includes(raw)) return raw
  return route.path === '/mods' ? 'mods' : 'model'
}

function syncTabFromRoute() {
  const next = initialTab()
  if (activeTab.value !== next) {
    activeTab.value = next
  }
}

const activeTab = ref(initialTab())
const apiKeyDrafts = ref<Record<string, string>>({})
const selectedProfileId = ref('')
const selectedModId = ref('')
const selectedPresetId = ref('')
const selectedPersonaId = ref('')

interface TestResult {
  ok: boolean
  message: string
  models?: number
}
const testResults = reactive<Record<string, TestResult>>({})
const testing = reactive<Record<string, boolean>>({})

const worlds = ref<WorldInfoSummary[]>([])
const selectedWorld = ref('')
const worldFile = ref<WorldInfoFile | null>(null)
const worldLoading = ref(false)
const worldMode = ref<'entry' | 'json'>('entry')
const worldJson = ref('')

const tabs = [
  { key: 'model', label: '模型连接' },
  { key: 'presets', label: '生成参数' },
  { key: 'personas', label: '我的身份' },
  { key: 'world', label: '世界书' },
  { key: 'mods', label: '提示词 MOD' },
  { key: 'image', label: '图像生成' },
  { key: 'tts', label: '语音 (TTS)' },
  { key: 'about', label: '关于' },
]

const ttsKeyDrafts = reactive<Record<string, string>>({})
const savingTtsKey = ref('')

interface TtsTestResult { ok: boolean; message: string }
const ttsTestResults = reactive<Record<string, TtsTestResult | undefined>>({})
const ttsTesting = reactive<Record<string, boolean>>({})
const TTS_SAMPLE_TEXT = '你好，我是 AIBAR 的语音测试。'
let testAudio: HTMLAudioElement | null = null

const ttsProviderOrder = new Map(TTS_PROVIDERS.map((provider, index) => [provider.id, index]))
const playableTtsProviders = computed(() => TTS_PROVIDERS
  .filter((provider) => provider.playable)
  .sort((a, b) => {
    const rank = (provider: TtsProvider) => {
      if (tts.settings.defaultProvider === provider) return 0
      return tts.settings[provider].enabled ? 1 : 2
    }
    return rank(a.id) - rank(b.id) || (ttsProviderOrder.get(a.id) ?? 0) - (ttsProviderOrder.get(b.id) ?? 0)
  }))
const selectedTtsProvider = ref<TtsProvider>('mimo')
const selectedTtsProviderMeta = computed(() => (
  playableTtsProviders.value.find((provider) => provider.id === selectedTtsProvider.value) || playableTtsProviders.value[0]
))
const ttsVoiceSearch = ref('')
const ttsVoiceDraft = reactive({ name: '', voice: '', note: '' })

const imageKeyDrafts = reactive<Record<string, string>>({})
const savingImageKey = ref('')
const imageTestPrompt = ref('A cinematic story cover, a mysterious tavern at night, warm light, detailed atmosphere, no text')
const imageTestAsset = ref<ImageAsset | null>(null)
const imageHistory = ref<ImageAsset[]>([])
const imageTesting = ref(false)
const selectedImageProviderMeta = computed(() => (
  IMAGE_PROVIDERS.find((provider) => provider.id === imageGen.settings.provider) || IMAGE_PROVIDERS[0]
))

function setImageProvider(provider: string) {
  imageGen.setProvider(provider as ImageGenProvider)
  const meta = IMAGE_PROVIDERS.find((item) => item.id === provider)
  if (meta && !imageGen.settings.model) {
    imageGen.updateSettings({ model: meta.defaultModel })
  }
}

function imageSecretDraftKey(provider: ImageGenProvider, key: string): string {
  return `${provider}:${key}`
}

function setImageSecretDraft(value: string) {
  const meta = selectedImageProviderMeta.value
  if (!meta.secretKey) return
  imageKeyDrafts[imageSecretDraftKey(meta.id, meta.secretKey)] = value
}

async function saveImageSecret() {
  const meta = selectedImageProviderMeta.value
  if (!meta.secretKey) return
  const draftKey = imageSecretDraftKey(meta.id, meta.secretKey)
  const value = imageKeyDrafts[draftKey]
  if (!value?.trim()) {
    ui.addToast(`请输入 ${meta.secretLabel || 'API Key'}`, 'warning')
    return
  }
  savingImageKey.value = draftKey
  try {
    await writeSecret(meta.secretKey, value.trim(), meta.secretLabel || meta.label)
    imageKeyDrafts[draftKey] = ''
    ui.addToast(`${meta.secretLabel || 'API Key'} 已写入 ST secrets`, 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  } finally {
    savingImageKey.value = ''
  }
}

async function loadImageHistory() {
  imageHistory.value = await listImageAssets().catch(() => [])
}

async function runImageTest() {
  imageTesting.value = true
  imageTestAsset.value = null
  try {
    const asset = await imageGen.generateAndSave({
      prompt: imageTestPrompt.value,
      contextType: 'settings',
      contextId: 'image-test',
    })
    imageTestAsset.value = asset
    await loadImageHistory()
    ui.addToast('测试图片已生成', 'success')
  } catch (e: any) {
    ui.addToast(`测试失败：${e.message || '请检查图像配置'}`, 'error')
  } finally {
    imageTesting.value = false
  }
}

interface TtsVoiceItem extends TtsVoiceProfile {
  provider: TtsProvider
  source: '内置' | '自定义'
}

function selectTtsProvider(provider: TtsProvider) {
  selectedTtsProvider.value = provider
}

function setDefaultTtsProvider(provider: TtsProvider) {
  tts.setDefaultProvider(provider)
  selectedTtsProvider.value = provider
}

function ttsProviderStatusLabel(provider: TtsProvider): string {
  if (tts.settings.defaultProvider === provider) return '默认'
  if (tts.settings[provider].enabled) return '已启用'
  return '未启用'
}

function secretDraftKey(provider: TtsProvider, secretKey: string): string {
  return `${provider}:${secretKey}`
}

function getTtsExtra(provider: TtsProvider, key: string) {
  return tts.settings[provider].extra?.[key] ?? ''
}

function updateTtsExtra(provider: TtsProvider, key: string, value: string) {
  tts.updateProvider(provider, {
    extra: {
      ...(tts.settings[provider].extra || {}),
      [key]: value,
    },
  })
}

function ttsVoicePlaceholder(provider: TtsProvider): string {
  const voices = PROVIDER_VOICES[provider] || []
  return voices.length ? voices.slice(0, 3).join(' / ') : '输入 ST voice_id'
}

const selectedTtsVoices = computed<TtsVoiceItem[]>(() => {
  const provider = selectedTtsProviderMeta.value.id
  const builtIn = (PROVIDER_VOICES[provider] || []).map((voice) => ({
    id: `${provider}:${voice}`,
    name: voice,
    voice,
    note: undefined,
    provider,
    source: '内置' as const,
  }))
  const custom = (tts.settings.customVoices[provider] || []).map((voice) => ({
    ...voice,
    provider,
    source: '自定义' as const,
  }))
  const keyword = ttsVoiceSearch.value.trim().toLowerCase()
  const list = [...custom, ...builtIn]
  if (!keyword) return list
  return list.filter((item) => (
    item.name.toLowerCase().includes(keyword)
    || item.voice.toLowerCase().includes(keyword)
    || item.note?.toLowerCase().includes(keyword)
  ))
})

function isCurrentTtsVoice(voice: TtsVoiceItem): boolean {
  return tts.settings[voice.provider].voice === voice.voice
}

function selectTtsVoice(voice: TtsVoiceItem) {
  tts.updateProvider(voice.provider, {
    voice: voice.voice,
    model: voice.model || tts.settings[voice.provider].model,
  })
  ui.addToast(`已选择音色：${voice.name}`, 'success')
}

async function testTtsVoice(voice: TtsVoiceItem) {
  ttsTesting[voice.provider] = true
  delete ttsTestResults[voice.provider]
  if (testAudio) {
    testAudio.pause()
    testAudio.src = ''
    testAudio = null
  }
  try {
    const cfg = tts.settings[voice.provider]
    const blob = await synthesizeSpeech({
      text: TTS_SAMPLE_TEXT,
      provider: voice.provider,
      model: voice.model || cfg.model,
      voice: voice.voice,
      endpoint: cfg.endpoint,
      extra: cfg.extra,
    })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    testAudio = audio
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      if (testAudio === audio) testAudio = null
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      if (testAudio === audio) testAudio = null
    })
    await audio.play()
    ttsTestResults[voice.provider] = { ok: true, message: `${voice.name} 播放成功` }
  } catch (e: any) {
    ttsTestResults[voice.provider] = { ok: false, message: e?.message || '测试失败' }
  } finally {
    ttsTesting[voice.provider] = false
  }
}

function createTtsVoiceId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${selectedTtsProvider.value}-${Date.now()}`
}

function addTtsVoiceProfile() {
  const voice = ttsVoiceDraft.voice.trim()
  if (!voice) {
    ui.addToast('请输入 voice_id', 'warning')
    return
  }
  const provider = selectedTtsProviderMeta.value.id
  tts.addCustomVoice(provider, {
    id: createTtsVoiceId(),
    name: ttsVoiceDraft.name.trim() || voice,
    voice,
    model: tts.settings[provider].model || undefined,
    note: ttsVoiceDraft.note.trim() || undefined,
  })
  ttsVoiceDraft.name = ''
  ttsVoiceDraft.voice = ''
  ttsVoiceDraft.note = ''
  ui.addToast('音色已保存', 'success')
}

function removeTtsVoiceProfile(voice: TtsVoiceItem) {
  if (voice.source !== '自定义') return
  tts.removeCustomVoice(voice.provider, voice.id)
  ui.addToast('音色已删除', 'success')
}

watch(selectedTtsProvider, () => {
  ttsVoiceSearch.value = ''
  ttsVoiceDraft.name = ''
  ttsVoiceDraft.voice = ''
  ttsVoiceDraft.note = ''
})

async function testTtsProvider(provider: TtsProvider) {
  ttsTesting[provider] = true
  delete ttsTestResults[provider]
  if (testAudio) {
    testAudio.pause()
    testAudio.src = ''
    testAudio = null
  }
  try {
    const cfg = tts.settings[provider]
    const blob = await synthesizeSpeech({
      text: TTS_SAMPLE_TEXT,
      provider,
      model: cfg.model,
      voice: cfg.voice,
      endpoint: cfg.endpoint,
      extra: cfg.extra,
    })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    testAudio = audio
    audio.addEventListener('ended', () => {
      URL.revokeObjectURL(url)
      if (testAudio === audio) testAudio = null
    })
    audio.addEventListener('error', () => {
      URL.revokeObjectURL(url)
      if (testAudio === audio) testAudio = null
    })
    await audio.play()
    ttsTestResults[provider] = { ok: true, message: '播放成功' }
  } catch (e: any) {
    ttsTestResults[provider] = { ok: false, message: e?.message || '测试失败' }
  } finally {
    ttsTesting[provider] = false
  }
}

async function saveTtsSecret(provider: TtsProvider, secret: ProviderSecret) {
  const draftKey = secretDraftKey(provider, secret.key)
  const value = ttsKeyDrafts[draftKey]
  if (!value?.trim()) {
    ui.addToast(`请输入 ${secret.label}`, 'warning')
    return
  }
  const meta = TTS_PROVIDERS.find((p) => p.id === provider)
  if (!meta) return
  savingTtsKey.value = draftKey
  try {
    await writeSecret(secret.key, value.trim(), `${meta.label} ${secret.label}`)
    ttsKeyDrafts[draftKey] = ''
    ui.addToast(`${secret.label} 已写入 ST secrets`, 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  } finally {
    savingTtsKey.value = ''
  }
}

const positionLabels: Record<string, string> = {
  system_prepend: '系统前缀',
  system_append: '系统后缀',
  user_suffix: '用户后缀',
}

const selectedProfile = computed<ModelProfile | null>(() => {
  return models.profiles.find((profile) => profile.id === selectedProfileId.value) || models.profiles[0] || null
})

const setupSources = [
  {
    value: 'custom',
    title: '中转 / OpenAI 兼容',
    description: '支持 /v1/chat/completions 的平台都选这个，Gemini 中转也选它。',
  },
  {
    value: 'openai',
    title: 'OpenAI 官方',
    description: '官方 OpenAI Key，不需要填写自定义端点。',
  },
  {
    value: 'deepseek',
    title: 'DeepSeek 官方',
    description: '官方 DeepSeek Key；如果是中转，请选 OpenAI 兼容。',
  },
]

const setupDraft = reactive({
  source: 'custom',
  name: 'OpenAI 兼容',
  endpoint: '',
  model: '',
  apiKey: '',
  maxTokens: 4096,
  testing: false,
})
const setupResult = ref<TestResult | null>(null)

const setupNeedsEndpoint = computed(() => setupDraft.source === 'custom')

const currentDefaultProfile = computed(() => models.getProfile(models.activeProfileId))

function hydrateSetupFromProfile(profile: ModelProfile | null) {
  const cfg = profile ? providerConfigs[profile.source] : providerConfigs.custom
  setupDraft.source = profile?.source || 'custom'
  setupDraft.name = profile?.name || cfg?.label || 'OpenAI 兼容'
  setupDraft.endpoint = profile?.endpoint || cfg?.defaultEndpoint || ''
  setupDraft.model = profile?.model || cfg?.defaultModel || ''
  setupDraft.maxTokens = profile?.maxTokens || 4096
  setupDraft.apiKey = ''
  setupResult.value = profile ? testResults[profile.id] || null : null
}

function chooseSetupSource(source: string) {
  const cfg = providerConfigs[source] || providerConfigs.custom
  setupDraft.source = source
  setupDraft.name = cfg.label
  setupDraft.model = cfg.defaultModel || setupDraft.model
  setupDraft.endpoint = cfg.defaultEndpoint || ''
  setupResult.value = null
}

async function saveSetupProfile() {
  const cfg = providerConfigs[setupDraft.source] || providerConfigs.custom
  const model = setupDraft.model.trim()
  const endpoint = setupDraft.endpoint.trim()
  if (!model) {
    ui.addToast('请填写模型名', 'warning')
    return
  }
  if (setupNeedsEndpoint.value && !endpoint) {
    ui.addToast('请填写兼容接口端点，通常以 /v1 结尾', 'warning')
    return
  }

  setupDraft.testing = true
  setupResult.value = null
  let profile = selectedProfile.value
  if (!profile) {
    profile = models.createProfile(setupDraft.source)
    selectedProfileId.value = profile.id
  }

  models.updateProfile(profile.id, {
    name: setupDraft.name.trim() || cfg.label,
    source: setupDraft.source,
    model,
    endpoint: setupNeedsEndpoint.value ? endpoint : '',
    maxTokens: setupDraft.maxTokens || 4096,
    temperature: profile.temperature ?? 0.7,
    topP: profile.topP ?? 1,
    presencePenalty: profile.presencePenalty ?? 0,
    frequencyPenalty: profile.frequencyPenalty ?? 0,
  })

  try {
    if (setupDraft.apiKey.trim()) {
      await models.saveApiKey(profile.id, setupDraft.apiKey)
      setupDraft.apiKey = ''
    }
    const updated = models.getProfile(profile.id)
    if (!updated) throw new Error('Profile 保存后未找到')
    selectedProfileId.value = updated.id
    const result = await testConnection(updated)
    testResults[updated.id] = result
    setupResult.value = result
    if (result.ok) {
      models.setActive(updated.id)
      ui.addToast(`连接正常，已设为默认 Profile${result.models ? ` · ${result.models} 个模型` : ''}`, 'success')
    } else {
      ui.addToast(`已保存，但连接测试失败：${result.message}`, 'error')
    }
  } catch (e: any) {
    const result = { ok: false, message: e?.message || '连接失败' }
    testResults[profile.id] = result
    setupResult.value = result
    ui.addToast(`连接测试失败：${result.message}`, 'error')
  } finally {
    setupDraft.testing = false
  }
}

const selectedMod = computed<ModItem | null>(() => {
  return mods.mods.find((mod) => mod.id === selectedModId.value) || mods.mods[0] || null
})

const worldJsonValid = computed(() => {
  if (!worldJson.value.trim()) return true
  try {
    JSON.parse(worldJson.value)
    return true
  } catch {
    return false
  }
})

function worldEntries(file: WorldInfoFile | null): WorldInfoEntry[] {
  if (!file) return []
  if (Array.isArray(file.entries)) return file.entries
  if (file.entries && typeof file.entries === 'object') {
    return Object.values(file.entries) as WorldInfoEntry[]
  }
  return []
}

const selectedWorldStats = computed(() => {
  const entries = worldEntries(worldFile.value)
  const enabled = entries.filter((entry) => !entry.disable)
  const constant = enabled.filter((entry) => entry.constant)
  const keyword = enabled.filter((entry) => Array.isArray(entry.key) && entry.key.length > 0)
  const sampleKeywords = keyword
    .flatMap((entry) => Array.isArray(entry.key) ? entry.key : [])
    .filter(Boolean)
    .slice(0, 6)
  return {
    entries: entries.length,
    enabled: enabled.length,
    constant: constant.length,
    keyword: keyword.length,
    sampleKeywords,
  }
})

async function saveKey(profileId: string) {
  const value = apiKeyDrafts.value[profileId]
  if (!value?.trim()) {
    ui.addToast('请输入 API Key', 'warning')
    return
  }
  try {
    await models.saveApiKey(profileId, value)
    apiKeyDrafts.value = { ...apiKeyDrafts.value, [profileId]: '' }
    ui.addToast('API Key 已写入 ST secrets', 'success')
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

async function runTest(profile: ModelProfile) {
  testing[profile.id] = true
  delete testResults[profile.id]
  try {
    const r = await testConnection(profile)
    testResults[profile.id] = r
    ui.addToast(r.ok ? `连接正常${r.models ? ` · ${r.models} 个模型` : ''}` : `连接失败：${r.message}`, r.ok ? 'success' : 'error')
  } catch (e: any) {
    testResults[profile.id] = { ok: false, message: e?.message || '未知错误' }
  } finally {
    testing[profile.id] = false
  }
}

function addProfile(source = 'custom') {
  const profile = models.createProfile(source)
  selectedProfileId.value = profile.id
}

function deleteProfile(profile: ModelProfile) {
  models.deleteProfile(profile.id)
  selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
}

function writeSampleProfiles() {
  const local =
    models.profiles.find((profile) => profile.name === '示例 · 本地 Ollama') ||
    models.createProfile('custom')
  models.updateProfile(local.id, {
    name: '示例 · 本地 Ollama',
    source: 'custom',
    model: 'llama3.1',
    endpoint: 'http://127.0.0.1:11434/v1',
    temperature: 0.7,
    maxTokens: 2048,
  })

  const openrouter =
    models.profiles.find((profile) => profile.name === '示例 · OpenRouter') ||
    models.createProfile('openrouter')
  models.updateProfile(openrouter.id, {
    name: '示例 · OpenRouter',
    source: 'openrouter',
    model: 'openai/gpt-4o-mini',
    temperature: 0.8,
    maxTokens: 4096,
  })

  selectedProfileId.value = local.id
  ui.addToast('已写入 2 个示例模型配置', 'success')
}

function addMod() {
  const mod = mods.createMod()
  selectedModId.value = mod.id
}

function deleteSelectedMod(mod: ModItem) {
  mods.deleteMod(mod.id)
  selectedModId.value = mods.mods[0]?.id || ''
}

function writeSampleMods() {
  const pacing =
    mods.mods.find((mod) => mod.name === '示例 · 慢节奏推进') ||
    mods.createMod()
  mods.updateMod(pacing.id, {
    name: '示例 · 慢节奏推进',
    description: '降低剧情推进速度,每次回复聚焦当前场景。',
    content: '叙事保持慢节奏,不要跳过关键动作和情绪变化。每次回复只推进一个主要动作或一个明确信息点。',
    position: 'system_append',
    enabled: false,
  })

  const userSuffix =
    mods.mods.find((mod) => mod.name === '示例 · 要求可操作') ||
    mods.createMod()
  mods.updateMod(userSuffix.id, {
    name: '示例 · 要求可操作',
    description: '把玩家输入补充为需要明确后果和可操作反馈。',
    content: '请在回复中给出清晰的即时反馈,并让场景保留可继续互动的选择空间。',
    position: 'user_suffix',
    enabled: false,
  })

  selectedModId.value = pacing.id
  ui.addToast('已写入 2 个示例 MOD', 'success')
}

async function loadWorlds() {
  worldLoading.value = true
  try {
    worlds.value = await listWorldInfo()
    if (!selectedWorld.value && worlds.value[0]) {
      await selectWorld(worlds.value[0].file_id)
    }
  } catch (e: any) {
    ui.addToast(`世界书加载失败：${e.message}`, 'error')
  } finally {
    worldLoading.value = false
  }
}

async function selectWorld(name: string) {
  selectedWorld.value = name
  try {
    const data = await getWorldInfo(name)
    worldFile.value = data
    worldJson.value = JSON.stringify(data, null, 2)
  } catch (e: any) {
    ui.addToast(`读取失败：${e.message}`, 'error')
  }
}

async function saveCurrentWorld(payload?: WorldInfoFile) {
  if (!selectedWorld.value) {
    ui.addToast('未选择世界书', 'warning')
    return
  }
  let data: WorldInfoFile | null = null
  if (payload) {
    data = payload
    worldFile.value = payload
    worldJson.value = JSON.stringify(payload, null, 2)
  } else if (worldMode.value === 'json') {
    if (!worldJsonValid.value) {
      ui.addToast('JSON 格式无效', 'warning')
      return
    }
    data = JSON.parse(worldJson.value) as WorldInfoFile
    worldFile.value = data
  } else {
    data = worldFile.value
  }
  if (!data) {
    ui.addToast('没有可保存的内容', 'warning')
    return
  }
  try {
    await saveWorldInfo(selectedWorld.value, data)
    ui.addToast('世界书已保存', 'success')
    await loadWorlds()
  } catch (e: any) {
    ui.addToast(`保存失败：${e.message}`, 'error')
  }
}

async function deleteWorld() {
  if (!selectedWorld.value) return
  if (!window.confirm(`删除世界书「${selectedWorld.value}」？`)) return
  try {
    await deleteWorldInfo(selectedWorld.value)
    ui.addToast('世界书已删除', 'success')
    selectedWorld.value = ''
    worldFile.value = null
    worldJson.value = ''
    await loadWorlds()
  } catch (e: any) {
    ui.addToast(`删除失败：${e.message}`, 'error')
  }
}

async function importWorldClick() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const result = await importWorldInfo(file)
      ui.addToast(`已导入世界书：${result.name}`, 'success')
      await loadWorlds()
      await selectWorld(result.name)
    } catch (e: any) {
      ui.addToast(`导入失败：${e.message}`, 'error')
    }
  }
  input.click()
}

async function createWorld() {
  const name = window.prompt('新世界书名称', 'AIBAR 示例世界书')
  const trimmed = name?.trim()
  if (!trimmed) return
  try {
    const data: WorldInfoFile = {
      name: trimmed,
      entries: {},
    }
    await saveWorldInfo(trimmed, data)
    ui.addToast('世界书已创建', 'success')
    selectedWorld.value = trimmed
    worldFile.value = data
    worldJson.value = JSON.stringify(data, null, 2)
    await loadWorlds()
    await selectWorld(trimmed)
  } catch (e: any) {
    ui.addToast(`创建失败：${e.message}`, 'error')
  }
}

async function writeSampleWorld() {
  const name = 'AIBAR 示例世界书'
  const data: WorldInfoFile = {
    name,
    entries: {
      '0': {
        uid: 0,
        key: ['月港', '银潮城'],
        keysecondary: [],
        comment: '月港',
        content: '月港是一座建在潮汐断崖上的港城,夜晚会被蓝白色潮光照亮。这里的居民相信潮声能带来旧日记忆。',
        constant: false,
        disable: false,
        order: 100,
      },
      '1': {
        uid: 1,
        key: [],
        keysecondary: [],
        comment: '叙事基调',
        content: '世界整体基调偏神秘、克制、细腻。重要信息应通过场景细节和角色行动逐步显露。',
        constant: true,
        disable: false,
        order: 80,
      },
    },
  }
  try {
    await saveWorldInfo(name, data)
    ui.addToast('已写入示例世界书', 'success')
    await loadWorlds()
    await selectWorld(name)
  } catch (e: any) {
    ui.addToast(`写入失败：${e.message}`, 'error')
  }
}

function exportWorld() {
  if (!selectedWorld.value || !worldFile.value) return
  const blob = new Blob([JSON.stringify(worldFile.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selectedWorld.value}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function switchWorldMode(mode: 'entry' | 'json') {
  if (worldMode.value === mode) return
  if (worldMode.value === 'json' && mode === 'entry') {
    if (!worldJsonValid.value) {
      ui.addToast('JSON 格式无效,无法切换到条目视图', 'warning')
      return
    }
    if (worldJson.value.trim()) {
      worldFile.value = JSON.parse(worldJson.value) as WorldInfoFile
    }
  } else if (worldMode.value === 'entry' && mode === 'json' && worldFile.value) {
    worldJson.value = JSON.stringify(worldFile.value, null, 2)
  }
  worldMode.value = mode
}

const selectedPreset = computed<Preset | null>(() => {
  return presets.presets.find((p) => p.id === selectedPresetId.value) || presets.presets[0] || null
})

function addPreset() {
  const p = presets.createPreset()
  selectedPresetId.value = p.id
}

function deleteSelectedPreset(preset: Preset) {
  presets.deletePreset(preset.id)
  selectedPresetId.value = presets.presets[0]?.id || ''
}

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
  await Promise.all([
    models.loadSecrets(),
    mods.load(),
    presets.load(),
    personas.load(),
    tts.load(),
    imageGen.load(),
  ])
  selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
  hydrateSetupFromProfile(selectedProfile.value)
  selectedModId.value = mods.mods[0]?.id || ''
  selectedPresetId.value = presets.activePresetId || presets.presets[0]?.id || ''
  selectedPersonaId.value = personas.activePersonaId || personas.personas[0]?.id || ''
  await loadWorlds()
  await loadImageHistory()
})

watch(activeTab, (tab) => {
  if (route.path === '/settings') {
    router.replace({ query: { ...route.query, tab } })
  }
})

watch(() => [route.path, route.query.tab], syncTabFromRoute)

watch(
  () => models.profiles.map((profile) => profile.id).join('|'),
  () => {
    if (!selectedProfileId.value || !models.getProfile(selectedProfileId.value)) {
      selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
    }
  },
)

watch(selectedProfileId, () => {
  hydrateSetupFromProfile(selectedProfile.value)
})

watch(
  () => mods.mods.map((mod) => mod.id).join('|'),
  () => {
    if (!selectedModId.value || !mods.getMod(selectedModId.value)) {
      selectedModId.value = mods.mods[0]?.id || ''
    }
  },
)
</script>

<template>
  <div class="min-h-screen flex flex-col bg-bg">
    <AppPageHeader title="设置" back-to="/browse" />

    <div class="max-w-6xl mx-auto w-full px-5 py-6 flex-1 animate-fade-in-up">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial mb-6">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-accent-500/15 blur-3xl pointer-events-none" />
        <div class="relative grid md:grid-cols-[1fr_auto] gap-6 items-end p-5 md:p-7">
          <div>
            <p class="text-[11px] uppercase tracking-[0.2em] text-brand-300/80 mb-2">配置中心</p>
            <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
              管理 <span class="text-brand-300">模型 · 图像 · 语音 · 资料库</span>
            </h2>
            <p class="mt-1.5 text-xs md:text-sm text-ink-secondary max-w-xl">
              模型、生成参数、图像生成、语音、世界书和 MOD 分开管理。世界书是设定资料库，MOD 是提示词插件。
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2.5 md:min-w-[620px] md:grid-cols-6">
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">模型</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ models.profiles.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">预设</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ presets.presets.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">身份</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ personas.personas.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">世界书</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ worlds.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">MOD</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ mods.mods.length }}</p>
            </div>
            <div class="rounded-xl bg-surface/70 backdrop-blur ring-1 ring-border-subtle p-3 text-center">
              <p class="text-[10px] uppercase tracking-wider text-ink-muted">图片</p>
              <p class="mt-1 text-xl font-semibold text-ink-primary tabular-nums">{{ imageHistory.length }}</p>
            </div>
          </div>
        </div>
      </section>

      <AppTabs v-model="activeTab" :tabs="tabs" class="mb-6" />

      <div v-if="activeTab === 'model'" class="space-y-4">
        <AppCard padding="md" tone="glow" class="space-y-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-brand-300 font-semibold">模型连接向导</p>
              <h2 class="mt-2 text-xl font-semibold text-ink-primary">先把一个模型连通，其他参数以后再调。</h2>
              <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
                中转、Gemini 兼容、OpenAI-compatible、本地 Ollama 这类 /v1 接口，都走“中转 / OpenAI 兼容”。
              </p>
            </div>
            <div class="rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
              <p class="text-[11px] text-ink-muted">当前默认</p>
              <p class="mt-0.5 max-w-[260px] truncate text-sm font-semibold text-ink-primary">
                {{ currentDefaultProfile?.name || '未设置' }}
              </p>
            </div>
          </div>

          <div class="grid md:grid-cols-3 gap-3">
            <button
              v-for="source in setupSources"
              :key="source.value"
              type="button"
              class="min-h-[104px] rounded-xl p-4 text-left ring-1 transition-all"
              :class="setupDraft.source === source.value
                ? 'bg-brand-500/15 text-brand-100 ring-brand-400/60'
                : 'bg-surface-elevated text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40'"
              @click="chooseSetupSource(source.value)"
            >
              <p class="text-sm font-semibold">{{ source.title }}</p>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted">{{ source.description }}</p>
            </button>
          </div>

          <div class="grid lg:grid-cols-[1fr_1fr] gap-3">
            <AppFormField label="Profile 名称">
              <AppInput v-model="setupDraft.name" placeholder="例如：DS 中转" />
            </AppFormField>
            <AppFormField label="模型名">
              <AppInput v-model="setupDraft.model" placeholder="例如：deepseek-v4-pro / gpt-5.5" />
            </AppFormField>
            <AppFormField
              v-if="setupNeedsEndpoint"
              label="接口端点"
              hint="一般填写到 /v1，例如 https://example.com/v1"
            >
              <AppInput v-model="setupDraft.endpoint" placeholder="https://你的中转地址/v1" />
            </AppFormField>
            <AppFormField label="API Key">
              <AppInput v-model="setupDraft.apiKey" type="password" placeholder="保存到 ST secrets，留空则沿用已保存 Key" />
            </AppFormField>
            <AppFormField label="Max Tokens" hint="上下文长度不是这里；这里是单次最多输出长度。">
              <AppInput
                type="number"
                min="256"
                :model-value="setupDraft.maxTokens"
                @update:model-value="(value) => setupDraft.maxTokens = parseInt(String(value)) || 4096"
              />
            </AppFormField>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <div
              v-if="setupResult"
              :class="[
                'rounded-lg px-3 py-2 text-xs ring-1',
                setupResult.ok
                  ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/25'
                  : 'bg-red-500/10 text-red-300 ring-red-500/25',
              ]"
            >
              {{ setupResult.ok ? '连接正常，已设为默认 Profile' : `连接失败：${setupResult.message}` }}
              <template v-if="setupResult.ok && setupResult.models"> · {{ setupResult.models }} 个模型</template>
            </div>
            <div v-else class="text-xs text-ink-muted">
              保存并测试通过后，聊天页和 AI 起草会默认使用这个 Profile。
            </div>
            <AppButton variant="gradient" :disabled="setupDraft.testing" @click="saveSetupProfile">
              {{ setupDraft.testing ? '测试中…' : '保存并测试' }}
            </AppButton>
          </div>
        </AppCard>

        <details class="overflow-hidden rounded-xl bg-surface ring-1 ring-border-subtle">
          <summary class="cursor-pointer list-none px-4 py-3 hover:bg-surface-elevated transition-colors">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold text-ink-primary">高级 Profile 管理</h3>
              <span class="text-xs text-ink-muted">多 Profile、参数、删除和示例配置</span>
            </div>
          </summary>
          <div class="grid lg:grid-cols-[300px_1fr] gap-4 border-t border-border-subtle p-4">
        <AppCard padding="md">
          <div class="flex flex-wrap gap-2 mb-4">
            <AppButton size="sm" @click="addProfile()">+ 新建</AppButton>
            <AppButton size="sm" variant="secondary" @click="writeSampleProfiles">写入示例</AppButton>
          </div>
          <div class="space-y-1">
            <button
              v-for="profile in models.profiles"
              :key="profile.id"
              :class="[
                'relative w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                selectedProfileId === profile.id
                  ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
              ]"
              @click="selectedProfileId = profile.id"
            >
              <span
                v-if="selectedProfileId === profile.id"
                class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
              />
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">{{ profile.name }}</span>
                <span v-if="models.activeProfileId === profile.id" class="text-[10px] text-emerald-300 shrink-0">默认</span>
              </div>
              <div class="mt-1 text-[11px] text-ink-muted truncate">
                {{ providerConfigs[profile.source]?.label || profile.source }} · {{ profile.model || '未填模型' }}
              </div>
            </button>
          </div>
        </AppCard>

        <AppCard v-if="selectedProfile" padding="none">
          <div
            v-if="testResults[selectedProfile.id]"
            :class="[
              'px-4 py-2 text-xs rounded-t-xl flex items-center gap-2',
              testResults[selectedProfile.id].ok
                ? 'bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20'
                : 'bg-red-500/10 text-red-300 border-b border-red-500/20',
            ]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="testResults[selectedProfile.id].ok ? 'bg-emerald-400' : 'bg-red-400'" />
            <span class="flex-1">
              {{ testResults[selectedProfile.id].ok ? '连接正常' : '连接失败' }}
              <template v-if="testResults[selectedProfile.id].ok && testResults[selectedProfile.id].models">
                · 可用 {{ testResults[selectedProfile.id].models }} 个模型
              </template>
              <template v-if="!testResults[selectedProfile.id].ok">
                · {{ testResults[selectedProfile.id].message }}
              </template>
            </span>
          </div>

          <div class="p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold text-ink-primary">模型配置详情</h2>
                <p class="text-xs text-ink-muted mt-1">左侧浏览已有 Profile,右侧编辑当前选中项。</p>
              </div>
              <div class="flex items-center gap-3">
                <span
                  :class="[
                    'text-[11px] inline-flex items-center gap-1.5',
                    models.hasSavedApiKey(selectedProfile) || selectedProfile.source === 'custom' ? 'text-emerald-300' : 'text-amber-300',
                  ]"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="models.hasSavedApiKey(selectedProfile) || selectedProfile.source === 'custom' ? 'bg-emerald-400' : 'bg-amber-400'" />
                  {{ selectedProfile.source === 'custom' ? '本地/兼容可无 Key' : models.getProviderSecretLabel(selectedProfile) }}
                </span>
                <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
                  <input
                    type="radio"
                    :checked="models.activeProfileId === selectedProfile.id"
                    class="accent-brand-500"
                    @change="models.setActive(selectedProfile.id)"
                  />
                  默认
                </label>
                <AppButton
                  size="sm"
                  variant="secondary"
                  :disabled="testing[selectedProfile.id]"
                  @click="runTest(selectedProfile)"
                >
                  {{ testing[selectedProfile.id] ? '测试中…' : '测试连接' }}
                </AppButton>
                <button
                  v-if="models.profiles.length > 1"
                  class="text-xs text-red-400 hover:text-red-300 transition-colors"
                  @click="deleteProfile(selectedProfile)"
                >
                  删除
                </button>
              </div>
            </div>

            <AppFormField label="名称">
              <AppInput
                :model-value="selectedProfile.name"
                @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { name: value })"
              />
            </AppFormField>

            <div class="grid md:grid-cols-3 gap-3">
              <AppFormField label="服务商">
                <AppSelect
                  :model-value="selectedProfile.source"
                  @update:model-value="(value) => {
                    const provider = providerConfigs[value]
                    models.updateProfile(selectedProfile!.id, {
                      source: value,
                      model: provider?.defaultModel || selectedProfile!.model,
                      endpoint: provider?.defaultEndpoint || '',
                      secretId: undefined,
                      apiKeySaved: false,
                    })
                  }"
                >
                  <option v-for="opt in models.providerOptions" :key="opt.value" :value="opt.value">
                    {{ opt.label }}
                  </option>
                </AppSelect>
              </AppFormField>
              <AppFormField label="模型名">
                <AppInput
                  :model-value="selectedProfile.model"
                  @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { model: value })"
                />
              </AppFormField>
              <AppFormField label="API Key">
                <div class="flex gap-2">
                  <AppInput
                    v-model="apiKeyDrafts[selectedProfile.id]"
                    type="password"
                    placeholder="留空不修改"
                  />
                  <AppButton size="sm" @click="saveKey(selectedProfile.id)">保存</AppButton>
                </div>
              </AppFormField>
            </div>

            <AppFormField
              v-if="selectedProfile.source === 'custom' || providerConfigs[selectedProfile.source]?.endpointKey === 'reverse_proxy'"
              label="自定义/反代端点"
              hint="例如：http://127.0.0.1:11434/v1"
            >
              <AppInput
                :model-value="selectedProfile.endpoint || ''"
                placeholder="http://127.0.0.1:11434/v1"
                @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { endpoint: value })"
              />
            </AppFormField>

            <div class="grid md:grid-cols-5 gap-3 pt-1">
              <div>
                <label class="block text-xs font-medium text-ink-secondary mb-1.5">
                  Temperature
                  <span class="text-ink-muted ml-1 tabular-nums">{{ selectedProfile.temperature }}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  :value="selectedProfile.temperature"
                  class="w-full accent-brand-500"
                  @input="(e) => models.updateProfile(selectedProfile!.id, { temperature: parseFloat((e.target as HTMLInputElement).value) })"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-ink-secondary mb-1.5">
                  Top P
                  <span class="text-ink-muted ml-1 tabular-nums">{{ selectedProfile.topP }}</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="selectedProfile.topP"
                  class="w-full accent-brand-500"
                  @input="(e) => models.updateProfile(selectedProfile!.id, { topP: parseFloat((e.target as HTMLInputElement).value) })"
                />
              </div>
              <AppFormField label="Max Tokens">
                <AppInput
                  type="number"
                  min="64"
                  :model-value="selectedProfile.maxTokens"
                  @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { maxTokens: parseInt(String(value)) || 4096 })"
                />
              </AppFormField>
              <AppFormField label="Presence">
                <AppInput
                  type="number"
                  step="0.1"
                  :model-value="selectedProfile.presencePenalty"
                  @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { presencePenalty: parseFloat(String(value)) || 0 })"
                />
              </AppFormField>
              <AppFormField label="Frequency">
                <AppInput
                  type="number"
                  step="0.1"
                  :model-value="selectedProfile.frequencyPenalty"
                  @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { frequencyPenalty: parseFloat(String(value)) || 0 })"
                />
              </AppFormField>
            </div>
          </div>
        </AppCard>
          </div>
        </details>
      </div>

      <div v-if="activeTab === 'mods'" class="grid lg:grid-cols-[300px_1fr] gap-4">
        <AppCard padding="md">
          <div class="flex flex-wrap gap-2 mb-4">
            <AppButton size="sm" @click="addMod">+ 新建</AppButton>
            <AppButton size="sm" variant="secondary" @click="writeSampleMods">写入示例</AppButton>
          </div>
          <div class="space-y-1">
            <button
              v-for="mod in mods.mods"
              :key="mod.id"
              :class="[
                'relative w-full text-left px-3 py-2.5 rounded-lg transition-colors',
                selectedModId === mod.id
                  ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
              ]"
              @click="selectedModId = mod.id"
            >
              <span
                v-if="selectedModId === mod.id"
                class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
              />
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">{{ mod.name }}</span>
                <span v-if="mod.enabled" class="text-[10px] text-emerald-300 shrink-0">全局</span>
              </div>
              <div class="mt-1 text-[11px] text-ink-muted truncate">
                {{ mod.builtin ? '公用Mod' : '我的Mod' }} · {{ positionLabels[mod.position] }} · {{ mod.content.length }} 字
              </div>
            </button>
            <AppEmpty v-if="!mods.mods.length" icon="box" title="暂无 MOD" description="点击上方新建或写入示例。" />
          </div>
        </AppCard>

        <AppCard v-if="selectedMod" padding="md" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">MOD 详情</h2>
              <p class="text-xs text-ink-muted mt-1">左侧浏览已有 MOD,右侧编辑当前选中项。</p>
            </div>
            <div class="flex items-center gap-2">
              <span v-if="selectedMod.builtin" class="text-[10px] uppercase tracking-wider text-ink-muted bg-surface-sunken px-1.5 py-0.5 rounded">内置</span>
              <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
                <input
                  type="checkbox"
                  :checked="selectedMod.enabled"
                  class="accent-brand-500"
                  @change="(e) => mods.updateMod(selectedMod!.id, { enabled: (e.target as HTMLInputElement).checked })"
                />
                全局启用
              </label>
              <button
                v-if="!selectedMod.builtin"
                class="text-xs text-red-400 hover:text-red-300 transition-colors"
                @click="deleteSelectedMod(selectedMod)"
              >
                删除
              </button>
            </div>
          </div>

          <AppFormField label="名称">
            <AppInput
              :model-value="selectedMod.name"
              @update:model-value="(v) => mods.updateMod(selectedMod!.id, { name: v as string })"
            />
          </AppFormField>

          <div class="grid md:grid-cols-2 gap-3">
            <AppFormField label="位置">
              <AppSelect
                :model-value="selectedMod.position"
                @update:model-value="(v) => mods.updateMod(selectedMod!.id, { position: v as any })"
              >
                <option value="system_prepend">系统前缀(放在所有角色描述之前)</option>
                <option value="system_append">系统后缀(放在角色提示末尾)</option>
                <option value="user_suffix">用户后缀(拼到最后一条用户消息)</option>
              </AppSelect>
            </AppFormField>
            <AppFormField label="简介">
              <AppInput
                :model-value="selectedMod.description"
                placeholder="给自己看的备注"
                @update:model-value="(v) => mods.updateMod(selectedMod!.id, { description: v as string })"
              />
            </AppFormField>
          </div>

          <AppFormField label="内容" hint="这段文本会按位置注入生成请求。">
            <AppTextarea
              :model-value="selectedMod.content"
              :rows="10"
              auto-grow
              :placeholder="positionLabels[selectedMod.position]"
              @update:model-value="(v) => mods.updateMod(selectedMod!.id, { content: v })"
            />
          </AppFormField>
        </AppCard>
      </div>

      <div v-if="activeTab === 'presets'" class="grid lg:grid-cols-[300px_1fr] gap-4">
        <AppCard padding="md">
          <div class="flex flex-wrap gap-2 mb-4">
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
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
              ]"
              @click="selectedPresetId = p.id"
            >
              <span
                v-if="selectedPresetId === p.id"
                class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
              />
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">{{ p.name }}</span>
                <span v-if="presets.activePresetId === p.id" class="text-[10px] text-emerald-300 shrink-0">当前</span>
              </div>
              <div class="mt-1 text-[11px] text-ink-muted truncate">
                T {{ p.temperature }} · P {{ p.topP }} · {{ p.maxTokens }} tokens
              </div>
            </button>
          </div>
        </AppCard>

        <AppCard v-if="selectedPreset" padding="md" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">预设详情</h2>
              <p class="text-xs text-ink-muted mt-1">预设可快速切换模型的温度、生成长度等参数。</p>
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
                class="text-xs text-red-400 hover:text-red-300 transition-colors"
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

          <div class="grid md:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-ink-secondary mb-1.5">
                Temperature
                <span class="text-ink-muted ml-1 tabular-nums">{{ selectedPreset.temperature }}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                :value="selectedPreset.temperature"
                class="w-full accent-brand-500"
                @input="(e) => presets.updatePreset(selectedPreset!.id, { temperature: parseFloat((e.target as HTMLInputElement).value) })"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-secondary mb-1.5">
                Top P
                <span class="text-ink-muted ml-1 tabular-nums">{{ selectedPreset.topP }}</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                :value="selectedPreset.topP"
                class="w-full accent-brand-500"
                @input="(e) => presets.updatePreset(selectedPreset!.id, { topP: parseFloat((e.target as HTMLInputElement).value) })"
              />
            </div>
            <AppFormField label="Max Tokens">
              <AppInput
                type="number"
                min="64"
                :model-value="selectedPreset.maxTokens"
                @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { maxTokens: parseInt(String(v)) || 4096 })"
              />
            </AppFormField>
            <AppFormField label="Presence Penalty">
              <AppInput
                type="number"
                step="0.1"
                :model-value="selectedPreset.presencePenalty"
                @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { presencePenalty: parseFloat(String(v)) || 0 })"
              />
            </AppFormField>
            <AppFormField label="Frequency Penalty" class="md:col-span-2">
              <AppInput
                type="number"
                step="0.1"
                :model-value="selectedPreset.frequencyPenalty"
                @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { frequencyPenalty: parseFloat(String(v)) || 0 })"
              />
            </AppFormField>
            <AppFormField label="额外系统提示" class="md:col-span-2" hint="追加到角色系统提示末尾。">
              <AppTextarea
                :model-value="selectedPreset.systemPrompt"
                :rows="3"
                auto-grow
                @update:model-value="(v) => presets.updatePreset(selectedPreset!.id, { systemPrompt: v as string })"
              />
            </AppFormField>
          </div>
        </AppCard>
      </div>

      <div v-if="activeTab === 'personas'" class="grid lg:grid-cols-[300px_1fr] gap-4">
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
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
              ]"
              @click="selectedPersonaId = p.id"
            >
              <span
                v-if="selectedPersonaId === p.id"
                class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
              />
              <div class="flex items-center justify-between gap-2">
                <span class="text-sm font-medium truncate">{{ p.name }}</span>
                <span v-if="personas.activePersonaId === p.id" class="text-[10px] text-emerald-300 shrink-0">当前</span>
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
                class="text-xs text-red-400 hover:text-red-300 transition-colors"
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

      <div v-if="activeTab === 'world'" class="space-y-4">
        <AppCard padding="md" tone="glow" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-brand-300 font-semibold">世界书使用向导</p>
              <h2 class="mt-2 text-xl font-semibold text-ink-primary">把长期设定做成会自动命中的资料库。</h2>
              <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
                世界书适合放地点、组织、术语、规则、历史和暗线。绑定到角色、故事或当前聊天后，每次生成会扫描最近对话和角色设定，命中关键词才把对应条目注入提示词。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <AppButton size="sm" variant="secondary" @click="writeSampleWorld">写入示例</AppButton>
              <AppButton size="sm" @click="createWorld">新建世界书</AppButton>
            </div>
          </div>

          <div class="grid md:grid-cols-3 gap-3">
            <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
              <p class="text-sm font-semibold text-ink-primary">1. 写资料</p>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted">每条只写一个知识点。比如“月港是什么”“银潮城有哪些禁忌”。</p>
            </div>
            <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
              <p class="text-sm font-semibold text-ink-primary">2. 填关键词</p>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted">玩家或角色提到关键词时才会注入。常驻条目适合放全局基调。</p>
            </div>
            <div class="rounded-xl bg-surface-elevated p-4 ring-1 ring-border-subtle">
              <p class="text-sm font-semibold text-ink-primary">3. 绑定使用</p>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted">角色绑定适合长期世界观；故事绑定适合某段开局；聊天绑定适合临时切换。</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken p-3 ring-1 ring-border-subtle">
            <div class="text-xs text-ink-secondary">
              <template v-if="selectedWorld">
                当前「{{ selectedWorld }}」：{{ selectedWorldStats.enabled }} 条启用，{{ selectedWorldStats.keyword }} 条关键词触发，{{ selectedWorldStats.constant }} 条常驻。
                <span v-if="selectedWorldStats.sampleKeywords.length" class="text-ink-muted">
                  关键词：{{ selectedWorldStats.sampleKeywords.join('、') }}
                </span>
              </template>
              <template v-else>
                先写入示例或新建一本世界书，再在下方编辑条目。
              </template>
            </div>
            <div class="flex flex-wrap gap-2">
              <AppButton size="sm" variant="secondary" @click="router.push('/character/new')">去角色绑定</AppButton>
              <AppButton size="sm" variant="secondary" @click="router.push('/story/new')">去故事绑定</AppButton>
            </div>
          </div>
        </AppCard>

        <div class="grid lg:grid-cols-[280px_1fr] gap-4">
        <AppCard padding="md">
          <div class="flex flex-wrap gap-2 mb-4">
            <AppButton size="sm" @click="createWorld">+ 新建</AppButton>
            <AppButton size="sm" @click="importWorldClick">导入</AppButton>
            <AppButton size="sm" variant="secondary" @click="loadWorlds">刷新</AppButton>
            <AppButton size="sm" variant="secondary" @click="writeSampleWorld">写入示例</AppButton>
          </div>
          <div v-if="worldLoading" class="text-xs text-ink-muted">加载中…</div>
          <div v-else class="space-y-1">
            <button
              v-for="world in worlds"
              :key="world.file_id"
              :class="[
                'relative w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors',
                selectedWorld === world.file_id
                  ? 'bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30'
                  : 'text-ink-secondary hover:bg-white/5 hover:text-ink-primary',
              ]"
              @click="selectWorld(world.file_id)"
            >
              <span
                v-if="selectedWorld === world.file_id"
                class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
              />
              {{ world.name || world.file_id }}
            </button>
            <AppEmpty
              v-if="worlds.length === 0"
              icon="book"
              title="暂无世界书"
              description="从原生 ST 或外部 JSON 导入。"
            />
          </div>
        </AppCard>

        <AppCard padding="md" class="min-h-[520px] flex flex-col">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">{{ selectedWorld || '选择世界书' }}</h2>
              <p class="text-xs text-ink-muted mt-0.5">条目编辑器 / 原始 JSON 双视图,保存后写回原文件。</p>
            </div>
            <div class="flex gap-2">
              <div class="inline-flex rounded-lg border border-border-subtle overflow-hidden text-xs">
                <button
                  :class="['px-2.5 py-1', worldMode === 'entry' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-secondary hover:bg-white/5']"
                  @click="switchWorldMode('entry')"
                >条目</button>
                <button
                  :class="['px-2.5 py-1 border-l border-border-subtle', worldMode === 'json' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-secondary hover:bg-white/5']"
                  @click="switchWorldMode('json')"
                >JSON</button>
              </div>
              <AppButton size="sm" variant="secondary" @click="exportWorld">导出</AppButton>
              <AppButton size="sm" variant="danger" @click="deleteWorld">删除</AppButton>
              <AppButton size="sm" @click="() => saveCurrentWorld()">保存</AppButton>
            </div>
          </div>
          <div v-if="!selectedWorld" class="flex-1 flex items-center justify-center text-xs text-ink-muted">
            从左侧选择一本世界书。
          </div>
          <template v-else>
            <WorldInfoEditor
              v-if="worldMode === 'entry' && worldFile"
              :file="worldFile"
              class="flex-1"
              @update="(f) => { worldFile = f; worldJson = JSON.stringify(f, null, 2) }"
            />
            <AppTextarea
              v-else
              v-model="worldJson"
              class="flex-1"
              :rows="22"
              placeholder="选择左侧世界书后,JSON 会显示在此处。"
            />
            <p v-if="worldMode === 'json' && worldJson && !worldJsonValid" class="mt-2 text-xs text-red-400">JSON 格式无效</p>
          </template>
        </AppCard>
        </div>
      </div>

      <div v-if="activeTab === 'image'" class="space-y-4">
        <AppCard padding="md" tone="glow" class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-[0.18em] text-brand-300 font-semibold">文生图配置</p>
              <h2 class="mt-2 text-xl font-semibold text-ink-primary">统一配置后，故事封面、角色图、聊天配图都会复用这里。</h2>
              <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
                图片会保存到本地 ST 用户目录下的 AIBAR 图片库，聊天记录和故事卡只保存图片引用。
              </p>
            </div>
            <div class="rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
              <p class="text-[11px] text-ink-muted">当前渠道</p>
              <p class="mt-0.5 max-w-[260px] truncate text-sm font-semibold text-ink-primary">
                {{ selectedImageProviderMeta.label }}
              </p>
            </div>
          </div>

          <div class="grid md:grid-cols-3 gap-3">
            <button
              v-for="provider in IMAGE_PROVIDERS"
              :key="provider.id"
              type="button"
              class="min-h-[108px] rounded-xl p-4 text-left ring-1 transition-all"
              :class="imageGen.settings.provider === provider.id
                ? 'bg-brand-500/15 text-brand-100 ring-brand-400/60'
                : 'bg-surface-elevated text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40'"
              @click="setImageProvider(provider.id)"
            >
              <p class="text-sm font-semibold">{{ provider.label }}</p>
              <p class="mt-1 text-xs leading-relaxed text-ink-muted">{{ provider.description }}</p>
            </button>
          </div>
        </AppCard>

        <div class="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
          <AppCard padding="md" class="space-y-4">
            <div class="grid md:grid-cols-2 gap-3">
              <AppFormField label="模型">
                <AppInput
                  :model-value="imageGen.settings.model"
                  :placeholder="selectedImageProviderMeta.defaultModel || '使用服务端当前模型'"
                  @update:model-value="(v) => imageGen.updateSettings({ model: v })"
                />
              </AppFormField>
              <AppFormField v-if="imageGen.settings.provider === 'openai'" label="OpenAI 尺寸">
                <AppSelect
                  :model-value="imageGen.settings.openaiSize"
                  @update:model-value="(v) => imageGen.updateSettings({ openaiSize: v as string })"
                >
                  <option value="1024x1024">1024 x 1024</option>
                  <option value="1024x1792">1024 x 1792</option>
                  <option value="1792x1024">1792 x 1024</option>
                </AppSelect>
              </AppFormField>
              <AppFormField
                v-if="imageGen.settings.provider === 'openai'"
                label="中转 URL"
                hint="留空使用 OpenAI 官方；支持 https://host/v1 或完整 /images/generations。"
                class="md:col-span-2"
              >
                <AppInput
                  :model-value="imageGen.settings.openaiBaseUrl"
                  placeholder="https://api.example.com/v1"
                  @update:model-value="(v) => imageGen.updateSettings({ openaiBaseUrl: v })"
                />
              </AppFormField>
              <template v-else>
                <AppFormField label="宽度">
                  <AppInput
                    type="number"
                    min="256"
                    max="2048"
                    step="64"
                    :model-value="imageGen.settings.width"
                    @update:model-value="(v) => imageGen.updateSettings({ width: parseInt(v) || 768 })"
                  />
                </AppFormField>
                <AppFormField label="高度">
                  <AppInput
                    type="number"
                    min="256"
                    max="2048"
                    step="64"
                    :model-value="imageGen.settings.height"
                    @update:model-value="(v) => imageGen.updateSettings({ height: parseInt(v) || 1024 })"
                  />
                </AppFormField>
              </template>

              <AppFormField label="采样器">
                <AppInput
                  :model-value="imageGen.settings.sampler"
                  placeholder="DPM++ 2M Karras / k_euler"
                  @update:model-value="(v) => imageGen.updateSettings({ sampler: v })"
                />
              </AppFormField>
              <AppFormField label="Steps">
                <AppInput
                  type="number"
                  min="1"
                  max="80"
                  :model-value="imageGen.settings.steps"
                  @update:model-value="(v) => imageGen.updateSettings({ steps: parseInt(v) || 28 })"
                />
              </AppFormField>
              <AppFormField label="CFG Scale">
                <AppInput
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  :model-value="imageGen.settings.scale"
                  @update:model-value="(v) => imageGen.updateSettings({ scale: Number(v) || 7 })"
                />
              </AppFormField>
              <AppFormField label="Seed" hint="-1 表示随机。">
                <AppInput
                  type="number"
                  :model-value="imageGen.settings.seed"
                  @update:model-value="(v) => imageGen.updateSettings({ seed: parseInt(v) || -1 })"
                />
              </AppFormField>
            </div>

            <div v-if="imageGen.settings.provider === 'auto'" class="grid md:grid-cols-2 gap-3 rounded-xl bg-surface-sunken p-3 ring-1 ring-border-subtle">
              <AppFormField label="SD WebUI 地址">
                <AppInput
                  :model-value="imageGen.settings.autoUrl"
                  placeholder="http://127.0.0.1:7860"
                  @update:model-value="(v) => imageGen.updateSettings({ autoUrl: v })"
                />
              </AppFormField>
              <AppFormField label="Basic Auth" hint="如果没有就留空。">
                <AppInput
                  :model-value="imageGen.settings.autoAuth"
                  placeholder="user:password"
                  @update:model-value="(v) => imageGen.updateSettings({ autoAuth: v })"
                />
              </AppFormField>
              <div class="md:col-span-2 flex justify-end">
                <AppButton
                  size="sm"
                  variant="secondary"
                  :disabled="imageGen.testing"
                  @click="() => imageGen.testCurrentProvider().then(() => ui.addToast('SD WebUI 连接正常', 'success')).catch((e) => ui.addToast(`连接失败：${e.message}`, 'error'))"
                >
                  {{ imageGen.testing ? '检测中…' : '检测连接' }}
                </AppButton>
              </div>
            </div>

            <div v-if="selectedImageProviderMeta.secretKey" class="rounded-xl bg-surface-sunken p-3 ring-1 ring-border-subtle">
              <AppFormField :label="selectedImageProviderMeta.secretLabel || 'API Key'" :hint="`ST secrets ${selectedImageProviderMeta.secretKey}`">
                <div class="flex gap-2">
                  <AppInput
                    :model-value="imageKeyDrafts[imageSecretDraftKey(selectedImageProviderMeta.id, selectedImageProviderMeta.secretKey)] || ''"
                    type="password"
                    placeholder="留空不修改"
                    @update:model-value="setImageSecretDraft"
                  />
                  <AppButton
                    size="sm"
                    variant="secondary"
                    :disabled="savingImageKey === imageSecretDraftKey(selectedImageProviderMeta.id, selectedImageProviderMeta.secretKey)"
                    @click="saveImageSecret"
                  >
                    {{ savingImageKey === imageSecretDraftKey(selectedImageProviderMeta.id, selectedImageProviderMeta.secretKey) ? '…' : '保存' }}
                  </AppButton>
                </div>
              </AppFormField>
            </div>

            <AppFormField label="Prompt 前缀" hint="可用 {prompt} 指定插入位置。">
              <AppTextarea
                :model-value="imageGen.settings.promptPrefix"
                :rows="3"
                auto-grow
                @update:model-value="(v) => imageGen.updateSettings({ promptPrefix: v })"
              />
            </AppFormField>
            <AppFormField label="负面提示词">
              <AppTextarea
                :model-value="imageGen.settings.negativePrompt"
                :rows="3"
                auto-grow
                @update:model-value="(v) => imageGen.updateSettings({ negativePrompt: v })"
              />
            </AppFormField>
            <label class="flex items-center gap-2 text-xs text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                :checked="imageGen.settings.enhance"
                class="accent-brand-500"
                @change="(e) => imageGen.updateSettings({ enhance: (e.target as HTMLInputElement).checked })"
              />
              Pollinations 增强 Prompt
            </label>
          </AppCard>

          <AppCard padding="md" class="space-y-3">
            <div>
              <h3 class="text-sm font-semibold text-ink-primary">测试生成</h3>
              <p class="mt-1 text-xs text-ink-muted">用于确认当前渠道、Key、尺寸和默认负面词是否可用。</p>
            </div>
            <AppTextarea v-model="imageTestPrompt" :rows="5" auto-grow />
            <AppButton class="w-full" variant="gradient" :disabled="imageTesting || imageGen.generating" @click="runImageTest">
              {{ imageTesting || imageGen.generating ? '生成中…' : '生成测试图' }}
            </AppButton>
            <div class="aspect-square overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-border-subtle">
              <img v-if="imageTestAsset" :src="imageTestAsset.url" class="h-full w-full object-cover" alt="" />
              <div v-else class="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">测试图会显示在这里</div>
            </div>
          </AppCard>
        </div>

        <AppCard padding="md" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-semibold text-ink-primary">本地图片库</h3>
              <p class="mt-1 text-xs text-ink-muted">故事封面、角色图、聊天配图生成后都会留在这里。</p>
            </div>
            <AppButton size="sm" variant="secondary" @click="loadImageHistory">刷新</AppButton>
          </div>
          <div v-if="imageHistory.length" class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <a
              v-for="asset in imageHistory.slice(0, 20)"
              :key="asset.id"
              :href="asset.url"
              target="_blank"
              rel="noreferrer"
              class="overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border-subtle hover:ring-brand-500/40"
              :title="asset.prompt || asset.fileName"
            >
              <img :src="asset.url" class="aspect-square w-full object-cover" alt="" />
              <div class="p-2">
                <p class="truncate text-[11px] text-ink-secondary">{{ asset.contextType || 'image' }} · {{ asset.provider || 'unknown' }}</p>
              </div>
            </a>
          </div>
          <AppEmpty v-else icon="box" title="还没有本地图片" description="生成故事封面、角色图或聊天配图后会出现在这里。" />
        </AppCard>
      </div>

      <div v-if="activeTab === 'tts'" class="space-y-4">
        <AppCard padding="md">
          <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">按消息朗读</h2>
              <p class="mt-0.5 text-xs text-ink-muted">配置默认渠道和音色；聊天里每条消息单独触发播放。</p>
            </div>
            <div class="flex items-center gap-2 text-xs text-ink-secondary">
              <span>默认 Provider</span>
              <AppSelect
                :model-value="tts.settings.defaultProvider"
                class="!w-56"
                @update:model-value="(v) => setDefaultTtsProvider(v as TtsProvider)"
              >
                <option v-for="provider in playableTtsProviders" :key="provider.id" :value="provider.id">
                  {{ provider.label }}
                </option>
              </AppSelect>
            </div>
          </div>
        </AppCard>

        <div class="grid lg:grid-cols-[320px_minmax(0,1fr)] gap-4 items-start">
          <AppCard padding="none" class="overflow-hidden">
            <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <div>
                <h2 class="text-sm font-semibold text-ink-primary">TTS 渠道</h2>
                <p class="text-[11px] text-ink-muted mt-0.5">选择一个渠道后在右侧配置。</p>
              </div>
              <span class="text-[11px] text-ink-muted">{{ playableTtsProviders.length }} 个</span>
            </div>
            <div class="max-h-[420px] overflow-y-auto divide-y divide-border-subtle">
              <button
                v-for="provider in playableTtsProviders"
                :key="provider.id"
                type="button"
                :class="[
                  'w-full text-left px-4 py-3 border-l-2 transition-colors',
                  selectedTtsProvider === provider.id
                    ? 'bg-brand-500/10 border-l-brand-400'
                    : 'border-l-transparent hover:bg-white/[0.03]',
                ]"
                @click="selectTtsProvider(provider.id)"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-medium text-ink-primary truncate">{{ provider.label }}</span>
                      <span class="text-[10px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">ST</span>
                    </div>
                    <p class="text-[11px] text-ink-muted mt-1 truncate">{{ provider.description }}</p>
                  </div>
                  <span
                    :class="[
                      'text-[10px] shrink-0 mt-0.5',
                      tts.settings.defaultProvider === provider.id
                        ? 'text-emerald-300'
                        : tts.settings[provider.id].enabled
                          ? 'text-brand-300'
                          : 'text-ink-muted',
                    ]"
                  >
                    {{ ttsProviderStatusLabel(provider.id) }}
                  </span>
                </div>
              </button>
            </div>
          </AppCard>

          <AppCard padding="none">
            <div
              v-if="ttsTestResults[selectedTtsProviderMeta.id]"
              :class="[
                'px-4 py-2 text-xs rounded-t-xl flex items-center gap-2',
                ttsTestResults[selectedTtsProviderMeta.id]?.ok
                  ? 'bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20'
                  : 'bg-red-500/10 text-red-300 border-b border-red-500/20',
              ]"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="ttsTestResults[selectedTtsProviderMeta.id]?.ok ? 'bg-emerald-400' : 'bg-red-400'" />
              <span class="flex-1 truncate">
                {{ ttsTestResults[selectedTtsProviderMeta.id]?.ok ? '播放成功' : `失败：${ttsTestResults[selectedTtsProviderMeta.id]?.message}` }}
              </span>
            </div>

            <div class="p-4 space-y-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h2 class="text-base font-semibold text-ink-primary truncate">{{ selectedTtsProviderMeta.label }}</h2>
                    <span class="text-[10px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">
                      ST: {{ selectedTtsProviderMeta.stName }}
                    </span>
                  </div>
                  <p class="text-xs text-ink-muted mt-1 leading-relaxed">{{ selectedTtsProviderMeta.description }}</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <AppButton
                    v-if="selectedTtsProviderMeta.playable && tts.settings.defaultProvider !== selectedTtsProviderMeta.id"
                    size="sm"
                    variant="secondary"
                    @click="setDefaultTtsProvider(selectedTtsProviderMeta.id)"
                  >
                    设为默认
                  </AppButton>
                  <span v-if="tts.settings.defaultProvider === selectedTtsProviderMeta.id" class="text-[10px] text-emerald-300">默认</span>
                  <label class="flex items-center gap-1 text-xs text-ink-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="tts.settings[selectedTtsProviderMeta.id].enabled"
                      class="accent-brand-500"
                      @change="(e) => tts.updateProvider(selectedTtsProviderMeta.id, { enabled: (e.target as HTMLInputElement).checked })"
                    />
                    启用
                  </label>
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-2">
                <AppFormField label="模型">
                  <AppSelect
                    v-if="PROVIDER_MODELS[selectedTtsProviderMeta.id]?.length && !selectedTtsProviderMeta.freeFormModel"
                    :model-value="tts.settings[selectedTtsProviderMeta.id].model"
                    @update:model-value="(v) => tts.updateProvider(selectedTtsProviderMeta.id, { model: v as string })"
                  >
                    <option v-for="m in PROVIDER_MODELS[selectedTtsProviderMeta.id]" :key="m" :value="m">{{ m }}</option>
                  </AppSelect>
                  <AppInput
                    v-else
                    :model-value="tts.settings[selectedTtsProviderMeta.id].model"
                    :disabled="!selectedTtsProviderMeta.freeFormModel && !PROVIDER_MODELS[selectedTtsProviderMeta.id]?.length"
                    :placeholder="selectedTtsProviderMeta.freeFormModel ? '自定义模型名' : '此 provider 不需要模型'"
                    @update:model-value="(v) => tts.updateProvider(selectedTtsProviderMeta.id, { model: v })"
                  />
                </AppFormField>
                <AppFormField label="默认音色">
                  <AppSelect
                    v-if="PROVIDER_VOICES[selectedTtsProviderMeta.id]?.length && !selectedTtsProviderMeta.freeFormVoice"
                    :model-value="tts.settings[selectedTtsProviderMeta.id].voice"
                    @update:model-value="(v) => tts.updateProvider(selectedTtsProviderMeta.id, { voice: v as string })"
                  >
                    <option v-for="v in PROVIDER_VOICES[selectedTtsProviderMeta.id]" :key="v" :value="v">{{ v }}</option>
                  </AppSelect>
                  <AppInput
                    v-else
                    :model-value="tts.settings[selectedTtsProviderMeta.id].voice"
                    :placeholder="ttsVoicePlaceholder(selectedTtsProviderMeta.id)"
                    @update:model-value="(v) => tts.updateProvider(selectedTtsProviderMeta.id, { voice: v })"
                  />
                </AppFormField>
                <AppFormField v-if="selectedTtsProviderMeta.hasEndpoint" :label="selectedTtsProviderMeta.endpointLabel || 'Endpoint'">
                  <AppInput
                    :model-value="tts.settings[selectedTtsProviderMeta.id].endpoint || ''"
                    :placeholder="selectedTtsProviderMeta.endpointPlaceholder || 'Provider endpoint'"
                    @update:model-value="(v) => tts.updateProvider(selectedTtsProviderMeta.id, { endpoint: v })"
                  />
                </AppFormField>
                <AppFormField
                  v-for="field in selectedTtsProviderMeta.extraFields || []"
                  :key="field.key"
                  :label="field.label"
                >
                  <AppInput
                    :model-value="String(getTtsExtra(selectedTtsProviderMeta.id, field.key))"
                    :type="field.type || 'text'"
                    :placeholder="field.placeholder"
                    @update:model-value="(v) => updateTtsExtra(selectedTtsProviderMeta.id, field.key, v)"
                  />
                </AppFormField>
              </div>

              <div v-if="selectedTtsProviderMeta.secretKeys?.length" class="grid sm:grid-cols-2 gap-2">
                <AppFormField
                  v-for="secret in selectedTtsProviderMeta.secretKeys"
                  :key="secret.key"
                  :label="secret.label"
                  :hint="`ST secrets ${secret.key}`"
                >
                  <div class="flex gap-2">
                    <AppInput
                      :model-value="ttsKeyDrafts[secretDraftKey(selectedTtsProviderMeta.id, secret.key)] || ''"
                      type="password"
                      :placeholder="secret.placeholder || '留空不修改'"
                      @update:model-value="(v) => { ttsKeyDrafts[secretDraftKey(selectedTtsProviderMeta.id, secret.key)] = v }"
                    />
                    <AppButton
                      size="sm"
                      variant="secondary"
                      :disabled="savingTtsKey === secretDraftKey(selectedTtsProviderMeta.id, secret.key)"
                      @click="saveTtsSecret(selectedTtsProviderMeta.id, secret)"
                    >
                      {{ savingTtsKey === secretDraftKey(selectedTtsProviderMeta.id, secret.key) ? '…' : '保存' }}
                    </AppButton>
                  </div>
                </AppFormField>
              </div>

              <div class="pt-1 flex items-center justify-between gap-3">
                <span class="text-[11px] text-ink-muted truncate">Provider ID: {{ selectedTtsProviderMeta.id }}</span>
                <AppButton
                  size="sm"
                  :disabled="ttsTesting[selectedTtsProviderMeta.id]"
                  @click="testTtsProvider(selectedTtsProviderMeta.id)"
                >
                  {{ ttsTesting[selectedTtsProviderMeta.id] ? '合成中…' : '测试朗读' }}
                </AppButton>
              </div>
            </div>
          </AppCard>
        </div>

        <AppCard padding="md" class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">音色库</h2>
              <p class="text-[11px] text-ink-muted mt-0.5">{{ selectedTtsProviderMeta.label }} · {{ selectedTtsVoices.length }} 个音色</p>
            </div>
            <div class="text-xs text-ink-muted">
              当前：<span class="text-ink-primary">{{ tts.settings[selectedTtsProviderMeta.id].voice || '未选择' }}</span>
            </div>
          </div>

          <div class="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div class="space-y-3">
              <AppInput
                v-model="ttsVoiceSearch"
                placeholder="搜索音色"
              />
              <div class="max-h-80 overflow-y-auto rounded-xl border border-border-subtle divide-y divide-border-subtle">
                <div
                  v-for="voice in selectedTtsVoices"
                  :key="voice.id"
                  :class="[
                    'px-3 py-2 flex items-center gap-3',
                    isCurrentTtsVoice(voice) ? 'bg-brand-500/10' : 'bg-surface/30',
                  ]"
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm text-ink-primary truncate">{{ voice.name }}</span>
                      <span class="text-[10px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">{{ voice.source }}</span>
                      <span v-if="isCurrentTtsVoice(voice)" class="text-[10px] text-emerald-300 shrink-0">当前</span>
                    </div>
                    <div class="text-[11px] text-ink-muted truncate">{{ voice.voice }}</div>
                    <div v-if="voice.note" class="text-[11px] text-ink-muted truncate mt-0.5">{{ voice.note }}</div>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <AppButton size="sm" variant="secondary" :disabled="ttsTesting[voice.provider]" @click="testTtsVoice(voice)">
                      试听
                    </AppButton>
                    <AppButton size="sm" :disabled="isCurrentTtsVoice(voice)" @click="selectTtsVoice(voice)">
                      使用
                    </AppButton>
                    <AppButton
                      v-if="voice.source === '自定义'"
                      size="sm"
                      variant="danger"
                      @click="removeTtsVoiceProfile(voice)"
                    >
                      删除
                    </AppButton>
                  </div>
                </div>
                <div v-if="!selectedTtsVoices.length" class="px-4 py-8 text-center text-sm text-ink-muted">
                  暂无音色
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-border-subtle bg-surface/30 p-3 space-y-3">
              <div>
                <h3 class="text-sm font-semibold text-ink-primary">创作音色</h3>
                <p class="text-[11px] text-ink-muted mt-0.5">{{ selectedTtsProviderMeta.label }}</p>
              </div>
              <AppFormField label="名称">
                <AppInput v-model="ttsVoiceDraft.name" placeholder="例如：温柔旁白" />
              </AppFormField>
              <AppFormField label="voice_id">
                <AppInput v-model="ttsVoiceDraft.voice" :placeholder="ttsVoicePlaceholder(selectedTtsProviderMeta.id)" />
              </AppFormField>
              <AppFormField label="备注">
                <AppTextarea v-model="ttsVoiceDraft.note" :rows="3" placeholder="语气、来源、适用角色" />
              </AppFormField>
              <div class="flex justify-end">
                <AppButton size="sm" @click="addTtsVoiceProfile">保存音色</AppButton>
              </div>
            </div>
          </div>
        </AppCard>

      </div>

      <AppCard v-if="activeTab === 'about'" padding="lg" tone="glow">
        <div class="flex items-start gap-4">
          <div class="w-12 h-12 rounded-xl bg-brand-gradient shadow-glow flex items-center justify-center shrink-0">
            <span class="text-xl font-bold text-white">A</span>
          </div>
          <div class="space-y-2">
            <h2 class="text-base font-semibold text-ink-primary">AIBAR Web</h2>
            <p class="text-sm text-ink-secondary leading-relaxed">v0.1.0 · 基于 SillyTavern 后端 API 的简化前端。</p>
            <p class="text-ink-muted text-xs">所有角色卡、聊天记录、世界书、MOD 都写入 ST 原生目录 / settings,可与原生 UI 并存。</p>
          </div>
        </div>
      </AppCard>
    </div>
  </div>
</template>
