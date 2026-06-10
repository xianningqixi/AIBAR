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
const copied = ref(false)

const isUser = computed(() => props.message.role === 'user')
const renderedContent = computed(() => render(props.message.content))
const hasReasoning = computed(() => !isUser.value && Boolean(props.message.reasoning))
const messageKey = computed(() => `${props.characterAvatar || ''}#${props.index}`)
const ttsActive = computed(() => tts.currentMessageKey === messageKey.value)
const ttsBusy = computed(() => ttsActive.value && (tts.isLoadingAudio || tts.isPlaying))
const canReadAloud = computed(() => props.message.role !== 'system' && Boolean(props.message.content.trim()))

const avatarUrl = computed(() => {
  if (isUser.value) return ''
  const avatar = props.characterAvatar
  if (!avatar || avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
})

const hasSwipes = computed(
  () => Boolean(props.isLastAssistant && props.message.swipes && props.message.swipes.length > 1),
)

function startEditing() {
  editContent.value = props.message.content
  editing.value = true
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1400)
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
      'group flex gap-2.5 px-4 py-2 animate-fade-in-up',
      isUser ? 'flex-row-reverse' : 'flex-row',
    ]"
  >
    <!-- 头像 -->
    <div class="mt-0.5 shrink-0">
      <div
        v-if="isUser"
        class="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-500/80 to-brand-500/80 text-white ring-1 ring-border shadow-sm"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
      <img
        v-else-if="avatarUrl"
        :src="avatarUrl"
        class="h-8 w-8 rounded-full object-cover ring-1 ring-brand-500/40 shadow-sm"
        alt=""
        loading="lazy"
      />
      <div
        v-else
        class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand-300 ring-1 ring-brand-500/40"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>

    <div :class="['flex min-w-0 flex-col', isUser ? 'items-end' : 'items-start']">
      <div
        :class="[
          'max-w-[min(88%,48rem)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'bg-gradient-to-br from-brand-500/25 to-accent-500/15 text-ink-primary border border-brand-500/30 rounded-br-md'
            : 'bg-surface-elevated/90 text-ink-primary border border-border-subtle rounded-bl-md backdrop-blur-sm',
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
              class="px-2.5 py-1 text-xs rounded-md bg-ink-primary/5 text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/10 transition-colors"
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
        <div v-else class="prose prose-invert prose-sm max-w-none break-words" v-html="renderedContent" />

        <div v-if="message.images?.length" class="mt-3 grid grid-cols-2 gap-2">
          <a
            v-for="image in message.images"
            :key="image.id"
            :href="image.url"
            target="_blank"
            rel="noreferrer"
            class="block overflow-hidden rounded-lg border border-border bg-surface-sunken transition-transform hover:scale-[1.02]"
            :title="image.prompt || '生成图片'"
          >
            <img :src="image.url" class="h-36 w-full object-cover" alt="" loading="lazy" />
          </a>
        </div>
      </div>

      <!-- 操作栏 -->
      <div
        v-if="showActions && !editing"
        :class="[
          'mt-1 flex items-center gap-0.5 text-ink-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 touch-always-visible',
          isUser ? 'flex-row-reverse' : 'flex-row',
        ]"
      >
        <!-- Swipe 翻页 -->
        <template v-if="hasSwipes">
          <button class="action-btn" title="上一条" @click="$emit('swipe', index, -1)">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span class="px-0.5 text-[11px] tabular-nums text-ink-secondary">{{ (message.swipe_id ?? 0) + 1 }}/{{ message.swipes!.length }}</span>
          <button class="action-btn" title="下一条" @click="$emit('swipe', index, 1)">
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </button>
          <span class="mx-0.5 h-3 w-px bg-border-subtle" />
        </template>

        <button v-if="canReadAloud" class="action-btn" :class="ttsActive ? 'text-brand-300' : ''" :title="ttsBusy ? '停止朗读' : '朗读'" @click="togglePlay">
          <svg v-if="ttsActive && tts.isLoadingAudio" class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="48" stroke-dashoffset="36" /></svg>
          <svg v-else-if="ttsActive && tts.isPlaying" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" /></svg>
        </button>

        <button class="action-btn" :class="copied ? 'text-emerald-600' : ''" :title="copied ? '已复制' : '复制'" @click="copyToClipboard(message.content)">
          <svg v-if="copied" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
          <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>

        <button v-if="isLastAssistant && !isUser" class="action-btn" title="重新生成" @click="$emit('regenerate')">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>

        <button v-if="isLastAssistant && !isUser" class="action-btn" title="续写" @click="$emit('continue')">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
        </button>

        <button class="action-btn" title="生成配图" @click="$emit('generateImage', index)">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </button>

        <button class="action-btn" title="编辑" @click="startEditing">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>

        <button class="action-btn hover:text-red-500" title="删除" @click="$emit('delete', index)">
          <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.action-btn {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-ink-primary/[0.06] hover:text-ink-primary;
}
</style>
