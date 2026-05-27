<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
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
}>()

const { render } = useMarkdown()

const lastAssistantIndex = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    if (props.messages[i].role === 'assistant') return i
  }
  return -1
})

defineEmits<{
  edit: [index: number, content: string]
  delete: [index: number]
  regenerate: []
  continue: []
  swipe: [index: number, direction: -1 | 1]
}>()

const container = ref<HTMLElement>()

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

watch(
  () => props.streaming,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

watch(
  () => props.isStreaming,
  async () => {
    await nextTick()
    scrollToBottom()
  },
)

function scrollToBottom() {
  if (container.value) {
    container.value.scrollTop = container.value.scrollHeight
  }
}
</script>

<template>
  <div ref="container" class="flex-1 overflow-y-auto py-3">
    <template v-if="loading">
      <div class="flex justify-center py-10">
        <AppSpinner size="lg" />
      </div>
    </template>

    <template v-else-if="messages.length === 0 && !isStreaming">
      <AppEmpty
        icon="chat"
        title="开始一段对话"
        description="说点什么吧 — Shift+Enter 可以换行。"
      />
    </template>

    <template v-else>
      <div class="max-w-4xl mx-auto">
        <MessageBubble
          v-for="(msg, idx) in messages"
          :key="idx"
          :message="msg"
          :index="idx"
          :show-actions="true"
          :is-last-assistant="idx === lastAssistantIndex"
          @edit="(msgIdx: number, content: string) => $emit('edit', msgIdx, content)"
          @delete="$emit('delete', idx)"
          @regenerate="$emit('regenerate')"
          @continue="$emit('continue')"
          @swipe="(msgIdx: number, dir: -1 | 1) => $emit('swipe', msgIdx, dir)"
        />

        <div
          v-if="isStreaming"
          class="flex gap-3 px-4 py-2.5 justify-start"
        >
          <div class="max-w-[78%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-surface-elevated border border-border-subtle text-ink-primary shadow-sm">
            <div
              v-if="streaming"
              class="prose prose-invert prose-sm max-w-none break-words"
              v-html="render(streaming)"
            />
            <span v-else class="inline-flex gap-1 items-center py-1">
              <span class="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
              <span class="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style="animation-delay: 0.15s" />
              <span class="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style="animation-delay: 0.3s" />
            </span>
            <span v-if="streaming" class="inline-block w-1 h-3.5 bg-brand-400 animate-pulse ml-0.5 align-middle" />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
