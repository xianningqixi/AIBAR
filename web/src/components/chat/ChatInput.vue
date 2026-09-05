<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
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
  characterName?: string
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
const composing = ref(false)
const draftPanelOpen = computed(() =>
  props.draftLoading || !!props.draftError || !!props.draftOptions?.length,
)
const placeholder = computed(() =>
  props.characterName ? `给 ${props.characterName} 发条消息…` : '给角色发条消息…',
)

watch(() => props.modelValue, (value) => {
  const next = value || ''
  if (next === text.value) return
  text.value = next
  resizeSoon()
})

function handleSend() {
  const trimmed = text.value.trim()
  if (!trimmed || props.disabled || props.isStreaming || composing.value) return
  emit('send', trimmed)
  setText('')
}

function onKeydown(e: KeyboardEvent) {
  // 中文候选词确认不能触发发送；229 兼容 Safari 的 compositionend 时序。
  if (e.isComposing || composing.value || e.keyCode === 229) return
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
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

onMounted(resizeSoon)
</script>

<template>
  <!-- 输入区停靠栏：加深背景、上边框，与页面内容形成明确分界 -->
  <div class="bg-bg/95 px-4 pb-[calc(.875rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-6 md:pb-[calc(1rem+env(safe-area-inset-bottom))] md:pt-4">
    <div class="relative mx-auto max-w-4xl">
      <!-- AI 拟回复面板锚定在输入区上方，输入框长高时不会被遮住 -->
      <div
        v-if="draftPanelOpen"
        class="absolute inset-x-0 bottom-full z-30 mb-3 max-h-[40dvh] overflow-hidden rounded-xl border border-brand-500/30 bg-surface-elevated shadow-2xl ring-1 ring-brand-500/15 md:max-h-[48dvh]"
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
              aria-label="换一批拟回复"
              @click="requestDrafts"
            >
              {{ draftLoading ? '生成中…' : '换一批' }}
            </button>
            <button
              class="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-ink-primary/5 hover:text-ink-primary"
              aria-label="收起拟回复"
              @click="$emit('clearDrafts')"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="draftLoading" class="px-3 py-4 text-center text-sm text-ink-muted">
          正在拆出 5 个剧情方向…
        </div>

        <div v-else-if="draftError" class="m-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger ring-1 ring-danger/20">
          {{ draftError }}
        </div>

        <div v-else class="grid max-h-[34vh] gap-2 overflow-y-auto p-2 md:max-h-[28vh]">
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
        class="flex items-end gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-elevated transition-[border-color,box-shadow] focus-within:border-brand-500/60 focus-within:ring-2 focus-within:ring-brand-500/10"
      >
        <textarea
          ref="textarea"
          v-model="text"
          :disabled="disabled"
          rows="1"
          class="min-h-[2.75rem] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-base leading-relaxed text-ink-primary placeholder-ink-muted focus:outline-none"
          :placeholder="placeholder"
          aria-label="消息内容"
          @compositionstart="composing = true"
          @compositionend="composing = false"
          @keydown="onKeydown"
          @input="handleInput"
        />
        <button
          v-if="!isStreaming"
          :disabled="draftDisabled || draftLoading"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition-colors hover:bg-brand-500/10 hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          :title="draftLoading ? 'AI 正在拟回复' : 'AI 拟回复'"
          :aria-label="draftLoading ? 'AI 正在拟回复' : 'AI 拟回复'"
          @click="requestDrafts"
        >
          <svg v-if="draftLoading" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" />
            <path class="opacity-90" fill="currentColor" d="M21 12a9 9 0 0 0-9-9v3a6 6 0 0 1 6 6h3Z" />
          </svg>
          <svg v-else class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
        <button
          v-if="isStreaming"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger transition-colors hover:bg-danger/20 hover:text-danger-strong"
          title="停止生成 (Esc)"
          aria-label="停止生成"
          @click="emit('stop')"
        >
          <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="1.5" />
          </svg>
        </button>
        <button
          v-else
          :disabled="!text.trim() || disabled"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-glow transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:shadow-none"
          title="发送 (Enter)"
          aria-label="发送"
          @click="handleSend"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19V5m0 0l-6 6m6-6l6 6" />
          </svg>
        </button>
      </div>
      <p
        class="mt-2 min-h-4 px-1 text-center text-[11px] text-ink-muted transition-opacity duration-150"
      >
        <template v-if="busyLabel">{{ busyLabel }}</template>
        <template v-else-if="isStreaming">生成中 · 按 Esc 或点按钮停止</template>
        <template v-else><span class="hidden sm:inline">Enter 发送 · Shift+Enter 换行</span><span class="sm:hidden">写下回复，继续你们的故事</span></template>
      </p>
    </div>
  </div>
</template>
