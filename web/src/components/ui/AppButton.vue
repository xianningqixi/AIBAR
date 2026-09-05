<script setup lang="ts">
const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()

const isDisabled = () => props.disabled || props.loading
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="isDisabled()"
    :aria-busy="loading || undefined"
    :class="[
      'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none select-none',
      variant === 'icon'
        ? 'rounded-full text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/5 active:scale-95'
        : 'rounded-xl',
      variant === 'icon'
        ? (size === 'sm' ? 'min-h-9 min-w-9 p-1.5' : size === 'lg' ? 'h-12 w-12 p-2.5' : 'h-10 w-10 p-2')
        : (size === 'sm' ? 'min-h-9 px-3 py-2 text-xs' : size === 'lg' ? 'min-h-12 px-5 py-3 text-sm' : 'min-h-10 px-4 py-2.5 text-sm'),
      variant === 'secondary'
        ? 'bg-surface border border-border text-ink-primary hover:bg-surface-elevated hover:border-border-strong active:bg-surface-sunken'
        : variant === 'ghost'
          ? 'text-ink-secondary hover:text-ink-primary hover:bg-ink-primary/5 active:bg-ink-primary/10'
          : variant === 'danger'
            ? 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/15 hover:border-danger/40 active:bg-danger/20'
            : variant === 'icon'
              ? ''
              : variant === 'gradient'
                ? 'bg-brand-gradient text-white shadow-glow hover:shadow-glow-lg hover:brightness-110 active:brightness-95 active:scale-[0.98]'
                : 'bg-brand-500 text-white shadow-sm hover:bg-brand-600 hover:shadow-glow active:bg-brand-700 active:scale-[0.98]',
    ]"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
    <slot />
  </button>
</template>
