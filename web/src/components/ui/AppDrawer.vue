<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'

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
let previousFocus: HTMLElement | null = null

// 同页可能同时开多个抽屉（聊天页有三个）：滚动锁用引用计数，关掉一个不能解锁另一个。
let holdsScrollLock = false
function acquireScrollLock() {
  if (holdsScrollLock || typeof document === 'undefined') return
  holdsScrollLock = true
  const count = Number(document.body.dataset.drawerLocks || '0') + 1
  document.body.dataset.drawerLocks = String(count)
  document.body.style.overflow = 'hidden'
}
function releaseScrollLock() {
  if (!holdsScrollLock || typeof document === 'undefined') return
  holdsScrollLock = false
  const count = Math.max(0, Number(document.body.dataset.drawerLocks || '0') - 1)
  if (count) document.body.dataset.drawerLocks = String(count)
  else {
    delete document.body.dataset.drawerLocks
    document.body.style.overflow = ''
  }
}

function close() {
  emit('update:modelValue', false)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}

function focusableElements(): HTMLElement[] {
  if (!panel.value) return []
  return [...panel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'))
}

// 与 AppDialog 相同的焦点圈定：Tab 不允许穿透到抽屉后面的页面
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

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      acquireScrollLock()
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      const firstFocusable = focusableElements()[0]
      if (firstFocusable) firstFocusable.focus()
      else panel.value?.focus()
    } else {
      releaseScrollLock()
      previousFocus?.focus()
      previousFocus = null
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  releaseScrollLock()
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
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
        @keydown="onKeydown"
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
            class="text-ink-muted hover:text-ink-primary p-1 -m-1 rounded transition-colors"
            aria-label="关闭"
            @click="close"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div :class="['flex-1 overflow-y-auto', padded ? 'p-5' : '']">
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
