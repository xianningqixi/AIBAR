<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()

function typeClasses(type: string) {
  switch (type) {
    case 'success':
      return 'border-l-emerald-500'
    case 'error':
      return 'border-l-red-500'
    case 'warning':
      return 'border-l-amber-500'
    default:
      return 'border-l-brand-500'
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'success':
      return 'text-emerald-600'
    case 'error':
      return 'text-red-500'
    case 'warning':
      return 'text-amber-600'
    default:
      return 'text-brand-400'
  }
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
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
