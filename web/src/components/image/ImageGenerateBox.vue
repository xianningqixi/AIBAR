<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ImageAsset } from '@/api/types'
import { useImageGenStore } from '@/stores/imageGen'
import { useUiStore } from '@/stores/ui'
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
}>()

const emit = defineEmits<{
  generated: [asset: ImageAsset]
}>()

const imageGen = useImageGenStore()
const ui = useUiStore()
const router = useRouter()
const promptDraft = ref(props.prompt)
const generatedAsset = ref<ImageAsset | null>(null)

const providerText = computed(() => {
  const model = imageGen.settings.model || imageGen.providerMeta.defaultModel || '当前模型'
  return `${imageGen.providerMeta.label} · ${model}`
})

watch(
  () => props.prompt,
  (value) => {
    if (!promptDraft.value.trim() || promptDraft.value === generatedAsset.value?.prompt) {
      promptDraft.value = value
    }
  },
)

async function generate() {
  if (!promptDraft.value.trim()) {
    ui.addToast('Prompt 不能为空', 'warning')
    return
  }
  try {
    const asset = await imageGen.generateAndSave({
      prompt: promptDraft.value,
      contextType: props.contextType,
      contextId: props.contextId,
    })
    generatedAsset.value = asset
    emit('generated', asset)
    ui.addToast('图片已生成并保存到本地', 'success')
  } catch (e: any) {
    ui.addToast(`图片生成失败：${e.message || '请检查图像配置'}`, 'error')
  }
}
</script>

<template>
  <div class="rounded-xl border border-border-subtle bg-surface/45 p-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-semibold text-ink-primary">{{ title }}</h3>
        <p v-if="description" class="mt-1 text-xs leading-relaxed text-ink-muted">{{ description }}</p>
        <p class="mt-1 text-[11px] text-ink-muted">{{ providerText }}</p>
      </div>
      <AppButton size="sm" variant="secondary" @click="router.push({ path: '/settings', query: { tab: 'image' } })">
        图像配置
      </AppButton>
    </div>

    <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
      <AppFormField label="生成 Prompt">
        <AppTextarea
          v-model="promptDraft"
          :rows="5"
          auto-grow
          placeholder="描述要生成的画面"
        />
      </AppFormField>

      <div class="space-y-3">
        <div class="aspect-[3/4] overflow-hidden rounded-lg bg-surface-sunken ring-1 ring-border-subtle">
          <img
            v-if="generatedAsset"
            :src="generatedAsset.url"
            class="h-full w-full object-cover"
            alt=""
          />
          <div v-else class="flex h-full items-center justify-center px-4 text-center text-xs text-ink-muted">
            生成结果会显示在这里
          </div>
        </div>
        <AppButton
          class="w-full"
          size="sm"
          variant="gradient"
          :disabled="imageGen.generating"
          @click="generate"
        >
          {{ imageGen.generating ? '生成中…' : actionLabel || '生成图片' }}
        </AppButton>
      </div>
    </div>
  </div>
</template>
