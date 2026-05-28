<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import { useModsStore, type ModItem } from '@/stores/mods'
import { usePresetsStore } from '@/stores/presets'
import { usePersonasStore } from '@/stores/personas'
import type { Preset, Persona } from '@/api/types'
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
const route = useRoute()
const router = useRouter()

function initialTab(): string {
  const raw = String(route.query.tab || '')
  if (['model', 'mods', 'world', 'presets', 'personas', 'about'].includes(raw)) return raw
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
  { key: 'about', label: '关于' },
]

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
  ])
  selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
  hydrateSetupFromProfile(selectedProfile.value)
  selectedModId.value = mods.mods[0]?.id || ''
  selectedPresetId.value = presets.activePresetId || presets.presets[0]?.id || ''
  selectedPersonaId.value = personas.activePersonaId || personas.personas[0]?.id || ''
  await loadWorlds()
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

    <div class="max-w-6xl mx-auto w-full px-5 py-6 flex-1">
      <section class="relative overflow-hidden rounded-2xl ring-1 ring-border-subtle bg-hero-radial mb-6">
        <div class="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-brand-500/20 blur-3xl pointer-events-none" />
        <div class="absolute -bottom-16 -left-8 w-56 h-56 rounded-full bg-accent-500/15 blur-3xl pointer-events-none" />
        <div class="relative grid md:grid-cols-[1fr_auto] gap-6 items-end p-5 md:p-7">
          <div>
            <p class="text-[11px] uppercase tracking-[0.2em] text-brand-300/80 mb-2">配置中心</p>
            <h2 class="text-xl md:text-2xl font-semibold text-ink-primary">
              管理 <span class="text-brand-300">模型 · 生成参数 · 资料库</span>
            </h2>
            <p class="mt-1.5 text-xs md:text-sm text-ink-secondary max-w-xl">
              模型、生成参数、我的身份、世界书和 MOD 分开管理。世界书是设定资料库，MOD 是提示词插件。
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2.5 md:min-w-[520px] md:grid-cols-5">
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
