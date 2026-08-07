<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import { providerConfigs } from '@/lib/providers'
import { testConnection } from '@/api/generate'
import { getApiErrorMessage } from '@/api/client'
import type { ModelProfile } from '@/api/types'

const models = useModelProfilesStore()
const session = useSessionStore()
const ui = useUiStore()
let viewEpoch = 0

const apiKeyDrafts = ref<Record<string, string>>({})
const selectedProfileId = ref('')

interface TestResult {
  ok: boolean
  message: string
  models?: number
}
const testResults = reactive<Record<string, TestResult>>({})
const testing = reactive<Record<string, boolean>>({})

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
    value: 'claude',
    title: 'Anthropic / Claude',
    description: '原生 Messages API；官方直连或填写兼容中转的 /v1 基础地址。',
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
  inputPrice: 0,
  outputPrice: 0,
  enabled: true,
  testing: false,
})
const setupResult = ref<TestResult | null>(null)

const canManageSelectedCredentials = computed(() => selectedProfile.value?.canManageCredentials !== false)
const setupShowsEndpoint = computed(() => (
  setupDraft.source === 'custom'
  || providerConfigs[setupDraft.source]?.endpointKey === 'reverse_proxy'
))
const setupRequiresEndpoint = computed(() => setupDraft.source === 'custom')
const setupEndpointHint = computed(() => {
  if (!canManageSelectedCredentials.value) return '凭据由其他管理员维护'
  if (setupDraft.source === 'claude') {
    return '官方直连可留空；兼容中转填写到 /v1，系统会调用 /messages。'
  }
  if (setupDraft.source === 'custom') {
    return '填写 OpenAI 兼容基础地址，一般以 /v1 结尾。'
  }
  return '官方直连可留空；使用中转时一般填写到 /v1。'
})

const currentDefaultProfile = computed(() => models.getProfile(models.activeProfileId))

function isCurrentView(epoch: number, handle: string) {
  return epoch === viewEpoch && handle === (session.user?.handle || '') && session.isAdmin
}

function clearLocalState() {
  apiKeyDrafts.value = {}
  selectedProfileId.value = ''
  for (const key of Object.keys(testResults)) delete testResults[key]
  for (const key of Object.keys(testing)) delete testing[key]
  setupDraft.apiKey = ''
  setupDraft.testing = false
  setupResult.value = null
  hydrateSetupFromProfile(null)
}

async function initializeForCurrentAccount(epoch: number, handle: string) {
  await models.loadSecrets()
  if (!isCurrentView(epoch, handle)) return
  selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
  hydrateSetupFromProfile(selectedProfile.value)
}

function hydrateSetupFromProfile(profile: ModelProfile | null) {
  const cfg = profile ? providerConfigs[profile.source] : providerConfigs.custom
  setupDraft.source = profile?.source || 'custom'
  setupDraft.name = profile?.name || cfg?.label || 'OpenAI 兼容'
  setupDraft.endpoint = profile?.endpoint || cfg?.defaultEndpoint || ''
  setupDraft.model = profile?.model || cfg?.defaultModel || ''
  setupDraft.maxTokens = profile?.maxTokens || 4096
  setupDraft.inputPrice = profile?.inputPrice || 0
  setupDraft.outputPrice = profile?.outputPrice || 0
  setupDraft.enabled = profile?.enabled !== false
  setupDraft.apiKey = ''
  setupResult.value = profile ? testResults[profile.id] || null : null
}

function chooseSetupSource(source: string) {
  if (!canManageSelectedCredentials.value) return
  const cfg = providerConfigs[source] || providerConfigs.custom
  setupDraft.source = source
  setupDraft.name = cfg.label
  setupDraft.model = cfg.defaultModel || setupDraft.model
  setupDraft.endpoint = cfg.defaultEndpoint || ''
  setupResult.value = null
}

async function saveSetupProfile() {
  const epoch = viewEpoch
  const handle = session.user?.handle || ''
  if (!isCurrentView(epoch, handle)) return
  const cfg = providerConfigs[setupDraft.source] || providerConfigs.custom
  const model = setupDraft.model.trim()
  const endpoint = setupDraft.endpoint.trim()
  if (!model) {
    ui.addToast('请填写模型名', 'warning')
    return
  }
  if (canManageSelectedCredentials.value && setupRequiresEndpoint.value && !endpoint) {
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
    endpoint: setupShowsEndpoint.value ? endpoint : '',
    maxTokens: setupDraft.maxTokens || 4096,
    temperature: profile.temperature ?? 0.7,
    topP: profile.topP ?? 1,
    presencePenalty: profile.presencePenalty ?? 0,
    frequencyPenalty: profile.frequencyPenalty ?? 0,
    inputPrice: Number(setupDraft.inputPrice) || 0,
    outputPrice: Number(setupDraft.outputPrice) || 0,
    enabled: setupDraft.enabled,
  })

  try {
    if (setupDraft.apiKey.trim()) {
      await models.saveApiKey(profile.id, setupDraft.apiKey)
      if (!isCurrentView(epoch, handle)) return
      setupDraft.apiKey = ''
    } else {
      await models.saveProfile(profile.id)
      if (!isCurrentView(epoch, handle)) return
    }
    const updated = models.getProfile(profile.id)
    if (!updated) throw new Error('Profile 保存后未找到')
    selectedProfileId.value = updated.id
    if (!isCurrentView(epoch, handle)) return
    const result = await testConnection(updated)
    if (!isCurrentView(epoch, handle)) return
    testResults[updated.id] = result
    setupResult.value = result
    if (result.ok) {
      models.setActive(updated.id)
      ui.addToast(`连接正常，已设为默认 Profile${result.models ? ` · ${result.models} 个模型` : ''}`, 'success')
    } else {
      ui.addToast(`已保存，但连接测试失败：${result.message}`, 'error')
    }
  } catch (e: unknown) {
    if (!isCurrentView(epoch, handle)) return
    const result = { ok: false, message: getApiErrorMessage(e, '连接失败') }
    testResults[profile.id] = result
    setupResult.value = result
    ui.addToast(`连接测试失败：${result.message}`, 'error')
  } finally {
    if (isCurrentView(epoch, handle)) setupDraft.testing = false
  }
}

async function saveKey(profileId: string) {
  const epoch = viewEpoch
  const handle = session.user?.handle || ''
  if (!isCurrentView(epoch, handle)) return
  const value = apiKeyDrafts.value[profileId]
  if (!value?.trim()) {
    ui.addToast('请输入 API Key', 'warning')
    return
  }
  try {
    await models.saveApiKey(profileId, value)
    if (!isCurrentView(epoch, handle)) return
    apiKeyDrafts.value = { ...apiKeyDrafts.value, [profileId]: '' }
    ui.addToast('API Key 已写入 ST secrets', 'success')
  } catch (e: unknown) {
    if (!isCurrentView(epoch, handle)) return
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  }
}

async function runTest(profile: ModelProfile) {
  const epoch = viewEpoch
  const handle = session.user?.handle || ''
  if (!isCurrentView(epoch, handle)) return
  testing[profile.id] = true
  delete testResults[profile.id]
  try {
    const saved = await models.saveProfile(profile.id)
    if (!isCurrentView(epoch, handle)) return
    const r = await testConnection(saved)
    if (!isCurrentView(epoch, handle)) return
    testResults[profile.id] = r
    ui.addToast(r.ok ? `连接正常${r.models ? ` · ${r.models} 个模型` : ''}` : `连接失败：${r.message}`, r.ok ? 'success' : 'error')
  } catch (e: unknown) {
    if (!isCurrentView(epoch, handle)) return
    testResults[profile.id] = { ok: false, message: getApiErrorMessage(e, '未知错误') }
  } finally {
    if (isCurrentView(epoch, handle)) testing[profile.id] = false
  }
}

function addProfile(source = 'custom') {
  const profile = models.createProfile(source)
  selectedProfileId.value = profile.id
}

async function deleteProfile(profile: ModelProfile) {
  if (!window.confirm(`删除共享模型「${profile.name || '未命名'}」？所有用户将立即不可用。`)) return
  const epoch = viewEpoch
  const handle = session.user?.handle || ''
  if (!isCurrentView(epoch, handle)) return
  try {
    await models.deleteProfile(profile.id)
    if (!isCurrentView(epoch, handle)) return
    selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
    ui.addToast('共享模型已删除', 'success')
  } catch (e: unknown) {
    if (!isCurrentView(epoch, handle)) return
    ui.addToast(`删除失败：${getApiErrorMessage(e)}`, 'error')
  }
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

watch(
  [() => session.user?.handle || '', () => session.sessionEpoch, () => session.isAdmin],
  ([handle, _sessionEpoch, isAdmin]) => {
    viewEpoch += 1
    clearLocalState()
    if (handle && isAdmin) void initializeForCurrentAccount(viewEpoch, handle)
  },
  { immediate: true },
)

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
</script>

<template>
  <!-- 主从布局：左侧模型列表，右侧编辑区 -->
  <div class="grid gap-4 lg:grid-cols-[300px_1fr]">
    <!-- 左栏：共享模型列表 -->
    <AppCard padding="md">
      <div class="flex flex-wrap gap-2 mb-3">
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
              : 'text-ink-secondary hover:bg-ink-primary/5 hover:text-ink-primary',
          ]"
          @click="selectedProfileId = profile.id"
        >
          <span
            v-if="selectedProfileId === profile.id"
            class="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-gradient"
          />
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-medium truncate">{{ profile.name }}</span>
            <span v-if="models.activeProfileId === profile.id" class="text-[11px] text-emerald-600 shrink-0">默认</span>
          </div>
          <div class="mt-1 text-[11px] text-ink-muted truncate">
            {{ providerConfigs[profile.source]?.label || profile.source }} · {{ profile.model || '未填模型' }}
          </div>
        </button>
        <AppEmpty v-if="!models.profiles.length" icon="box" title="暂无模型配置" description="点击上方新建或写入示例。" />
      </div>
    </AppCard>

    <!-- 右栏：新建向导 + 选中项详情 -->
    <div class="space-y-4">
      <AppCard padding="md" tone="glow" class="space-y-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-brand-300 font-semibold">共享模型管理</p>
          <h2 class="mt-2 text-xl font-semibold text-ink-primary">配置一次，所有用户都可以选择。</h2>
          <p class="mt-1 text-sm text-ink-secondary max-w-2xl leading-relaxed">
            端点和密钥只对凭据所属管理员可见；普通用户只会看到已启用模型与公开价格。
          </p>
        </div>
        <div class="rounded-lg bg-surface-sunken px-3 py-2 ring-1 ring-border-subtle">
          <p class="text-[11px] text-ink-muted">当前默认</p>
          <p class="mt-0.5 max-w-[260px] truncate text-sm font-semibold text-ink-primary">
            {{ currentDefaultProfile?.name || '未设置' }}
          </p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <button
          v-for="source in setupSources"
          :key="source.value"
          type="button"
          :disabled="!canManageSelectedCredentials"
          class="min-h-[104px] rounded-xl p-4 text-left ring-1 transition-all"
          :class="[
            setupDraft.source === source.value
              ? 'bg-brand-500/15 text-brand-100 ring-brand-400/60'
              : 'bg-surface-elevated text-ink-secondary ring-border-subtle hover:text-ink-primary hover:ring-brand-500/40',
            !canManageSelectedCredentials ? 'cursor-not-allowed opacity-50' : '',
          ]"
          @click="chooseSetupSource(source.value)"
        >
          <p class="text-sm font-semibold">{{ source.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-ink-muted">{{ source.description }}</p>
        </button>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <AppFormField label="Profile 名称">
          <AppInput v-model="setupDraft.name" placeholder="例如：DS 中转" />
        </AppFormField>
        <AppFormField label="模型名">
          <AppInput v-model="setupDraft.model" placeholder="例如：deepseek-v4-pro / gpt-5.5" />
        </AppFormField>
        <AppFormField
          v-if="setupShowsEndpoint"
          :label="setupDraft.source === 'claude' ? 'Anthropic 基础地址' : '接口端点'"
          :hint="setupEndpointHint"
        >
          <AppInput
            v-model="setupDraft.endpoint"
            :disabled="!canManageSelectedCredentials"
            :placeholder="setupDraft.source === 'claude' ? 'https://api.anthropic.com/v1' : 'https://你的中转地址/v1'"
          />
        </AppFormField>
        <AppFormField label="API Key" :hint="canManageSelectedCredentials ? '' : '凭据由其他管理员维护'">
          <AppInput v-model="setupDraft.apiKey" type="password" :disabled="!canManageSelectedCredentials" placeholder="保存到 ST secrets，留空则沿用已保存 Key" />
        </AppFormField>
        <AppFormField label="Max Tokens" hint="上下文长度不是这里；这里是单次最多输出长度。">
          <AppInput
            type="number"
            min="256"
            :model-value="setupDraft.maxTokens"
            @update:model-value="(value) => setupDraft.maxTokens = parseInt(String(value)) || 4096"
          />
        </AppFormField>
        <AppFormField label="输入单价" hint="积分/token，支持 6 位小数">
          <AppInput v-model="setupDraft.inputPrice" type="number" min="0" step="0.000001" />
        </AppFormField>
        <AppFormField label="输出单价" hint="积分/token，支持 6 位小数">
          <AppInput v-model="setupDraft.outputPrice" type="number" min="0" step="0.000001" />
        </AppFormField>
        <label class="flex min-h-10 items-center gap-2 text-sm text-ink-secondary">
          <input v-model="setupDraft.enabled" type="checkbox" class="h-4 w-4 accent-brand-500" />
          对用户启用
        </label>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3">
        <div
          v-if="setupResult"
          :class="[
            'rounded-lg px-3 py-2 text-xs ring-1',
            setupResult.ok
              ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25'
              : 'bg-red-500/10 text-red-600 ring-red-500/25',
          ]"
        >
          {{ setupResult.ok ? '连接正常，已设为默认 Profile' : `连接失败：${setupResult.message}` }}
          <template v-if="setupResult.ok && setupResult.models"> · {{ setupResult.models }} 个模型</template>
        </div>
        <div v-else class="text-xs text-ink-muted">
          保存后立即进入共享模型列表；连接测试仅使用管理员密钥。
        </div>
        <AppButton variant="gradient" :disabled="setupDraft.testing" @click="saveSetupProfile">
          {{ setupDraft.testing ? '测试中…' : '保存并测试' }}
        </AppButton>
      </div>
    </AppCard>

      <AppCard v-if="selectedProfile" collapsible title="高级 Profile 管理" :default-open="false">
        <template #summary>完整参数、计价、状态和删除</template>
      <div
        v-if="testResults[selectedProfile.id]"
        :class="[
          'mb-4 px-3 py-2 text-xs rounded-lg flex items-center gap-2 ring-1',
          testResults[selectedProfile.id].ok
            ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20'
            : 'bg-red-500/10 text-red-600 ring-red-500/20',
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

      <div class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-ink-primary">模型配置详情</h2>
            <p class="text-xs text-ink-muted mt-1">左侧浏览已有 Profile,右侧编辑当前选中项。</p>
          </div>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 text-xs text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                :checked="selectedProfile.enabled !== false"
                class="accent-brand-500"
                @change="models.updateProfile(selectedProfile.id, { enabled: ($event.target as HTMLInputElement).checked })"
              />
              启用
            </label>
            <span
              :class="[
                'text-[11px] inline-flex items-center gap-1.5',
                models.hasSavedApiKey(selectedProfile) || selectedProfile.source === 'custom' ? 'text-emerald-600' : 'text-amber-600',
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
              class="text-xs text-red-500 hover:text-red-600 transition-colors"
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

        <div class="grid gap-4 md:grid-cols-3">
          <AppFormField label="服务商">
            <AppSelect
              :model-value="selectedProfile.source"
              :disabled="selectedProfile.canManageCredentials === false"
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
                :model-value="apiKeyDrafts[selectedProfile.id] || ''"
                type="password"
                :disabled="selectedProfile.canManageCredentials === false"
                placeholder="留空不修改"
                @update:model-value="(value) => apiKeyDrafts[selectedProfile!.id] = String(value)"
              />
              <AppButton size="sm" :disabled="selectedProfile.canManageCredentials === false" @click="saveKey(selectedProfile.id)">保存</AppButton>
            </div>
          </AppFormField>
        </div>

        <AppFormField
          v-if="selectedProfile.source === 'custom' || providerConfigs[selectedProfile.source]?.endpointKey === 'reverse_proxy'"
          :label="selectedProfile.source === 'claude' ? 'Anthropic 基础地址' : '自定义/反代端点'"
          :hint="selectedProfile.source === 'claude'
            ? '官方直连留空；兼容中转填写到 /v1，不要包含 /messages。'
            : '例如：http://127.0.0.1:11434/v1'"
        >
          <AppInput
            :model-value="selectedProfile.endpoint || ''"
            :disabled="selectedProfile.canManageCredentials === false"
            :placeholder="selectedProfile.source === 'claude' ? 'https://api.anthropic.com/v1' : 'http://127.0.0.1:11434/v1'"
            @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { endpoint: value })"
          />
        </AppFormField>

        <div class="grid gap-4 md:grid-cols-5 pt-1">
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

        <div class="grid gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
          <AppFormField label="输入单价" hint="积分/token">
            <AppInput
              type="number"
              min="0"
              step="0.000001"
              :model-value="selectedProfile.inputPrice || 0"
              @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { inputPrice: Number(value) || 0 })"
            />
          </AppFormField>
          <AppFormField label="输出单价" hint="积分/token">
            <AppInput
              type="number"
              min="0"
              step="0.000001"
              :model-value="selectedProfile.outputPrice || 0"
              @update:model-value="(value) => models.updateProfile(selectedProfile!.id, { outputPrice: Number(value) || 0 })"
            />
          </AppFormField>
        </div>
      </div>
      </AppCard>
    </div>
  </div>
</template>
