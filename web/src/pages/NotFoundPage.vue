<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="flex flex-col items-center justify-center h-screen text-center px-4 bg-bg">
    <h1 class="text-7xl font-bold text-ink-muted/30 tracking-tight mb-4">404</h1>
    <p class="text-ink-secondary mb-6">页面未找到</p>
    <AppButton @click="router.push('/browse')">返回首页</AppButton>
  </div>
</template>
