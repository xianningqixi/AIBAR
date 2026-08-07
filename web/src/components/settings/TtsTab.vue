<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useTtsStore } from '@/stores/tts'
import { writeSecret } from '@/api/secrets'
import { TTS_PROVIDERS, PROVIDER_MODELS, PROVIDER_VOICES, synthesizeSpeech, type ProviderSecret } from '@/api/tts'
import type { TtsProvider, TtsVoiceProfile } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import { getApiErrorMessage } from '@/api/client'

const ui = useUiStore()
const tts = useTtsStore()

const ttsKeyDrafts = reactive<Record<string, string>>({})
const savingTtsKey = ref('')

interface TtsTestResult { ok: boolean; message: string }
const ttsTestResults = reactive<Record<string, TtsTestResult | undefined>>({})
const ttsTesting = reactive<Record<string, boolean>>({})
const TTS_SAMPLE_TEXT = '你好，我是 AIBAR 的语音测试。'
let testAudio: HTMLAudioElement | null = null

const ttsProviderOrder = new Map(TTS_PROVIDERS.map((provider, index) => [provider.id, index]))
const enabledTtsProviders = computed(() => TTS_PROVIDERS
  .filter((provider) => provider.playable && tts.settings[provider.id].enabled)
  .sort((a, b) => {
    const rank = (provider: TtsProvider) => tts.settings.defaultProvider === provider ? 0 : 1
    return rank(a.id) - rank(b.id) || (ttsProviderOrder.get(a.id) ?? 0) - (ttsProviderOrder.get(b.id) ?? 0)
  }))
const selectedTtsProvider = ref<TtsProvider>('mimo')
const visibleTtsProviders = computed(() => {
  const selected = TTS_PROVIDERS.find((provider) => provider.id === selectedTtsProvider.value && provider.playable)
  const visible = [...enabledTtsProviders.value]
  if (selected && !visible.some((provider) => provider.id === selected.id)) {
    visible.push(selected)
  }
  return visible
})
const selectedTtsProviderMeta = computed(() => (
  visibleTtsProviders.value.find((provider) => provider.id === selectedTtsProvider.value)
    || enabledTtsProviders.value[0]
    || TTS_PROVIDERS.find((provider) => provider.id === 'mimo')
    || TTS_PROVIDERS.find((provider) => provider.playable)
    || TTS_PROVIDERS[0]
))
const ttsVoiceSearch = ref('')
const ttsVoiceDraft = reactive({ name: '', voice: '', note: '' })

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
  return '待启用'
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
  } catch (e: unknown) {
    ttsTestResults[voice.provider] = { ok: false, message: getApiErrorMessage(e, '测试失败') }
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
  if (!window.confirm(`删除自定义音色「${voice.name}」？`)) return
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
  } catch (e: unknown) {
    ttsTestResults[provider] = { ok: false, message: getApiErrorMessage(e, '测试失败') }
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
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    savingTtsKey.value = ''
  }
}

onMounted(async () => {
  await tts.load()
  selectedTtsProvider.value = enabledTtsProviders.value[0]?.id || 'mimo'
})
</script>

<template>
  <!-- 主从布局：左侧 TTS 渠道列表，右侧默认设置与所选渠道配置 -->
  <div class="grid gap-4 lg:grid-cols-[300px_1fr] items-start">
    <!-- 左栏：渠道列表 -->
    <AppCard padding="none" class="overflow-hidden">
      <div class="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-ink-primary">TTS 渠道</h2>
          <p class="text-[11px] text-ink-muted mt-0.5">只显示已启用渠道和当前配置中的渠道。</p>
        </div>
        <span class="text-[11px] text-ink-muted">{{ visibleTtsProviders.length }} 个</span>
      </div>
      <div class="max-h-[420px] overflow-y-auto divide-y divide-border-subtle">
        <button
          v-for="provider in visibleTtsProviders"
          :key="provider.id"
          type="button"
          :class="[
            'w-full text-left px-4 py-3 border-l-2 transition-colors',
            selectedTtsProvider === provider.id
              ? 'bg-brand-500/10 border-l-brand-400'
              : 'border-l-transparent hover:bg-ink-primary/[0.04]',
          ]"
          @click="selectTtsProvider(provider.id)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-ink-primary truncate">{{ provider.label }}</span>
                <span class="text-[11px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">ST</span>
              </div>
              <p class="text-[11px] text-ink-muted mt-1 truncate">{{ provider.description }}</p>
            </div>
            <span
              :class="[
                'text-[11px] shrink-0 mt-0.5',
                tts.settings.defaultProvider === provider.id
                  ? 'text-emerald-600'
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

    <!-- 右栏：默认设置 + 渠道配置 + 音色库 -->
    <div class="space-y-4">
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
              <option
                v-for="provider in enabledTtsProviders"
                :key="provider.id"
                :value="provider.id"
              >
                {{ provider.label }}
              </option>
            </AppSelect>
            <span v-if="!enabledTtsProviders.length" class="text-[11px] text-amber-600">
              先启用一个渠道
            </span>
          </div>
        </div>
      </AppCard>

        <AppCard padding="none">
          <div
            v-if="ttsTestResults[selectedTtsProviderMeta.id]"
            :class="[
              'px-4 py-2 text-xs rounded-t-xl flex items-center gap-2',
              ttsTestResults[selectedTtsProviderMeta.id]?.ok
                ? 'bg-emerald-500/10 text-emerald-600 border-b border-emerald-500/20'
                : 'bg-red-500/10 text-red-600 border-b border-red-500/20',
            ]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="ttsTestResults[selectedTtsProviderMeta.id]?.ok ? 'bg-emerald-400' : 'bg-red-400'" />
            <span class="flex-1 truncate">
              {{ ttsTestResults[selectedTtsProviderMeta.id]?.ok ? '播放成功' : `失败：${ttsTestResults[selectedTtsProviderMeta.id]?.message}` }}
            </span>
          </div>

          <div class="p-4 space-y-4">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <h2 class="text-base font-semibold text-ink-primary truncate">{{ selectedTtsProviderMeta.label }}</h2>
                  <span class="text-[11px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">
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
                <span v-if="tts.settings.defaultProvider === selectedTtsProviderMeta.id" class="text-[11px] text-emerald-600">默认</span>
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

            <div class="grid gap-4 sm:grid-cols-2">
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

            <div v-if="selectedTtsProviderMeta.secretKeys?.length" class="grid gap-4 sm:grid-cols-2">
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

        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div class="space-y-3">
            <SearchInput v-model="ttsVoiceSearch" placeholder="搜索音色" />
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
                    <span class="text-[11px] text-ink-muted rounded bg-surface-sunken px-1.5 py-0.5 shrink-0">{{ voice.source }}</span>
                    <span v-if="isCurrentTtsVoice(voice)" class="text-[11px] text-emerald-600 shrink-0">当前</span>
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

          <div class="rounded-xl border border-border-subtle bg-surface/30 p-4 space-y-4">
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
            <div class="flex items-center justify-end gap-3">
              <AppButton size="sm" @click="addTtsVoiceProfile">保存音色</AppButton>
            </div>
          </div>
        </div>
      </AppCard>
    </div>
  </div>
</template>
