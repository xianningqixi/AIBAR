<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panel = ref<HTMLElement>()
const titleId = `app-dialog-${Math.random().toString(36).slice(2)}`
let previousFocus: HTMLElement | null = null

function close() {
  emit('update:modelValue', false)
}

function focusableElements(): HTMLElement[] {
  if (!panel.value) return []
  return [...panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'))
}

// 与 AppDrawer 一致：Esc 在窗口级关闭，焦点不在面板内时同样生效
function onGlobalKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.modelValue) {
    event.preventDefault()
    close()
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (!focusable.length) {
    event.preventDefault()
    panel.value?.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(() => props.modelValue, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    const firstFocusable = focusableElements()[0]
    if (firstFocusable) {
      firstFocusable.focus()
    } else {
      panel.value?.focus()
    }
  } else {
    previousFocus?.focus()
    previousFocus = null
  }
})

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="close"
        @keydown="onKeydown"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
          :class="[
            'relative w-full rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-border shadow-elevated',
            size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-md',
          ]"
        >
          <div
            v-if="title || $slots.title"
            class="flex items-center justify-between px-5 py-4 border-b border-border-subtle"
          >
            <h3 :id="titleId" class="text-base font-semibold text-ink-primary">
              <slot name="title">{{ title }}</slot>
            </h3>
            <button
              class="text-ink-muted hover:text-ink-primary transition-colors p-1 -m-1 rounded"
              aria-label="关闭对话框"
              @click="close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="px-5 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="px-5 py-3 border-t border-border-subtle flex justify-end gap-2">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-leave-active .relative {
  transition: transform 0.2s ease;
}
.dialog-enter-active .relative {
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .relative,
.dialog-leave-to .relative {
  transform: scale(0.96) translateY(8px);
}
</style>
