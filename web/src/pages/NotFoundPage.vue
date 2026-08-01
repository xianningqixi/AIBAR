<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="relative flex flex-col items-center justify-center h-[100dvh] text-center px-4 bg-bg bg-hero-radial overflow-hidden">
    <h1 class="bg-brand-gradient bg-clip-text text-transparent text-8xl font-extrabold mb-4 animate-fade-in-up">404</h1>
    <p class="text-ink-secondary mb-6">页面走丢了，回到首页继续探索吧</p>
    <AppButton @click="router.push('/browse')">返回首页</AppButton>
  </div>
</template>
