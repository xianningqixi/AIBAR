<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  backTo?: string
  showBack?: boolean
  // 顶层页面桌面端有常驻侧栏，返回按钮只在移动端显示
  mobileOnlyBack?: boolean
  sticky?: boolean
  // 与页面正文的 mx-auto max-w-* 容器保持一致，避免标题与内容错位
  width?: '6xl' | '4xl'
}>(), {
  showBack: true,
  mobileOnlyBack: false,
  sticky: true,
  width: '6xl',
})

const emit = defineEmits<{
  back: []
}>()

const router = useRouter()

const maxWidthClass = computed(() => (props.width === '4xl' ? 'max-w-4xl' : 'max-w-6xl'))

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
      'border-b border-border-subtle bg-bg/85 backdrop-blur z-20',
      sticky ? 'sticky top-0' : '',
    ]"
  >
    <div class="px-5 md:px-8 lg:px-10">
      <!-- 固定 h-16：所有页面标题栏等高，且与正文容器同宽同边距 -->
      <div :class="['mx-auto flex h-16 items-center gap-3', maxWidthClass]">
        <button
          v-if="showBack"
          :class="[
            'inline-flex shrink-0 items-center gap-1.5 text-ink-secondary hover:text-ink-primary px-2 py-1.5 -ml-2 rounded-lg transition-colors hover:bg-ink-primary/5',
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
          <h1 class="text-base font-semibold text-ink-primary truncate leading-tight">{{ title }}</h1>
          <!-- 副标题只占一行，标题栏高度恒定 -->
          <p v-if="subtitle" class="text-xs text-ink-muted truncate leading-tight">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>
