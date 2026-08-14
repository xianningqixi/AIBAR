<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

function typeClasses(type: string) {
  switch (type) {
    case 'success':
      return 'border-l-success'
    case 'error':
      return 'border-l-danger'
    case 'warning':
      return 'border-l-warning'
    default:
      return 'border-l-info'
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'success':
      return 'text-success'
    case 'error':
      return 'text-danger'
    case 'warning':
      return 'text-warning'
    default:
      return 'text-info'
  }
}
</script>

<template>
  <!-- toast 是全应用唯一的操作反馈通道，必须对屏幕阅读器可见 -->
  <div
    class="pointer-events-none fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-6 md:z-50"
    aria-live="polite"
    aria-atomic="false"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        :role="toast.type === 'error' ? 'alert' : 'status'"
        :class="[
          'pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-elevated bg-surface-elevated/95 backdrop-blur-md border border-border-subtle border-l-4 cursor-pointer min-w-[240px] max-w-md flex items-start gap-3',
          typeClasses(toast.type),
        ]"
        @click="ui.removeToast(toast.id)"
      >
        <span :class="['mt-0.5 shrink-0', typeIcon(toast.type)]">
          <svg v-if="toast.type === 'success'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <svg v-else-if="toast.type === 'error'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          <svg v-else-if="toast.type === 'warning'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <span class="text-ink-primary leading-snug flex-1">{{ toast.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active {
  transition: all 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px) scale(0.96);
}
.toast-move {
  transition: transform 0.25s ease;
}
</style>
