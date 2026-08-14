<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ImageAsset, ImageGenSettings, ModelProfile } from '@/api/types'
import { generateReply } from '@/api/generate'
import { useImageGenStore } from '@/stores/imageGen'
import { useModelProfilesStore } from '@/stores/modelProfiles'
import { useUiStore } from '@/stores/ui'
import { buildImageGenDraftPayload, parseImageGenDraft } from '@/lib/imageGenDraft'
import AppButton from '@/components/ui/AppButton.vue'
import AppFormField from '@/components/ui/AppFormField.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'

const props = defineProps<{
  title: string
  description?: string
  prompt: string
  contextType: string
  contextId: string
  actionLabel?: string
  draftProfile?: ModelProfile | null
}>()

const emit = defineEmits<{
  generated: [asset: ImageAsset]
}>()

const imageGen = useImageGenStore()
const models = useModelProfilesStore()
const ui = useUiStore()
const router = useRouter()
const promptDraft = ref(props.prompt)
const lastPropPrompt = ref(props.prompt)
const generatedAsset = ref<ImageAsset | null>(null)
const optimizing = ref(false)
const draftReason = ref('')
const draftSettings = ref<Partial<ImageGenSettings> | null>(null)

const providerText = computed(() => {
  const model = imageGen.settings.model || imageGen.providerMeta.defaultModel || '当前模型'
  return `${imageGen.providerMeta.label} · ${model}`
})

// 根据设置给出建议预览比例
const previewAspect = computed(() => {
  const w = draftSettings.value?.width || imageGen.settings.width
  const h = draftSettings.value?.height || imageGen.settings.height
  if (!w || !h) return '3/4'
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.15) return '1/1'
  if (ratio > 1.3) return '16/9'
  return '3/4'
})

const draftParameterText = computed(() => {
  const settings = draftSettings.value
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

watch(
  () => props.prompt,
  (value) => {
    if (!promptDraft.value.trim() || promptDraft.value === lastPropPrompt.value) {
      promptDraft.value = value
      draftReason.value = ''
      draftSettings.value = null
    }
    lastPropPrompt.value = value
  },
)

watch(
  () => props.contextId,
  () => {
    if (props.contextType !== 'chat') return
    promptDraft.value = props.prompt
    lastPropPrompt.value = props.prompt
    generatedAsset.value = null
    draftReason.value = ''
    draftSettings.value = null
  },
)

async function generate() {
  if (!promptDraft.value.trim()) {
    ui.addToast('Prompt 不能为空', 'warning')
    return
  }
  if (props.contextType === 'chat' && imageGen.settings.provider === 'openai' && !draftSettings.value) {
    ui.addToast('聊天配图请先优化提示词，避免把整段聊天上下文直接发给图片模型', 'warning')
    return
  }
  try {
    const asset = await imageGen.generateAndSave({
      prompt: promptDraft.value,
      contextType: props.contextType,
      contextId: props.contextId,
    }, draftSettings.value || undefined)
    generatedAsset.value = asset
    emit('generated', asset)
    ui.addToast('图片已生成并保存到本地', 'success')
  } catch (e: any) {
    ui.addToast(`图片生成失败：${e.message || '请检查图像配置'}`, 'error')
  }
}

async function optimizePrompt() {
  if (!promptDraft.value.trim()) {
    ui.addToast('先写一句你想要的画面', 'warning')
    return
  }
  if (!models.loaded) await models.loadSecrets()
  const profile = props.draftProfile || models.activeProfile
  if (!profile) {
    ui.addToast('未配置可用大模型，先到模型连接里添加一个渠道', 'warning')
    return
  }
  optimizing.value = true
  draftReason.value = ''
  try {
    const reply = await generateReply(buildImageGenDraftPayload(
      profile,
      promptDraft.value,
      imageGen.settings,
      props.contextType,
    ))
    const draft = parseImageGenDraft(reply, imageGen.settings)
    if (!draft.prompt) throw new Error('模型没有返回有效 Prompt')

    promptDraft.value = draft.prompt
    draftReason.value = draft.reason
    draftSettings.value = {
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
    ui.addToast('已优化提示词，可继续微调后生成', 'success')
  } catch (e: any) {
    ui.addToast(`优化失败：${e.message || '请检查模型配置'}`, 'error')
  } finally {
    optimizing.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-border-subtle bg-surface-elevated p-4 shadow-sm">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-ink-primary">{{ title }}</h3>
        <p v-if="description" class="mt-1 text-xs leading-relaxed text-ink-muted">{{ description }}</p>
        <p class="mt-1 text-[11px] text-ink-muted">{{ providerText }}</p>
        <p v-if="draftParameterText" class="mt-1 text-[11px] text-brand-300">
          建议参数 · {{ draftParameterText }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <AppButton size="sm" variant="ghost" @click="router.push({ path: '/settings', query: { tab: 'image' } })">
          图像配置
        </AppButton>
      </div>
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
      <AppFormField label="生成 Prompt">
        <AppTextarea
          v-model="promptDraft"
          :rows="5"
          auto-grow
          placeholder="先用自然语言描述画面，再点“优化提示词”生成更适合文生图的 Prompt"
        />
        <p class="mt-2 text-[11px] leading-relaxed text-ink-muted">
          优化后会替换成英文成图 Prompt，并把敏感桥段修饰成更含蓄的镜头语言。
        </p>
        <p v-if="draftReason" class="mt-2 rounded-md bg-surface-sunken px-3 py-2 text-[11px] leading-relaxed text-ink-muted ring-1 ring-border-subtle">
          优化说明：{{ draftReason }}
        </p>
      </AppFormField>

      <div class="space-y-3">
        <div
          class="overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border-subtle"
          :style="{ aspectRatio: previewAspect }"
        >
          <img
            v-if="generatedAsset"
            :src="generatedAsset.url"
            class="h-full w-full object-cover"
            alt=""
          />
          <div v-else class="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-xs text-ink-muted">
            <svg class="h-8 w-8 text-ink-muted/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            生成结果会显示在这里
          </div>
        </div>
        <div class="flex gap-2">
          <AppButton
            class="flex-1"
            size="sm"
            variant="secondary"
            :loading="optimizing"
            :disabled="optimizing"
            @click="optimizePrompt"
          >
            {{ optimizing ? '优化中…' : '优化提示词' }}
          </AppButton>
          <AppButton
            class="flex-1"
            size="sm"
            variant="gradient"
            :loading="imageGen.generating"
            :disabled="imageGen.generating"
            @click="generate"
          >
            {{ imageGen.generating ? '生成中…' : actionLabel || '生成图片' }}
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
