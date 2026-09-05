<script setup lang="ts">
import { ref } from 'vue'
import { useModal } from '@/composables/useModal'

const props = withDefaults(defineProps<{
  modelValue: boolean
  side?: 'left' | 'right'
  width?: string
  title?: string
  // 默认 false：现有调用方自己在内容里写了 p-4，开启会双重内边距
  padded?: boolean
}>(), {
  padded: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const panel = ref<HTMLElement>()
function close() {
  emit('update:modelValue', false)
}
useModal(() => props.modelValue, panel, close)
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-40 bg-black/55 backdrop-blur-sm"
        @click="close"
      />
    </Transition>
    <Transition :name="(side || 'right') === 'left' ? 'drawer-left' : 'drawer-right'">
      <aside
        v-if="modelValue"
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        :class="[
          'fixed inset-y-0 z-50 flex flex-col overflow-hidden border-border bg-surface-elevated/95 shadow-elevated backdrop-blur-xl',
          (side || 'right') === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        ]"
        :style="{ width: width || '24rem', maxWidth: '92vw' }"
      >
        <header
          v-if="title || $slots.header"
          class="flex items-center justify-between px-5 py-4 border-b border-border-subtle shrink-0"
        >
          <h3 class="text-sm font-semibold text-ink-primary">
            <slot name="header">{{ title }}</slot>
          </h3>
          <button
            class="icon-button -mr-2"
            aria-label="关闭"
            @click="close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div :class="['flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]', padded ? 'p-5' : '']">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="px-5 py-3 border-t border-border-subtle shrink-0">
          <slot name="footer" />
        </footer>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}
.drawer-right-enter-active,
.drawer-right-leave-active,
.drawer-left-enter-active,
.drawer-left-leave-active {
  transition: transform 0.25s ease;
}
.drawer-right-enter-from,
.drawer-right-leave-to {
  transform: translateX(100%);
}
.drawer-left-enter-from,
.drawer-left-leave-to {
  transform: translateX(-100%);
}
</style>
