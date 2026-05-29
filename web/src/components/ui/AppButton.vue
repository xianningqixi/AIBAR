<script setup lang="ts">
defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'gradient'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:opacity-40 disabled:cursor-not-allowed select-none',
      variant === 'icon'
        ? 'rounded-full p-1.5 text-ink-secondary hover:text-ink-primary hover:bg-white/5'
        : 'rounded-lg',
      variant !== 'icon' && (size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-4 py-2 text-sm'),
      variant === 'secondary'
        ? 'bg-surface border border-border text-ink-primary hover:bg-surface-elevated hover:border-border-strong active:bg-surface-sunken'
        : variant === 'ghost'
          ? 'text-ink-secondary hover:text-ink-primary hover:bg-white/5 active:bg-white/10'
          : variant === 'danger'
            ? 'bg-red-500/10 text-red-300 border border-red-500/25 hover:bg-red-500/15 hover:border-red-500/40 active:bg-red-500/20'
            : variant === 'icon'
              ? ''
              : variant === 'gradient'
                ? 'bg-brand-gradient text-white shadow-glow hover:brightness-110 active:brightness-95'
                : 'bg-brand-500 text-white shadow-sm hover:bg-brand-600 hover:shadow-glow active:bg-brand-700',
    ]"
  >
    <slot />
  </button>
</template>
