<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ReplyDraftOption } from '@/lib/replyDraft'

const props = defineProps<{
  modelValue?: string
  disabled?: boolean
  isStreaming?: boolean
  busyLabel?: string
  draftLoading?: boolean
  draftDisabled?: boolean
  draftOptions?: ReplyDraftOption[]
  draftError?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: [text: string]
  stop: []
  requestDrafts: [hint: string]
  clearDrafts: []
  selectDraft: [option: ReplyDraftOption]
}>()

const text = ref(props.modelValue || '')
const textarea = ref<HTMLTextAreaElement>()
const draftPanelOpen = computed(() =>
  props.draftLoading || !!props.draftError || !!props.draftOptions?.length,
)

watch(() => props.modelValue, (value) => {
  const next = value || ''
  if (next === text.value) return
  text.value = next
  resizeSoon()
})

function handleSend() {
  const trimmed = text.value.trim()
  if (!trimmed || props.disabled) return
  if (props.isStreaming) {
    emit('stop')
    return
  }
  emit('send', trimmed)
  setText('')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function resizeSoon() {
  nextTick(() => autoGrow())
}

function setText(value: string) {
  text.value = value
  emit('update:modelValue', value)
  resizeSoon()
}

function autoGrow() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 220) + 'px'
}

function handleInput() {
  emit('update:modelValue', text.value)
  autoGrow()
}

function requestDrafts() {
  if (props.draftDisabled || props.draftLoading || props.isStreaming) return
  emit('requestDrafts', text.value.trim())
}

function selectDraft(option: ReplyDraftOption) {
  setText(option.message)
  emit('selectDraft', option)
  emit('clearDrafts')
}
</script>

<template>
  <div class="border-t border-border-subtle bg-bg/85 px-3 pb-3 pt-2.5 backdrop-blur">
    <div class="mx-auto max-w-3xl">
      <div
        v-if="draftPanelOpen"
        class="fixed inset-x-3 bottom-20 z-40 mx-auto max-h-[48vh] max-w-3xl overflow-hidden rounded-xl border border-brand-500/30 bg-surface-elevated shadow-2xl ring-1 ring-brand-500/15"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-ink-primary">AI 拟回复</p>
            <p class="text-[11px] text-ink-muted">选一个方向填入输入框，再按你的感觉改。</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              class="rounded-lg px-2.5 py-1.5 text-xs text-brand-300 ring-1 ring-brand-500/25 transition-colors hover:bg-brand-500/10 disabled:opacity-40"
              :disabled="draftDisabled || draftLoading"
              @click="requestDrafts"
            >
              {{ draftLoading ? '生成中…' : '换一批' }}
            </button>
            <button
              class="rounded-lg px-2.5 py-1.5 text-xs text-ink-muted transition-colors hover:bg-white/5 hover:text-ink-primary"
              @click="$emit('clearDrafts')"
            >
              收起
            </button>
          </div>
        </div>

        <div v-if="draftLoading" class="px-3 py-4 text-center text-sm text-ink-muted">
          正在拆出 5 个剧情方向…
        </div>

        <div v-else-if="draftError" class="m-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/20">
          {{ draftError }}
        </div>

        <div v-else class="grid max-h-[34vh] gap-2 overflow-y-auto p-2">
          <button
            v-for="option in draftOptions"
            :key="option.id"
            class="group rounded-lg border border-border-subtle bg-surface/40 px-3 py-2.5 text-left transition-colors hover:border-brand-500/40 hover:bg-brand-500/10"
            @click="selectDraft(option)"
          >
            <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span class="text-sm font-semibold text-ink-primary">{{ option.title }}</span>
              <span v-if="option.direction" class="text-[11px] text-brand-300">{{ option.direction }}</span>
            </div>
            <p class="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-secondary group-hover:text-ink-primary">
              {{ option.message }}
            </p>
          </button>
        </div>
      </div>

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
          @input="handleInput"
        />
        <button
          v-if="!isStreaming"
          :disabled="draftDisabled || draftLoading"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-500/25 bg-brand-500/10 text-brand-300 transition-colors hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-30"
          :title="draftLoading ? 'AI 正在拟回复' : 'AI 拟回复'"
          @click="requestDrafts"
        >
          <svg v-if="draftLoading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
            <path class="opacity-90" fill="currentColor" d="M21 12a9 9 0 0 0-9-9v3a6 6 0 0 1 6 6h3Z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 3.75 8.5 7.5 4.75 8.75 8.5 10l1.25 3.75L11 10l3.75-1.25L11 7.5 9.75 3.75Z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 12.5 16.1 15 13.5 16l2.6.9L17 19.5l.9-2.6 2.6-.9-2.6-1L17 12.5Z" />
          </svg>
        </button>
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
        <template v-if="busyLabel">{{ busyLabel }}</template>
        <template v-else-if="isStreaming">生成中 · 按 Esc 或点按钮停止</template>
        <template v-else>Enter 发送 · Shift+Enter 换行</template>
      </p>
    </div>
  </div>
</template>
