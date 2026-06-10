<script setup lang="ts">
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  backTo?: string
  showBack?: boolean
  // 顶层页面桌面端有常驻侧栏，返回按钮只在移动端显示
  mobileOnlyBack?: boolean
  sticky?: boolean
}>(), {
  showBack: true,
  mobileOnlyBack: false,
  sticky: true,
})

const emit = defineEmits<{
  back: []
}>()

const router = useRouter()

function goBack() {
  emit('back')
  if (props.backTo) {
    router.push(props.backTo)
  } else if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/browse')
  }
}
</script>

<template>
  <header
    :class="[
      'flex items-center gap-3 px-5 py-3 border-b border-border-subtle bg-bg/85 backdrop-blur z-20',
      sticky ? 'sticky top-0' : '',
    ]"
  >
    <button
      v-if="showBack"
      :class="[
        'inline-flex items-center gap-1.5 text-ink-secondary hover:text-ink-primary px-2 py-1.5 -ml-2 rounded-lg transition-colors hover:bg-ink-primary/5',
        mobileOnlyBack ? 'md:hidden' : '',
      ]"
      aria-label="返回"
      @click="goBack"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      <span class="text-sm">返回</span>
    </button>
    <div class="flex-1 min-w-0">
      <h1 class="text-base font-semibold text-ink-primary truncate">{{ title }}</h1>
      <p v-if="subtitle" class="text-xs text-ink-muted truncate">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="flex items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
