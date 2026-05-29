<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
  isStreaming?: boolean
}>()

const emit = defineEmits<{
  send: [text: string]
  stop: []
}>()

const text = ref('')
const textarea = ref<HTMLTextAreaElement>()

function handleSend() {
  const trimmed = text.value.trim()
  if (!trimmed || props.disabled) return
  if (props.isStreaming) {
    emit('stop')
    return
  }
  emit('send', trimmed)
  text.value = ''
  if (textarea.value) {
    textarea.value.style.height = 'auto'
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function autoGrow() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 220) + 'px'
}
</script>

<template>
  <div class="border-t border-border-subtle bg-bg/85 px-3 pb-3 pt-2.5 backdrop-blur">
    <div class="mx-auto max-w-3xl">
      <div
        class="flex items-end gap-2 rounded-2xl border border-border bg-surface-elevated/80 p-1.5 shadow-sm transition-all focus-within:border-brand-500/60 focus-within:shadow-glow"
      >
        <textarea
          ref="textarea"
          v-model="text"
          :disabled="disabled"
          rows="1"
          class="min-h-[2.75rem] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2.5 text-sm leading-snug text-ink-primary placeholder-ink-muted focus:outline-none"
          placeholder="给角色发条消息…"
          @keydown="onKeydown"
          @input="autoGrow"
        />
        <button
          v-if="isStreaming"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/15 text-red-300 transition-colors hover:bg-red-500/25"
          @click="handleSend"
          title="停止生成 (Esc)"
        >
          <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        </button>
        <button
          v-else
          :disabled="!text.trim() || disabled"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition-all hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed"
          @click="handleSend"
          title="发送 (Enter)"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-6 6m6-6l6 6" />
          </svg>
        </button>
      </div>
      <p class="mt-1.5 px-1 text-center text-[10px] text-ink-muted/60">
        <template v-if="isStreaming">生成中 · 按 Esc 或点按钮停止</template>
        <template v-else>Enter 发送 · Shift+Enter 换行</template>
      </p>
    </div>
  </div>
</template>
