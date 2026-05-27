<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ChatMessage } from '@/api/types'
import { useMarkdown } from '@/composables/useMarkdown'

const props = defineProps<{
  message: ChatMessage
  index: number
  showActions?: boolean
  isLastAssistant?: boolean
}>()

defineEmits<{
  edit: [index: number, content: string]
  delete: [index: number]
  regenerate: []
  continue: []
  swipe: [index: number, direction: -1 | 1]
}>()

const { render } = useMarkdown()
const editing = ref(false)
const editContent = ref(props.message.content)
const thinkingOpen = ref(false)

const isUser = computed(() => props.message.role === 'user')
const hasReasoning = computed(() => !isUser.value && Boolean(props.message.reasoning))

function startEditing() {
  editContent.value = props.message.content
  editing.value = true
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text)
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

      <div
        v-if="showActions && !editing"
        class="flex items-center gap-0.5 mt-2 pt-1.5 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity"
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
