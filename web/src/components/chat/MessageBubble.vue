<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/api/types'
import { useMarkdown } from '@/composables/useMarkdown'
import { useTtsStore } from '@/stores/tts'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  message: ChatMessage
  index: number
  showActions?: boolean
  isLastAssistant?: boolean
  characterAvatar?: string
}>()

defineEmits<{
  edit: [index: number, content: string]
  delete: [index: number]
  regenerate: []
  continue: []
  swipe: [index: number, direction: -1 | 1]
  generateImage: [index: number]
}>()

const { render } = useMarkdown()
const tts = useTtsStore()
const ui = useUiStore()
const editing = ref(false)
const editContent = ref(props.message.content)
const thinkingOpen = ref(false)

const isUser = computed(() => props.message.role === 'user')
const hasReasoning = computed(() => !isUser.value && Boolean(props.message.reasoning))
const messageKey = computed(() => `${props.characterAvatar || ''}#${props.index}`)
const ttsActive = computed(() => tts.currentMessageKey === messageKey.value)
const ttsBusy = computed(() => ttsActive.value && (tts.isLoadingAudio || tts.isPlaying))
const canReadAloud = computed(() => props.message.role !== 'system' && Boolean(props.message.content.trim()))

function startEditing() {
  editContent.value = props.message.content
  editing.value = true
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
}

async function togglePlay() {
  const avatar = isUser.value ? undefined : props.characterAvatar
  const characterVoice = avatar ? tts.settings.characterVoices[avatar] : undefined
  const provider = characterVoice?.provider || tts.settings.defaultProvider

  if (!tts.enabled) {
    tts.setEnabled(true)
  }
  if (!tts.settings[provider].enabled) {
    tts.updateProvider(provider, { enabled: true })
  }
  try {
    await tts.play(props.message.content, messageKey.value, avatar)
  } catch (e: any) {
    ui.addToast(`播放失败：${e.message || '请检查配置'}`, 'error')
  }
}
</script>

<template>
  <div
    :class="[
      'group flex gap-3 px-4 py-2.5',
      isUser ? 'justify-end' : 'justify-start',
    ]"
  >
    <div
      :class="[
        'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
        isUser
          ? 'bg-brand-soft text-ink-primary border border-brand-500/30 rounded-br-md'
          : 'bg-surface-elevated text-ink-primary border border-border-subtle rounded-bl-md',
      ]"
    >
      <div v-if="hasReasoning" class="mb-2">
        <button
          class="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-muted hover:text-ink-secondary transition-colors font-medium"
          @click="thinkingOpen = !thinkingOpen"
        >
          <svg
            class="w-3.5 h-3.5 transition-transform"
            :class="thinkingOpen ? 'rotate-90' : ''"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          {{ thinkingOpen ? '收起思考' : '思考过程' }}
        </button>
        <div
          v-if="thinkingOpen"
          class="mt-1.5 text-xs text-ink-muted leading-relaxed whitespace-pre-wrap bg-surface-sunken rounded-lg p-3 border border-border-subtle max-h-60 overflow-y-auto"
        >{{ message.reasoning }}</div>
      </div>

      <div v-if="editing" class="flex flex-col gap-2 min-w-[260px]">
        <textarea
          v-model="editContent"
          class="w-full rounded-lg bg-surface-sunken border border-border px-3 py-2 text-sm text-ink-primary focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 resize-none"
          rows="4"
          @keydown.escape="editing = false"
        />
        <div class="flex gap-2 justify-end">
          <button
            class="px-2.5 py-1 text-xs rounded-md bg-white/5 text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors"
            @click="editing = false"
          >
            取消
          </button>
          <button
            class="px-2.5 py-1 text-xs rounded-md bg-brand-gradient text-white hover:brightness-110 transition-all"
            @click="$emit('edit', index, editContent); editing = false"
          >
            保存
          </button>
        </div>
      </div>
      <div v-else class="prose prose-invert prose-sm max-w-none break-words" v-html="render(message.content)" />

      <div v-if="message.images?.length" class="mt-3 grid grid-cols-2 gap-2">
        <a
          v-for="image in message.images"
          :key="image.id"
          :href="image.url"
          target="_blank"
          rel="noreferrer"
          class="block overflow-hidden rounded-lg border border-white/10 bg-surface-sunken"
          :title="image.prompt || '生成图片'"
        >
          <img :src="image.url" class="h-36 w-full object-cover" alt="" />
        </a>
      </div>

      <div
        v-if="showActions && !editing && canReadAloud"
        class="mt-3 flex items-center gap-2"
      >
        <button
          :class="[
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors',
            ttsActive
              ? 'border-brand-500/40 bg-brand-500/15 text-brand-200'
              : 'border-white/10 bg-white/[0.03] text-ink-secondary hover:border-brand-500/30 hover:bg-brand-500/10 hover:text-brand-200',
          ]"
          :title="ttsActive && tts.isPlaying ? '停止播放' : '朗读此消息'"
          @click="togglePlay"
        >
          <svg
            v-if="ttsActive && tts.isLoadingAudio"
            class="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none"
          ><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="48" stroke-dashoffset="36" /></svg>
          <svg
            v-else-if="ttsActive && tts.isPlaying"
            class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"
          ><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          <svg
            v-else
            class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          ><path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" /></svg>
          <span>{{ ttsBusy ? '停止' : '朗读' }}</span>
        </button>
      </div>

      <div
        v-if="showActions && !editing"
        class="flex items-center gap-0.5 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
          @click="startEditing"
        >
          编辑
        </button>
        <button
          class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-red-400 hover:bg-white/5 transition-colors"
          @click="$emit('delete', index)"
        >
          删除
        </button>
        <button
          class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
          @click="$emit('generateImage', index)"
        >
          配图
        </button>
        <template v-if="!isUser">
          <button
            v-if="isLastAssistant"
            class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
            @click="$emit('regenerate')"
          >
            重生成
          </button>
          <button
            v-if="isLastAssistant"
            class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
            @click="$emit('continue')"
          >
            续写
          </button>
          <button
            class="px-2 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
            @click="copyToClipboard(message.content)"
          >
            复制
          </button>
          <template v-if="isLastAssistant && message.swipes && message.swipes.length > 1">
            <span class="text-ink-muted/40 mx-0.5">·</span>
            <button
              class="px-1.5 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
              @click="$emit('swipe', index, -1)"
            >
              ◀
            </button>
            <span class="px-1 text-[10px] text-ink-secondary tabular-nums">
              {{ (message.swipe_id ?? 0) + 1 }} / {{ message.swipes.length }}
            </span>
            <button
              class="px-1.5 py-0.5 text-[10px] rounded text-ink-muted hover:text-ink-primary hover:bg-white/5 transition-colors"
              @click="$emit('swipe', index, 1)"
            >
              ▶
            </button>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
