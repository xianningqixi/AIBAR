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
  // 操作较多时在移动端单独占一行，给标题保留阅读空间
  mobileActionsBelow?: boolean
  sticky?: boolean
  // 标题字号：默认 text-base，详情页传入 text-lg 更突出内容名
  titleClass?: string
  // 与页面正文的 mx-auto max-w-* 容器保持一致，避免标题与内容错位
  width?: '4xl' | '5xl' | '6xl'
}>(), {
  showBack: true,
  mobileOnlyBack: false,
  mobileActionsBelow: false,
  sticky: true,
  titleClass: 'text-lg md:text-xl',
  width: '6xl',
})

const emit = defineEmits<{
  back: []
}>()

const router = useRouter()

const maxWidthClass = computed(() => {
  const map: Record<string, string> = {
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
  }
  return map[props.width]
})

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
      'border-b border-border-subtle bg-bg/90 backdrop-blur-xl z-20',
      sticky ? 'sticky top-0' : '',
    ]"
  >
    <div class="px-5 md:px-8 lg:px-10">
      <!-- 桌面保持 h-16；移动端可将较多的操作按钮放在标题下方 -->
      <div :class="[
        'mx-auto flex items-center gap-3',
        mobileActionsBelow ? 'min-h-16 flex-wrap py-3 md:h-16 md:flex-nowrap md:py-0' : 'h-16',
        maxWidthClass,
      ]">
        <slot name="breadcrumb" />
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
          <!-- 超长时显示完整名称 tooltip -->
          <h1 :title="title" :class="['font-semibold text-ink-primary truncate leading-tight', titleClass]">{{ title }}</h1>
          <!-- 副标题只占一行，标题栏高度恒定 -->
          <p v-if="subtitle" :title="subtitle" class="mt-1 text-xs text-ink-muted truncate leading-tight">{{ subtitle }}</p>
        </div>
        <div v-if="$slots.actions" :class="[
          'flex shrink-0 items-center gap-2',
          mobileActionsBelow ? 'w-full flex-wrap justify-end md:w-auto md:flex-nowrap' : '',
        ]">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </header>
</template>
