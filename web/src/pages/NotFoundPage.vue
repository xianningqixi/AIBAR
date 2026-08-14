<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="relative flex min-h-[100dvh] flex-col items-center justify-center bg-bg bg-hero-radial px-4 text-center">
    <div class="mb-6 flex animate-fade-in-up items-center gap-3">
      <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-lg font-bold text-white shadow-glow">A</span>
      <span class="text-xl font-semibold text-ink-primary">AIBAR</span>
    </div>
    <div class="relative mb-2">
      <div class="absolute -top-10 left-1/2 -translate-x-1/2 text-brand-300/40 animate-bounce">
        <svg class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <h1 class="animate-fade-in-up bg-brand-gradient bg-clip-text text-8xl font-extrabold text-transparent [animation-delay:80ms]">404</h1>
    </div>
    <p class="mb-6 animate-fade-in-up text-ink-secondary [animation-delay:160ms]">页面走丢了，回到首页继续探索吧</p>
    <AppButton class="animate-fade-in-up [animation-delay:240ms]" @click="router.push('/browse')">返回首页</AppButton>
  </div>
</template>
