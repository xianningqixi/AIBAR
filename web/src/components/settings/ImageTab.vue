<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import { useImageGenStore } from '@/stores/imageGen'
import { writeSecret } from '@/api/secrets'
import { IMAGE_PROVIDERS } from '@/api/imageGen'
import type { ImageAsset, ImageGenProvider, ImageGenSettings } from '@/api/types'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import { generateReply } from '@/api/generate'
import { getApiErrorMessage } from '@/api/client'
import { buildImageGenDraftPayload, parseImageGenDraft } from '@/lib/imageGenDraft'
import { imageHistory, loadImageHistory } from './shared'

const models = useModelProfilesStore()
const ui = useUiStore()
const imageGen = useImageGenStore()

const imageKeyDrafts = reactive<Record<string, string>>({})
const savingImageKey = ref('')
const imageTestPrompt = ref('A cinematic story cover, a mysterious tavern at night, warm light, detailed atmosphere, no text')
const imageTestAsset = ref<ImageAsset | null>(null)
const imageTesting = ref(false)
const imageOptimizing = ref(false)
const imageTestDraftReason = ref('')
const imageTestDraftSettings = ref<Partial<ImageGenSettings> | null>(null)
const selectedImageProviderMeta = computed(() => (
  IMAGE_PROVIDERS.find((provider) => provider.id === imageGen.settings.provider) || IMAGE_PROVIDERS[0]
))
const imageTestDraftParameterText = computed(() => {
  const settings = imageTestDraftSettings.value
  if (!settings) return ''
  const size = imageGen.settings.provider === 'openai'
    ? settings.openaiSize || imageGen.settings.openaiSize
    : `${settings.width || imageGen.settings.width}x${settings.height || imageGen.settings.height}`
  const pieces = [
    size,
    settings.steps ? `${settings.steps} steps` : '',
    settings.scale ? `CFG ${settings.scale}` : '',
    settings.sampler || '',
  ].filter(Boolean)
  return pieces.join(' · ')
})

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
  } catch (e: unknown) {
    ui.addToast(`保存失败：${getApiErrorMessage(e)}`, 'error')
  } finally {
    savingImageKey.value = ''
  }
}

async function optimizeImageTestPrompt() {
  if (!imageTestPrompt.value.trim()) {
    ui.addToast('先写一句你想要的测试画面', 'warning')
    return
  }
  if (!models.loaded) await models.loadSecrets()
  const profile = models.activeProfile
  if (!profile) {
    ui.addToast('未配置可用大模型，先到模型连接里添加一个渠道', 'warning')
    return
  }

  imageOptimizing.value = true
  imageTestDraftReason.value = ''
  try {
    const reply = await generateReply(buildImageGenDraftPayload(
      profile,
      imageTestPrompt.value,
      imageGen.settings,
      'settings',
    ))
    const draft = parseImageGenDraft(reply, imageGen.settings)
    if (!draft.prompt) throw new Error('模型没有返回有效 Prompt')

    imageTestPrompt.value = draft.prompt
    imageTestDraftReason.value = draft.reason
    imageTestDraftSettings.value = {
      negativePrompt: draft.negativePrompt,
      width: draft.width,
      height: draft.height,
      steps: draft.steps,
      scale: draft.scale,
      sampler: draft.sampler,
      openaiSize: draft.openaiSize,
      promptPrefix: draft.promptPrefix,
      enhance: draft.enhance,
    }
    ui.addToast('已优化测试图提示词', 'success')
  } catch (e: unknown) {
    ui.addToast(`优化失败：${getApiErrorMessage(e, '请检查模型配置')}`, 'error')
  } finally {
    imageOptimizing.value = false
  }
}

async function runImageTest() {
  imageTesting.value = true
  imageTestAsset.value = null
  try {
    const asset = await imageGen.generateAndSave({
      prompt: imageTestPrompt.value,
      contextType: 'settings',
      contextId: 'image-test',
    }, imageTestDraftSettings.value || undefined)
    imageTestAsset.value = asset
    await loadImageHistory()
    ui.addToast('测试图片已生成', 'success')
  } catch (e: unknown) {
    ui.addToast(`测试失败：${getApiErrorMessage(e, '请检查图像配置')}`, 'error')
  } finally {
    imageTesting.value = false
  }
}

onMounted(async () => {
  await imageGen.load()
  await loadImageHistory()
})
</script>

<template>
  <div class="space-y-4">
    <AppCard padding="md" tone="glow" class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-brand-300 font-semibold">文生图配置</p>
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
          <div class="md:col-span-2 flex items-center justify-end gap-3">
            <AppButton
              size="sm"
              variant="secondary"
              :disabled="imageGen.testing"
              @click="() => imageGen.testCurrentProvider().then(() => ui.addToast('SD WebUI 连接正常', 'success')).catch((e: unknown) => ui.addToast(`连接失败：${getApiErrorMessage(e)}`, 'error'))"
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
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-[11px] leading-relaxed text-ink-muted">先优化，再生成；敏感桥段会被修饰成更含蓄的镜头语言。</p>
          <AppButton size="sm" variant="secondary" :disabled="imageOptimizing || imageTesting || imageGen.generating" @click="optimizeImageTestPrompt">
            {{ imageOptimizing ? '优化中…' : '优化提示词' }}
          </AppButton>
        </div>
        <p v-if="imageTestDraftParameterText" class="text-[11px] text-brand-start">
          建议参数 · {{ imageTestDraftParameterText }}
        </p>
        <p v-if="imageTestDraftReason" class="rounded-lg bg-surface-sunken px-3 py-2 text-[11px] leading-relaxed text-ink-muted ring-1 ring-border-subtle">
          优化说明：{{ imageTestDraftReason }}
        </p>
        <AppButton class="w-full" variant="gradient" :disabled="imageOptimizing || imageTesting || imageGen.generating" @click="runImageTest">
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
          <img :src="asset.url" class="aspect-square w-full object-cover" alt="" loading="lazy" />
          <div class="p-2">
            <p class="truncate text-[11px] text-ink-secondary">{{ asset.contextType || 'image' }} · {{ asset.provider || 'unknown' }}</p>
          </div>
        </a>
      </div>
      <AppEmpty v-else icon="box" title="还没有本地图片" description="生成故事封面、角色图或聊天配图后会出现在这里。" />
    </AppCard>
  </div>
</template>
