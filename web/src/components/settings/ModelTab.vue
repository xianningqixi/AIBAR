<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import { providerConfigs } from '@/lib/providers'
import { testConnection } from '@/api/generate'
import type { ModelProfile } from '@/api/types'

const models = useModelProfilesStore()
const ui = useUiStore()

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

onMounted(async () => {
  await models.loadSecrets()
  selectedProfileId.value = models.activeProfileId || models.profiles[0]?.id || ''
  hydrateSetupFromProfile(selectedProfile.value)
})

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
  <div class="space-y-4">
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
              ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25'
              : 'bg-red-500/10 text-red-600 ring-red-500/25',
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
            <span v-if="models.activeProfileId === profile.id" class="text-[10px] text-emerald-600 shrink-0">默认</span>
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
            ? 'bg-emerald-500/10 text-emerald-600 border-b border-emerald-500/20'
            : 'bg-red-500/10 text-red-600 border-b border-red-500/20',
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
</template>
