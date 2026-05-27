<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  side?: 'left' | 'right'
  width?: string
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function close() {
  emit('update:modelValue', false)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}

watch(
  () => props.modelValue,
  (open) => {
    if (typeof document !== 'undefined') {
      document.body.style.overflow = open ? 'hidden' : ''
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
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
        :class="[
          'fixed inset-y-0 z-50 bg-surface-elevated border-border-subtle shadow-elevated flex flex-col overflow-hidden',
          (side || 'right') === 'left' ? 'left-0 border-r' : 'right-0 border-l',
        ]"
        :style="{ width: width || '22rem', maxWidth: '92vw' }"
      >
        <header
          v-if="title || $slots.header"
          class="flex items-center justify-between px-4 py-3 border-b border-border-subtle shrink-0"
        >
          <h3 class="text-sm font-semibold text-ink-primary">
            <slot name="header">{{ title }}</slot>
          </h3>
          <button
            class="text-ink-muted hover:text-ink-primary p-1 -m-1 rounded transition-colors"
            @click="close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div class="flex-1 overflow-y-auto">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="px-4 py-3 border-t border-border-subtle shrink-0">
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
