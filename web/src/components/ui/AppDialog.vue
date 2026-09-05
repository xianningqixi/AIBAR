<script setup lang="ts">
import { ref, useId } from 'vue'
import { useModal } from '@/composables/useModal'

const props = defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panel = ref<HTMLElement>()
const titleId = useId()
function close() {
  emit('update:modelValue', false)
}
useModal(() => props.modelValue, panel, close)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="close"
      >
        <div class="pointer-events-none absolute inset-0 bg-black/55 backdrop-blur-sm" />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
          :class="[
            'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-2xl bg-surface-elevated/95 backdrop-blur-xl border border-border shadow-elevated',
            size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-md',
          ]"
        >
          <div
            v-if="title || $slots.title"
            class="flex shrink-0 items-center justify-between px-5 py-4 border-b border-border-subtle"
          >
            <h3 :id="titleId" class="text-base font-semibold text-ink-primary">
              <slot name="title">{{ title }}</slot>
            </h3>
            <button
              class="text-ink-muted hover:text-ink-primary transition-colors p-2 -m-2 rounded"
              aria-label="关闭对话框"
              @click="close"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="shrink-0 flex-wrap px-5 py-3 border-t border-border-subtle flex justify-end gap-2">
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
