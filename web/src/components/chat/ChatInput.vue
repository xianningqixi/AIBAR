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
  <div class="border-t border-border-subtle bg-bg/85 backdrop-blur p-3">
    <div class="flex items-end gap-2 max-w-3xl mx-auto">
      <div class="flex-1 relative">
        <textarea
          ref="textarea"
          v-model="text"
          :disabled="disabled"
          rows="1"
          class="w-full rounded-xl bg-surface-elevated border border-border px-4 py-3 text-sm text-ink-primary placeholder-ink-muted focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 resize-none overflow-y-auto leading-snug transition-colors"
          placeholder="给角色发条消息…  Shift+Enter 换行"
          @keydown="onKeydown"
          @input="autoGrow"
        />
      </div>
      <button
        v-if="isStreaming"
        class="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl bg-red-500/15 text-red-300 hover:bg-red-500/25 border border-red-500/30 transition-colors"
        @click="handleSend"
        title="停止生成"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      </button>
      <button
        v-else
        :disabled="!text.trim() || disabled"
        class="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl bg-brand-gradient text-white hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-glow active:scale-95"
        @click="handleSend"
        title="发送"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-6 6m6-6l6 6" />
        </svg>
      </button>
    </div>
  </div>
</template>
