<script setup lang="ts">
defineProps<{
  modelValue: boolean
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="$emit('update:modelValue', false)"
      >
        <div class="absolute inset-0 bg-black/65 backdrop-blur-sm" />
        <div
          :class="[
            'relative w-full rounded-xl bg-surface-elevated border border-border shadow-elevated',
            size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-md',
          ]"
        >
          <div
            v-if="title || $slots.title"
            class="flex items-center justify-between px-5 py-4 border-b border-border-subtle"
          >
            <h3 class="text-base font-semibold text-ink-primary">
              <slot name="title">{{ title }}</slot>
            </h3>
            <button
              class="text-ink-muted hover:text-ink-primary transition-colors p-1 -m-1 rounded"
              @click="$emit('update:modelValue', false)"
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
.dialog-enter-active .relative,
.dialog-leave-active .relative {
  transition: transform 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
.dialog-enter-from .relative,
.dialog-leave-to .relative {
  transform: scale(0.96);
}
</style>
