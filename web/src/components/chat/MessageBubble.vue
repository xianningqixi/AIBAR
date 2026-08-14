<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/api/types'
import { useMarkdown } from '@/composables/useMarkdown'
import { useTtsStore } from '@/stores/tts'
import { useUiStore } from '@/stores/ui'
import { getApiErrorMessage } from '@/api/client'
import AppDialog from '@/components/ui/AppDialog.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'

const props = defineProps<{
  message: ChatMessage
  index: number
  isContinuation?: boolean
  animate?: boolean
  showActions?: boolean
  isLastAssistant?: boolean
  characterAvatar?: string
  characterName?: string
  mediaActions?: boolean
  // 生成中：所有按下标改写消息的操作都要锁住
  actionsLocked?: boolean
}>()

const emit = defineEmits<{
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
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

const isUser = computed(() => props.message.role === 'user')
const renderedContent = computed(() => render(props.message.content))
const hasReasoning = computed(() => !isUser.value && Boolean(props.message.reasoning))
const messageKey = computed(() => `${props.characterAvatar || ''}#${props.index}`)
const ttsActive = computed(() => tts.currentMessageKey === messageKey.value)
const ttsBusy = computed(() => ttsActive.value && (tts.isLoadingAudio || tts.isPlaying))
const canReadAloud = computed(() => props.mediaActions && props.message.role !== 'system' && Boolean(props.message.content.trim()))

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
  if (props.actionsLocked) return
  editContent.value = props.message.content
  editing.value = true
}

async function copyToClipboard(text: string) {
  try {
    // HTTP 部署下 navigator.clipboard 不存在；失败时不能假装“已复制”。
    if (!navigator.clipboard) throw new Error('剪贴板不可用')
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 1400)
  } catch {
    ui.addToast('复制失败，请手动选择文本复制', 'warning')
  }
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
  } catch (e: unknown) {
    ui.addToast(`播放失败：${getApiErrorMessage(e, '请检查配置')}`, 'error')
  }
}

function saveEdit(asNew = false) {
  if (asNew) {
    // 作为新消息：在当前消息后追加一条用户消息
    emit('edit', props.index, props.message.content)
    // 通过事件总线/父组件追加新消息的逻辑在 ChatPage 里处理；这里只发出辅助事件
    // 实际简化为：如果支持 asNew，需要父组件配合。本阶段暂不支持，只做 UI 提示。
    ui.addToast('“作为新消息发送”需要父组件配合，当前版本仅支持覆盖原消息', 'info')
    return
  }
  emit('edit', props.index, editContent.value)
  editing.value = false
}

function openLightbox(idx: number) {
  lightboxIndex.value = idx
  lightboxOpen.value = true
}
</script>

<template>
  <div
    :class="[
      'group message-bubble flex gap-2.5',
      isContinuation ? 'py-1' : 'py-3 md:py-4',
      animate ? 'animate-fade-in-up' : '',
      isUser ? 'flex-row-reverse' : 'flex-row',
    ]"
  >
    <!-- 头像 -->
    <div class="mt-0.5 shrink-0">
      <div
        v-if="isUser"
        class="user-avatar flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-accent-500/80 to-brand-500/80 text-sm font-medium text-white shadow-sm ring-1 ring-border md:h-10 md:w-10"
        :title="message.name || '我'"
      >
        {{ (message.name || '我').slice(0, 1) }}
      </div>
      <img
        v-else-if="avatarUrl"
        :src="avatarUrl"
        class="h-8 w-8 rounded-full object-cover ring-1 ring-brand-500/40 shadow-sm md:h-10 md:w-10"
        alt=""
        loading="lazy"
      />
      <div
        v-else
        class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand-300 ring-1 ring-brand-500/40 md:h-10 md:w-10"
      >
        <svg class="h-4 w-4 md:h-5 md:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </div>
    </div>

    <div :class="['flex min-w-0 flex-col', isUser ? 'items-end' : 'items-start']">
      <div
        :class="[
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'max-w-[min(88%,48rem)] rounded-br-md border border-brand-500/40 bg-brand-500/20 text-ink-primary'
            : 'max-w-[min(82%,44rem)] rounded-bl-md border border-border-subtle bg-surface-elevated/90 text-ink-primary backdrop-blur-sm',
        ]"
      >
        <div v-if="hasReasoning" class="mb-2">
          <button
            class="flex items-center gap-1.5 text-[11px] font-medium text-ink-muted transition-colors hover:text-ink-secondary"
            aria-label="展开/收起思考过程"
            @click="thinkingOpen = !thinkingOpen"
          >
            <svg
              class="h-3.5 w-3.5 transition-transform"
              :class="thinkingOpen ? 'rotate-90' : ''"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            {{ thinkingOpen ? '收起思考' : '思考过程' }}
          </button>
          <div
            v-if="thinkingOpen"
            class="mt-1.5 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-ink-primary/[0.05] p-3 text-xs leading-relaxed text-ink-secondary"
          >{{ message.reasoning }}</div>
        </div>

        <div v-if="editing" class="flex min-w-[260px] flex-col gap-2">
          <AppTextarea
            v-model="editContent"
            :rows="4"
            auto-grow
            :max-height="320"
          />
          <div class="flex items-center justify-end gap-2">
            <button
              class="rounded-md px-2.5 py-1 text-xs text-ink-secondary transition-colors hover:bg-ink-primary/5 hover:text-ink-primary"
              @click="editing = false"
            >
              取消
            </button>
            <button
              class="rounded-md bg-brand-gradient px-2.5 py-1 text-xs text-white transition-all hover:brightness-110"
              @click="saveEdit(true)"
            >
              作为新消息
            </button>
            <button
              class="rounded-md bg-brand-500 px-2.5 py-1 text-xs text-white shadow-sm transition-all hover:bg-brand-600 active:scale-95"
              @click="saveEdit(false)"
            >
              保存
            </button>
          </div>
        </div>
        <div v-else class="prose max-w-none break-words" v-html="renderedContent" />

        <div v-if="message.images?.length" class="mt-3">
          <div :class="message.images.length === 1 ? 'max-w-md' : 'grid grid-cols-2 gap-2'">
            <button
              v-for="(image, idx) in message.images"
              :key="image.id"
              type="button"
              class="block overflow-hidden rounded-lg border border-border bg-surface-sunken transition-transform hover:scale-[1.02]"
              :class="message.images.length === 1 ? 'max-w-sm' : ''"
              :title="image.prompt || '生成图片'"
              :aria-label="image.prompt || '查看图片'"
              @click="openLightbox(idx)"
            >
              <img
                :src="image.url"
                class="w-full object-cover"
                :class="message.images.length === 1 ? 'h-56 md:h-72' : 'h-36'"
                alt=""
                loading="lazy"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 操作栏：桌面 hover；最后一条常驻；触屏收到"更多"菜单 -->
      <div
        v-if="showActions && !editing"
        :class="[
          'mt-1 flex items-center gap-0.5 text-ink-muted md:opacity-0 md:transition-opacity md:duration-150 md:group-hover:opacity-100 md:focus-within:opacity-100',
          isUser ? 'flex-row-reverse' : 'flex-row',
          isLastAssistant ? 'md:opacity-100' : '',
        ]"
      >
        <!-- Swipe 翻页胶囊 -->
        <div v-if="hasSwipes" class="mr-1 inline-flex items-center gap-0.5 rounded-full bg-surface px-2 py-1 ring-1 ring-border-subtle">
          <button
            class="action-btn"
            title="上一条"
            aria-label="上一条"
            :disabled="actionsLocked"
            @click="$emit('swipe', index, -1)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span class="px-0.5 text-xs tabular-nums text-ink-secondary">{{ (message.swipe_id ?? 0) + 1 }} / {{ message.swipes!.length }}</span>
          <button
            class="action-btn"
            title="下一条"
            aria-label="下一条"
            :disabled="actionsLocked"
            @click="$emit('swipe', index, 1)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </button>
          <span class="mx-0.5 h-3 w-px bg-border-subtle" />
        </div>

        <!-- 桌面：直接展示图标按钮 -->
        <button
          v-if="canReadAloud"
            class="action-btn"
            :class="ttsActive ? 'text-brand-300' : ''"
            :title="ttsBusy ? '停止朗读' : '朗读'"
            :aria-label="ttsBusy ? '停止朗读' : '朗读'"
            @click="togglePlay"
          >
            <svg v-if="ttsActive && tts.isLoadingAudio" class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="48" stroke-dashoffset="36" /></svg>
            <svg v-else-if="ttsActive && tts.isPlaying" class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            <svg v-else class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
            </svg>
          </button>

          <button
            class="action-btn"
            :class="copied ? 'text-success scale-110' : ''"
            :title="copied ? '已复制' : '复制'"
            :aria-label="copied ? '已复制' : '复制'"
            @click="copyToClipboard(message.content)"
          >
            <svg v-if="copied" class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
            <svg v-else class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>

          <button
            v-if="isLastAssistant && !isUser"
            class="action-btn"
            title="重新生成"
            aria-label="重新生成"
            :disabled="actionsLocked"
            @click="$emit('regenerate')"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>

          <button
            v-if="isLastAssistant && !isUser"
            class="action-btn"
            title="续写"
            aria-label="续写"
            :disabled="actionsLocked"
            @click="$emit('continue')"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
          </button>

          <button
            v-if="mediaActions"
            class="action-btn"
            title="生成配图"
            aria-label="生成配图"
            :disabled="actionsLocked"
            @click="$emit('generateImage', index)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </button>

          <button
            class="action-btn"
            title="编辑"
            aria-label="编辑"
            :disabled="actionsLocked"
            @click="startEditing"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>

          <button
            class="action-btn hover:text-danger hover:bg-danger/10"
            title="删除"
            aria-label="删除"
            :disabled="actionsLocked"
            @click="$emit('delete', index)"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
      </div>
    </div>
  </div>

  <!-- 图片灯箱 -->
  <AppDialog v-model="lightboxOpen" size="xl">
    <div class="flex flex-col items-center">
      <img
        v-if="message.images?.[lightboxIndex]"
        :src="message.images[lightboxIndex].url"
        class="max-h-[70vh] rounded-lg object-contain"
        alt=""
      />
      <p v-if="message.images?.[lightboxIndex]?.prompt" class="mt-3 max-w-2xl text-center text-xs text-ink-muted">{{ message.images[lightboxIndex].prompt }}</p>
    </div>
  </AppDialog>
</template>

<style scoped>
.action-btn {
  @apply inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 hover:bg-ink-primary/[0.06] hover:text-ink-primary;
}
.action-btn:disabled {
  @apply cursor-not-allowed opacity-40 hover:bg-transparent;
}

/* 触屏设备上没有 hover 精度，加大可点击面积 */
@media (pointer: coarse) {
  .action-btn {
    @apply h-9 w-9;
  }
}

/* 连续消息仅第一条有入场动画，后续自然出现 */
.message-bubble + .message-bubble {
  animation-delay: 0ms !important;
  animation-duration: 0.01ms !important;
}

.user-avatar svg {
  filter: drop-shadow(0 1px 1px rgb(var(--c-shadow) / 0.1));
}
</style>
