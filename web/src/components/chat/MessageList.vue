<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import { refThrottled } from '@vueuse/core'
import type { ChatMessage } from '@/api/types'
import MessageBubble from './MessageBubble.vue'
import AppSpinner from '../ui/AppSpinner.vue'
import AppEmpty from '../ui/AppEmpty.vue'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  messages: ChatMessage[]
  loading?: boolean
  streaming?: string
  isStreaming?: boolean
  characterAvatar?: string
  mediaActions?: boolean
}>()

const { render } = useMarkdown()

// 流式 token 高频到达，节流后再做 markdown + sanitize，避免每个 token 都全量渲染
const throttledStreaming = refThrottled(
  computed(() => props.streaming || ''),
  150,
)
const streamingHtml = computed(() => (throttledStreaming.value ? render(throttledStreaming.value) : ''))

const lastAssistantIndex = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'assistant') return i
  }
  return -1
})

const streamingAvatarUrl = computed(() => {
  const avatar = props.characterAvatar
  if (!avatar || avatar === 'none') return ''
  return `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`
})

defineEmits<{
  edit: [index: number, content: string]
  delete: [index: number]
  regenerate: []
  continue: []
  swipe: [index: number, direction: -1 | 1]
  generateImage: [index: number]
}>()

const container = ref<HTMLElement>()
const atBottom = ref(true)

const THRESHOLD = 120

function updateAtBottom() {
  const el = container.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < THRESHOLD
}

function scrollToBottom(smooth = false) {
  const el = container.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  atBottom.value = true
}

// 新消息(发送/收到回复)总是跟随到底部
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

// 流式增量:只有用户本就在底部时才跟随,避免打断向上翻阅
watch(throttledStreaming, async () => {
  if (!atBottom.value) return
  await nextTick()
  scrollToBottom()
})

watch(
  () => props.isStreaming,
  async (val) => {
    if (!val) return
    await nextTick()
    if (atBottom.value) scrollToBottom()
  },
)

onMounted(() => nextTick(() => scrollToBottom()))
</script>

<template>
  <div class="relative flex-1 overflow-hidden">
    <div ref="container" class="h-full overflow-y-auto py-3" @scroll="updateAtBottom">
      <template v-if="loading">
        <div class="flex justify-center py-10">
          <AppSpinner size="lg" />
        </div>
      </template>

      <template v-else-if="messages.length === 0 && !isStreaming">
        <!-- 空态垂直居中：与消息区共用同一列宽 -->
        <div class="flex h-full items-center justify-center">
          <AppEmpty
            icon="chat"
            title="开始一段对话"
            description="说点什么吧 — Shift+Enter 可以换行。"
          />
        </div>
      </template>

      <template v-else>
        <!-- 消息列的左右留白只在这里给一次，气泡自身不再带 px -->
        <div class="mx-auto max-w-4xl px-4">
          <MessageBubble
            v-for="(msg, idx) in messages"
            :key="idx"
            :message="msg"
            :index="idx"
            :show-actions="true"
            :is-last-assistant="idx === lastAssistantIndex"
            :character-avatar="characterAvatar"
            :media-actions="mediaActions"
            :actions-locked="isStreaming"
            @edit="(msgIdx: number, content: string) => $emit('edit', msgIdx, content)"
            @delete="$emit('delete', idx)"
            @regenerate="$emit('regenerate')"
            @continue="$emit('continue')"
            @swipe="(msgIdx: number, dir: -1 | 1) => $emit('swipe', msgIdx, dir)"
            @generate-image="$emit('generateImage', idx)"
          />

          <div v-if="isStreaming" class="flex gap-2.5 py-2 animate-fade-in">
            <div class="mt-0.5 shrink-0">
              <img
                v-if="streamingAvatarUrl"
                :src="streamingAvatarUrl"
                class="h-8 w-8 rounded-full object-cover ring-1 ring-brand-500/40 shadow-sm"
                alt=""
              />
              <div
                v-else
                class="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand-300 ring-1 ring-brand-500/40"
              >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
            </div>
            <div class="max-w-[min(88%,48rem)] rounded-2xl rounded-bl-md border border-border-subtle bg-surface-elevated/90 px-4 py-2.5 text-sm leading-relaxed text-ink-primary shadow-sm backdrop-blur-sm">
              <div
                v-if="streamingHtml"
                class="prose max-w-none break-words"
                v-html="streamingHtml"
              />
              <span v-else class="inline-flex items-center gap-1 py-1">
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" />
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style="animation-delay: 0.15s" />
                <span class="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-400" style="animation-delay: 0.3s" />
              </span>
              <span v-if="streaming" class="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-brand-400 align-middle" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 回到底部 -->
    <Transition name="fab">
      <button
        v-if="!atBottom"
        class="absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-surface-elevated/90 text-ink-secondary shadow-elevated ring-1 ring-border backdrop-blur transition-colors hover:text-ink-primary hover:ring-brand-500/50"
        title="回到底部"
        @click="scrollToBottom(true)"
      >
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.fab-enter-active,
.fab-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
