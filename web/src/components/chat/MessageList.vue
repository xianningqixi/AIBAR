<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted } from 'vue'
import type { ChatMessage } from '@/api/types'
import MessageBubble from './MessageBubble.vue'
import AppSpinner from '../ui/AppSpinner.vue'
import { useMarkdown } from '@/composables/useMarkdown'

// streaming prop 由页面层节流后传入（150ms），这里不再看到逐 token 的更新
const props = defineProps<{
  messages: ChatMessage[]
  loading?: boolean
  streaming?: string
  isStreaming?: boolean
  characterAvatar?: string
  characterName?: string
  characterGreeting?: string
  mediaActions?: boolean
}>()

const { render } = useMarkdown()

const throttledStreaming = computed(() => props.streaming || '')
const streamingHtml = computed(() => (throttledStreaming.value ? render(throttledStreaming.value) : ''))

// 稳定 key：按时间戳+角色，同值冲突时按出现序号消歧。
// 用下标做 key 会让删除/重新生成后所有后续气泡重渲染整段 markdown。
const messageKeys = computed(() => {
  const seen = new Map<string, number>()
  return props.messages.map((m, i) => {
    const base = m.date ? `${m.role}@${m.date}` : `i${i}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count ? `${base}#${count}` : base
  })
})

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
    <div ref="container" class="h-full overflow-y-auto px-4 py-4 md:py-6" @scroll="updateAtBottom">
      <template v-if="loading">
        <div class="flex justify-center py-10">
          <AppSpinner size="lg" />
        </div>
      </template>

      <template v-else-if="messages.length === 0 && !isStreaming">
        <!-- 空态：展示角色头像与开场白，降低冷漠感 -->
        <div class="flex h-full items-center justify-center">
          <div class="flex max-w-md flex-col items-center px-4 text-center">
            <img
              v-if="characterAvatar && characterAvatar !== 'none'"
              :src="`/thumbnail?type=avatar&file=${encodeURIComponent(characterAvatar)}`"
              class="h-20 w-20 rounded-full object-cover ring-4 ring-surface shadow-elevated"
              alt=""
            />
            <div
              v-else
              class="flex h-20 w-20 items-center justify-center rounded-full bg-brand-soft text-brand-300 ring-4 ring-surface shadow-elevated"
            >
              <svg class="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 class="mt-4 text-base font-semibold text-ink-primary">{{ characterName ? `和 ${characterName} 打个招呼` : '开始一段对话' }}</h3>
            <p v-if="characterGreeting" class="mt-2 text-sm leading-relaxed text-ink-secondary">{{ characterGreeting }}</p>
            <div class="mt-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs text-ink-muted ring-1 ring-border-subtle">
              <span class="text-brand-300">↵</span> Enter 发送
              <span class="mx-1 text-border">·</span>
              <span class="text-brand-300">⇧↵</span> Shift+Enter 换行
            </div>
          </div>
        </div>
      </template>

      <template v-else>
        <!-- 消息列的左右留白只在这里给一次，气泡自身不再带 px -->
        <div class="mx-auto max-w-4xl px-0 xl:max-w-5xl 2xl:max-w-6xl">
          <!-- 事件处理器不引用循环变量（气泡自带 index），编译器才能缓存它们，
               避免流式期间每个 tick 强制 patch 所有气泡 -->
          <div
            v-for="(msg, idx) in messages"
            :key="messageKeys[idx]"
            class="first:pt-2 last:pb-2"
          >
            <MessageBubble
              :message="msg"
              :index="idx"
              :is-continuation="idx > 0 && messages[idx - 1].role === msg.role"
              :show-actions="true"
              :is-last-assistant="idx === lastAssistantIndex"
              :character-avatar="characterAvatar"
              :character-name="characterName"
              :media-actions="mediaActions"
              :actions-locked="isStreaming"
              :animate="idx === messages.length - 1"
              @edit="(msgIdx: number, content: string) => $emit('edit', msgIdx, content)"
              @delete="(msgIdx: number) => $emit('delete', msgIdx)"
              @regenerate="$emit('regenerate')"
              @continue="$emit('continue')"
              @swipe="(msgIdx: number, dir: -1 | 1) => $emit('swipe', msgIdx, dir)"
              @generate-image="(msgIdx: number) => $emit('generateImage', msgIdx)"
            />
          </div>

          <div
            v-if="isStreaming"
            class="animate-fade-in flex gap-2.5 py-2"
          >
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
            <div
              class="relative max-w-[min(82%,44rem)] rounded-2xl rounded-bl-md border border-brand-500/30 bg-surface-elevated/90 px-4 py-2.5 text-sm leading-relaxed text-ink-primary shadow-sm backdrop-blur-sm"
            >
              <div class="absolute -left-px top-3 h-6 w-1 rounded-full bg-brand-gradient" />
              <div
                v-if="streamingHtml"
                class="prose max-w-none break-words"
                v-html="streamingHtml"
              />
              <span v-else class="inline-flex items-center gap-1.5 py-1">
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" style="animation-delay: 0.2s" />
                <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" style="animation-delay: 0.4s" />
              </span>
              <span v-if="throttledStreaming" class="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-brand-400 align-middle" />
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 回到底部：右下角，避开输入框 -->
    <Transition name="fab">
      <button
        v-if="!atBottom"
        class="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated/90 text-ink-secondary shadow-elevated ring-1 ring-border backdrop-blur transition-colors hover:text-ink-primary hover:ring-brand-500/50"
        title="回到底部"
        aria-label="回到底部"
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
  transform: translateY(8px);
}
</style>
